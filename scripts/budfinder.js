(() => {
  'use strict';

  const AMSTERDAM_CENTER = [52.3676, 4.9041];
  const STORAGE_KEY = 'budfinder_public_product_v1';
  const ANALYTICS_KEY = 'budfinder_privacy_activity_v1';
  const DATA_PATHS = {
    locations: 'database/locations/amsterdamLoc.csv',
    shops: 'database/shops.json',
    offerings: 'database/active_offerings.json'
  };

  const els = {};
  const state = {
    loaded: false,
    shops: [],
    shopByKey: new Map(),
    shopById: new Map(),
    strainStats: new Map(),
    strainList: [],
    results: [],
    resultMode: 'explore',
    activeIntent: 'strain',
    activeQuery: '',
    activeStrainKeys: [],
    selectedShopKey: '',
    selectedMatchShops: new Set(),
    route: [],
    routeMode: 'walking',
    mobileSheetExpanded: false,
    userPosition: null,
    filters: {},
    sort: 'best',
    matchMode: 'any',
    map: null,
    heroMap: null,
    markers: new Map(),
    routeLine: null,
    saved: {
      strains: [],
      shops: [],
      routes: [],
      searches: []
    },
    analytics: {
      searches: {},
      viewedShops: {},
      filters: {},
      failedSearches: {},
      savedStrains: {},
      routeStops: {}
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindElements();
    loadLocalState();
    bindEvents();
    initMapsWhenReady();
    loadData();
  });

  function bindElements() {
    [
      'universal-search', 'universal-search-form', 'search-suggestions', 'data-status',
      'insight-strip', 'results-heading', 'results-summary', 'results-list', 'sort-select',
      'filter-count', 'map', 'hero-map-preview', 'shop-detail', 'mobile-sheet',
      'route-stops', 'route-summary', 'open-route-link', 'strain-picker-search',
      'strain-picker-list', 'wanted-list', 'wanted-summary', 'matching-shop-list',
      'shop-directory-search', 'shop-directory', 'saved-overview', 'saved-strains',
      'saved-shops', 'recent-searches', 'analytics-panel', 'toast', 'feedback-form',
      'custom-data-input'
    ].forEach(id => {
      els[toCamel(id)] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll('[data-focus-search]').forEach(button => {
      button.addEventListener('click', () => focusSearch());
    });

    document.querySelectorAll('[data-intent]').forEach(button => {
      button.addEventListener('click', () => {
        state.activeIntent = button.dataset.intent || 'strain';
        document.querySelectorAll('[data-intent]').forEach(item => item.classList.toggle('is-active', item === button));
        if (state.activeIntent === 'nearby') {
          locateUser({ searchNearby: true });
        } else {
          focusSearch();
        }
      });
    });

    els.universalSearchForm.addEventListener('submit', event => {
      event.preventDefault();
      runSearch(els.universalSearch.value);
    });

    els.universalSearch.addEventListener('input', debounce(() => {
      runSearch(els.universalSearch.value, { soft: true });
    }, 180));

    document.querySelectorAll('[data-query]').forEach(button => {
      button.addEventListener('click', () => {
        const query = button.dataset.query || '';
        els.universalSearch.value = query;
        runSearch(query);
        document.getElementById('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    document.querySelectorAll('[data-filter]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.filter;
        state.filters[key] = input.checked;
        incrementCounter(state.analytics.filters, key);
        saveAnalytics();
        updateFilterCount();
        runSearch(state.activeQuery, { preserveQuery: true });
      });
    });

    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value || 'best';
      renderResults();
      updateMapMarkers();
    });

    document.querySelectorAll('[data-route-mode]').forEach(button => {
      button.addEventListener('click', () => {
        state.routeMode = button.dataset.routeMode || 'walking';
        document.querySelectorAll('[data-route-mode]').forEach(item => item.classList.toggle('is-active', item === button));
        renderRoute();
        updateRouteLine();
      });
    });

    document.querySelectorAll('[data-clear-route]').forEach(button => {
      button.addEventListener('click', () => {
        state.route = [];
        saveLocalState();
        renderRoute();
        updateRouteLine();
        toast('Route cleared.');
      });
    });

    document.querySelectorAll('[data-route-optimize]').forEach(button => {
      button.addEventListener('click', () => optimizeRoute(button.dataset.routeOptimize));
    });

    document.querySelectorAll('[data-center-map]').forEach(button => {
      button.addEventListener('click', () => fitMapToResults());
    });

    document.querySelectorAll('[data-locate-user]').forEach(button => {
      button.addEventListener('click', () => locateUser({ searchNearby: true }));
    });

    els.resultsList.addEventListener('click', handleActionClick);
    els.shopDetail.addEventListener('click', handleActionClick);
    els.mobileSheet.addEventListener('click', event => {
      const sheetToggle = event.target.closest('[data-sheet-toggle]');
      if (sheetToggle) {
        state.mobileSheetExpanded = !state.mobileSheetExpanded;
        els.mobileSheet.classList.toggle('is-expanded', state.mobileSheetExpanded);
        sheetToggle.setAttribute('aria-expanded', String(state.mobileSheetExpanded));
        sheetToggle.textContent = state.mobileSheetExpanded ? 'Collapse details' : 'Expand details';
        return;
      }
      handleActionClick(event);
    });
    els.routeStops.addEventListener('click', handleRouteClick);
    els.strainPickerList.addEventListener('click', handleStrainPickerClick);
    els.matchingShopList.addEventListener('click', handleActionClick);
    els.shopDirectory.addEventListener('click', handleActionClick);
    els.savedStrains.addEventListener('click', handleSavedClick);
    els.savedStrains.addEventListener('input', handleSavedInput);
    els.savedShops.addEventListener('click', handleActionClick);
    els.recentSearches.addEventListener('click', event => {
      const button = event.target.closest('[data-recent-query]');
      if (!button) return;
      els.universalSearch.value = button.dataset.recentQuery || '';
      runSearch(els.universalSearch.value);
      document.getElementById('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    els.strainPickerSearch.addEventListener('input', debounce(renderStrainPicker, 160));
    els.shopDirectorySearch.addEventListener('input', debounce(renderShopDirectory, 160));

    document.querySelectorAll('[data-match-mode]').forEach(button => {
      button.addEventListener('click', () => {
        state.matchMode = button.dataset.matchMode || 'any';
        document.querySelectorAll('[data-match-mode]').forEach(item => item.classList.toggle('is-active', item === button));
        renderWantedWorkflow();
      });
    });

    document.querySelector('[data-send-selected-to-map]').addEventListener('click', () => {
      const selected = [...state.selectedMatchShops];
      if (!selected.length) {
        toast('Select at least one matching shop first.');
        return;
      }
      state.results = selected.map(key => buildResultForShop(state.shopByKey.get(key), { reason: 'Selected from Strain Explorer.' })).filter(Boolean);
      state.resultMode = 'selected';
      renderResults();
      updateMapMarkers();
      fitMapToResults();
      document.getElementById('map-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Selected shops sent to the map.');
    });

    if (els.feedbackForm) {
      els.feedbackForm.addEventListener('submit', event => {
        event.preventDefault();
        const type = document.getElementById('feedback-type').value;
        const notes = document.getElementById('feedback-notes').value.trim();
        const reports = readJson('budfinder_local_feedback_v1', []);
        reports.unshift({ type, notes, createdAt: new Date().toISOString(), query: state.activeQuery });
        writeJson('budfinder_local_feedback_v1', reports.slice(0, 30));
        document.getElementById('feedback-notes').value = '';
        toast('Report saved locally.');
      });
    }

    if (els.customDataInput) {
      els.customDataInput.addEventListener('change', handleCustomDataImport);
    }
  }

  async function loadData() {
    setStatus('Loading coffeeshop data...');
    try {
      const [locationsText, shopsRows, offeringRows] = await Promise.all([
        fetchText(DATA_PATHS.locations),
        fetchJson(DATA_PATHS.shops),
        fetchJson(DATA_PATHS.offerings)
      ]);
      buildDataModel(locationsText, shopsRows, offeringRows);
      state.loaded = true;
      setStatus(`${state.shops.length} Amsterdam coffeeshops ready. Search Gelato, Family First, De Pijp, or tap a quick chip.`);
      hydrateSuggestions();
      renderAll();
      initHeroMarkers();
      runSearch('', { preserveQuery: true });
    } catch (error) {
      console.error(error);
      setStatus('Data is still loading. Please try again in a moment.');
      renderEmptyResults('Data is still loading.', 'Try refreshing the page, or use Settings to import custom data.');
    }
  }

  function buildDataModel(locationsText, shopsRows, offeringRows) {
    const locationRows = parseCsv(locationsText);
    const shopMetaByKey = new Map();
    const shopMetaByName = new Map();

    shopsRows.forEach(row => {
      const key = normaliseKey(row.shop_key);
      if (key) shopMetaByKey.set(key, row);
      shopMetaByName.set(nameCityKey(row.name, row.city), row);
    });

    const offeringBuckets = new Map();
    const offeringByName = new Map();
    offeringRows.forEach(row => {
      const key = normaliseKey(row.shop_key);
      if (key) pushMapArray(offeringBuckets, key, row);
      pushMapArray(offeringByName, nameCityKey(row.shop_name, row.shop_city), row);
    });

    const shops = [];
    locationRows.forEach((row, index) => {
      if (yesNo(row.Coffeeshop) !== true) return;
      const lat = parseFloat(row.lat);
      const lng = parseFloat(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const locationKey = normaliseKey(row.shop_key);
      const byName = shopMetaByName.get(nameCityKey(row.name, 'Amsterdam'));
      const meta = shopMetaByKey.get(locationKey) || byName || {};
      const metaKey = normaliseKey(meta.shop_key) || locationKey;
      const rows = [
        ...(offeringBuckets.get(locationKey) || []),
        ...(offeringBuckets.get(metaKey) || []),
        ...(offeringByName.get(nameCityKey(row.name, 'Amsterdam')) || [])
      ];
      const uniqueRows = uniqueOfferings(rows);
      const key = metaKey || locationKey || `shop-${index}`;
      const shop = {
        id: Number.isFinite(Number(meta.shop_id)) ? Number(meta.shop_id) : inferShopId(uniqueRows),
        key,
        locationKey,
        name: clean(row.name || meta.name || 'Unknown shop'),
        city: 'Amsterdam',
        area: inferArea(lat, lng, row.name),
        lat,
        lng,
        website: clean(row.website || meta.shop_url || ''),
        logo: clean(row.logo || ''),
        isClosed: yesNo(row.Closed) || Number(meta.is_closed) === 1,
        rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
        visited: yesNo(row.visited),
        menuStatus: clean(meta.menu_status || ''),
        source: 'CoffeeshopMenus',
        fetchedAt: clean(meta.fetched_at_utc || ''),
        menuImage: clean(meta.image_url || ''),
        offerings: uniqueRows,
        hours: null
      };
      deriveShopStats(shop);
      shops.push(shop);
    });

    state.shops = shops.sort((a, b) => a.name.localeCompare(b.name));
    state.shopByKey = new Map(state.shops.map(shop => [shop.key, shop]));
    state.shopById = new Map(state.shops.filter(shop => shop.id).map(shop => [String(shop.id), shop]));
    buildStrainStats(state.shops);
  }

  function deriveShopStats(shop) {
    const prices = shop.offerings.map(row => Number(row.price_amount)).filter(Number.isFinite);
    const dates = shop.offerings.map(row => parseDate(row.updated_at || row.last_seen_at_utc)).filter(Boolean);
    const latest = dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))) : parseDate(shop.fetchedAt);
    const strainKeys = new Set();
    const typeCounts = {};
    shop.offerings.forEach(row => {
      const strainKey = normaliseStrain(row.strain_name_normalised || row.strain_name);
      if (strainKey) strainKeys.add(strainKey);
      const type = normaliseText(row.base_type || 'unknown') || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    shop.menuUpdated = latest ? latest.toISOString() : '';
    shop.freshnessDays = latest ? daysSince(latest) : Infinity;
    shop.confidence = confidenceForShop(shop);
    shop.strainCount = strainKeys.size;
    shop.typeCounts = typeCounts;
    shop.minPrice = prices.length ? Math.min(...prices) : null;
    shop.maxPrice = prices.length ? Math.max(...prices) : null;
    shop.averagePrice = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
    shop.cheapestOffering = shop.offerings
      .filter(row => Number.isFinite(Number(row.price_amount)))
      .sort((a, b) => Number(a.price_amount) - Number(b.price_amount))[0] || null;
    shop.badges = badgesForShop(shop);
  }

  function buildStrainStats(shops) {
    const stats = new Map();
    shops.forEach(shop => {
      shop.offerings.forEach(row => {
        const key = normaliseStrain(row.strain_name_normalised || row.strain_name);
        if (!key) return;
        if (!stats.has(key)) {
          stats.set(key, {
            key,
            name: displayStrainName(row.strain_name_normalised || row.strain_name),
            aliases: new Set(),
            shops: new Set(),
            rows: [],
            prices: [],
            types: {},
            latest: null,
            isCali: false
          });
        }
        const stat = stats.get(key);
        stat.aliases.add(displayStrainName(row.strain_name || row.strain_name_normalised));
        stat.shops.add(shop.key);
        stat.rows.push({ ...row, shopKey: shop.key });
        const price = Number(row.price_amount);
        if (Number.isFinite(price)) stat.prices.push(price);
        const type = normaliseText(row.base_type || 'unknown') || 'unknown';
        stat.types[type] = (stat.types[type] || 0) + 1;
        stat.isCali = stat.isCali || Number(row.is_cali) === 1;
        const seen = parseDate(row.updated_at || row.last_seen_at_utc);
        if (seen && (!stat.latest || seen > stat.latest)) stat.latest = seen;
      });
    });
    stats.forEach(stat => {
      stat.shopCount = stat.shops.size;
      stat.minPrice = stat.prices.length ? Math.min(...stat.prices) : null;
      stat.maxPrice = stat.prices.length ? Math.max(...stat.prices) : null;
      stat.averagePrice = stat.prices.length ? stat.prices.reduce((sum, value) => sum + value, 0) / stat.prices.length : null;
      stat.primaryType = Object.entries(stat.types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      stat.freshnessDays = stat.latest ? daysSince(stat.latest) : Infinity;
    });
    state.strainStats = stats;
    state.strainList = [...stats.values()].sort((a, b) => {
      const stockDiff = b.shopCount - a.shopCount;
      return stockDiff || a.name.localeCompare(b.name);
    });
  }

  function runSearch(rawQuery, options = {}) {
    if (!state.loaded) return;
    const query = clean(rawQuery);
    if (!options.soft || query.length > 1 || query.length === 0) {
      state.activeQuery = query;
    }
    if (!options.preserveQuery) {
      els.universalSearch.value = query;
    }

    const parsed = parseSearchQuery(query);
    state.activeStrainKeys = parsed.strainKeys;
    state.resultMode = parsed.mode;

    if (query && !options.soft) {
      rememberSearch(query);
      incrementCounter(state.analytics.searches, query);
      saveAnalytics();
    }

    let results;
    if (parsed.mode === 'strain') {
      results = buildStrainResults(parsed);
    } else if (parsed.mode === 'shop') {
      results = buildShopSearchResults(parsed);
    } else if (parsed.mode === 'area') {
      results = buildAreaResults(parsed);
    } else if (parsed.mode === 'filter') {
      results = buildFilterResults(parsed);
    } else {
      results = buildExploreResults();
    }

    results = applyFilters(results);
    if (query && !results.length && !options.soft) {
      incrementCounter(state.analytics.failedSearches, query);
      saveAnalytics();
    }
    state.results = results;
    renderResults();
    updateMapMarkers();
    renderInsights();
    renderWantedWorkflow();
    renderSaved();
    updateUrlHashQuietly();
  }

  function parseSearchQuery(query) {
    const normal = normaliseText(query);
    const flags = {
      under10: /\bunder\s*€?\s*10|\bunder\s*10|10\/g/.test(normal),
      hash: /\bhash\b/.test(normal),
      cali: /\bcali\b|\bcaliforn/.test(normal),
      nearby: /\bnearby\b|\bnearest\b|\bclose\b/.test(normal),
      openNow: /\bopen\b/.test(normal)
    };

    if (flags.nearby && !state.userPosition) {
      locateUser({ quiet: true });
    }

    const stripped = normal
      .replace(/\bunder\s*€?\s*10\b|\bunder\s*10\b|10\/g/g, '')
      .replace(/\bhash\b|\bcali\b|\bcalifornia\b|\bnearby\b|\bnearest\b|\bopen\b|\bnow\b/g, '')
      .trim();

    if (!normal) return { mode: 'explore', query, flags, strainKeys: [] };
    if (flags.under10 || flags.hash || flags.cali || flags.openNow || flags.nearby) {
      const strainKeys = stripped ? findStrainCandidates(stripped).map(item => item.key) : [];
      return { mode: strainKeys.length ? 'strain' : 'filter', query, flags, strainKeys, cleanQuery: stripped };
    }

    const area = matchArea(normal);
    const shopMatches = findShopMatches(normal);
    const strainCandidates = findStrainCandidates(normal);

    if (state.activeIntent === 'shop' && shopMatches.length) {
      return { mode: 'shop', query, flags, shopMatches };
    }
    if (state.activeIntent === 'nearby') {
      return { mode: 'filter', query, flags: { ...flags, nearby: true }, cleanQuery: stripped };
    }
    if (strainCandidates.length && (state.activeIntent === 'strain' || strainCandidates[0].score >= 0.68 || shopMatches.length === 0)) {
      return { mode: 'strain', query, flags, strainKeys: strainCandidates.map(item => item.key), suggestion: strainCandidates[0] };
    }
    if (shopMatches.length) return { mode: 'shop', query, flags, shopMatches };
    if (area) return { mode: 'area', query, flags, area };

    return { mode: 'filter', query, flags, cleanQuery: normal };
  }

  function buildStrainResults(parsed) {
    const keys = parsed.strainKeys.slice(0, parsed.query && parsed.query.length <= 8 ? 60 : 24);
    const grouped = new Map();
    keys.forEach(key => {
      const stat = state.strainStats.get(key);
      if (!stat) return;
      stat.rows.forEach(row => {
        const shop = state.shopByKey.get(row.shopKey);
        if (!shop) return;
        if (!grouped.has(shop.key)) {
          grouped.set(shop.key, buildResultForShop(shop, { mode: 'strain', matchedOfferings: [], matchedStrains: new Set() }));
        }
        const result = grouped.get(shop.key);
        result.matchedOfferings.push(row);
        result.matchedStrains.add(stat.name);
      });
    });

    const results = [...grouped.values()].map(result => {
      finalizeResult(result);
      result.reason = whyResult(result, parsed);
      return result;
    });
    return sortResults(results);
  }

  function buildShopSearchResults(parsed) {
    return sortResults(parsed.shopMatches.map(shop => {
      const result = buildResultForShop(shop, { mode: 'shop' });
      result.reason = `${shop.name} matches your coffeeshop search. ${freshnessCopy(shop)}.`;
      return result;
    }));
  }

  function buildAreaResults(parsed) {
    return sortResults(state.shops
      .filter(shop => shop.area === parsed.area)
      .map(shop => buildResultForShop(shop, { reason: `${shop.name} is in ${shop.area}.` })));
  }

  function buildFilterResults(parsed) {
    let shops = state.shops.slice();
    if (parsed.flags.hash) shops = shops.filter(shop => shop.offerings.some(row => normaliseText(row.base_type) === 'hash'));
    if (parsed.flags.cali) shops = shops.filter(shop => shop.offerings.some(row => Number(row.is_cali) === 1));
    if (parsed.flags.under10) shops = shops.filter(shop => shop.offerings.some(row => Number(row.price_amount) <= 10));
    if (parsed.flags.nearby && state.userPosition) shops = shops.filter(shop => distanceToShop(shop) <= 2500);
    const results = shops.map(shop => buildResultForShop(shop, { reason: filterReason(parsed, shop) }));
    return sortResults(results);
  }

  function buildExploreResults() {
    return sortResults(state.shops.map(shop => buildResultForShop(shop, { reason: `${freshnessCopy(shop)} ${valueCopy(shop)}` }))).slice(0, 36);
  }

  function buildResultForShop(shop, extras = {}) {
    if (!shop) return null;
    const result = {
      shop,
      key: shop.key,
      mode: extras.mode || state.resultMode,
      matchedOfferings: extras.matchedOfferings || [],
      matchedStrains: extras.matchedStrains || new Set(),
      reason: extras.reason || '',
      distanceMeters: distanceToShop(shop),
      bestPrice: shop.minPrice,
      score: 0
    };
    finalizeResult(result);
    return result;
  }

  function finalizeResult(result) {
    const prices = result.matchedOfferings.map(row => Number(row.price_amount)).filter(Number.isFinite);
    if (prices.length) result.bestPrice = Math.min(...prices);
    result.distanceMeters = distanceToShop(result.shop);
    result.freshnessDays = result.shop.freshnessDays;
    result.confidenceRank = confidenceRank(result.shop.confidence);
    result.score = scoreResult(result);
    return result;
  }

  function applyFilters(results) {
    const active = state.filters;
    return results.filter(result => {
      const rows = result.matchedOfferings.length ? result.matchedOfferings : result.shop.offerings;
      if (active.sativa && !rows.some(row => normaliseText(row.base_type) === 'sativa')) return false;
      if (active.indica && !rows.some(row => normaliseText(row.base_type) === 'indica')) return false;
      if (active.hybrid && !rows.some(row => normaliseText(row.base_type) === 'hybrid')) return false;
      if (active.hash && !rows.some(row => normaliseText(row.base_type) === 'hash')) return false;
      if (active.cali && !rows.some(row => Number(row.is_cali) === 1)) return false;
      if (active.under10 && !rows.some(row => Number(row.price_amount) <= 10)) return false;
      if (active.fresh && result.shop.freshnessDays > 14) return false;
      if (active.walking && state.userPosition && result.distanceMeters > 2500) return false;
      return true;
    });
  }

  function sortResults(results) {
    const sorted = results.slice();
    const mode = state.sort;
    sorted.sort((a, b) => {
      if (mode === 'nearest') return compareNumber(a.distanceMeters, b.distanceMeters) || b.score - a.score;
      if (mode === 'cheapest') return compareNumber(a.bestPrice, b.bestPrice) || b.score - a.score;
      if (mode === 'freshest') return compareNumber(a.freshnessDays, b.freshnessDays) || b.score - a.score;
      if (mode === 'stocked') return b.shop.strainCount - a.shop.strainCount || b.score - a.score;
      if (mode === 'confidence') return b.confidenceRank - a.confidenceRank || b.score - a.score;
      return b.score - a.score || compareNumber(a.distanceMeters, b.distanceMeters);
    });
    return sorted;
  }

  function scoreResult(result) {
    let score = 0;
    const shop = result.shop;
    score += Math.max(0, 80 - Math.min(shop.freshnessDays, 90));
    score += result.confidenceRank * 14;
    score += Math.min(shop.strainCount, 60) * 0.45;
    if (Number.isFinite(result.bestPrice)) score += Math.max(0, 24 - result.bestPrice) * 1.8;
    if (Number.isFinite(result.distanceMeters)) score += Math.max(0, 2500 - result.distanceMeters) / 110;
    if (state.saved.shops.includes(shop.key)) score += 18;
    if (result.matchedOfferings.length) score += Math.min(40, result.matchedOfferings.length * 6);
    return score;
  }

  function renderAll() {
    renderInsights();
    renderResults();
    renderRoute();
    renderShopDetail();
    renderStrainPicker();
    renderWantedWorkflow();
    renderShopDirectory();
    renderSaved();
    renderAnalytics();
    updateFilterCount();
    updateMapMarkers();
    refreshIcons();
  }

  function renderResults() {
    const results = sortResults(state.results);
    state.results = results;
    const query = state.activeQuery;
    const heading = getResultsHeading();
    els.resultsHeading.textContent = heading.title;
    els.resultsSummary.textContent = heading.summary;

    if (!results.length) {
      const suggestion = query ? findStrainCandidates(query)[0] : null;
      const text = suggestion ? `No exact match found. Did you mean "${suggestion.name}"?` : 'No shops match the current search.';
      renderEmptyResults(text, 'Try broadening your search, clearing filters, or including older menu data.');
      return;
    }

    els.resultsList.innerHTML = results.slice(0, 40).map(renderResultCard).join('');
    refreshIcons();
  }

  function renderResultCard(result) {
    const shop = result.shop;
    const selected = state.selectedShopKey === shop.key;
    const isSaved = state.saved.shops.includes(shop.key);
    const matching = [...result.matchedStrains].slice(0, 4);
    const matchingText = matching.length ? `Carries ${matching.join(', ')}` : `${shop.strainCount} current offerings listed`;
    const distance = distanceLabel(result.distanceMeters);
    const walk = walkTimeLabel(result.distanceMeters);
    const price = priceLabel(result.bestPrice);
    const freshness = freshnessLabel(shop);
    const confidence = confidenceLabel(shop.confidence);
    const badges = badgesForResult(result).map(badge => `<span class="badge ${badge.tone}">${escapeHtml(badge.label)}</span>`).join('');
    const wantedButton = state.activeStrainKeys.length
      ? `<button type="button" data-action="save-strain" data-strain="${escapeAttr(getPrimaryActiveStrainName())}"><i data-lucide="bookmark-plus" aria-hidden="true"></i>Save strain</button>`
      : '';

    return `
      <article class="result-card ${selected ? 'is-selected' : ''}" data-shop-key="${escapeAttr(shop.key)}">
        <div class="card-head">
          <div class="card-title">
            <h3>${escapeHtml(shop.name)}</h3>
            <p>${escapeHtml(shop.area)} · ${distance}${walk ? ` · ${walk}` : ''}</p>
          </div>
          <span class="confidence-pill">${confidence}</span>
        </div>
        <p class="meta-line">${escapeHtml(matchingText)} · ${price} · ${freshness}</p>
        <div class="badge-row">${badges}</div>
        <p class="why-line"><strong>Why this result?</strong> ${escapeHtml(result.reason || whyResult(result, {}))}</p>
        <div class="card-actions">
          <button type="button" data-action="save-shop" data-shop-key="${escapeAttr(shop.key)}"><i data-lucide="${isSaved ? 'bookmark-check' : 'bookmark'}" aria-hidden="true"></i>${isSaved ? 'Saved' : 'Save'}</button>
          ${wantedButton}
          <button class="primary-card-action" type="button" data-action="add-route" data-shop-key="${escapeAttr(shop.key)}"><i data-lucide="plus" aria-hidden="true"></i>Add to route</button>
          <a href="${directionsUrl(shop)}" target="_blank" rel="noopener noreferrer"><i data-lucide="navigation" aria-hidden="true"></i>Directions</a>
          <button type="button" data-action="view-shop" data-shop-key="${escapeAttr(shop.key)}"><i data-lucide="panel-right-open" aria-hidden="true"></i>View details</button>
        </div>
      </article>
    `;
  }

  function renderEmptyResults(title, message) {
    els.resultsList.innerHTML = `
      <div class="empty-state">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    `;
  }

  function getResultsHeading() {
    const count = state.results.length;
    if (state.resultMode === 'strain') {
      const strain = getPrimaryActiveStrainName() || state.activeQuery;
      return {
        title: 'Best matches',
        summary: count
          ? `${count} shop${count === 1 ? '' : 's'} show ${strain || 'that strain'} or close variants. Ranked by usefulness, freshness, price, and distance.`
          : `No shops currently show ${strain || 'that strain'}.`
      };
    }
    if (state.resultMode === 'shop') return { title: 'Shop matches', summary: `${count} coffeeshop${count === 1 ? '' : 's'} match your search.` };
    if (state.resultMode === 'area') return { title: 'Area matches', summary: `${count} coffeeshop${count === 1 ? '' : 's'} found in this area.` };
    if (state.resultMode === 'filter') return { title: 'Filtered options', summary: `${count} coffeeshop${count === 1 ? '' : 's'} match the active filters.` };
    if (state.resultMode === 'selected') return { title: 'Selected shops', summary: `${count} shops were sent from the Strain Explorer.` };
    return { title: 'Useful starting points', summary: 'Fresh menus, stocked shops, and strong all-rounders while you decide what to search.' };
  }

  function renderInsights() {
    const results = state.results.length ? state.results : buildExploreResults();
    const best = results[0];
    const nearest = results.filter(item => Number.isFinite(item.distanceMeters)).sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    const cheapest = results.filter(item => Number.isFinite(item.bestPrice)).sort((a, b) => a.bestPrice - b.bestPrice)[0];
    const freshest = results.slice().sort((a, b) => a.freshnessDays - b.freshnessDays)[0];
    const cards = [
      insightCard('Best overall', best, result => `${priceLabel(result.bestPrice)} · ${freshnessLabel(result.shop)}`),
      insightCard('Nearest option', nearest, result => `${distanceLabel(result.distanceMeters)} · ${walkTimeLabel(result.distanceMeters) || 'route-ready'}`),
      insightCard('Best value', cheapest, result => `${priceLabel(result.bestPrice)} · ${result.shop.area}`),
      insightCard('Fresh menu data', freshest, result => `${freshnessLabel(result.shop)} · ${confidenceLabel(result.shop.confidence)}`)
    ];
    els.insightStrip.innerHTML = cards.join('');
  }

  function insightCard(label, result, detailFn) {
    if (!result) {
      return `<article class="insight-card"><strong>${label}</strong><h3>Waiting for intel</h3><p>Search or share location to unlock this view.</p></article>`;
    }
    return `
      <article class="insight-card" data-shop-key="${escapeAttr(result.shop.key)}">
        <strong>${escapeHtml(label)}</strong>
        <h3>${escapeHtml(result.shop.name)}</h3>
        <p>${escapeHtml(detailFn(result))}</p>
      </article>
    `;
  }

  function renderShopDetail(shop = state.shopByKey.get(state.selectedShopKey)) {
    const html = shop ? shopDetailHtml(shop) : `
      <div class="shop-detail-empty">
        <div>
          <p class="eyebrow">Selected shop</p>
          <h2>Choose a result or tap a map pin.</h2>
          <p class="shop-summary">Budfinder will show menu freshness, matching strains, value picks, route actions, and confidence notes here.</p>
        </div>
      </div>
    `;
    els.shopDetail.innerHTML = html;
    if (shop) {
      els.mobileSheet.innerHTML = `
        <button class="sheet-toggle" type="button" data-sheet-toggle aria-expanded="${state.mobileSheetExpanded ? 'true' : 'false'}">${state.mobileSheetExpanded ? 'Collapse details' : 'Expand details'}</button>
        ${html}
      `;
      els.mobileSheet.classList.add('is-visible');
      els.mobileSheet.classList.toggle('is-expanded', state.mobileSheetExpanded);
    } else {
      state.mobileSheetExpanded = false;
      els.mobileSheet.classList.remove('is-visible');
      els.mobileSheet.classList.remove('is-expanded');
      els.mobileSheet.innerHTML = '';
    }
    refreshIcons();
  }

  function shopDetailHtml(shop) {
    const isSaved = state.saved.shops.includes(shop.key);
    const wantedMatches = getWantedMatchesForShop(shop);
    const rareFinds = getRareFinds(shop).slice(0, 4);
    const valuePicks = getValuePicks(shop).slice(0, 5);
    const typeSummary = Object.entries(shop.typeCounts)
      .filter(([type]) => type !== 'unknown')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([type, count]) => `${titleCase(type)} ${count}`)
      .join(' · ') || 'Type mix unknown';
    const summary = shopSummary(shop, wantedMatches, rareFinds);
    const logo = shop.logo ? `<img class="shop-logo" src="images/logos/${escapeAttr(shop.logo)}" alt="${escapeAttr(shop.name)} logo" loading="lazy" />` : '';

    return `
      <div class="shop-detail-head">
        <div>
          <p class="eyebrow">Selected shop</p>
          <h2>${escapeHtml(shop.name)}</h2>
          <p class="meta-line">${escapeHtml(shop.area)} · Opening hours unknown · ${freshnessLabel(shop)}</p>
        </div>
        ${logo}
      </div>
      <p class="shop-summary">${escapeHtml(summary)}</p>
      <div class="badge-row">${shop.badges.map(badge => `<span class="badge ${badge.tone}">${escapeHtml(badge.label)}</span>`).join('')}</div>
      <div class="stat-grid">
        <span>Current offerings <strong>${shop.strainCount}</strong></span>
        <span>Average price <strong>${shop.averagePrice ? `€${shop.averagePrice.toFixed(0)}/g` : 'Unknown'}</strong></span>
        <span>Cheapest strain <strong>${shop.cheapestOffering ? `${displayStrainName(shop.cheapestOffering.strain_name)} ${priceLabel(Number(shop.cheapestOffering.price_amount))}` : 'Price missing'}</strong></span>
        <span>Menu confidence <strong>${confidenceLabel(shop.confidence)}</strong></span>
      </div>
      <p class="meta-line"><strong>Address:</strong> Address not in current data. <strong>Source:</strong> ${escapeHtml(shop.source)}. <strong>Types:</strong> ${escapeHtml(typeSummary)}.</p>
      <div class="shop-detail-actions">
        <button type="button" data-action="save-shop" data-shop-key="${escapeAttr(shop.key)}"><i data-lucide="${isSaved ? 'bookmark-check' : 'bookmark'}" aria-hidden="true"></i>${isSaved ? 'Saved shop' : 'Save shop'}</button>
        <button class="primary-card-action" type="button" data-action="add-route" data-shop-key="${escapeAttr(shop.key)}"><i data-lucide="plus" aria-hidden="true"></i>Add to route</button>
        <a href="${directionsUrl(shop)}" target="_blank" rel="noopener noreferrer"><i data-lucide="navigation" aria-hidden="true"></i>Get directions</a>
        ${shop.website ? `<a href="${escapeAttr(shop.website)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" aria-hidden="true"></i>View source</a>` : ''}
      </div>
      <h3>Best current finds</h3>
      <div class="offering-list">
        ${(valuePicks.length ? valuePicks : shop.offerings.slice(0, 5)).map(row => offeringRowHtml(row)).join('')}
      </div>
      <p class="meta-line"><strong>Rare finds:</strong> ${rareFinds.length ? rareFinds.join(', ') : 'No rare finds detected yet.'}</p>
      <p class="meta-line"><strong>Wanted-list match:</strong> ${wantedMatches.length ? wantedMatches.join(', ') : 'No saved strains currently match this shop.'}</p>
    `;
  }

  function offeringRowHtml(row) {
    const type = titleCase(row.base_type || 'unknown');
    const price = Number.isFinite(Number(row.price_amount)) ? `€${Number(row.price_amount).toFixed(Number(row.price_amount) % 1 ? 1 : 0)}/${row.price_unit || 'g'}` : 'Price not listed';
    const lastSeen = lastSeenLabel(row.updated_at || row.last_seen_at_utc);
    return `
      <div class="offering-row">
        <div>
          <strong>${escapeHtml(displayStrainName(row.strain_name || row.strain_name_normalised))}</strong>
          <small>${escapeHtml(type)}${Number(row.is_cali) === 1 ? ' · Cali' : ''} · ${escapeHtml(lastSeen)}</small>
        </div>
        <strong>${escapeHtml(price)}</strong>
      </div>
    `;
  }

  function renderRoute() {
    if (!state.route.length) {
      els.routeStops.innerHTML = '<li><span>No route stops yet. Add a promising shop from any result card.</span></li>';
      els.routeSummary.innerHTML = routeMetricHtml('Shops', '0') + routeMetricHtml('Wanted strains covered', '0');
      els.openRouteLink.classList.add('is-disabled');
      els.openRouteLink.href = '#';
      return;
    }

    els.routeStops.innerHTML = state.route.map((key, index) => {
      const shop = state.shopByKey.get(key);
      if (!shop) return '';
      return `
        <li>
          <span><strong>${index + 1}. ${escapeHtml(shop.name)}</strong><small class="meta-line">${escapeHtml(shop.area)} · ${priceLabel(shop.minPrice)} · ${freshnessLabel(shop)}</small></span>
          <span class="route-stop-actions">
            <button type="button" data-route-move="${index}" data-direction="-1" aria-label="Move ${escapeAttr(shop.name)} earlier">↑</button>
            <button type="button" data-route-move="${index}" data-direction="1" aria-label="Move ${escapeAttr(shop.name)} later">↓</button>
            <button type="button" data-route-remove="${index}" aria-label="Remove ${escapeAttr(shop.name)}">×</button>
          </span>
        </li>
      `;
    }).join('');

    const routeShops = state.route.map(key => state.shopByKey.get(key)).filter(Boolean);
    const totalDistance = routeDistance(routeShops);
    const covered = routeWantedCoverage(routeShops);
    const bestValue = routeShops.slice().sort((a, b) => compareNumber(a.minPrice, b.minPrice))[0];
    const freshest = routeShops.slice().sort((a, b) => a.freshnessDays - b.freshnessDays)[0];
    els.routeSummary.innerHTML = [
      routeMetricHtml('Total distance', totalDistance ? `${(totalDistance / 1000).toFixed(1)} km` : 'Set start'),
      routeMetricHtml(`${titleCase(state.routeMode)} time`, totalDistance ? estimateDuration(totalDistance, state.routeMode) : 'Set start'),
      routeMetricHtml('Wanted strains covered', String(covered)),
      routeMetricHtml('Best value stop', bestValue ? bestValue.name : 'Unknown'),
      routeMetricHtml('Freshest menu stop', freshest ? freshest.name : 'Unknown')
    ].join('');
    els.openRouteLink.href = routeUrl(routeShops);
    els.openRouteLink.classList.toggle('is-disabled', routeShops.length === 0);
    refreshIcons();
  }

  function routeMetricHtml(label, value) {
    return `<span>${escapeHtml(label)} <strong>${escapeHtml(value)}</strong></span>`;
  }

  function renderStrainPicker() {
    const query = normaliseText(els.strainPickerSearch.value || '');
    const selectedKeys = new Set(state.saved.strains.map(item => item.key));
    const list = state.strainList
      .filter(stat => !query || normaliseText(stat.name).includes(query) || [...stat.aliases].some(alias => normaliseText(alias).includes(query)))
      .slice(0, 18);

    if (!list.length) {
      els.strainPickerList.innerHTML = '<div class="empty-state"><p>No strains match that search. Try a broader name or common variant.</p></div>';
      return;
    }

    els.strainPickerList.innerHTML = list.map(stat => {
      const saved = selectedKeys.has(stat.key);
      return `
        <article class="strain-pill">
          <span>
            <strong>${escapeHtml(stat.name)}</strong>
            <small>${stat.shopCount} shops · ${priceRangeLabel(stat)} · ${titleCase(stat.primaryType)}</small>
          </span>
          <button type="button" data-picker-strain="${escapeAttr(stat.key)}">${saved ? 'Saved' : 'Save'}</button>
        </article>
      `;
    }).join('');
  }

  function renderWantedWorkflow() {
    const savedKeys = state.saved.strains.map(item => item.key);
    if (!savedKeys.length) {
      els.wantedList.innerHTML = '<div class="empty-state"><p>No strains saved yet. Search for a strain and tap Save to build your wanted list.</p></div>';
      els.wantedSummary.innerHTML = '';
      els.matchingShopList.innerHTML = '<div class="empty-state"><p>Add wanted strains to find matching coffeeshops.</p></div>';
      return;
    }

    els.wantedList.innerHTML = state.saved.strains.map(item => `
      <article class="saved-card">
        <strong>${escapeHtml(item.name)}</strong>
        <p class="meta-line">${item.priority ? 'High priority' : 'Normal priority'} · ${item.notes ? escapeHtml(item.notes) : 'No notes yet'}</p>
        <div class="card-actions">
          <button type="button" data-action="search-strain" data-strain="${escapeAttr(item.name)}">Show matches</button>
          <button type="button" data-remove-saved-strain="${escapeAttr(item.key)}">Remove</button>
        </div>
      </article>
    `).join('');

    const matches = buildWantedMatches();
    const strong = matches.filter(row => row.matchCount >= Math.min(3, savedKeys.length)).length;
    els.wantedSummary.innerHTML = [
      routeMetricHtml('Saved strains', String(savedKeys.length)),
      routeMetricHtml('Matching shops', String(matches.length)),
      routeMetricHtml('Strong matches', String(strong))
    ].join('');

    if (!matches.length) {
      els.matchingShopList.innerHTML = '<div class="empty-state"><p>No shops match the current wanted-list rule. Try matching any strain instead.</p></div>';
      return;
    }

    els.matchingShopList.innerHTML = matches.slice(0, 16).map(row => {
      const selected = state.selectedMatchShops.has(row.shop.key);
      return `
        <article class="result-card ${selected ? 'is-selected' : ''}">
          <div class="card-head">
            <div class="card-title">
              <h3>${escapeHtml(row.shop.name)}</h3>
              <p>${row.matchCount}/${savedKeys.length} wanted strains · ${priceLabel(row.shop.minPrice)} · ${freshnessLabel(row.shop)}</p>
            </div>
            <span class="confidence-pill">${confidenceLabel(row.shop.confidence)}</span>
          </div>
          <p class="meta-line">${escapeHtml(row.matches.join(', '))}</p>
          <div class="card-actions">
            <button type="button" data-action="toggle-match-shop" data-shop-key="${escapeAttr(row.shop.key)}">${selected ? 'Selected' : 'Select'}</button>
            <button type="button" data-action="view-shop" data-shop-key="${escapeAttr(row.shop.key)}">View details</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderShopDirectory() {
    const query = normaliseText(els.shopDirectorySearch.value || '');
    const rows = state.shops
      .filter(shop => !query || normaliseText(`${shop.name} ${shop.area}`).includes(query))
      .sort((a, b) => b.strainCount - a.strainCount || a.name.localeCompare(b.name))
      .slice(0, 60);

    els.shopDirectory.innerHTML = rows.map(shop => `
      <article class="shop-card ${state.saved.shops.includes(shop.key) ? 'is-selected' : ''}">
        <div class="card-head">
          <div class="card-title">
            <h3>${escapeHtml(shop.name)}</h3>
            <p>${escapeHtml(shop.area)} · ${shop.strainCount} offerings · ${freshnessLabel(shop)}</p>
          </div>
          <span class="confidence-pill">${confidenceLabel(shop.confidence)}</span>
        </div>
        <div class="badge-row">${shop.badges.slice(0, 4).map(badge => `<span class="badge ${badge.tone}">${escapeHtml(badge.label)}</span>`).join('')}</div>
        <div class="card-actions">
          <button type="button" data-action="view-shop" data-shop-key="${escapeAttr(shop.key)}">View shop</button>
          <button type="button" data-action="save-shop" data-shop-key="${escapeAttr(shop.key)}">${state.saved.shops.includes(shop.key) ? 'Saved' : 'Save'}</button>
          <button type="button" data-action="add-route" data-shop-key="${escapeAttr(shop.key)}">Add to route</button>
        </div>
      </article>
    `).join('');
  }

  function renderSaved() {
    const savedStrains = state.saved.strains;
    const savedShops = state.saved.shops.map(key => state.shopByKey.get(key)).filter(Boolean);
    const matches = buildWantedMatches();
    const strong = matches.filter(row => row.matchCount >= Math.min(3, savedStrains.length)).length;

    els.savedOverview.innerHTML = [
      routeMetricHtml('Saved strains', String(savedStrains.length)),
      routeMetricHtml('Shops with a match', String(matches.length)),
      routeMetricHtml('Strong matches', String(strong))
    ].join('');

    els.savedStrains.innerHTML = savedStrains.length ? savedStrains.map(item => `
      <article class="saved-card">
        <div class="card-head">
          <div class="card-title">
            <h3>${escapeHtml(item.name)}</h3>
            <p>${item.priority ? 'High priority' : 'Normal priority'} · ${state.strainStats.get(item.key)?.shopCount || 0} shops</p>
          </div>
          <button type="button" data-priority-strain="${escapeAttr(item.key)}">${item.priority ? 'Priority' : 'Mark priority'}</button>
        </div>
        <label class="meta-line" for="notes-${escapeAttr(item.key)}">Notes</label>
        <textarea id="notes-${escapeAttr(item.key)}" data-note-strain="${escapeAttr(item.key)}" rows="2" placeholder="Add notes">${escapeHtml(item.notes || '')}</textarea>
        <div class="card-actions">
          <button type="button" data-action="search-strain" data-strain="${escapeAttr(item.name)}">See shops</button>
          <button type="button" data-remove-saved-strain="${escapeAttr(item.key)}">Remove</button>
        </div>
      </article>
    `).join('') : '<div class="empty-state"><p>No strains saved yet. Search for a strain and tap Save to build your wanted list.</p></div>';

    els.savedShops.innerHTML = savedShops.length ? savedShops.map(shop => `
      <article class="saved-card">
        <h3>${escapeHtml(shop.name)}</h3>
        <p class="meta-line">${distanceLabel(distanceToShop(shop))} · ${freshnessLabel(shop)} · ${getWantedMatchesForShop(shop).length} saved strains available</p>
        <div class="card-actions">
          <button type="button" data-action="view-shop" data-shop-key="${escapeAttr(shop.key)}">View shop</button>
          <a href="${directionsUrl(shop)}" target="_blank" rel="noopener noreferrer">Directions</a>
          <button type="button" data-action="save-shop" data-shop-key="${escapeAttr(shop.key)}">Remove</button>
        </div>
      </article>
    `).join('') : '<div class="empty-state"><p>No favourite shops yet. Save shops from search results or map pins.</p></div>';

    els.recentSearches.innerHTML = state.saved.searches.length ? state.saved.searches.map(query => `
      <button type="button" class="saved-tag" data-recent-query="${escapeAttr(query)}">${escapeHtml(query)}</button>
    `).join('') : '<div class="empty-state"><p>No recent searches yet.</p></div>';

    renderStrainPicker();
    renderAnalytics();
    refreshIcons();
  }

  function renderAnalytics() {
    const topSearches = topCounters(state.analytics.searches, 6);
    const topShops = topCounters(state.analytics.viewedShops, 6);
    els.analyticsPanel.innerHTML = `
      <p>Stored only in this browser.</p>
      <strong>Most searched</strong>
      <p>${topSearches.length ? topSearches.map(([key, count]) => `${escapeHtml(key)} (${count})`).join(', ') : 'Nothing tracked yet.'}</p>
      <strong>Most viewed shops</strong>
      <p>${topShops.length ? topShops.map(([key, count]) => `${escapeHtml(key)} (${count})`).join(', ') : 'Nothing tracked yet.'}</p>
    `;
  }

  function handleActionClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const shopKey = actionEl.dataset.shopKey;
    const shop = shopKey ? state.shopByKey.get(shopKey) : null;

    if (action === 'view-shop' && shop) selectShop(shop.key);
    if (action === 'save-shop' && shop) toggleSaveShop(shop.key);
    if (action === 'add-route' && shop) addToRoute(shop.key);
    if (action === 'save-strain') saveStrain(actionEl.dataset.strain || getPrimaryActiveStrainName());
    if (action === 'search-strain') {
      const strain = actionEl.dataset.strain || '';
      els.universalSearch.value = strain;
      runSearch(strain);
      document.getElementById('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (action === 'toggle-match-shop' && shop) {
      if (state.selectedMatchShops.has(shop.key)) state.selectedMatchShops.delete(shop.key);
      else state.selectedMatchShops.add(shop.key);
      renderWantedWorkflow();
    }
  }

  function handleRouteClick(event) {
    const remove = event.target.closest('[data-route-remove]');
    if (remove) {
      state.route.splice(Number(remove.dataset.routeRemove), 1);
      saveLocalState();
      renderRoute();
      updateRouteLine();
      return;
    }
    const move = event.target.closest('[data-route-move]');
    if (move) {
      const index = Number(move.dataset.routeMove);
      const direction = Number(move.dataset.direction);
      const next = index + direction;
      if (next < 0 || next >= state.route.length) return;
      const [item] = state.route.splice(index, 1);
      state.route.splice(next, 0, item);
      saveLocalState();
      renderRoute();
      updateRouteLine();
    }
  }

  function handleStrainPickerClick(event) {
    const button = event.target.closest('[data-picker-strain]');
    if (!button) return;
    const stat = state.strainStats.get(button.dataset.pickerStrain);
    if (stat) toggleSavedStrain(stat.name);
  }

  function handleSavedClick(event) {
    const remove = event.target.closest('[data-remove-saved-strain]');
    if (remove) {
      removeSavedStrain(remove.dataset.removeSavedStrain);
      return;
    }
    const priority = event.target.closest('[data-priority-strain]');
    if (priority) {
      const item = state.saved.strains.find(row => row.key === priority.dataset.priorityStrain);
      if (item) {
        item.priority = !item.priority;
        saveLocalState();
        renderSaved();
        renderWantedWorkflow();
      }
    }
    handleActionClick(event);
  }

  function handleSavedInput(event) {
    const textarea = event.target.closest('[data-note-strain]');
    if (!textarea) return;
    const item = state.saved.strains.find(row => row.key === textarea.dataset.noteStrain);
    if (!item) return;
    item.notes = textarea.value.slice(0, 280);
    saveLocalState();
  }

  function selectShop(key) {
    const shop = state.shopByKey.get(key);
    if (!shop) return;
    state.selectedShopKey = key;
    incrementCounter(state.analytics.viewedShops, shop.name);
    saveAnalytics();
    renderShopDetail(shop);
    renderResults();
    updateMapMarkers();
    if (state.map) {
      state.map.setView([shop.lat, shop.lng], Math.max(state.map.getZoom(), 15), { animate: true });
    }
  }

  function toggleSaveShop(key) {
    const shop = state.shopByKey.get(key);
    if (!shop) return;
    const index = state.saved.shops.indexOf(key);
    if (index >= 0) {
      state.saved.shops.splice(index, 1);
      toast(`${shop.name} removed from favourites.`);
    } else {
      state.saved.shops.unshift(key);
      toast(`${shop.name} saved.`);
    }
    saveLocalState();
    renderSaved();
    renderResults();
    renderShopDetail(state.shopByKey.get(state.selectedShopKey));
    updateMapMarkers();
  }

  function toggleSavedStrain(name) {
    const stat = findCanonicalStrain(name);
    if (!stat) return;
    if (state.saved.strains.some(item => item.key === stat.key)) removeSavedStrain(stat.key);
    else saveStrain(stat.name);
  }

  function saveStrain(name) {
    const stat = findCanonicalStrain(name);
    if (!stat) {
      toast('Search data is still loading. Please try again in a moment.');
      return;
    }
    if (!state.saved.strains.some(item => item.key === stat.key)) {
      state.saved.strains.unshift({ key: stat.key, name: stat.name, priority: false, notes: '' });
      incrementCounter(state.analytics.savedStrains, stat.name);
      saveAnalytics();
      toast(`${stat.name} saved to your wanted list.`);
    } else {
      toast(`${stat.name} is already saved.`);
    }
    saveLocalState();
    renderSaved();
    renderWantedWorkflow();
    renderResults();
  }

  function removeSavedStrain(key) {
    const item = state.saved.strains.find(row => row.key === key);
    state.saved.strains = state.saved.strains.filter(row => row.key !== key);
    saveLocalState();
    renderSaved();
    renderWantedWorkflow();
    renderResults();
    if (item) toast(`${item.name} removed from saved strains.`);
  }

  function addToRoute(key) {
    const shop = state.shopByKey.get(key);
    if (!shop) return;
    if (!state.route.includes(key)) {
      state.route.push(key);
      incrementCounter(state.analytics.routeStops, shop.name);
      saveAnalytics();
      toast(`${shop.name} added to route.`);
    } else {
      toast(`${shop.name} is already in the route.`);
    }
    saveLocalState();
    renderRoute();
    updateRouteLine();
    updateMapMarkers();
  }

  function optimizeRoute(mode) {
    const routeShops = state.route.map(key => state.shopByKey.get(key)).filter(Boolean);
    if (routeShops.length < 2) {
      toast('Add at least two route stops first.');
      return;
    }
    let sorted = routeShops.slice();
    if (mode === 'nearest') {
      sorted.sort((a, b) => compareNumber(distanceToShop(a), distanceToShop(b)));
    } else if (mode === 'coverage') {
      sorted.sort((a, b) => getWantedMatchesForShop(b).length - getWantedMatchesForShop(a).length || b.strainCount - a.strainCount);
    } else if (mode === 'value') {
      sorted.sort((a, b) => compareNumber(a.minPrice, b.minPrice));
    } else {
      sorted.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || a.freshnessDays - b.freshnessDays);
    }
    state.route = sorted.map(shop => shop.key);
    saveLocalState();
    renderRoute();
    updateRouteLine();
    toast('Route reordered.');
  }

  function initMapsWhenReady() {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (window.L) {
        window.clearInterval(timer);
        initMaps();
      } else if (tries > 60) {
        window.clearInterval(timer);
        setStatus('Map tiles are still loading. Search remains available.');
      }
    }, 100);
  }

  function initMaps() {
    if (!window.L) return;
    state.map = L.map('map', { zoomControl: false, attributionControl: true }).setView(AMSTERDAM_CENTER, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    addTileLayer(state.map);

    state.heroMap = L.map('hero-map-preview', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false
    }).setView([52.371, 4.895], 14);
    addTileLayer(state.heroMap);
    if (state.loaded) {
      updateMapMarkers();
      initHeroMarkers();
      window.setTimeout(() => {
        state.map.invalidateSize();
        state.heroMap.invalidateSize();
      }, 250);
    }
  }

  function addTileLayer(map) {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
  }

  function updateMapMarkers() {
    if (!state.map || !state.loaded) return;
    const visibleKeys = new Set((state.results.length ? state.results : state.shops.map(shop => ({ shop }))).map(item => item.shop.key));
    state.shops.forEach(shop => {
      const visible = visibleKeys.has(shop.key);
      let marker = state.markers.get(shop.key);
      if (!marker) {
        marker = L.marker([shop.lat, shop.lng], { icon: markerIcon(shop, visible) })
          .addTo(state.map)
          .on('click', () => selectShop(shop.key));
        marker.bindPopup(`<strong>${escapeHtml(shop.name)}</strong><br>${escapeHtml(shop.area)} · ${freshnessLabel(shop)}`);
        state.markers.set(shop.key, marker);
      }
      marker.setIcon(markerIcon(shop, visible));
      if (visible && !state.map.hasLayer(marker)) marker.addTo(state.map);
      if (!visible && state.map.hasLayer(marker)) state.map.removeLayer(marker);
    });
    updateRouteLine();
  }

  function markerIcon(shop, visible) {
    const logo = shop.logo
      ? `<img src="images/logos/${escapeAttr(shop.logo)}" alt="" loading="lazy" onerror="this.remove()">`
      : '';
    const initial = escapeHtml((shop.name || '?').trim().charAt(0).toUpperCase() || '?');
    const classes = [
      'shop-marker',
      visible ? 'is-match' : '',
      state.saved.shops.includes(shop.key) ? 'is-fav' : '',
      state.selectedShopKey === shop.key ? 'is-selected' : '',
      shop.freshnessDays > 45 ? 'is-stale' : ''
    ].filter(Boolean).join(' ');
    return L.divIcon({
      className: '',
      html: `<div class="${classes}" title="${escapeAttr(shop.name)}"><span>${logo}<b>${initial}</b></span></div>`,
      iconSize: [48, 56],
      iconAnchor: [24, 50]
    });
  }

  function initHeroMarkers() {
    if (!state.heroMap || !state.shops.length) return;
    const heroShops = state.shops
      .slice()
      .sort((a, b) => a.freshnessDays - b.freshnessDays || b.strainCount - a.strainCount)
      .slice(0, 22);
    heroShops.forEach(shop => {
      L.circleMarker([shop.lat, shop.lng], {
        radius: 7,
        weight: 2,
        color: '#101612',
        fillColor: shop.freshnessDays <= 14 ? '#5fd08c' : '#f3b44b',
        fillOpacity: 0.9
      }).addTo(state.heroMap);
    });
  }

  function updateRouteLine() {
    if (!state.map) return;
    if (state.routeLine) {
      state.map.removeLayer(state.routeLine);
      state.routeLine = null;
    }
    const points = state.route.map(key => state.shopByKey.get(key)).filter(Boolean).map(shop => [shop.lat, shop.lng]);
    if (state.userPosition && points.length) points.unshift([state.userPosition.lat, state.userPosition.lng]);
    if (points.length >= 2) {
      state.routeLine = L.polyline(points, {
        color: '#f3b44b',
        weight: 5,
        opacity: 0.86,
        dashArray: state.routeMode === 'walking' ? '1 10' : state.routeMode === 'cycling' ? '10 8' : null
      }).addTo(state.map);
    }
  }

  function fitMapToResults() {
    if (!state.map) return;
    const shops = (state.results.length ? state.results.map(item => item.shop) : state.shops.slice(0, 60)).filter(Boolean);
    if (!shops.length) return;
    const bounds = L.latLngBounds(shops.map(shop => [shop.lat, shop.lng]));
    state.map.fitBounds(bounds.pad(0.14), { maxZoom: 15, animate: true });
  }

  function locateUser(options = {}) {
    if (!navigator.geolocation) {
      toast('Location unavailable. You can still search by area or choose a starting point manually.');
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      state.userPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      toast('Location added for distance and nearby sorting.');
      if (options.searchNearby) {
        state.activeIntent = 'nearby';
        document.querySelectorAll('[data-intent]').forEach(item => item.classList.toggle('is-active', item.dataset.intent === 'nearby'));
        els.universalSearch.value = 'Nearby';
        runSearch('Nearby');
      } else {
        renderResults();
        renderRoute();
      }
      if (state.map) {
        L.circleMarker([state.userPosition.lat, state.userPosition.lng], {
          radius: 8,
          weight: 3,
          color: '#f4efe2',
          fillColor: '#79b8ff',
          fillOpacity: 0.95
        }).addTo(state.map);
        state.map.setView([state.userPosition.lat, state.userPosition.lng], 14, { animate: true });
      }
    }, () => {
      if (!options.quiet) toast('Location unavailable. You can still search by area or choose a starting point manually.');
    }, { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
  }

  function handleCustomDataImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        buildDataModel(String(reader.result || ''), [], []);
        state.loaded = true;
        renderAll();
        toast('Custom data imported.');
      } catch (error) {
        console.error(error);
        toast('Could not import that data. Check the columns and try again.');
      }
    };
    reader.readAsText(file);
  }

  function hydrateSuggestions() {
    const options = [
      ...state.strainList.slice(0, 160).map(stat => stat.name),
      ...state.shops.map(shop => shop.name),
      'De Pijp', 'Centrum', 'Jordaan', 'Oud-West', 'Amsterdam Noord', 'Under €10/g', 'Hash nearby', 'Cali'
    ];
    els.searchSuggestions.innerHTML = [...new Set(options)].slice(0, 340).map(value => `<option value="${escapeAttr(value)}"></option>`).join('');
  }

  function buildWantedMatches() {
    const wanted = state.saved.strains;
    if (!wanted.length) return [];
    const wantedKeys = wanted.map(item => item.key);
    return state.shops.map(shop => {
      const shopStrains = new Set(shop.offerings.map(row => normaliseStrain(row.strain_name_normalised || row.strain_name)));
      const matches = wanted.filter(item => shopStrains.has(item.key)).map(item => item.name);
      return { shop, matches, matchCount: matches.length };
    }).filter(row => {
      if (state.matchMode === 'all') return row.matchCount === wantedKeys.length;
      if (state.matchMode === 'most') return row.matchCount >= Math.max(1, Math.ceil(wantedKeys.length * 0.6));
      return row.matchCount > 0;
    }).sort((a, b) => {
      return b.matchCount - a.matchCount || a.shop.freshnessDays - b.shop.freshnessDays || compareNumber(a.shop.averagePrice, b.shop.averagePrice);
    });
  }

  function findStrainCandidates(query) {
    const normal = normaliseStrain(query);
    if (!normal) return [];
    return state.strainList.map(stat => {
      const name = normaliseStrain(stat.name);
      const aliasHit = [...stat.aliases].some(alias => normaliseStrain(alias).includes(normal));
      let score = 0;
      if (name === normal) score = 1;
      else if (name.startsWith(normal)) score = 0.92;
      else if (name.includes(normal)) score = 0.84;
      else if (aliasHit) score = 0.8;
      else {
        const dist = levenshtein(normal, name);
        const max = Math.max(normal.length, name.length);
        score = max ? 1 - dist / max : 0;
      }
      if (normal.length <= 3 && !name.includes(normal)) score *= 0.55;
      return { ...stat, score };
    }).filter(item => item.score >= 0.58)
      .sort((a, b) => b.score - a.score || b.shopCount - a.shopCount)
      .slice(0, 80);
  }

  function findShopMatches(query) {
    return state.shops.map(shop => {
      const haystack = normaliseText(`${shop.name} ${shop.area}`);
      let score = haystack.includes(query) ? 0.86 : 0;
      if (normaliseText(shop.name) === query) score = 1;
      if (!score) {
        const dist = levenshtein(query, normaliseText(shop.name));
        score = 1 - dist / Math.max(query.length, normaliseText(shop.name).length);
      }
      return { shop, score };
    }).filter(row => row.score >= 0.58)
      .sort((a, b) => b.score - a.score || a.shop.name.localeCompare(b.shop.name))
      .slice(0, 40)
      .map(row => row.shop);
  }

  function matchArea(query) {
    const areas = [...new Set(state.shops.map(shop => shop.area))];
    return areas.find(area => normaliseText(area) === query || normaliseText(area).includes(query)) || '';
  }

  function findCanonicalStrain(name) {
    const key = normaliseStrain(name);
    return state.strainStats.get(key) || findStrainCandidates(name)[0] || null;
  }

  function getPrimaryActiveStrainName() {
    const first = state.activeStrainKeys[0];
    return first ? state.strainStats.get(first)?.name || '' : '';
  }

  function getWantedMatchesForShop(shop) {
    const shopStrains = new Set(shop.offerings.map(row => normaliseStrain(row.strain_name_normalised || row.strain_name)));
    return state.saved.strains.filter(item => shopStrains.has(item.key)).map(item => item.name);
  }

  function getRareFinds(shop) {
    return shop.offerings
      .map(row => state.strainStats.get(normaliseStrain(row.strain_name_normalised || row.strain_name)))
      .filter(Boolean)
      .filter(stat => stat.shopCount <= 2)
      .map(stat => stat.name)
      .filter(unique)
      .slice(0, 6);
  }

  function getValuePicks(shop) {
    return shop.offerings
      .filter(row => Number.isFinite(Number(row.price_amount)))
      .sort((a, b) => Number(a.price_amount) - Number(b.price_amount))
      .slice(0, 8);
  }

  function badgesForShop(shop) {
    const badges = [];
    if (shop.freshnessDays <= 7) badges.push({ label: 'Fresh menu', tone: 'good' });
    if (shop.freshnessDays > 45) badges.push({ label: 'Menu may be stale', tone: 'low' });
    if (shop.minPrice !== null && shop.minPrice <= 10) badges.push({ label: 'Budget option', tone: 'good' });
    if (shop.averagePrice !== null && shop.averagePrice >= 17) badges.push({ label: 'Premium menu', tone: 'warn' });
    if (shop.strainCount >= 35) badges.push({ label: 'Most stocked', tone: 'good' });
    if ((shop.typeCounts.hash || 0) >= 6) badges.push({ label: 'Best for hash', tone: 'good' });
    if (shop.offerings.some(row => Number(row.is_cali) === 1)) badges.push({ label: 'Best for Cali', tone: 'warn' });
    if (shop.confidence === 'Low') badges.push({ label: 'Data confidence low', tone: 'low' });
    if (!badges.length) badges.push({ label: 'Good all-rounder', tone: 'good' });
    return badges.slice(0, 5);
  }

  function badgesForResult(result) {
    const badges = result.shop.badges.slice(0, 3);
    if (result.matchedOfferings.length >= 3) badges.unshift({ label: 'Strong wanted-list match', tone: 'good' });
    if (Number.isFinite(result.distanceMeters) && result.distanceMeters <= 1200) badges.unshift({ label: 'Nearby', tone: 'good' });
    if (Number.isFinite(result.bestPrice) && result.bestPrice <= 10) badges.unshift({ label: 'Best value', tone: 'good' });
    return badges.slice(0, 5);
  }

  function whyResult(result, parsed) {
    const bits = [];
    if (result.matchedOfferings.length) bits.push(`matches ${result.matchedOfferings.length} menu item${result.matchedOfferings.length === 1 ? '' : 's'}`);
    if (Number.isFinite(result.bestPrice)) bits.push(`from €${formatPrice(result.bestPrice)}/g`);
    if (result.shop.freshnessDays <= 14) bits.push('recent menu data');
    if (result.shop.strainCount >= 30) bits.push('large menu');
    if (Number.isFinite(result.distanceMeters)) bits.push(`${walkTimeLabel(result.distanceMeters)} away`);
    if (parsed && parsed.flags && parsed.flags.openNow) bits.push('opening hours are not in the current data');
    return bits.length ? `${capitalizeSentence(bits.join(', '))}.` : `${freshnessCopy(result.shop)} ${valueCopy(result.shop)}`;
  }

  function filterReason(parsed, shop) {
    if (parsed.flags.openNow) return 'Opening hours are not available in the current data, so this result is ranked by menu usefulness instead.';
    if (parsed.flags.under10) return `${shop.name} has at least one listed option under €10/g.`;
    if (parsed.flags.hash) return `${shop.name} has hash items listed in current menu data.`;
    if (parsed.flags.cali) return `${shop.name} has Cali-tagged items in current menu data.`;
    if (parsed.flags.nearby) return `${shop.name} is one of the closest useful options from your location.`;
    return `${shop.name} matches the active filters.`;
  }

  function shopSummary(shop, wantedMatches, rareFinds) {
    const goodFor = [];
    if ((shop.typeCounts.sativa || 0) >= 8) goodFor.push('haze and sativa strains');
    if ((shop.typeCounts.hash || 0) >= 6) goodFor.push('hash');
    if (shop.offerings.some(row => Number(row.is_cali) === 1)) goodFor.push('Cali and premium flower');
    if (shop.minPrice !== null && shop.minPrice <= 10) goodFor.push('budget picks');
    if (!goodFor.length) goodFor.push('a balanced menu');
    const caution = shop.freshnessDays > 45 ? ' Watch out for older menu intel.' : '';
    const wanted = wantedMatches.length ? ` It matches your saved strains: ${wantedMatches.slice(0, 3).join(', ')}.` : '';
    const rare = rareFinds.length ? ` Rare find: ${rareFinds[0]}.` : '';
    return `Good for: ${goodFor.slice(0, 3).join(', ')}.${wanted}${rare}${caution}`;
  }

  function confidenceForShop(shop) {
    if (!shop.offerings.length) return 'Unknown';
    if (shop.freshnessDays <= 14 && shop.offerings.some(row => Number.isFinite(Number(row.price_amount)))) return 'High';
    if (shop.freshnessDays <= 45) return 'Medium';
    return 'Low';
  }

  function confidenceRank(confidence) {
    return { Unknown: 0, Low: 1, Medium: 2, High: 3 }[confidence] || 0;
  }

  function confidenceLabel(confidence) {
    return `Confidence: ${confidence || 'Unknown'}`;
  }

  function freshnessCopy(shop) {
    if (!shop.menuUpdated) return 'Menu freshness unknown';
    if (shop.freshnessDays <= 7) return 'Fresh intel';
    if (shop.freshnessDays <= 21) return 'Recent menu data';
    if (shop.freshnessDays <= 45) return 'Menu data may need checking';
    return 'Menu may be stale';
  }

  function valueCopy(shop) {
    if (shop.minPrice === null) return 'Price data is incomplete.';
    return `Prices start at €${formatPrice(shop.minPrice)}/g.`;
  }

  function freshnessLabel(shop) {
    if (!shop.menuUpdated) return 'Menu freshness unknown';
    const days = shop.freshnessDays;
    if (days <= 1) return 'Menu updated today';
    if (days <= 7) return `Menu updated ${Math.max(1, Math.round(days))} days ago`;
    if (days <= 45) return `Last seen ${formatDate(shop.menuUpdated)}`;
    return `Older menu: ${formatDate(shop.menuUpdated)}`;
  }

  function lastSeenLabel(dateString) {
    const date = parseDate(dateString);
    return date ? `Last seen: ${formatDate(date)}` : 'Last seen unknown';
  }

  function priceLabel(value) {
    return Number.isFinite(value) ? `From €${formatPrice(value)}/g` : 'Price not listed';
  }

  function priceRangeLabel(stat) {
    if (!Number.isFinite(stat.minPrice)) return 'Price not listed';
    if (stat.minPrice === stat.maxPrice) return `From €${formatPrice(stat.minPrice)}/g`;
    return `Typical price: €${formatPrice(stat.minPrice)}-€${formatPrice(stat.maxPrice)}/g`;
  }

  function distanceToShop(shop) {
    if (!state.userPosition) return null;
    return haversine(state.userPosition.lat, state.userPosition.lng, shop.lat, shop.lng);
  }

  function distanceLabel(meters) {
    if (!Number.isFinite(meters)) return 'Distance ready after location';
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  function walkTimeLabel(meters) {
    if (!Number.isFinite(meters)) return '';
    return estimateDuration(meters, 'walking');
  }

  function estimateDuration(meters, mode) {
    const speeds = { walking: 80, cycling: 250, driving: 420 };
    const minutes = Math.max(1, Math.round(meters / (speeds[mode] || speeds.walking)));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
  }

  function routeDistance(shops) {
    const points = shops.map(shop => ({ lat: shop.lat, lng: shop.lng }));
    if (state.userPosition) points.unshift(state.userPosition);
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
    return total;
  }

  function routeWantedCoverage(shops) {
    const covered = new Set();
    shops.forEach(shop => getWantedMatchesForShop(shop).forEach(name => covered.add(normaliseStrain(name))));
    return covered.size;
  }

  function routeUrl(shops) {
    if (!shops.length) return '#';
    const destination = shops[shops.length - 1];
    const waypoints = shops.slice(0, -1).map(shop => `${shop.lat},${shop.lng}`).join('|');
    const base = `https://www.google.com/maps/dir/?api=1&travelmode=${googleTravelMode(state.routeMode)}&destination=${destination.lat},${destination.lng}`;
    const origin = state.userPosition ? `&origin=${state.userPosition.lat},${state.userPosition.lng}` : '';
    const waypointParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
    return base + origin + waypointParam;
  }

  function directionsUrl(shop) {
    return `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}&travelmode=${googleTravelMode(state.routeMode)}`;
  }

  function googleTravelMode(mode) {
    if (mode === 'cycling') return 'bicycling';
    if (mode === 'driving') return 'driving';
    return 'walking';
  }

  function focusSearch() {
    document.getElementById('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      els.universalSearch.focus({ preventScroll: true });
      if (state.map) state.map.invalidateSize();
    }, 240);
  }

  function rememberSearch(query) {
    const cleanQuery = clean(query);
    if (!cleanQuery) return;
    state.saved.searches = [cleanQuery, ...state.saved.searches.filter(item => item.toLowerCase() !== cleanQuery.toLowerCase())].slice(0, 10);
    saveLocalState();
  }

  function loadLocalState() {
    const saved = readJson(STORAGE_KEY, null);
    if (saved && typeof saved === 'object') {
      state.saved = {
        strains: Array.isArray(saved.strains) ? saved.strains : [],
        shops: Array.isArray(saved.shops) ? saved.shops : [],
        routes: Array.isArray(saved.routes) ? saved.routes : [],
        searches: Array.isArray(saved.searches) ? saved.searches : []
      };
      state.route = Array.isArray(saved.route) ? saved.route : [];
      state.routeMode = saved.routeMode || 'walking';
    }
    const analytics = readJson(ANALYTICS_KEY, null);
    if (analytics && typeof analytics === 'object') {
      state.analytics = { ...state.analytics, ...analytics };
    }
  }

  function saveLocalState() {
    writeJson(STORAGE_KEY, {
      ...state.saved,
      route: state.route,
      routeMode: state.routeMode
    });
  }

  function saveAnalytics() {
    writeJson(ANALYTICS_KEY, state.analytics);
    renderAnalytics();
  }

  function updateFilterCount() {
    const count = Object.values(state.filters).filter(Boolean).length;
    els.filterCount.textContent = `${count} active`;
  }

  function updateUrlHashQuietly() {
    if (!state.activeQuery || !window.history || !window.history.replaceState) return;
    const hash = window.location.hash || '';
    if (hash && hash !== '#app') return;
    window.history.replaceState(null, '', '#app');
  }

  function setStatus(message) {
    els.dataStatus.textContent = message;
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  async function fetchText(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.text();
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(field);
        field = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(field);
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    const headers = rows.shift() || [];
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  }

  function uniqueOfferings(rows) {
    const seen = new Set();
    return rows.filter(row => {
      const key = [row.shop_id, row.strain_id, row.strain_name, row.price_amount, row.updated_at].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function inferShopId(rows) {
    const row = rows.find(item => Number.isFinite(Number(item.shop_id)));
    return row ? Number(row.shop_id) : null;
  }

  function inferArea(lat, lng, name) {
    const normalized = normaliseText(name);
    if (normalized.includes('pijp')) return 'De Pijp';
    if (lat > 52.389) return 'Amsterdam Noord';
    if (lng < 4.865) return 'West';
    if (lng > 4.925) return 'East';
    if (lat < 52.355) return 'Zuid';
    if (lng >= 4.885 && lng <= 4.91 && lat >= 52.363 && lat <= 52.382) return 'Centrum';
    if (lng < 4.885 && lat > 52.365) return 'Jordaan / West';
    if (lng < 4.89 && lat <= 52.365) return 'Oud-West';
    return 'Amsterdam';
  }

  function normaliseText(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-zA-Z0-9€]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normaliseStrain(value) {
    return normaliseText(value)
      .replace(/\bo\s*g\b/g, 'og')
      .replace(/\bskittles\b/g, 'zkittlez')
      .replace(/\bzkittles\b/g, 'zkittlez')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normaliseKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function nameCityKey(name, city) {
    return `${normaliseText(name)}|${normaliseText(city || 'Amsterdam')}`;
  }

  function displayStrainName(value) {
    const text = clean(value);
    if (!text) return 'Unknown strain';
    return text.toUpperCase() === text && text.length <= 5 ? text : titleCase(text);
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function titleCase(value) {
    return String(value || '').replace(/\w\S*/g, word => {
      if (/^(og|ak|amg|rs)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  function capitalizeSentence(value) {
    const text = String(value || '').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  function yesNo(value) {
    const text = normaliseText(value);
    if (['y', 'yes', 'true', '1'].includes(text)) return true;
    if (['n', 'no', 'false', '0', ''].includes(text)) return false;
    return false;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysSince(date) {
    return Math.max(0, (Date.now() - new Date(date).getTime()) / 86400000);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPrice(value) {
    return Number(value).toFixed(Number(value) % 1 ? 1 : 0);
  }

  function compareNumber(a, b) {
    const aOk = Number.isFinite(a);
    const bOk = Number.isFinite(b);
    if (aOk && bOk) return a - b;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const earth = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    const curr = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i += 1) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  function pushMapArray(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  function unique(value, index, array) {
    return array.indexOf(value) === index;
  }

  function topCounters(obj, limit) {
    return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
  }

  function incrementCounter(obj, key) {
    const cleanKey = clean(key);
    if (!cleanKey) return;
    obj[cleanKey] = (obj[cleanKey] || 0) + 1;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Local storage can be unavailable in private modes. */
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function toCamel(value) {
    return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }
})();
