const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const homeSource = fs.readFileSync(path.join(root, 'scripts/budfinder-home.js'), 'utf8');
const searchSource = fs.readFileSync(path.join(root, 'scripts/budfinder-search.js'), 'utf8');
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Exercise the shipped scripts and their event handlers without a browser or
// installed dependencies. Only the DOM surface used by the homepage is stubbed.
class Element {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.hidden = false;
    this.textContent = 'Loading…';
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.options = [];
    this._html = '';
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  scrollIntoView() {}
  contains(element) { return element === this || this.options.includes(element); }

  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }

  dispatch(name, properties = {}) {
    const event = {
      target: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties
    };
    for (const listener of this.listeners.get(name) || []) listener(event);
    return event;
  }

  set innerHTML(html) {
    this._html = html;
    this.options = [...html.matchAll(/<button\b([^>]*)>/g)].map(match => {
      const attributes = [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)];
      const option = new Element();
      for (const [, name, value] of attributes) {
        option.setAttribute(name, value);
        if (name === 'id') option.id = value;
        if (name === 'data-search-result-index') option.dataset.searchResultIndex = value;
      }
      return option;
    });
  }

  get innerHTML() { return this._html; }
  querySelectorAll(selector) {
    assert.equal(selector, '[data-search-result-index]');
    return this.options;
  }
}

function clock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = end;
    },
    get pending() { return timers.size; }
  };
}

const snapshot = '2026-09-05T12:00:00Z';
function summary(averagePrice) {
  return {
    exported_at_utc: snapshot,
    amsterdam: { mapped_shops: 12, active_shops: 10, active_listings: 100 },
    network: { average_strain_price: averagePrice, active_shops: 20, active_listings: 200 },
    top_strains: [{ name: 'Gelato', shop_count: 3, average_price: averagePrice }],
    rare_strains: [],
    locations: []
  };
}

function harness(options = {}) {
  const { fail = [], hang = [] } = options;
  const averagePrice = Object.hasOwn(options, 'averagePrice') ? options.averagePrice : 10;
  const elements = new Map([...homepage.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, new Element(id)]));
  const get = id => {
    assert.ok(elements.has(id), `Homepage is missing #${id}`);
    return elements.get(id);
  };
  const document = new Element('document');
  document.getElementById = id => elements.get(id) || null;
  document.querySelectorAll = () => [];
  get('home-search-results').hidden = true;
  get('home-search-form').contains = element => [
    get('home-search-form'), get('home-search-input'), get('home-search-submit'),
    get('home-search-results'), ...get('home-search-results').options
  ].includes(element);
  const timers = clock();
  const requests = [];
  const data = {
    'database/home_summary.json': summary(averagePrice),
    'database/manifest.json': { exported_at_utc: snapshot },
    'database/search_index.json': {
      strains: [
        { name: 'Gelato', shop_count: 6 },
        { name: 'Gelato 33', shop_count: 4 },
        { name: 'Gelato 41', shop_count: 2 },
        { name: 'Amnesia Haze', shop_count: 5 }
      ]
    },
    'database/updates.json': []
  };
  const window = {
    location: { href: 'https://budfinder.org/index.html' },
    addEventListener() {},
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  };
  const fetch = (url, options) => {
    requests.push({ url, signal: options.signal });
    if (fail.includes(url)) return Promise.reject(new Error('Network unavailable'));
    if (hang.includes(url)) {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('Request aborted')), { once: true });
      });
    }
    assert.ok(Object.hasOwn(data, url), `Unexpected data request: ${url}`);
    return Promise.resolve({ ok: true, json: async () => data[url] });
  };
  const context = vm.createContext({ window, document, fetch, URL, AbortController, console });
  vm.runInContext(searchSource, context, { filename: 'budfinder-search.js' });
  vm.runInContext(homeSource, context, { filename: 'budfinder-home.js' });
  return { get, window, timers, requests };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const enterQuery = (app, query) => {
  app.get('home-search-input').value = query;
  app.get('home-search-input').dispatch('focus');
};

test('dashboard prices retain integer zeroes and display fractions without inventing missing prices', async () => {
  const cases = [
    [0, '€0/g'], [10, '€10/g'], [20, '€20/g'], [100, '€100/g'],
    [10.5, '€10.5/g'], [10.25, '€10.25/g'], [10.999, '€11/g'], ['20.00', '€20/g'],
    [undefined, 'Unavailable'], [null, 'Unavailable'], ['', 'Unavailable'], ['  ', 'Unavailable'],
    [-1, 'Unavailable'], ['unknown', 'Unavailable'], [NaN, 'Unavailable'], [Infinity, 'Unavailable']
  ];
  for (const [value, expected] of cases) {
    const app = harness({ averagePrice: value });
    await settle();
    assert.equal(app.get('home-average-price').textContent, expected, `Price input ${String(value)}`);
    assert.ok(app.get('home-most-common-list').innerHTML.includes(expected), `Ranking price input ${String(value)}`);
    assert.equal(app.timers.pending, 0, 'Completed requests must release their timeout timers');
  }
});

