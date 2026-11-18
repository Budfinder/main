/* A selected shop can be dismissed without clearing a search or saved route. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../map.html'), 'utf8');
const shipped = name => {
  const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
  assert.ok(match, name);
  return match[0];
};

function harness() {
  // Model a flight which finishes as it is stopped, as Leaflet can do.
  let pendingMove = null;
  let popupOpened = 0;
  let popupClosed = 0;
  let persisted = 0;
  const elements = new Map();
  for (const id of ['distance-info']) {
    elements.set(id, { style: {}, classList: { toggle() {} }, setAttribute() {} });
  }
  const destination = { value: '0', events: [], dispatchEvent(event) { this.events.push(event.type); } };
  elements.set('destination-select', destination);
  const map = {
    getZoom: () => 16,
    once(_event, callback) { pendingMove = callback; },
    flyTo() {},
    stop() { if (pendingMove) { const callback = pendingMove; pendingMove = null; callback(); } },
    closePopup() { popupClosed += 1; }
  };
  const route = { stops: [{ ref: 'saved-shop' }] };
  const context = vm.createContext({
    Event: class Event { constructor(type) { this.type = type; } },
    document: { getElementById: id => elements.get(id) || null, body: { classList: { toggle() {} } } },
    map, mapFocusRequestId: 0, activePopupLocationIndex: 0, lastDestinationSelectValue: '0',
    locations: [{ name: 'Alpha', coords: [52.37, 4.9] }], markers: [{ openPopup() { popupOpened += 1; } }],
    journeyPlanner: route, strainFilterText: 'Gelato', lastPosition: null,
    isCompactMobileLayout: () => true, isCompactLandscapeLayout: () => false,
    getViewportAdjustedCenter: coords => coords, getMeasuredMapRect: () => ({ height: 500 }),
    L: { point: () => ({}) },
    rememberMapFilterState() {}, clearRouteUi() {}, refreshDestinationCards() {}, refreshSelectedMarkerIcons() {},
    syncClearSelectionToggle() {}, schedulePersistMapSession() { persisted += 1; },
    updateControlsSummary() {}
  });
  // Avoid Leaflet projection in this test while retaining the real asynchronous callback.
  context.isCompactMobileLayout = () => false;
  vm.runInContext(['getSelectedDestinationIndex', 'updateDistanceInfo', 'focusMapOnCoords', 'clearSelectedPlace'].map(shipped).join('\n'), context);
  return { context, elements, destination, route, popupOpened: () => popupOpened, popupClosed: () => popupClosed, persisted: () => persisted };
}

test('clearing a selection cancels the pending popup and preserves filters and stops', () => {
  const h = harness();
  h.context.focusMapOnCoords([52.37, 4.9], { popupIndex: 0 });
  assert.equal(h.context.clearSelectedPlace(), true);
  assert.equal(h.destination.value, '');
  assert.deepEqual(h.destination.events, ['change']);
  assert.equal(h.popupOpened(), 0);
  assert.equal(h.popupClosed(), 1);
  assert.equal(h.context.strainFilterText, 'Gelato');
  assert.equal(h.context.journeyPlanner, h.route);
  assert.equal(h.route.stops.length, 1);
  assert.equal(h.persisted(), 1);
  assert.equal(h.context.clearSelectedPlace(), false);
});

test('no selected-place box or map space for it remains, while the route panel can clear a selection', () => {
  assert.doesNotMatch(html, /id="selection-card"/);
  assert.doesNotMatch(source, /mobile-selection-visible|selection-card-collapsed/);
  assert.match(html, /id="clear-route-focus-btn"[^>]*>Clear selected place/);
  assert.match(source, /getElementById\('clear-route-focus-btn'\)\.addEventListener\('click', clearSelectedPlace\)/);
});
