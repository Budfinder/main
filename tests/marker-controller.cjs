const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../scripts/budfinder-marker-layout.js'), 'utf8');

// Model Leaflet's retained marker element separately from its replaceable
// children. This catches controller bugs that pure packing tests cannot see.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.children = [];
    this.parentNode = null;
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.measurements = 0;
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.hidden = false;
    this.classList = {
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
      }
    };
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) {
    if (child.parentNode) {
      const siblings = child.parentNode.children;
      siblings.splice(siblings.indexOf(child), 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  prepend(child) {
    this.appendChild(child);
    this.children.unshift(this.children.pop());
  }
  replaceChildren(...children) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    children.forEach(child => this.appendChild(child));
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim());
    const results = [];
    const visit = element => element.children.forEach(child => {
      if (selectors.some(value => value.startsWith('.') && !value.includes(' ') &&
          child.className.split(/\s+/).includes(value.slice(1)))) results.push(child);
      visit(child);
    });
    visit(this);
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() {
    this.measurements += 1;
    return { left: 0, top: 0, right: parseFloat(this.style.width) || 44,
      bottom: parseFloat(this.style.height) || 44 };
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  press(key) {
    const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    (this.listeners.get('keydown') || []).forEach(callback => callback(event));
    return event;
  }
}

function marker(id, x, y) {
  const icon = new Element();
  icon.appendChild(new Element());
  const coords = Object.freeze({ lat: y, lng: x });
  const popup = {
    options: { offset: [0, 7], autoPan: true },
    content: 'Checking menu matches...',
    updates: [],
    update() { this.content = 'Checking menu matches...'; },
    setLatLng(value) {
      this.coords = value;
      this.updates.push({ offset: Array.from(this.options.offset), autoPan: this.options.autoPan });
    }
  };
  return {
    id, icon, coords, popup, popupOpen: false, clicks: 0,
    options: { icon: { options: { iconSize: [44, 44], popupAnchor: [2, -44] } } },
    getElement() { return this.icon; },
    getLatLng() { return this.coords; },
    getPopup() { return this.popup; },
    isPopupOpen() { return this.popupOpen; },
    setZIndexOffset(value) { this.zIndexOffset = value; },
    fire(name) { assert.equal(name, 'click'); this.clicks += 1; }
  };
}

function harness(markers) {
  let nextFrame = 1;
  const frames = new Map();
  const events = new Map();
  const container = new Element();
  const map = {
    panX: 0, panY: 0, zoom: 12,
    getSize: () => ({ x: 360, y: 480 }),
    getZoom() { return this.zoom; },
    getContainer: () => container,
    project(coords, zoom) { const factor = 2 ** (zoom - 12); return { x: coords.lng * factor, y: coords.lat * factor }; },
    getPixelOrigin: () => ({ x: 0, y: 0 }),
    layerPointToContainerPoint(point) { return { x: point.x + this.panX, y: point.y + this.panY }; },
    latLngToContainerPoint(coords) {
      const point = this.project(coords, this.zoom);
      return { x: Math.round(point.x) + this.panX, y: Math.round(point.y) + this.panY };
    },
    on(names, callback) {
      names.split(' ').forEach(name => {
        if (!events.has(name)) events.set(name, new Set());
        events.get(name).add(callback);
      });
    },
    off(names, callback) { names.split(' ').forEach(name => events.get(name)?.delete(callback)); },
    once(name, callback) {
      const wrapped = () => { this.off(name, wrapped); callback(); };
      this.on(name, wrapped);
    },
    emit(name) { [...events.get(name) || []].forEach(callback => callback()); }
  };
  const sandbox = {
    module: { exports: {} },
    document: { createElement: tag => new Element(tag) },
    requestAnimationFrame(callback) { const frame = nextFrame++; frames.set(frame, callback); return frame; },
    cancelAnimationFrame(frame) { frames.delete(frame); }
  };
  vm.runInNewContext(source, sandbox, { filename: 'budfinder-marker-layout.js' });
  const entries = markers.map(item => ({ marker: item, id: item.id, name: `Place ${item.id}`, visible: true }));
  const controller = sandbox.module.exports.attach(map, () => entries);
  return {
    map, entries, controller, container,
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback());
    },
    pendingFrames: () => frames.size
  };
}

