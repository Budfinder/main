/* Build a device-local benchmark from recorded, per-shop price histories. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BudfinderBenchmark = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const STORAGE_KEY = 'budfinder_custom_price_benchmark_v1';
  const SHOP_LIMIT = 20;

  // Invalid or unavailable settings fall back to the published benchmark.
  function cleanIds(value) {
    if (!Array.isArray(value)) return null;
    const ids = value.map(Number);
    return ids.length === SHOP_LIMIT && ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === SHOP_LIMIT ? ids : null;
  }
  function read(storage) {
    try { return cleanIds(JSON.parse(storage.getItem(STORAGE_KEY) || 'null')); } catch (_) { return null; }
  }
  function write(storage, ids) {
    const clean = cleanIds(ids);
    if (!clean) throw new Error('Select exactly 20 different shops.');
    storage.setItem(STORAGE_KEY, JSON.stringify(clean));
  }
  function reset(storage) { storage.removeItem(STORAGE_KEY); }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function normaliseHistory(data, expectedExport) {
    if (!data || data.version !== 1 || data.currency !== '€' || data.unit !== 'g' ||
        data.date_basis !== 'recorded_observation' || data.exported_at_utc !== expectedExport || !Array.isArray(data.shops)) {
      throw new Error('Shop price history is unavailable or is still updating.');
    }
    const latest = String(data.exported_at_utc).slice(0, 10);
    if (!validDate(latest)) throw new Error('Shop price history has an invalid date.');
    const ids = new Set();
    const shops = data.shops.map(shop => {
      const id = Number(shop && shop.shop_id);
      if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) throw new Error('Shop history contains duplicate or invalid shops.');
      ids.add(id);
      const points = new Map();
      for (const point of Array.isArray(shop.points) ? shop.points : []) {
        if (!point || !validDate(point.date) || point.date > latest) continue;
        const price = point.average_price;
        const valid = typeof price === 'number' && Number.isFinite(price) && price > 0 &&
          Number.isInteger(point.strain_count) && point.strain_count > 0 &&
          Number.isInteger(point.listing_count) && point.listing_count > 0;
        points.set(point.date, {date: point.date, average_price: valid ? price : null,
          strain_count: valid ? point.strain_count : 0, listing_count: valid ? point.listing_count : 0,
          kind: point.kind === 'current' ? 'current' : 'recorded'});
      }
      const ordered = [...points.values()].sort((a,b) => a.date.localeCompare(b.date));
      if (!ordered.length || ordered.at(-1).date !== latest || ordered.at(-1).kind !== 'current') {
        throw new Error('Shop price history is missing its current snapshot.');
      }
      return {shopId: id, name: String(shop.name || `Shop ${id}`), city: String(shop.city || ''), points: ordered};
    });
    return {shops, latest, exportedAt: data.exported_at_utc};
  }

  // At each actual observation carry each shop's last recorded snapshot
  // forward. A missing or removed menu invalidates the point until it returns.
  function build(shops, ids, latest) {
    const selectedIds = cleanIds(ids);
    if (!selectedIds) throw new Error('Select exactly 20 different shops.');
    const byId = new Map(shops.map(shop => [shop.shopId, shop]));
    const chosen = selectedIds.map(id => byId.get(id));
    if (chosen.some(shop => !shop)) throw new Error('One or more selected shops are missing from this export.');
    const dates = [...new Set(chosen.flatMap(shop => shop.points.map(point => point.date)))].sort();
    const positions = chosen.map(() => 0);
    const current = chosen.map(() => null);
    let missingLatest = [];
    const points = dates.map(date => {
      chosen.forEach((shop, index) => {
        while (positions[index] < shop.points.length && shop.points[positions[index]].date <= date) {
          current[index] = shop.points[positions[index]++];
        }
      });
      const available = current.filter(point => point && point.average_price != null);
      if (date === latest) missingLatest = chosen.filter((_shop, index) => !current[index] || current[index].average_price == null).map(shop => shop.name);
      // Shop means are already rounded to cents. Integer arithmetic avoids
      // floating-point drift when their average falls exactly between cents.
      const cents = available.reduce((sum, point) => sum + Math.round(point.average_price * 100), 0);
      const whole = Math.floor(cents / chosen.length), remainder = cents % chosen.length;
      const rounded = whole + (remainder * 2 > chosen.length || (remainder * 2 === chosen.length && whole % 2 === 1) ? 1 : 0);
      return {date, average_price: available.length === chosen.length ? rounded / 100 : null,
        shop_count: available.length, strain_count: available.reduce((sum, point) => sum + point.strain_count, 0),
        listing_count: available.reduce((sum, point) => sum + point.listing_count, 0), kind: date === latest ? 'current' : 'recorded'};
    });
    return {id:'custom-benchmark', name:'Your 20-shop benchmark', kind:'benchmark', points, shops:chosen, missingLatest};
  }

  return { STORAGE_KEY, SHOP_LIMIT, cleanIds, read, write, reset, normaliseHistory, build };
});
