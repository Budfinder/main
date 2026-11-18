/* Skunkworks shares existing favourites with the map and keeps its own simple preferences. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BudfinderSkunkworks = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  const PROFILE_KEY = 'budfinder_skunkworks_v1';
  const SITE_DEFAULTS_KEY = 'budfinder_show_site_visits_ratings';
  // Read the old preference once, then remove its former personal identifier.
  const LEGACY_SITE_KEY = ['budfinder_show_', 'ma', 'tt', '_visits_ratings'].join('');
  const STRAIN_KEYS = ['budfinder_strain_shelf', 'locate3_strain_shelf'];
  const LOCATION_KEYS = ['budfinder_location_preferences', 'locate3_location_preferences'];
  const TYPES = ['sativa', 'indica', 'hybrid', 'hash'];
  const RADIUS_OPTIONS_KM = [0.1, 0.25, 0.5, 1, 2, 5];
  const DEFAULTS = { radiusKm: 2, maxPrice: 10, types: [], showUnvisited: true, preferRecent: true };
  const MIN_DEAL_SAVING_PERCENT = 10;

  /* Use the same spelling and punctuation rules as the shared Budfinder search. */
  function normalise(value) {
    const text = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
      .replace(/\b([a-z]{1,3}) (\d{1,3})\b/g, '$1$2').trim();
    return ({ 'the hague': 'den haag', 's gravenhage': 'den haag', 'gronigen': 'groningen' })[text] || text;
  }

  function parse(storage, key, fallback) {
    try {
      const value = storage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (_) { return fallback; }
  }

  /* Older storage keys remain readable and writes keep both versions in sync. */
  function readStrains(storage) {
    const names = [];
    const seen = new Set();
    for (const key of STRAIN_KEYS) {
      const saved = parse(storage, key, []);
      if (!Array.isArray(saved)) continue;
      for (const name of saved) {
        const text = typeof name === 'string' ? name.trim() : '';
        const id = normalise(text);
        if (id && !seen.has(id)) { seen.add(id); names.push(text); }
      }
    }
    return names.slice(0, 10);
  }

  function writeStrains(storage, names) {
    const value = JSON.stringify(names.slice(0, 10));
    for (const key of STRAIN_KEYS) storage.setItem(key, value);
  }

  function readLocations(storage) {
    const result = {};
    for (const key of LOCATION_KEYS.slice().reverse()) {
      const value = parse(storage, key, {});
      if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(result, value);
    }
    return result;
  }

  function writeLocations(storage, value) {
    const payload = JSON.stringify(value);
    for (const key of LOCATION_KEYS) storage.setItem(key, payload);
  }

  /* This matches the map's location preference key, including its URL-first rule. */
  function locationKey(loc, base = 'https://budfinder.org/') {
    if (!loc) return '';
    try {
      if (loc.website) {
        const path = new URL(String(loc.website).trim(), base).pathname.toLowerCase().replace(/\/+$/, '');
        if (path) return `url:${path}`;
      }
    } catch (_) { /* Fall back to the location's name and city. */ }
    const key = `${normalise(loc.name)}|${normalise(loc.city)}`;
    return key === '|' ? '' : `name:${key}`;
  }

  function cleanProfile(input = {}) {
    const radius = Number(input.radiusKm);
    const maxPrice = Number(input.maxPrice);
    return {
      // Older 10 km and 20 km settings move to the largest available radius.
      radiusKm: RADIUS_OPTIONS_KM.includes(radius) ? radius : (radius === 10 || radius === 20 ? 5 : DEFAULTS.radiusKm),
      maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 && maxPrice <= 100 ? maxPrice : DEFAULTS.maxPrice,
      types: Array.isArray(input.types) ? [...new Set(input.types.filter(type => TYPES.includes(type)))] : [],
      showUnvisited: input.showUnvisited !== false,
      preferRecent: input.preferRecent !== false
    };
  }

  function readProfile(storage) { return cleanProfile(parse(storage, PROFILE_KEY, {})); }
  function writeProfile(storage, profile) { storage.setItem(PROFILE_KEY, JSON.stringify(cleanProfile(profile))); }
  /* Shared site visits and ratings are optional; personal overrides stay separate. */
  function readSiteDefaults(storage) {
    try {
      let value = storage.getItem(SITE_DEFAULTS_KEY);
      if (value === null) {
        value = storage.getItem(LEGACY_SITE_KEY);
        if (value !== null) { storage.setItem(SITE_DEFAULTS_KEY, value); storage.removeItem(LEGACY_SITE_KEY); }
      }
      return value !== 'false';
    } catch (_) { return true; }
  }
  function writeSiteDefaults(storage, enabled) { storage.setItem(SITE_DEFAULTS_KEY, enabled ? 'true' : 'false'); }
  function formatRadius(radiusKm) { return radiusKm < 1 ? `${Math.round(radiusKm * 1000)} m` : `${radiusKm} km`; }
  function isPopulated(storage) {
    const profile = parse(storage, PROFILE_KEY, null);
    return Boolean(profile && typeof profile === 'object' && !Array.isArray(profile)) ||
      readStrains(storage).length > 0 || Object.values(readLocations(storage)).some(value => value && (value.favorite === true || typeof value.visited === 'boolean'));
  }

  /* Straight-line distance is intentional. It is not a walking route. */
  function distanceMeters(a, b) {
    const radians = value => value * Math.PI / 180;
    const latitude = radians(b[0] - a[0]);
    const longitude = radians(b[1] - a[1]);
    const h = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitude / 2) ** 2;
    return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* Future or missing dates are unknown, and are never presented as recent. */
  function freshnessRank(info, now) {
    const time = Date.parse(info && info.value || '');
    if (!Number.isFinite(time)) return 3;
    const day = value => Math.floor(value / 86400000);
    const age = day(now) - day(time);
    if (age < 0) return 3;
    return age <= 14 ? 0 : age <= 60 ? 1 : 2;
  }

  /* Produce transparent, individually labelled leads from eligible current menu rows. */
  function nearby({ origin, locations, offerings, strains, profile, isEligible = () => true, compareAverage = () => null,
    getDateInfo = () => null, getShopDateInfo = () => null, now = Date.now() }) {
    const settings = cleanProfile(profile);
    if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite)) throw new Error('A valid starting point is required.');
    const wanted = new Set((Array.isArray(strains) ? strains : []).map(normalise).filter(Boolean));
    const byId = new Map();
    const byNameCity = new Map();
    for (const row of Array.isArray(offerings) ? offerings : []) {
      if (!isEligible(row)) continue;
      const id = String(row.shop_id || '');
      const nameCity = `${normalise(row.shop_name)}|${normalise(row.shop_city)}`;
      if (id) { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(row); }
      if (nameCity !== '|') { if (!byNameCity.has(nameCity)) byNameCity.set(nameCity, []); byNameCity.get(nameCity).push(row); }
    }
    const results = { highlights: [], favourites: [], deals: [], unvisited: [], shops: [] };
    for (const entry of Array.isArray(locations) ? locations : []) {
      const loc = entry.loc;
      if (!loc || !Array.isArray(loc.coords) || loc.coords.length !== 2 || !loc.coords.every(Number.isFinite)) continue;
      const distance = distanceMeters(origin, loc.coords);
      if (distance > settings.radiusKm * 1000) continue;
      const shopDate = getShopDateInfo(loc);
      const shop = { index: entry.index, name: loc.name, city: loc.city || '', distance, visited: Boolean(loc.visited), favorite: Boolean(entry.favorite),
        dateInfo: shopDate, freshnessRank: freshnessRank(shopDate, now) };
      if (shop.favorite) results.shops.push(shop);
      if (settings.showUnvisited && !shop.visited) results.unvisited.push(shop);
      const rows = loc.db_shop_id ? byId.get(String(loc.db_shop_id)) || [] : byNameCity.get(`${normalise(loc.name)}|${normalise(loc.city)}`) || [];
      const bestByStrain = new Map();
      for (const row of rows) {
        const strainKey = normalise(row.strain_name);
        if (!strainKey || (settings.types.length && !settings.types.includes(String(row.base_type || '').toLowerCase()))) continue;
        const price = Number(row.price_amount);
        const validPrice = row.price_amount !== null && row.price_amount !== '' && Number.isFinite(price) && price > 0 && row.price_unit === 'g' && (row.price_currency || '€') === '€';
        if (!wanted.has(strainKey) && !validPrice) continue;
        const dateInfo = getDateInfo(row);
        const candidate = { ...shop, strain: row.strain_name, price: validPrice ? price : null, row,
          dateInfo, freshnessRank: freshnessRank(dateInfo, now) };
        const current = bestByStrain.get(strainKey);
        if (!current || (candidate.price !== null && (current.price === null || candidate.price < current.price))) bestByStrain.set(strainKey, candidate);
      }
      for (const [strainKey, candidate] of bestByStrain) {
        candidate.isSavedStrain = wanted.has(strainKey);
        if (candidate.isSavedStrain) results.favourites.push(candidate);
        if (candidate.price !== null) {
          const comparison = compareAverage(candidate.strain, candidate.price);
          if (comparison && comparison.tone === 'cheaper' && Number.isFinite(comparison.average) && comparison.average > 0 &&
              Number.isFinite(comparison.diff) && comparison.diff < 0 && Number(comparison.sampleSize) >= 2) {
            const savingPercent = (-comparison.diff / comparison.average) * 100;
            if (savingPercent + 1e-9 >= MIN_DEAL_SAVING_PERCENT) {
              Object.assign(candidate, { average: comparison.average, saving: -comparison.diff,
                sampleSize: Number(comparison.sampleSize), savingPercent });
              results.deals.push(candidate);
            }
          }
        }
      }
    }
    const byDistance = (a, b) => a.distance - b.distance || String(a.name).localeCompare(String(b.name));
    const byFreshness = (a, b) => settings.preferRecent ? a.freshnessRank - b.freshnessRank : 0;
    // Broad comparison bands favour stronger evidence without implying a quality rating.
    const evidenceBand = item => item.sampleSize >= 5 ? 2 : item.sampleSize >= 3 ? 1 : 0;
    const byDeal = (a, b) => byFreshness(a, b) || evidenceBand(b) - evidenceBand(a) || b.savingPercent - a.savingPercent || byDistance(a, b);
    results.favourites.sort((a, b) => byFreshness(a, b) || byDistance(a, b));
    results.shops.sort((a, b) => byFreshness(a, b) || byDistance(a, b));
    results.unvisited.sort((a, b) => byFreshness(a, b) || byDistance(a, b));
    results.deals.sort(byDeal);

    // Select one useful lead per shop, with explicit reasons for every signal.
    const highlightsByShop = new Map();
    for (const item of [...results.favourites, ...results.deals, ...results.shops, ...results.unvisited]) {
      const reasons = [];
      if (item.isSavedStrain) reasons.push('Saved strain');
      if (Number.isFinite(item.savingPercent)) reasons.push(`${Math.floor(item.savingPercent + 1e-9)}% below average`);
      if (item.favorite) reasons.push('Saved shop');
      if (settings.showUnvisited && !item.visited) reasons.push('Not marked visited');
      if (item.distance <= 1000) reasons.push('Within 1 km');
      const score = (item.isSavedStrain ? 4 : 0) + (Number.isFinite(item.savingPercent) ? 3 : 0) +
        (item.favorite ? 2 : 0) + (settings.showUnvisited && !item.visited ? 1 : 0) + (item.distance <= 1000 ? 1 : 0);
      const candidate = { ...item, reasons, score };
      const existing = highlightsByShop.get(item.index);
      if (!existing || score > existing.score || (score === existing.score && byFreshness(candidate, existing) < 0) ||
          (score === existing.score && byFreshness(candidate, existing) === 0 && (candidate.sampleSize || 0) > (existing.sampleSize || 0))) {
        highlightsByShop.set(item.index, candidate);
      }
    }
    results.highlights = [...highlightsByShop.values()].sort((a, b) =>
      byFreshness(a, b) || b.score - a.score || (b.sampleSize || 0) - (a.sampleSize || 0) || byDistance(a, b)).slice(0, 5);
    return results;
  }

  return { PROFILE_KEY, SITE_DEFAULTS_KEY, STRAIN_KEYS, LOCATION_KEYS, DEFAULTS, RADIUS_OPTIONS_KM, MIN_DEAL_SAVING_PERCENT, normalise, readStrains, writeStrains,
    readLocations, writeLocations, locationKey, cleanProfile, readProfile, writeProfile, readSiteDefaults, writeSiteDefaults, formatRadius, isPopulated, distanceMeters, nearby };
});
