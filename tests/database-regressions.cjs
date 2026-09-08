const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'database.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'scripts/budfinder-database.js'), 'utf8');
const fixedNow = Date.parse('2026-09-05T12:00:00Z');

class Element {
  constructor() {
    this.value = '';
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  querySelectorAll() { return this.children; }
  querySelector() { return null; }
  contains(element) { return element === this; }
  replaceChildren() { this.children = []; }
  scrollIntoView() {}
  focus() {}
}

function harness() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, new Element()]));
  const modes = [...html.matchAll(/data-browse-mode="([^"]+)"/g)].map(([, mode]) => {
    const element = new Element(); element.dataset.browseMode = mode; return element;
  });
  elements.get('browse-mode-grid').children = modes;
  const document = new Element();
  document.getElementById = id => elements.get(id) || null;
  document.body = new Element();
  document.activeElement = null;
  const memory = new Map();
  const localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key)
  };
  const location = { href: 'https://budfinder.org/database.html', search: '', origin: 'https://budfinder.org' };
  const window = new Element();
  const navigate = route => {
    const url = new URL(route, location.href);
    location.href = url.href; location.search = url.search;
  };
  const history = {
    state: {},
    replaceState(value, _title, url) { this.state = value; navigate(url); },
    pushState(value, _title, url) { this.state = value; navigate(url); }
  };
  Object.assign(window, { location, history, setTimeout() {}, clearTimeout() {}, scrollTo() {} });
  class FixedDate extends Date { static now() { return fixedNow; } }
  // Initialization waits for a mocked network response, allowing the shipped
  // script to register its real handlers without loading the production dataset.
  const context = vm.createContext({ document, window, localStorage, URL, URLSearchParams,
    Date: FixedDate, fetch: () => new Promise(() => {}) });
  vm.runInContext(source, context, { filename: 'budfinder-database.js' });
  vm.runInContext('render = () => {}', context);
  return { context, elements, memory, location, window, navigate,
    state: vm.runInContext('state', context) };
}

test('extracted database assets load in the original cascade and classic script order', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.equal((html.match(/<style\b/g) || []).length, 0);
  assert.equal((html.match(/<script>/g) || []).length, 0);
  const assets = [...html.matchAll(/(?:href|src)="([^"?]+)(?:\?[^"]*)?"/g)].map(([, asset]) => asset);
  for (const asset of ['styles/budfinder-database.css', 'styles/budfinder-polish.css',
    'styles/budfinder-database-refinements.css', 'scripts/budfinder-database.js']) {
    assert.ok(fs.existsSync(path.join(root, asset)), asset);
  }
  assert.ok(assets.indexOf('styles/budfinder-database.css') < assets.indexOf('styles/budfinder-polish.css'));
  assert.ok(assets.indexOf('styles/budfinder-polish.css') < assets.indexOf('styles/budfinder-database-refinements.css'));
  assert.ok(assets.indexOf('scripts/budfinder-search.js') < assets.indexOf('scripts/budfinder-database.js'));
  assert.match(html, /<script src="scripts\/budfinder-database\.js\?[^"\n]+"><\/script>/);
});

test('browser Back restores search, browse mode, comparison view and city context', () => {
  const h = harness();
  h.state.strainStats = [{ key: 'gelato', name: 'Gelato' }];
  h.navigate('?mode=fresh&search=Old&city=Amsterdam');
  h.state.browseMode = 'fresh'; h.elements.get('search').value = 'Gelato';
  h.context.rememberDetailReturnContext();
  const backUrl = h.location.href;
  assert.equal(new URL(backUrl).searchParams.get('city'), 'Amsterdam');
  h.state.browseMode = 'value'; h.state.detail = { type: 'strain', key: 'gelato' };
  h.elements.get('search').value = 'Other';
  h.window.listeners.get('popstate')();
  assert.equal(h.state.browseMode, 'fresh');
  assert.equal(h.elements.get('search').value, 'Gelato');
  h.state.view = 'compare'; h.context.rememberDetailReturnContext();
  h.state.view = 'shops'; h.window.listeners.get('popstate')();
  assert.equal(h.state.view, 'compare');
  h.navigate('/database.html'); h.window.listeners.get('popstate')();
  assert.equal(h.elements.get('search').value, '');
  assert.equal(h.state.detail, null);
});

