const test = require('node:test');
const assert = require('node:assert/strict');
const { normaliseData, selectPoints, buildGeometry, chartSvg, mount } = require('../scripts/budfinder-price-history.js');

const point = (date, average_price = 10, extra = {}) => ({ date, average_price, shop_count: 2, strain_count: 3, listing_count: 4, ...extra });
const payload = () => ({ version: 1, currency: '€', unit: 'g', date_basis: 'recorded_observation',
  exported_at_utc: '2026-10-28T12:00:00Z', series: [
    { id: 'netherlands', name: 'Netherlands', points: [point('2026-09-01', 12), point('2026-10-10', 14), point('2026-10-28', 16, { kind: 'current' })] },
    { id: 'amsterdam', name: 'Amsterdam', points: [point('2026-10-28', 20, { kind: 'current' })] }
  ] });

test('history rejects unsupported definitions and never turns missing or invalid prices into zero', () => {
  const data = payload();
  data.series[0].points = [point('2026-10-01', null), point('2026-10-02', 0), point('2026-10-03', -5),
    point('2026-10-04', 10, { shop_count: 0 }), point('2026-10-28', 16), point('2026-10-29', 30), point('2026-02-31', 40)];
  const result = normaliseData(data);
  assert.deepEqual(result.series[0].points.map(row => row.average_price), [null, null, null, null, 16]);
  for (const changed of [{ currency: '$' }, { date_basis: 'uploaded' }, { version: 99 }, { exported_at_utc: 'bad' }]) {
    assert.throws(() => normaliseData({ ...payload(), ...changed }));
  }
});

test('period filters use the export date and retain real dates without manufacturing boundary values', () => {
  const data = normaliseData(payload());
  assert.deepEqual(selectPoints(data.series[0], '30', data.latest).map(row => row.date), ['2026-10-10', '2026-10-28']);
  assert.equal(selectPoints(data.series[0], '90', data.latest).length, 3);
  assert.equal(selectPoints(data.series[0], 'all', data.latest).length, 3);
});

test('the continuous line connects recorded points without manufacturing intermediate prices', () => {
  const rows = [point('2026-10-01'), point('2026-10-02', 12), point('2026-10-03', null),
    point('2026-10-04', 14), point('2026-10-28', 16)];
  const geometry = buildGeometry(rows, 400);
  assert.deepEqual(geometry.segments.map(segment => segment.length), [4]);
  assert.equal(geometry.points.length, 4);
  const svg = chartSvg(geometry, 3, '<unsafe>');
  assert.equal((svg.match(/class="price-history-line"/g) || []).length, 1);
  assert.match(svg, /&lt;unsafe&gt;/);
  assert.doesNotMatch(svg, /<unsafe>|NaN|Infinity/);
});

test('a single or constant price remains visible on a narrow chart without a fictional trend', () => {
  const geometry = buildGeometry([point('2026-10-28', 14)], 220);
  const svg = chartSvg(geometry, 0, 'Amsterdam');
  assert.equal(geometry.width, 220);
  assert.ok(geometry.points[0].x > geometry.box.left);
  assert.ok(geometry.points[0].y > geometry.box.top);
  assert.doesNotMatch(svg, /class="price-history-line"|NaN|Infinity/);
  assert.equal(buildGeometry([point('2026-10-28', null)]), null);
  const constant = buildGeometry([point('2026-10-01', 14), point('2026-10-02', 14)]);
  assert.equal(constant.points[0].y, constant.points[1].y);
});

