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

function harness({ shared = false } = {}) {
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
  if (shared) window.BudfinderExplore = require('../scripts/budfinder-explore.js');
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
  const context = vm.createContext({ document, window, localStorage, URL, URLSearchParams, AbortController,
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

test('a missing or incomplete shop catalogue never overwrites saved choices', async () => {
  for (const shops of [null, [], [{}]]) {
    const h = harness();
    const before = JSON.stringify(['37','42']);
    h.memory.set('budfinder_explorer_selected_shops', before);
    h.memory.set('budfinder_strain_shelf', JSON.stringify(['Gelato']));
    vm.runInContext('databaseLoading = false', h.context);
    h.context.loadJson = async path => {
      if (path.includes('shops.json')) {
        if (shops === null) throw new Error('offline');
        return shops;
      }
      return path.includes('active_offerings') ? [{shop_id:37}] : {};
    };
    h.context.loadText = async () => '';
    h.context.loadLocationCatalog = async () => ({});
    await h.context.init();
    assert.equal(h.memory.get('budfinder_explorer_selected_shops'), before);
    assert.equal(h.memory.get('budfinder_strain_shelf'), JSON.stringify(['Gelato']));
    assert.match(h.elements.get('status').innerHTML, /Your saved choices are still on this device/);
    assert.match(h.elements.get('status').innerHTML, /data-retry-database/);
  }
});

test('keyboard users can skip straight to the menu search', () => {
  const css = fs.readFileSync(path.join(root, 'styles/budfinder-database-refinements.css'), 'utf8');
  assert.match(html, /class="database-skip-link" href="#search"/);
  assert.match(css, /\.database-skip-link:focus/);
  const h = harness();
  for (const [browser, detail, target] of [
    ['', null, '#search'], ['rare', null, '#discovery-browser-search'],
    ['rare', { type: 'strain', key: 'test' }, '#detail-view']
  ]) {
    h.state.discoveryBrowser = browser;
    h.state.detail = detail;
    h.context.syncDatabaseSkipLink();
    assert.equal(h.elements.get('database-skip').getAttribute('href'), target);
  }
});

test('homepage rare finds opens a directory restricted to two or three distinct shops nationwide', () => {
  const h = harness({ shared: true });
  h.state.offerings = [['Solo', [1, 1]], ['Pair', [1, 2]], ['Trio', [1, 2, 3]], ['Common', [1, 2, 3, 4]]]
    .flatMap(([strain, ids]) => ids.map(id => ({ shop_id: id, shop_city: id === 1 ? 'Breda' : 'Delft',
      strain_name: strain, strain_name_normalised: strain.toLowerCase(), base_type: 'hybrid', price_amount: 10 })));
  h.context.buildStats();
  h.navigate('database.html?mode=rare');
  h.context.applyInitialUrlState();
  h.context.renderDiscoveryBrowser();
  assert.equal(h.elements.get('discovery-browser-count').textContent, '2 available');
  const route = h.context.navigationUrlForCurrentState();
  h.navigate(route);
  h.context.applyInitialUrlState();
  h.context.setExploreFilters({ city: 'Breda' });
  h.context.renderDiscoveryBrowser();
  assert.equal(h.state.discoveryBrowser, 'rare');
  assert.equal(h.elements.get('discovery-browser-count').textContent, '2 available');
  const grid = h.elements.get('discovery-browser-grid').innerHTML;
  assert.match(grid, />Pair</);
  assert.match(grid, />Trio</);
  assert.doesNotMatch(grid, />Solo<|>Common</);
});

test('a stalled database request stops after the timeout instead of hanging on alternate URLs', async () => {
  const h = harness();
  let timeout, requests = 0, cleared = false;
  h.window.setTimeout = callback => { timeout = callback; return 7; };
  h.window.clearTimeout = id => { if (id === 7) cleared = true; };
  h.context.fetch = (_url, {signal}) => {
    requests++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      const error = new Error('Aborted'); error.name = 'AbortError'; reject(error);
    }));
  };
  const request = h.context.loadJson('database/active_offerings.json');
  timeout();
  await assert.rejects(request, {name:'AbortError'});
  assert.equal(requests, 1);
  assert.equal(cleared, true);
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

test('price extrema use dates from matching prices only and ignore unknown prices', () => {
  const { context } = harness();
  const profile = context.priceProfileForListings([
    { price_amount: 7, source_menu_date: '2026-05-18' },
    { price_amount: 7, checked_at: '2026-06-01' },
    { price_amount: 10, source_menu_date: '2026-09-04' },
    { price_amount: 16, updated_at: '2026-09-05' },
    { price_amount: null, source_menu_date: '2026-09-05' }
  ]);
  assert.equal(profile.count, 4);
  assert.equal(profile.low, 7);
  assert.match(context.priceExtremeTileHtml('Lowest price', profile, profile.low), /Latest menu at this price · 1 Jun 2026/);
  assert.match(context.priceExtremeTileHtml('Highest price', profile, profile.high), /Menu date unknown/);
  assert.match(context.priceExtremeTileHtml('Lowest price', profile, null), /No priced listings/);
});

test('freshness labels retain date priority, age boundaries and unknown batch dates', () => {
  const { context: c, state } = harness();
  const observed = { source_seen_at: '2026-09-04T10:00:00Z' };
  const sourceDated = { ...observed, source_menu_date: '2026-08-01' };
  assert.equal(c.displayListingDateValue(sourceDated), '2026-08-01');
  assert.equal(c.listingUpdatedLabel(sourceDated), 'Menu dated 1 Aug 2026');
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
  assert.equal(c.listingPriceLabel({ price_amount: null }), 'Price unknown');
  assert.equal(c.listingPriceLabel({ price_amount: 8, package_weight_g: 1, package_price_amount: 8 }), '€8/g');
  assert.equal(c.listingPriceLabel({ price_amount: 6, price_unit: 'piece' }), '€6/piece');
  assert.equal(c.listingPriceLabel({ price_amount: 10, package_weight_g: 5, package_price_amount: 50 }), '€50 / 5g · €10/g');
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
  assert.match(result, /Menu dated 1 Aug 2026/);
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

test('shop headers show the address, key prices, opening hours and the existing menu actions', () => {
  const { context: c, state } = harness();
  const row = { shopId: '105', shopName: 'Dampkring', shopKey: 'cs-dampkring', city: 'Amsterdam', shopUrl: 'https://example.com/menu' };
  state.shopById.set('105', { shop_id: 105, city: 'Amsterdam', address: 'Handboogstraat 29, 1012 XM Amsterdam' });
  state.offerings = [
    { shop_id: 105, shop_city: 'Amsterdam', price_amount: 16, price_unit: 'g', price_currency: '€' },
    { shop_id: 106, shop_city: 'Amsterdam', price_amount: 10, price_unit: 'g', price_currency: '€' },
    { shop_id: 107, shop_city: 'Amsterdam', price_amount: 12, price_unit: 'g', price_currency: '€' }
  ];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  state.openingHours = { 105: { info_url: 'https://www.coffeeshopdirect.com/dampkring.html', checked_at_utc: '2026-11-18T10:00:00Z',
    days: days.map(day => ({ day, hours: day === 'Sunday' ? 'Closed' : '10:00–01:00' })) } };
  const result = c.shopMenuHeaderHtml(row, [{ price_amount: 16, source_menu_date: '2026-08-01' }], { detail: true });
  assert.match(result, /<h2 class="shop-menu-name">Dampkring<\/h2>/);
  assert.match(result, /Coffeeshop in Amsterdam/);
  assert.match(result, /<p class="shop-menu-address">Handboogstraat 29, 1012 XM Amsterdam<\/p>/);
  assert.match(result, /1 menu item/);
  assert.match(result, /<dt>Typical price<\/dt><dd>€16\/g<\/dd>/);
  assert.equal((result.match(/class="shop-menu-key"/g) || []).length, 1, 'One note, not several');
  assert.match(result, /<dt>Amsterdam typical<\/dt><dd>€12\/g<\/dd>/);
  assert.match(result, /Menu dated 1 Aug 2026/);
  assert.match(result, /<details class="shop-menu-hours">/);
  assert.doesNotMatch(result, /<details[^>]*\bopen\b/);
  assert.match(result, /<th scope="row">Sunday<\/th><td>Closed<\/td>/);
  assert.match(result, /class="is-today"/);
  assert.match(result, /Hours change, so check before you go/);
  assert.match(result, /data-toggle-map-shop="105"/);
  assert.match(result, /aria-pressed="false"/);
  const map = result.match(/<a class="is-primary" href="([^"]+)">View on map/)[1].replaceAll('&amp;', '&');
  assert.equal(new URL(map, 'https://budfinder.org').searchParams.get('shops'), '105');
  state.openingHours = {};
  state.shopById.set('105', { shop_id: 105, city: 'Amsterdam' });
  const bare = c.shopMenuHeaderHtml(row, [{ price_amount: 16, source_menu_date: '2026-08-01' }], { detail: true });
  assert.doesNotMatch(bare, /shop-menu-hours|shop-menu-address/, 'missing hours and addresses are simply left out');
});

test('menu rows tag only clear differences from the strain average', () => {
  const { context: c } = harness();
  const listing = (shop, price, extra = {}) => ({ shop_id: shop, strain_name: 'Test', price_amount: price, price_unit: 'g', price_currency: '€', ...extra });
  const others = [listing(1, 10), listing(2, 14)];
  assert.match(c.menuPriceTagHtml(listing(3, 9), [...others, listing(3, 9)]), /is-below[^>]*>18% below average/);
  assert.match(c.menuPriceTagHtml(listing(3, 15), [...others, listing(3, 15)]), /is-above[^>]*>15% above average/);
  assert.equal(c.menuPriceTagHtml(listing(3, 11.5), [...others, listing(3, 11.5)]), '', 'within 5% gets no tag');
  assert.equal(c.menuPriceTagHtml(listing(3, 9), [listing(3, 9)]), '', 'one shop is not a comparison');
  assert.match(c.menuPriceTagHtml(listing(3, 1, { price_check: 'below_floor' }), others), /Check price/);
  assert.equal(c.menuPriceTagHtml(listing(3, 5, { old_menu: 1 }), others), '', 'the header already explains an old menu');
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
    assert.equal((markup.match(/class="menu-line"/g) || []).length, 4);
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
  assert.doesNotMatch(grouped, /Menu dated/);
  const header = c.shopMenuHeaderHtml({ shopId: '1', shopName: 'Test' }, same);
  assert.match(header, /Menu dated 1 Aug 2026/);
  const mixed = c.shopMenuSectionsHtml(groups, 'mixed-dates');
  assert.equal((mixed.match(/Menu dated 1 Aug 2026/g) || []).length, 2);
});


test('shared filters survive menu/map handoffs, profile navigation and browser Back', () => {
  const h = harness({shared:true});
  h.state.offerings = [
    {shop_id:105,shop_name:'Jollygood',shop_city:'Amsterdam',strain_name:'Gelato',strain_name_normalised:'gelato',base_type:'hybrid',price_amount:12},
    {shop_id:106,shop_name:'Other',shop_city:'Utrecht',strain_name:'Gelato',strain_name_normalised:'gelato',base_type:'hybrid',price_amount:8}
  ];
  h.state.shopById = new Map([['105',{name:'Jollygood',city:'Amsterdam'}],['106',{name:'Other',city:'Utrecht'}]]);
  h.state.shops = [{shop_id:105,name:'Jollygood',city:'Amsterdam'},{shop_id:106,name:'Other',city:'Utrecht'}];
  h.context.buildStats();
  h.context.setExploreFilters({city:'Amsterdam',price:'under15'});
  h.elements.get('search').value='Gelato';
  assert.equal(h.context.exploreRows().length,1);
  const map = new URL(h.context.exploreMapUrl(),'https://budfinder.org');
  assert.equal(map.searchParams.get('search'),'Gelato');
  assert.equal(map.searchParams.get('filter_city'),'Amsterdam');
  assert.equal(map.searchParams.get('filter_price'),'under15');
  h.context.openStrainDetail('gelato');
  assert.equal(new URL(h.location.href).searchParams.get('filter_price'),'under15');
  assert.equal(h.context.exploreRows().length,1);
  const route = h.context.detailUrl({browser:'strains'});
  h.navigate(route+'&browse_search=Gelato&browse_sort=price-low');
  h.context.applyInitialUrlState();
  assert.equal(h.elements.get('discovery-browser-search').value,'Gelato');
  assert.equal(h.state.discoveryBrowserSort,'price-low');
  assert.equal(h.context.exploreRows().length,1);
  h.context.setExploreFilters({});
  assert.equal(h.context.exploreRows().length,2);
  assert.equal(h.elements.get('discovery-browser-search').value,'Gelato');
});


test('native Back through a shop menu retains the previous strain and search return path', () => {
  const h=harness({shared:true});
  h.state.offerings=[{shop_id:105,shop_name:'Jollygood',shop_city:'Amsterdam',strain_name:'Gelato',strain_name_normalised:'gelato',price_amount:12}];
  h.state.shopById=new Map([['105',{name:'Jollygood',city:'Amsterdam'}]]);
  h.context.buildStats();h.elements.get('search').value='Gelato';
  h.context.openStrainDetail('gelato');
  const profileUrl=h.location.href, profileHistory=h.window.history.state;
  h.context.openShopDetail('105');
  h.window.history.state=profileHistory;h.navigate(profileUrl);h.window.listeners.get('popstate')();
  assert.equal(h.state.detail.type,'strain');
  assert.equal(h.context.detailBackLabel('fallback'),'← Back to search results');
  h.context.closeDetail();assert.equal(h.state.detail,null);assert.equal(h.elements.get('search').value,'Gelato');
});

test('strain profile city choices count shops, update prices, and retain the other filters', () => {
  const h = harness({ shared: true });
  const listing = { strain_name: 'Gelato', strain_name_normalised: 'gelato', price_unit: 'g' };
  h.state.offerings = [
    { ...listing, shop_id: 1, shop_name: 'Canal', shop_city: 'Amsterdam', price_amount: 9 },
    { ...listing, shop_id: 1, shop_name: 'Canal', shop_city: 'Amsterdam', price_amount: 8 },
    { ...listing, shop_id: 2, shop_name: 'Harbour', shop_city: 'Rotterdam', price_amount: 12 },
    { ...listing, shop_id: 3, shop_name: 'Square', shop_city: 'Utrecht', price_amount: 17 }
  ];
  h.state.shopById = new Map(h.state.offerings.map(row => [String(row.shop_id), { name: row.shop_name, city: row.shop_city }]));
  h.context.buildStats();
  h.navigate('?detail=strain&strain=Gelato&city=Amsterdam&filter_price=under15');
  h.context.applyInitialUrlState();
  const view = h.elements.get('detail-view');
  const selectCity = value => {
    view.listeners.get('change')({ target: { value, matches: selector => selector === '[data-profile-city]' } });
    h.context.renderDetailContents();
  };
  h.context.renderDetailContents();
  assert.match(view.innerHTML, /value="Amsterdam" selected>Amsterdam · 1 shop</);
  assert.match(view.innerHTML, /All cities · 2 shops/);
  assert.doesNotMatch(view.innerHTML, /<option[^>]*>Utrecht/);
  selectCity('Rotterdam');
  assert.match(view.innerHTML, /value="Amsterdam">Amsterdam · 1 shop</);
  assert.match(view.innerHTML, /Lowest price<\/span>\s*<strong>€12\/g/);
  const cards = view.innerHTML.match(/<tr class="listing-row"[^>]*>[\s\S]*?<\/tr>/g);
  assert.equal(cards.length, 1);
  assert.match(cards[0], /<a class="listing-menu-link" href="[^\"]*detail=shop[^\"]*shop_id=2"[^>]*>[^]*?<strong>Harbour<\/strong>/);
  assert.equal((cards[0].match(/<a href="map\.html\?/g) || []).length, 1);
  h.context.openShopDetail('2');
  assert.equal(h.state.detail.shopId, '2');
  h.context.closeDetail();
  assert.equal(new URL(h.location.href).searchParams.get('filter_city'), 'Rotterdam');
  selectCity('');
  h.context.applyInitialUrlState();
  h.context.renderDetailContents();
  assert.match(view.innerHTML, /value="" selected>All cities · 2 shops</);
  assert.match(view.innerHTML, /Lowest price<\/span>\s*<strong>€8\/g/);
  assert.equal(new URL(h.location.href).searchParams.get('filter_price'), 'under15');
});

test('price comparisons reveal their sample and dates, without mixing currencies or unknown prices', () => {
  const { context: c } = harness();
  const item = { shop_id: 1, strain_name: 'Test', price_amount: 10, price_currency: '€', source_menu_date: '2026-09-03' };
  const rows = [item,
    { ...item, shop_id: 2, price_amount: 20, source_menu_date: '2026-01-01' },
    { ...item, shop_id: 3, price_amount: 1000, price_currency: '$' },
    { ...item, shop_id: 4, price_amount: null }];
  const html = c.priceComparisonHtml(item, rows);
  assert.match(html, /33% below average/);
  assert.match(html, /Mean €15\/g/);
  assert.match(html, /2 priced listings from 2 shops/);
  assert.match(html, /Mean · 2 shops · small sample · How compared/);
  const medianHtml = c.priceComparisonHtml(item, rows, 'median');
  assert.match(medianHtml, /Median · 2 shops · small sample · How compared/);
  assert.match(medianHtml, /map compares the mean/);
  assert.match(html, /1 within 14 days · 1 over 60 days old/);
  assert.match(html, /<details class="price-comparison">/);
  assert.match(html, /<summary>[^]*How compared/);
  assert.match(html, /including this listing/);
  assert.match(html, /not product quality or live stock/);
  assert.doesNotMatch(html, /1000/);
});

test('several pack options at one shop are limited data, rather than an average-price endorsement', () => {
  const { context: c } = harness();
  const item = { shop_id: 1, strain_name: 'Test', price_amount: 10 };
  const html = c.priceComparisonHtml(item, [item, { ...item, price_amount: 20 }]);
  assert.match(html, /Limited price data/);
  assert.match(html, /At least two shops/);
  assert.match(html, /2 priced listings from 1 shop/);
  assert.match(html, /2 with date unknown/);
  assert.doesNotMatch(html, /Around average|below average|above average/);
});


test('menu searches and strain profile URLs share aliases without merging related records', () => {
  const {context:c,state} = harness();
  vm.runInContext(fs.readFileSync(path.join(root,'scripts/budfinder-search.js'),'utf8'), c);
  state.offerings = [
    {strain_name:'G-13',strain_name_normalised:'g-13',shop_name:'Shop',shop_city:'Amsterdam',grower:'G13 Genetics'},
    {strain_name:'G13 Haze',strain_name_normalised:'g13 haze',shop_name:'Other',shop_city:'Amsterdam'}
  ];
  state.strainStats = [{key:'g-13',name:'G-13'}, {key:'g13 haze',name:'G13 Haze'}];
  for (const query of ['g13','G-13','g 13']) {
    assert.equal(c.discoveryMatchScore('G-13',query),100);
    assert.equal(c.resolvedGrowerForSearch(query),'');
    assert.equal(c.getStatByKey(query).key,'g-13');
  }
  assert.equal(c.getStatByKey('G13 Haze').key,'g13 haze');
});

test('a price marked for checking stays visible but never sets the lowest price or a bargain badge', () => {
  const h = harness({ shared: true });
  const listing = { strain_name: 'Gelato', strain_name_normalised: 'gelato', price_unit: 'g', price_currency: '€' };
  h.state.offerings = [
    { ...listing, shop_id: 1, shop_name: 'Canal', shop_city: 'Amsterdam', price_amount: 1, price_check: 'below_floor' },
    { ...listing, shop_id: 2, shop_name: 'Harbour', shop_city: 'Amsterdam', price_amount: 9 },
    { ...listing, shop_id: 3, shop_name: 'Square', shop_city: 'Amsterdam', price_amount: 12 }
  ];
  h.state.shopById = new Map(h.state.offerings.map(row => [String(row.shop_id), { name: row.shop_name, city: row.shop_city }]));
  h.context.buildStats();
  h.navigate('?detail=strain&strain=Gelato');
  h.context.applyInitialUrlState();
  h.context.renderDetailContents();
  const view = h.elements.get('detail-view');
  assert.match(view.innerHTML, /Lowest price<\/span>\s*<strong>€9\/g/);
  const rows = view.innerHTML.match(/<tr class="listing-row"[^>]*>[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, 3);
  assert.match(rows[2], /<strong>Canal<\/strong>[\s\S]*€1\/g[\s\S]*Check price/, 'flagged price sorts last and is labelled');
  assert.doesNotMatch(rows[2], /Great price|Good price/);
  const profile = h.context.priceProfileForListings(h.state.offerings);
  assert.equal(profile.low, 9);
  assert.equal(profile.count, 2);
  assert.match(h.context.priceComparisonHtml(h.state.offerings[0], h.state.offerings, 'median'), /Check price/);
});

test('a listing from an old menu keeps its price and date but is left out of comparisons', () => {
  const h = harness({ shared: true });
  const listing = { strain_name: 'Gelato', strain_name_normalised: 'gelato', price_unit: 'g', price_currency: '€' };
  h.state.offerings = [
    { ...listing, shop_id: 1, shop_name: 'Canal', shop_city: 'Amsterdam', price_amount: 5, old_menu: 1, source_menu_date: '2016-01-28' },
    { ...listing, shop_id: 2, shop_name: 'Harbour', shop_city: 'Amsterdam', price_amount: 9 },
    { ...listing, shop_id: 3, shop_name: 'Square', shop_city: 'Amsterdam', price_amount: 12 }
  ];
  h.state.shopById = new Map(h.state.offerings.map(row => [String(row.shop_id), { name: row.shop_name, city: row.shop_city }]));
  h.context.buildStats();
  h.navigate('?detail=strain&strain=Gelato');
  h.context.applyInitialUrlState();
  h.context.renderDetailContents();
  const view = h.elements.get('detail-view');
  assert.match(view.innerHTML, /Lowest price<\/span>\s*<strong>€9\/g/);
  const rows = view.innerHTML.match(/<tr class="listing-row"[^>]*>[\s\S]*?<\/tr>/g);
  assert.match(rows[2], /<strong>Canal<\/strong>[\s\S]*€5\/g[\s\S]*Old menu[\s\S]*28 Jan 2016/, 'old menu sorts last with its date');
  const profile = h.context.priceProfileForListings(h.state.offerings);
  assert.equal(profile.low, 9);
  assert.equal(profile.count, 2);
  assert.match(h.context.priceComparisonHtml(h.state.offerings[0], h.state.offerings, 'median'), /Old menu/);
  assert.equal(h.context.priceComparisonHtml(h.state.offerings[0], h.state.offerings, 'average', { oldMenuBadge: false }), '');
});

test('old menus are named as such instead of looking unpriced, and posted dates read "Menu dated"', () => {
  const { context: c } = harness();
  const listing = (shop, price, extra = {}) => ({ shop_id: shop, strain_name: 'Gelato', strain_name_normalised: 'gelato',
    price_amount: price, price_unit: 'g', price_currency: '€', source_menu_date: '2026-09-07', ...extra });
  const old = [listing(1, 9, { old_menu: 1, source_menu_date: '2025-11-09' }), listing(1, 11, { old_menu: 1, source_menu_date: '2025-11-09' })];
  assert.equal(c.missingPriceLabel(old), 'Old menu');
  assert.equal(c.missingPriceLabel([listing(1, 1, { price_check: 'below_floor' })]), 'Price to check');
  assert.equal(c.missingPriceLabel([listing(1, null)]), 'Price unknown');
  const mixed = [listing(2, 12), listing(3, 13), ...old, listing(4, 1, { price_check: 'below_floor' })];
  assert.equal(c.comparedListingsNote(mixed, 2), '2 compared · 2 old menus · 1 to check');
  assert.equal(c.comparedListingsNote([listing(2, 12)], 1), '1 compared');
  const card = c.discoveryShopCardHtml({ shopId: '1', shopName: 'Buggy', city: 'Nijmegen', offerings: old,
    averagePrice: null, latestDate: '2025-11-09T00:00:00.000Z', freshness: c.menuAgeInfo('2025-11-09', { dated: true }) });
  assert.match(card, /Old menu/);
  assert.doesNotMatch(card, /Price unknown|Menu observed/);
  assert.match(card, /Menu dated 9 Nov 2025/);
  assert.equal(c.latestListingDateInfo(old).dated, true);
  assert.equal(c.latestListingDateInfo([{ source_seen_at: '2026-09-04T10:00:00Z' }]).dated, false);
});

test('a strain page opens with its quick price answer and links to the full figures', () => {
  const { context: c } = harness();
  const listing = (shop, price, extra = {}) => ({ shop_id: shop, strain_name: 'Gelato', price_amount: price, price_unit: 'g', price_currency: '€', ...extra });
  const listings = [listing(1, 7), listing(2, 12), listing(3, 20), listing(4, 9, { old_menu: 1 })];
  const line = c.strainPriceLineHtml(c.priceProfileForListings(listings), listings);
  assert.match(line, /<strong>From €7\/g<\/strong> · average €13\/g · 3 compared · 1 old menu · <a href="#strain-price-details">Price details<\/a>/);
  const old = [listing(4, 9, { old_menu: 1 })];
  assert.equal(c.strainPriceLineHtml(c.priceProfileForListings(old), old), '<p class="strain-price-line">Old menu · 0 compared · 1 old menu</p>');
});