test('saved strains retain legacy storage compatibility and the ten-item limit', () => {
  const h = harness();
  h.state.strainStats = [{ key: 'gelato', name: 'Gelato' }, { key: 'haze', name: 'Haze' }];
  h.memory.set('locate3_strain_shelf', JSON.stringify([' Gelato ', 'GELATO', 'Haze']));
  h.context.loadSharedShelf();
  assert.deepEqual(Array.from(h.state.selected), ['gelato', 'haze']);
  h.context.toggleSelected('gelato');
  assert.deepEqual(Array.from(h.state.selected), ['haze']);
  h.context.toggleSelected('gelato');
  assert.deepEqual(JSON.parse(h.memory.get('budfinder_strain_shelf')), ['Gelato', 'Haze']);
  assert.equal(h.memory.get('budfinder_strain_shelf'), h.memory.get('locate3_strain_shelf'));
  for (let index = 0; index < 12; index++) h.context.toggleSelected(`strain ${index}`);
  assert.equal(h.state.selected.length, 10);
});

test('saved shops remain separate from strains and preserve map links', () => {
  const h = harness();
  h.state.shopById.set('42', { shop_id: 42, name: 'Test shop' });
  h.state.selected = ['gelato'];
  h.context.toggleSelectedShop('42');
  assert.deepEqual(Array.from(h.state.selectedShopIds), ['42']);
  assert.deepEqual(Array.from(h.state.selected), ['gelato']);
  const key = vm.runInContext('SELECTED_SHOPS_STORAGE_KEY', h.context);
  assert.deepEqual(JSON.parse(h.memory.get(key)), ['42']);
  const mapUrl = new URL(h.context.mapUrlForShopIds(['42'], { strainName: 'Gelato', strainShopIds: ['42'] }), h.location.href);
  assert.equal(mapUrl.pathname, '/map.html');
  assert.match(mapUrl.search, /42/);
  assert.match(mapUrl.search, /Gelato/);
  h.context.toggleSelectedShop('42');
  assert.deepEqual(Array.from(h.state.selectedShopIds), []);
  assert.deepEqual(Array.from(h.state.selected), ['gelato']);
});

test('freshness labels retain date priority, age boundaries and unknown batch dates', () => {
  const { context: c, state } = harness();
  const observed = { source_seen_at: '2026-09-04T10:00:00Z' };
  const sourceDated = { ...observed, source_menu_date: '2026-08-01' };
  assert.equal(c.displayListingDateValue(sourceDated), '2026-08-01');
  assert.equal(c.listingUpdatedLabel(sourceDated), 'Source menu dated 1 Aug 2026');
  assert.equal(c.listingUpdatedLabel(observed), 'Menu observed yesterday');
  assert.equal(c.menuAgeInfo('2026-08-22').bucket, 'fresh');
  assert.equal(c.menuAgeInfo('2026-08-21').bucket, 'ageing');
  assert.equal(c.menuAgeInfo('2026-07-07').bucket, 'ageing');
  assert.equal(c.menuAgeInfo('2026-07-06').bucket, 'stale');
  state.snapshotTime = fixedNow;
  const batchOnly = { updated_at: '2026-09-05T10:00:00Z' };
  assert.equal(c.displayListingDateValue(batchOnly), '');
  assert.equal(c.listingUpdatedLabel(batchOnly), 'Menu date unknown');
  assert.equal(c.menuAgeInfo('').bucket, 'unknown');
  assert.equal(c.menuAgeInfo('').days, Infinity);
});
