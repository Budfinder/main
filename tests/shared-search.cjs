const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(require.resolve('../scripts/budfinder-search.js'), 'utf8'), context);
const search = context.window.BudfinderSearch;
const names = ['G13 Haze', 'G-13', 'G13 Amnesia', 'Amnesia G-13', 'G13 x AMG Haze'];
const candidates = names.map(name => ({ kind: 'strain', name, shopCount: name === 'G-13' ? 14 : 500 }));

test('typo recovery offers a unique transposed spelling without changing ordinary matches', () => {
  assert.equal(search.typoCorrection('amneisa haez', ['Amnesia Haze', 'Amnesia Haze Master Cut']), 'Amnesia Haze');
  assert.equal(search.typoCorrection('g13', ['G14']), '');
  assert.equal(search.typoCorrection('Lemon Haze', ['Lemon Haze', 'Lemon Haze CBD']), '');
  assert.equal(search.typoCorrection('Lemon Haze', ['Lemon Haze CBD']), '');
  assert.equal(search.typoCorrection('berry', ['Berry', 'Berry']), '');
  assert.equal(search.typoCorrection('berri', ['Berry', 'Berri']), '');
  assert.equal(search.typoCorrection('cherr', ['Cherry', 'Cherri']), '');
  assert.equal(search.score('Amnesia Haze', 'amneisa haez'), 0);
});

for (const query of ['g13', 'G-13', 'g 13']) {
  test(`${query} puts the exact strain before popular crosses without collapsing them`, () => {
    const results = search.suggest(query, candidates);
    assert.equal(results[0].item.name, 'G-13');
    assert.equal(results[0].exact, true);
    assert.equal(results.filter(row => row.exact).length, 1);
    for (const name of names) assert.ok(results.some(row => row.item.name === name));
    assert.equal(search.score('G14', query), 0);
    assert.equal(search.score('B13', query), 0);
  });
}

test('other short alphanumeric names work across punctuation while suffixes stay distinct', () => {
  for (const variants of [['AK-47', 'ak47', 'AK 47'], ['RS-11', 'rs11', 'RS 11'], ['MAC-1', 'MAC1', 'MAC 1']]) {
    assert.equal(new Set(variants.map(search.normalise)).size, 1);
  }
  assert.notEqual(search.normalise('G13 Haze'), search.normalise('G-13'));
  assert.notEqual(search.normalise('G13 x AMG Haze'), search.normalise('G-13'));
  assert.equal(search.normalise('The Hague'), search.normalise('Den Haag'));
});

test('exact cities and shops lead partial growers and strains in every shared suggestion list', () => {
  const entities = search.entities({cities:[{name:'Amsterdam'}], growers:[{name:'Amsterdam Exotics'}], strains:[{name:'Amsterdam Haze',shop_count:999}]});
  assert.equal(search.suggest('Amsterdam', entities)[0].item.kind, 'city');
  const shops = search.entities({shops:[{name:'Katsu',city:'Amsterdam'}],growers:[{name:'Katsu Seeds'}]});
  assert.equal(search.suggest('Katsu', shops)[0].item.kind, 'shop');
});

test('all G13 spellings select the same exact offerings in the shipped snapshot', () => {
  const rows = JSON.parse(fs.readFileSync(require.resolve('../database/active_offerings.json'), 'utf8'));
  const offerings = Array.isArray(rows) ? rows : rows.rows || rows.offerings;
  const matches = query => offerings.filter(row => search.normalise(row.strain_name || row.strain_name_normalised) === search.normalise(query))
    .map(row => `${row.shop_id}|${row.strain_name}|${row.price_amount}`).sort();
  assert.ok(matches('G-13').length > 0);
  assert.deepEqual(matches('g13'), matches('G-13'));
  assert.deepEqual(matches('g 13'), matches('G-13'));
});
