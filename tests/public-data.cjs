/* Exercise the shared rules with real regressions rather than copying their implementation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('../scripts/budfinder-data.js');

test('a source belonging to a closed shop cannot contribute an active map match', () => {
  const shops = [
    {shop_id: 1, name: 'Old Shop', shop_key: 'cs-oldshop', is_closed: 1},
    {shop_id: 2, name: 'New Shop', shop_key: 'cs-newshop', image_url: 'https://example.org/OldShop/menu.jpg'},
    {shop_id: 3, name: 'Open Shop', image_url: 'https://example.org/OpenShop/menu.jpg'},
    {shop_id: 4, name: 'Hidden Shop', show_in_admin: 0}
  ];
  assert.deepEqual([...data.unavailableShopIds(shops)], ['1', '2', '4']);
});

test('archives and directories never inherit an official-website label', () => {
  assert.equal(data.linkLabel('https://www.coffeeshopmenus.org/cs-abraxas.html', true), 'Menu source');
  assert.equal(data.linkLabel('https://coffeeshopdirect.com/example.html'), 'Shop directory');
  assert.equal(data.linkLabel('https://example.org/'), 'External website');
  assert.equal(data.linkLabel('https://example.org/', true), 'Official shop website');
  for (const bad of ['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/private', '/relative', 'not a URL']) {
    assert.equal(data.webUrl(bad), '');
  }
});

test('the shipped Amnesia shop count is consistent across public snapshot indexes', () => {
  const read = name => JSON.parse(fs.readFileSync(require.resolve(`../database/${name}.json`), 'utf8'));
  const unavailable = data.unavailableShopIds(read('shops'));
  const ids = new Set(read('active_offerings').filter(row => !unavailable.has(String(row.shop_id)) && row.strain_name.toLowerCase() === 'amnesia haze').map(row => row.shop_id));
  const entry = read('search_index').strains.find(row => row.name.toLowerCase() === 'amnesia haze');
  assert.equal(ids.size, entry.shop_count);
});

test('an authoritative shop ID cannot be matched by a different shop name fallback', () => {
  const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
  const fn = source.match(/^    function locationMatchesStrainMatchSets\([^]*?^    }/m)[0];
  const context = vm.createContext({normaliseNameCityKey: (name, city) => `${name}|${city}`});
  vm.runInContext(fn, context);
  const names = new Set(['Same name|Amsterdam']);
  assert.equal(context.locationMatchesStrainMatchSets({db_shop_id: 2, name: 'Same name', city: 'Amsterdam'}, new Set([1]), names), false);
  assert.equal(context.locationMatchesStrainMatchSets({name: 'Same name', city: 'Amsterdam'}, new Set([1]), names), true);
});
