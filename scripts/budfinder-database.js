const state = {
  allOfferings: [],
  offerings: [],
  shops: [],
  shopById: new Map(),
  shopLogoByKey: new Map(),
  shopCoordinatesByKey: new Map(),
  shopCoordinatesByNameCity: new Map(),
  locationDatasets: [],
  activeLocationDataset: '',
  searchScope: 'all',
  strainImageByKey: new Map(),
  closedShopSourceTokens: [],
  unavailableShopIds: new Set(),
  strainStats: [],
  selected: [],
  selectedShopIds: [],
  routePlanByStrain: {},
  priceBounds: { min: 0, max: 50 },
  snapshotTime: 0,
  listingCheckBatch: null,
  hiddenUnavailableListingCount: 0,
  browseMode: 'value',
  familyFilter: '',
  visibleStrainLimit: 12,
  activeShopId: '',
  shopMenuExpanded: false,
  shopMenuSort: 'name',
  shopMenuCategory: '',
  shopHideUnknownPrices: false,
  view: 'strains',
  discoveryBrowser: '',
  discoveryBrowserLimit: 48,
  discoveryBrowserSort: 'name',
  discoveryBrowserFreshness: 'all',
  discoveryBrowserPrice: 'all',
  discoveryBrowserType: 'all',
  discoveryBrowserPosition: null,
  detail: null,
  detailReturnSearch: '',
  detailReturnStack: [],
  detailVisibleLimit: 12
};

const DETAIL_LISTING_STEP = 12;

const els = {
  status: document.getElementById('status'),
  dataNote: document.getElementById('database-data-note'),
  search: document.getElementById('search'),
  searchLabel: document.getElementById('search-label'),
  searchChipRow: document.getElementById('search-chip-row'),
  searchCityScope: document.getElementById('search-city-scope'),
  searchShopsShortcut: document.getElementById('search-shops-shortcut'),
  locationDataset: document.getElementById('location-dataset-filter'),
  type: document.getElementById('type-filter'),
  legal: document.getElementById('legal-filter'),
  cali: document.getElementById('cali-filter'),
  sort: document.getElementById('sort-filter'),
  browseModeGrid: document.getElementById('browse-mode-grid'),
  familyFilterGrid: document.getElementById('family-filter-grid'),
  priceMin: document.getElementById('price-min'),
  priceMax: document.getElementById('price-max'),
  priceBandValue: document.getElementById('price-band-value'),
  mapToggle: document.querySelector('.app-mode-toggle a[href="map.html"]'),
  selectedList: document.getElementById('selected-list'),
  selectedShopList: document.getElementById('selected-shop-list'),
  clearSelected: document.getElementById('clear-selected'),
  showWantedMap: document.getElementById('show-wanted-map'),
  showSelectedShopsMap: document.getElementById('show-selected-shops-map'),
  clearSelectedShops: document.getElementById('clear-selected-shops'),
  metricAverage: document.getElementById('metric-average'),
  metricMostStocked: document.getElementById('metric-most-stocked'),
  metricRare: document.getElementById('metric-rare'),
  metricShops: document.getElementById('metric-shops'),
  quickAnswer: document.getElementById('quick-answer'),
  detailView: document.getElementById('detail-view'),
  databaseLayout: document.getElementById('database-layout'),
  resultContext: document.getElementById('result-context'),
  toolbarMapLink: document.getElementById('toolbar-map-link'),
  jumpFilters: document.getElementById('jump-filters'),
  jumpResults: document.getElementById('jump-results'),
  jumpTop: document.getElementById('jump-top'),
  strainGrid: document.getElementById('strain-grid'),
  priceGuidePanel: document.getElementById('price-guide-panel'),
  browseSummary: document.getElementById('browse-summary'),
  strainMoreRow: document.getElementById('strain-more-row'),
  loadMoreStrains: document.getElementById('load-more-strains'),
  comparisonGrid: document.getElementById('comparison-grid'),
  commonShopBoard: document.getElementById('common-shop-board'),
  routePlanBoard: document.getElementById('route-plan-board'),
  shopBrowserSearch: document.getElementById('shop-browser-search'),
  shopBrowserSelect: document.getElementById('shop-browser-select'),
  shopMenuSort: document.getElementById('shop-menu-sort'),
  shopCategoryFilter: document.getElementById('shop-category-filter'),
  shopHideUnknownPrices: document.getElementById('shop-hide-unknown-prices'),
  shopMenuBrowser: document.getElementById('shop-menu-browser'),
  shopList: document.getElementById('shop-list'),
  strainsSummary: document.getElementById('strains-summary'),
  compareSummary: document.getElementById('compare-summary'),
  shopsSummary: document.getElementById('shops-summary'),
  discoverySuggestions: document.getElementById('discovery-suggestions'),
  discoverySuggestionGroups: document.getElementById('discovery-suggestion-groups'),
  discoveryResults: document.getElementById('discovery-results'),
  discoveryResultsTitle: document.getElementById('discovery-results-title'),
  discoveryResultsCount: document.getElementById('discovery-results-count'),
  discoveryResultGroups: document.getElementById('discovery-result-groups'),
  discoveryBrowser: document.getElementById('discovery-browser'),
  discoveryBrowserTitle: document.getElementById('discovery-browser-title'),
  discoveryBrowserCopy: document.getElementById('discovery-browser-copy'),
  discoveryBrowserSearchLabel: document.getElementById('discovery-browser-search-label'),
  discoveryBrowserSearch: document.getElementById('discovery-browser-search'),
  discoveryBrowserSort: document.getElementById('discovery-browser-sort'),
  discoveryBrowserFreshness: document.getElementById('discovery-browser-freshness'),
  discoveryBrowserPrice: document.getElementById('discovery-browser-price'),
  discoveryBrowserType: document.getElementById('discovery-browser-type'),
  discoveryBrowserFilterReset: document.getElementById('discovery-browser-filter-reset'),
  discoveryBrowserFilterStatus: document.getElementById('discovery-browser-filter-status'),
  discoveryBrowserOrder: document.getElementById('discovery-browser-order'),
  discoveryBrowserCount: document.getElementById('discovery-browser-count'),
  discoveryBrowserGrid: document.getElementById('discovery-browser-grid'),
  discoveryBrowserMore: document.getElementById('discovery-browser-more')
};

const databasePersonalGreetingEl = document.getElementById('database-personal-greeting');
const databaseSearchTitleEl = document.getElementById('database-search-title');

function currentUserName() {
  return window.BudfinderPersonalisation
    ? window.BudfinderPersonalisation.userName()
    : '';
}

function applyDatabasePersonalisation() {
  const name = currentUserName();
  if (databasePersonalGreetingEl) {
    databasePersonalGreetingEl.textContent = name ? `Explore · ${name}` : 'Explore the database';
  }
  if (databaseSearchTitleEl) {
    databaseSearchTitleEl.textContent = name
      ? `What are you looking for, ${name}?`
      : 'What are you looking for?';
  }
}

window.addEventListener('budfinder:namechange', applyDatabasePersonalisation);
applyDatabasePersonalisation();

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalise(value) {
  return String(value || '').trim().toLowerCase();
}

