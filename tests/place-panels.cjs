/* Exercise the actual marker markup for shops, other places and areas. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../styles/budfinder-map-controls.css'), 'utf8');
const start = source.indexOf('        const popupStrainsHtml = isCoffeeShop');
const end = source.indexOf('        const marker = L.marker', start);
const markupStart = source.indexOf('          .bindPopup(', end) + '          .bindPopup('.length;
const markupEnd = source.indexOf(',\n            { autoPan:', markupStart);
assert.ok(start >= 0 && end > start && markupEnd > markupStart, 'Marker renderer is present');
const build = `${source.slice(start, end)}\nconst result = ${source.slice(markupStart, markupEnd)}; result;`;

function render({coffeeshop = false, area = false, website = '', officialWebsite = '', sourceUrl = ''} = {}) {
  const loc = {name: 'Example', coords: [52.37, 4.89], website, official_website: officialWebsite};
  const context = vm.createContext({loc, i: 0, isCoffeeShop: coffeeshop, isArea: area, logoHtml: '',
    popupStrainContainerId: () => 'menu-items', popupCardId: () => 'popup-card', dbRouteLinksEnabled: false,
    window: {BudfinderData: require('../scripts/budfinder-data.js')}, getShopSourceMeta: () => ({shop_url: sourceUrl}),
    favorites: [], renderStars: () => '', escapeHtml: String, escapeHtmlAttr: String});
  return vm.runInContext(build, context);
}

test('route actions and clearly labelled links come before coffeeshop menu rows', () => {
  const html = render({coffeeshop: true, officialWebsite: 'https://shop.example', sourceUrl: 'https://coffeeshopmenus.org/menu'});
  assert.ok(html.indexOf('Add Stop') < html.indexOf('id="menu-items"'));
  assert.ok(html.indexOf('Set route start') < html.indexOf('id="menu-items"'));
  assert.ok(html.indexOf('Official shop website') < html.indexOf('id="menu-items"'));
  assert.ok(html.indexOf('Menu source') < html.indexOf('id="menu-items"'));
  assert.ok(html.indexOf('Street View') < html.indexOf('id="menu-items"'));
  assert.ok(html.indexOf('visited-checkbox') < html.indexOf('id="menu-items"'));
  assert.ok(html.indexOf('rating-stars') < html.indexOf('id="menu-items"'));
  assert.doesNotMatch(html, /popup-more-options|More shop options/);
});

test('other places keep their route actions and web links without a strain menu', () => {
  const html = render({website: 'https://example.org'});
  assert.match(html, /Add Stop/);
  assert.match(html, /External website/);
  assert.match(html, /Street View/);
  assert.match(html, /visited-checkbox/);
  assert.match(html, /rating-stars/);
  assert.doesNotMatch(html, /popup-more-options|More place options/);
  assert.doesNotMatch(html, /id="menu-items"/);
  assert.match(css, /\.mobile-shop-sheet\.is-place-panel[^}]*width:\s*min\(340px/);
});

test('area anchors retain nearby search and links without empty personal options', () => {
  const html = render({area: true});
  assert.match(html, /Show nearby coffeeshops/);
  assert.match(html, /Street View/);
  assert.doesNotMatch(html, /Add Stop|popup-more-options/);
});
