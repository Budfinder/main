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

  function editDistance(left, right, maxDistance = Infinity) {
    const a = String(left || '');
    const b = String(right || '');
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
      const current = [row];
      let rowMinimum = row;
      for (let column = 1; column <= b.length; column += 1) {
        const substitution = previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1);
        const value = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
        current[column] = value;
        rowMinimum = Math.min(rowMinimum, value);
      }
      if (rowMinimum > maxDistance) return maxDistance + 1;
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

  const api = Object.freeze({ normalise, simplify, tokens, editDistance, score, matches, rank });
  window.BudfinderSearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