function normaliseSearchText(value) {
  if (window.BudfinderSearch) return window.BudfinderSearch.normalise(value);
  return normalise(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fieldMatchesSearch(value, query) {
  if (window.BudfinderSearch) {
    return window.BudfinderSearch.matches(value, query, { threshold: 0.72 });
  }
  const text = normaliseSearchText(value);
  const q = normaliseSearchText(query);
  if (!q) return true;
  if (!text) return false;
  if (text === q) return true;
  if (` ${text} `.includes(` ${q} `)) return true;

  const words = text.split(' ').filter(Boolean);
  return q.split(' ').filter(Boolean).every(part => {
    if (part.length < 4) return words.includes(part);
    return words.some(word => word.startsWith(part));
  });
}

function resolvedGrowerForSearch(query) {
  if (!window.BudfinderSearch) return '';
  const q = normaliseSearchText(query);
  if (!q) return '';
  const sourceOfferings = state.allOfferings.length ? state.allOfferings : state.offerings;
  const cacheKey = `${q}|${sourceOfferings.length}`;
  if (resolvedGrowerForSearch.cache && resolvedGrowerForSearch.cache.key === cacheKey) {
    return resolvedGrowerForSearch.cache.value;
  }
  const growers = Array.from(new Set(sourceOfferings
    .map(item => String(item && item.grower || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)));
  const ranked = window.BudfinderSearch.rank(q, growers, { threshold: 0.86, limit: 2 });
  const winner = ranked[0];
  if (!winner) {
    resolvedGrowerForSearch.cache = { key: cacheKey, value: '' };
    return '';
  }
  const isConfident = winner.score >= 0.94 || ranked.length === 1 || winner.score - ranked[1].score >= 0.1;
  const value = isConfident ? winner.item : '';
  resolvedGrowerForSearch.cache = { key: cacheKey, value };
  return value;
}

function offeringMatchesSearch(item, query) {
  const resolvedGrower = resolvedGrowerForSearch(query);
  if (resolvedGrower) {
    return normaliseSearchText(item && item.grower) === normaliseSearchText(resolvedGrower);
  }
  return [
    item.strain_name,
    item.strain_name_normalised,
    item.shop_name,
    item.shop_city,
    item.base_type,
    item.grower,
    item.notes
  ].some(value => fieldMatchesSearch(value, query)) || (
    Number(item.is_legal) === 1 && ['legal', 'legal weed', 'regulated', 'experiment', 'wietexperiment']
      .some(value => fieldMatchesSearch(value, query))
  );
}

function shopMatchesSearch(shop, query) {
  if (!query) return false;
  return [
    shop && (shop.shop_name || shop.name || shop.shopName),
    shop && (shop.shop_city || shop.city),
    shop && shop.shop_key,
    shop && shop.address
  ].some(value => fieldMatchesSearch(value, query));
}

function searchLooksLikeShopQuery(query) {
  const q = normaliseSearchText(query);
  if (!q) return false;
  if (scoreShopSearchMatch(q) >= 3) return true;
  if (state.shops.some(shop => shopMatchesSearch(shop, q))) return true;
  return state.offerings.some(item => fieldMatchesSearch(item.shop_name, q) || fieldMatchesSearch(item.shop_city, q));
}

function scoreShopNameTextMatch(value, query) {
  if (window.BudfinderSearch) {
    return Math.round(window.BudfinderSearch.score(value, query) * 7);
  }
  const text = normaliseSearchText(value);
  const q = normaliseSearchText(query);
  if (!q || !text) return 0;
  const words = text.split(' ').filter(Boolean);
  const queryParts = q.split(' ').filter(Boolean);
  if (text === q) return 7;
  if (text.startsWith(`${q} `)) return 6;
  if (words.some(word => word === q)) return 5;
  if (queryParts.length > 1 && queryParts.every(part => words.some(word => word.startsWith(part)))) return 5;
  if (words.some(word => word.startsWith(q))) return 4;
  if (` ${text} `.includes(` ${q} `)) return 3;
  if (fieldMatchesSearch(text, q)) return 2;
  return 0;
}

function scoreShopSearchMatch(query) {
  const q = normaliseSearchText(query);
  if (!q) return 0;
  const names = new Set();
  state.shops.forEach(shop => {
    [
      shop && (shop.shop_name || shop.name || shop.shopName),
      shop && shop.shop_key
    ].forEach(value => {
      const text = normaliseSearchText(value);
      if (text) names.add(text);
    });
  });
  state.offerings.forEach(item => {
    [
      item && item.shop_name,
      item && item.shop_key
    ].forEach(value => {
      const text = normaliseSearchText(value);
      if (text) names.add(text);
    });
  });
  let score = 0;
  names.forEach(name => {
    score = Math.max(score, scoreShopNameTextMatch(name, q));
  });
  return score;
}

function scoreShopRowSearchMatch(row, query) {
  if (!row || !query) return 0;
  return Math.max(
    scoreShopNameTextMatch(row.shopName, query),
    scoreShopNameTextMatch(row.shopKey, query),
    scoreShopNameTextMatch(row.city, query)
  );
}

function compareShopRowsForSearch(a, b, query, filters) {
  return scoreShopRowSearchMatch(b, query) - scoreShopRowSearchMatch(a, query) ||
    compareShopRowsForSort(a, b, filters.sort, filters.browseMode);
}

function scoreStrainSearchMatch(query) {
  const q = normaliseSearchText(query);
  if (!q) return 0;
  let score = 0;
  state.strainStats.forEach(stat => {
    if (window.BudfinderSearch) {
      score = Math.max(score, Math.round(window.BudfinderSearch.score(stat.name, q, [stat.key]) * 5));
      return;
    }
    const name = normaliseSearchText(stat.name);
    const key = normaliseSearchText(stat.key);
    [name, key].filter(Boolean).forEach(text => {
      if (text === q) score = Math.max(score, 5);
      else if (text.startsWith(q)) score = Math.max(score, 4);
      else if (` ${text} `.includes(` ${q} `)) score = Math.max(score, 3);
      else if (fieldMatchesSearch(text, q)) score = Math.max(score, 2);
    });
  });
  return score;
}

function universalSearchIntent(query) {
  const q = normaliseSearchText(query);
  if (!q) return '';
  if (window.BudfinderSearch) {
    const shopNames = Array.from(new Set([
      ...state.shops.map(shop => shop && (shop.shop_name || shop.name || shop.shopName)),
      ...state.offerings.map(item => item && item.shop_name)
    ].filter(Boolean)));
    const growers = Array.from(new Set(state.offerings.map(item => item && item.grower).filter(Boolean)));
    const shopMatch = window.BudfinderSearch.rank(q, shopNames, { threshold: 0.72, limit: 1 })[0];
    const strainMatch = window.BudfinderSearch.rank(q, state.strainStats, {
      getLabel: stat => stat && stat.name,
      getAliases: stat => [stat && stat.key],
      threshold: 0.72,
      limit: 1
    })[0];
    const growerMatch = window.BudfinderSearch.rank(q, growers, { threshold: 0.72, limit: 1 })[0];
    const shopScore = shopMatch ? shopMatch.score : 0;
    const strainScore = strainMatch ? strainMatch.score : 0;
    const growerScore = growerMatch ? growerMatch.score : 0;
    if (growerScore >= Math.max(0.72, shopScore, strainScore)) return 'strains';
    if (strainScore >= 0.72 && strainScore >= shopScore - 0.03) return 'strains';
    if (shopScore >= 0.72) return 'shops';
    return '';
  }
  const shopScore = scoreShopSearchMatch(q);
  const strainScore = scoreStrainSearchMatch(q);
  const growerScore = state.offerings.reduce((score, item) => Math.max(score, scoreShopNameTextMatch(item && item.grower, q)), 0);
  if (shopScore >= 3 && shopScore >= strainScore) return 'shops';
  if (growerScore >= 2) return 'strains';
  if (strainScore >= 2) return 'strains';
  if (shopScore >= 2) return 'shops';
  return '';
}

function syncUniversalSearchMode() {
  const query = els.search ? els.search.value : '';
  const intent = universalSearchIntent(query);
  if (intent === 'shops') {
    if (state.view !== 'shops') setView('shops');
    if (els.shopBrowserSearch) {
      els.shopBrowserSearch.value = query;
      state.activeShopId = '';
      state.shopMenuExpanded = false;
    }
    return 'shops';
  }
  if (intent === 'strains') {
    if (state.view === 'shops') setView('strains');
    state.shopMenuExpanded = false;
    return 'strains';
  }
  return '';
}

function openShopSearchResults() {
  setView('shops');
  if (els.shopBrowserSearch && els.search && els.search.value) {
    els.shopBrowserSearch.value = els.search.value;
    state.activeShopId = '';
    state.shopMenuExpanded = false;
  }
  render();
  const target = document.getElementById('shops-view');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

function money(value, currency = '€', unit = 'g') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  const display = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
  return `${currency || '€'}${display}/${unit || 'g'}`;
}

function packageWeightLabel(value) {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return '';
  return `${Number.isInteger(weight) ? weight.toFixed(0) : weight.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}g`;
}

function packageListingPriceLabel(item) {
  const perGram = Number(item && item.price_amount);
  const packPrice = Number(item && item.package_price_amount);
  const weight = Number(item && item.package_weight_g);
  const currency = String(item && item.price_currency || '€');
  if (Number.isFinite(packPrice) && packPrice > 0 && Number.isFinite(weight) && weight > 0) {
    const amount = packPrice % 1 === 0 ? packPrice.toFixed(0) : packPrice.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    const comparison = Number.isFinite(perGram) ? ` · ${money(perGram, currency, 'g')}` : '';
    return `${currency}${amount} · ${packageWeightLabel(weight)} pack${comparison}`;
  }
  return Number.isFinite(perGram) ? money(perGram, currency, item && item.price_unit) : 'Price unknown';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function parseTime(value) {
  const time = new Date(value || '').getTime();
  return Number.isFinite(time) ? time : null;
}

function freshnessReferenceTime() {
  return Date.now();
}

const BATCH_FRESHNESS_FIELDS = new Set(['menu_checked_at_utc', 'last_seen_at_utc', 'last_seen_at', 'updated_at']);
const SHARED_BATCH_CLUSTER_GAP_MS = 10 * 60 * 1000;

function listingDateSource(item, options = {}) {
  const row = item || {};
  const includeBatchFields = options.includeBatchFields !== false;
  const candidates = [
    // Prefer explicit source/listing capture fields. Batch refresh timestamps are
    // treated as fallback context so a whole-file export does not make every shop
    // look freshly checked.
    ['source_menu_date', row.source_menu_date],
    ['menu_date', row.menu_date],
    ['listing_date', row.listing_date],
    ['menu_changed_at_utc', row.menu_changed_at_utc],
    ['checked_at', row.checked_at],
    ['checked_at_utc', row.checked_at_utc],
    ['source_checked_at', row.source_checked_at],
    ['source_updated_at', row.source_updated_at],
    ['source_seen_at', row.source_seen_at],
    ['scraped_at', row.scraped_at],
    ['scraped_at_utc', row.scraped_at_utc],
    ['fetched_at_utc', row.fetched_at_utc],
    ['created_at', row.created_at],
    ...(includeBatchFields ? [
      ['menu_checked_at_utc', row.menu_checked_at_utc],
      ['last_seen_at_utc', row.last_seen_at_utc],
      ['last_seen_at', row.last_seen_at],
      ['updated_at', row.updated_at]
    ] : [])
  ];
  for (const [field, value] of candidates) {
    if (parseTime(value) != null) return { field, value };
  }
  return { field: '', value: '' };
}

function listingDateValue(item, options) {
  return listingDateSource(item, options).value || '';
}

function listingTime(item, options) {
  return parseTime(listingDateValue(item, options));
}

function trustedListingDateValue(item) {
  return listingDateValue(item, { includeBatchFields: false });
}

function listingUsesSharedBatchDate(item) {
  const batch = state.listingCheckBatch;
  if (!batch || !batch.isSharedBatch || !Number.isFinite(batch.windowStart) || !Number.isFinite(batch.windowEnd)) return false;
  const realValue = trustedListingDateValue(item);
  if (realValue) return false;
  const source = listingDateSource(item);
  if (!BATCH_FRESHNESS_FIELDS.has(source.field)) return false;
  const time = parseTime(source.value);
  return Number.isFinite(time) && time >= batch.windowStart && time <= batch.windowEnd;
}

function displayListingDateValue(item) {
  const trustedValue = trustedListingDateValue(item);
  if (trustedValue) return trustedValue;
  if (listingUsesSharedBatchDate(item)) return '';
  const source = listingDateSource(item);
  return BATCH_FRESHNESS_FIELDS.has(source.field) ? '' : source.value;
}

function displayListingTime(item) {
  return parseTime(displayListingDateValue(item));
}

function ageDaysFromTime(time) {
  if (!Number.isFinite(time)) return Infinity;
  const checked = new Date(time);
  const reference = new Date(freshnessReferenceTime());
  const checkedDay = Date.UTC(checked.getUTCFullYear(), checked.getUTCMonth(), checked.getUTCDate());
  const referenceDay = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  return Math.max(0, Math.floor((referenceDay - checkedDay) / 86400000));
}

function formatFreshness(value) {
  const time = parseTime(value);
  if (!Number.isFinite(time)) return 'Menu date unknown';
  const days = ageDaysFromTime(time);
  if (days === 0) return 'Menu observed today';
  if (days === 1) return 'Menu observed yesterday';
  if (days < 14) return `Menu observed ${days} days ago`;
  if (days < 60) return `Menu observed ${Math.round(days / 7)} weeks ago`;
  return `Menu observed ${formatDate(value)}`;
}

function listingPriceLabel(item) {
  return packageListingPriceLabel(item);
}

function listingUpdatedLabel(item) {
  const value = displayListingDateValue(item);
  if (!value) return 'Menu date unknown';
  const source = listingDateSource(item, { includeBatchFields: false });
  if (['source_menu_date', 'menu_date', 'listing_date'].includes(source.field)) {
    return `Source menu dated ${formatDate(value)}`;
  }
  return formatFreshness(value);
}

function freshnessBadgeInfo(value) {
  const time = parseTime(value);
  if (!Number.isFinite(time)) return null;
  const days = ageDaysFromTime(time);
  const label = formatFreshness(value);
  if (days <= 14) return { label, className: 'is-fresh' };
  if (days <= 60) return { label, className: 'is-likely' };
  return { label, className: 'is-old-intel' };
}

function menuAgeInfo(value) {
  const time = parseTime(value);
  if (!Number.isFinite(time)) {
    return { label: 'Menu date unknown', display: 'Menu date unknown', className: 'age-unknown', bucket: 'unknown', days: Infinity, sourceField: '' };
  }
  const days = ageDaysFromTime(time);
  const label = formatFreshness(value);
  if (days <= 14) return { label, display: label, className: 'age-fresh', bucket: 'fresh', days, sourceField: '' };
  if (days <= 60) return { label, display: label, className: 'age-older', bucket: 'ageing', days, sourceField: '' };
  return { label, display: label, className: 'age-stale', bucket: 'stale', days, sourceField: '' };
}

function ageBadgeHtml(value, item = null) {
  const age = menuAgeInfo(value);
  const label = item ? listingUpdatedLabel(item) : age.display;
  return `<span class="age-badge ${age.className}">${escapeHtml(label)}</span>`;
}

function pricePerGram(item) {
  const amount = Number(item && item.price_amount);
  const unit = normalise(item && item.price_unit);
  if (!Number.isFinite(amount)) return null;
  if (unit && !['g', 'gram', 'grams', '/g', 'per gram'].includes(unit)) return null;
  return amount;
}

function sortedNumbers(values) {
  return (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function median(values) {
  const nums = sortedNumbers(values);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function percentile(values, fraction) {
  const nums = sortedNumbers(values);
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  const pos = (nums.length - 1) * fraction;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return nums[lower];
  return nums[lower] + ((nums[upper] - nums[lower]) * (pos - lower));
}

function priceJudgementFor(price, medianPrice) {
  const amount = Number(price);
  const mid = Number(medianPrice);
  if (!Number.isFinite(amount) || !Number.isFinite(mid) || mid <= 0) {
    return { label: 'Price unknown', className: 'price-unknown', rank: 5 };
  }
  const diff = (amount - mid) / mid;
  if (diff <= -0.2) return { label: 'Great price', className: 'price-great', rank: 0 };
  if (diff <= -0.1) return { label: 'Good price', className: 'price-good', rank: 1 };
  if (Math.abs(diff) <= 0.1) return { label: 'Typical price', className: 'price-typical', rank: 2 };
  if (diff <= 0.25) return { label: 'High price', className: 'price-high', rank: 3 };
  return { label: 'Premium price', className: 'price-premium', rank: 4 };
}

function priceJudgementBadgeHtml(price, medianPrice) {
  const judgement = priceJudgementFor(price, medianPrice);
  return `<span class="price-judgement ${judgement.className}">${escapeHtml(judgement.label)}</span>`;
}

function ageBreakdownForListings(listings) {
  const buckets = { fresh: 0, ageing: 0, stale: 0, unknown: 0 };
  (Array.isArray(listings) ? listings : []).forEach(item => {
    const bucket = menuAgeInfo(displayListingDateValue(item)).bucket;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  });
  return buckets;
}

function ageBreakdownLabel(buckets) {
  const parts = [
    ['within 14 days', buckets.fresh],
    ['15–60 days old', buckets.ageing],
    ['over 60 days old', buckets.stale],
    ['with date unknown', buckets.unknown]
  ].filter(([, count]) => count > 0);
  return parts.length ? parts.map(([label, count]) => `${count} ${label.toLowerCase()}`).join(' · ') : 'No menu dates';
}

function buildListingCheckBatchSignal(offerings) {
  const latestByShop = new Map();
  let trustedDateCount = 0;
  (Array.isArray(offerings) ? offerings : []).forEach(item => {
    const shopId = String(item && item.shop_id || '').trim();
    const time = listingTime(item);
    if (!shopId || !Number.isFinite(time)) return;
    latestByShop.set(shopId, Math.max(latestByShop.get(shopId) || 0, time));
    if (trustedListingDateValue(item)) trustedDateCount += 1;
  });

  const dateCounts = new Map();
  latestByShop.forEach(time => {
    const dateKey = new Date(time).toISOString().slice(0, 10);
    dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
  });
  const dominant = Array.from(dateCounts.entries()).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const shopCount = latestByShop.size;
  const timesOnDominantDate = Array.from(latestByShop.values())
    .filter(time => dominant[0] && new Date(time).toISOString().slice(0, 10) === dominant[0])
    .sort((a, b) => a - b);
  const clusters = [];
  timesOnDominantDate.forEach(time => {
    const last = clusters.at(-1);
    if (!last || time - last.end > SHARED_BATCH_CLUSTER_GAP_MS) {
      clusters.push({ start: time, end: time, count: 1 });
    } else {
      last.end = time;
      last.count += 1;
    }
  });
  const dominantCluster = clusters.sort((a, b) => b.count - a.count)[0] || { start: 0, end: 0, count: dominant[1] };
  const batchCount = dominantCluster.count || dominant[1];
  const ratio = shopCount ? batchCount / shopCount : 0;
  return {
    date: dominant[0],
    count: batchCount,
    shopCount,
    ratio,
    windowStart: dominantCluster.start || 0,
    windowEnd: dominantCluster.end || 0,
    trustedDateCount,
    // If almost every shop shares the same latest check date, it is more honest
    // to present that as dataset context rather than shop-specific freshness.
    isSharedBatch: shopCount >= 8 && ratio >= 0.8
  };
}

function listingCheckBatchNote() {
  const batch = state.listingCheckBatch;
  if (!batch || !batch.isSharedBatch || !batch.date) return '';
  const trusted = batch.trustedDateCount
    ? ` Listings with explicit source check dates still show their own age.`
    : ` Rows from that shared refresh window show unknown data age until a shop has its own later check signal.`;
  return ` Most shop listing timestamps in the current dataset come from a shared refresh on ${formatDate(batch.date)}, so the page does not label that batch as a recent menu observation.${trusted}`;
}

function priceProfileForListings(listings) {
  const usableListings = (Array.isArray(listings) ? listings : [])
    .map(item => ({ item, price: pricePerGram(item) }))
    .filter(row => Number.isFinite(row.price));
  const prices = usableListings.map(row => row.price);
  const newestTime = latestListingTime(listings);
  const shopIds = shopIdsForListings(listings);
  return {
    listings: Array.isArray(listings) ? listings : [],
    usableListings,
    prices,
    count: prices.length,
    shopCount: shopIds.length,
    average: average(prices),
    median: median(prices),
    low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null,
    q25: prices.length >= 3 ? percentile(prices, 0.25) : null,
    q75: prices.length >= 3 ? percentile(prices, 0.75) : null,
    newestTime,
    newestDate: newestTime ? new Date(newestTime).toISOString() : '',
    ageBreakdown: ageBreakdownForListings(listings),
    shopIds
  };
}

function sortListingsByPrice(items) {
  return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
    const priceDiff = (Number.isFinite(Number(a.price_amount)) ? Number(a.price_amount) : Infinity) -
      (Number.isFinite(Number(b.price_amount)) ? Number(b.price_amount) : Infinity);
    if (priceDiff !== 0) return priceDiff;
    return compareShopName(a, b);
  });
}

function cheapestListingsForStat(stat, limit = 3) {
  const listings = sortListingsByPrice(stat && stat.filteredOfferings ? stat.filteredOfferings : []);
  return listings.slice(0, limit);
}

function strainSignalTokens(name) {
  const text = normaliseSearchText(name);
  const signals = ['gelato', 'runtz', 'zushi', 'zkittlez', 'kush', 'haze', 'amnesia', 'sherbet', 'biscotti', 'glue', 'gorilla', 'widow', 'wedding', 'cake', 'lemon', 'blue', 'rainbow', 'mac', 'diesel', 'cookies', 'gushers'];
  return signals.filter(signal => text.includes(signal));
}

function similarStrainsForStat(stat, pool, limit = 4) {
  if (!stat) return [];
  const sourceFamilies = new Set(stat.families || []);
  const sourceTokens = new Set(strainSignalTokens(stat.name));
  const sourceType = stat.topType || '';
  return (pool || [])
    .filter(candidate => candidate && candidate.key !== stat.key && (candidate.filteredShopCount || candidate.shopCount || 0) > 0)
    .map(candidate => {
      const familyOverlap = (candidate.families || []).filter(key => sourceFamilies.has(key)).length;
      const tokenOverlap = strainSignalTokens(candidate.name).filter(key => sourceTokens.has(key)).length;
      const typeOverlap = sourceType && candidate.topType === sourceType ? 1 : 0;
      const candidateShopCount = candidate.filteredShopCount || candidate.shopCount || 0;
      const availability = Math.min(candidateShopCount, 8) / 8;
      return {
        candidate,
        score: (familyOverlap * 3) + (tokenOverlap * 2.5) + typeOverlap + availability
      };
    })
    .filter(item => item.score > 0.5)
    .sort((a, b) => b.score - a.score || (b.candidate.filteredShopCount || b.candidate.shopCount || 0) - (a.candidate.filteredShopCount || a.candidate.shopCount || 0) || compareStrainName(a.candidate, b.candidate))
    .slice(0, limit)
    .map(item => item.candidate);
}

function alternativeStrainsForQuery(query, pool, limit = 4) {
  if (window.BudfinderSearch) {
    return window.BudfinderSearch.rank(query, pool || [], {
      getLabel: stat => stat && stat.name,
      getAliases: stat => [stat && stat.key],
      threshold: 0.68,
      limit: Math.max(limit * 3, limit)
    })
      .sort((a, b) => b.score - a.score || (b.item.shopCount || 0) - (a.item.shopCount || 0))
      .slice(0, limit)
      .map(result => result.item);
  }
  const q = normaliseSearchText(query);
  const queryTokens = new Set(q.split(' ').filter(token => token.length >= 3));
  const querySignals = new Set(strainSignalTokens(query));
  return (pool || [])
    .filter(stat => stat && stat.shopCount > 0)
    .map(stat => {
      const name = normaliseSearchText(stat.name);
      const nameTokens = new Set(name.split(' ').filter(token => token.length >= 3));
      const tokenOverlap = Array.from(queryTokens).filter(token => nameTokens.has(token) || name.includes(token)).length;
      const signalOverlap = strainSignalTokens(stat.name).filter(token => querySignals.has(token)).length;
      const fuzzy = q && (name.includes(q) || q.includes(name)) ? 2 : 0;
      const availability = Math.min(stat.shopCount || 0, 10) / 10;
      return { stat, score: (tokenOverlap * 2.5) + (signalOverlap * 2) + fuzzy + availability };
    })
    .filter(item => item.score > 0.75)
    .sort((a, b) => b.score - a.score || b.stat.shopCount - a.stat.shopCount || compareStrainName(a.stat, b.stat))
    .slice(0, limit)
    .map(item => item.stat);
}

function alternativeLinksHtml(items) {
  if (!items.length) return '';
  return `
    <div class="similar-strains">
      <span>Try these available alternatives</span>
      ${items.map(item => `
        <a class="similar-strain-row" href="database.html?strain=${encodeURIComponent(item.name)}" data-similar-strain="${escapeHtmlAttr(item.name)}">
          <b>${escapeHtml(item.name)}</b>
          <span>${item.shopCount} shop${item.shopCount === 1 ? '' : 's'}</span>
        </a>
      `).join('')}
    </div>
  `;
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    sensitivity: 'base',
    numeric: true
  });
}

function compareStrainName(a, b) {
  return compareText(a && (a.name || a.strain_name), b && (b.name || b.strain_name));
}

function compareShopName(a, b) {
  const nameDiff = compareText(
    a && (a.shopName || a.name || a.shop_name),
    b && (b.shopName || b.name || b.shop_name)
  );
  if (nameDiff !== 0) return nameDiff;
  return compareText(a && (a.city || a.shop_city), b && (b.city || b.shop_city));
}

function sortModeLabel(key) {
  if (key === 'deals') return 'Best deals';
  if (key === 'availability') return 'Most available';
  if (key === 'cheapest') return 'Lowest price';
  if (key === 'average') return 'Average price';
  if (key === 'name') return 'A-Z';
  return '';
}

function sortModeSummary(key) {
  if (key === 'deals') return 'sorted by best deals';
  if (key === 'availability') return 'sorted by most available';
  if (key === 'cheapest') return 'sorted by lowest price';
  if (key === 'average') return 'sorted by average price';
  if (key === 'name') return 'ordered A-Z';
  return 'mode order';
}

function compareDealStrength(a, b) {
  const aPercent = Number((a && a.percentBelow) || 0);
  const bPercent = Number((b && b.percentBelow) || 0);
  if (bPercent !== aPercent) return bPercent - aPercent;
  const aSaving = Number((a && a.saving) || 0);
  const bSaving = Number((b && b.saving) || 0);
  if (bSaving !== aSaving) return bSaving - aSaving;
  const aPrice = a && Number.isFinite(Number(a.price)) ? Number(a.price) : Infinity;
  const bPrice = b && Number.isFinite(Number(b.price)) ? Number(b.price) : Infinity;
  return aPrice - bPrice;
}

function compareStatsByDeal(a, b) {
  return compareDealStrength(a.filteredBestDeal, b.filteredBestDeal) ||
    ((b.filteredDealCount || 0) - (a.filteredDealCount || 0)) ||
    ((b.filteredShopCount || 0) - (a.filteredShopCount || 0)) ||
    compareStrainName(a, b);
}

function shopTypeCount(row, type) {
  return (Array.isArray(row && row.offerings) ? row.offerings : [])
    .filter(item => item.base_type === type).length;
}

function shopCaliCount(row) {
  return (Array.isArray(row && row.offerings) ? row.offerings : [])
    .filter(item => Number(item.is_cali) === 1).length;
}

function shopValueScore(row) {
  const offerings = Array.isArray(row && row.offerings) ? row.offerings : [];
  const prices = offerings.map(item => Number(item.price_amount)).filter(Number.isFinite).sort((a, b) => a - b);
  const menuMedian = prices.length ? median(prices) : null;
  const menuAverage = prices.length ? average(prices) : null;
  const price = menuMedian == null
    ? (menuAverage == null ? (row && row.cheapest == null ? 99 : Number(row && row.cheapest)) : menuAverage)
    : menuMedian;
  const availability = Math.min(Number(row && row.uniqueStrains) || 0, 36);
  const latest = latestListingTime(row && row.offerings);
  const ageDays = latest ? ageDaysFromTime(latest) : 120;
  const dealVolume = Math.min(Number(row && row.belowAverageDeals && row.belowAverageDeals.length) || 0, 12);
  const dealCoverage = availability ? dealVolume / Math.max(availability, 1) : 0;
  const lowPriceBonus = row && row.cheapest != null ? Math.max(0, Math.min(4, price - Number(row.cheapest))) * 0.08 : 0;
  return price - (availability * 0.025) + Math.min(ageDays, 120) * 0.01 - (dealCoverage * 0.8) - (dealVolume * 0.015) - lowPriceBonus;
}

function compareShopRowsForBrowseMode(a, b, mode) {
  const browseMode = mode || 'value';
  if (browseMode === 'az') return compareShopName(a, b);
  if (browseMode === 'available') return b.uniqueStrains - a.uniqueStrains || compareShopName(a, b);
  if (browseMode === 'fresh') {
    const freshDiff = latestListingTime(b.offerings) - latestListingTime(a.offerings);
    if (freshDiff !== 0) return freshDiff;
    return (a.cheapest ?? Infinity) - (b.cheapest ?? Infinity) || compareShopName(a, b);
  }
  if (browseMode === 'under10') return (a.cheapest ?? Infinity) - (b.cheapest ?? Infinity) || b.uniqueStrains - a.uniqueStrains || compareShopName(a, b);
  if (browseMode === 'rare') return b.uniqueStrains - a.uniqueStrains || (a.cheapest ?? Infinity) - (b.cheapest ?? Infinity) || compareShopName(a, b);
  if (browseMode === 'cali') return shopCaliCount(b) - shopCaliCount(a) || (a.cheapest ?? Infinity) - (b.cheapest ?? Infinity) || compareShopName(a, b);
  if (browseMode === 'sativa' || browseMode === 'hybrid' || browseMode === 'indica') {
    return shopTypeCount(b, browseMode) - shopTypeCount(a, browseMode) ||
      (a.cheapest ?? Infinity) - (b.cheapest ?? Infinity) ||
      b.uniqueStrains - a.uniqueStrains ||
      compareShopName(a, b);
  }
  const aScore = Number.isFinite(Number(a && a.valueScore)) ? Number(a.valueScore) : shopValueScore(a);
  const bScore = Number.isFinite(Number(b && b.valueScore)) ? Number(b.valueScore) : shopValueScore(b);
  return aScore - bScore || b.uniqueStrains - a.uniqueStrains || compareShopName(a, b);
}

function compareShopRowsForSort(a, b, sortKey, browseMode) {
  if (sortKey === 'deals') {
    return compareDealStrength(a.bestDeal, b.bestDeal) ||
      (b.belowAverageDeals.length - a.belowAverageDeals.length) ||
      (b.uniqueStrains - a.uniqueStrains) ||
      compareShopName(a, b);
  }
  if (sortKey === 'availability') return b.uniqueStrains - a.uniqueStrains || compareShopName(a, b);
  if (sortKey === 'cheapest') return (a.cheapest ?? Infinity) - (b.cheapest ?? Infinity) || compareShopName(a, b);
  if (sortKey === 'average') return (a.averagePrice ?? Infinity) - (b.averagePrice ?? Infinity) || compareShopName(a, b);
  if (sortKey === 'name') return compareShopName(a, b);
  return compareShopRowsForBrowseMode(a, b, browseMode);
}

function isClosedShop(shop) {
  const value = shop && shop.is_closed;
  return value === true || Number(value) === 1 || normalise(value) === 'true';
}

function isHiddenCatalogShop(shop) {
  if (!shop || shop.show_in_admin == null) return false;
  const value = shop.show_in_admin;
  const text = normalise(value);
  return value === false || Number(value) === 0 || ['false', 'no', 'n', 'off'].includes(text);
}

function hasUnavailableMenuStatus(shop) {
  const status = normalise(shop && shop.menu_status);
  return Boolean(status && ['closed', 'archived', 'archive', 'previous', 'old', 'error', 'failed'].includes(status));
}

function isUnavailableCatalogShop(shop) {
  return Boolean(shop && (isClosedShop(shop) || isHiddenCatalogShop(shop) || hasUnavailableMenuStatus(shop)));
}

function sourceToken(value) {
  let decoded = String(value || '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch (_err) {
    // Keep the raw value if the URL has a malformed escape.
  }
  return decoded
    .toLowerCase()
    .replace(/^cs-/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function shopSourceTokens(shop) {
  return [
    sourceToken(shop && shop.name),
    sourceToken(String((shop && shop.shop_key) || '').replace(/^cs-/, ''))
  ].filter(token => token.length >= 5);
}

function buildClosedShopSourceTokens(shops) {
  return Array.from(new Set(
    (Array.isArray(shops) ? shops : [])
      .filter(isClosedShop)
      .flatMap(shopSourceTokens)
  ));
}

function buildUnavailableShopIds(shops) {
  return new Set(
    (Array.isArray(shops) ? shops : [])
      .filter(shop => isUnavailableCatalogShop(shop) || hasClosedShopSourceConflict(shop))
      .map(shop => String(shop.shop_id || '').trim())
      .filter(Boolean)
  );
}

function hasClosedShopSourceConflict(shop) {
  const source = sourceToken(shop && shop.image_url);
  if (!source) return false;
  const ownTokens = new Set(shopSourceTokens(shop));
  return state.closedShopSourceTokens.some(token => !ownTokens.has(token) && source.includes(token));
}

function isBrowsableMenuShop(shop) {
  if (!shop) return false;
  if (state.unavailableShopIds && state.unavailableShopIds.has(String(shop.shop_id))) return false;
  if (isUnavailableCatalogShop(shop)) return false;
  if (hasClosedShopSourceConflict(shop)) return false;
  return true;
}

function isBrowsableShopId(shopId) {
  const id = String(shopId || '').trim();
  if (!id || state.unavailableShopIds.has(id)) return false;
  return isBrowsableMenuShop(state.shopById.get(id));
}

function isBrowsableOffering(item) {
  return isBrowsableShopId(item && item.shop_id);
}

function getStrainFamilyKeys(name, type = '') {
  const text = normalise(name);
  const kind = normalise(type);
  const keys = FAMILY_DEFINITIONS
    .filter(family => family.terms.some(term => text.includes(term)))
    .map(family => family.key);
  if (kind === 'hash' && !keys.includes('hash')) keys.push('hash');
  return keys;
}

function familyLabel(key) {
  const family = FAMILY_BY_KEY.get(String(key || ''));
  return family ? family.label : 'All families';
}

function browseModeLabel(key) {
  const mode = BROWSE_MODE_BY_KEY.get(String(key || ''));
  return mode ? mode.label : 'Best value';
}

function browseModeSummary(key) {
  const mode = BROWSE_MODE_BY_KEY.get(String(key || ''));
  return mode ? mode.summary : 'best value';
}

function browseModeIsFilter(key) {
  return ['under10', 'rare', 'cali', 'sativa', 'hybrid', 'indica'].includes(String(key || ''));
}

function browseModeChipLabel(key) {
  const label = browseModeLabel(key);
  return `${browseModeIsFilter(key) ? 'Filter' : 'Order'}: ${label}`;
}

function latestListingTime(listings) {
  return (Array.isArray(listings) ? listings : []).reduce((latest, item) => {
    const time = displayListingTime(item);
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);
}

function statValueScore(stat) {
  const price = stat.filteredCheapest == null ? 99 : Number(stat.filteredCheapest);
  const availability = Math.min(Number(stat.filteredShopCount) || 0, 24);
  const latest = latestListingTime(stat.filteredOfferings);
  const ageDays = latest ? ageDaysFromTime(latest) : 120;
  return price - (availability * 0.12) + Math.min(ageDays, 120) * 0.015;
}

function weeklySeed() {
  return Math.floor(Date.now() / (7 * 86400000));
}

function seededNoise(value, salt = '') {
  const input = `${value || ''}|${salt}|${weeklySeed()}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function statMatchesBrowseMode(stat, mode) {
  if (!browseModeIsFilter(mode)) return true;
  if (mode === 'under10') return stat.filteredCheapest != null && Number(stat.filteredCheapest) <= 10;
  if (mode === 'rare') return stat.filteredShopCount === 2 || stat.filteredShopCount === 3;
  if (mode === 'cali') return stat.filteredCaliCount > 0;
  if (mode === 'sativa' || mode === 'hybrid' || mode === 'indica') return statTypeCount(stat, mode) > 0;
  return true;
}

function statTypeCount(stat, type) {
  return Number((stat && stat.filteredTypeCounts && stat.filteredTypeCounts[type]) || 0);
}

function compareStatsForBrowseMode(a, b, filters) {
  if (filters.sort === 'name') return compareStrainName(a, b);
  if (filters.sort === 'deals') return compareStatsByDeal(a, b);
  if (filters.sort === 'cheapest') return (a.filteredCheapest ?? Infinity) - (b.filteredCheapest ?? Infinity) || compareStrainName(a, b);
  if (filters.sort === 'average') return (a.filteredAvg ?? Infinity) - (b.filteredAvg ?? Infinity) || compareStrainName(a, b);
  if (filters.sort === 'availability') return b.filteredShopCount - a.filteredShopCount || compareStrainName(a, b);

  const mode = filters.browseMode || 'value';
  if (mode === 'az') return compareStrainName(a, b);
  if (mode === 'available') return b.filteredShopCount - a.filteredShopCount || compareStrainName(a, b);
  if (mode === 'fresh') {
    const freshDiff = latestListingTime(b.filteredOfferings) - latestListingTime(a.filteredOfferings);
    if (freshDiff !== 0) return freshDiff;
    return (a.filteredCheapest ?? Infinity) - (b.filteredCheapest ?? Infinity) || compareStrainName(a, b);
  }
  if (mode === 'under10') return (a.filteredCheapest ?? Infinity) - (b.filteredCheapest ?? Infinity) || b.filteredShopCount - a.filteredShopCount || compareStrainName(a, b);
  if (mode === 'rare') {
    const noiseDiff = seededNoise(b.name || b.key, 'rare-browser') - seededNoise(a.name || a.key, 'rare-browser');
    if (noiseDiff !== 0) return noiseDiff;
    return compareStrainName(a, b);
  }
  if (mode === 'cali') return b.filteredCaliCount - a.filteredCaliCount || (a.filteredCheapest ?? Infinity) - (b.filteredCheapest ?? Infinity) || compareStrainName(a, b);
  if (mode === 'sativa' || mode === 'hybrid' || mode === 'indica') return statTypeCount(b, mode) - statTypeCount(a, mode) || (a.filteredCheapest ?? Infinity) - (b.filteredCheapest ?? Infinity) || b.filteredShopCount - a.filteredShopCount || compareStrainName(a, b);
  return statValueScore(a) - statValueScore(b) || b.filteredShopCount - a.filteredShopCount || compareStrainName(a, b);
}

function resetStrainWindow() {
  state.visibleStrainLimit = INITIAL_STRAIN_LIMIT;
}

const STRAIN_SHELF_STORAGE_KEYS = ['budfinder_strain_shelf', 'locate3_strain_shelf'];
const SELECTED_SHOPS_STORAGE_KEY = 'budfinder_explorer_selected_shops';
const MAP_FOCUS_SHOPS_STORAGE_KEY = 'budfinder_map_focus_shops';
const DATABASE_NAVIGATION_STATE_KEY = 'budfinder_database_navigation_state';
const INITIAL_STRAIN_LIMIT = 12;
const STRAIN_LIMIT_STEP = 12;
const BROWSE_MODES = [
  { key: 'value', label: 'Best value', summary: 'best value' },
  { key: 'available', label: 'Most stocked', summary: 'most stocked' },
  { key: 'fresh', label: 'Fresh menus', summary: 'fresh menus' },
  { key: 'under10', label: 'Under €10', summary: 'under €10' },
  { key: 'rare', label: '2–3-shop finds', summary: '2–3-shop' },
  { key: 'cali', label: 'Cali available', summary: 'Cali-listing availability' },
  { key: 'sativa', label: 'Sativa', summary: 'sativa' },
  { key: 'hybrid', label: 'Hybrid', summary: 'hybrid' },
  { key: 'indica', label: 'Indica', summary: 'indica' },
  { key: 'az', label: 'A-Z', summary: 'A-Z' }
];
const BROWSE_MODE_BY_KEY = new Map(BROWSE_MODES.map(mode => [mode.key, mode]));
const FAMILY_DEFINITIONS = [
  { key: 'amnesia', label: 'Amnesia', terms: ['amnesia', 'ammo'] },
  { key: 'haze', label: 'Haze', terms: ['haze', 'silver haze', 'ssh'] },
  { key: 'kush', label: 'Kush', terms: ['kush', 'og kush', 'kosher'] },
  { key: 'gelato', label: 'Gelato', terms: ['gelato'] },
  { key: 'cookies', label: 'Cookies', terms: ['cookies', 'cookie', 'gsc'] },
  { key: 'cake', label: 'Cake', terms: ['cake', 'wedding cake', 'birthday'] },
  { key: 'skunk', label: 'Skunk', terms: ['skunk'] },
  { key: 'cheese', label: 'Cheese', terms: ['cheese'] },
  { key: 'lemon', label: 'Lemon', terms: ['lemon', 'lemonade'] },
  { key: 'widow', label: 'Widow', terms: ['widow'] },
  { key: 'diesel', label: 'Diesel', terms: ['diesel', 'sour d'] },
  { key: 'runtz', label: 'Runtz/Z', terms: ['runtz', 'zkittle', 'zkit', 'zushi', 'zheetos'] },
  { key: 'gorilla', label: 'Gorilla', terms: ['gorilla', 'glue', 'gg4'] },
  { key: 'critical', label: 'Critical', terms: ['critical'] },
  { key: 'purple', label: 'Purple', terms: ['purple', 'violet'] },
  { key: 'hash', label: 'Hash', terms: ['hash', 'polm', 'pollen', 'charas', 'filtrato', 'static', 'isolator', 'temple'] }
];
const FAMILY_BY_KEY = new Map(FAMILY_DEFINITIONS.map(family => [family.key, family]));

function parseStoredJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch (_err) {
    return undefined;
  }
}

function loadStoredShelfNames() {
  const out = [];
  const seen = new Set();
  STRAIN_SHELF_STORAGE_KEYS.forEach(key => {
    const parsed = parseStoredJson(key);
    if (!Array.isArray(parsed)) return;
    parsed.forEach(name => {
      const clean = String(name || '').replace(/\s+/g, ' ').trim();
      const marker = normalise(clean);
      if (!marker || seen.has(marker)) return;
      seen.add(marker);
      out.push(clean);
    });
  });
  return out;
}

function saveStoredShelfNames(names) {
  let raw = '[]';
  try {
    raw = JSON.stringify(names);
  } catch (_err) {
    return;
  }
  STRAIN_SHELF_STORAGE_KEYS.forEach(key => {
    try {
      localStorage.setItem(key, raw);
    } catch (_err) {
      // Storage can be blocked in private browsing or hardened browser modes.
    }
  });
}

function loadSelectedShopIds() {
  const parsed = parseStoredJson(SELECTED_SHOPS_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  return parsed
    .map(value => String(value || '').trim())
    .filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function saveSelectedShopIds() {
  try {
    localStorage.setItem(SELECTED_SHOPS_STORAGE_KEY, JSON.stringify(state.selectedShopIds));
  } catch (_err) {
    // Storage can be blocked in private browsing or hardened browser modes.
  }
}

function hasExplicitDatabaseUrlState() {
  const params = new URLSearchParams(window.location.search || '');
  return ['strain', 'search', 'detail', 'mode', 'view', 'browser', 'shop_id', 'shopId', 'shop', 'shop_name']
    .some(key => params.has(key));
}

function saveDatabaseNavigationState() {
  const detail = state.detail && typeof state.detail === 'object'
    ? {
        type: state.detail.type || '',
        key: state.detail.key || '',
        shopId: state.detail.shopId || ''
      }
    : null;
  const payload = {
    view: state.view,
    search: els.search ? els.search.value : '',
    browseMode: state.browseMode,
    familyFilter: state.familyFilter,
    activeShopId: state.activeShopId,
    shopMenuExpanded: Boolean(state.shopMenuExpanded),
    discoveryBrowser: state.discoveryBrowser || '',
    detail,
    detailReturnSearch: state.detailReturnSearch || ''
  };
  try {
    localStorage.setItem(DATABASE_NAVIGATION_STATE_KEY, JSON.stringify(payload));
  } catch (_err) {
    // URL links still carry the active strain or shop when storage is unavailable.
  }
}

function restoreDatabaseNavigationState() {
  if (hasExplicitDatabaseUrlState()) return;
  const saved = parseStoredJson(DATABASE_NAVIGATION_STATE_KEY);
  if (!saved || typeof saved !== 'object') return;

  if (['strains', 'shops', 'compare'].includes(saved.view)) state.view = saved.view;
  if (typeof saved.search === 'string' && els.search) els.search.value = saved.search;
  if (BROWSE_MODE_BY_KEY.has(saved.browseMode)) state.browseMode = saved.browseMode;
  if (saved.familyFilter && FAMILY_BY_KEY.has(saved.familyFilter)) state.familyFilter = saved.familyFilter;
  if (saved.discoveryBrowser === 'shops' || saved.discoveryBrowser === 'strains') {
    state.discoveryBrowser = saved.discoveryBrowser;
  }

  const shopId = String(saved.activeShopId || '').trim();
  if (shopId && isBrowsableShopId(shopId)) {
    state.activeShopId = shopId;
    state.shopMenuExpanded = Boolean(saved.shopMenuExpanded);
    const meta = getShopMeta(shopId);
    if (els.shopBrowserSearch && meta && meta.name) els.shopBrowserSearch.value = meta.name;
  }

  const detail = saved.detail && typeof saved.detail === 'object' ? saved.detail : null;
  if (detail && detail.type === 'strain' && getStatByKey(detail.key)) {
    state.detail = { type: 'strain', key: normalise(detail.key) };
    state.view = 'strains';
  } else if (detail && detail.type === 'shop' && isBrowsableShopId(String(detail.shopId || ''))) {
    state.detail = { type: 'shop', shopId: String(detail.shopId) };
    state.view = 'shops';
    state.activeShopId = String(detail.shopId);
    state.shopMenuExpanded = true;
  }
  state.detailReturnSearch = typeof saved.detailReturnSearch === 'string' ? saved.detailReturnSearch : '';
}

async function loadJson(path) {
  const candidates = [path, `./${path}`, `/${path}`];
  let lastError = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Could not load ${path}`);
}

async function loadText(path) {
  const candidates = [path, `./${path}`, `/${path}`];
  let lastError = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Could not load ${path}`);
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function buildStrainImageMap(csvText) {
  const lines = String(csvText || '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return new Map();
  const headers = parseCsvLine(lines[0]).map(normalise);
  const nameIndex = headers.indexOf('strain_name');
  const imageIndex = headers.indexOf('image_filename');
  const nextMap = new Map();
  lines.slice(1).forEach(line => {
    const cells = parseCsvLine(line);
    const name = (cells[nameIndex] || '').trim();
    const image = (cells[imageIndex] || '').trim();
    const key = normalise(name);
    if (key && image && !nextMap.has(key)) nextMap.set(key, image);
  });
  return nextMap;
}

function locationDatasetLabel(file) {
  const filename = String(file || '').split('/').pop() || '';
  const stem = filename.replace(/\.csv$/i, '');
  const cleaned = stem
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:locations?|location)\b/ig, ' ')
    .replace(/\bloc\s*\d*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    ? cleaned.split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ')
    : filename;
}

function cityScopeSlug(value) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === 'gronigen') return 'groningen';
  return slug;
}

function normaliseLocationDatasetPath(pathLike) {
  const raw = String(pathLike || '').trim();
  if (!raw) return '';
  if (/^city:/i.test(raw)) return `city:${cityScopeSlug(raw.slice(5))}`;
  const filename = raw.split('/').pop() || '';
  const label = /\.csv$/i.test(filename) ? locationDatasetLabel(filename) : raw;
  const slug = cityScopeSlug(label);
  return slug ? `city:${slug}` : '';
}

function csvValueIsYes(value) {
  return ['y', 'yes', 'true', '1'].includes(normalise(value));
}

async function loadLocationCatalog() {
  try {
    const index = await loadJson('database/locations/index.json');
    const masterFile = String(index && index.master || 'coffeeshops.csv').trim();
    const csvText = await loadText(`database/locations/${masterFile}`);
    const lines = String(csvText || '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) throw new Error('Nationwide coffeeshop master is empty.');
    const headers = parseCsvLine(lines[0]).map(value => normalise(String(value || '').replace(/^\uFEFF/, '')));
    const keyIndex = headers.indexOf('shop_key');
    const logoIndex = headers.indexOf('logo');
    const nameIndex = headers.indexOf('name');
    const cityIndex = headers.indexOf('city');
    const citySlugIndex = headers.indexOf('city_slug');
    const latIndex = headers.indexOf('lat');
    const lngIndex = headers.indexOf('lng');
    const statusIndex = headers.indexOf('status');
    if (keyIndex < 0 || nameIndex < 0 || cityIndex < 0) {
      throw new Error('Nationwide coffeeshop master is missing required columns.');
    }
    const shopLogoByKey = new Map();
    const shopCoordinatesByKey = new Map();
    const shopCoordinatesByNameCity = new Map();
    const datasetsBySlug = new Map();
    const masterShops = [];

    lines.slice(1).forEach(line => {
      const cells = parseCsvLine(line);
      const status = statusIndex >= 0 ? (cells[statusIndex] || '').trim().toLowerCase() : 'open';
      if (status === 'closed') return;
      const shopKey = (cells[keyIndex] || '').trim();
      const shopName = (cells[nameIndex] || '').trim();
      const shopCity = (cells[cityIndex] || '').trim();
      const citySlug = cityScopeSlug(citySlugIndex >= 0 ? cells[citySlugIndex] : shopCity);
      if (!shopKey || !shopName || !shopCity || !citySlug) return;
      const logo = logoIndex >= 0 ? (cells[logoIndex] || '').trim() : '';
      const latitude = latIndex >= 0 ? Number(cells[latIndex]) : NaN;
      const longitude = lngIndex >= 0 ? Number(cells[lngIndex]) : NaN;
      const coordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [latitude, longitude]
        : null;
      const nameCityKey = `${normalise(shopName)}|${normalise(shopCity)}`;
      if (!datasetsBySlug.has(citySlug)) {
        datasetsBySlug.set(citySlug, {
          file: masterFile,
          path: `city:${citySlug}`,
          label: shopCity,
          slug: citySlug,
          shopKeys: new Set(),
          nameCityKeys: new Set()
        });
      }
      const dataset = datasetsBySlug.get(citySlug);
      dataset.shopKeys.add(shopKey);
      dataset.nameCityKeys.add(nameCityKey);
      if (logo) shopLogoByKey.set(shopKey, logo);
      if (coordinates) {
        shopCoordinatesByKey.set(shopKey, coordinates);
        shopCoordinatesByNameCity.set(nameCityKey, coordinates);
      }
      masterShops.push({ shopKey, name: shopName, city: shopCity, citySlug, coordinates, logo });
    });

    const datasets = Array.from(datasetsBySlug.values())
      .sort((a, b) => compareText(a.label, b.label));
    return { shopLogoByKey, shopCoordinatesByKey, shopCoordinatesByNameCity, datasets, masterShops };
  } catch (_err) {
    return {
      shopLogoByKey: new Map(),
      shopCoordinatesByKey: new Map(),
      shopCoordinatesByNameCity: new Map(),
      datasets: []
    };
  }
}

function storedLocationDatasetPath() {
  try {
    const raw = localStorage.getItem('budfinder_database_city_scope');
    if (!raw) return '';
    try {
      return normaliseLocationDatasetPath(JSON.parse(raw));
    } catch (_err) {
      return normaliseLocationDatasetPath(raw);
    }
  } catch (_err) {
    return '';
  }
}

function saveLocationDatasetPath(pathLike) {
  const path = normaliseLocationDatasetPath(pathLike);
  try {
    if (path) localStorage.setItem('budfinder_database_city_scope', JSON.stringify(path));
    else localStorage.removeItem('budfinder_database_city_scope');
  } catch (_err) {
    // Storage is optional; the active page still uses the selected dataset.
  }
}

function pickDefaultLocationDataset(datasets) {
  const available = Array.isArray(datasets) ? datasets : [];
  const stored = storedLocationDatasetPath();
  const saved = available.find(dataset => dataset.path === stored);
  return saved || null;
}

function activeLocationDataset() {
  return state.locationDatasets.find(dataset => dataset.path === state.activeLocationDataset) || null;
}

function offeringBelongsToDataset(item, dataset) {
  if (!dataset) return true;
  const shopKey = String(item && item.shop_key || '').trim();
  if (shopKey && dataset.shopKeys.has(shopKey)) return true;
  const nameCityKey = `${normalise(item && item.shop_name)}|${normalise(item && item.shop_city)}`;
  return nameCityKey !== '|' && dataset.nameCityKeys.has(nameCityKey);
}

function populateLocationDatasetFilter() {
  const options = '<option value="">All Netherlands</option>' + state.locationDatasets.map(dataset =>
    `<option value="${escapeHtmlAttr(dataset.path)}"${dataset.path === state.activeLocationDataset ? ' selected' : ''}>${escapeHtml(dataset.label)}</option>`
  ).join('');
  [els.locationDataset, els.searchCityScope].filter(Boolean).forEach(select => {
    select.innerHTML = options;
    select.value = state.activeLocationDataset || '';
    select.disabled = !state.locationDatasets.length;
  });
}

function applyLocationDatasetScope(pathLike, options = {}) {
  const path = normaliseLocationDatasetPath(pathLike);
  const dataset = state.locationDatasets.find(item => item.path === path) || null;
  state.activeLocationDataset = dataset ? dataset.path : '';
  state.searchScope = dataset ? 'city' : 'all';
  state.offerings = dataset
    ? state.allOfferings.filter(item => offeringBelongsToDataset(item, dataset))
    : state.allOfferings.slice();
  state.listingCheckBatch = buildListingCheckBatchSignal(state.offerings);
  if (options.persist !== false) saveLocationDatasetPath(dataset ? dataset.path : '');
  populateLocationDatasetFilter();
}

function syncSearchScopeControls() {
  [els.locationDataset, els.searchCityScope].filter(Boolean).forEach(select => {
    select.value = state.activeLocationDataset || '';
  });
}

function setSearchScope(pathLike) {
  applyLocationDatasetScope(pathLike, { persist: true });
  state.activeShopId = '';
  state.shopMenuExpanded = false;
  state.detail = null;
  discoverySuggestionSelection = null;
  buildStats();
  populateFilters();
  setupPriceBand();
  resetStrainWindow();
  syncSearchScopeControls();
  render();
  if (els.status) {
    const scopeLabel = state.searchScope === 'all'
      ? 'all Netherlands'
      : (activeLocationDataset()?.label || 'the selected city');
    els.status.textContent = `Searching ${scopeLabel}: ${state.offerings.length.toLocaleString()} current menu listings across ${state.strainStats.length.toLocaleString()} strains.`;
  }
}

function strainImageCandidates(filename) {
  const raw = String(filename || '').trim();
  if (!raw) return [];
  const encoded = encodeURIComponent(raw);
  return Array.from(new Set([
    `images/strains/${encoded}`,
    `images/strains/${raw}`,
    `./images/strains/${encoded}`,
    `./images/strains/${raw}`,
    `/images/strains/${encoded}`,
    `/images/strains/${raw}`
  ]));
}

function strainInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'ST').slice(0, 2);
}

function getStrainImageHtml(name) {
  const filename = state.strainImageByKey.get(normalise(name));
  const fallback = `<span class="strain-art-fallback">${escapeHtml(strainInitials(name))}</span>`;
  if (!filename) return `<span class="strain-art">${fallback}</span>`;
  const candidates = strainImageCandidates(filename);
  if (!candidates.length) return `<span class="strain-art">${fallback}</span>`;
  return (
    `<span class="strain-art">` +
      `<img src="${escapeHtmlAttr(candidates[0])}" alt="${escapeHtmlAttr(name)} strain art" ` +
      `data-candidates="${escapeHtmlAttr(candidates.join('|'))}" data-idx="0">` +
      fallback +
    `</span>`
  );
}

function getStrainDetailImageHtml(name) {
  const filename = state.strainImageByKey.get(normalise(name));
  const candidates = strainImageCandidates(filename);
  if (!candidates.length) return '';
  return (
    `<figure class="detail-strain-art">` +
      `<img src="${escapeHtmlAttr(candidates[0])}" alt="${escapeHtmlAttr(name)} strain art" ` +
      `data-candidates="${escapeHtmlAttr(candidates.join('|'))}" data-idx="0">` +
    `</figure>`
  );
}

function handleStrainImageError(img) {
  const candidates = String(img.getAttribute('data-candidates') || '').split('|').filter(Boolean);
  const nextIndex = Number(img.getAttribute('data-idx') || 0) + 1;
  if (candidates[nextIndex]) {
    img.setAttribute('data-idx', String(nextIndex));
    img.src = candidates[nextIndex];
    return;
  }
  const detailFigure = img.closest('.detail-strain-art');
  if (detailFigure) {
    detailFigure.remove();
    return;
  }
  img.remove();
}

function getShopLogoHtml(shopKey, shopName) {
  const explicit = state.shopLogoByKey.get(String(shopKey || '').trim());
  const candidates = window.BudfinderLogos
    ? window.BudfinderLogos.candidates({ filename: explicit, shopKey, shopName })
    : [];
  if (!candidates.length) return '<span class="shop-art" aria-hidden="true"></span>';
  return (
    `<span class="shop-art">` +
      `<img src="${escapeHtmlAttr(candidates[0])}" alt="" aria-hidden="true" ` +
      `data-candidates="${escapeHtmlAttr(candidates.join('|'))}" data-idx="0">` +
    `</span>`
  );
}

function handleShopLogoError(img) {
  if (window.BudfinderLogos && window.BudfinderLogos.advanceImage(img)) return;
  img.remove();
}

function buildStats() {
  const byStrain = new Map();
  state.offerings.forEach(item => {
    const key = item.strain_name_normalised || normalise(item.strain_name);
    if (!key) return;
    if (!byStrain.has(key)) {
      byStrain.set(key, {
        key,
        name: item.strain_name || key,
        offerings: [],
        shops: new Map(),
        cities: new Set(),
        types: new Map(),
        caliCount: 0
      });
    }
    const stat = byStrain.get(key);
    stat.offerings.push(item);
    stat.cities.add(item.shop_city || '');
    if (item.shop_id != null) stat.shops.set(String(item.shop_id), item);
    if (item.base_type) stat.types.set(item.base_type, (stat.types.get(item.base_type) || 0) + 1);
    if (Number(item.is_cali) === 1) stat.caliCount += 1;
  });

  state.strainStats = Array.from(byStrain.values()).map(stat => {
    const prices = stat.offerings.map(item => Number(item.price_amount)).filter(Number.isFinite);
    const cheapest = prices.length ? Math.min(...prices) : null;
    const avg = average(prices);
    const topType = Array.from(stat.types.entries()).sort((a, b) => b[1] - a[1])[0];
    const topTypeName = topType ? topType[0] : '';
    return {
      ...stat,
      shopCount: stat.shops.size,
      listingCount: stat.offerings.length,
      cities: Array.from(stat.cities).filter(Boolean).sort(compareText),
      cheapest,
      avg,
      topType: topTypeName,
      families: getStrainFamilyKeys(stat.name, topTypeName),
      typeCount: stat.types.size
    };
  });
}

function populateFilters() {
  const types = unique(state.offerings.map(item => item.base_type)).sort(compareText);
  els.type.innerHTML = '<option value="">All types</option>' + types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
}

function setupPriceBand() {
  const prices = state.offerings.map(item => Number(item.price_amount)).filter(Number.isFinite);
  const min = prices.length ? Math.floor(Math.min(...prices) * 2) / 2 : 0;
  const max = prices.length ? Math.ceil(Math.max(...prices) * 2) / 2 : 50;
  state.priceBounds = { min, max };
  [els.priceMin, els.priceMax].forEach(input => {
    input.min = String(min);
    input.max = String(max);
    input.step = '0.5';
  });
  els.priceMin.value = String(min);
  els.priceMax.value = String(max);
  syncPriceBandLabels();
}

function syncPriceBandLabels() {
  let min = Number(els.priceMin.value);
  let max = Number(els.priceMax.value);
  if (min > max) {
    const active = document.activeElement;
    if (active === els.priceMin) {
      max = min;
      els.priceMax.value = String(max);
    } else {
      min = max;
      els.priceMin.value = String(min);
    }
  }
  const fullRange = min <= state.priceBounds.min && max >= state.priceBounds.max;
  els.priceBandValue.textContent = fullRange ? 'Any price' : `${money(min)} to ${money(max)}`;
  els.priceMin.setAttribute('aria-valuetext', money(min));
  els.priceMax.setAttribute('aria-valuetext', money(max));
}

function currentFilters() {
  syncPriceBandLabels();
  return {
    q: normalise(els.search.value),
    city: '',
    type: els.type.value,
    legal: els.legal.value,
    cali: els.cali.value,
    priceMin: Number(els.priceMin.value),
    priceMax: Number(els.priceMax.value),
    sort: els.sort.value,
    browseMode: state.browseMode,
    family: state.familyFilter
  };
}

function offeringMatchesBaseFilters(item, filters) {
  if (filters.city && item.shop_city !== filters.city) return false;
  if (filters.type && item.base_type !== filters.type) return false;
  if (filters.legal !== '' && String(Number(item.is_legal) || 0) !== filters.legal) return false;
  if (filters.cali !== '' && String(Number(item.is_cali) || 0) !== filters.cali) return false;
  const amount = Number(item.price_amount);
  if (Number.isFinite(amount)) {
    if (Number.isFinite(filters.priceMin) && amount < filters.priceMin) return false;
    if (Number.isFinite(filters.priceMax) && amount > filters.priceMax) return false;
  }
  return true;
}

function offeringMatches(item, filters) {
  if (!offeringMatchesBaseFilters(item, filters)) return false;
  if (filters.q) {
    if (!offeringMatchesSearch(item, filters.q)) return false;
  }
  return true;
}

function offeringMatchesShopSearch(item, filters) {
  if (!offeringMatchesBaseFilters(item, filters)) return false;
  if (filters.family) {
    const families = getStrainFamilyKeys(item.strain_name, item.base_type);
    if (!families.includes(filters.family)) return false;
  }
  if (!filters.q) return true;
  return fieldMatchesSearch(item.shop_name, filters.q) || fieldMatchesSearch(item.shop_city, filters.q);
}

function getBaseFilteredOfferings() {
  const filters = currentFilters();
  return state.offerings.filter(item => offeringMatches(item, filters));
}

function getShopSearchOfferings() {
  const filters = currentFilters();
  return state.offerings.filter(item => offeringMatchesShopSearch(item, filters));
}

function offeringsForStats(stats) {
  return (Array.isArray(stats) ? stats : []).flatMap(stat => stat.filteredOfferings || []);
}

function getFilteredOfferings(stats) {
  return Array.isArray(stats) ? offeringsForStats(stats) : offeringsForStats(getFilteredStats());
}

function getFilteredStats(options = {}) {
  const filtered = getBaseFilteredOfferings();
  const keys = new Set(filtered.map(item => item.strain_name_normalised || normalise(item.strain_name)));
  const filters = currentFilters();
  const stats = state.strainStats
    .filter(stat => keys.has(stat.key))
    .map(stat => {
      const matchingOfferings = stat.offerings.filter(item => offeringMatches(item, filters));
      const prices = matchingOfferings.map(item => Number(item.price_amount)).filter(Number.isFinite);
      const filteredDeals = belowAverageDealsForOfferings(matchingOfferings);
      const matchingTypes = new Map();
      matchingOfferings.forEach(item => {
        if (item.base_type) matchingTypes.set(item.base_type, (matchingTypes.get(item.base_type) || 0) + 1);
      });
      return {
        ...stat,
        filteredOfferings: matchingOfferings,
        filteredShopCount: new Set(matchingOfferings.map(item => item.shop_id)).size,
        filteredListingCount: matchingOfferings.length,
        filteredCheapest: prices.length ? Math.min(...prices) : null,
        filteredHighest: prices.length ? Math.max(...prices) : null,
        filteredAvg: average(prices),
        filteredBestDeal: filteredDeals[0] || null,
        filteredDealCount: filteredDeals.length,
        filteredCaliCount: matchingOfferings.filter(item => Number(item.is_cali) === 1).length,
        filteredHashCount: matchingOfferings.filter(item => item.base_type === 'hash').length,
        filteredTypeCounts: Object.fromEntries(matchingTypes.entries()),
        filteredTopType: Array.from(matchingTypes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
      };
    })
    .filter(stat => options.ignoreFamily || !filters.family || stat.families.includes(filters.family))
    .filter(stat => options.ignoreBrowseMode || statMatchesBrowseMode(stat, filters.browseMode));

  stats.sort((a, b) => compareStatsForBrowseMode(a, b, filters));
  return stats;
}

function renderMetrics(filteredOfferings, filteredStats) {
  const shops = new Set(filteredOfferings.map(item => item.shop_id));
  const strainAverages = filteredStats
    .map(stat => Number(stat.filteredAvg))
    .filter(Number.isFinite);
  const mostStocked = filteredStats
    .slice()
    .sort((a, b) => b.filteredShopCount - a.filteredShopCount || compareStrainName(a, b))[0] || null;
  const rareCount = filteredStats
    .filter(stat => stat.filteredShopCount === 2 || stat.filteredShopCount === 3)
    .length;
  els.metricAverage.textContent = strainAverages.length
    ? money(average(strainAverages))
    : 'No price data';
  els.metricMostStocked.textContent = mostStocked
    ? `${mostStocked.name} · ${mostStocked.filteredShopCount} shops`
    : 'No matches';
  els.metricRare.textContent = `${rareCount.toLocaleString()} strains`;
  els.metricShops.textContent = shops.size.toLocaleString();
}

function renderBrowseControls(familySourceStats, filteredStats) {
  if (els.browseModeGrid) {
    els.browseModeGrid.querySelectorAll('[data-browse-mode]').forEach(button => {
      const active = button.dataset.browseMode === state.browseMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  if (els.familyFilterGrid) {
    const counts = new Map();
    familySourceStats.forEach(stat => {
      (stat.families || []).forEach(key => {
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    const families = FAMILY_DEFINITIONS
      .map(family => ({ ...family, count: counts.get(family.key) || 0 }))
      .filter(family => family.count > 0 || family.key === state.familyFilter)
      .sort((a, b) => compareText(a.label, b.label));
    const allActive = !state.familyFilter;
    els.familyFilterGrid.innerHTML = `
      <button class="${allActive ? 'is-active' : ''}" type="button" data-family-filter="" aria-pressed="${allActive}">
        <span>All families</span>
        <small>${familySourceStats.length.toLocaleString()}</small>
      </button>
      ${families.map(family => `
        <button class="${state.familyFilter === family.key ? 'is-active' : ''}" type="button" data-family-filter="${escapeHtmlAttr(family.key)}" aria-pressed="${state.familyFilter === family.key}">
          <span>${escapeHtml(family.label)}</span>
          <small>${family.count.toLocaleString()}</small>
        </button>
      `).join('')}
    `;
  }

  if (els.browseSummary) {
    const filters = currentFilters();
    const visible = Math.min(state.visibleStrainLimit, filteredStats.length);
    const chips = [
      browseModeChipLabel(state.browseMode),
      state.familyFilter ? familyLabel(state.familyFilter) : 'All families',
      filters.sort ? `Sort: ${sortModeLabel(filters.sort)}` : '',
      `${visible.toLocaleString()} of ${filteredStats.length.toLocaleString()} strains`
    ].filter(Boolean);
    els.browseSummary.innerHTML = chips.map(chip => `<span class="chip">${escapeHtml(chip)}</span>`).join('');
  }
}

function shopIdsForListings(listings) {
  const seen = new Set();
  return (Array.isArray(listings) ? listings : [])
    .map(item => String((item && item.shop_id) || '').trim())
    .filter(id => {
      if (!id || seen.has(id) || !isBrowsableShopId(id)) return false;
      seen.add(id);
      return true;
    });
}

function visibleOfferingsForStat(stat) {
  if (!stat) return [];
  return Array.isArray(stat.filteredOfferings) ? stat.filteredOfferings : (stat.offerings || []);
}

function quickAnswerShouldUseDeal(filters) {
  const hasSearch = Boolean(normalise(filters && filters.q));
  if (hasSearch) return false;
  if (filters && filters.sort === 'deals') return true;
  return !filters.sort && (!filters.browseMode || filters.browseMode === 'value');
}

function quickAnswerListingId(item) {
  return [
    item && item.shop_id,
    item && (item.strain_id || item.strain_name_normalised || item.strain_name),
    item && item.price_amount,
    item && item.price_unit,
    item && item.package_weight_g,
    item && item.is_legal
  ].map(value => String(value || '').trim()).join('|');
}

function quickAnswerListingsForStat(stat, featured, limit = 5) {
  const seen = new Set();
  const listings = [];
  [featured, ...cheapestListingsForStat(stat, limit + 1)].filter(Boolean).forEach(item => {
    const id = quickAnswerListingId(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    listings.push(item);
  });
  return listings.slice(0, limit);
}

function pickQuickAnswerStat(filteredStats, filters) {
  if (!filteredStats.length) return null;
  const q = normalise(filters && filters.q);
  if (q) {
    const exact = filteredStats.find(stat => normalise(stat.name) === q || stat.key === q);
    if (exact) return exact;
    return filteredStats[0];
  }
  if (quickAnswerShouldUseDeal(filters)) {
    return filteredStats
      .filter(stat => stat.filteredBestDeal)
      .slice()
      .sort(compareStatsByDeal)[0] || filteredStats[0];
  }
  return filteredStats[0];
}

function renderQuickAnswer(filteredOfferings, filteredStats) {
  if (!els.quickAnswer) return;
  const filters = currentFilters();
  if (state.view === 'shops' || !filters.q) {
    els.quickAnswer.hidden = true;
    els.quickAnswer.classList.add('is-empty');
    els.quickAnswer.innerHTML = '';
    return;
  }
  els.quickAnswer.hidden = false;
  const stat = pickQuickAnswerStat(filteredStats, filters);

  if (!stat || !filteredOfferings.length) {
    els.quickAnswer.classList.add('is-empty');
    const alternatives = filters.q ? alternativeStrainsForQuery(els.search.value, state.strainStats, 4) : [];
    els.quickAnswer.innerHTML = filters.q
      ? `
        <p>No current listings matched "${escapeHtml(els.search.value)}". Try a shorter strain name, clear a filter, or pick an available alternative.</p>
        ${alternativeLinksHtml(alternatives)}
      `
      : 'Search a strain or coffeeshop to see prices, menus, and useful next actions.';
    return;
  }

  const featuredDeal = quickAnswerShouldUseDeal(filters) ? stat.filteredBestDeal : null;
  const featured = (featuredDeal && featuredDeal.item) || cheapestListingsForStat(stat, 1)[0];
  const listings = quickAnswerListingsForStat(stat, featured, 5);
  if (!featured) {
    els.quickAnswer.classList.add('is-empty');
    els.quickAnswer.innerHTML = `
      <p>No priced listings are visible for ${escapeHtml(stat.name)} yet. Try including price-unknown listings or another strain.</p>
      ${alternativeLinksHtml(similarStrainsForStat(stat, state.strainStats, 4))}
    `;
    return;
  }

  const allShopIds = shopIdsForListings(stat.filteredOfferings);
  const featuredShopId = String(featured.shop_id || '');
  const priceLabel = listingPriceLabel(featured);
  const updated = listingUpdatedLabel(featured);
  const mapContext = { strainName: stat.name, strainShopIds: allShopIds };
  const allMapUrl = mapUrlForShopIds(allShopIds, mapContext);
  const featuredMapUrl = mapUrlForShopIds([featuredShopId], mapContext);
  const sourceUrl = shopLinkForId(featuredShopId);
  const featuredDealCopy = featuredDeal
    ? `${featuredDeal.percentBelow}% below average ${money(featuredDeal.averagePrice, featured.price_currency, featured.price_unit)}`
    : '';
  const headline = filters.q
    ? `Cheapest visible ${stat.name}`
    : featuredDeal
      ? `Best value: ${stat.name}`
      : `${browseModeLabel(filters.browseMode)} pick: ${stat.name}`;

  els.quickAnswer.classList.remove('is-empty');
  els.quickAnswer.innerHTML = `
    <div class="quick-answer-head">
      <div>
        <span class="quick-answer-kicker">Best answer</span>
        <h2>${escapeHtml(headline)}</h2>
        <p class="quick-answer-copy">
          ${escapeHtml(featured.shop_name || 'Unknown shop')}${featured.shop_city ? ` · ${escapeHtml(featured.shop_city)}` : ''}
          ${featuredDealCopy ? ` · ${escapeHtml(featuredDealCopy)}` : ''}${updated ? ` · ${escapeHtml(updated)}` : ''}.
          View matching shops on the map to use Starting point and itinerary tools.
        </p>
      </div>
      <span class="quick-answer-price">${escapeHtml(priceLabel)}</span>
    </div>
    <div class="quick-answer-list">
      ${listings.map(item => {
        const shopId = String(item.shop_id || '');
        const meta = [
          item.shop_city || '',
          listingUpdatedLabel(item),
          item.grower ? `Grower: ${item.grower}` : ''
        ].filter(Boolean).join(' · ');
        return `
            <button type="button" class="quick-answer-row${isShopSelected(shopId) ? ' is-active' : ''}" data-toggle-map-shop="${escapeHtmlAttr(shopId)}" aria-label="${isShopSelected(shopId) ? 'Remove saved shop' : 'Save shop'} ${escapeHtmlAttr(item.shop_name || 'Unknown shop')}">
            <span>
              <strong>${escapeHtml(item.shop_name || 'Unknown shop')}</strong>
              <span>${escapeHtml(meta || 'Menu matched')}</span>
            </span>
            <span class="quick-answer-row-price">${escapeHtml(listingPriceLabel(item))}</span>
          </button>
        `;
      }).join('')}
    </div>
    <div class="quick-answer-actions">
      <a href="${escapeHtmlAttr(featuredMapUrl)}" data-map-shop="${escapeHtmlAttr(featuredShopId)}" data-strain-name="${escapeHtmlAttr(stat.name)}" data-strain-shops="${escapeHtmlAttr(allShopIds.join(','))}">${featuredDeal ? 'Map deal' : 'Map cheapest'}</a>
      <a class="secondary" href="${escapeHtmlAttr(allMapUrl)}" data-map-strain-shops="${escapeHtmlAttr(allShopIds.join(','))}" data-strain-name="${escapeHtmlAttr(stat.name)}" data-strain-shops="${escapeHtmlAttr(allShopIds.join(','))}">Map all ${allShopIds.length}</a>
      <a class="secondary" href="${escapeHtmlAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open menu</a>
      <button type="button" data-open-strain-detail="${escapeHtmlAttr(stat.key)}">Full profile</button>
      <button type="button" data-select-strain="${escapeHtmlAttr(stat.key)}">${isSelected(stat.key) ? 'Remove saved strain' : 'Save strain'}</button>
      <button type="button" data-focus-shops="${escapeHtmlAttr(stat.key)}">Browse shops</button>
    </div>
  `;
}

function updateResultToolbar(filteredOfferings, filteredStats) {
  if (els.resultContext) {
    const filters = currentFilters();
    const viewName = state.view === 'shops' ? 'Shop Menu Browser' : state.view === 'compare' ? 'Compare saved strains' : 'Strain Price Guide';
    const bits = [
      `${filteredStats.length.toLocaleString()} strains`,
      `${new Set(filteredOfferings.map(item => item.shop_id)).size.toLocaleString()} shops`,
      `${filteredOfferings.length.toLocaleString()} listings`
    ];
    const scope = [
      browseModeSummary(filters.browseMode),
      filters.family ? familyLabel(filters.family) : ''
    ].filter(Boolean).join(' · ');
    const label = scope ? `${viewName} · ${scope}` : viewName;
    els.resultContext.textContent = filters.q
      ? `Showing ${label.toLowerCase()} - ${bits.join(' · ')} for "${els.search.value}"`
      : `Showing ${label.toLowerCase()} - ${bits.join(' · ')}`;
  }

  if (els.toolbarMapLink) {
    els.toolbarMapLink.href = mapUrlForShopIds(state.selectedShopIds);
    els.toolbarMapLink.textContent = state.selectedShopIds.length
      ? `Map ${state.selectedShopIds.length}`
      : 'Map';
  }
}

function getStatByKey(key) {
  const cleanKey = normalise(key);
  if (!cleanKey) return null;

  const exact = state.strainStats.find(stat =>
    stat.key === cleanKey || normalise(stat.name) === cleanKey
  );
  if (exact) return exact;

  const comparableKey = normaliseSearchText(key);
  if (!comparableKey) return null;
  return state.strainStats.find(stat =>
    normaliseSearchText(stat.key) === comparableKey ||
    normaliseSearchText(stat.name) === comparableKey
  ) || null;
}

function getCanonicalShelfName(nameOrKey) {
  const clean = String(nameOrKey || '').replace(/\s+/g, ' ').trim();
  const key = normalise(clean);
  if (!key) return '';
  const stat = getStatByKey(key);
  return stat && stat.name ? stat.name : clean;
}

function normaliseShelfNames(names) {
  const out = [];
  const seen = new Set();
  (Array.isArray(names) ? names : []).forEach(name => {
    const canonical = getCanonicalShelfName(name);
    const key = normalise(canonical);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(canonical);
  });
  return out.slice(0, 10);
}

function loadSharedShelf() {
  state.selected = normaliseShelfNames(loadStoredShelfNames()).map(name => normalise(name));
}

function saveSharedShelf() {
  const names = normaliseShelfNames(state.selected.map(key => {
    const stat = getStatByKey(key);
    return stat && stat.name ? stat.name : key;
  }));
  state.selected = names.map(name => normalise(name));
  saveStoredShelfNames(names);
}

function getShopMeta(shopId) {
  return state.shopById.get(String(shopId)) || {};
}

function isShopSelected(shopId) {
  return state.selectedShopIds.includes(String(shopId));
}

function sanitizeShopIds(shopIds) {
  const seen = new Set();
  return (Array.isArray(shopIds) ? shopIds : [])
    .map(id => String(id || '').trim())
    .filter(id => {
      if (!id || seen.has(id) || !isBrowsableShopId(id)) return false;
      seen.add(id);
      return true;
    });
}

function toggleSelectedShop(shopId) {
  const id = String(shopId || '').trim();
  if (!id || !isBrowsableShopId(id)) return;
  if (isShopSelected(id)) {
    state.selectedShopIds = state.selectedShopIds.filter(item => item !== id);
  } else {
    state.selectedShopIds = [id, ...state.selectedShopIds.filter(item => item !== id)];
  }
  saveSelectedShopIds();
  render();
}

function setSelectedShops(shopIds) {
  state.selectedShopIds = sanitizeShopIds(shopIds);
  saveSelectedShopIds();
  render();
}

function getPlannedShopIds(stats = selectedStats()) {
  const selectedKeys = new Set(stats.map(stat => stat.key));
  const seen = new Set();
  const ids = [];
  Object.entries(state.routePlanByStrain || {}).forEach(([strainKey, shopId]) => {
    const id = String(shopId || '').trim();
    if (!selectedKeys.has(strainKey) || !id || seen.has(id) || !isBrowsableShopId(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function syncSelectedShopsFromRoutePlan(stats = selectedStats()) {
  const ids = getPlannedShopIds(stats);
  state.selectedShopIds = ids;
  saveSelectedShopIds();
}

function setRoutePlanShop(strainKey, shopId) {
  const key = String(strainKey || '').trim();
  const id = String(shopId || '').trim();
  if (!key || !id || !isBrowsableShopId(id)) return;
  state.routePlanByStrain = {
    ...(state.routePlanByStrain || {}),
    [key]: id
  };
  syncSelectedShopsFromRoutePlan(selectedStats());
  render();
}

function clearRoutePlan() {
  state.routePlanByStrain = {};
  setSelectedShops([]);
}

function mapUrlForShopIds(shopIds, context = {}) {
  const ids = sanitizeShopIds(shopIds);
  if (!ids.length) return 'map.html';
  const params = new URLSearchParams();
  params.set('shops', ids.join(','));
  params.set('source', 'explorer');
  const requestedCity = String((context && context.city) || '').trim();
  const cities = unique(ids.map(id => getShopMeta(id).city).filter(Boolean));
  const city = requestedCity || (cities.length === 1 ? cities[0] : '');
  if (city) params.set('city', city);
  const strainName = String((context && context.strainName) || '').trim();
  if (strainName) params.set('strain', strainName);
  return `map.html?${params.toString()}`;
}

function buildShopMapLink(shopId, context = {}) {
  const id = String(shopId || '').trim();
  if (!id || !isBrowsableShopId(id)) return 'map.html';
  const meta = getShopMeta(id);
  return mapUrlForShopIds([id], {
    ...context,
    city: context.city || meta.city || '',
    strainShopIds: Array.isArray(context.strainShopIds) ? context.strainShopIds : [id]
  }).replace('source=explorer', 'source=database');
}

function prepareMapHandoff(context = {}) {
  const shopIds = sanitizeShopIds(Array.isArray(context.shopIds) ? context.shopIds : state.selectedShopIds);
  if (!shopIds.length) return;
  const payload = {
    shopIds,
    strainName: String(context.strainName || '').trim(),
    strainShopIds: sanitizeShopIds(Array.isArray(context.strainShopIds) ? context.strainShopIds : []),
    createdAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(MAP_FOCUS_SHOPS_STORAGE_KEY, JSON.stringify(payload));
  } catch (_err) {
    // The URL carries the important part; storage is just a courtesy.
  }
}

function updateMapToggleHref() {
  if (!els.mapToggle) return;
  // The primary navigation returns to the user's previous map session.
  // Contextual actions such as "View on map" continue to use explicit
  // shop/strain handoffs through mapUrlForShopIds().
  els.mapToggle.href = 'map.html';
  els.mapToggle.title = 'Return to your previous map view';
}

function goToMapWithSelectedShops() {
  if (!state.selectedShopIds.length) return;
  prepareMapHandoff();
  window.location.href = mapUrlForShopIds(state.selectedShopIds);
}

function mapContextFromElement(element) {
  const strainName = String((element && element.dataset && element.dataset.strainName) || '').trim();
  const strainShopIds = String((element && element.dataset && element.dataset.strainShops) || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  return { strainName, strainShopIds };
}

function goToMapShopIds(shopIds, context = {}) {
  const ids = sanitizeShopIds(Array.isArray(shopIds) ? shopIds : [shopIds]);
  if (!ids.length) return;
  state.selectedShopIds = Array.from(new Set(ids));
  saveSelectedShopIds();
  prepareMapHandoff({ ...context, shopIds: state.selectedShopIds });
  window.location.href = mapUrlForShopIds(state.selectedShopIds, context);
}

function goToMapWithWantedStrains() {
  const stats = selectedStats();
  const ids = sanitizeShopIds(stats.flatMap(stat => shopIdsForListings(visibleOfferingsForStat(stat))));
  if (!ids.length) return;
  const strainNames = stats.map(stat => stat.name).filter(Boolean);
  goToMapShopIds(ids, {
    strainName: strainNames.length === 1 ? strainNames[0] : '',
    strainShopIds: ids
  });
}

function isSelected(key) {
  return state.selected.includes(key);
}

function toggleSelected(key) {
  if (isSelected(key)) {
    state.selected = state.selected.filter(item => item !== key);
    if (state.routePlanByStrain && state.routePlanByStrain[key]) {
      delete state.routePlanByStrain[key];
      syncSelectedShopsFromRoutePlan(selectedStats());
    }
  } else {
    const canonical = getCanonicalShelfName(key);
    state.selected = [normalise(canonical), ...state.selected.filter(item => item !== normalise(canonical))].slice(0, 10);
  }
  saveSharedShelf();
  render();
}

function renderSelected() {
  if (!state.selected.length) {
    els.selectedList.innerHTML = '<div class="empty">No saved strains yet. Search a strain, then save it for comparison.</div>';
    if (els.showWantedMap) els.showWantedMap.disabled = true;
    return;
  }
  const selectedRows = state.selected
    .map(key => {
      const stat = state.strainStats.find(item => item.key === key);
      const offerings = visibleOfferingsForStat(stat);
      return { key, name: stat ? stat.name : key, shopCount: stat ? shopIdsForListings(offerings).length : 0 };
    })
    .sort(compareStrainName);
  els.selectedList.innerHTML = selectedRows.map(({ key, name, shopCount }) => {
    const count = Number(shopCount);
    return `
      <div class="selected-pill">
        <span class="selected-pill-main"><span>${escapeHtml(name)}</span>${Number.isFinite(count) ? `<small> ${count} matching shop${count === 1 ? '' : 's'}</small>` : ''}</span>
        <button type="button" data-remove-selected="${escapeHtml(key)}" aria-label="Remove saved strain ${escapeHtml(name)}">x</button>
      </div>
    `;
  }).join('');
  if (els.showWantedMap) {
    const matchingShopCount = sanitizeShopIds(selectedStats().flatMap(stat => shopIdsForListings(visibleOfferingsForStat(stat)))).length;
    els.showWantedMap.disabled = matchingShopCount === 0;
    els.showWantedMap.textContent = matchingShopCount
      ? `View ${matchingShopCount} matches on map`
      : 'No map matches yet';
  }
}

function renderSelectedShops() {
  updateMapToggleHref();
  if (!state.selectedShopIds.length) {
    els.selectedShopList.innerHTML = '<div class="empty">No saved shops yet. Save shops from the results, then view them on the map.</div>';
    els.showSelectedShopsMap.disabled = true;
    return;
  }

  els.showSelectedShopsMap.disabled = false;
  const selectedRows = state.selectedShopIds
    .map(shopId => {
      const meta = getShopMeta(shopId);
      return {
        shopId,
        name: meta.name || `Shop ${shopId}`,
        city: meta.city || ''
      };
    })
    .sort(compareShopName);
  const selectedCount = selectedRows.length;
  const tripPlanSummary = `<div class="empty">${selectedCount} shop${selectedCount === 1 ? '' : 's'} saved. Open ${selectedCount === 1 ? 'it' : 'them'} on the map to compare routes or add to an itinerary.</div>`;
  els.selectedShopList.innerHTML = tripPlanSummary + selectedRows.map(({ shopId, name, city }) => {
    return `
      <div class="selected-pill selected-shop-pill">
        <span>${escapeHtml(name)}${city ? ` · ${escapeHtml(city)}` : ''}</span>
        <button type="button" data-toggle-map-shop="${escapeHtml(shopId)}" aria-label="Remove saved shop ${escapeHtml(name)}">x</button>
      </div>
    `;
  }).join('');
}

function pickPriceGuideStat(filteredStats) {
  const q = normaliseSearchText(els.search.value);
  if (!q) return null;
  const pool = Array.isArray(filteredStats) && filteredStats.length ? filteredStats : state.strainStats;
  if (window.BudfinderSearch) {
    const best = window.BudfinderSearch.rank(q, pool, {
      getLabel: stat => stat && stat.name,
      getAliases: stat => [stat && stat.key],
      threshold: 0.72,
      limit: 1
    })[0];
    return best ? best.item : null;
  }
  return pool.find(stat => normaliseSearchText(stat.name) === q || normaliseSearchText(stat.key) === q) ||
    pool.find(stat => normaliseSearchText(stat.name).startsWith(q)) ||
    pool.find(stat => normaliseSearchText(stat.name).includes(q)) ||
    null;
}

function statTileHtml(label, value, helper = '') {
  return `
    <div class="price-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value == null || value === '' ? 'Unknown' : value)}</strong>
      ${helper ? `<small>${escapeHtml(helper)}</small>` : ''}
    </div>
  `;
}

function listingCardHtml(item, profile, options = {}) {
  const shopId = String(item.shop_id || '');
  const price = pricePerGram(item);
  const priceLabel = packageListingPriceLabel(item);
  const meta = [
    item.shop_city || '',
    item.base_type || '',
    Number(item.is_cali) === 1 ? 'Cali' : '',
    Number(item.is_legal) === 1 ? 'Legal project' : '',
    item.grower ? `Grower: ${item.grower}` : ''
  ].filter(Boolean).join(' · ');
  const notes = String(item.notes || '').trim();
  const sourceUrl = shopLinkForId(shopId);
  const mapUrl = buildShopMapLink(shopId, {
    strainName: options.strainName || item.strain_name || '',
    strainShopIds: profile && Array.isArray(profile.shopIds) ? profile.shopIds : [shopId]
  });
  return `
    <article class="listing-card">
      <div class="listing-card-head">
        <a class="listing-map-link" href="${escapeHtmlAttr(mapUrl)}" aria-label="View ${escapeHtmlAttr(item.shop_name || 'Unknown shop')} on map">
          ${getShopLogoHtml(item.shop_key, item.shop_name || 'Unknown shop')}
          <div>
            <strong>${escapeHtml(item.shop_name || 'Unknown shop')}</strong>
            <div class="listing-card-meta">${escapeHtml(meta || 'Known menu listing')}</div>
          </div>
        </a>
        <div>
          <span class="listing-card-price">${escapeHtml(priceLabel)}</span>
          <div class="listing-card-meta">${escapeHtml(item.strain_name || 'Unknown product')}</div>
        </div>
      </div>
      <div class="chip-row">
        ${priceJudgementBadgeHtml(price, profile && profile.median)}
        ${ageBadgeHtml(displayListingDateValue(item), item)}
        ${item.strain_name ? `<span class="chip">${escapeHtml(item.strain_name)}</span>` : ''}
        ${Number(item.is_legal) === 1 ? '<span class="chip deal-chip">Legal project</span>' : ''}
      </div>
      ${notes ? `<p class="listing-note">${escapeHtml(notes)}</p>` : ''}
      <div class="listing-card-actions">
        <button type="button" data-focus-shop-menu="${escapeHtmlAttr(shopId)}">View full menu</button>
        <a href="${escapeHtmlAttr(mapUrl)}" aria-label="View ${escapeHtmlAttr(item.shop_name || 'Unknown shop')} on map">View on map</a>
        <button type="button" data-toggle-map-shop="${escapeHtmlAttr(shopId)}" class="${isShopSelected(shopId) ? 'is-active' : ''}">${isShopSelected(shopId) ? 'Remove saved shop' : 'Save shop'}</button>
        <a href="${escapeHtmlAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>
      </div>
    </article>
  `;
}

function renderPriceGuide(filteredStats) {
  if (!els.priceGuidePanel) return;
  const q = normaliseSearchText(els.search.value);
  if (!q) {
    els.priceGuidePanel.innerHTML = `
      <div class="price-guide-hero">
        <div class="price-guide-head">
          <div>
            <h3>Search a strain for a price profile</h3>
            <p>Use the search box to see typical range, average, median, best value listings, and data age signals.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const stat = pickPriceGuideStat(filteredStats);
  if (!stat) {
    const alternatives = alternativeStrainsForQuery(els.search.value, state.strainStats, 4);
    els.priceGuidePanel.innerHTML = `
      <div class="price-guide-hero">
        <div class="price-guide-head">
          <div>
            <h3>No price profile found</h3>
            <p>No current strain listings matched "${escapeHtml(els.search.value)}". Try a shorter strain name or one of the available alternatives.</p>
          </div>
        </div>
        ${alternativeLinksHtml(alternatives)}
      </div>
    `;
    return;
  }

  const listings = visibleOfferingsForStat(stat);
  const profile = priceProfileForListings(listings);
  const newestLabel = profile.newestDate
    ? `${menuAgeInfo(profile.newestDate).label} · ${formatDate(profile.newestDate)}`
    : 'Unknown';
  const typicalRange = profile.q25 == null || profile.q75 == null
    ? 'Needs 3+ prices'
    : `${money(profile.q25)} to ${money(profile.q75)}`;
  const confidence = profile.count >= 3
    ? '25th to 75th percentile'
    : `${profile.count} usable price${profile.count === 1 ? '' : 's'}`;
  const sortedByValue = profile.usableListings
    .slice()
    .sort((a, b) => a.price - b.price || menuAgeInfo(displayListingDateValue(a.item)).days - menuAgeInfo(displayListingDateValue(b.item)).days || compareShopName(a.item, b.item))
    .map(row => row.item);
  const bestValue = sortedByValue.slice(0, 6);
  const allListings = listings
    .slice()
    .sort((a, b) => {
      const priceDiff = (pricePerGram(a) ?? Infinity) - (pricePerGram(b) ?? Infinity);
      if (priceDiff !== 0) return priceDiff;
      const freshnessDiff = menuAgeInfo(displayListingDateValue(a)).days - menuAgeInfo(displayListingDateValue(b)).days;
      if (freshnessDiff !== 0) return freshnessDiff;
      return compareShopName(a, b);
    });
  const hiddenAllCount = Math.max(0, allListings.length - 80);

  els.priceGuidePanel.innerHTML = `
    <div class="price-guide-hero">
      <div class="price-guide-head">
        <div>
          <h3>${escapeHtml(stat.name)}</h3>
          <p>${profile.count.toLocaleString()} usable price${profile.count === 1 ? '' : 's'} from ${profile.shopCount.toLocaleString()} shop${profile.shopCount === 1 ? '' : 's'} and ${listings.length.toLocaleString()} matching listing${listings.length === 1 ? '' : 's'}.</p>
        </div>
        ${ageBadgeHtml(profile.newestDate)}
      </div>
      <div class="price-stat-grid">
        ${statTileHtml('Typical range', typicalRange, confidence)}
        ${statTileHtml('Average', profile.average == null ? 'Unknown' : money(profile.average), 'Mean visible price')}
        ${statTileHtml('Median', profile.median == null ? 'Unknown' : money(profile.median), 'Price judgement baseline')}
        ${statTileHtml('Lowest', profile.low == null ? 'Unknown' : money(profile.low), 'Cheapest visible listing')}
        ${statTileHtml('Highest', profile.high == null ? 'Unknown' : money(profile.high), 'Highest visible listing')}
        ${statTileHtml('Listings', listings.length.toLocaleString(), `${profile.count.toLocaleString()} priced`)}
        ${statTileHtml('Shop count', profile.shopCount.toLocaleString(), 'Unique browsable shops')}
        ${statTileHtml('Latest menu date', newestLabel, ageBreakdownLabel(profile.ageBreakdown))}
      </div>
      <div class="price-guide-actions">
        <button type="button" data-open-strain-detail="${escapeHtmlAttr(stat.key)}">Open full profile</button>
        <button type="button" data-select-strain="${escapeHtmlAttr(stat.key)}">${isSelected(stat.key) ? 'Remove saved strain' : 'Save strain'}</button>
      </div>
    </div>
    <div class="listing-sections">
      <section class="listing-section">
        <div class="listing-section-head">
          <div>
            <h3>Best value listings</h3>
            <p>Lowest visible per-gram prices first. Labels compare each price with this strain's median.</p>
          </div>
        </div>
        <div class="listing-grid">
          ${bestValue.length ? bestValue.map(item => listingCardHtml(item, profile)).join('') : '<div class="empty">No priced listings are available for this strain yet.</div>'}
        </div>
      </section>
      <section class="listing-section">
        <div class="listing-section-head">
          <div>
            <h3>All matching listings</h3>
            <p>${allListings.length.toLocaleString()} visible listing${allListings.length === 1 ? '' : 's'} sorted by price, data age, then shop name.</p>
          </div>
        </div>
        <div class="listing-grid">
          ${allListings.slice(0, 80).map(item => listingCardHtml(item, profile)).join('')}
        </div>
        ${hiddenAllCount ? `<div class="empty">${hiddenAllCount.toLocaleString()} more listing${hiddenAllCount === 1 ? '' : 's'} hidden to keep the page readable. Narrow the search or filters to see them.</div>` : ''}
      </section>
    </div>
  `;
}

function shopRowsFromOfferings(offerings) {
  const grouped = new Map();
  (Array.isArray(offerings) ? offerings : []).forEach(item => {
    const shopId = String(item.shop_id || `${item.shop_name}-${item.shop_city}`);
    const shopMeta = state.shopById.get(String(item.shop_id)) || {};
    if (!grouped.has(shopId)) {
      const shopName = item.shop_name || shopMeta.name || 'Unknown shop';
      const city = item.shop_city || shopMeta.city || 'Unknown city';
      const shopKey = item.shop_key || shopMeta.shop_key || '';
      const nameCityKey = `${normalise(shopName)}|${normalise(city)}`;
      grouped.set(shopId, {
        shopId,
        shopName,
        city,
        shopKey,
        shopUrl: shopMeta.shop_url || '',
        coordinates: state.shopCoordinatesByKey.get(shopKey) || state.shopCoordinatesByNameCity.get(nameCityKey) || null,
        offerings: []
      });
    }
    grouped.get(shopId).offerings.push(item);
  });
  return Array.from(grouped.values()).map(row => {
    const priced = row.offerings.map(pricePerGram).filter(Number.isFinite);
    const latestTime = latestListingTime(row.offerings);
    return {
      ...row,
      averagePrice: priced.length ? average(priced) : null,
      latestTime,
      latestDate: latestTime ? new Date(latestTime).toISOString() : '',
      freshness: menuAgeInfo(latestTime ? new Date(latestTime).toISOString() : '')
    };
  }).sort(compareShopName);
}

const AMSTERDAM_DISCOVERY_AREAS = [
  { name: 'Centrum', city: 'Amsterdam', note: 'Canals, old centre and central station' },
  { name: 'Jordaan', city: 'Amsterdam', note: 'West of the canal ring' },
  { name: 'De Pijp', city: 'Amsterdam', note: 'South of the centre' },
  { name: 'Oud-West', city: 'Amsterdam', note: 'West of Vondelpark' },
  { name: 'Oost', city: 'Amsterdam', note: 'East Amsterdam' },
  { name: 'Noord', city: 'Amsterdam', note: 'Across the IJ' }
];

function discoveryAreasForScope() {
  const dataset = activeLocationDataset();
  if (dataset) {
    if (dataset.slug === 'amsterdam') return AMSTERDAM_DISCOVERY_AREAS;
    return [{
      name: dataset.label,
      city: dataset.label,
      note: `Explore the ${dataset.label} map`
    }];
  }
  const cityAreas = state.locationDatasets.map(city => ({
    name: city.label,
    city: city.label,
    note: `Explore the ${city.label} map`
  }));
  return [...AMSTERDAM_DISCOVERY_AREAS, ...cityAreas.filter(city => city.city !== 'Amsterdam')];
}

function discoveryMatchScore(value, query) {
  if (window.BudfinderSearch) {
    return Math.round(window.BudfinderSearch.score(value, query) * 100);
  }
  const text = normaliseSearchText(value);
  const q = normaliseSearchText(query);
  if (!text || !q) return 0;
  if (text === q) return 100;
  if (text.startsWith(q)) return 80;
  if (text.split(' ').some(word => word.startsWith(q))) return 70;
  if (text.includes(q)) return 55;
  const tokens = q.split(' ').filter(Boolean);
  return tokens.length > 1 && tokens.every(token => text.includes(token)) ? 45 : 0;
}

function discoveryGroupHtml(title, helper, cards, className = '', browserAction = null) {
  if (!cards.length) return '';
  const headerAction = browserAction && browserAction.type && browserAction.label
    ? `<a class="discovery-browser-link" href="${escapeHtmlAttr(detailUrl({ browser: browserAction.type }))}" data-open-discovery-browser="${escapeHtmlAttr(browserAction.type)}">${escapeHtml(browserAction.label)} →</a>`
    : (helper ? `<span>${escapeHtml(helper)}</span>` : '');
  return `
    <section class="discovery-group">
      <div class="discovery-group-head">
        <h3>${escapeHtml(title)}</h3>
        ${headerAction}
      </div>
      <div class="discovery-grid${className ? ` ${escapeHtmlAttr(className)}` : ''}">
        ${cards.join('')}
      </div>
    </section>
  `;
}

function discoveryAreaCardHtml(area) {
  const params = new URLSearchParams();
  if (area.city) params.set('city', area.city);
  if (normaliseSearchText(area.name) !== normaliseSearchText(area.city)) {
    params.set('search', area.name);
  }
  return `
    <a class="discovery-card" href="map.html?${escapeHtmlAttr(params.toString())}" aria-label="Explore ${escapeHtmlAttr(area.name)} on the map">
      <span class="discovery-area-icon" aria-hidden="true">⌖</span>
      <span class="discovery-card-copy">
        <strong>${escapeHtml(area.name)}</strong>
        <small>${escapeHtml(area.note || area.city)}</small>
      </span>
    </a>
  `;
}

function categoryCountsForShop(row) {
  const counts = new Map();
  (row && Array.isArray(row.offerings) ? row.offerings : []).forEach(item => {
    const key = normalise(item.base_type || 'other') || 'other';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function categoryPillsHtml(row, limit = 4) {
  const counts = categoryCountsForShop(row);
  const order = ['sativa', 'indica', 'hybrid', 'kush', 'hash', 'other'];
  const entries = Array.from(counts.entries())
    .sort((a, b) => {
      const aIndex = order.indexOf(a[0]);
      const bIndex = order.indexOf(b[0]);
      return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex) || b[1] - a[1];
    })
    .slice(0, limit);
  return entries.length
    ? `<span class="discovery-type-row">${entries.map(([type, count]) => `<span>${count} ${escapeHtml(type)}</span>`).join('')}</span>`
    : '';
}

function discoveryShopCardHtml(row) {
  const averagePrice = row.averagePrice != null && Number.isFinite(Number(row.averagePrice)) ? `Avg ${money(row.averagePrice)}` : 'Price unknown';
  const freshness = row.freshness || menuAgeInfo(row.latestDate);
  const distance = Number.isFinite(row.distanceMeters) ? ` · ${formatDiscoveryDistance(row.distanceMeters)}` : '';
  return `
    <button class="discovery-card" type="button" data-discovery-shop="${escapeHtmlAttr(row.shopId)}">
      ${getShopLogoHtml(row.shopKey, row.shopName)}
      <span class="discovery-card-copy">
        <strong>${escapeHtml(row.shopName)}</strong>
        <small>${escapeHtml(row.city || 'City unknown')} · ${row.offerings.length.toLocaleString()} known listing${row.offerings.length === 1 ? '' : 's'}</small>
        <small>${escapeHtml(averagePrice)} · ${escapeHtml(freshness.label)}${escapeHtml(distance)}</small>
        ${categoryPillsHtml(row)}
      </span>
    </button>
  `;
}

function discoveryStrainCardHtml(stat) {
  const averagePrice = stat.avg != null && Number.isFinite(Number(stat.avg)) ? money(stat.avg) : 'Price unknown';
  const typeLabel = stat.topType ? ` · ${stat.topType}` : '';
  const freshness = stat.freshness || menuAgeInfo(stat.latestDate || '');
  return `
    <button class="discovery-card" type="button" data-discovery-strain="${escapeHtmlAttr(stat.key)}">
      ${getStrainImageHtml(stat.name)}
      <span class="discovery-card-copy">
        <strong>${escapeHtml(stat.name)}</strong>
        <small>${stat.shopCount.toLocaleString()} shop${stat.shopCount === 1 ? '' : 's'} · Avg ${escapeHtml(averagePrice)}${escapeHtml(typeLabel)}</small>
        <small>${escapeHtml(freshness.label)}</small>
      </span>
    </button>
  `;
}

function discoveryGrowerCardHtml(row) {
  return `
    <button class="discovery-card" type="button" data-discovery-grower="${escapeHtmlAttr(row.name)}">
      <span class="discovery-area-icon" aria-hidden="true">◎</span>
      <span class="discovery-card-copy">
        <strong>${escapeHtml(row.name)}</strong>
        <small>Grower · ${row.strainCount.toLocaleString()} strain${row.strainCount === 1 ? '' : 's'}</small>
        <small>${row.shopCount.toLocaleString()} shop${row.shopCount === 1 ? '' : 's'} in this search area</small>
      </span>
    </button>
  `;
}

function discoveryDistanceMetres(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length < 2 || to.length < 2) return Infinity;
  const radians = value => Number(value) * Math.PI / 180;
  const lat1 = radians(from[0]);
  const lat2 = radians(to[0]);
  const deltaLat = radians(Number(to[0]) - Number(from[0]));
  const deltaLng = radians(Number(to[1]) - Number(from[1]));
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371e3 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function discoveryDistanceUnit() {
  const preference = window.BudfinderPersonalisation && window.BudfinderPersonalisation.read
    ? window.BudfinderPersonalisation.read().distanceUnit
    : '';
  return preference === 'miles' ? 'miles' : 'metric';
}

function formatDiscoveryDistance(metres) {
  if (!Number.isFinite(metres)) return '';
  if (discoveryDistanceUnit() === 'miles') return `${(metres / 1609.344).toFixed(1)} mi`;
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

function discoveryAveragePrice(item, isShopBrowser) {
  const raw = isShopBrowser ? item.averagePrice : item.avg;
  return raw == null || raw === '' ? NaN : Number(raw);
}

function discoveryFreshness(item, isShopBrowser) {
  if (isShopBrowser) return item.freshness || menuAgeInfo(item.latestDate || '');
  const latestTime = latestListingTime(item.offerings || []);
  return menuAgeInfo(latestTime ? new Date(latestTime).toISOString() : '');
}

function discoveryTypeMatches(item, isShopBrowser, type) {
  if (!type || type === 'all') return true;
  if (isShopBrowser) return (item.offerings || []).some(row => normalise(row.base_type) === type);
  return normalise(item.topType) === type || (item.types instanceof Map && item.types.has(type));
}

function discoveryPriceMatches(item, isShopBrowser, priceFilter) {
  if (!priceFilter || priceFilter === 'all') return true;
  const price = discoveryAveragePrice(item, isShopBrowser);
  if (priceFilter === 'unknown') return !Number.isFinite(price);
  if (!Number.isFinite(price)) return false;
  if (priceFilter === 'under10') return price < 10;
  if (priceFilter === 'under15') return price < 15;
  if (priceFilter === 'under20') return price < 20;
  if (priceFilter === 'over20') return price >= 20;
  return true;
}

function syncDiscoveryBrowserSortOptions(isShopBrowser) {
  if (!els.discoveryBrowserSort) return;
  const options = isShopBrowser
    ? [
      ['name', 'Name · A–Z'],
      ['freshness', 'Menu age · freshest'],
      ['price-low', 'Average price · low to high'],
      ['price-high', 'Average price · high to low'],
      ['stocked', 'Menu size · most listings'],
      ['distance', 'Distance · nearest to me']
    ]
    : [
      ['name', 'Name · A–Z'],
      ['freshness', 'Menu age · freshest'],
      ['price-low', 'Average price · low to high'],
      ['price-high', 'Average price · high to low'],
      ['stocked', 'Availability · most shops']
    ];
  if (!options.some(([value]) => value === state.discoveryBrowserSort)) state.discoveryBrowserSort = 'name';
  els.discoveryBrowserSort.innerHTML = options
    .map(([value, label]) => `<option value="${value}"${value === state.discoveryBrowserSort ? ' selected' : ''}>${label}</option>`)
    .join('');
}

function discoverySortLabel(sort) {
  return {
    name: 'A–Z',
    freshness: 'Freshest first',
    'price-low': 'Lowest average price first',
    'price-high': 'Highest average price first',
    stocked: 'Most stocked first',
    distance: 'Nearest first'
  }[sort] || 'A–Z';
}

let discoverySuggestionSelection = null;

function randomSample(items, count) {
  const pool = (Array.isArray(items) ? items : []).slice();
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.max(0, count));
}

function ensureDiscoverySuggestionSelection(shopRows) {
  if (discoverySuggestionSelection) return discoverySuggestionSelection;
  discoverySuggestionSelection = {
    areas: randomSample(discoveryAreasForScope(), 3),
    shopIds: randomSample(shopRows.filter(row => row.offerings.length), 3).map(row => row.shopId),
    strainKeys: randomSample(state.strainStats.filter(stat => stat.shopCount > 0), 3).map(stat => stat.key)
  };
  return discoverySuggestionSelection;
}

function renderDiscoverySuggestions(shopRows) {
  if (!els.discoverySuggestionGroups) return;
  const selection = ensureDiscoverySuggestionSelection(shopRows);
  const selectedShops = selection.shopIds
    .map(shopId => shopRows.find(row => row.shopId === shopId))
    .filter(Boolean);
  const selectedStrains = selection.strainKeys
    .map(key => state.strainStats.find(stat => stat.key === key))
    .filter(Boolean);
  els.discoverySuggestionGroups.innerHTML = [
    discoveryGroupHtml('Locations', 'Open on the map', selection.areas.map(discoveryAreaCardHtml)),
    discoveryGroupHtml('Coffeeshops', '', selectedShops.map(discoveryShopCardHtml), '', { type: 'shops', label: 'Browse all coffeeshops' }),
    discoveryGroupHtml('Strains', '', selectedStrains.map(discoveryStrainCardHtml), '', { type: 'strains', label: 'Browse all strains' })
  ].join('');
}

function renderDiscoveryBrowser() {
  if (!els.discoveryBrowser || !els.discoveryBrowserGrid) return;
  const browserType = state.discoveryBrowser;
  if (browserType !== 'shops' && browserType !== 'strains') {
    els.discoveryBrowser.hidden = true;
    els.discoveryBrowserGrid.replaceChildren();
    return;
  }

  const isShopBrowser = browserType === 'shops';
  syncDiscoveryBrowserSortOptions(isShopBrowser);
  const query = normaliseSearchText(els.discoveryBrowserSearch ? els.discoveryBrowserSearch.value : '');
  const allItems = (isShopBrowser
    ? shopRowsFromOfferings(state.offerings)
    : state.strainStats.map(stat => {
      const latestTime = latestListingTime(stat.offerings || []);
      return {
        ...stat,
        latestTime,
        latestDate: latestTime ? new Date(latestTime).toISOString() : '',
        freshness: menuAgeInfo(latestTime ? new Date(latestTime).toISOString() : '')
      };
    }))
    .map(item => isShopBrowser && state.discoveryBrowserPosition && Array.isArray(item.coordinates)
      ? { ...item, distanceMeters: discoveryDistanceMetres(state.discoveryBrowserPosition, item.coordinates) }
      : item);
  const filteredItems = allItems.filter(item => {
    const searchMatches = !query || (isShopBrowser
      ? [item.shopName, item.city, item.shopKey].some(value => normaliseSearchText(value).includes(query))
      : [item.name, item.topType].some(value => normaliseSearchText(value).includes(query)));
    if (!searchMatches) return false;
    const freshness = discoveryFreshness(item, isShopBrowser);
    if (state.discoveryBrowserFreshness !== 'all' && freshness.bucket !== state.discoveryBrowserFreshness) return false;
    if (!discoveryPriceMatches(item, isShopBrowser, state.discoveryBrowserPrice)) return false;
    return discoveryTypeMatches(item, isShopBrowser, state.discoveryBrowserType);
  }).sort((a, b) => {
    const sort = state.discoveryBrowserSort;
    if (sort === 'freshness') {
      return discoveryFreshness(a, isShopBrowser).days - discoveryFreshness(b, isShopBrowser).days ||
        (isShopBrowser ? compareShopName(a, b) : compareStrainName(a, b));
    }
    if (sort === 'price-low' || sort === 'price-high') {
      const aPrice = discoveryAveragePrice(a, isShopBrowser);
      const bPrice = discoveryAveragePrice(b, isShopBrowser);
      const aComparable = Number.isFinite(aPrice) ? aPrice : (sort === 'price-low' ? Infinity : -Infinity);
      const bComparable = Number.isFinite(bPrice) ? bPrice : (sort === 'price-low' ? Infinity : -Infinity);
      const difference = sort === 'price-low' ? aComparable - bComparable : bComparable - aComparable;
      return difference || (isShopBrowser ? compareShopName(a, b) : compareStrainName(a, b));
    }
    if (sort === 'stocked') {
      const difference = isShopBrowser
        ? b.offerings.length - a.offerings.length
        : b.shopCount - a.shopCount;
      return difference || (isShopBrowser ? compareShopName(a, b) : compareStrainName(a, b));
    }
    if (sort === 'distance') {
      return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) || compareShopName(a, b);
    }
    return isShopBrowser ? compareShopName(a, b) : compareStrainName(a, b);
  });
  const visibleItems = filteredItems.slice(0, state.discoveryBrowserLimit);
  const remaining = Math.max(0, filteredItems.length - visibleItems.length);

  els.discoveryBrowser.hidden = false;
  els.discoveryBrowserTitle.textContent = isShopBrowser ? 'Coffeeshop browser' : 'Strain browser';
  els.discoveryBrowserCopy.textContent = isShopBrowser
    ? 'Browse every coffeeshop, then sort and filter the full set without leaving the database.'
    : 'Browse every available strain, then sort and filter the full set without leaving the database.';
  els.discoveryBrowserSearchLabel.textContent = isShopBrowser ? 'Find a coffeeshop' : 'Find a strain';
  els.discoveryBrowserSearch.placeholder = isShopBrowser
    ? 'Try Abraxas, Family First, or Amsterdam...'
    : 'Try Gelato, Haze, or Hybrid...';
  els.discoveryBrowserCount.textContent = query
    ? `${filteredItems.length.toLocaleString()} match${filteredItems.length === 1 ? '' : 'es'}`
    : `${filteredItems.length.toLocaleString()} available`;
  if (els.discoveryBrowserOrder) els.discoveryBrowserOrder.textContent = discoverySortLabel(state.discoveryBrowserSort);
  if (els.discoveryBrowserFreshness) els.discoveryBrowserFreshness.value = state.discoveryBrowserFreshness;
  if (els.discoveryBrowserPrice) els.discoveryBrowserPrice.value = state.discoveryBrowserPrice;
  if (els.discoveryBrowserType) els.discoveryBrowserType.value = state.discoveryBrowserType;
  els.discoveryBrowserGrid.innerHTML = visibleItems.length
    ? visibleItems.map(isShopBrowser ? discoveryShopCardHtml : discoveryStrainCardHtml).join('')
    : `<div class="discovery-empty">No ${isShopBrowser ? 'coffeeshops' : 'strains'} match this filter.</div>`;
  els.discoveryBrowserMore.hidden = remaining === 0;
  const moreButton = els.discoveryBrowserMore.querySelector('[data-load-more-discovery-browser]');
  if (moreButton) {
    moreButton.textContent = `Show ${Math.min(48, remaining).toLocaleString()} more (${remaining.toLocaleString()} left)`;
  }
}

function openDiscoveryBrowser(type, options = {}) {
  const browserType = type === 'shops' ? 'shops' : 'strains';
  state.discoveryBrowser = browserType;
  state.discoveryBrowserLimit = 48;
  state.discoveryBrowserSort = 'name';
  state.discoveryBrowserFreshness = 'all';
  state.discoveryBrowserPrice = 'all';
  state.discoveryBrowserType = 'all';
  state.detail = null;
  state.detailReturnStack = [];
  if (els.discoveryBrowserSearch) els.discoveryBrowserSearch.value = '';
  if (options.pushHistory !== false && window.history && window.history.pushState) {
    window.history.pushState({ browser: browserType }, '', detailUrl({ browser: browserType }));
  }
  render();
  window.setTimeout(() => {
    if (els.discoveryBrowser) els.discoveryBrowser.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (els.discoveryBrowserTitle) els.discoveryBrowserTitle.focus({ preventScroll: true });
  }, 0);
}

function closeDiscoveryBrowser() {
  state.discoveryBrowser = '';
  state.discoveryBrowserLimit = 48;
  if (els.discoveryBrowserSearch) els.discoveryBrowserSearch.value = '';
  if (window.history && window.history.pushState) {
    window.history.pushState({}, '', detailUrl());
  }
  render();
  window.setTimeout(() => {
    const target = document.querySelector('.database-search-panel');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (els.search) els.search.focus({ preventScroll: true });
  }, 0);
}

function setDiscoveryBrowserFilterStatus(message) {
  if (els.discoveryBrowserFilterStatus) els.discoveryBrowserFilterStatus.textContent = message || '';
}

function requestDiscoveryBrowserPosition() {
  if (!navigator.geolocation) {
    state.discoveryBrowserSort = 'name';
    setDiscoveryBrowserFilterStatus('Distance sorting is unavailable in this browser.');
    renderDiscoveryBrowser();
    return;
  }
  setDiscoveryBrowserFilterStatus('Getting your location for distance sorting…');
  navigator.geolocation.getCurrentPosition(position => {
    state.discoveryBrowserPosition = [position.coords.latitude, position.coords.longitude];
    state.discoveryBrowserSort = 'distance';
    state.discoveryBrowserLimit = 48;
    setDiscoveryBrowserFilterStatus('Using your current location for this browser view only.');
    renderDiscoveryBrowser();
  }, () => {
    state.discoveryBrowserSort = 'name';
    if (els.discoveryBrowserSort) els.discoveryBrowserSort.value = 'name';
    setDiscoveryBrowserFilterStatus('Location was not available, so results remain A–Z.');
    renderDiscoveryBrowser();
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

function resetDiscoveryBrowserFilters() {
  state.discoveryBrowserSort = 'name';
  state.discoveryBrowserFreshness = 'all';
  state.discoveryBrowserPrice = 'all';
  state.discoveryBrowserType = 'all';
  state.discoveryBrowserLimit = 48;
  if (els.discoveryBrowserSearch) els.discoveryBrowserSearch.value = '';
  setDiscoveryBrowserFilterStatus('Filters reset.');
  renderDiscoveryBrowser();
}

function renderDiscovery() {
  if (!els.discoverySuggestions || !els.discoveryResults || !els.discoveryResultGroups || !els.discoveryBrowser) return;
  document.body.classList.toggle('database-browser-open', Boolean(state.discoveryBrowser && !state.detail));
  if (state.detail) {
    els.discoverySuggestions.hidden = true;
    els.discoveryResults.hidden = true;
    els.discoveryBrowser.hidden = true;
    return;
  }

  if (state.discoveryBrowser) {
    els.discoverySuggestions.hidden = true;
    els.discoveryResults.hidden = true;
    renderDiscoveryBrowser();
    return;
  }

  els.discoveryBrowser.hidden = true;

  const query = (els.search && els.search.value || '').replace(/\s+/g, ' ').trim();
  const shopRows = shopRowsFromOfferings(state.offerings);
  if (!query) {
    els.discoverySuggestions.hidden = false;
    els.discoveryResults.hidden = true;
    renderDiscoverySuggestions(shopRows);
    return;
  }

  els.discoverySuggestions.hidden = true;
  els.discoveryResults.hidden = false;

  const areaMatches = discoveryAreasForScope()
    .map(area => ({
      area,
      score: Math.max(
        discoveryMatchScore(area.name, query),
        discoveryMatchScore(area.city, query),
        discoveryMatchScore(area.note, query)
      )
    }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || compareText(a.area.name, b.area.name))
    .map(row => row.area);

  const shopMatches = shopRows
    .map(row => ({
      row,
      score: Math.max(
        discoveryMatchScore(row.shopName, query),
        discoveryMatchScore(row.city, query),
        discoveryMatchScore(row.shopKey, query)
      )
    }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || b.row.offerings.length - a.row.offerings.length || compareShopName(a.row, b.row))
    .map(match => match.row);

  const legalQuery = ['legal', 'legal weed', 'legal cannabis', 'regulated', 'wietexperiment']
    .includes(normaliseSearchText(query));
  const resolvedGrower = resolvedGrowerForSearch(query);
  const resolvedGrowerKey = normaliseSearchText(resolvedGrower);
  const strainMatches = state.strainStats
    .map(stat => ({
      stat,
      score: Math.max(
        resolvedGrower
          ? (stat.offerings.some(item => normaliseSearchText(item && item.grower) === resolvedGrowerKey) ? 96 : 0)
          : discoveryMatchScore(stat.name, query),
        resolvedGrower ? 0 : discoveryMatchScore(stat.topType, query),
        legalQuery && stat.offerings.some(item => Number(item && item.is_legal) === 1) ? 65 : 0
      )
    }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || b.stat.shopCount - a.stat.shopCount || compareStrainName(a.stat, b.stat))
    .map(match => match.stat);

  const growers = new Map();
  state.offerings.forEach(item => {
    const name = String(item && item.grower || '').trim();
    if (!name || (resolvedGrower
      ? normaliseSearchText(name) !== resolvedGrowerKey
      : discoveryMatchScore(name, query) <= 0)) return;
    const key = normaliseSearchText(name);
    if (!growers.has(key)) growers.set(key, { name, shops: new Set(), strains: new Set() });
    const row = growers.get(key);
    row.shops.add(String(item.shop_id || `${item.shop_name}|${item.shop_city}`));
    row.strains.add(item.strain_name_normalised || normalise(item.strain_name));
  });
  const growerMatches = Array.from(growers.values())
    .map(row => ({ name: row.name, shopCount: row.shops.size, strainCount: row.strains.size }))
    .sort((a, b) => b.shopCount - a.shopCount || compareText(a.name, b.name));

  const visibleShopMatches = shopMatches.slice(0, 20);
  const visibleStrainMatches = strainMatches.slice(0, 100);
  const totalMatches = areaMatches.length + shopMatches.length + strainMatches.length + growerMatches.length;
  if (els.discoveryResultsTitle) els.discoveryResultsTitle.textContent = `Matches for “${query}”`;
  if (els.discoveryResultsCount) {
    els.discoveryResultsCount.textContent = `${totalMatches.toLocaleString()} result${totalMatches === 1 ? '' : 's'}`;
  }

  const groups = [
    discoveryGroupHtml('Locations', `${areaMatches.length.toLocaleString()} found`, areaMatches.map(discoveryAreaCardHtml), 'is-results'),
    discoveryGroupHtml(
      'Coffeeshops',
      shopMatches.length > visibleShopMatches.length
        ? `Showing ${visibleShopMatches.length} of ${shopMatches.length}`
        : `${shopMatches.length.toLocaleString()} found`,
      visibleShopMatches.map(discoveryShopCardHtml),
      'is-results'
    ),
    discoveryGroupHtml(
      'Growers',
      `${growerMatches.length.toLocaleString()} found`,
      growerMatches.slice(0, 30).map(discoveryGrowerCardHtml),
      'is-results'
    ),
    discoveryGroupHtml(
      'Strains',
      strainMatches.length > visibleStrainMatches.length
        ? `Showing ${visibleStrainMatches.length} of ${strainMatches.length}`
        : `${strainMatches.length.toLocaleString()} found`,
      visibleStrainMatches.map(discoveryStrainCardHtml),
      'is-results'
    )
  ].filter(Boolean);

  els.discoveryResultGroups.innerHTML = groups.length
    ? groups.join('')
    : '<div class="discovery-empty">No locations, coffeeshops, growers or strains match yet. Try a shorter name.</div>';
}

function shopBrowserRows() {
  const q = normaliseSearchText(els.shopBrowserSearch ? els.shopBrowserSearch.value : '');
  return shopRowsFromOfferings(state.offerings)
    .filter(row => !q || fieldMatchesSearch(row.shopName, q) || fieldMatchesSearch(row.city, q) || fieldMatchesSearch(row.shopKey, q));
}

function syncShopBrowserOptions() {
  if (!els.shopBrowserSelect) return [];
  const rows = shopBrowserRows();
  if (state.activeShopId && !rows.some(row => row.shopId === state.activeShopId)) {
    state.activeShopId = '';
  }
  if (!state.activeShopId && rows.length) {
    state.activeShopId = rows[0].shopId;
  }
  els.shopBrowserSelect.innerHTML = rows.length
    ? rows.map(row => `<option value="${escapeHtmlAttr(row.shopId)}"${row.shopId === state.activeShopId ? ' selected' : ''}>${escapeHtml(row.shopName)}${row.city ? ` · ${escapeHtml(row.city)}` : ''}</option>`).join('')
    : '<option value="">No matching shops</option>';
  return rows;
}

function syncShopCategoryOptions(listings) {
  if (!els.shopCategoryFilter) return;
  const categories = unique((Array.isArray(listings) ? listings : []).map(item => item.base_type || 'Unknown category')).sort(compareText);
  if (state.shopMenuCategory && !categories.includes(state.shopMenuCategory)) {
    state.shopMenuCategory = '';
  }
  els.shopCategoryFilter.innerHTML = '<option value="">All categories</option>' + categories
    .map(category => `<option value="${escapeHtmlAttr(category)}"${category === state.shopMenuCategory ? ' selected' : ''}>${escapeHtml(category)}</option>`)
    .join('');
}

function averageComparisonBadgeHtml(price, averagePrice) {
  if (!Number.isFinite(price) || !Number.isFinite(averagePrice) || averagePrice <= 0) {
    return '<span class="price-judgement average-comparison">Average unavailable</span>';
  }
  const difference = ((price - averagePrice) / averagePrice) * 100;
  const rounded = Math.round(Math.abs(difference));
  if (Math.abs(difference) < 3) {
    return '<span class="price-judgement average-comparison is-average">Around average</span>';
  }
  if (difference < 0) {
    return `<span class="price-judgement average-comparison is-below">${rounded}% below average</span>`;
  }
  return `<span class="price-judgement average-comparison is-above">${rounded}% above average</span>`;
}

function menuListingCardHtml(item) {
  const stat = getStatByKey(item.strain_name_normalised || normalise(item.strain_name));
  const profile = priceProfileForListings(stat ? stat.offerings : [item]);
  const price = pricePerGram(item);
  const priceLabel = packageListingPriceLabel(item);
  const meta = [
    item.base_type || 'Unknown category',
    Number(item.is_cali) === 1 ? 'Cali' : '',
    Number(item.is_legal) === 1 ? 'Legal project' : '',
    item.grower ? `Grower: ${item.grower}` : ''
  ].filter(Boolean).join(' · ');
  const notes = String(item.notes || '').trim();
  return `
    <article class="menu-listing-card">
      <div class="listing-card-head">
        <div class="menu-listing-main">
          ${getStrainImageHtml(item.strain_name || 'Unknown strain')}
          <div>
            <button type="button" class="menu-listing-title" data-open-strain-detail="${escapeHtmlAttr(item.strain_name_normalised || normalise(item.strain_name))}">${escapeHtml(item.strain_name || 'Unknown strain')}</button>
            <div class="menu-listing-meta">${escapeHtml(meta)}</div>
          </div>
        </div>
        <span class="menu-listing-price">${escapeHtml(priceLabel)}</span>
      </div>
      <div class="chip-row">
        ${averageComparisonBadgeHtml(price, profile.average)}
        ${ageBadgeHtml(displayListingDateValue(item), item)}
        ${Number(item.is_legal) === 1 ? '<span class="chip deal-chip">Legal project</span>' : ''}
      </div>
      ${notes ? `<p class="listing-note">${escapeHtml(notes)}</p>` : ''}
    </article>
  `;
}

function renderShopMenuBrowser() {
  if (!els.shopMenuBrowser) return;
  const shopBrowserQuery = normaliseSearchText(els.shopBrowserSearch ? els.shopBrowserSearch.value : '');
  if (state.view === 'shops' && (!shopBrowserQuery || !state.shopMenuExpanded)) {
    syncShopBrowserOptions();
    syncShopCategoryOptions([]);
    els.shopMenuBrowser.innerHTML = '';
    return;
  }
  const rows = syncShopBrowserOptions();
  const row = rows.find(item => item.shopId === state.activeShopId) ||
    shopRowsFromOfferings(state.offerings).find(item => item.shopId === state.activeShopId) ||
    rows[0];
  if (!row) {
    syncShopCategoryOptions([]);
    els.shopMenuBrowser.innerHTML = '<div class="empty">No coffeeshop menus match this search. Try a shorter shop name or clear one filter.</div>';
    return;
  }
  state.activeShopId = row.shopId;
  if (els.shopBrowserSelect) els.shopBrowserSelect.value = row.shopId;

  const allListings = row.offerings.slice();
  syncShopCategoryOptions(allListings);
  const filtered = allListings
    .filter(item => !state.shopMenuCategory || (item.base_type || 'Unknown category') === state.shopMenuCategory)
    .filter(item => !state.shopHideUnknownPrices || Number.isFinite(pricePerGram(item)));
  const sorted = filtered.slice().sort((a, b) => {
    if (state.shopMenuSort === 'cheapest') {
      return (pricePerGram(a) ?? Infinity) - (pricePerGram(b) ?? Infinity) || compareStrainName(a, b);
    }
    if (state.shopMenuSort === 'newest') {
      return (displayListingTime(b) || 0) - (displayListingTime(a) || 0) || compareStrainName(a, b);
    }
    if (state.shopMenuSort === 'judgement') {
      const aStat = getStatByKey(a.strain_name_normalised || normalise(a.strain_name));
      const bStat = getStatByKey(b.strain_name_normalised || normalise(b.strain_name));
      const aRank = priceJudgementFor(pricePerGram(a), priceProfileForListings(aStat ? aStat.offerings : [a]).median).rank;
      const bRank = priceJudgementFor(pricePerGram(b), priceProfileForListings(bStat ? bStat.offerings : [b]).median).rank;
      return aRank - bRank || (pricePerGram(a) ?? Infinity) - (pricePerGram(b) ?? Infinity) || compareStrainName(a, b);
    }
    return compareStrainName(a, b);
  });

  const prices = allListings.map(pricePerGram).filter(Number.isFinite);
  const newestTime = latestListingTime(allListings);
  const newestDate = newestTime ? new Date(newestTime).toISOString() : '';
  const batchOnlyContext = state.listingCheckBatch && state.listingCheckBatch.isSharedBatch && !newestDate;
  const newestSignalLabel = batchOnlyContext ? 'Data refresh' : 'Latest menu date';
  const newestSignalHelper = batchOnlyContext
    ? 'Shared data refresh; menu date unknown'
    : ageBreakdownLabel(ageBreakdownForListings(allListings));
  const groups = new Map();
  sorted.forEach(item => {
    const category = item.base_type || 'Unknown category';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });
  const href = row.shopUrl || shopLinkForId(row.shopId);
  const selected = isShopSelected(row.shopId);
  const mapUrl = buildShopMapLink(row.shopId);
  els.shopMenuBrowser.innerHTML = `
    <div class="shop-menu-hero">
      <div class="shop-menu-hero-head">
        <a class="shop-card-main shop-menu-map-link" href="${escapeHtmlAttr(mapUrl)}" aria-label="View ${escapeHtmlAttr(row.shopName)} on map">
          ${getShopLogoHtml(row.shopKey, row.shopName)}
          <div class="shop-card-copy">
            <h3>${escapeHtml(row.shopName)}</h3>
            <p>${escapeHtml(row.city || 'City unknown')} · ${allListings.length.toLocaleString()} known menu listing${allListings.length === 1 ? '' : 's'}.</p>
          </div>
        </a>
        ${ageBadgeHtml(newestDate)}
      </div>
      <div class="shop-menu-summary-grid">
        ${statTileHtml('Known listings', allListings.length.toLocaleString(), `${filtered.length.toLocaleString()} visible`)}
        ${statTileHtml('Priced listings', prices.length.toLocaleString(), prices.length ? `Low ${money(Math.min(...prices))}` : 'No usable prices')}
        ${statTileHtml('Average price', prices.length ? money(average(prices)) : 'Unknown', 'Visible shop menu')}
        ${statTileHtml(newestSignalLabel, newestDate ? formatDate(newestDate) : 'Unknown', newestSignalHelper)}
      </div>
      <div class="listing-card-actions">
        <button type="button" data-toggle-map-shop="${escapeHtmlAttr(row.shopId)}" class="${selected ? 'is-active' : ''}">${selected ? 'Remove saved shop' : 'Save shop'}</button>
        <a href="${escapeHtmlAttr(mapUrl)}" aria-label="View ${escapeHtmlAttr(row.shopName)} on map">View on map</a>
        <a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer">Source menu</a>
      </div>
    </div>
    ${groups.size ? Array.from(groups.entries()).map(([category, items]) => `
      <section class="menu-category-group">
        <div class="menu-category-head">
          <h3>${escapeHtml(category)}</h3>
          <span>${items.length.toLocaleString()} listing${items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="menu-listing-grid">
          ${items.map(menuListingCardHtml).join('')}
        </div>
      </section>
    `).join('') : '<div class="empty">No menu listings match these shop menu filters.</div>'}
  `;
}

function detailUrl(params = {}) {
  const url = new URL(window.location.href);
  url.search = '';
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return `${url.pathname}${url.search}`;
}

function focusDetail() {
  window.setTimeout(() => {
    if (els.detailView) els.detailView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const title = els.detailView ? els.detailView.querySelector('.detail-header h2') : null;
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  }, 0);
}

function rememberDetailReturnContext() {
  if (window.history && window.history.replaceState) {
    const returnUrl = new URL(window.location.href);
    const currentRoute = new URL(navigationUrlForCurrentState(), window.location.href);
    ['detail', 'strain', 'search', 'browser', 'shop_id', 'shopId', 'shop', 'shop_name', 'mode', 'view']
      .forEach(key => returnUrl.searchParams.delete(key));
    currentRoute.searchParams.forEach((value, key) => returnUrl.searchParams.set(key, value));
    if (!state.detail && !state.discoveryBrowser) {
      if (state.browseMode !== 'value') returnUrl.searchParams.set('mode', state.browseMode);
      if (state.view !== 'strains') returnUrl.searchParams.set('view', state.view);
    }
    window.history.replaceState(window.history.state, '', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
  }
  state.detailReturnStack.push({
    detail: state.detail ? { ...state.detail } : null,
    discoveryBrowser: state.discoveryBrowser || '',
    search: els.search ? els.search.value : '',
    view: state.view
  });
}

function detailBackLabel(fallbackLabel) {
  const context = state.detailReturnStack[state.detailReturnStack.length - 1];
  if (!context) return fallbackLabel;
  if (context.detail && context.detail.type === 'shop') {
    const shop = shopRowsFromOfferings(state.offerings)
      .find(item => item.shopId === String(context.detail.shopId));
    return `← Back to ${shop ? shop.shopName : 'shop'} menu`;
  }
  if (context.detail && context.detail.type === 'strain') {
    const stat = getStatByKey(context.detail.key);
    return `← Back to ${stat ? stat.name : 'strain'} profile`;
  }
  if (context.discoveryBrowser === 'shops') return '← Back to coffeeshop browser';
  if (context.discoveryBrowser === 'strains') return '← Back to strain browser';
  if (context.search) return '← Back to search results';
  return fallbackLabel;
}

function navigationUrlForCurrentState() {
  if (state.detail && state.detail.type === 'shop') {
    return detailUrl({ detail: 'shop', shop_id: state.detail.shopId });
  }
  if (state.detail && state.detail.type === 'strain') {
    const stat = getStatByKey(state.detail.key);
    return detailUrl({ detail: 'strain', strain: stat ? stat.name : state.detail.key });
  }
  if (state.discoveryBrowser) return detailUrl({ browser: state.discoveryBrowser });
  const search = els.search ? els.search.value.trim() : '';
  return detailUrl(search ? { search } : {});
}

function openStrainDetail(key) {
  const stat = getStatByKey(key);
  if (!stat) return;
  rememberDetailReturnContext();
  state.detailReturnSearch = els.search.value;
  state.detail = { type: 'strain', key: stat.key };
  state.detailVisibleLimit = DETAIL_LISTING_STEP;
  state.view = 'strains';
  els.search.value = stat.name;
  if (window.history && window.history.pushState) {
    window.history.pushState({ detail: 'strain', strain: stat.name }, '', detailUrl({ detail: 'strain', strain: stat.name }));
  }
  render();
  focusDetail();
}

function openShopDetail(shopId) {
  const row = shopRowsFromOfferings(state.offerings).find(item => item.shopId === String(shopId));
  if (!row) return;
  rememberDetailReturnContext();
  state.detailReturnSearch = els.search.value;
  state.detail = { type: 'shop', shopId: row.shopId };
  state.view = 'shops';
  state.activeShopId = row.shopId;
  state.shopMenuExpanded = true;
  els.search.value = row.shopName;
  if (els.shopBrowserSearch) els.shopBrowserSearch.value = row.shopName;
  if (window.history && window.history.pushState) {
    window.history.pushState({ detail: 'shop', shopId: row.shopId }, '', detailUrl({ detail: 'shop', shop_id: row.shopId }));
  }
  render();
  focusDetail();
}

function closeDetail() {
  const context = state.detailReturnStack.pop() || null;
  const returnSearch = context ? context.search : (state.detailReturnSearch || '');
  state.detail = context && context.detail ? { ...context.detail } : null;
  state.discoveryBrowser = context ? (context.discoveryBrowser || '') : '';
  state.view = context && context.view ? context.view : state.view;
  state.detailVisibleLimit = DETAIL_LISTING_STEP;
  state.detailReturnSearch = context && context.detail ? returnSearch : '';
  els.search.value = returnSearch;
  if (window.history && window.history.pushState) {
    window.history.pushState({}, '', navigationUrlForCurrentState());
  }
  syncUniversalSearchMode();
  render();
  window.setTimeout(() => {
    const target = state.detail
      ? els.detailView
      : (state.discoveryBrowser ? els.discoveryBrowser : document.querySelector('.database-search-panel'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const focusTarget = state.detail
      ? (els.detailView && els.detailView.querySelector('.detail-header h2'))
      : (state.discoveryBrowser ? els.discoveryBrowserTitle : els.search);
    if (focusTarget) {
      if (state.detail) focusTarget.setAttribute('tabindex', '-1');
      focusTarget.focus({ preventScroll: true });
    }
  }, 0);
}

function preserveActionFocus(container = document) {
  const active = document.activeElement;
  if (!active || !container || !container.contains(active)) return () => {};
  const attributes = Array.from(active.attributes || [])
    .filter(attribute => attribute.name.startsWith('data-'))
    .map(attribute => [attribute.name, attribute.value]);
  if (!attributes.length) return () => {};
  const scope = active.parentElement?.closest('[id]') || container;
  const matchingActions = () => Array.from(scope.querySelectorAll(active.tagName))
    .filter(candidate => attributes.every(([name, value]) => candidate.getAttribute(name) === value));
  const index = matchingActions().indexOf(active);
  return () => {
    if (active.isConnected || !scope.isConnected) return;
    const replacement = matchingActions()[index];
    if (replacement && !replacement.closest('[hidden]')) replacement.focus({ preventScroll: true });
  };
}

function renderDetail() {
  const restoreFocus = preserveActionFocus(els.detailView);
  renderDetailContents();
  els.detailView?.querySelectorAll('button[data-select-strain], button[data-toggle-map-shop]').forEach(button => {
    const selected = button.hasAttribute('data-select-strain')
      ? isSelected(button.dataset.selectStrain)
      : isShopSelected(button.dataset.toggleMapShop);
    button.setAttribute('aria-pressed', String(selected));
  });
  restoreFocus();
}

function renderDetailContents() {
  if (!els.detailView || !els.databaseLayout) return;
  const detail = state.detail;
  document.body.classList.toggle('database-detail-open', Boolean(detail));
  els.detailView.hidden = !detail;
  els.databaseLayout.hidden = Boolean(detail);
  if (!detail) {
    els.detailView.innerHTML = '';
    return;
  }

  if (detail.type === 'strain') {
    const stat = getStatByKey(detail.key);
    if (!stat) {
      els.detailView.innerHTML = '<button type="button" class="detail-back-button" data-close-detail>← Back to database</button><div class="empty" role="status">This strain is no longer in the current dataset.</div>';
      return;
    }
    const listings = (stat.offerings || []).slice().sort((a, b) => {
      const priceDiff = (pricePerGram(a) ?? Infinity) - (pricePerGram(b) ?? Infinity);
      return priceDiff || compareShopName(a, b);
    });
    const profile = priceProfileForListings(listings);
    const visibleListings = listings.slice(0, state.detailVisibleLimit);
    const remainingListings = Math.max(0, listings.length - visibleListings.length);
    const shopIds = shopIdsForListings(listings);
    const mapUrl = mapUrlForShopIds(shopIds, { strainName: stat.name, strainShopIds: shopIds });
    const cities = (stat.cities || []).join(', ') || 'City unknown';
    els.detailView.innerHTML = `
      <div class="detail-topbar">
        <button type="button" class="detail-back-button" data-close-detail>${escapeHtml(detailBackLabel('← Back to results'))}</button>
        <span class="chip">${shopIds.length.toLocaleString()} shops</span>
      </div>
      <header class="detail-header">
        <div class="detail-header-main">
          ${getStrainDetailImageHtml(stat.name)}
          <div class="detail-header-copy">
            <p class="detail-eyebrow">Strain profile</p>
            <h2>${escapeHtml(stat.name)}</h2>
            <p>${escapeHtml(cities)} · every current menu listing for this strain, ordered from the lowest visible price.</p>
            <div class="detail-meta-row">
              ${stat.topType ? `<span class="chip type-${escapeHtml(stat.topType)}">${escapeHtml(stat.topType)}</span>` : ''}
              ${stat.caliCount ? `<span class="chip cali">${stat.caliCount} cali listing${stat.caliCount === 1 ? '' : 's'}</span>` : ''}
              ${ageBadgeHtml(profile.newestDate)}
            </div>
          </div>
        </div>
        <div class="shop-menu-summary-grid">
          ${statTileHtml('Average price', profile.average == null ? 'Unknown' : money(profile.average), 'Across priced listings')}
          ${statTileHtml('Lowest price', profile.low == null ? 'Unknown' : money(profile.low), 'Current visible listing')}
          ${statTileHtml('Highest price', profile.high == null ? 'Unknown' : money(profile.high), 'Current visible listing')}
          ${statTileHtml('Known listings', listings.length.toLocaleString(), `${profile.count.toLocaleString()} priced`)}
        </div>
        <div class="detail-actions">
          <button type="button" data-select-strain="${escapeHtmlAttr(stat.key)}">${isSelected(stat.key) ? 'Remove saved strain' : 'Save strain'}</button>
          <a href="${escapeHtmlAttr(mapUrl)}" data-map-strain-shops="${escapeHtmlAttr(shopIds.join(','))}" data-strain-name="${escapeHtmlAttr(stat.name)}" data-strain-shops="${escapeHtmlAttr(shopIds.join(','))}">View on map</a>
        </div>
      </header>
      <section class="detail-section">
        <div>
          <h3>Where to find it</h3>
          <p class="muted">${listings.length.toLocaleString()} current listing${listings.length === 1 ? '' : 's'} across ${shopIds.length.toLocaleString()} shop${shopIds.length === 1 ? '' : 's'}. Select a shop to see its full known menu.</p>
        </div>
        <div class="detail-listing-grid">
          ${visibleListings.length ? visibleListings.map(item => listingCardHtml(item, profile, { strainName: stat.name })).join('') : '<div class="empty">No current listings are available for this strain.</div>'}
        </div>
        ${remainingListings ? `
          <div class="detail-load-more-row">
            <button type="button" data-load-more-detail>
              Show ${Math.min(DETAIL_LISTING_STEP, remainingListings).toLocaleString()} more
              (${remainingListings.toLocaleString()} left)
            </button>
          </div>
        ` : ''}
      </section>
    `;
    return;
  }

  const row = shopRowsFromOfferings(state.offerings).find(item => item.shopId === String(detail.shopId));
  if (!row) {
    els.detailView.innerHTML = '<button type="button" class="detail-back-button" data-close-detail>← Back to database</button><div class="empty" role="status">This shop is no longer in the current dataset.</div>';
    return;
  }
  const listings = row.offerings.slice().sort(compareStrainName);
  const prices = listings.map(pricePerGram).filter(Number.isFinite);
  const newestTime = latestListingTime(listings);
  const newestDate = newestTime ? new Date(newestTime).toISOString() : '';
  const mapUrl = buildShopMapLink(row.shopId);
  const categories = new Map();
  listings.forEach(item => {
    const category = item.base_type || 'Other';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(item);
  });
  els.detailView.innerHTML = `
    <div class="detail-topbar">
      <button type="button" class="detail-back-button" data-close-detail>${escapeHtml(detailBackLabel('← Back to shop results'))}</button>
      ${ageBadgeHtml(newestDate)}
    </div>
    <header class="detail-header">
      <div class="detail-header-main">
        ${getShopLogoHtml(row.shopKey, row.shopName)}
        <div class="detail-header-copy">
          <p class="detail-eyebrow">Coffeeshop menu</p>
          <h2>${escapeHtml(row.shopName)}</h2>
          <p>${escapeHtml(row.city || 'City unknown')} · full current menu snapshot. Select any strain to open its price profile and every known stocking shop.</p>
          ${categoryPillsHtml(row, 6)}
        </div>
      </div>
      <div class="shop-menu-summary-grid">
        ${statTileHtml('Known listings', listings.length.toLocaleString(), `${categories.size.toLocaleString()} categories`)}
        ${statTileHtml('Priced listings', prices.length.toLocaleString(), prices.length ? `Low ${money(Math.min(...prices))}` : 'No usable prices')}
        ${statTileHtml('Average price', prices.length ? money(average(prices)) : 'Unknown', 'Visible shop menu')}
        ${statTileHtml('Latest menu date', newestDate ? formatDate(newestDate) : 'Unknown', ageBreakdownLabel(ageBreakdownForListings(listings)))}
      </div>
      <div class="detail-actions">
        <button type="button" data-toggle-map-shop="${escapeHtmlAttr(row.shopId)}" class="${isShopSelected(row.shopId) ? 'is-active' : ''}">${isShopSelected(row.shopId) ? 'Remove saved shop' : 'Save shop'}</button>
        <a href="${escapeHtmlAttr(mapUrl)}">View on map</a>
        <a href="${escapeHtmlAttr(row.shopUrl || shopLinkForId(row.shopId))}" target="_blank" rel="noopener noreferrer">Source menu</a>
      </div>
    </header>
    ${Array.from(categories.entries()).map(([category, items]) => `
      <section class="detail-section menu-category-group">
        <div class="menu-category-head">
          <h3>${escapeHtml(category)}</h3>
          <span>${items.length.toLocaleString()} listing${items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="detail-listing-grid">
          ${items.map(menuListingCardHtml).join('')}
        </div>
      </section>
    `).join('')}
  `;
}

function latestStatChangeTime(stat) {
  return (Array.isArray(stat && stat.filteredOfferings) ? stat.filteredOfferings : []).reduce((latest, item) => {
    const time = displayListingTime(item);
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);
}

function renderFreshStrainRows(stats) {
  if (!els.strainGrid) return;
  if (els.strainMoreRow) els.strainMoreRow.hidden = true;

  const newestTime = (Array.isArray(stats) ? stats : []).reduce((latest, stat) => {
    const time = latestStatChangeTime(stat);
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);

  if (!Number.isFinite(newestTime) || newestTime <= 0) {
    els.strainsSummary.textContent = 'No strains in the current filters have a known menu-change date yet.';
    els.strainGrid.innerHTML = '<div class="empty">Fresh mode only uses known menu-change dates. Try another filter, or switch to Best value to browse all known strains.</div>';
    return;
  }

  const newestDateKey = new Date(newestTime).toISOString().slice(0, 10);
  const rows = stats
    .map(stat => {
      const latestItems = (stat.filteredOfferings || [])
        .filter(item => {
          const time = displayListingTime(item);
          return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === newestDateKey;
        })
        .sort((a, b) => (displayListingTime(b) || 0) - (displayListingTime(a) || 0) || compareShopName(a, b));
      if (!latestItems.length) return null;
      const latestItem = latestItems[0];
      const latestTime = displayListingTime(latestItem) || 0;
      const shopIds = shopIdsForListings(latestItems);
      const prices = latestItems.map(pricePerGram).filter(Number.isFinite);
      return {
        stat,
        latestItems,
        latestTime,
        latestDate: new Date(latestTime).toISOString(),
        shopIds,
        shopCount: shopIds.length,
        listingCount: latestItems.length,
        low: prices.length ? Math.min(...prices) : null,
        sampleShops: unique(latestItems.map(item => item.shop_name || '').filter(Boolean)).slice(0, 4)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.latestTime - a.latestTime || b.shopCount - a.shopCount || compareStrainName(a.stat, b.stat));

  const visibleRows = rows.slice(0, 220);
  const listingTotal = rows.reduce((sum, row) => sum + row.listingCount, 0);
  els.strainsSummary.textContent = `${rows.length.toLocaleString()} strain${rows.length === 1 ? '' : 's'} entered in the newest data drop on ${formatDate(new Date(newestTime).toISOString())} · ${listingTotal.toLocaleString()} listing${listingTotal === 1 ? '' : 's'}.`;

  if (!visibleRows.length) {
    els.strainGrid.innerHTML = '<div class="empty">No strains match the newest data drop under these filters.</div>';
    return;
  }

  els.strainGrid.innerHTML = visibleRows.map(row => {
    const selected = isSelected(row.stat.key);
    const shopsLabel = row.sampleShops.length
      ? `${row.sampleShops.join(', ')}${row.shopCount > row.sampleShops.length ? ` +${row.shopCount - row.sampleShops.length}` : ''}`
      : 'Shop details available';
    const lowLabel = row.low == null ? 'Price unknown' : `Lowest ${money(row.low)}`;
    const allMapUrl = mapUrlForShopIds(row.shopIds, { strainName: row.stat.name, strainShopIds: row.shopIds });
    const freshness = freshnessBadgeInfo(row.latestDate);
    return `
      <article class="fresh-shop-row is-strain-row${selected ? ' is-selected' : ''}">
        <div class="fresh-shop-main">
          ${getStrainImageHtml(row.stat.name)}
          <div class="fresh-shop-copy">
            <strong class="fresh-shop-name">${escapeHtml(row.stat.name)}</strong>
            <span class="fresh-shop-meta">${row.shopCount.toLocaleString()} shop${row.shopCount === 1 ? '' : 's'} · ${row.listingCount.toLocaleString()} new listing${row.listingCount === 1 ? '' : 's'} · ${escapeHtml(lowLabel)}</span>
          </div>
        </div>
        <div class="fresh-shop-date">
          <strong>${escapeHtml(formatDate(row.latestDate))}</strong>
          <span>${freshness ? escapeHtml(freshness.label) : 'Newest data drop'}</span>
        </div>
        <div class="fresh-shop-menu-preview">
          <strong>${escapeHtml(shopsLabel)}</strong>
          <span>${escapeHtml(row.stat.filteredTopType || row.stat.topType || 'Known strain listing')}</span>
        </div>
        <div class="fresh-shop-actions">
          <button type="button" data-open-strain-detail="${escapeHtmlAttr(row.stat.key)}">Profile</button>
          <button type="button" data-select-strain="${escapeHtmlAttr(row.stat.key)}" class="${selected ? 'is-active' : ''}">${selected ? 'Remove saved strain' : 'Save strain'}</button>
          <button type="button" data-focus-shops="${escapeHtmlAttr(row.stat.key)}">Shops</button>
          <a href="${escapeHtmlAttr(allMapUrl)}" data-map-strain-shops="${escapeHtmlAttr(row.shopIds.join(','))}" data-strain-name="${escapeHtmlAttr(row.stat.name)}" data-strain-shops="${escapeHtmlAttr(row.shopIds.join(','))}">Map</a>
        </div>
      </article>
    `;
  }).join('');
}

function renderStrains(stats) {
  const filters = currentFilters();
  const mode = browseModeSummary(state.browseMode);
  const family = state.familyFilter ? ` in ${familyLabel(state.familyFilter)}` : '';
  const sortSuffix = filters.sort ? ` · ${sortModeSummary(filters.sort)}` : '';
  if (els.strainGrid) els.strainGrid.classList.toggle('is-fresh-scan', state.browseMode === 'fresh');
  if (state.browseMode === 'fresh') {
    renderFreshStrainRows(stats);
    return;
  }
  const visibleStats = stats.slice(0, state.visibleStrainLimit);
  els.strainsSummary.textContent = `${stats.length.toLocaleString()} ${mode} strain${stats.length === 1 ? '' : 's'}${family} match the current filters${sortSuffix}.`;
  if (!stats.length) {
    els.strainGrid.innerHTML = '<div class="empty">No strains match these filters. Try clearing one filter, widening the price range, or searching a shorter name.</div>';
    if (els.strainMoreRow) els.strainMoreRow.hidden = true;
    return;
  }
  els.strainGrid.innerHTML = visibleStats.map(stat => {
    const selected = isSelected(stat.key);
    const shopIds = shopIdsForListings(stat.filteredOfferings || []);
    const mapUrl = mapUrlForShopIds(shopIds, {
      strainName: stat.name,
      strainShopIds: shopIds
    });
    const latestDate = (stat.filteredOfferings || [])
      .map(item => displayListingDateValue(item))
      .filter(Boolean)
      .sort()
      .at(-1) || '';
    const freshness = freshnessBadgeInfo(latestDate) || { label: 'Menu date unknown', className: 'is-unknown' };
    const checked = latestDate ? formatFreshness(latestDate) : 'Menu date unknown';
    const shopLabel = `${stat.filteredShopCount.toLocaleString()} shop${stat.filteredShopCount === 1 ? '' : 's'}`;
    return `
      <article class="strain-card strain-summary-card${selected ? ' is-selected' : ''}" data-strain-card="${escapeHtml(stat.key)}">
        <div class="strain-card-head">
          <div>
            <h3>${escapeHtml(stat.name)}</h3>
            <div class="muted">${escapeHtml(shopLabel)}</div>
          </div>
          <span class="chip ${freshness.className}">${escapeHtml(freshness.label)}</span>
        </div>
        <div class="strain-summary-metrics" aria-label="${escapeHtmlAttr(stat.name)} price summary">
          <span><small>Lowest known</small><strong>${money(stat.filteredCheapest)}</strong></span>
          <span><small>Typical price</small><strong>${money(stat.filteredAvg)}</strong></span>
          <span><small>Shops</small><strong>${stat.filteredShopCount.toLocaleString()}</strong></span>
        </div>
        <p class="strain-summary-freshness"><strong>${escapeHtml(freshness.label)}:</strong> ${escapeHtml(checked)}. Availability can change.</p>
        <div class="card-actions">
          <button type="button" class="primary-card-action" data-open-strain-detail="${escapeHtmlAttr(stat.key)}">View comparison</button>
          <button type="button" data-focus-shops="${escapeHtmlAttr(stat.key)}">See shops</button>
          <a href="${escapeHtmlAttr(mapUrl)}" data-map-strain-shops="${escapeHtmlAttr(shopIds.join(','))}" data-strain-name="${escapeHtmlAttr(stat.name)}" data-strain-shops="${escapeHtmlAttr(shopIds.join(','))}">View on map</a>
        </div>
      </article>
    `;
  }).join('');
  if (els.strainMoreRow && els.loadMoreStrains) {
    const remaining = Math.max(0, stats.length - visibleStats.length);
    els.strainMoreRow.hidden = remaining <= 0;
    els.loadMoreStrains.textContent = remaining > STRAIN_LIMIT_STEP
      ? `Show ${STRAIN_LIMIT_STEP} more (${remaining.toLocaleString()} left)`
      : `Show ${remaining.toLocaleString()} more`;
  }
}

function selectedStats() {
  return state.selected
    .map(key => state.strainStats.find(stat => stat.key === key))
    .filter(Boolean)
    .sort(compareStrainName);
}

function shopLinkForId(shopId) {
  const meta = state.shopById.get(String(shopId)) || {};
  return meta.shop_url || `/shop/${encodeURIComponent(shopId)}/digitised`;
}

function belowAverageDealsForOfferings(offerings) {
  const byStrain = new Map();
  (Array.isArray(offerings) ? offerings : []).forEach(item => {
    const key = item.strain_name_normalised || normalise(item.strain_name);
    const stat = getStatByKey(key);
    const averagePrice = Number(stat && stat.avg);
    const price = Number(item.price_amount);
    if (!key || !Number.isFinite(price) || !Number.isFinite(averagePrice) || averagePrice <= 0 || price >= averagePrice) return;
    const percentBelow = Math.round(((averagePrice - price) / averagePrice) * 100);
    if (percentBelow <= 0) return;
    const current = byStrain.get(key);
    const deal = {
      key,
      item,
      price,
      averagePrice,
      percentBelow,
      saving: averagePrice - price
    };
    if (!current || deal.percentBelow > current.percentBelow || (deal.percentBelow === current.percentBelow && deal.price < current.price)) {
      byStrain.set(key, deal);
    }
  });
  return Array.from(byStrain.values()).sort((a, b) => {
    if (b.percentBelow !== a.percentBelow) return b.percentBelow - a.percentBelow;
    if (b.saving !== a.saving) return b.saving - a.saving;
    return compareStrainName(a.item, b.item);
  });
}

function getCommonShopRows(stats = selectedStats()) {
  if (!stats.length) return [];
  const selectedKeys = stats.map(stat => stat.key);
  const rowsByShop = new Map();

  stats.forEach(stat => {
    stat.shops.forEach((listing, shopId) => {
      const id = String(shopId);
      const meta = getShopMeta(id);
      if (!rowsByShop.has(id)) {
        rowsByShop.set(id, {
          shopId: id,
          shopKey: listing.shop_key || meta.shop_key || '',
          name: listing.shop_name || meta.name || 'Unknown shop',
          city: listing.shop_city || meta.city || '',
          href: shopLinkForId(id),
          listingsByStrain: new Map()
        });
      }
      rowsByShop.get(id).listingsByStrain.set(stat.key, listing);
    });
  });

  return Array.from(rowsByShop.values())
    .map(row => {
      const listings = selectedKeys.map(key => row.listingsByStrain.get(key)).filter(Boolean);
      const prices = listings.map(item => Number(item.price_amount)).filter(Number.isFinite);
      const total = prices.length === selectedKeys.length
        ? prices.reduce((sum, value) => sum + value, 0)
        : null;
      return {
        ...row,
        listings,
        matchCount: row.listingsByStrain.size,
        total
      };
    })
    .filter(row => row.matchCount === selectedKeys.length)
    .sort((a, b) => {
      const nameDiff = compareShopName(a, b);
      if (nameDiff !== 0) return nameDiff;
      return (a.total ?? Infinity) - (b.total ?? Infinity);
    });
}

function routePlanSummary(stats) {
  const rows = stats.map(stat => {
    const shopId = String((state.routePlanByStrain || {})[stat.key] || '');
    if (!shopId) return null;
    const listing = stat.shops.get(shopId);
    if (!listing) return null;
    return { stat, shopId, listing };
  }).filter(Boolean);
  const prices = rows.map(row => Number(row.listing.price_amount)).filter(Number.isFinite);
  return {
    rows,
    selectedCount: rows.length,
    missingCount: Math.max(0, stats.length - rows.length),
    pricedCount: prices.length,
    total: prices.length ? prices.reduce((sum, value) => sum + value, 0) : null,
    shopIds: Array.from(new Set(rows.map(row => row.shopId)))
  };
}

function renderRoutePlanBoard(stats) {
  if (!stats.length) {
    els.routePlanBoard.innerHTML = '<div class="empty">Save strains to compare prices, then send matching shops to the map.</div>';
    return;
  }

  const summary = routePlanSummary(stats);
  const totalLabel = summary.total == null
    ? 'No price data'
    : `${money(summary.total).replace(/\/g$/, '')}`;
  const helper = summary.missingCount
    ? `Choose ${summary.missingCount} more strain${summary.missingCount === 1 ? '' : 's'} to complete the basket.`
    : (summary.pricedCount === summary.selectedCount ? `${summary.shopIds.length} coffeeshop${summary.shopIds.length === 1 ? '' : 's'} selected for the map.` : 'Basket has an unknown price.');

  els.routePlanBoard.innerHTML = `
    <div class="route-plan-head">
      <div>
        <h3>Choose saved shops</h3>
        <p>Pick one shop for each saved strain. The map will show those places so you can compare routes or add them to an itinerary.</p>
      </div>
      <div class="route-plan-total">
        <strong>${escapeHtml(totalLabel)}</strong>
        <span class="muted">${escapeHtml(helper)}</span>
      </div>
    </div>
    ${stats.map(stat => {
      const activeShopId = String((state.routePlanByStrain || {})[stat.key] || '');
      const options = Array.from(stat.shops.entries())
        .map(([shopId, listing]) => ({
          shopId: String(shopId),
          listing,
          price: Number(listing.price_amount),
          name: listing.shop_name || getShopMeta(shopId).name || 'Unknown shop',
          city: listing.shop_city || getShopMeta(shopId).city || ''
        }))
        .sort((a, b) => {
          const nameDiff = compareShopName(a, b);
          if (nameDiff !== 0) return nameDiff;
          const priceDiff = (Number.isFinite(a.price) ? a.price : Infinity) - (Number.isFinite(b.price) ? b.price : Infinity);
          return priceDiff;
        });
      const active = activeShopId ? options.find(option => option.shopId === activeShopId) : null;
      const activeLabel = active
        ? `${active.name}${Number.isFinite(active.price) ? ` · ${money(active.price, active.listing.price_currency, active.listing.price_unit)}` : ''}`
        : 'No shop selected';
      return `
        <div class="route-plan-row">
          <div class="route-plan-row-head">
            <div>
              <h4>${escapeHtml(stat.name)}</h4>
              <span>${escapeHtml(activeLabel)}</span>
            </div>
            <span>${options.length} option${options.length === 1 ? '' : 's'}</span>
          </div>
          <div class="route-plan-options">
            ${options.map(option => {
              const selected = activeShopId === option.shopId;
              const price = Number.isFinite(option.price)
                ? money(option.price, option.listing.price_currency, option.listing.price_unit)
                : 'Price unknown';
              const city = option.city ? ` · ${option.city}` : '';
              return `<button type="button" class="route-plan-option${selected ? ' is-active' : ''}" data-route-plan-strain="${escapeHtml(stat.key)}" data-route-plan-shop="${escapeHtml(option.shopId)}">${escapeHtml(option.name)}${escapeHtml(city)} · ${escapeHtml(price)}</button>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderCommonShopBoard(stats) {
  if (!stats.length) {
    els.commonShopBoard.innerHTML = '<div class="empty">Save strains to find coffeeshops carrying the full set.</div>';
    return;
  }

  const rows = getCommonShopRows(stats);
  if (!rows.length) {
    els.commonShopBoard.innerHTML = '<div class="empty">No shops match every saved strain under the current filters. Try removing one strain or widening the filters.</div>';
    return;
  }

  const selectedCount = state.selectedShopIds.length;
  const shown = rows;
  els.commonShopBoard.innerHTML = `
    <div class="common-shop-board-head">
      <div>
        <h3>${rows.length} common coffeeshop${rows.length === 1 ? '' : 's'}</h3>
        <p>${stats.length} saved strain${stats.length === 1 ? '' : 's'} matched. Save shops, then view them on the map.</p>
      </div>
      <button type="button" data-select-common-shops>${selectedCount ? 'Replace with common' : 'Select common'}</button>
    </div>
    <div class="common-shop-grid">
      ${shown.map(row => {
        const selected = isShopSelected(row.shopId);
        const mapUrl = buildShopMapLink(row.shopId);
        const totalLabel = row.total == null
          ? 'Mixed price'
          : `${money(row.total).replace(/\/g$/, '')} total`;
        const reason = row.matchCount === stats.length
          ? `Recommended because: matches every saved strain in this view.`
          : `Recommended because: matches ${row.matchCount} saved strain${row.matchCount === 1 ? '' : 's'} under the current filters.`;
        const listingTags = row.listings.map(item => {
          const price = Number.isFinite(Number(item.price_amount))
            ? money(item.price_amount, item.price_currency, item.price_unit)
            : 'Price unknown';
          const freshness = freshnessBadgeInfo(displayListingDateValue(item));
          return `<span class="chip">${escapeHtml(item.strain_name)} ${escapeHtml(price)}</span>${freshness ? `<span class="chip ${freshness.className}">${escapeHtml(freshness.label)}</span>` : ''}`;
        }).join('');
        return `
          <article class="common-shop-card${selected ? ' is-selected' : ''}" data-common-shop-card="${escapeHtml(row.shopId)}" tabindex="0" aria-pressed="${selected ? 'true' : 'false'}" title="${selected ? 'Remove saved shop' : 'Save shop'} ${escapeHtml(row.name)}">
            <div class="common-shop-card-title">
              <div class="shop-card-main">
                <a class="shop-logo-map-link" href="${escapeHtmlAttr(mapUrl)}" aria-label="View ${escapeHtmlAttr(row.name)} on map">
                  ${getShopLogoHtml(row.shopKey, row.name)}
                </a>
                <div class="shop-card-copy">
                  <strong>${escapeHtml(row.name)}</strong>
                  <span class="common-shop-card-meta">${escapeHtml(row.city || 'Current city')}</span>
                </div>
              </div>
              <span class="chip">${escapeHtml(totalLabel)}</span>
            </div>
            <div class="availability-tags">${listingTags}</div>
            <p class="shop-card-reason">${escapeHtml(reason)}</p>
            <div class="common-shop-card-actions">
              <button type="button" data-toggle-map-shop="${escapeHtml(row.shopId)}" class="${selected ? 'is-active' : ''}">${selected ? 'Remove saved shop' : 'Save shop'}</button>
              <a href="${escapeHtml(row.href)}" target="_blank" rel="noopener noreferrer">Menu</a>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderCommonShopsForStat(stat, allStats) {
  const otherStats = allStats.filter(other => other.key !== stat.key);
  if (!otherStats.length) {
    return '<div class="empty">Save another strain to see common coffeeshops.</div>';
  }

  const groups = otherStats.map(other => {
    const otherShopIds = new Set(Array.from(other.shops.keys()));
    const commonListings = Array.from(stat.shops.entries())
      .filter(([shopId]) => otherShopIds.has(shopId))
      .map(([shopId, listing]) => ({
        shopId,
        name: listing.shop_name || 'Unknown shop',
        city: listing.shop_city || '',
        priceLabel: Number.isFinite(Number(listing.price_amount))
          ? money(listing.price_amount, listing.price_currency, listing.price_unit)
          : 'Price unknown',
        href: shopLinkForId(shopId)
      }))
      .sort((a, b) => {
        const nameDiff = compareShopName(a, b);
        if (nameDiff !== 0) return nameDiff;
        return compareText(a.priceLabel, b.priceLabel);
      });

    const listHtml = commonListings.length
      ? commonListings.map(shop => {
          const selected = isShopSelected(shop.shopId);
          const metaParts = [shop.city, shop.priceLabel].filter(Boolean);
          return (
          `<li class="${selected ? 'is-selected' : ''}" data-partial-shop-card="${escapeHtml(shop.shopId)}" tabindex="0" aria-pressed="${selected ? 'true' : 'false'}" title="${selected ? 'Remove saved shop' : 'Save shop'} ${escapeHtml(shop.name)}">` +
            `<span><strong>${escapeHtml(shop.name)}</strong><span class="common-shop-list-meta">${escapeHtml(metaParts.join(' · '))}</span></span>` +
            `<button type="button" data-toggle-map-shop="${escapeHtml(shop.shopId)}" class="${selected ? 'is-active' : ''}">${selected ? 'Remove saved shop' : 'Save shop'}</button>` +
          `</li>`
          );
        }).join('')
      : '<li><span class="muted">No shared coffeeshops for this pair yet.</span></li>';

    return (
      `<div class="common-shop-group">` +
        `<div class="common-shop-group-head">` +
          `<span>${escapeHtml(other.name)}</span>` +
          `<span>${commonListings.length} shared</span>` +
        `</div>` +
        `<ul class="common-shop-list">${listHtml}</ul>` +
      `</div>`
    );
  }).join('');

  return `<div class="common-shops"><h4 class="common-shops-title">Common coffeeshops</h4>${groups}</div>`;
}

function renderCompare() {
  const stats = selectedStats();
  const commonRows = getCommonShopRows(stats);
  els.compareSummary.textContent = stats.length
    ? `${stats.length} saved strain${stats.length === 1 ? '' : 's'} selected · ${commonRows.length} common coffeeshop${commonRows.length === 1 ? '' : 's'}.`
    : 'Add strains from the list to find common coffeeshops.';
  renderCommonShopBoard(stats);
  renderRoutePlanBoard(stats);
  if (!stats.length) {
    els.comparisonGrid.innerHTML = '';
    return;
  }
  els.comparisonGrid.innerHTML = stats.map(stat => {
    const allShops = Array.from(stat.shops.values());
    const cheapestListing = allShops.slice().sort((a, b) => {
      const priceDiff = (Number.isFinite(Number(a.price_amount)) ? Number(a.price_amount) : Infinity) -
        (Number.isFinite(Number(b.price_amount)) ? Number(b.price_amount) : Infinity);
      return priceDiff || compareShopName(a, b);
    })[0];
    const overlap = stats
      .filter(other => other.key !== stat.key)
      .map(other => {
        const otherShopIds = new Set(Array.from(other.shops.keys()));
        const count = Array.from(stat.shops.keys()).filter(id => otherShopIds.has(id)).length;
        return `${other.name}: ${count}`;
      })
      .join(' | ');
    return `
      <article class="comparison-card">
        <div class="comparison-card-main">
          ${getStrainImageHtml(stat.name)}
          <div class="comparison-card-copy">
            <h3>${escapeHtml(stat.name)}</h3>
          </div>
        </div>
        <dl class="comparison-lines">
          <div><dt>Shops carrying it</dt><dd>${stat.shopCount} shops</dd></div>
          <div><dt>Listings</dt><dd>${stat.listingCount}</dd></div>
          <div><dt>Lowest price</dt><dd>${cheapestListing ? `${money(cheapestListing.price_amount, cheapestListing.price_currency, cheapestListing.price_unit)} at ${escapeHtml(cheapestListing.shop_name)}` : '--'}</dd></div>
          <div><dt>Average price</dt><dd>${stat.avg == null ? '--' : money(stat.avg)}</dd></div>
          <div><dt>Main type</dt><dd>${escapeHtml(stat.topType || '--')}</dd></div>
          <div><dt>Cities</dt><dd>${stat.cities.length}</dd></div>
          <div><dt>Shared shops</dt><dd>${escapeHtml(overlap || '--')}</dd></div>
        </dl>
        ${renderCommonShopsForStat(stat, stats)}
      </article>
    `;
  }).join('');
}

function latestKnownChangeDate(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => row.menuUpdatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function renderFreshShopRows(rows, mode = 'fresh', options = {}) {
  const visibleRows = (Array.isArray(rows) ? rows : []).slice(0, 220);
  const knownRows = visibleRows.filter(row => row.menuUpdatedAt);
  const newestDate = latestKnownChangeDate(knownRows);
  const newestCount = newestDate
    ? knownRows.filter(row => row.menuUpdatedAt && row.menuUpdatedAt.slice(0, 10) === newestDate.slice(0, 10)).length
    : 0;
  const searchQuery = normaliseSearchText(options.searchQuery || '');
  if (searchQuery) {
    els.shopsSummary.textContent = `${visibleRows.length.toLocaleString()} coffeeshop match${visibleRows.length === 1 ? '' : 'es'} for "${options.searchLabel || searchQuery}". Use Inspect to open a full menu without burying the shop list.`;
  } else if (mode === 'fresh') {
    els.shopsSummary.textContent = `${visibleRows.length.toLocaleString()} shops ordered by latest menu change · ${knownRows.length.toLocaleString()} with known change dates${newestDate ? ` · ${newestCount.toLocaleString()} changed on ${formatDate(newestDate)}` : ''}.`;
  } else if (mode === 'value') {
    const valueLeadTotal = visibleRows.reduce((sum, row) => sum + row.belowAverageDeals.length, 0);
    els.shopsSummary.textContent = `${visibleRows.length.toLocaleString()} shops ordered by menu-wide value · ${valueLeadTotal.toLocaleString()} below-average price lead${valueLeadTotal === 1 ? '' : 's'} across visible menus.`;
  } else {
    const label = browseModeLabel(mode).toLowerCase();
    els.shopsSummary.textContent = `${visibleRows.length.toLocaleString()} shops ordered by ${label}. Use Inspect to open a full menu without losing the list.`;
  }
  if (!visibleRows.length) {
    els.shopList.innerHTML = '<div class="empty">No shops match these filters. Try clearing a filter or searching a different coffeeshop.</div>';
    return;
  }

  els.shopList.innerHTML = visibleRows.map(row => {
    const shopSelected = isShopSelected(row.shopId);
    const changedLabel = row.menuUpdatedAt ? formatDate(row.menuUpdatedAt) : 'Unknown';
    const freshness = row.menuUpdatedAt ? freshnessBadgeInfo(row.menuUpdatedAt) : null;
    const sampleStrains = row.offerings
      .map(item => item.strain_name || '')
      .filter(Boolean)
      .slice(0, 4);
    const extraCount = Math.max(0, row.uniqueStrains - sampleStrains.length);
    const menuPreview = sampleStrains.length
      ? `${sampleStrains.join(', ')}${extraCount ? ` +${extraCount}` : ''}`
      : 'Menu details available';
    const searchPreview = `${row.uniqueStrains.toLocaleString()} known strain${row.uniqueStrains === 1 ? '' : 's'}`;
    const priceLabel = row.cheapest == null ? 'Price unknown' : `Lowest ${money(row.cheapest)}`;
    const menuValueLabel = row.medianPrice == null
      ? (row.averagePrice == null ? 'Menu value unclear' : `Avg ${money(row.averagePrice)}`)
      : `Median ${money(row.medianPrice)}${row.averagePrice == null ? '' : ` · Avg ${money(row.averagePrice)}`}`;
    const mapUrl = buildShopMapLink(row.shopId);
    return `
      <article class="fresh-shop-row${shopSelected ? ' is-selected' : ''}">
        <div class="fresh-shop-main">
          <a class="shop-logo-map-link" href="${escapeHtmlAttr(mapUrl)}" aria-label="View ${escapeHtmlAttr(row.shopName)} on map">
            ${getShopLogoHtml(row.shopKey, row.shopName)}
          </a>
          <div class="fresh-shop-copy">
            <strong class="fresh-shop-name">${escapeHtml(row.shopName)}</strong>
            <span class="fresh-shop-meta">${escapeHtml(row.city || 'City unknown')} · ${row.uniqueStrains.toLocaleString()} strain${row.uniqueStrains === 1 ? '' : 's'} · ${escapeHtml(priceLabel)}</span>
          </div>
        </div>
        <div class="fresh-shop-date">
          <strong>${escapeHtml(changedLabel)}</strong>
          <span>${freshness ? escapeHtml(freshness.label) : 'Change date unknown'}</span>
        </div>
        <div class="fresh-shop-menu-preview">
          <strong>${escapeHtml(searchQuery ? searchPreview : (mode === 'value' ? menuValueLabel : menuPreview))}</strong>
          <span>${searchQuery ? 'Inspect opens the full known menu' : (row.belowAverageDeals.length ? `${row.belowAverageDeals.length} value lead${row.belowAverageDeals.length === 1 ? '' : 's'}` : (mode === 'value' ? 'Mixed or average-value menu' : 'Known menu snapshot'))}</span>
        </div>
        <div class="fresh-shop-actions">
          <button type="button" data-open-shop-menu="${escapeHtmlAttr(row.shopId)}">Inspect</button>
          <button type="button" data-toggle-map-shop="${escapeHtmlAttr(row.shopId)}" class="${shopSelected ? 'is-active' : ''}">${shopSelected ? 'Remove saved shop' : 'Save shop'}</button>
          <a href="${escapeHtmlAttr(mapUrl)}">Map</a>
        </div>
      </article>
    `;
  }).join('');
}

function renderShops(filteredOfferings) {
  const selected = new Set(state.selected);
  const filters = currentFilters();
  const grouped = new Map();
  filteredOfferings.forEach(item => {
    const shopId = String(item.shop_id || `${item.shop_name}-${item.shop_city}`);
    const shopMeta = state.shopById.get(String(item.shop_id)) || {};
    if (!grouped.has(shopId)) {
      grouped.set(shopId, {
        shopId,
        shopName: item.shop_name || 'Unknown shop',
        city: item.shop_city || 'Unknown city',
        shopKey: item.shop_key || shopMeta.shop_key || '',
        shopUrl: shopMeta.shop_url || '',
        offerings: []
      });
    }
    grouped.get(shopId).offerings.push(item);
  });

  const shopSearchQuery = universalSearchIntent(els.search.value) === 'shops'
    ? normaliseSearchText(els.search.value)
    : '';
  const rows = Array.from(grouped.values()).map(row => {
    const selectedMatches = row.offerings.filter(item => selected.has(item.strain_name_normalised || normalise(item.strain_name)));
    const prices = row.offerings.map(item => Number(item.price_amount)).filter(Number.isFinite);
    const belowAverageDeals = belowAverageDealsForOfferings(row.offerings);
    const enrichedRow = {
      ...row,
      selectedMatches,
      belowAverageDeals,
      bestDeal: belowAverageDeals[0] || null,
      cheapest: prices.length ? Math.min(...prices) : null,
      medianPrice: median(prices),
      averagePrice: average(prices),
      bestDealPercent: belowAverageDeals[0] ? belowAverageDeals[0].percentBelow : 0,
      uniqueStrains: new Set(row.offerings.map(item => item.strain_name_normalised || normalise(item.strain_name))).size,
      menuUpdatedAt: row.offerings
        .map(item => displayListingDateValue(item))
        .filter(Boolean)
        .sort()
        .at(-1) || ''
    };
    enrichedRow.valueScore = shopValueScore(enrichedRow);
    return enrichedRow;
  }).sort((a, b) => shopSearchQuery
    ? compareShopRowsForSearch(a, b, shopSearchQuery, filters)
    : compareShopRowsForSort(a, b, filters.sort, filters.browseMode));

  const shopScanMode = state.view === 'shops';
  if (els.shopList) els.shopList.classList.toggle('is-fresh-scan', shopScanMode);
  if (shopScanMode) {
    renderFreshShopRows(rows, filters.browseMode, {
      searchQuery: shopSearchQuery,
      searchLabel: els.search.value
    });
    return;
  }

  const dealTotal = rows.reduce((sum, row) => sum + row.belowAverageDeals.length, 0);
  const sortSummary = filters.sort
    ? sortModeSummary(filters.sort)
    : `${browseModeIsFilter(filters.browseMode) ? 'filtered and ordered by' : 'ordered by'} ${browseModeLabel(filters.browseMode).toLowerCase()}`;
  const wantedNote = selected.size ? ' Saved-strain matches are highlighted.' : '';
  els.shopsSummary.textContent = `${rows.length.toLocaleString()} shops match the current filters, ${sortSummary} · ${dealTotal.toLocaleString()} below-average price${dealTotal === 1 ? '' : 's'}.${wantedNote}`;
  if (!rows.length) {
    els.shopList.innerHTML = '<div class="empty">No shops match these filters. Try clearing a filter, widening the price range, or searching a different area.</div>';
    return;
  }
  els.shopList.innerHTML = rows.slice(0, 180).map(row => {
    const sortedOfferings = row.offerings
      .slice()
      .sort((a, b) => {
        const aKey = a.strain_name_normalised || normalise(a.strain_name);
        const bKey = b.strain_name_normalised || normalise(b.strain_name);
        const selectedDiff = Number(selected.has(bKey)) - Number(selected.has(aKey));
        if (selectedDiff !== 0) return selectedDiff;
        return compareStrainName(a, b);
      });
    const renderTags = items => items.map(item => {
        const key = item.strain_name_normalised || normalise(item.strain_name);
        const selectedStrain = selected.has(key);
        const grower = String(item.grower || '').trim();
        const notes = String(item.notes || '').trim();
        const price = Number.isFinite(Number(item.price_amount))
          ? packageListingPriceLabel(item)
          : '';
        const inlinePrice = price ? ` · ${price}` : '';
        if (!grower && !notes) {
          return (
            `<button type="button" class="chip strain-menu-chip type-${escapeHtml(item.base_type || '')}${selectedStrain ? ' is-active' : ''}" data-select-strain="${escapeHtml(key)}">` +
              `${escapeHtml(item.strain_name)}${escapeHtml(inlinePrice)}` +
            `</button>`
          );
        }
        const freshness = freshnessBadgeInfo(displayListingDateValue(item));
        const meta = [
          grower ? `Grower: ${grower}` : '',
          Number(item.is_legal) === 1 ? 'Legal project' : '',
          notes ? `Note: ${notes}` : '',
          price,
          freshness ? freshness.label : '',
          price ? '' : 'Price unknown'
        ].filter(Boolean);
        return (
          `<button type="button" class="chip strain-menu-chip has-detail type-${escapeHtml(item.base_type || '')}${selectedStrain ? ' is-active' : ''}" data-select-strain="${escapeHtml(key)}">` +
            `<span class="strain-chip-name">${escapeHtml(item.strain_name)}</span>` +
            `${meta.length ? `<span class="strain-chip-meta">${escapeHtml(meta.join(' · '))}</span>` : ''}` +
          `</button>`
        );
      })
      .join('');
    const previewItems = sortedOfferings.slice(0, 12);
    const extraItems = sortedOfferings.slice(12);
    const previewTags = renderTags(previewItems);
    const extraTags = renderTags(extraItems);
    const href = row.shopUrl || `/shop/${encodeURIComponent(row.shopId)}/digitised`;
    const label = row.shopUrl ? 'Source' : 'Menu';
    const shopSelected = isShopSelected(row.shopId);
    const matchLabel = selected.size
      ? `${row.selectedMatches.length}/${selected.size} saved`
      : `${row.uniqueStrains} strains`;
    const showPerShopCheckDate = Boolean(row.menuUpdatedAt);
    const updatedLabel = showPerShopCheckDate ? formatDate(row.menuUpdatedAt) : '';
    const freshness = showPerShopCheckDate ? freshnessBadgeInfo(row.menuUpdatedAt) : null;
    const recommendation = selected.size && row.selectedMatches.length
      ? `Recommended because: ${row.selectedMatches.length} saved-strain match${row.selectedMatches.length === 1 ? '' : 'es'} in this shop menu.`
      : row.belowAverageDeals.length
        ? 'Recommended because: good-value lead where price is known.'
        : row.cheapest == null
          ? 'Recommended because: worth checking, but price data is incomplete.'
          : 'Recommended because: useful shop menu with visible Price signals.';
    const dealTags = row.belowAverageDeals.slice(0, 6).map(deal => {
      const price = money(deal.price, deal.item.price_currency, deal.item.price_unit);
      const averageLabel = money(deal.averagePrice, deal.item.price_currency, deal.item.price_unit);
      return (
        `<button type="button" class="chip shop-deal-chip type-${escapeHtml(deal.item.base_type || '')}" data-select-strain="${escapeHtml(deal.key)}">` +
          `<strong>${escapeHtml(deal.item.strain_name)}</strong>` +
          `<span>${escapeHtml(price)} · ${deal.percentBelow}% below avg ${escapeHtml(averageLabel)}</span>` +
        `</button>`
      );
    }).join('');
    const hiddenDealCount = Math.max(0, row.belowAverageDeals.length - 6);
    const mapUrl = buildShopMapLink(row.shopId);
    return `
      <article class="shop-card${shopSelected ? ' is-selected' : ''}" data-shop-value-score="${escapeHtmlAttr(row.valueScore.toFixed(4))}" data-shop-strain-count="${escapeHtmlAttr(row.uniqueStrains)}">
        <div class="shop-card-head">
          <div class="shop-card-main">
            <a class="shop-logo-map-link" href="${escapeHtmlAttr(mapUrl)}" aria-label="View ${escapeHtmlAttr(row.shopName)} on map">
              ${getShopLogoHtml(row.shopKey, row.shopName)}
            </a>
            <div class="shop-card-copy">
              <strong>${escapeHtml(row.shopName)}</strong>
              <div class="shop-card-meta">${escapeHtml(row.city)}${updatedLabel ? ` · Menu changed ${escapeHtml(updatedLabel).replace(/^checked\s+/, '')}` : ''}</div>
              <div class="shop-card-metrics">
                <span class="chip">${escapeHtml(matchLabel)}</span>
                <span class="chip ${row.cheapest == null ? 'is-price-unknown' : ''}">${row.cheapest == null ? 'Price unknown' : `Lowest ${money(row.cheapest)}`}</span>
                ${freshness ? `<span class="chip ${freshness.className}">${escapeHtml(freshness.label)}</span>` : ''}
                <span class="chip ${row.cheapest == null ? 'is-price-unknown' : 'deal-chip'}">${row.cheapest == null ? 'Price unknown' : 'Price known'}</span>
                <span class="chip">${row.selectedMatches.length ? 'Strong match' : 'Possible match'}</span>
                <span class="chip is-old-intel">Check before travelling</span>
                ${row.averagePrice == null ? '' : `<span class="chip">Avg ${money(row.averagePrice)}</span>`}
                ${row.belowAverageDeals.length ? `<span class="chip deal-chip">Best ${row.bestDealPercent}% below avg</span>` : ''}
              </div>
              <p class="shop-card-reason">${escapeHtml(recommendation)}</p>
            </div>
          </div>
          <div class="shop-card-actions">
            <button type="button" data-toggle-map-shop="${escapeHtml(row.shopId)}" class="${shopSelected ? 'is-active' : ''}">${shopSelected ? 'Remove saved shop' : 'Save shop'}</button>
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>
          </div>
        </div>
        ${row.belowAverageDeals.length ? `
          <div class="shop-deals">
            <div class="shop-deals-head">
              <span>Below average</span>
              <span>${row.bestDealPercent}% best</span>
            </div>
            <div class="availability-tags">${dealTags}</div>
            ${hiddenDealCount ? `<div class="muted">${hiddenDealCount.toLocaleString()} more below-average strain${hiddenDealCount === 1 ? '' : 's'} in this visible menu.</div>` : ''}
          </div>
        ` : ''}
        <div class="shop-menu">
          <div class="shop-menu-label">${selected.size ? 'Relevant menu' : 'Menu preview'}</div>
          <div class="availability-tags">${previewTags}</div>
          ${extraItems.length ? `
            <details class="shop-menu-more">
              <summary>Show ${extraItems.length} more strain${extraItems.length === 1 ? '' : 's'}</summary>
              <div class="availability-tags">${extraTags}</div>
            </details>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function setView(view) {
  state.view = view === 'shops' ? 'shops' : view === 'compare' ? 'compare' : 'strains';
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('strains-view').hidden = state.view !== 'strains';
  document.getElementById('compare-view').hidden = state.view !== 'compare';
  document.getElementById('shops-view').hidden = state.view !== 'shops';
  syncModeSearchCopy();
  if (state.offerings.length && state.strainStats.length) {
    const filteredStats = getFilteredStats();
    updateResultToolbar(getFilteredOfferings(filteredStats), filteredStats);
  }
}

function syncModeSearchCopy() {
  if (els.searchLabel) els.searchLabel.textContent = 'Search strains, growers, coffeeshops, towns, and areas';
  if (els.search) {
    els.search.placeholder = 'Amnesia Haze, Karma, De Wedren, Nijmegen…';
  }
  if (els.searchChipRow) {
    const chips = ['Gelato', 'Amnesia Haze', 'Karma', 'Family First', 'Legal weed', 'Terps Army'];
    els.searchChipRow.innerHTML = chips
      .map(label => `<button type="button" data-search-chip="${escapeHtmlAttr(label)}">${escapeHtml(label)}</button>`)
      .join('');
  }
}

function render() {
  const restoreFocus = preserveActionFocus();
  renderContents();
  restoreFocus();
}

function renderContents() {
  const filteredStats = getFilteredStats();
  const filteredOfferings = getFilteredOfferings(filteredStats);
  const shopSearchOfferings = universalSearchIntent(els.search.value) === 'shops'
    ? getShopSearchOfferings()
    : filteredOfferings;
  const familySourceStats = getFilteredStats({ ignoreFamily: true });
  updateResultToolbar(filteredOfferings, filteredStats);
  renderBrowseControls(familySourceStats, filteredStats);
  renderMetrics(filteredOfferings, filteredStats);
  renderSelected();
  renderSelectedShops();
  if (state.view === 'strains') {
    renderStrains(filteredStats);
  } else if (els.strainGrid) {
    els.strainGrid.replaceChildren();
  }
  if (state.view === 'compare') {
    renderCompare();
  } else if (els.comparisonGrid) {
    els.comparisonGrid.replaceChildren();
  }
  if (state.view === 'shops') {
    renderShopMenuBrowser();
    renderShops(shopSearchOfferings);
  } else {
    if (els.shopMenuBrowser) els.shopMenuBrowser.replaceChildren();
    if (els.shopList) els.shopList.replaceChildren();
  }
  renderDiscovery();
  renderDetail();
  saveDatabaseNavigationState();
}

function renderAfterFilterChange() {
  resetStrainWindow();
  render();
}

function isMobileResultsViewport() {
  return window.matchMedia && window.matchMedia('(max-width: 680px)').matches;
}

function activeResultsElement() {
  if (state.view === 'shops') return document.getElementById('shops-view');
  if (state.view === 'compare') return document.getElementById('compare-view');
  return document.getElementById('strains-view');
}

function activeResultsAnchorElement() {
  if (state.view === 'shops') {
    if (state.shopMenuExpanded) {
      return document.querySelector('#shop-menu-browser .shop-menu-hero, #shop-menu-browser .menu-listing-card, #shop-list .fresh-shop-row, #shop-list .shop-card, #shops-view .section-head') || activeResultsElement();
    }
    return document.querySelector('#shop-list .fresh-shop-row, #shop-list .shop-card, #shops-view .section-head') || activeResultsElement();
  }
  if (state.view === 'compare') {
    return document.querySelector('#common-shop-board .common-shop-card, #comparison-grid .comparison-card, #compare-view .section-head') || activeResultsElement();
  }
  return document.querySelector('#price-guide-panel .listing-card, #strain-grid .fresh-shop-row, #strain-grid .strain-card, #strains-view .section-head') || activeResultsElement();
}

let mobileResultsScrollTimer = 0;
function scheduleMobileResultsScroll(options = {}) {
  if (els.discoveryResults) return;
  if (!isMobileResultsViewport()) return;
  const source = options.source || '';
  if (source === 'search' && normaliseSearchText(els.search.value).length < 2) return;
  window.clearTimeout(mobileResultsScrollTimer);
  mobileResultsScrollTimer = window.setTimeout(() => {
    const target = activeResultsAnchorElement();
    if (!target || target.hidden) return;
    const searchPanel = document.querySelector('.database-search-panel');
    const searchHeight = searchPanel ? Math.ceil(searchPanel.getBoundingClientRect().height) : 0;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - searchHeight - 6);
    window.scrollTo({ top, behavior: options.instant ? 'auto' : 'smooth' });
  }, options.delay ?? 180);
}

function applyInitialUrlState() {
  const params = new URLSearchParams(window.location.search || '');
  const strain = (params.get('strain') || params.get('search') || '').trim();
  const detailType = (params.get('detail') || '').trim();
  const mode = (params.get('mode') || '').trim();
  const browserType = (params.get('browser') || '').trim();
  const shopId = (params.get('shop_id') || params.get('shopId') || '').trim();
  const shopQuery = (params.get('shop') || params.get('shop_name') || '').trim();
  state.detail = null;
  state.discoveryBrowser = browserType === 'shops' || browserType === 'strains' ? browserType : '';
  state.discoveryBrowserLimit = 48;
  state.detailReturnStack = [];
  state.detailReturnSearch = '';
  state.detailVisibleLimit = DETAIL_LISTING_STEP;
  state.activeShopId = '';
  state.shopMenuExpanded = false;
  state.view = 'strains';
  els.search.value = strain || shopQuery;
  if (els.shopBrowserSearch) els.shopBrowserSearch.value = '';
  if (strain) {
    state.browseMode = 'value';
  }
  if (mode === 'strain' || mode === 'strains') {
    state.view = 'strains';
  }
  if (mode === 'shop' || mode === 'shops' || mode === 'menu') {
    state.view = 'shops';
  }
  if (shopId) {
    state.activeShopId = shopId;
    state.shopMenuExpanded = true;
    state.view = 'shops';
    const meta = getShopMeta(shopId);
    if (meta && meta.name) {
      if (els.shopBrowserSearch) els.shopBrowserSearch.value = meta.name;
      if (!strain && !shopQuery) els.search.value = meta.name;
    }
  } else if (shopQuery) {
    state.view = 'shops';
    if (els.shopBrowserSearch) els.shopBrowserSearch.value = shopQuery;
  }
  const hasMode = mode && els.browseModeGrid && Array.from(els.browseModeGrid.querySelectorAll('[data-browse-mode]'))
    .some(button => button.dataset.browseMode === mode);
  if (hasMode) {
    state.browseMode = mode;
  }
  if (params.get('view')) {
    state.view = params.get('view');
  }
  if (strain && !mode && !params.get('view')) {
    syncUniversalSearchMode();
  }
  if (detailType === 'strain' && strain) {
    const stat = getStatByKey(strain);
    state.detail = { type: 'strain', key: stat ? stat.key : normalise(strain) };
    state.view = 'strains';
  }
  if (detailType === 'shop' && shopId) {
    state.detail = { type: 'shop', shopId };
    state.view = 'shops';
  }
}

let databaseLoading = false;

async function init() {
  if (databaseLoading) return;
  databaseLoading = true;
  els.status.classList.add('is-visible');
  els.status.textContent = 'Loading nationwide menu data...';
  els.discoverySuggestions.hidden = true;
  try {
    const [offerings, shops, manifest, imageMapCsv, locationCatalog] = await Promise.all([
      loadJson('database/active_offerings.json'),
      loadJson('database/shops.json').catch(() => []),
      loadJson('database/manifest.json').catch(() => null),
      loadText('database/strain_image_map.csv').catch(() => ''),
      loadLocationCatalog()
    ]);
    state.snapshotTime = parseTime(manifest && manifest.exported_at_utc) || Date.now();
    if (els.dataNote) {
      const snapshotDate = formatDate(manifest && manifest.exported_at_utc);
      els.dataNote.textContent = `${snapshotDate ? `Data snapshot ${snapshotDate}. ` : ''}Menu dates describe source menus or observations. Prices and availability may have changed.`;
    }
    const catalogCityLabels = new Map(
      (Array.isArray(locationCatalog && locationCatalog.datasets) ? locationCatalog.datasets : [])
        .map(dataset => [dataset.slug, dataset.label])
    );
    const canonicalCatalogCity = value => (
      catalogCityLabels.get(cityScopeSlug(value)) || String(value || '').trim()
    );
    const loadedOfferings = (Array.isArray(offerings) ? offerings : []).map(item => ({
      ...item,
      shop_city: canonicalCatalogCity(item && item.shop_city)
    }));
    state.shops = (Array.isArray(shops) ? shops : []).map(shop => ({
      ...shop,
      city: canonicalCatalogCity(shop && (shop.city || shop.shop_city)),
      shop_city: canonicalCatalogCity(shop && (shop.shop_city || shop.city))
    }));
    state.shopById = new Map(state.shops.map(shop => [String(shop.shop_id), shop]));
    state.closedShopSourceTokens = buildClosedShopSourceTokens(state.shops);
    state.unavailableShopIds = buildUnavailableShopIds(state.shops);
    state.allOfferings = loadedOfferings.filter(isBrowsableOffering);
    state.locationDatasets = Array.isArray(locationCatalog && locationCatalog.datasets)
      ? locationCatalog.datasets
      : [];
    const requestedCity = new URLSearchParams(window.location.search || '').get('city') || '';
    const requestedCitySlug = cityScopeSlug(requestedCity);
    const requestedDataset = requestedCitySlug
      ? state.locationDatasets.find(dataset => dataset.slug === requestedCitySlug)
      : null;
    const savedDataset = pickDefaultLocationDataset(state.locationDatasets);
    applyLocationDatasetScope((requestedDataset || savedDataset)?.path || '', { persist: false });
    syncSearchScopeControls();
    state.listingCheckBatch = buildListingCheckBatchSignal(state.offerings);
    state.hiddenUnavailableListingCount = Math.max(0, loadedOfferings.length - state.allOfferings.length);
    state.strainImageByKey = buildStrainImageMap(imageMapCsv);
    state.shopLogoByKey = locationCatalog && locationCatalog.shopLogoByKey instanceof Map
      ? locationCatalog.shopLogoByKey
      : new Map();
    state.shopCoordinatesByKey = locationCatalog && locationCatalog.shopCoordinatesByKey instanceof Map
      ? locationCatalog.shopCoordinatesByKey
      : new Map();
    state.shopCoordinatesByNameCity = locationCatalog && locationCatalog.shopCoordinatesByNameCity instanceof Map
      ? locationCatalog.shopCoordinatesByNameCity
      : new Map();
    buildStats();
    loadSharedShelf();
    state.selectedShopIds = sanitizeShopIds(loadSelectedShopIds());
    saveSharedShelf();
    saveSelectedShopIds();
    populateFilters();
    setupPriceBand();
    const exported = manifest && manifest.exported_at_utc
      ? ` Snapshot ${new Date(manifest.exported_at_utc).toLocaleString()}.`
      : '';
    const activeDataset = activeLocationDataset();
    const datasetLabel = activeDataset?.label || 'the Netherlands';
    const scopedLoadedListingCount = activeDataset
      ? loadedOfferings.filter(item => offeringBelongsToDataset(item, activeDataset)).length
      : loadedOfferings.length;
    const scopedUnavailableListingCount = Math.max(0, scopedLoadedListingCount - state.offerings.length);
    const hidden = scopedUnavailableListingCount
      ? (activeDataset
          ? ` Excluded ${scopedUnavailableListingCount.toLocaleString()} unavailable ${datasetLabel} listing${scopedUnavailableListingCount === 1 ? '' : 's'}.`
          : ` Excluded ${scopedUnavailableListingCount.toLocaleString()} unavailable listing${scopedUnavailableListingCount === 1 ? '' : 's'} nationwide.`)
      : '';
    els.status.textContent = `Ready: ${state.offerings.length.toLocaleString()} current menu listings across ${state.strainStats.length.toLocaleString()} strains in ${datasetLabel}.${exported}${hidden}${listingCheckBatchNote()}`;
    applyInitialUrlState();
    setView(state.view);
    render();
    els.status.classList.remove('is-visible');
  } catch (err) {
    els.status.classList.add('is-visible');
    els.status.innerHTML = '<span class="error">Nationwide menu data could not be loaded.</span> Check your connection and try again. <button type="button" data-retry-database>Try again</button>';
    els.metricAverage.textContent = 'Unavailable';
    els.metricMostStocked.textContent = 'Unavailable';
    els.metricRare.textContent = 'Unavailable';
    els.metricShops.textContent = 'Unavailable';
    if (els.resultContext) els.resultContext.textContent = 'Nationwide menu data could not be loaded. Try refreshing the page.';
  } finally {
    databaseLoading = false;
  }
}

els.status.addEventListener('click', event => {
  if (event.target.closest('[data-retry-database]')) init();
});

['input', 'change'].forEach(eventName => {
  els.search.addEventListener(eventName, () => {
    syncUniversalSearchMode();
    renderAfterFilterChange();
    scheduleMobileResultsScroll({ source: 'search', delay: eventName === 'input' ? 520 : 80 });
  });
});
els.search.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const query = els.search.value;
  if (universalSearchIntent(query) !== 'shops') return;
  event.preventDefault();
  openShopSearchResults();
  scheduleMobileResultsScroll({ source: 'search', delay: 80 });
});
if (els.searchShopsShortcut) {
  els.searchShopsShortcut.addEventListener('click', () => {
    openShopSearchResults();
    els.search.focus({ preventScroll: true });
  });
}

if (els.searchChipRow) {
  els.searchChipRow.addEventListener('click', event => {
    const button = event.target.closest('[data-search-chip]');
    if (!button) return;
    const value = button.dataset.searchChip || '';
    els.search.value = value;
    syncUniversalSearchMode();
    resetStrainWindow();
    render();
    scheduleMobileResultsScroll({ source: 'chip', delay: 80 });
  });
}
if (els.searchCityScope) {
  els.searchCityScope.addEventListener('change', () => {
    setSearchScope(els.searchCityScope.value);
    scheduleMobileResultsScroll({ source: 'filter' });
  });
}
if (els.locationDataset) {
  els.locationDataset.addEventListener('change', () => {
    setSearchScope(els.locationDataset.value);
    scheduleMobileResultsScroll({ source: 'filter' });
  });
}
[els.type, els.legal, els.cali, els.sort].forEach(el => el.addEventListener('change', () => {
  renderAfterFilterChange();
  scheduleMobileResultsScroll({ source: 'filter' });
}));
[els.priceMin, els.priceMax].forEach(el => el.addEventListener('input', () => {
  renderAfterFilterChange();
  scheduleMobileResultsScroll({ source: 'filter', delay: 320 });
}));

if (els.browseModeGrid) {
  els.browseModeGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-browse-mode]');
    if (!button) return;
    const nextMode = button.dataset.browseMode;
    const explicitSortWasActive = Boolean(els.sort.value);
    if (nextMode === state.browseMode && !explicitSortWasActive) return;
    state.browseMode = nextMode;
    els.sort.value = '';
    resetStrainWindow();
    render();
    scheduleMobileResultsScroll({ source: 'mode' });
  });
}

document.querySelector('.metrics')?.addEventListener('click', event => {
  const button = event.target.closest('[data-metric-browse-mode]');
  if (!button) return;
  state.browseMode = button.dataset.metricBrowseMode || 'value';
  els.sort.value = '';
  resetStrainWindow();
  render();
  scheduleMobileResultsScroll({ source: 'mode', delay: 80 });
});

if (els.familyFilterGrid) {
  els.familyFilterGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-family-filter]');
    if (!button) return;
    state.familyFilter = button.dataset.familyFilter || '';
    resetStrainWindow();
    render();
    scheduleMobileResultsScroll({ source: 'filter' });
  });
}

if (els.loadMoreStrains) {
  els.loadMoreStrains.addEventListener('click', () => {
    state.visibleStrainLimit += STRAIN_LIMIT_STEP;
    render();
  });
}

document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    setView(button.dataset.view);
    if (state.view === 'shops' && els.shopBrowserSearch && els.search.value) {
      els.shopBrowserSearch.value = els.search.value;
      state.activeShopId = '';
      state.shopMenuExpanded = false;
    }
    render();
    scheduleMobileResultsScroll({ source: 'view' });
  });
});

if (els.priceGuidePanel) {
  els.priceGuidePanel.addEventListener('click', event => {
    const strainDetail = event.target.closest('[data-open-strain-detail]');
    if (strainDetail) {
      openStrainDetail(strainDetail.dataset.openStrainDetail);
      return;
    }
    const focusShop = event.target.closest('[data-focus-shop-menu]');
    if (focusShop) {
      openShopDetail(focusShop.dataset.focusShopMenu);
      return;
    }

    const toggleShopButton = event.target.closest('[data-toggle-map-shop]');
    if (toggleShopButton) {
      toggleSelectedShop(toggleShopButton.dataset.toggleMapShop);
      return;
    }

    const selectButton = event.target.closest('[data-select-strain]');
    if (selectButton) {
      toggleSelected(selectButton.dataset.selectStrain);
    }
  });
}

els.strainGrid.addEventListener('click', event => {
  const strainDetail = event.target.closest('[data-open-strain-detail]');
  if (strainDetail) {
    openStrainDetail(strainDetail.dataset.openStrainDetail);
    return;
  }
  const toggleShopButton = event.target.closest('[data-toggle-map-shop]');
  if (toggleShopButton) {
    toggleSelectedShop(toggleShopButton.dataset.toggleMapShop);
    return;
  }

  const selectButton = event.target.closest('[data-select-strain]');
  if (selectButton) {
    toggleSelected(selectButton.dataset.selectStrain);
    return;
  }
  const shopButton = event.target.closest('[data-focus-shops]');
  if (shopButton) {
    if (!isSelected(shopButton.dataset.focusShops)) toggleSelected(shopButton.dataset.focusShops);
    setView('shops');
    document.getElementById('shops-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const similarLink = event.target.closest('[data-similar-strain]');
  if (similarLink) {
    event.preventDefault();
    els.search.value = similarLink.dataset.similarStrain || '';
    state.browseMode = 'value';
    resetStrainWindow();
    render();
    els.quickAnswer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const mapButton = event.target.closest('[data-map-shop]');
  if (mapButton) {
    goToMapShopIds([mapButton.dataset.mapShop], mapContextFromElement(mapButton));
    return;
  }

  if (event.target.closest('a, button')) return;

  const card = event.target.closest('[data-strain-card]');
  if (card) {
    openStrainDetail(card.dataset.strainCard);
  }
});

if (els.quickAnswer) {
  els.quickAnswer.addEventListener('click', event => {
    const strainDetail = event.target.closest('[data-open-strain-detail]');
    if (strainDetail) {
      openStrainDetail(strainDetail.dataset.openStrainDetail);
      return;
    }
    const toggleShopButton = event.target.closest('[data-toggle-map-shop]');
    if (toggleShopButton) {
      toggleSelectedShop(toggleShopButton.dataset.toggleMapShop);
      return;
    }

    const mapShop = event.target.closest('[data-map-shop]');
    if (mapShop) {
      event.preventDefault();
      goToMapShopIds([mapShop.dataset.mapShop], mapContextFromElement(mapShop));
      return;
    }

    const mapStrain = event.target.closest('[data-map-strain-shops]');
    if (mapStrain) {
      event.preventDefault();
      goToMapShopIds((mapStrain.dataset.mapStrainShops || '').split(','), mapContextFromElement(mapStrain));
      return;
    }

    const selectButton = event.target.closest('[data-select-strain]');
    if (selectButton) {
      toggleSelected(selectButton.dataset.selectStrain);
      return;
    }

    const shopButton = event.target.closest('[data-focus-shops]');
    if (shopButton) {
      if (!isSelected(shopButton.dataset.focusShops)) toggleSelected(shopButton.dataset.focusShops);
      setView('shops');
      document.getElementById('shops-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const similarLink = event.target.closest('[data-similar-strain]');
    if (similarLink) {
      event.preventDefault();
      els.search.value = similarLink.dataset.similarStrain || '';
      state.browseMode = 'value';
      resetStrainWindow();
      render();
      els.quickAnswer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

els.strainGrid.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target.closest('a, button')) return;
  const card = event.target.closest('[data-strain-card]');
  if (!card) return;
  event.preventDefault();
  openStrainDetail(card.dataset.strainCard);
});

els.selectedList.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-selected]');
  if (!button) return;
  state.selected = state.selected.filter(key => key !== button.dataset.removeSelected);
  if (state.routePlanByStrain && state.routePlanByStrain[button.dataset.removeSelected]) {
    delete state.routePlanByStrain[button.dataset.removeSelected];
    syncSelectedShopsFromRoutePlan(selectedStats());
  }
  saveSharedShelf();
  render();
});

els.selectedShopList.addEventListener('click', event => {
  const button = event.target.closest('[data-toggle-map-shop]');
  if (!button) return;
  toggleSelectedShop(button.dataset.toggleMapShop);
});

els.commonShopBoard.addEventListener('click', event => {
  const selectCommonButton = event.target.closest('[data-select-common-shops]');
  if (selectCommonButton) {
    setSelectedShops(getCommonShopRows(selectedStats()).map(row => row.shopId));
    return;
  }

  const toggleButton = event.target.closest('[data-toggle-map-shop]');
  if (toggleButton) {
    toggleSelectedShop(toggleButton.dataset.toggleMapShop);
    return;
  }

  if (event.target.closest('a, button')) return;

  const card = event.target.closest('[data-common-shop-card]');
  if (card) {
    toggleSelectedShop(card.dataset.commonShopCard);
  }
});

els.commonShopBoard.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target.closest('a, button')) return;
  const card = event.target.closest('[data-common-shop-card]');
  if (!card) return;
  event.preventDefault();
  toggleSelectedShop(card.dataset.commonShopCard);
});

els.routePlanBoard.addEventListener('click', event => {
  const button = event.target.closest('[data-route-plan-strain][data-route-plan-shop]');
  if (!button) return;
  setRoutePlanShop(button.dataset.routePlanStrain, button.dataset.routePlanShop);
});

els.comparisonGrid.addEventListener('click', event => {
  const toggleButton = event.target.closest('[data-toggle-map-shop]');
  if (toggleButton) {
    toggleSelectedShop(toggleButton.dataset.toggleMapShop);
    return;
  }

  if (event.target.closest('a, button')) return;

  const card = event.target.closest('[data-partial-shop-card]');
  if (card) {
    toggleSelectedShop(card.dataset.partialShopCard);
  }
});

els.comparisonGrid.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target.closest('a, button')) return;
  const card = event.target.closest('[data-partial-shop-card]');
  if (!card) return;
  event.preventDefault();
  toggleSelectedShop(card.dataset.partialShopCard);
});

els.shopList.addEventListener('click', event => {
  const openShopButton = event.target.closest('[data-open-shop-menu]');
  if (openShopButton) {
    openShopDetail(openShopButton.dataset.openShopMenu);
    return;
  }

  const strainButton = event.target.closest('[data-select-strain]');
  if (strainButton) {
    toggleSelected(strainButton.dataset.selectStrain);
    return;
  }

  const button = event.target.closest('[data-toggle-map-shop]');
  if (!button) return;
  toggleSelectedShop(button.dataset.toggleMapShop);
});

if (els.shopBrowserSearch) {
  els.shopBrowserSearch.addEventListener('input', () => {
    state.activeShopId = '';
    state.shopMenuExpanded = false;
    if (els.search) els.search.value = els.shopBrowserSearch.value;
    render();
    scheduleMobileResultsScroll({ source: 'shop-search', delay: 260 });
  });
}

if (els.shopBrowserSelect) {
  els.shopBrowserSelect.addEventListener('change', () => {
    state.activeShopId = els.shopBrowserSelect.value;
    state.shopMenuExpanded = true;
    renderShopMenuBrowser();
    scheduleMobileResultsScroll({ source: 'shop-search', delay: 80 });
  });
}

if (els.shopMenuSort) {
  els.shopMenuSort.addEventListener('change', () => {
    state.shopMenuSort = els.shopMenuSort.value || 'name';
    state.shopMenuExpanded = true;
    renderShopMenuBrowser();
    scheduleMobileResultsScroll({ source: 'shop-search', delay: 80 });
  });
}

if (els.shopCategoryFilter) {
  els.shopCategoryFilter.addEventListener('change', () => {
    state.shopMenuCategory = els.shopCategoryFilter.value || '';
    state.shopMenuExpanded = true;
    renderShopMenuBrowser();
    scheduleMobileResultsScroll({ source: 'shop-search', delay: 80 });
  });
}

if (els.shopHideUnknownPrices) {
  els.shopHideUnknownPrices.addEventListener('change', () => {
    state.shopHideUnknownPrices = els.shopHideUnknownPrices.checked;
    state.shopMenuExpanded = true;
    renderShopMenuBrowser();
    scheduleMobileResultsScroll({ source: 'shop-search', delay: 80 });
  });
}

if (els.shopMenuBrowser) {
  els.shopMenuBrowser.addEventListener('click', event => {
    const strainDetail = event.target.closest('[data-open-strain-detail]');
    if (strainDetail) {
      openStrainDetail(strainDetail.dataset.openStrainDetail);
      return;
    }
    const button = event.target.closest('[data-toggle-map-shop]');
    if (!button) return;
    toggleSelectedShop(button.dataset.toggleMapShop);
  });
}

function handleDiscoveryClick(event) {
  const browserLink = event.target.closest('[data-open-discovery-browser]');
  if (browserLink) {
    event.preventDefault();
    openDiscoveryBrowser(browserLink.dataset.openDiscoveryBrowser);
    return;
  }
  const shopCard = event.target.closest('[data-discovery-shop]');
  if (shopCard) {
    openShopDetail(shopCard.dataset.discoveryShop);
    return;
  }
  const strainCard = event.target.closest('[data-discovery-strain]');
  if (strainCard) {
    openStrainDetail(strainCard.dataset.discoveryStrain);
    return;
  }
  const growerCard = event.target.closest('[data-discovery-grower]');
  if (growerCard && els.search) {
    els.search.value = growerCard.dataset.discoveryGrower || '';
    state.view = 'strains';
    resetStrainWindow();
    render();
  }
}

if (els.discoverySuggestionGroups) {
  els.discoverySuggestionGroups.addEventListener('click', handleDiscoveryClick);
}
if (els.discoveryResultGroups) {
  els.discoveryResultGroups.addEventListener('click', handleDiscoveryClick);
}
if (els.discoveryBrowserGrid) {
  els.discoveryBrowserGrid.addEventListener('click', handleDiscoveryClick);
}
if (els.discoveryBrowser) {
  els.discoveryBrowser.addEventListener('click', event => {
    const closeButton = event.target.closest('[data-close-discovery-browser]');
    if (closeButton) {
      closeDiscoveryBrowser();
      return;
    }
    const moreButton = event.target.closest('[data-load-more-discovery-browser]');
    if (moreButton) {
      const previousLimit = state.discoveryBrowserLimit;
      state.discoveryBrowserLimit += 48;
      renderDiscoveryBrowser();
      const firstNewCard = els.discoveryBrowserGrid.children[previousLimit];
      if (firstNewCard) firstNewCard.focus({ preventScroll: true });
    }
  });
}
if (els.discoveryBrowserSearch) {
  els.discoveryBrowserSearch.addEventListener('input', () => {
    state.discoveryBrowserLimit = 48;
    renderDiscoveryBrowser();
  });
}
if (els.discoveryBrowserSort) {
  els.discoveryBrowserSort.addEventListener('change', () => {
    const nextSort = els.discoveryBrowserSort.value || 'name';
    if (nextSort === 'distance' && !state.discoveryBrowserPosition) {
      requestDiscoveryBrowserPosition();
      return;
    }
    state.discoveryBrowserSort = nextSort;
    state.discoveryBrowserLimit = 48;
    setDiscoveryBrowserFilterStatus('');
    renderDiscoveryBrowser();
  });
}
[
  [els.discoveryBrowserFreshness, 'discoveryBrowserFreshness'],
  [els.discoveryBrowserPrice, 'discoveryBrowserPrice'],
  [els.discoveryBrowserType, 'discoveryBrowserType']
].forEach(([control, stateKey]) => {
  if (!control) return;
  control.addEventListener('change', () => {
    state[stateKey] = control.value || 'all';
    state.discoveryBrowserLimit = 48;
    setDiscoveryBrowserFilterStatus('');
    renderDiscoveryBrowser();
  });
});
if (els.discoveryBrowserFilterReset) {
  els.discoveryBrowserFilterReset.addEventListener('click', resetDiscoveryBrowserFilters);
}

if (els.detailView) {
  els.detailView.addEventListener('click', event => {
    const loadMoreButton = event.target.closest('[data-load-more-detail]');
    if (loadMoreButton) {
      const previousLimit = state.detailVisibleLimit;
      state.detailVisibleLimit += DETAIL_LISTING_STEP;
      renderDetail();
      const firstNewListing = els.detailView.querySelectorAll('.detail-listing-grid > .listing-card')[previousLimit];
      const firstAction = firstNewListing?.querySelector('a, button');
      if (firstAction) firstAction.focus({ preventScroll: true });
      return;
    }
    const closeButton = event.target.closest('[data-close-detail]');
    if (closeButton) {
      closeDetail();
      return;
    }
    const strainDetail = event.target.closest('[data-open-strain-detail]');
    if (strainDetail) {
      openStrainDetail(strainDetail.dataset.openStrainDetail);
      return;
    }
    const shopDetail = event.target.closest('[data-focus-shop-menu]');
    if (shopDetail) {
      openShopDetail(shopDetail.dataset.focusShopMenu);
      return;
    }
    const saveStrain = event.target.closest('[data-select-strain]');
    if (saveStrain) {
      toggleSelected(saveStrain.dataset.selectStrain);
      return;
    }
    const shortlistShop = event.target.closest('[data-toggle-map-shop]');
    if (shortlistShop) {
      toggleSelectedShop(shortlistShop.dataset.toggleMapShop);
    }
  });
}

els.clearSelected.addEventListener('click', () => {
  state.selected = [];
  state.routePlanByStrain = {};
  saveSharedShelf();
  render();
});

if (els.showWantedMap) {
  els.showWantedMap.addEventListener('click', goToMapWithWantedStrains);
}

els.showSelectedShopsMap.addEventListener('click', goToMapWithSelectedShops);

if (els.toolbarMapLink) {
  els.toolbarMapLink.addEventListener('click', () => {
    prepareMapHandoff();
  });
}

if (els.jumpFilters) {
  els.jumpFilters.addEventListener('click', () => {
    const filterPanel = document.querySelector('.side-panel');
    if (filterPanel) filterPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (els.jumpResults) {
  els.jumpResults.addEventListener('click', () => {
    const target = state.view === 'shops'
      ? document.getElementById('shops-view')
      : state.view === 'compare'
        ? document.getElementById('compare-view')
        : document.getElementById('strains-view');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (els.jumpTop) {
  els.jumpTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

els.clearSelectedShops.addEventListener('click', () => {
  setSelectedShops([]);
});

document.addEventListener('error', event => {
  if (event.target && event.target.matches && event.target.matches('.strain-art img')) {
    handleStrainImageError(event.target);
  }
  if (event.target && event.target.matches && event.target.matches('.shop-art img')) {
    handleShopLogoError(event.target);
  }
}, true);

window.addEventListener('storage', event => {
  if (!STRAIN_SHELF_STORAGE_KEYS.includes(event.key)) return;
  loadSharedShelf();
  render();
});

window.addEventListener('pageshow', () => {
  if (!state.strainStats.length) return;
  loadSharedShelf();
  render();
});

window.addEventListener('popstate', () => {
  if (!state.strainStats.length) return;
  applyInitialUrlState();
  setView(state.view);
  render();
});

init();
