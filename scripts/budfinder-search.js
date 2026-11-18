(() => {
  'use strict';

  const normaliseCache = new Map();
  const simplifyCache = new Map();
  const OPTIONAL_ENTITY_WORDS = new Set([
    'cafe', 'coffeeshop', 'coffee', 'shop',
    'seed', 'seeds', 'bank', 'genetic', 'genetics',
    'farm', 'farms', 'collective', 'company', 'co'
  ]);
  const CITY_ALIASES = new Map([
    ['the hague', 'den haag'],
    ['s gravenhage', 'den haag'],
    ['gronigen', 'groningen']
  ]);

  function memoise(cache, key, value) {
    if (cache.size > 12000) cache.clear();
    cache.set(key, value);
    return value;
  }

  function normalise(value) {
    const raw = String(value == null ? '' : value);
    if (normaliseCache.has(raw)) return normaliseCache.get(raw);
    let text = raw
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      // Short alphanumeric names use the same search spelling: G-13 / G 13 /
      // G13, AK-47 / AK47, RS-11 / RS11. Keep suffixes and crosses intact.
      .replace(/\b([a-z]{1,3}) (\d{1,3})\b/g, '$1$2')
      .trim();
    text = CITY_ALIASES.get(text) || text;
    return memoise(normaliseCache, raw, text);
  }

  function tokens(value) {
    return normalise(value).split(' ').filter(Boolean);
  }

  function simplify(value) {
    const raw = String(value == null ? '' : value);
    if (simplifyCache.has(raw)) return simplifyCache.get(raw);
    const parts = tokens(raw);
    const useful = parts.filter(part => !OPTIONAL_ENTITY_WORDS.has(part));
    const text = (useful.length ? useful : parts).join(' ');
    return memoise(simplifyCache, raw, text);
  }

  function editDistance(left, right, maxDistance = Infinity, allowTransposition = false) {
    const a = String(left || '');
    const b = String(right || '');
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    let beforePrevious;
    for (let row = 1; row <= a.length; row += 1) {
      const current = [row];
      let rowMinimum = row;
      for (let column = 1; column <= b.length; column += 1) {
        const substitution = previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1);
        let value = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
        if (allowTransposition && row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
          value = Math.min(value, beforePrevious[column - 2] + 1);
        }
        current[column] = value;
        rowMinimum = Math.min(rowMinimum, value);
      }
      if (rowMinimum > maxDistance) return maxDistance + 1;
      beforePrevious = previous;
      previous = current;
    }
    return previous[b.length];
  }

  function allowedTypos(length) {
    if (length < 4) return 0;
    if (length < 7) return 1;
    return 2;
  }

  function tokenScore(candidateToken, queryToken) {
    if (!candidateToken || !queryToken) return 0;
    if (candidateToken === queryToken) return 1;
    if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) {
      const ratio = Math.min(candidateToken.length, queryToken.length) / Math.max(candidateToken.length, queryToken.length);
      return ratio >= 0.55 ? 0.9 : 0;
    }
    const maxTypos = allowedTypos(queryToken.length);
    if (!maxTypos) return 0;
    const distance = editDistance(candidateToken, queryToken, maxTypos);
    if (distance > maxTypos) return 0;
    return 0.82 - ((distance - 1) * 0.1);
  }

  function scoreOne(candidate, query) {
    const text = normalise(candidate);
    const q = normalise(query);
    if (!text || !q) return 0;
    if (text === q) return 1;

    const simpleText = simplify(text);
    const simpleQuery = simplify(q);
    if (simpleText && simpleText === simpleQuery) return 0.98;
    if (text.startsWith(q)) return 0.94;
    if (simpleText && simpleQuery && simpleText.startsWith(simpleQuery)) return 0.92;
    if (q.length >= 3 && (` ${text} `.includes(` ${q} `) || text.includes(q))) return 0.88;
    if (simpleQuery.length >= 3 && simpleText.includes(simpleQuery)) return 0.86;

    const candidateTokens = simpleText.split(' ').filter(Boolean);
    const queryTokens = simpleQuery.split(' ').filter(Boolean);
    if (!candidateTokens.length || !queryTokens.length) return 0;
    const bestScores = queryTokens.map(queryToken => candidateTokens.reduce(
      (best, candidateToken) => Math.max(best, tokenScore(candidateToken, queryToken)),
      0
    ));
    if (bestScores.some(value => value < 0.7)) return 0;
    const average = bestScores.reduce((sum, value) => sum + value, 0) / bestScores.length;
    const coverage = Math.min(1, queryTokens.length / candidateTokens.length);
    return Math.min(0.84, 0.66 + (average * 0.16) + (coverage * 0.02));
  }

  function score(candidate, query, aliases = []) {
    const values = [candidate, ...(Array.isArray(aliases) ? aliases : [])];
    return values.reduce((best, value) => Math.max(best, scoreOne(value, query)), 0);
  }

  function matches(candidate, query, options = {}) {
    if (!normalise(query)) return true;
    const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.72;
    return score(candidate, query, options.aliases) >= threshold;
  }

  function rank(query, candidates, options = {}) {
    const getLabel = typeof options.getLabel === 'function'
      ? options.getLabel
      : item => item && (item.label || item.name || item.value || item);
    const getAliases = typeof options.getAliases === 'function'
      ? options.getAliases
      : item => item && item.aliases;
    const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.72;
    const limit = Number.isFinite(options.limit) ? options.limit : Infinity;
    return (Array.isArray(candidates) ? candidates : [])
      .map((item, index) => ({ item, index, score: score(getLabel(item), query, getAliases(item)) }))
      .filter(result => result.score >= threshold)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit);
  }

  function entities(index = {}) {
    return [
      ...(index.shops || []).map(row => ({ kind: 'shop', name: row.name, city: row.city, shopId: row.shop_id })),
      ...(index.strains || []).map(row => ({ kind: 'strain', name: row.name, shopCount: row.shop_count })),
      ...(index.growers || []).map(row => ({ kind: 'grower', name: row.name, shopCount: row.shop_count, strainCount: row.strain_count })),
      ...(index.cities || []).map(row => ({ kind: 'city', name: row.name, shopCount: row.shop_count })),
      ...(index.intents || []).map(row => ({ kind: 'legal', name: row.name, aliases: row.aliases || [] }))
    ].filter(row => row.name);
  }

  function suggest(query, candidates, limit = 8) {
    const priority = { city: 0, shop: 1, area: 2, strain: 3, grower: 4, legal: 5 };
    return rank(query, candidates, { threshold: normalise(query).length < 3 ? 0.86 : 0.70 })
      .map(result => ({ ...result, exact: normalise(result.item.name) === normalise(query),
        rankScore: result.score + (result.item.kind === 'strain'
          ? Math.min(0.08, Math.log10(Number(result.item.shopCount || 0) + 1) * 0.035) : 0) }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.rankScore - a.rankScore ||
        Number(b.item.shopCount || 0) - Number(a.item.shopCount || 0) ||
        (priority[a.item.kind] ?? 9) - (priority[b.item.kind] ?? 9) || a.item.name.localeCompare(b.item.name))
      .slice(0, limit);
  }

  // Offer a unique nearby spelling as a choice, without changing search matching.
  function typoCorrection(query, names) {
    const words = tokens(query);
    if (!words.length || !words.some(word => word.length >= 4) || words.length > 6) return '';
    const seen = new Set();
    let bestName = '';
    let bestDistance = Math.min(words.length, 2) + 1;
    for (const name of names) {
      const candidate = tokens(name);
      if (candidate.length !== words.length) continue;
      const key = candidate.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      const distances = words.map((word, index) => editDistance(word, candidate[index], 1, true));
      if (distances.some((distance, index) => distance > (words[index].length >= 4 ? 1 : 0))) continue;
      const total = distances.reduce((sum, distance) => sum + distance, 0);
      if (total === 0) return '';
      if (total < bestDistance) {
        bestName = name;
        bestDistance = total;
      } else if (total === bestDistance) {
        bestName = '';
      }
    }
    return bestName;
  }

  const api = Object.freeze({ normalise, simplify, tokens, editDistance, score, matches, rank, entities, suggest, typoCorrection });
  window.BudfinderSearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
