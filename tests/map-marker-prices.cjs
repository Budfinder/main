const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../scripts/budfinder-map.js'), 'utf8');

function shippedFunction(name) {
  const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
  assert.ok(match, `Missing shipped map function: ${name}`);
  return match[0];
}

// Run the shipped price updater, selector and icon renderers together. Only
// Leaflet, category classification and unrelated highlight effects are mocked.
const functions = [
  'escapeHtml', 'escapeHtmlAttr', 'getMarkerPriceLabel', 'createLogoIcon',
  'createSimpleShopIcon', 'createCategoryFallbackIcon', 'chooseMarkerIcon',
  'syncMarkerPriceDisplay'
].map(shippedFunction).join('\n');

const kinds = [
  { kind: 'shop logo', coffee: true, logo: 'shop.png', className: 'shop-marker-icon' },
  { kind: 'shop without a logo', coffee: true, logo: '', className: 'simple-shop-marker-icon' },
  { kind: 'branded non-shop location', coffee: false, logo: 'hotel.png', className: 'shop-marker-icon' },
  { kind: 'category fallback pin', coffee: false, logo: '', className: 'fallback-location-marker-icon fallback-location-marker-hotel' }
];

function harness(kind, initialLabel = '') {
  const loc = { name: 'Test place', category: 'hotel', db_shop_id: 'shop-1', ...kind };
  const coords = Object.freeze([52.37, 4.89]);
  const popup = Object.freeze({ content: 'Existing menu and actions' });
  const marker = {
    coords, popup, icon: null, iconUpdates: 0, tooltip: null, tooltipRemovals: 0,
    _usesLogoIcon: kind.className === 'shop-marker-icon',
    _priceLabelText: initialLabel,
    setIcon(icon) { this.icon = icon; this.iconUpdates += 1; },
    getTooltip() { return this.tooltip; },
    unbindTooltip() { this.tooltip = null; this.tooltipRemovals += 1; },
    bindTooltip() { assert.fail('Prices must stay inside measured icon content'); }
  };
  const highlights = [];
  const tones = [];
  const prices = new Map([['shop-1', initialLabel || '€10/g']]);
  const sandbox = {
    markers: [marker], locations: [loc], LOGO_MARKER_SIZE: 44,
    strainFilterText: 'Test strain', strainPriceByShopId: prices, strainPriceByNameCity: null,
    L: { divIcon: options => ({ options }) },
    logoCandidates: logo => logo ? [logo] : [],
    isCoffeeShopLocation: place => place.coffee,
    getLocationFallbackCategory: place => place.category,
    normaliseFallbackCategory: category => category,
    getFallbackCategoryLabel: () => 'Hotel',
    getCategoryFallbackSvg: () => '<path d="M0 0" />',
    categoryIcons: {}, defaultIcon: { options: { className: 'default-pin' } },
    syncMarkerHighlightState: (...args) => highlights.push(args),
    syncMarkerValueTone: (...args) => tones.push(args)
  };
  vm.createContext(sandbox);
  vm.runInContext(functions, sandbox, { filename: 'shipped-map-marker-functions.js' });
  sandbox.categoryIcons.hotel = sandbox.createCategoryFallbackIcon('hotel');
  marker.icon = sandbox.chooseMarkerIcon(loc, initialLabel);
  return { marker, coords, popup, prices, highlights, tones,
    sync: (visible = true, showPrice = true) => sandbox.syncMarkerPriceDisplay(0, visible, showPrice) };
}

for (const kind of kinds) {
  test(`${kind.kind}: changed prices regenerate the same icon kind and remove legacy tooltips`, () => {
    const app = harness(kind);
    app.marker.tooltip = { text: 'Detached old price' };
    app.sync();
    assert.equal(app.marker.iconUpdates, 1);
    assert.equal(app.marker.icon.options.className, kind.className);
    assert.match(app.marker.icon.options.html, /€10\/g/);
    assert.equal(app.marker._priceLabelText, '€10/g');
    assert.equal(app.marker.tooltip, null);
    assert.equal(app.marker.tooltipRemovals, 1);

    app.prices.set('shop-1', '€12.50/g');
    app.sync();
    assert.equal(app.marker.iconUpdates, 2);
    assert.equal(app.marker.icon.options.className, kind.className);
    assert.match(app.marker.icon.options.html, /€12\.50\/g/);
    assert.doesNotMatch(app.marker.icon.options.html, /€10\/g/);
    assert.equal(app.marker.coords, app.coords, 'Price updates retain the real coordinates');
    assert.equal(app.marker.popup, app.popup, 'Existing popup actions are retained');
    assert.deepEqual(app.highlights, [[0, true], [0, true]]);
    assert.deepEqual(app.tones, [[0], [0]]);
  });
}

test('unchanged labels avoid setIcon while still removing an existing legacy tooltip', () => {
  for (const kind of kinds) {
    const app = harness(kind, '€10/g');
    const originalIcon = app.marker.icon;
    app.marker.tooltip = { text: '€10/g' };
    app.sync();
    app.sync();
    assert.equal(app.marker.iconUpdates, 0, kind.kind);
    assert.equal(app.marker.icon, originalIcon, kind.kind);
    assert.equal(app.marker.tooltip, null, kind.kind);
    assert.equal(app.marker.tooltipRemovals, 1, kind.kind);
    assert.equal(app.highlights.length, 2, 'Unchanged prices still refresh highlighting');
  }
});

test('filtering out a marker or suppressing prices clears its badge and restores it on return', () => {
  for (const kind of kinds) {
    for (const visibility of [[false, true], [true, false]]) {
      const app = harness(kind, '€10/g');
      app.sync(...visibility);
      assert.equal(app.marker._priceLabelText, '', kind.kind);
      assert.equal(app.marker.icon.options.className, kind.className, kind.kind);
      assert.doesNotMatch(app.marker.icon.options.html, /€10\/g/, kind.kind);
      app.sync(...visibility);
      assert.equal(app.marker.iconUpdates, 1, 'Repeated cleared labels do not replace the icon');
      app.sync(true, true);
      assert.match(app.marker.icon.options.html, /€10\/g/, kind.kind);
      assert.equal(app.marker.iconUpdates, 2, kind.kind);
    }
  }
});

test('all icon renderers escape price text before placing it into marker HTML', () => {
  for (const kind of kinds) {
    const app = harness(kind);
    app.prices.set('shop-1', '<bad-price> & "unknown"');
    app.sync();
    assert.doesNotMatch(app.marker.icon.options.html, /<bad-price>/, kind.kind);
    assert.match(app.marker.icon.options.html, /&lt;bad-price&gt;/, kind.kind);
  }
});
