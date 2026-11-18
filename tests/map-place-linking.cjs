/* Protect neighbourhoods and other map places from coffeeshop name collisions. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('../scripts/budfinder-data.js');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const shops = require('../database/shops.json');

/** Exercise the shipped linker and visibility rules against the exported shop index. */
function harness(categories = ['Area']) {
  const context = vm.createContext({
    window: { location: { href: 'https://budfinder.org/map.html' } },
    URL, dbByShopKey: new Map(), dbByPath: new Map(), dbByNameCity: new Map(),
    dbByUniqueName: new Map(), dbShopMetaById: new Map(),
    dbUnavailableShopIds: data.unavailableShopIds(shops),
    selectedCategories: categories, favorites: [], strainAllowedShopIds: null,
    strainAllowedNameCityKeys: null,
    passesSharedMenuFilters: () => true, locationMatchesExplorerFocus: () => true,
    passesMissionMode: () => true, matchesLocationSearch: () => true
  });
  const names = [
    'normaliseText', 'normaliseNameCityKey', 'normaliseUrlPath',
    'isUnavailableDbShopId', 'isCoffeeShopLocation', 'isClosedLocation',
    'bindDbShopIdToLocation', 'passesBaseFilters', 'passesCategoryFilter',
    'shouldShowMarkerOnMap'
  ];
  vm.runInContext(names.map(name => {
    const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(match, `Missing shipped function: ${name}`);
    return match[0];
  }).join('\n'), context);

  // Build the same lookup keys used by the map, retaining only unique names.
  const counts = new Map();
  for (const shop of shops) {
    const name = context.normaliseText(shop.name);
    counts.set(name, (counts.get(name) || 0) + 1);
    context.dbByShopKey.set(shop.shop_key, shop.shop_id);
    context.dbByNameCity.set(context.normaliseNameCityKey(shop.name, shop.city), shop.shop_id);
    context.dbByPath.set(context.normaliseUrlPath(shop.shop_url), shop.shop_id);
    context.dbShopMetaById.set(shop.shop_id, shop);
  }
  for (const shop of shops) {
    const name = context.normaliseText(shop.name);
    if (counts.get(name) === 1) context.dbByUniqueName.set(name, shop.shop_id);
  }
  return context;
}

test('Amsterdam De Pijp stays visible despite the hidden Zwolle shop of the same name', () => {
  // This particular CSV record has no quoted commas; read the shipped neighbourhood.
  const lines = fs.readFileSync(require.resolve('../database/locations/amsterdamLoc.csv'), 'utf8').split(/\r?\n/);
  const values = lines.find(line => line.startsWith('De Pijp,')).split(',');
  const row = Object.fromEntries(lines[0].split(',').map((key, i) => [key, values[i]]));
  const loc = { name: row.name, city: 'Amsterdam', website: row.website,
    Area: row.Area === 'y', Coffeeshop: row.Coffeeshop === 'y' };
  const app = harness();
  app.bindDbShopIdToLocation(loc);
  assert.equal(loc.db_shop_id, null);
  assert.equal(loc.db_shop_unavailable, false);
  assert.equal(app.shouldShowMarkerOnMap(loc, 0), true);
});

test('rebinding non-shop places clears old menu links and hidden-shop flags', () => {
  for (const category of ['Area', 'Hotel', 'Bar', 'Food', 'Attraction']) {
    const loc = { name: 'De Pijp', city: 'Zwolle', [category]: true,
      Coffeeshop: false, db_shop_id: 281, db_shop_unavailable: true };
    const app = harness([category]);
    app.bindDbShopIdToLocation(loc);
    assert.equal(loc.db_shop_id, null, category);
    assert.equal(app.shouldShowMarkerOnMap(loc, 0), true, category);
  }
});

test('real coffeeshops retain explicit menu links and unavailable-menu handling', () => {
  const app = harness(['Coffeeshop']);
  const local = { name: 'Local shop', city: 'Amsterdam', Coffeeshop: true,
    shop_key: 'ams-local', menu_shop_key: 'cs-abraxas' };
  app.bindDbShopIdToLocation(local);
  assert.equal(local.db_shop_id, shops.find(shop => shop.shop_key === 'cs-abraxas').shop_id);
  const hidden = { name: 'De Pijp', city: 'Zwolle', Coffeeshop: true, shop_key: 'cs-pijp' };
  app.bindDbShopIdToLocation(hidden);
  assert.equal(hidden.db_shop_id, 281);
  assert.equal(app.shouldShowMarkerOnMap(hidden, 0), false);
});
