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
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.options = [];
    this.cards = [];
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
    this.cards = [...html.matchAll(/<article class="update-card">/g)].map((_, index) => {
      const card = new Element();
      card.getBoundingClientRect = () => this.cardRects?.[index] || { top: index * 212, bottom: index * 212 + 200 };
      return card;
    });
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
    if (selector === '.update-card') return this.cards;
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
    'database/search_index.json': options.searchIndex || {
      strains: [
        { name: 'Gelato', shop_count: 6 },
        { name: 'Gelato 33', shop_count: 4 },
        { name: 'Gelato 41', shop_count: 2 },
        { name: 'Amnesia Haze', shop_count: 5 }
      ]
    },
    'database/updates.json': options.updates || []
  };
  const windowEvents = new Element('window');
  const window = {
    BudfinderExplore: options.noExplore ? undefined : require('../scripts/budfinder-explore.js'),
    location: { href: 'https://budfinder.org/index.html' },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    dispatch: windowEvents.dispatch.bind(windowEvents),
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
  get('home-updates').cardRects = options.cardRects;
  get('home-updates-help').hidden = true;
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.elements = []; observers.push(this); }
    observe(element) { this.elements.push(element); }
    disconnect() { this.elements = []; }
  }
  const context = vm.createContext({ window, document, fetch, URL, URLSearchParams, AbortController, ResizeObserver, console });
  vm.runInContext(searchSource, context, { filename: 'budfinder-search.js' });
  vm.runInContext(homeSource, context, { filename: 'budfinder-home.js' });
  return { get, window, timers, requests, observers, document };
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
    const ranking = app.get('home-most-common-list').innerHTML;
    if (value == null) {
      // No compared price (for example only old menus): show the shop count alone.
      assert.doesNotMatch(ranking, /Unavailable|undefined|null|€/, `Ranking price input ${String(value)}`);
    } else {
      assert.ok(ranking.includes(expected), `Ranking price input ${String(value)}`);
    }
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
  assert.equal(target.pathname, '/database.html');
  assert.equal(target.searchParams.get('search'), 'Amnesia Haze');
  assert.equal(target.searchParams.get('detail'), 'strain');
  assert.equal(target.searchParams.get('strain'), 'Amnesia Haze');
});

test('featured strain links open a specific profile and the all-strains link opens the browser', async () => {
  const app = harness();
  await settle();
  const href = app.get('home-most-common-list').innerHTML.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
  const url = new URL(href, app.window.location.href);
  assert.equal(url.pathname, '/database.html');
  assert.equal(url.searchParams.get('detail'), 'strain');
  assert.equal(url.searchParams.get('strain'), 'Gelato');
  assert.match(homepage, /href="database\.html\?browser=strains">Explore all strains/);
});

test('a whitespace-only search invokes the required-field feedback', async () => {
  const app = harness();
  await settle();
  const input = app.get('home-search-input');
  let validityReported = false;
  input.focus = () => { app.document.activeElement = input; };
  input.reportValidity = () => { validityReported = true; };
  input.value = '   ';
  app.get('home-search-form').dispatch('submit');
  assert.equal(input.value, '');
  assert.equal(app.document.activeElement, input);
  assert.equal(validityReported, true);
  assert.equal(app.window.location.href, 'https://budfinder.org/index.html');
});

test('Escape preserves the typed query and a late search-index response respects dismissal', async () => {
  const app = harness({ hang: ['database/search_index.json'] });
  await settle();
  const input = app.get('home-search-input');
  app.document.activeElement = input;
  enterQuery(app, 'Gelato');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  assert.equal(input.dispatch('keydown', { key: 'Escape' }).defaultPrevented, true);
  app.timers.advance(12000);
  await settle();
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(app.get('home-search-results').hidden, true);
  assert.equal(input.value, 'Gelato');
});