test('editing a selected suggestion and immediately submitting uses the new query', async () => {
  const app = harness();
  await settle();
  enterQuery(app, 'Gelato');
  const input = app.get('home-search-input');
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(input.getAttribute('aria-activedescendant'), 'home-search-result-0');

  input.value = 'Amnesia Haze';
  input.dispatch('input');
  assert.equal(input.getAttribute('aria-activedescendant'), null);
  assert.equal(app.get('home-search-results').hidden, true);
  app.get('home-search-form').dispatch('submit');
  const target = new URL(app.window.location.href, 'https://budfinder.org/');
  assert.equal(target.pathname, '/map.html');
  assert.equal(target.searchParams.get('search'), 'Amnesia Haze');
  assert.equal(target.searchParams.get('city'), 'Netherlands');
});

test('Escape cancels a pending suggestion render and keeps the dropdown dismissed', async () => {
  const app = harness();
  await settle();
  const input = app.get('home-search-input');
  input.value = 'Gelato';
  input.dispatch('input');
  input.dispatch('keydown', { key: 'Escape' });
  app.timers.advance(100);
  assert.equal(app.get('home-search-results').hidden, true);
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(input.getAttribute('aria-activedescendant'), null);
  assert.equal(app.get('home-search-status').textContent, '');
});

test('ArrowUp starts at the last suggestion, wraps, and Enter opens the active result', async () => {
  const app = harness();
  await settle();
  enterQuery(app, 'Gelato');
  const input = app.get('home-search-input');
  const options = app.get('home-search-results').options;
  assert.ok(options.length >= 3, 'Fixture must provide several real ranked suggestions');
  input.dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(input.getAttribute('aria-activedescendant'), options.at(-1).id);
  assert.equal(options.at(-1).getAttribute('aria-selected'), 'true');
  assert.equal(options.filter(option => option.getAttribute('aria-selected') === 'true').length, 1);
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(input.getAttribute('aria-activedescendant'), options[0].id);
  input.dispatch('keydown', { key: 'Enter' });
  assert.equal(new URL(app.window.location.href, 'https://budfinder.org/').searchParams.get('search'), 'Gelato');
});

test('immediate keyboard selection survives the input debounce interval', async () => {
  const app = harness();
  await settle();
  const input = app.get('home-search-input');
  input.value = 'Gelato';
  input.dispatch('input');
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(input.getAttribute('aria-activedescendant'), 'home-search-result-0');

  app.timers.advance(100);
  const options = app.get('home-search-results').options;
  assert.equal(input.getAttribute('aria-activedescendant'), 'home-search-result-0');
  assert.equal(options[0].getAttribute('aria-selected'), 'true');
  input.dispatch('keydown', { key: 'Enter' });
  assert.equal(new URL(app.window.location.href, 'https://budfinder.org/').searchParams.get('search'), 'Gelato');
});

test('failed data requests replace loading placeholders and leave search usable', async () => {
  const app = harness({ fail: ['database/home_summary.json', 'database/updates.json'] });
  await settle();
  for (const id of [
    'catalog-shop-count', 'catalog-listing-count', 'home-average-price', 'home-most-common',
    'home-rare-count', 'snapshot-date', 'database-snapshot-date'
  ]) assert.equal(app.get(id).textContent, 'Unavailable', id);
  for (const id of ['home-most-common-list', 'home-rare-list', 'random-location-prices', 'home-updates']) {
    assert.match(app.get(id).innerHTML, /unavailable|could not be loaded/i, id);
    assert.doesNotMatch(app.get(id).innerHTML, /Loading/i, id);
  }
  assert.equal(app.get('amsterdam-insights').dataset.ready, 'true');
  enterQuery(app, 'Amnesia Haze');
  app.get('home-search-form').dispatch('submit');
  assert.equal(new URL(app.window.location.href, 'https://budfinder.org/').searchParams.get('search'), 'Amnesia Haze');
});

test('a stalled request is aborted and the dashboard settles instead of loading forever', async () => {
  const app = harness({ hang: ['database/home_summary.json'] });
  await settle();
  assert.notEqual(app.get('amsterdam-insights').dataset.ready, 'true');
  app.timers.advance(12000);
  await settle();
  assert.equal(app.requests.find(request => request.url === 'database/home_summary.json').signal.aborted, true);
  assert.equal(app.get('amsterdam-insights').dataset.ready, 'true');
  assert.equal(app.get('home-average-price').textContent, 'Unavailable');
  assert.equal(app.timers.pending, 0);
});
