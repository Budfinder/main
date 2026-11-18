/* Check that the map reserves space for the real navigation and action-bar sizes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../styles/budfinder-map-controls.css'), 'utf8');
const shipped = source.match(/^    function syncDesktopTogglePosition\([^]*?^    }/m)[0];

// Model the measured bars without tying the test to a specific phone or font size.
function harness({ compact, height, navigation, actionHeight }) {
  const properties = new Map();
  const dock = { style: { bottom: '300px' }, getBoundingClientRect: () => ({ height: actionHeight }) };
  const document = {
    body: { style: { setProperty: (name, value) => properties.set(name, value) } },
    documentElement: { clientHeight: height },
    getElementById: id => id === 'ui-toggles' ? dock : null,
    querySelector: selector => selector === '.app-mode-toggle' ? { getBoundingClientRect: () => navigation } : null
  };
  const context = vm.createContext({ document, window: { innerHeight: height }, isCompactMobileLayout: () => compact });
  vm.runInContext(shipped, context);
  context.syncDesktopTogglePosition();
  return { properties, dock };
}

test('the shop panel and desktop actions fit between the navigation bars', () => {
  const { properties, dock } = harness({ compact: false, height: 600, navigation: { top: 24, bottom: 78, height: 54 }, actionHeight: 62 });
  assert.equal(dock.style.bottom, '');
  assert.equal(properties.get('--app-map-top-clearance'), '90px');
  assert.equal(properties.get('--app-map-action-height'), '62px');
  assert.match(css, /body:not\(\.compact-layout\) #ui-toggles\s*\{[^}]*bottom:\s*24px/);
  assert.match(css, /body:not\(\.compact-layout\) \.mobile-shop-sheet\s*\{[^}]*--app-map-top-clearance[^}]*--app-map-action-height/);
});

test('phone spacing follows a taller navigation and a wrapped five-button action bar', () => {
  const { properties } = harness({ compact: true, height: 700, navigation: { top: 606, bottom: 690, height: 84 }, actionHeight: 76 });
  assert.equal(properties.get('--app-mobile-nav-clearance'), '94px');
  assert.equal(properties.get('--app-map-action-height'), '76px');
  assert.match(css, /body\.compact-layout #ui-toggles\s*\{[^}]*--app-mobile-nav-clearance\) \+ 8px/);
  assert.match(css, /body\.compact-layout #instructions\s*\{[^}]*--app-map-action-height/);
});

test('a temporarily hidden bar does not replace a measured size with zero', () => {
  const { properties } = harness({ compact: true, height: 700, navigation: { top: 0, bottom: 0, height: 0 }, actionHeight: 0 });
  assert.equal(properties.has('--app-mobile-nav-clearance'), false);
  assert.equal(properties.has('--app-map-action-height'), false);
  assert.match(source, /new ResizeObserver\(\(\) => scheduleTogglePositionSync\(\)\)/);
});