test('an unmatched query announces feedback separately from the listbox, and Tab dismisses it', async () => {
  const app = harness();
  await settle();
  const input = app.get('home-search-input');
  enterQuery(app, 'zzzzqqx');
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(app.get('home-search-results').hidden, true);
  assert.match(app.get('home-search-status').textContent, /No close suggestion/);
  assert.equal(input.dispatch('keydown', { key: 'Tab' }).defaultPrevented, false);
  assert.equal(app.get('home-search-status').textContent, '');
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

test('ArrowUp starts at the last suggestion, wraps, and Enter selects without leaving the form', async () => {
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
  assert.equal(input.value, 'Gelato');
  assert.equal(app.window.location.href, 'https://budfinder.org/index.html');
  app.get('home-search-form').dispatch('submit', { submitter: app.get('home-search-map') });
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
  app.get('home-search-form').dispatch('submit');
  assert.equal(new URL(app.window.location.href, 'https://budfinder.org/').searchParams.get('search'), 'Gelato');
});

test('failed data requests and a missing shared search script leave plain search usable', async () => {
  const app = harness({ noExplore: true, fail: ['database/home_summary.json', 'database/updates.json'] });
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

test('a slow updates feed does not delay the summary or search suggestions', async () => {
  const app = harness({ hang: ['database/updates.json'] });
  await settle();
  assert.equal(app.get('amsterdam-insights').dataset.ready, 'true');
  assert.equal(app.get('home-average-price').textContent, '€10/g');
  enterQuery(app, 'Gelato');
  assert.match(app.get('home-search-results').innerHTML, /Gelato/);
  app.timers.advance(12000);
  await settle();
  assert.match(app.get('home-updates').innerHTML, /could not be loaded/i);
});

test('the search index remains usable while the summary is slow', async () => {
  const app = harness({ hang: ['database/home_summary.json'] });
  await settle();
  enterQuery(app, 'Amnesia Haze');
  assert.match(app.get('home-search-results').innerHTML, /Amnesia Haze/);
  app.timers.advance(12000);
  await settle();
});

const updates = count => Array.from({ length: count }, (_, index) => ({
  title: `Update ${index + 1}`, body: `Full text for update ${index + 1}`,
  category: 'News', published_at_utc: '2026-10-28T12:00:00Z'
}));

test('all published updates remain available while the viewport fits the first three at each layout', async () => {
  const app = harness({ updates: updates(8), cardRects: [
    { top: 100, bottom: 300 }, { top: 100, bottom: 320 }, { top: 100, bottom: 310 }
  ] });
  await settle();
  const panel = app.get('home-updates');
  assert.equal(panel.cards.length, 8, 'Older updates must not be capped at six');
  assert.match(panel.innerHTML, /Full text for update 8/);
  assert.equal(panel.style.maxHeight, '224px', 'Desktop viewport fits the tallest of three cards in a row');
  assert.equal(panel.getAttribute('tabindex'), '0', 'The scroll panel is keyboard reachable');
  assert.equal(panel.getAttribute('aria-describedby'), 'home-updates-help');
  assert.match(app.get('home-updates-help').textContent, /Latest 3 of 8/);
  assert.equal(app.get('home-updates-help').hidden, false);

  panel.cardRects = [{ top: 100, bottom: 250 }, { top: 262, bottom: 450 }, { top: 462, bottom: 650 }];
  app.window.dispatch('resize');
  assert.equal(panel.style.maxHeight, '554px', 'Phone viewport fits three complete stacked cards');
  assert.equal(app.observers[0].elements.length, 3);
  panel.cardRects = [{ top: -200, bottom: -50 }, { top: -38, bottom: 150 }, { top: 162, bottom: 390 }];
  app.observers[0].callback();
  assert.equal(panel.style.maxHeight, '594px', 'Content growth is handled even while the panel is scrolled');
});

test('short or empty update feeds do not create an unnecessary keyboard stop or scroll hint', async () => {
  for (const count of [0, 1, 3]) {
    const app = harness({ updates: updates(count) });
    await settle();
    const panel = app.get('home-updates');
    assert.equal(panel.cards.length, count);
    assert.equal(panel.dataset.scrollable, 'false');
    assert.equal(panel.style.maxHeight, '');
    assert.equal(panel.getAttribute('tabindex'), null);
    assert.equal(panel.getAttribute('aria-describedby'), null);
    assert.equal(app.get('home-updates-help').hidden, true);
    if (!count) assert.match(panel.innerHTML, /No published updates yet/);
  }
});

test('update text stays escaped and only web links are offered', async () => {
  const app = harness({ updates: [
    { title: '<script>bad</script>', body: 'First line\nSecond <line>', link_url: 'javascript:alert(1)' },
    { title: 'Unsafe data', link_url: 'data:text/html,bad' },
    { title: 'Menu', link_url: 'database.html?browser=shops', link_label: 'Browse <menus>' },
    { title: 'External', link_url: 'https://example.com/news', link_label: 'Read more' }
  ] });
  await settle();
  const html = app.get('home-updates').innerHTML;
  assert.doesNotMatch(html, /<script>|javascript:|data:text/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html, /First line\nSecond &lt;line&gt;/);
  assert.match(html, /href="database.html\?browser=shops">Browse &lt;menus&gt;/);
  assert.match(html, /href="https:\/\/example.com\/news" target="_blank" rel="noopener noreferrer"/);
});


test('exact city suggestions lead popular partial strains and submit without changing the place', async () => {
  const app = harness({ searchIndex: {
    cities: [{ name: 'Amsterdam', shop_count: 163 }],
    strains: [{ name: 'Amsterdam Haze', shop_count: 500 }],
    growers: [{ name: 'Amsterdam Exotics', shop_count: 1, strain_count: 1 }]
  } });
  await settle();
  enterQuery(app, 'Amsterdam');
  const options = app.get('home-search-results').innerHTML;
  assert.ok(options.indexOf('<strong>Amsterdam</strong>') < options.indexOf('<strong>Amsterdam Haze</strong>'));
  assert.match(options, />Town<\/span>/);
  assert.match(options, />Grower<\/span>/);
  app.get('home-search-form').dispatch('submit');
  const target = new URL(app.window.location.href, 'https://budfinder.org/');
  assert.equal(target.searchParams.get('search'), 'Amsterdam');
  assert.equal(target.searchParams.get('filter_city'), 'Amsterdam');
  assert.equal(target.searchParams.get('browser'), 'shops');
});


for (const query of ['g13', 'G-13', 'g 13']) {
  test(`homepage ${query} keeps the exact strain and type through the map URL`, async () => {
    const app = harness({searchIndex:{strains:[
      {name:'G13 Haze',shop_count:500}, {name:'G-13',shop_count:14}
    ]}});
    await settle();
    enterQuery(app, query);
    const html = app.get('home-search-results').innerHTML;
    assert.ok(html.indexOf('<strong>G-13</strong>') < html.indexOf('<strong>G13 Haze</strong>'));
    assert.match(html, /Exact match/);
    app.get('home-search-form').dispatch('submit', { submitter: app.get('home-search-map') });
    const url = new URL(app.window.location.href, 'https://budfinder.org/');
    assert.equal(url.pathname, '/map.html');
    assert.equal(url.searchParams.get('search'), 'G-13');
    assert.equal(url.searchParams.get('search_kind'), 'strain');
  });
}
