/* Map logos in two sizes. Every place always shows its own logo, at its real
   spot: the places that matter most right now get a full-size logo, and where
   a full logo has no room the place shows a small copy of the same logo.
   Zooming in gives more places full logos. Nothing is grouped, hidden or moved
   more than a few pixels, and there are no lines back to a pushed-away logo. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BudfinderMarkerLayout = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Below this zoom the whole marker set shrinks with the map ("scaled" mode).
  const REFERENCE_ZOOM = 12;
  // A small logo is this share of a full one: small enough to leave room,
  // big enough to recognise a shop by its colours and shape.
  const MINI_RATIO = 0.42;
  // How far a logo may move to make room, as a share of its own size. Half
  // its size keeps the logo touching the shop's real spot.
  const FULL_NUDGE = 0.5;
  const MINI_NUDGE = 1;

  // Full logos keep a recognisable size at every zoom; only as many as fit
  // without overlapping are full size, so far out that is a few per town.
  function logoSize(zoom) {
    if (zoom <= 9) return 20;
    const stops = [[9, 20], [11, 24], [13, 28], [16, 38], [18, 44]];
    for (let i = 1; i < stops.length; i += 1) {
      if (zoom <= stops[i][0]) {
        const [z0, s0] = stops[i - 1];
        const [z1, s1] = stops[i];
        return s0 + (s1 - s0) * (zoom - z0) / (z1 - z0);
      }
    }
    return 44;
  }

  // Small logos shrink with the map below town zoom, so a whole city seen
  // from far away stays a light speckle rather than a solid mass.
  function miniSize(zoom) {
    if (zoom >= 11) return logoSize(zoom) * MINI_RATIO;
    return logoSize(11) * MINI_RATIO * 2 ** ((zoom - 11) / 1.5);
  }

  function byPriority(a, b) {
    return (Number(Boolean(b.force)) - Number(Boolean(a.force))) ||
      ((b.priority || 0) - (a.priority || 0)) ||
      String(a.id).localeCompare(String(b.id), 'en');
  }

  /**
   * Decide each place's size and (tiny) offset. Points are in pixels at the
   * current zoom: { id, x, y, width, height, miniWidth?, miniHeight?,
   * priority?, force? }. `force` (the selected place) is always full size.
   * Returns, in input order: { id, x, y, width, height, dx, dy, tier }.
   */
  function layout(points, options = {}) {
    const gap = options.gap == null ? 2 : Math.max(0, options.gap);
    const miniRatio = options.miniRatio || MINI_RATIO;
    const largest = points.reduce((max, p) => Math.max(max, p.width || 0, p.height || 0), 1);
    const cell = Math.max(8, largest);
    const result = new Array(points.length);

    // Full and small logos live in separate hash grids sized to each, so a
    // crowded spot of small logos stays cheap to check.
    const makeGrid = size => ({ size, cells: new Map() });
    const fullGrid = makeGrid(cell);
    const miniGrid = makeGrid(Math.max(4, points.reduce((max, p) =>
      Math.max(max, p.miniWidth || p.width * miniRatio || 0, p.miniHeight || p.height * miniRatio || 0), 1) * 2));
    const eachCell = (grid, box, visit) => {
      const x0 = Math.floor((box.x - box.w / 2 - gap) / grid.size);
      const x1 = Math.floor((box.x + box.w / 2 + gap) / grid.size);
      const y0 = Math.floor((box.y - box.h / 2 - gap) / grid.size);
      const y1 = Math.floor((box.y + box.h / 2 + gap) / grid.size);
      for (let x = x0; x <= x1; x += 1) {
        for (let y = y0; y <= y1; y += 1) {
          if (visit(x * 1000003 + y) === false) return false;
        }
      }
      return true;
    };
    const clearIn = (grid, box, space) => eachCell(grid, box, key => (grid.cells.get(key) || []).every(other =>
      Math.abs(box.x - other.x) >= (box.w + other.w) / 2 + space ||
      Math.abs(box.y - other.y) >= (box.h + other.h) / 2 + space));
    const clear = (box, space) => clearIn(fullGrid, box, space) && clearIn(miniGrid, box, space);
    const occupy = (grid, box) => eachCell(grid, box, key => {
      if (!grid.cells.has(key)) grid.cells.set(key, []);
      grid.cells.get(key).push(box);
    });
    // The real spot first, then rings around it up to `reach` pixels.
    const findSpot = (point, w, h, reach, space, step, budget = Infinity) => {
      const home = { x: point.x, y: point.y, w, h };
      if (clear(home, space)) return home;
      let tried = 0;
      for (let radius = step; radius <= reach + 1e-9; radius += step) {
        const count = Math.max(8, Math.ceil(2 * Math.PI * radius / step));
        for (let n = 0; n < count; n += 1) {
          if (++tried > budget) return null;
          const angle = n * 2 * Math.PI / count;
          const box = { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius, w, h };
          if (clear(box, space)) return box;
        }
      }
      return null;
    };
    const record = (point, box, tier) => {
      occupy(tier === 'full' ? fullGrid : miniGrid, box);
      result[point.index] = { id: point.id, x: box.x, y: box.y, width: box.w, height: box.h,
        dx: box.x - point.x, dy: box.y - point.y, tier };
    };

    const ordered = points.map((point, index) => ({ ...point, index })).sort(byPriority);
    const small = [];
    for (const point of ordered) {
      const side = Math.min(point.width, point.height);
      const spot = findSpot(point, point.width, point.height, side * FULL_NUDGE, gap, Math.max(1, side / 6));
      if (spot) record(point, spot, 'full');
      else if (point.force) record(point, { x: point.x, y: point.y, w: point.width, h: point.height }, 'full');
      else small.push(point);
    }
    for (const point of small) {
      const w = point.miniWidth || point.width * miniRatio;
      const h = point.miniHeight || point.height * miniRatio;
      // A small logo may step just clear of a full one beside it; in the very
      // densest spots small logos overlap each other rather than drift away.
      const reach = Math.max(w, h) * MINI_NUDGE + cell / 2;
      const spot = findSpot(point, w, h, reach, 1, Math.max(1, Math.min(w, h) / 2), 120) || { x: point.x, y: point.y, w, h };
      record(point, spot, 'mini');
    }
    return result;
  }

  function attach(map, getEntries) {
    let frame = 0;
    let stopped = false;
    let resized = false;
    let gesture = false;
    const keyboardIcons = new WeakSet();
    const contentBounds = new WeakMap();
    let layoutKey = '';
    let cached = { zoom: 0, positions: [] };
    let layoutBuilds = 0;
    const sizeArray = value => Array.isArray(value) ? value : [value?.x || 0, value?.y || 0];

    function positionPopup(marker, dx, dy, height, allowAutoPan = true) {
      const popup = marker.getPopup();
      if (!popup) return;
      const [ax, ay] = sizeArray(marker.options.icon.options.popupAnchor);
      popup.options.offset = [dx - ax, dy - height / 2 - ay - 3];
      if (!marker.isPopupOpen()) return;
      const autoPan = popup.options.autoPan;
      try {
        // A pan away should clear stale offsets without pulling the map back.
        if (!allowAutoPan) popup.options.autoPan = false;
        // Reposition only. update() rebuilds Leaflet's original HTML and would
        // erase asynchronously loaded menus, saved-state buttons and focus.
        popup.setLatLng(marker.getLatLng());
      } finally {
        popup.options.autoPan = autoPan;
      }
    }

    function prepare(entry) {
      const { marker, name, selected, id } = entry;
      const icon = marker.getElement();
      if (!icon || entry.visible === false) return null;
      icon.setAttribute('aria-label', name || 'Map place');
      icon.setAttribute('role', 'button');
      icon.classList.toggle('is-selected-place', Boolean(selected));
      icon.dataset.placeId = String(id);
      const [baseWidth, baseHeight] = sizeArray(marker.options.icon.options.iconSize);
      if (!baseWidth || !baseHeight) return null;

      // Leaflet can reuse the same DIV and replace its children on setIcon().
      // Keyboard binding must survive that replacement without accumulating.
      if (!keyboardIcons.has(icon)) {
        keyboardIcons.add(icon);
        icon.addEventListener('keydown', event => {
          if (!stopped && event.key === ' ') {
            event.preventDefault();
            marker.fire('click', { originalEvent: event });
          }
        });
      }
      let content = icon.querySelector('.bf-marker-content');
      if (!content && icon.tagName !== 'IMG') {
        content = document.createElement('div');
        content.className = 'bf-marker-content';
        while (icon.firstChild) content.appendChild(icon.firstChild);
        icon.appendChild(content);
      }
      if (content) {
        content.style.width = `${baseWidth}px`;
        content.style.height = `${baseHeight}px`;
      }
      let bounds = content && contentBounds.get(content);
      if (!bounds) {
        let left = 0, top = 0, right = baseWidth, bottom = baseHeight, badge = false;
        const badges = content && content.querySelectorAll('.marker-price-badge:not(.hidden), .simple-shop-marker b');
        // Most markers have no price badge. Do not force a browser layout
        // just to measure their already-known icon dimensions on every pan.
        if (badges && badges.length) {
          badge = true;
          content.style.transform = 'none';
          const origin = content.getBoundingClientRect();
          badges.forEach(item => {
            const rect = item.getBoundingClientRect();
            left = Math.min(left, rect.left - origin.left);
            top = Math.min(top, rect.top - origin.top);
            right = Math.max(right, rect.right - origin.left);
            bottom = Math.max(bottom, rect.bottom - origin.top);
          });
        }
        bounds = { left, top, right, bottom, badge };
        // setIcon() creates a fresh wrapper, so changed prices are remeasured.
        if (content) contentBounds.set(content, bounds);
      }
      return { ...bounds, id, marker, icon, content, baseWidth, baseHeight, selected: Boolean(selected),
        // A shown price means the place matches the current search: those come first.
        priority: (Number(entry.priority) || 0) + (bounds.badge ? 1e6 : 0) + (marker._isCheapest ? 1e5 : 0) };
    }

    function update() {
      frame = 0;
      if (stopped) return;
      const keepPopupInView = resized;
      const pinching = gesture;
      resized = false;
      gesture = false;
      const viewport = map.getSize();
      if (!viewport.x || !viewport.y) return;
      const zoom = map.getZoom();
      const full = logoSize(zoom);
      const small = miniSize(zoom);
      const mapElement = map.getContainer();
      mapElement.dataset.markerLayoutMode = zoom < REFERENCE_ZOOM ? 'scaled' : 'spaced';
      mapElement.style.setProperty('--bf-marker-detail-scale', String(Math.min(1, full / 22)));
      const entries = getEntries().map(prepare).filter(Boolean);
      const searching = entries.some(entry => entry.badge);
      mapElement.dataset.markerSearch = searching ? 'true' : 'false';

      // Lay out in map pixels at this zoom, so pans and resizes reuse it and
      // only a new zoom, filter, price or priority builds it again.
      const points = entries.map(entry => {
        const point = map.project(entry.marker.getLatLng(), zoom);
        const scale = (entry.selected ? Math.max(full, Math.min(full * 1.15, 44)) : full) / entry.baseWidth;
        return { id: entry.id, x: point.x, y: point.y,
          width: (entry.right - entry.left) * scale, height: (entry.bottom - entry.top) * scale,
          miniWidth: small, miniHeight: entry.baseHeight * small / entry.baseWidth,
          priority: entry.priority, force: entry.selected };
      });
      let positions;
      let factor = 1;
      if (pinching && cached.positions.length === points.length) {
        // During a pinch, follow the gesture with the last layout scaled to the
        // fractional zoom; sizes are settled again when the gesture ends.
        factor = 2 ** (zoom - cached.zoom);
        positions = cached.positions;
      } else {
        const key = `${zoom.toFixed(3)}|` + points.map(p =>
          `${p.id}:${p.x.toFixed(1)}:${p.y.toFixed(1)}:${p.width.toFixed(2)}:${p.height.toFixed(2)}:${p.priority}:${p.force ? 1 : 0}`).join('|');
        if (key !== layoutKey) {
          cached = { zoom, positions: layout(points) };
          layoutKey = key;
          layoutBuilds += 1;
        }
        positions = cached.positions;
      }

      let inViewCount = 0;
      let fullCount = 0;
      positions.forEach((position, index) => {
        const entry = entries[index];
        const { icon, content, marker } = entry;
        const mini = position.tier === 'mini';
        const dx = position.dx * factor;
        const dy = position.dy * factor;
        const width = position.width * factor;
        const height = position.height * factor;
        const anchor = map.latLngToContainerPoint(marker.getLatLng());
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        const inView = x + width / 2 >= 0 && x - width / 2 <= viewport.x && y + height / 2 >= 0 && y - height / 2 <= viewport.y;
        if (inView) {
          inViewCount += 1;
          if (!mini) fullCount += 1;
        }
        icon.tabIndex = inView ? 0 : -1;
        icon.classList.toggle('is-mini', mini);
        icon.style.width = `${width}px`;
        icon.style.height = `${height}px`;
        icon.style.marginLeft = `${dx - width / 2}px`;
        icon.style.marginTop = `${dy - height / 2}px`;
        icon.dataset.markerOffset = `${Math.round(dx)},${Math.round(dy)}`;
        marker.setZIndexOffset(entry.selected ? 2200 : mini ? 400 : (marker._isCheapest ? 1400 : 1000));
        if (content) {
          // A small logo shows the logo alone; its price label is hidden.
          const scale = mini ? width / entry.baseWidth : width / (entry.right - entry.left);
          content.style.transform = mini
            ? `scale(${scale})`
            : `translate(${-entry.left * scale}px, ${-entry.top * scale}px) scale(${scale})`;
        }
        positionPopup(marker, dx, dy, height, inView || keepPopupInView);
      });
      mapElement.dataset.visibleLogoCount = String(inViewCount);
      mapElement.dataset.fullLogoCount = String(fullCount);
      mapElement.dataset.markerLayoutBuilds = String(layoutBuilds);
    }
    function schedule() {
      if (!stopped && !frame) frame = requestAnimationFrame(update);
    }
    function onResize() {
      resized = true;
      schedule();
    }
    function onZoom() {
      // Pinch gestures emit fractional zooms. Follow them once per frame by
      // scaling the last layout; zoomend then settles sizes for the new zoom.
      if (map.getZoom() < REFERENCE_ZOOM) {
        gesture = true;
        schedule();
      }
    }
    function onSettle() {
      gesture = false;
      schedule();
    }
    function destroy() {
      stopped = true;
      cancelAnimationFrame(frame);
      map.off('zoomend moveend', onSettle);
      map.off('resize', onResize);
      map.off('zoom', onZoom);
    }
    map.on('zoomend moveend', onSettle);
    map.on('resize', onResize);
    map.on('zoom', onZoom);
    map.once('unload', destroy);
    schedule();
    return { schedule, destroy };
  }
  return { layout, logoSize, miniSize, attach, MINI_RATIO };
});
