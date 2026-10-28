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
    'styles/budfinder-database-refinements.css', 'styles/budfinder-menu.css', 'scripts/budfinder-database.js']) {
    assert.ok(fs.existsSync(path.join(root, asset)), asset);
  }
  assert.ok(assets.indexOf('styles/budfinder-database.css') < assets.indexOf('styles/budfinder-polish.css'));
  assert.ok(assets.indexOf('styles/budfinder-polish.css') < assets.indexOf('styles/budfinder-database-refinements.css'));
  assert.ok(assets.indexOf('styles/budfinder-database-refinements.css') < assets.indexOf('styles/budfinder-menu.css'));
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

test('menu prices show one-gram amounts once and retain real pack totals and currencies', () => {
  const { context: c } = harness();
  const parts = item => JSON.parse(JSON.stringify(c.menuPriceParts(item)));
  assert.deepEqual(parts({ price_currency: '€', package_price_amount: 10, package_weight_g: 1, price_amount: 10 }),
    { primary: '€10/g', secondary: '' });
  assert.deepEqual(parts({ price_currency: '€', package_price_amount: 100, package_weight_g: 3.5, price_amount: 100 / 3.5 }),
    { primary: '€100 / 3.5g', secondary: '€28.57/g' });
  assert.deepEqual(parts({ price_currency: '£', package_price_amount: 12.5, package_weight_g: 0.9, price_amount: 12.5 / 0.9 }),
    { primary: '£12.50 / 0.9g', secondary: '£13.89/g' });
  assert.deepEqual(parts({ price_currency: '$', price_amount: 30, price_unit: 'g' }),
    { primary: '$30/g', secondary: '' });
  for (const price_amount of [null, undefined, '', ' ', 'unknown', 0, -10]) {
    assert.deepEqual(parts({ price_amount }), { primary: 'Price unknown', secondary: '' });
  }
  assert.deepEqual(parts({ package_price_amount: 50, package_weight_g: 3.5, price_amount: null }),
    { primary: '€50 / 3.5g', secondary: '' });
});

test('menu rows retain grower, flags, notes, dates and safe strain navigation', () => {
  const { context: c } = harness();
  const row = { strain_name: 'Long strain x Wild Cherry', strain_name_normalised: 'long strain x wild cherry',
    base_type: 'hybrid', is_cali: 1, is_legal: 1, grower: 'Wizard Trees', notes: 'Limited <batch>',
    price_amount: 20, package_price_amount: 70, package_weight_g: 3.5, source_menu_date: '2026-08-01' };
  const before = JSON.stringify(row);
  const result = c.menuListingCardHtml(row);
  assert.match(result, /data-open-strain-detail="long strain x wild cherry"/);
  assert.match(result, />Long strain x Wild Cherry<\/button>/);
  assert.match(result, /Cali · Legal project · Grower: Wizard Trees/);
  assert.match(result, /Limited &lt;batch&gt;/);
  assert.match(result, /Source menu dated 1 Aug 2026/);
  assert.match(result, /€70 \/ 3.5g/);
  assert.match(result, /€20\/g/);
  assert.equal(JSON.stringify(row), before);
  const unsafe = c.menuListingCardHtml({ ...row, strain_name: '<script>alert(1)</script>',
    strain_name_normalised: 'test" onclick="bad', grower: '<img src=x>', notes: '<script>bad</script>' });
  assert.doesNotMatch(unsafe, /<script>|<img src=x>/);
  assert.match(unsafe, /&quot; onclick=&quot;/);
});

test('an unknown menu price never receives a bargain badge', () => {
  const { context: c, state } = harness();
  state.strainStats = [{ key: 'test', name: 'Test', offerings: [{ price_amount: 20, price_unit: 'g' }] }];
  const result = c.menuListingCardHtml({ strain_name: 'Test', strain_name_normalised: 'test', price_amount: null });
  assert.match(result, /Price unknown/);
  assert.doesNotMatch(result, /below average|above average|Around average/);
  assert.match(result, /Menu date unknown/);
});