test('a reused Leaflet DIV keeps one Space action after repeated icon content replacements', () => {
  const place = marker('a', 120, 160);
  const app = harness([place]);
  app.flush();
  for (let replacement = 0; replacement < 5; replacement += 1) {
    // Leaflet DivIcon.createIcon reuses the DIV while setIcon replaces its HTML.
    place.icon.replaceChildren(new Element());
    app.controller.schedule();
    app.flush();
    const before = place.clicks;
    assert.equal(place.icon.press(' ').defaultPrevented, true);
    assert.equal(place.clicks, before + 1, 'One key press must produce one click');
    assert.equal(place.icon.querySelectorAll('.bf-marker-content').length, 1);
  }
  assert.equal(place.icon.listeners.get('keydown').length, 1);
  assert.equal(place.icon.press('Enter').defaultPrevented, false, 'Leaflet retains its Enter behavior');
});

test('fresh offscreen icons are wrapped and scaled before entering the viewport', () => {
  const place = marker('a', -200, 100);
  const app = harness([place]);
  app.flush();
  const content = place.icon.querySelector('.bf-marker-content');
  assert.ok(content, 'Offscreen content must not retain its original unscaled size');
  assert.equal(content.style.width, '44px');
  assert.equal(content.style.height, '44px');
  assert.equal(content.style.transform, 'scale(0.5)');
  assert.equal(place.icon.style.width, '22px');
  assert.equal(place.icon.tabIndex, -1);
  assert.equal(app.container.dataset.visibleLogoCount, '0');
  app.map.panX = 300;
  app.map.emit('moveend');
  app.flush();
  assert.equal(place.icon.querySelector('.bf-marker-content'), content);
  assert.equal(place.icon.tabIndex, 0);
  assert.equal(place.icon.attributes['aria-label'], 'Place a');
  assert.equal(app.container.dataset.visibleLogoCount, '1');
  assert.deepEqual(place.coords, { lat: 100, lng: -200 });
});

test('panning a displaced marker offscreen resets its popup offset without auto-panning back', () => {
  const first = marker('a', 120, 160);
  const displaced = marker('b', 120, 160);
  const app = harness([first, displaced]);
  app.flush();
  assert.notEqual(displaced.icon.dataset.markerOffset, '0,0');
  const previousOffset = Array.from(displaced.popup.options.offset);
  displaced.popupOpen = true;
  app.map.panX = -1000;
  app.map.emit('moveend');
  app.flush();
  assert.equal(displaced.icon.dataset.markerOffset, '0,0');
  assert.equal(displaced.icon.style.marginLeft, '-11px');
  assert.equal(displaced.icon.style.marginTop, '-11px');
  assert.equal(displaced.icon.querySelector('.bf-marker-leader').hidden, true);
  assert.equal(displaced.icon.querySelector('.bf-marker-point').hidden, true);
  assert.notDeepEqual(Array.from(displaced.popup.options.offset), previousOffset);
  // Leaflet adds the icon's [2, -44] anchor to this offset, leaving [0, -14].
  assert.deepEqual(Array.from(displaced.popup.options.offset), [-2, 30]);
  assert.deepEqual(displaced.popup.updates.at(-1), { offset: [-2, 30], autoPan: false });
  assert.equal(displaced.popup.options.autoPan, true, 'Original popup behavior must be restored');
  assert.deepEqual(displaced.coords, { lat: 160, lng: 120 });
});

test('unloading a map cancels pending layout and disables its controller keyboard action', () => {
  const place = marker('a', 120, 160);
  const app = harness([place]);
  app.flush();
  app.controller.schedule();
  assert.equal(app.pendingFrames(), 1);
  app.map.emit('unload');
  assert.equal(app.pendingFrames(), 0);
  app.map.emit('moveend');
  app.controller.schedule();
  assert.equal(app.pendingFrames(), 0);
  place.icon.press(' ');
  assert.equal(place.clicks, 0);
});

test('zooming and panning preserve loaded popup menus and saved-state controls', () => {
  const place = marker('a', 120, 160);
  const app = harness([place]);
  app.flush();
  place.popupOpen = true;
  place.popup.content = 'Strawberry Banana €13/g · Remove saved shop';
  app.map.zoom = 15;
  app.map.emit('zoomend');
  app.flush();
  app.map.panX = 20;
  app.map.emit('moveend');
  app.flush();
  assert.equal(place.popup.content, 'Strawberry Banana €13/g · Remove saved shop');
  assert.equal(place.popup.coords, place.coords, 'Popup stays bound to the true shop location');
  assert.equal(place.popup.updates.length, 2);
});

test('resizing allows an open popup to pan back into the smaller viewport', () => {
  const place = marker('a', 120, 160);
  const app = harness([place]);
  app.flush();
  place.popupOpen = true;
  app.map.panX = -1000;
  app.map.emit('resize');
  app.flush();
  assert.equal(place.popup.updates.at(-1).autoPan, true);
});

function renderedBox(app, place) {
  const anchor = app.map.latLngToContainerPoint(place.coords);
  return { left: anchor.x + parseFloat(place.icon.style.marginLeft),
    top: anchor.y + parseFloat(place.icon.style.marginTop),
    width: parseFloat(place.icon.style.width), height: parseFloat(place.icon.style.height) };
}

