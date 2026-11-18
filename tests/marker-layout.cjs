const test = require('node:test');
const assert = require('node:assert/strict');
const { layout, logoSize, miniSize } = require('../scripts/budfinder-marker-layout.js');

// Every place keeps its own logo (full or small) close to its real spot, and
// full logos never overlap each other.
function check(points, result, gap = 2) {
  assert.equal(result.length, points.length, 'Every place keeps its own logo');
  assert.deepEqual(result.map(item => item.id), points.map(item => item.id));
  result.forEach((item, i) => {
    const point = points[i];
    assert.ok(item.width > 0 && item.height > 0);
    assert.ok(['full', 'mini'].includes(item.tier));
    assert.ok(Math.abs(item.x - item.dx - point.x) < 1e-9, 'The offset is measured from the real spot');
    assert.ok(Math.abs(item.y - item.dy - point.y) < 1e-9);
    const shift = Math.hypot(item.dx, item.dy);
    if (item.tier === 'full') {
      assert.equal(item.width, point.width);
      assert.ok(shift <= Math.min(point.width, point.height) / 2 + 1e-9, `${item.id} drifted ${shift}px from its shop`);
    } else {
      assert.ok(item.width < point.width, 'A small logo is smaller than a full one');
      const largest = Math.max(...points.map(p => Math.max(p.width, p.height)));
      assert.ok(shift <= Math.max(item.width, item.height) + largest / 2 + 1e-9, `${item.id} drifted ${shift}px`);
    }
  });
  const full = result.filter(item => item.tier === 'full');
  full.forEach((item, i) => full.slice(i + 1).forEach(other => {
    if (points[result.indexOf(item)].force || points[result.indexOf(other)].force) return;
    const clearX = Math.abs(item.x - other.x) >= (item.width + other.width) / 2 + gap - 1e-9;
    const clearY = Math.abs(item.y - other.y) >= (item.height + other.height) / 2 + gap - 1e-9;
    assert.ok(clearX || clearY, `Full logos ${item.id} and ${other.id} overlap`);
  }));
}

test('full logos stay recognisable at every zoom while small ones shrink when far out', () => {
  let previous = 0;
  for (let zoom = 0; zoom <= 20; zoom += 0.25) {
    const full = logoSize(zoom);
    assert.ok(full >= 20 && full <= 44, `Full logo at zoom ${zoom} is ${full}px`);
    assert.ok(full >= previous);
    if (previous) assert.ok(full - previous <= 3.6, 'Sizes change smoothly');
    previous = full;
    assert.ok(miniSize(zoom) < full, 'A small logo is always smaller than a full one');
  }
  assert.equal(logoSize(18), 44);
  for (let zoom = 0; zoom + 1.5 <= 11; zoom += 0.5) {
    assert.ok(Math.abs(miniSize(zoom + 1.5) / miniSize(zoom) - 2) < 1e-9, 'Far out, small logos shrink with the map');
  }
  assert.ok(miniSize(0) < 0.1, 'From very far away a city of small logos is only a speckle');
  assert.ok(Math.abs(miniSize(11 - 1e-9) - miniSize(11)) < 1e-6);
});

test('sparse logos stay exactly on their shop at full size', () => {
  const points = [
    { id: 'a', x: 100, y: 100, width: 28, height: 28 },
    { id: 'b', x: 300, y: 120, width: 28, height: 40 },
    { id: 'c', x: 700, y: 450, width: 28, height: 28 }
  ];
  const result = layout(points);
  check(points, result);
  result.forEach(item => {
    assert.equal(item.tier, 'full');
    assert.equal(item.dx, 0);
    assert.equal(item.dy, 0);
  });
});

test('a close neighbour moves a few pixels when that makes room, otherwise it gets a small logo', () => {
  const near = [{ id: 'a', x: 100, y: 100, width: 28, height: 28, priority: 2 },
    { id: 'b', x: 120, y: 100, width: 28, height: 28, priority: 1 }];
  const moved = layout(near);
  check(near, moved);
  assert.deepEqual(moved.map(item => item.tier), ['full', 'full']);
  assert.equal(moved[0].dx, 0, 'The more important place does not move');
  assert.ok(Math.hypot(moved[1].dx, moved[1].dy) > 0);
  const same = [{ id: 'a', x: 100, y: 100, width: 28, height: 28, priority: 2 },
    { id: 'b', x: 101, y: 100, width: 28, height: 28, priority: 1 }];
  const crowded = layout(same);
  check(same, crowded);
  assert.deepEqual(crowded.map(item => item.tier), ['full', 'mini']);
});

test('priority decides which crowded places get full logos, and a selected place always does', () => {
  const points = Array.from({ length: 40 }, (_, id) => ({ id, x: 150 + (id % 5), y: 150 + Math.floor(id / 5), width: 28, height: 28, priority: id }));
  const result = layout(points);
  check(points, result);
  assert.deepEqual(result.filter(item => item.tier === 'full').map(item => item.id), [39], 'Highest priority wins');
  const selected = points.map(point => (point.id === 3 ? { ...point, force: true, width: 32, height: 32 } : point));
  const chosen = layout(selected);
  check(selected, chosen);
  assert.equal(chosen[3].tier, 'full');
  assert.equal(chosen[3].width, 32);
  assert.equal(chosen.filter(item => item.tier === 'full').length, 1, 'The selected place takes the spot');
});

test('hundreds of places in one spot each keep a logo near that spot, deterministically', () => {
  const points = Array.from({ length: 323 }, (_, id) => ({ id, x: 180, y: 290, width: 26, height: 26, miniWidth: 11, miniHeight: 11 }));
  const original = JSON.stringify(points);
  const result = layout(points);
  check(points, result);
  assert.equal(result.filter(item => item.tier === 'full').length, 1);
  assert.equal(result.filter(item => item.tier === 'mini').length, 322);
  assert.ok(result.every(item => item.tier === 'full' || item.width === 11));
  assert.equal(JSON.stringify(points), original, 'Source coordinates must not be mutated');
  assert.deepEqual(layout(points), result, 'Layout remains deterministic');
});

test('filters change who is shown but never merge or drop a shown place', () => {
  const points = Array.from({ length: 60 }, (_, id) => ({ id, x: (id % 10) * 12, y: Math.floor(id / 10) * 12, width: 28, height: 28 }));
  check(points, layout(points));
  const filtered = points.filter(point => point.id % 3 === 0);
  const result = layout(filtered);
  check(filtered, result);
  assert.equal(result.length, 20);
});
