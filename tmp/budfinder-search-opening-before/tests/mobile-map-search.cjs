/* Mobile search must follow the visual viewport, rather than the screen behind a keyboard. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const shipped = source.match(/^    function syncMobileSearchViewport\([^]*?^    }/m)[0];

function harness({viewport = {height: 360, offsetTop: 50, scale: 1}, compact = true} = {}) {
  // Model a phone whose visible height has shrunk while its layout stays tall.
  const input = {};
  const route = {open: false};
  const properties = new Map();
  const classes = new Set();
  const document = {
    activeElement: input,
    documentElement: {style: {setProperty: (name, value) => properties.set(name, value)}},
    body: {classList: {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }}},
    getElementById: id => id === 'destination-search' ? input : id === 'route-tools-dropdown' ? route : null
  };
  const context = vm.createContext({document, window: {visualViewport: viewport}, controlsVisible: true,
    controlsCollapsed: false, isCompactMobileLayout: () => compact, getViewportSize: () => ({height: 844})});
  vm.runInContext(shipped, context);
  return {context, document, input, route, properties, classes};
}

test('focused phone search uses the area above the keyboard, including browser panning', () => {
  const h = harness();
  h.context.syncMobileSearchViewport();
  assert.equal(h.properties.get('--app-search-visible-height'), '360px');
  assert.equal(h.properties.get('--app-search-visible-top'), '50px');
  assert.equal(h.classes.has('mobile-map-search-active'), true);
  // A further keyboard resize must update the existing panel without losing search focus.
  h.context.window.visualViewport.height = 280;
  h.context.syncMobileSearchViewport();
  assert.equal(h.properties.get('--app-search-visible-height'), '280px');
});

test('blur, route planning and closed panels restore the normal map layout', () => {
  const h = harness();
  h.context.syncMobileSearchViewport();
  h.document.activeElement = null;
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'), false);
  h.document.activeElement = h.input;
  h.context.controlsVisible = false;
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'), false);
  h.route.open = true;
  h.context.controlsVisible = true;
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'), false);
});

test('desktop searches and pinch zoom retain their existing layout', () => {
  for (const options of [{compact: false}, {viewport: {height: 360, offsetTop: 0, scale: 1.5}}]) {
    const h = harness(options); h.context.syncMobileSearchViewport();
    assert.equal(h.classes.has('mobile-map-search-active'), false);
  }
});

test('browsers without the Visual Viewport API still use the measured viewport', () => {
  const h = harness({viewport: null}); h.context.syncMobileSearchViewport();
  assert.equal(h.properties.get('--app-search-visible-height'), '844px');
  assert.equal(h.properties.get('--app-search-visible-top'), '0px');
});

test('Clear all filters is present once in the on-screen map action bar', () => {
  const html = fs.readFileSync(require.resolve('../map.html'), 'utf8');
  const dock = html.slice(html.indexOf('<div id="ui-toggles"'), html.indexOf('<!-- Mobile shop details'));
  assert.match(dock, /id="clear-map-filters"[^>]+aria-label="Clear all filters"/);
  assert.equal((html.match(/id="clear-map-filters"/g) || []).length, 1);
});