test('323 coincident logos shrink as one stable layout through world zoom without merging or repacking', () => {
  const places = Array.from({ length: 323 }, (_, id) => marker(String(id), 180.25, 240.75));
  const app = harness(places);
  app.map.zoom = 11;
  app.entries[0].selected = true;
  app.flush();
  const builds = app.container.dataset.markerLayoutBuilds;
  let previousBoxes = places.map(place => renderedBox(app, place));
  for (let zoom = 10; zoom >= 0; zoom -= 1) {
    app.map.zoom = zoom;
    app.map.emit('zoomend');
    app.flush();
    const boxes = places.map(place => renderedBox(app, place));
    boxes.forEach((box, i) => {
      const previous = previousBoxes[i];
      assert.ok(Math.abs(box.width * 2 - previous.width) < 1e-9);
      assert.ok(Math.abs(box.left * 2 - previous.left) < 1e-9, 'Fractional anchors scale without pixel-rounding collisions');
      assert.ok(Math.abs(box.top * 2 - previous.top) < 1e-9);
      boxes.slice(i + 1).forEach(other => {
        assert.ok(box.left + box.width <= other.left + 1e-9 || other.left + other.width <= box.left + 1e-9 ||
          box.top + box.height <= other.top + 1e-9 || other.top + other.height <= box.top + 1e-9);
      });
      assert.equal(places[i].icon.querySelector('.bf-marker-leader').hidden, true);
      assert.equal(places[i].icon.dataset.placeId, String(i));
      assert.deepEqual(places[i].coords, { lat: 240.75, lng: 180.25 });
    });
    assert.equal(app.container.dataset.markerLayoutBuilds, builds);
    previousBoxes = boxes;
  }
  assert.ok(previousBoxes[0].width < 0.01, 'Selected logos must also shrink, without a fixed-size halo');
});

test('distant pans and resizes reuse positions with no marker layout measurements', () => {
  const places = [marker('a', 120, 160), marker('b', 120, 160), marker('c', 5000, 2000)];
  const app = harness(places);
  app.map.zoom = 9;
  app.flush();
  const builds = app.container.dataset.markerLayoutBuilds;
  const before = renderedBox(app, places[1]);
  app.map.panX = 50;
  app.map.panY = 25;
  app.map.emit('moveend');
  app.flush();
  const after = renderedBox(app, places[1]);
  assert.equal(after.left - before.left, 50);
  assert.equal(after.top - before.top, 25);
  app.map.emit('resize');
  app.flush();
  assert.equal(app.container.dataset.markerLayoutBuilds, builds);
  for (const place of places) assert.equal(place.icon.querySelector('.bf-marker-content').measurements, 0);
});

test('fractional pinch zooms shrink logos during the gesture and coalesce work per frame', () => {
  const place = marker('a', 120, 160);
  const app = harness([place]);
  app.map.zoom = 11;
  app.flush();
  const before = renderedBox(app, place).width;
  const builds = app.container.dataset.markerLayoutBuilds;
  app.map.zoom = 10.75;
  app.map.emit('zoom');
  app.map.zoom = 10.5;
  app.map.emit('zoom');
  assert.equal(app.pendingFrames(), 1);
  app.flush();
  assert.ok(Math.abs(renderedBox(app, place).width / before - Math.SQRT1_2) < 1e-9);
  assert.equal(app.container.dataset.markerLayoutBuilds, builds);
});

test('distant layout responds to filters and changed icon bounds, retaining keyboard and popup behavior', () => {
  const places = [marker('a', 120, 160), marker('b', 120, 160)];
  const app = harness(places);
  app.map.zoom = 9;
  app.flush();
  app.entries[1].visible = false;
  app.controller.schedule();
  app.flush();
  assert.equal(app.container.dataset.markerLayoutBuilds, '2');
  app.entries[1].visible = true;
  places[1].options.icon.options.iconSize = [44, 80];
  places[1].icon.replaceChildren(new Element());
  app.controller.schedule();
  app.flush();
  assert.equal(app.container.dataset.markerLayoutBuilds, '3');
  assert.ok(renderedBox(app, places[1]).height > renderedBox(app, places[0]).height);
  places[1].icon.press(' ');
  assert.equal(places[1].clicks, 1);
  places[1].popupOpen = true;
  places[1].popup.content = 'Loaded menu';
  app.map.zoom = 13;
  app.map.emit('zoomend');
  app.flush();
  assert.equal(app.container.dataset.markerLayoutMode, 'spaced');
  assert.equal(places[1].popup.content, 'Loaded menu');
});
