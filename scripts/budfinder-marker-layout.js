/* Individual map markers: no clustering, culling, or changes to coordinates. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BudfinderMarkerLayout = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const REFERENCE_ZOOM = 12;

  function logoSize(zoom) {
    // Below town level, halve the whole marker with each zoom-out step.
    // A pixel-size floor would eventually make every city a solid mass again.
    if (zoom < REFERENCE_ZOOM) return 22 * 2 ** (zoom - REFERENCE_ZOOM);
    const stops = [[12, 22], [15, 32], [18, 44]];
    for (let i = 1; i < stops.length; i += 1) {
      if (zoom <= stops[i][0]) {
        const [z0, s0] = stops[i - 1];
        const [z1, s1] = stops[i];
        return s0 + (s1 - s0) * (zoom - z0) / (z1 - z0);
      }
    }
    return 44;
  }

  // Pure screen-space packing, shared by the map and regression tests. A hash
  // grid keeps dense city layouts from scanning every previously placed logo.
  function layout(points, options) {
    const width = Math.max(1, Number(options.width) || 1);
    const height = Math.max(1, Number(options.height) || 1);
    const gap = options.gap == null ? 3 : Math.max(0, options.gap);
    const padding = Math.min(4, width / 8, height / 8);
    const ordered = points.map((point, index) => ({ ...point, index }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.id).localeCompare(String(b.id), 'en'));
    const cell = 48;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    function attempt(factor) {
      const grid = new Map();
      const result = new Array(points.length);
      function keys(box) {
        const out = [];
        for (let x = Math.floor((box.x - box.w / 2 - gap) / cell); x <= Math.floor((box.x + box.w / 2 + gap) / cell); x += 1) {
          for (let y = Math.floor((box.y - box.h / 2 - gap) / cell); y <= Math.floor((box.y + box.h / 2 + gap) / cell); y += 1) out.push(`${x}:${y}`);
        }
        return out;
      }
      function clear(box) {
        for (const key of keys(box)) {
          for (const other of grid.get(key) || []) {
            if (Math.abs(box.x - other.x) < (box.w + other.w) / 2 + gap &&
                Math.abs(box.y - other.y) < (box.h + other.h) / 2 + gap) return false;
          }
        }
        return true;
      }
      for (const point of ordered) {
        const w = Math.min(point.width * factor, width - padding * 2);
        const h = Math.min(point.height * factor, height - padding * 2);
        const lowX = padding + w / 2;
        const lowY = padding + h / 2;
        const highX = width - padding - w / 2;
        const highY = height - padding - h / 2;
        const x = clamp(point.x, lowX, highX);
        const y = clamp(point.y, lowY, highY);
        let box = { x, y, w, h };
        if (!clear(box)) {
          box = null;
          const step = Math.max(3, Math.min(w, h) / 2);
          const maxRadius = Math.hypot(width, height);
          for (let radius = step; radius <= maxRadius && !box; radius += step) {
            const count = Math.max(8, Math.ceil(2 * Math.PI * radius / step));
            for (let n = 0; n < count; n += 1) {
              const angle = n * 2 * Math.PI / count;
              const candidate = { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius, w, h };
              if (candidate.x < lowX || candidate.x > highX || candidate.y < lowY || candidate.y > highY) continue;
              if (clear(candidate)) { box = candidate; break; }
            }
          }
          if (!box) return null;
        }
        for (const key of keys(box)) {
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(box);
        }
        result[point.index] = { id: point.id, x: box.x, y: box.y, width: w, height: h,
          dx: box.x - point.x, dy: box.y - point.y, scale: factor };
      }
      return result;
    }

    for (const factor of [1, 0.8, 0.64, 0.5]) {
      const result = attempt(factor);
      if (result) return result;
    }
    // Extremely small viewports still retain every individual marker. Scale
    // them to available cells rather than dropping venues or creating groups.
    const columns = Math.max(1, Math.ceil(Math.sqrt(points.length * width / height)));
    const rows = Math.max(1, Math.ceil(points.length / columns));
    const cellW = width / columns;
    const cellH = height / rows;
    return points.map((point, index) => {
      const scale = Math.min(0.5, cellW * 0.8 / point.width, cellH * 0.8 / point.height);
      const x = (index % columns + 0.5) * cellW;
      const y = (Math.floor(index / columns) + 0.5) * cellH;
      return { id: point.id, x, y, width: point.width * scale, height: point.height * scale,
        dx: x - point.x, dy: y - point.y, scale };
    });
  }

  function attach(map, getEntries) {
    let frame = 0;
    let stopped = false;
    let resized = false;
    const keyboardIcons = new WeakSet();
    const contentBounds = new WeakMap();
    let referenceKey = '';
    let referenceLayout = [];
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

    function update() {
      frame = 0;
      if (stopped) return;
      const keepPopupInView = resized;
      resized = false;
      const viewport = map.getSize();
      if (!viewport.x || !viewport.y) return;
      const zoom = map.getZoom();
      const distant = zoom < REFERENCE_ZOOM;
      const targetSize = logoSize(zoom);
      const mapElement = map.getContainer();
      mapElement.dataset.markerLayoutMode = distant ? 'scaled' : 'spaced';
      mapElement.style.setProperty('--bf-marker-detail-scale', String(Math.min(1, targetSize / 22)));
      mapElement.style.setProperty('--bf-marker-line-opacity', String(Math.max(0, Math.min(1, (zoom - 10) / 2))));
      const visible = [];
      getEntries().forEach(entry => {
        const { marker, name, selected, id } = entry;
        const icon = marker.getElement();
        if (!icon || entry.visible === false) return;
        const anchor = map.latLngToContainerPoint(marker.getLatLng());
        const inView = Number.isFinite(anchor.x) && Number.isFinite(anchor.y) &&
          anchor.x >= -targetSize && anchor.x <= viewport.x + targetSize &&
          anchor.y >= -targetSize && anchor.y <= viewport.y + targetSize;
        icon.tabIndex = inView ? 0 : -1;
        icon.setAttribute('aria-label', name || 'Map place');
        icon.setAttribute('role', 'button');
        icon.classList.toggle('is-selected-place', Boolean(selected));
        icon.dataset.placeId = String(id);
        const [baseWidth, baseHeight] = sizeArray(marker.options.icon.options.iconSize);
        if (!baseWidth || !baseHeight) return;

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
          for (const className of ['bf-marker-leader', 'bf-marker-point']) {
            const part = document.createElement('span');
            part.className = className;
            part.setAttribute('aria-hidden', 'true');
            icon.prepend(part);
          }
        }
        if (content) {
          content.style.width = `${baseWidth}px`;
          content.style.height = `${baseHeight}px`;
        }

        if (!inView && !distant) {
          // Clear old offsets when panning away; the marker remains mounted at
          // its real offscreen location and can enter the next viewport normally.
          const scale = targetSize / baseWidth;
          const height = baseHeight * scale;
          icon.style.width = `${targetSize}px`;
          icon.style.height = `${height}px`;
          icon.style.marginLeft = `${-targetSize / 2}px`;
          icon.style.marginTop = `${-height / 2}px`;
          icon.dataset.markerOffset = '0,0';
          if (content) content.style.transform = `scale(${scale})`;
          icon.querySelectorAll('.bf-marker-leader, .bf-marker-point').forEach(part => { part.hidden = true; });
          positionPopup(marker, 0, 0, height, keepPopupInView);
          return;
        }
        let bounds = content && contentBounds.get(content);
        if (!bounds) {
          let left = 0, top = 0, right = baseWidth, bottom = baseHeight;
          const badges = content && content.querySelectorAll('.marker-price-badge:not(.hidden), .simple-shop-marker b');
          // Most markers have no price badge. Do not force a browser layout
          // just to measure their already-known icon dimensions on every pan.
          if (badges && badges.length) {
            content.style.transform = 'none';
            const origin = content.getBoundingClientRect();
            badges.forEach(badge => {
              const rect = badge.getBoundingClientRect();
              left = Math.min(left, rect.left - origin.left);
              top = Math.min(top, rect.top - origin.top);
              right = Math.max(right, rect.right - origin.left);
              bottom = Math.max(bottom, rect.bottom - origin.top);
            });
          }
          bounds = { left, top, right, bottom };
          // setIcon() creates a fresh wrapper, so changed prices are remeasured.
          if (content) contentBounds.set(content, bounds);
        }
        const { left, top, right, bottom } = bounds;
        const selectedSize = selected && !distant
          ? Math.max(targetSize, Math.min(30, targetSize + (zoom - REFERENCE_ZOOM) * 8))
          : targetSize;
        const scale = selectedSize / baseWidth;
        visible.push({ id, x: anchor.x, y: anchor.y, width: (right - left) * scale,
          height: (bottom - top) * scale, priority: selected ? 1 : 0,
          marker, icon, content, left, top, scale, inView });
      });
      let placed;
      if (distant && visible.length) {
        const factor = 2 ** (zoom - REFERENCE_ZOOM);
        const points = visible.map(entry => {
          const point = map.project(entry.marker.getLatLng(), REFERENCE_ZOOM);
          return { id: entry.id, x: point.x, y: point.y,
            width: entry.width / factor, height: entry.height / factor };
        });
        // Fixed map-space positions survive pans, resizing and further zooming.
        // Selection does not enlarge a distant logo or trigger another packing pass.
        const key = points.map(p => `${p.id}:${p.x}:${p.y}:${p.width.toFixed(4)}:${p.height.toFixed(4)}`).join('|');
        if (key !== referenceKey) {
          const minX = Math.min(...points.map(p => p.x)) - 1000;
          const minY = Math.min(...points.map(p => p.y)) - 1000;
          const width = Math.max(...points.map(p => p.x)) - minX + 1000;
          const height = Math.max(...points.map(p => p.y)) - minY + 1000;
          referenceLayout = layout(points.map(p => ({ ...p, x: p.x - minX, y: p.y - minY })), { width, height });
          referenceKey = key;
          layoutBuilds += 1;
        }
        const origin = map.getPixelOrigin();
        placed = referenceLayout.map((position, index) => {
          const entry = visible[index];
          const point = points[index];
          // Leaflet rounds marker anchors to pixels. Compensate using its public
          // projection methods so subpixel logos do not stack on rounded pixels.
          const anchor = map.layerPointToContainerPoint({ x: point.x * factor - origin.x, y: point.y * factor - origin.y });
          const dx = position.dx * factor + anchor.x - entry.x;
          const dy = position.dy * factor + anchor.y - entry.y;
          const width = position.width * factor;
          const height = position.height * factor;
          const x = entry.x + dx, y = entry.y + dy;
          entry.inView = x + width / 2 >= 0 && x - width / 2 <= viewport.x &&
            y + height / 2 >= 0 && y - height / 2 <= viewport.y;
          return { dx, dy, width, height, scale: position.scale };
        });
      } else {
        placed = layout(visible, { width: viewport.x, height: viewport.y });
        layoutBuilds += 1;
      }
      placed.forEach((position, index) => {
        const entry = visible[index];
        const { icon, content, marker } = entry;
        const scale = entry.scale * position.scale;
        const { dx, dy, width, height } = position;
        icon.tabIndex = entry.inView ? 0 : -1;
        icon.style.width = `${width}px`;
        icon.style.height = `${height}px`;
        icon.style.marginLeft = `${dx - width / 2}px`;
        icon.style.marginTop = `${dy - height / 2}px`;
        icon.dataset.markerOffset = `${Math.round(dx)},${Math.round(dy)}`;
        marker.setZIndexOffset(entry.priority ? 2200 : (marker._isCheapest ? 1400 : 1000));
        if (content) {
          content.style.transform = `translate(${-entry.left * scale}px, ${-entry.top * scale}px) scale(${scale})`;
          const leader = icon.querySelector('.bf-marker-leader');
          const dot = icon.querySelector('.bf-marker-point');
          const detailScale = Math.min(1, targetSize / 22);
          const displaced = zoom > 10 && Math.hypot(dx, dy) > 4 * detailScale;
          leader.hidden = dot.hidden = !displaced;
          const anchorX = width / 2 - dx;
          const anchorY = height / 2 - dy;
          leader.style.cssText = `left:${anchorX}px;top:${anchorY}px;width:${Math.hypot(dx, dy)}px;transform:rotate(${Math.atan2(dy, dx)}rad)`;
          dot.style.left = `${anchorX}px`;
          dot.style.top = `${anchorY}px`;
        }
        positionPopup(marker, dx, dy, height, entry.inView || keepPopupInView);
      });
      mapElement.dataset.visibleLogoCount = String(visible.filter(entry => entry.inView).length);
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
      // Pinch gestures emit fractional zooms. The cached distant layout is
      // cheap enough to follow them once per frame, without waiting for release.
      if (map.getZoom() < REFERENCE_ZOOM) schedule();
    }
    function destroy() {
      stopped = true;
      cancelAnimationFrame(frame);
      map.off('zoomend moveend', schedule);
      map.off('resize', onResize);
      map.off('zoom', onZoom);
    }
    map.on('zoomend moveend', schedule);
    map.on('resize', onResize);
    map.on('zoom', onZoom);
    map.once('unload', destroy);
    schedule();
    return { schedule, destroy };
  }
  return { layout, logoSize, attach };
});