class Element {
  constructor() { this.hidden = true; this.value = ''; this.textContent = ''; this.innerHTML = ''; this.dataset = {}; this.attributes = new Map(); this.listeners = {}; this.clientWidth = 400; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
  getBoundingClientRect() { return { left: 0, width: this.clientWidth }; }
  querySelectorAll() { return this.buttons || []; }
  dispatch(type, extra = {}) {
    const event = { type, target: this, preventDefault() { this.prevented = true; }, ...extra };
    this.listeners[type]?.(event);
    return event;
  }
}

function harness({ data = payload(), fail = false, mismatch = false, hang = false } = {}) {
  const ids = ['price-history', 'price-history-scope', 'price-history-ranges', 'price-history-plot', 'price-history-value',
    'price-history-date', 'price-history-coverage', 'price-history-status', 'price-history-rows', 'price-history-live',
    'price-history-controls', 'price-history-details', 'price-history-stamp', 'price-history-note',
    'price-history-benchmark', 'price-history-shops', 'price-history-benchmark-description',
    'price-history-trace-control', 'price-history-trace-toggle', 'price-history-partial', 'price-history-partial-toggle', 'price-history-partial-result'];
  const elements = new Map(ids.map(id => [id, new Element()]));
  const get = id => elements.get(id);
  const buttons = ['30', '90', 'all'].map(value => { const button = new Element(); button.dataset.priceRange = value; button.closest = () => button; return button; });
  get('price-history-ranges').buttons = buttons;
  const timers = new Set();
  const requests = [];
  const runtime = {
    AbortController, addEventListener() {},
    setTimeout(callback) { timers.add(callback); return callback; }, clearTimeout(timer) { timers.delete(timer); },
    async fetch(path, options) {
      requests.push(path);
      if (hang) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
      if (fail) throw new Error('Unavailable');
      return { ok: true, json: async () => path.endsWith('price_history.json') ? data
        : { exported_at_utc: mismatch ? '2026-10-27T12:00:00Z' : data.exported_at_utc } };
    }
  };
  const controller = mount({ getElementById: get }, runtime);
  return { get, buttons, timers, requests, ready: controller.ready };
}

test('the real controller supports location changes, keyboard inspection, period buttons and an accessible table', async () => {
  const app = harness();
  await app.ready;
  assert.equal(app.get('price-history').getAttribute('aria-busy'), 'false');
  assert.equal(app.get('price-history-value').textContent, '€16.00/g');
  assert.equal(app.get('price-history-controls').hidden, false);
  assert.match(app.get('price-history-note').textContent, /Coverage in this period: 2 shops/);
  assert.equal(app.get('price-history-plot').getAttribute('tabindex'), '0');
  assert.equal((app.get('price-history-rows').innerHTML.match(/<tr>/g) || []).length, 3);
  app.get('price-history-plot').dispatch('keydown', { key: 'Home' });
  assert.equal(app.get('price-history-value').textContent, '€12.00/g');
  assert.match(app.get('price-history-live').textContent, /1 September 2026/);
  app.get('price-history-plot').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(app.get('price-history-value').textContent, '€14.00/g');
  app.get('price-history-plot').dispatch('keydown', { key: 'End' });
  assert.equal(app.get('price-history-value').textContent, '€16.00/g');
  app.get('price-history-plot').dispatch('click', { clientX: 0 });
  assert.equal(app.get('price-history-value').textContent, '€12.00/g');
  app.get('price-history-plot').dispatch('pointermove', { clientX: 400, pointerType: 'touch' });
  assert.equal(app.get('price-history-value').textContent, '€12.00/g', 'Touch scrolling must not accidentally inspect other dates');
  app.get('price-history-ranges').dispatch('click', { target: app.buttons[0] });
  assert.equal((app.get('price-history-rows').innerHTML.match(/<tr>/g) || []).length, 2);
  assert.equal(app.buttons[0].getAttribute('aria-pressed'), 'true');
  app.get('price-history-scope').value = 'amsterdam';
  app.get('price-history-scope').dispatch('change');
  assert.equal(app.get('price-history-value').textContent, '€20.00/g');
  assert.match(app.get('price-history-status').textContent, /One snapshot/);
  assert.equal(app.timers.size, 0);
});

test('an empty location stays selectable and receives an honest empty state', async () => {
  const data = payload();
  data.series[1].points = [point('2026-10-28', null, { shop_count: 0, strain_count: 0, listing_count: 0 })];
  const app = harness({ data });
  await app.ready;
  app.get('price-history-scope').value = 'amsterdam';
  app.get('price-history-scope').dispatch('change');
  assert.equal(app.get('price-history-plot').hidden, true);
  assert.equal(app.get('price-history-value').textContent, 'No recorded price');
  assert.match(app.get('price-history-status').textContent, /no recorded prices/i);
});

test('failed, mismatched and stalled publications settle into an isolated fallback', async () => {
  for (const options of [{ fail: true }, { mismatch: true }, { hang: true }]) {
    const app = harness(options);
    if (options.hang) [...app.timers].forEach(callback => callback());
    await app.ready;
    assert.equal(app.get('price-history-value').textContent, 'History unavailable');
    assert.equal(app.get('price-history-controls').hidden, true);
    assert.equal(app.get('price-history-details').hidden, true);
    assert.equal(app.get('price-history').getAttribute('aria-busy'), 'false');
    assert.equal(app.timers.size, 0);
  }
});

test('a fixed benchmark is the default, lists its real shops and flags incomplete current coverage', async () => {
  const data = payload();
  data.benchmark = { shops: [{ shop_id: 1, name: 'Shop <One>', city: 'Amsterdam' }, { shop_id: 2, name: 'Shop Two', city: 'Amsterdam' }] };
  data.series.unshift({ id: 'benchmark', name: 'Fixed 2-shop benchmark', kind: 'benchmark', points: [
    point('2026-10-10', 12), point('2026-10-28', null, { shop_count: 1, kind: 'current' })
  ] });
  const app = harness({ data });
  await app.ready;
  assert.equal(app.get('price-history-scope').value, 'benchmark');
  assert.equal(app.get('price-history-value').textContent, '€12.00/g');
  assert.match(app.get('price-history-note').textContent, /same 2 shops/);
  assert.equal(app.get('price-history-benchmark').hidden, false);
  assert.match(app.get('price-history-shops').innerHTML, /Shop &lt;One&gt;/);
  assert.match(app.get('price-history-shops').innerHTML, /shop_id=2/);
  assert.match(app.get('price-history-status').textContent, /incomplete \(1 of 2 shops\)/);
});

test('shop traces share an honest price scale while the benchmark remains the prominent line', () => {
  const main = [point('2026-10-01', 15), point('2026-10-28', 16)];
  const traces = [
    { name: 'Low shop', points: [point('2026-10-01', 8), point('2026-10-28', 10)] },
    { name: 'High <shop>', points: [point('2026-10-01', 30), point('2026-10-28', 32)] }
  ];
  const geometry = buildGeometry(main, 400, 260, traces);
  assert.equal(geometry.traces.length, 2);
  for (const trace of geometry.traces) for (const point of trace.points) {
    assert.ok(point.y >= geometry.box.top && point.y <= geometry.box.bottom);
  }
  const svg = chartSvg(geometry, 1, 'Benchmark');
  assert.equal((svg.match(/class="price-history-shop-trace"/g) || []).length, 2);
  assert.match(svg, /High &lt;shop&gt;/);
  assert.equal((svg.match(/class="price-history-line"/g) || []).length, 1);
  assert.equal(buildGeometry(main, 400, 260).traces.length, 0);
});

// A partial benchmark is offered separately and never changes the full chart.
test('incomplete latest benchmark is separately labelled and uses only reporting shops', async () => {
  const data = payload();
  data.benchmark = { shops: [{shop_id: 1, name: 'One'}, {shop_id: 2, name: 'Two'}] };
  data.series = [
    {id: 'benchmark', name: 'Benchmark', kind: 'benchmark', points: [point('2026-10-10', 12), point('2026-10-28', null, {shop_count: 1})]},
    {id: 'shop-1', name: 'One', kind: 'shop', points: [point('2026-10-28', 18, {shop_count: 1})]},
    {id: 'shop-2', name: 'Two', kind: 'shop', points: [point('2026-10-28', null, {shop_count: 0})]}
  ];
  const app = harness({data});
  await app.ready;
  assert.equal(app.get('price-history-value').textContent, '€18.00/g');
  assert.match(app.get('price-history-date').textContent, /Incomplete latest snapshot/);
  assert.match(app.get('price-history-coverage').textContent, /1 of 2 shops/);
  assert.match(app.get('price-history-status').textContent, /Latest complete benchmark: 10 October 2026/);
  assert.equal(app.get('price-history-partial').hidden, false);
  app.get('price-history-partial-toggle').dispatch('click');
  assert.equal(app.get('price-history-partial-result').hidden, false);
  assert.match(app.get('price-history-partial-result').textContent, /€18.00\/g across 1 of 2 shops/);
  assert.match(app.get('price-history-partial-result').textContent, /not directly comparable/);
  assert.equal(app.get('price-history-value').textContent, '€18.00/g');
  assert.match(app.get('price-history-plot').innerHTML, /price-history-line/);
  assert.doesNotMatch(app.get('price-history-plot').innerHTML, /price-history-extension/);
});

// August is the first date displayed, not a fabricated data point.
test('the August cutoff excludes older records and the axis starts on 1 August', () => {
  const scope={points:[point('2026-07-31',8),point('2026-08-03',10),point('2026-10-28',16)]};
  const selected=selectPoints(scope,'all','2026-10-28');
  assert.deepEqual(selected.map(row=>row.date),['2026-08-03','2026-10-28']);
  const geometry=buildGeometry(selected,400,270,[],Date.parse('2026-08-01T00:00:00Z'));
  assert.equal(geometry.xTicks[0].label,'1 Aug');
  assert.equal(geometry.points.length,2);
  assert.equal(geometry.points[0].date,'2026-08-03');
  assert.ok(geometry.points[0].x > geometry.box.left);
});

// Date boundaries do not add projected lines or observations.
test('graph keeps its date boundaries without projecting values', () => {
  const points=[point('2026-08-03',10),point('2026-10-10',16)];
  const geometry=buildGeometry(points,400,270,[],Date.parse('2026-08-01T00:00:00Z'),Date.parse('2026-10-28T00:00:00Z'));
  const svg=chartSvg(geometry,1,'Benchmark');
  assert.equal(geometry.xTicks[0].label,'1 Aug');
  assert.equal(geometry.xTicks.at(-1).label,'28 Oct');
  assert.doesNotMatch(svg, /price-history-extension/);
  assert.equal(geometry.points.length,2);
  assert.match(svg,/connects recorded observations/);
});

// Real benchmark data should start at the first visible price, not the range cutoff.
test('one- and three-month ranges start with their first recorded benchmark point at the left edge', async () => {
  const fs = require('node:fs');
  const data = JSON.parse(fs.readFileSync(require.resolve('../database/price_history.json'), 'utf8'));
  const app = harness({ data });
  await app.ready;
  for (const [button, expected] of [[app.buttons[1], '27 Aug'], [app.buttons[0], '26 Oct']]) {
    app.get('price-history-ranges').dispatch('click', { target: button });
    const svg = app.get('price-history-plot').innerHTML;
    const first = svg.match(/class="price-history-dot" cx="([^"]+)"/);
    assert.ok(first, `Missing data point for ${expected}`);
    assert.equal(Number(first[1]), 45, `${expected} should start at the left edge`);
    assert.match(svg, new RegExp(`>${expected}</text>`));
    assert.doesNotMatch(svg, /price-history-extension/);
  }
});