test('compact headers keep statistics available on demand and existing menu actions', () => {
  const { context: c, state } = harness();
  const row = { shopId: '105', shopName: 'Dampkring', shopKey: 'cs-dampkring', city: 'Amsterdam', shopUrl: 'https://example.com/menu' };
  state.shopById.set('105', { shop_id: 105, city: 'Amsterdam' });
  const result = c.shopMenuHeaderHtml(row, [{ price_amount: 16, source_menu_date: '2026-08-01' }], { detail: true });
  assert.match(result, /<h2 class="shop-menu-name">Dampkring<\/h2>/);
  assert.match(result, /Amsterdam · 1 menu item/);
  assert.match(result, /<details class="shop-menu-overview">/);
  assert.doesNotMatch(result, /<details[^>]*\bopen\b/);
  assert.match(result, /<summary>Menu details/);
  assert.match(result, /Average price/);
  assert.match(result, /Source menu/);
  assert.match(result, /data-toggle-map-shop="105"/);
  assert.match(result, /aria-pressed="false"/);
  const map = result.match(/<a href="([^"]+)">View on map/)[1].replaceAll('&amp;', '&');
  assert.equal(new URL(map, 'https://budfinder.org').searchParams.get('shops'), '105');
  assert.doesNotMatch(result, /full current menu snapshot|PRICED LISTINGS/);
});

test('category links target unique headings in both menu views without dropping any pack options', () => {
  const { context: c } = harness();
  const item = (name, category, weight = 1) => ({ strain_name: name, base_type: category,
    price_amount: 10, package_price_amount: 10 * weight, package_weight_g: weight });
  const groups = new Map([
    ['hybrid', [item('One', 'hybrid'), item('One', 'hybrid', 3.5)]],
    ['sativa', [item('Two', 'sativa')]],
    ['indica', [item('Three', 'indica')]],
  ]);
  const detail = c.shopMenuSectionsHtml(groups, 'detail-menu-105', { detail: true });
  const browser = c.shopMenuSectionsHtml(groups, 'browser-menu-105');
  assert.ok(detail.indexOf('>Sativa<span>') < detail.indexOf('>Indica<span>'));
  assert.ok(detail.indexOf('>Indica<span>') < detail.indexOf('>Hybrid<span>'));
  for (const markup of [detail, browser]) {
    assert.equal((markup.match(/class="menu-listing-card menu-row"/g) || []).length, 4);
    for (const [, target] of markup.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(markup.includes(`id="${target}" tabindex="-1"`));
    }
  }
  const allIds = [...(detail + browser).matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(allIds).size, allIds.length);
});

test('dates appear once only when every menu item has the same known date label', () => {
  const { context: c } = harness();
  const dated = { strain_name: 'One', price_amount: 10, source_menu_date: '2026-08-01' };
  const same = [{ ...dated }, { ...dated, strain_name: 'Two' }];
  assert.ok(c.commonMenuDateItem(same));
  assert.equal(c.commonMenuDateItem([{ ...dated }, { ...dated, source_menu_date: '2026-08-02' }]), null);
  assert.equal(c.commonMenuDateItem([{ ...dated }, { strain_name: 'Unknown date' }]), null);
  assert.equal(c.commonMenuDateItem([{ strain_name: 'Unknown date' }]), null);
  assert.equal(c.commonMenuDateItem([]), null);
  const groups = new Map([['sativa', same]]);
  const grouped = c.shopMenuSectionsHtml(groups, 'known-date', { sharedDateItem: c.commonMenuDateItem(same) });
  assert.doesNotMatch(grouped, /Source menu dated/);
  const header = c.shopMenuHeaderHtml({ shopId: '1', shopName: 'Test' }, same);
  assert.match(header, /Source menu dated 1 Aug 2026/);
  const mixed = c.shopMenuSectionsHtml(groups, 'mixed-dates');
  assert.equal((mixed.match(/Source menu dated 1 Aug 2026/g) || []).length, 2);
});
