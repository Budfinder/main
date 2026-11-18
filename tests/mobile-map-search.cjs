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
    documentElement: {clientWidth:390,clientHeight:844,style: {setProperty: (name, value) => properties.set(name, value)}},
    body: {classList: {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }}},
    getElementById: id => id === 'destination-search' ? input : id === 'route-tools-dropdown' ? route : null
  };
  const context = vm.createContext({document, window: {visualViewport: viewport,innerWidth:390,innerHeight:844}, controlsVisible: true,
    mobileSearchUnoccludedHeight:0,mobileSearchViewportWidth:0,mobileSearchMenuOffset:280,
    controlsCollapsed: false, isCompactMobileLayout: () => compact, getViewportSize: () => ({height: 844,width:390})});
  vm.runInContext(shipped, context);
  return {context, document, input, route, properties, classes};
}

test('focused phone search uses the area above the keyboard, including browser panning', () => {
  const h = harness();
  h.context.syncMobileSearchViewport();
  assert.equal(h.properties.get('--app-search-visible-height'), '360px');
  assert.equal(h.properties.get('--app-search-visible-top'), '50px');
  assert.equal(h.properties.get('--app-search-menu-top'), '190px'); // 50px viewport offset + 140px
  assert.equal(h.classes.has('mobile-map-search-active'), true);
  // A further keyboard resize must update the existing panel without losing search focus.
  h.context.window.visualViewport.height = 280;
  h.context.syncMobileSearchViewport();
  assert.equal(h.properties.get('--app-search-visible-height'), '280px');
});

test('input focus without an open keyboard never hides the normal map menu', () => {
  const h=harness({viewport:{height:844,offsetTop:0,scale:1}});
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'),false);
  // Browser toolbars changing size are not a keyboard either.
  h.context.window.visualViewport.height=760;
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'),false);
});

test('the keyboard layout closes when the keyboard disappears even if the input keeps focus', () => {
  const h=harness();h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'),true);
  h.context.window.visualViewport.height=844;
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'),false);
});

test('Android keyboard resizing both viewports is detected from the pre-focus height', () => {
  const h=harness({viewport:{height:844,offsetTop:0,scale:1}});
  h.document.activeElement=null;h.context.syncMobileSearchViewport();
  h.document.activeElement=h.input;
  h.context.window.visualViewport.height=360;
  h.context.window.innerHeight=360;h.document.documentElement.clientHeight=360;
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'),true);
});

test('rotating a phone resets the keyboard baseline instead of hiding the menu', () => {
  const h=harness({viewport:{height:844,offsetTop:0,scale:1}});h.context.syncMobileSearchViewport();
  h.document.documentElement.clientWidth=844;h.document.documentElement.clientHeight=390;
  h.context.window.innerWidth=844;h.context.window.innerHeight=390;
  h.context.window.visualViewport.height=390;
  h.context.syncMobileSearchViewport();
  assert.equal(h.classes.has('mobile-map-search-active'),false);
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
  assert.equal(h.classes.has('mobile-map-search-active'),false);
});

test('Clear all filters is present once in the on-screen map action bar', () => {
  const html = fs.readFileSync(require.resolve('../map.html'), 'utf8');
  const dock = html.slice(html.indexOf('<div id="ui-toggles"'), html.indexOf('<dialog id="mobile-shop-sheet"'));
  assert.match(dock, /id="clear-map-filters"[^>]+aria-label="Clear all filters"/);
  assert.equal((html.match(/id="clear-map-filters"/g) || []).length, 1);
});

// Leave room for suggestions while keeping the sheet near its original position.
test('keyboard lifts the menu slightly and leaves room for suggestions', () => {
  const h = harness({viewport:{height:420,offsetTop:0,scale:1}});
  h.context.mobileSearchMenuOffset = 260;
  h.context.syncMobileSearchViewport();
  assert.equal(h.properties.get('--app-search-menu-top'), '160px');
  h.context.window.visualViewport.height = 300;
  h.context.syncMobileSearchViewport();
  assert.equal(h.properties.get('--app-search-menu-top'), '80px');
});
