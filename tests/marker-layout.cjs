const test = require('node:test');
const assert = require('node:assert/strict');
const { layout, logoSize } = require('../scripts/budfinder-marker-layout.js');

function check(points, result, viewport, gap = 0) {
  assert.equal(result.length, points.length, 'Every place keeps its own marker');
  assert.deepEqual(result.map(item => item.id), points.map(item => item.id));
  result.forEach((item, i) => {
    assert.ok(item.width > 0 && item.height > 0);
    assert.ok(item.x - item.width / 2 >= -0.001);
    assert.ok(item.y - item.height / 2 >= -0.001);
    assert.ok(item.x + item.width / 2 <= viewport.width + 0.001);
    assert.ok(item.y + item.height / 2 <= viewport.height + 0.001);
    assert.ok(Math.abs(item.x - item.dx - points[i].x) < 0.001, 'The leader retains the true map point');
    assert.ok(Math.abs(item.y - item.dy - points[i].y) < 0.001);
    result.slice(i + 1).forEach(other => {
      const clearX = Math.abs(item.x - other.x) >= (item.width + other.width) / 2 + gap - 0.001;
      const clearY = Math.abs(item.y - other.y) >= (item.height + other.height) / 2 + gap - 0.001;
      assert.ok(clearX || clearY, `${item.id} overlaps ${other.id}`);
    });
  });
}

test('logo sizing stays positive with no pixel floor and is continuous through town zoom', () => {
  let previous = 0;
  for (let zoom = 0; zoom <= 20; zoom += 0.25) {
    const size = logoSize(zoom);
    assert.ok(size > 0 && size <= 44);
    assert.ok(size >= previous);
    if (previous) assert.ok(size - previous <= 3.6);
    previous = size;
  }
  for (let zoom = -5; zoom < 12; zoom += 1) {
    assert.equal(logoSize(zoom + 1), logoSize(zoom) * 2, 'Every distant zoom step scales with the map');
  }
  assert.ok(logoSize(0) < 0.01, 'World view must not retain a minimum-size blob');
  assert.ok(Math.abs(logoSize(12 - 0.00001) - logoSize(12)) < 0.001);
});

test('hundreds of coincident places stay separate and clickable on a phone', () => {
  const viewport = { width: 360, height: 640 };
  const points = Array.from({ length: 323 }, (_, id) => ({ id, x: 180, y: 290, width: 14, height: 14 }));
  const original = JSON.stringify(points);
  const result = layout(points, viewport);
  check(points, result, viewport, 3);
  assert.equal(JSON.stringify(points), original, 'Source coordinates must not be mutated');
  assert.deepEqual(layout(points, viewport), result, 'Layout remains deterministic');
});

test('sparse logos stay anchored and close pairs separate including price labels', () => {
  const viewport = { width: 900, height: 600 };
  const points = [
    { id: 'a', x: 100, y: 100, width: 44, height: 62 },
    { id: 'b', x: 110, y: 100, width: 54, height: 62 },
    { id: 'c', x: 700, y: 450, width: 44, height: 44 }
  ];
  const result = layout(points, viewport);
  check(points, result, viewport, 3);
  assert.equal(result[0].dx, 0);
  assert.equal(result[2].dx, 0);
  assert.equal(result[2].dy, 0);
  assert.ok(Math.hypot(result[1].dx, result[1].dy) > 0);
});

test('selected places keep their position before neighbours are spaced', () => {
  const viewport = { width: 400, height: 400 };
  const points = Array.from({ length: 30 }, (_, id) => ({ id, x: 150, y: 150, width: 18, height: 18 }));
  points[20] = { id: 20, x: 150, y: 150, width: 36, height: 36, priority: 1 };
  const result = layout(points, viewport);
  check(points, result, viewport, 3);
  assert.equal(result[20].x, 150);
  assert.equal(result[20].y, 150);
  assert.equal(result[20].width, 36);
});

test('edge points and changing filters never remove or merge a venue', () => {
  const viewport = { width: 320, height: 240 };
  const points = Array.from({ length: 60 }, (_, id) => ({ id,
    x: id % 2 ? 318 : -4, y: id < 30 ? 2 : 239, width: 22, height: 22 }));
  check(points, layout(points, viewport), viewport);
  const filtered = points.filter(point => point.id % 3 === 0);
  check(filtered, layout(filtered, viewport), viewport);
});

test('an unusually small viewport retains every marker with non-overlapping bounds', () => {
  const viewport = { width: 90, height: 80 };
  const points = Array.from({ length: 80 }, (_, id) => ({ id, x: 45, y: 40, width: 44, height: 60 }));
  check(points, layout(points, viewport), viewport);
});
