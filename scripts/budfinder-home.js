(() => {
  // Keep release metadata here as the single source of truth. The homepage
  // script URL in index.html is cache-busted whenever these values change.
  // APP_UPDATED is the floor: "Site updated" shows the later of this date and
  // the Last-Modified time the server sends for index.html, so uploading new
  // pages updates it without editing this file.
  const APP_VERSION = '1.33';
  const APP_UPDATED = '2026-11-18';
  const SUMMARY_URL = 'database/home_summary.json';
  const MANIFEST_URL = 'database/manifest.json';
  const SEARCH_INDEX_URL = 'database/search_index.json';
  const UPDATES_URL = 'database/updates.json';
  const HOME_AREAS = ['De Pijp', 'Jordaan', 'Centrum', 'Oud-West', 'Oost', 'Noord'];

  const byId = id => document.getElementById(id);
  const summaryRegion = byId('amsterdam-insights');
  const searchForm = byId('home-search-form');
  const searchInput = byId('home-search-input');
  const searchResults = byId('home-search-results');
  const searchStatus = byId('home-search-status');
  const personalGreeting = byId('home-personal-greeting');
  let searchCandidates = [];
  let visibleSearchResults = [];
  let activeSearchResult = -1;
  let selectedSearchCandidate = null;
  let suggestionsRequested = false;
  let searchRenderTimer = 0;
  let updatesResizeObserver;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function displayName(value) {
    const acronyms = new Set(['ak', 'amg', 'bb', 'bm', 'cbd', 'g13', 'gsc', 'mac', 'og', 'rs11', 'thc']);
    return String(value || '')
      .trim()
      .split(/\s+/)
      .map(part => part
        .split('-')
        .map(piece => {
          const lower = piece.toLowerCase();
          if (acronyms.has(lower) || (/\d/.test(piece) && piece.length <= 5)) return piece.toUpperCase();
          return piece ? piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase() : piece;
        })
        .join('-'))
      .join(' ');
  }

  function displayCity(value) {
    return displayName(value).replace(/^Den Haag$/i, 'Den Haag');
  }

  function formatDate(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return 'Unavailable';
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function siteUpdatedDate() {
    const floor = new Date(`${APP_UPDATED}T00:00:00Z`);
    // Without a Last-Modified header, browsers report the current time, so a
    // value within a minute of now is treated as unknown.
    const modified = new Date(typeof document !== 'undefined' && document.lastModified ? document.lastModified : '');
    const known = !Number.isNaN(modified.getTime()) && Math.abs(Date.now() - modified.getTime()) > 60000;
    return known && modified > floor ? modified : floor;
  }

  function price(value) {
    if (value == null || String(value).trim() === '') return 'Unavailable';
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 'Unavailable';
    // Strip fractional zeroes only: €10 and €20 must keep their final digit.
    const amount = numeric.toFixed(2).replace(/\.?0+$/, '');
    return `€${amount}/g`;
  }

  function shuffled(items) {
    const copy = Array.isArray(items) ? items.slice() : [];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function candidateCity(candidate) {
    if (!candidate) return '';
    if (candidate.kind === 'shop') return candidate.city || '';
    if (candidate.kind === 'city') return candidate.name || '';
    if (candidate.kind === 'area') return 'Amsterdam';
    return 'Netherlands';
  }

  function openMapSearch(query, candidate = null) {
    const value = String(candidate && candidate.name || query || '').replace(/\s+/g, ' ').trim();
    const url = new URL('map.html', window.location.href);
    url.searchParams.set('source', 'home');
    if (value) url.searchParams.set('search', value);
    if (candidate) url.searchParams.set('search_kind', candidate.kind);
    const city = candidateCity(candidate) || (value ? 'Netherlands' : 'Amsterdam');
    url.searchParams.set('city', city);
    window.location.href = `${url.pathname.split('/').pop()}${url.search}`;
  }

  function openPriceSearch(query, candidate) {
    const explore = window.BudfinderExplore;
    if (!explore) {
      window.location.href = `database.html?${new URLSearchParams({ search: query })}`;
      return;
    }
    const context = { query };
    if (candidate?.kind === 'strain') context.strain = candidate.name;
    if (candidate?.kind === 'shop') context.shopId = candidate.shopId;
    if (candidate?.kind === 'city') {
      context.browser = 'shops';
      context.filters = { city: candidate.name };
    }
    window.location.href = explore.link('menus', context);
  }

  function selectSearchCandidate(candidate) {
    selectedSearchCandidate = candidate;
    searchInput.value = candidate.name;
    hideSearchResults();
    if (searchStatus) searchStatus.textContent = `${candidate.name} selected. Compare prices or show on map.`;
  }

  function applyPersonalisation() {
    const name = window.BudfinderPersonalisation
      ? window.BudfinderPersonalisation.userName()
      : '';
    if (personalGreeting) {
      personalGreeting.textContent = name
        ? `Welcome back, ${name}`
        : 'Dutch coffeeshop guide';
    }
  }

  function bindSearch() {
    if (searchForm) {
      searchForm.addEventListener('submit', event => {
        event.preventDefault();
        const query = (searchInput?.value || '').replace(/\s+/g, ' ').trim();
        if (!query) {
          searchInput.value = '';
          hideSearchResults();
          searchInput.focus();
          searchInput.reportValidity();
          return;
        }
        const selected = selectedSearchCandidate?.name === query ? selectedSearchCandidate : null;
        const candidate = selected || visibleSearchResults[activeSearchResult] || pickSubmitCandidate(query);
        if (event.submitter?.id === 'home-search-map') {
          openMapSearch(query, candidate);
        } else {
          const exact = candidate && window.BudfinderSearch?.normalise(candidate.name) === window.BudfinderSearch?.normalise(query);
          openPriceSearch(query, selected || (exact ? candidate : null));
        }
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        selectedSearchCandidate = null;
        // A selection belongs to the old query until new suggestions render.
        hideSearchResults();
        searchRenderTimer = window.setTimeout(() => renderSearchResults(searchInput.value), 60);
      });
      searchInput.addEventListener('focus', () => renderSearchResults(searchInput.value));
      searchInput.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Tab') {
          hideSearchResults();
          return;
        }
        if (event.key === 'Escape' && (searchRenderTimer || suggestionsRequested)) {
          event.preventDefault();
          hideSearchResults();
          return;
        }
        if (['ArrowDown', 'ArrowUp'].includes(event.key) && searchResults.hidden) {
          renderSearchResults(searchInput.value);
        }
        if (!visibleSearchResults.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
        if (event.key === 'Enter' && activeSearchResult < 0) return;
        event.preventDefault();
        if (event.key === 'Enter') {
          const candidate = visibleSearchResults[activeSearchResult];
          selectSearchCandidate(candidate);
          return;
        }
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        activeSearchResult = activeSearchResult < 0
          ? (direction === 1 ? 0 : visibleSearchResults.length - 1)
          : (activeSearchResult + direction + visibleSearchResults.length) % visibleSearchResults.length;
        syncActiveSearchResult();
      });
    }
    if (searchResults) {
      // Options use the combobox's keyboard focus; pointer selection still works.
      searchResults.addEventListener('mousedown', event => event.preventDefault());
      searchResults.addEventListener('click', event => {
        const button = event.target.closest('[data-search-result-index]');
        if (!button) return;
        const candidate = visibleSearchResults[Number(button.dataset.searchResultIndex)];
        if (candidate) selectSearchCandidate(candidate);
      });
    }
    if (searchForm) {
      searchForm.addEventListener('focusout', event => {
        if (!searchForm.contains(event.relatedTarget)) hideSearchResults();
      });
    }
    document.addEventListener('click', event => {
      if (searchForm && !searchForm.contains(event.target)) hideSearchResults();
    });
    document.querySelectorAll('[data-search]').forEach(button => {
      button.addEventListener('click', () => openMapSearch(button.getAttribute('data-search') || ''));
    });
  }

  function kindLabel(kind) {
    return {
      strain: 'Strain',
      grower: 'Grower',
      shop: 'Coffeeshop',
      city: 'Town',
      area: 'Area',
      legal: 'Legal project'
    }[kind] || 'Result';
  }

  function resultMeta(candidate) {
    const shops = Number(candidate.shopCount || 0);
    const strains = Number(candidate.strainCount || 0);
    if (candidate.kind === 'shop') return displayCity(candidate.city) || 'Coffeeshop';
    if (candidate.kind === 'strain') return shops ? `Listed by ${shops.toLocaleString()} shop${shops === 1 ? '' : 's'}` : 'Strain in the menu database';
    if (candidate.kind === 'grower') return `${strains.toLocaleString()} strain${strains === 1 ? '' : 's'} across ${shops.toLocaleString()} shop${shops === 1 ? '' : 's'}`;
    if (candidate.kind === 'city') return `${shops.toLocaleString()} indexed coffeeshop${shops === 1 ? '' : 's'}`;
    if (candidate.kind === 'area') return 'Amsterdam neighbourhood';
    if (candidate.kind === 'legal') return 'Regulated-project listings nationwide';
    return '';
  }

  function buildSearchCandidates(index = {}, summary = {}) {
    const candidates = [];
    const add = (kind, rows, mapper) => (Array.isArray(rows) ? rows : []).forEach(row => {
      const candidate = mapper(row);
      if (candidate.name) candidates.push({ kind, aliases: [], ...candidate });
    });
    add('shop', index.shops, row => ({ name: row.name, city: row.city, shopId: row.shop_id, shopKey: row.shop_key }));
    add('strain', index.strains, row => ({ name: row.name, shopCount: row.shop_count }));
    add('grower', index.growers, row => ({ name: row.name, shopCount: row.shop_count, strainCount: row.strain_count }));
    add('city', index.cities, row => ({ name: displayCity(row.name), shopCount: row.shop_count }));
    add('legal', index.intents, row => ({ name: row.name, aliases: row.aliases || [] }));
    HOME_AREAS.forEach(name => candidates.push({ kind: 'area', name, city: 'Amsterdam', aliases: [] }));

    if (!candidates.some(candidate => candidate.kind === 'strain')) {
      (Array.isArray(summary.top_strains) ? summary.top_strains : []).forEach(row => {
        candidates.push({ kind: 'strain', name: displayName(row.name), shopCount: row.shop_count, aliases: [] });
      });
    }
    if (!candidates.some(candidate => candidate.kind === 'legal')) {
      candidates.push({ kind: 'legal', name: 'Legal weed', aliases: ['legal cannabis', 'state weed', 'regulated weed'] });
    }
    searchCandidates = candidates;
    // A background refresh should update open suggestions without reopening a
    // dismissed list or changing an option while the visitor navigates it.
    if (suggestionsRequested && activeSearchResult < 0 && document.activeElement === searchInput) {
      renderSearchResults(searchInput.value);
    }
  }

  function rankedCandidates(query, limit = 8) {
    const value = String(query || '').trim();
    if (!value || !window.BudfinderSearch) return [];
    return window.BudfinderSearch.suggest(value, searchCandidates, limit);
  }

  function pickSubmitCandidate(query) {
    const ranked = rankedCandidates(query, 3);
    if (!ranked.length) return null;
    const [top, next] = ranked;
    if (next && top.score === next.score &&
        window.BudfinderSearch.normalise(top.item.name) === window.BudfinderSearch.normalise(next.item.name)) {
      return null;
    }
    if (top.score >= 0.98 || !next || top.rankScore - next.rankScore >= 0.07) return top.item;
    if (top.item.kind === 'strain' && top.score >= 0.78 &&
        Number(top.item.shopCount || 0) >= Math.max(2, Number(next.item.shopCount || 0) * 1.5)) {
      return top.item;
    }
    return null;
  }

  function hideSearchResults() {
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = 0;
    suggestionsRequested = false;
    visibleSearchResults = [];
    activeSearchResult = -1;
    if (searchResults) searchResults.hidden = true;
    if (searchStatus) {
      searchStatus.className = 'home-search-status';
      searchStatus.textContent = '';
    }
    if (searchInput) {
      searchInput.setAttribute('aria-expanded', 'false');
      searchInput.removeAttribute('aria-activedescendant');
    }
  }

  function syncActiveSearchResult() {
    if (!searchResults) return;
    searchResults.querySelectorAll('[data-search-result-index]').forEach((button, index) => {
      const selected = index === activeSearchResult;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected && searchInput) {
        searchInput.setAttribute('aria-activedescendant', button.id);
        button.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function renderSearchResults(query) {
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = 0;
    if (!searchResults || !searchInput) return;
    const value = String(query || '').replace(/\s+/g, ' ').trim();
    if (!value) {
      hideSearchResults();
      return;
    }
    suggestionsRequested = true;
    visibleSearchResults = rankedCandidates(value).map(result => result.item);
    activeSearchResult = -1;
    searchInput.removeAttribute('aria-activedescendant');
    searchResults.innerHTML = visibleSearchResults.map((candidate, index) => `
          <button id="home-search-result-${index}" class="home-search-result" type="button" role="option" tabindex="-1" aria-selected="false" data-search-result-index="${index}">
            <span class="home-search-result-copy">
              <strong>${escapeHtml(candidate.name)}</strong>
              <span>${window.BudfinderSearch.normalise(candidate.name) === window.BudfinderSearch.normalise(value) ? 'Exact match · ' : ''}${escapeHtml(resultMeta(candidate))}</span>
            </span>
            <span class="home-search-result-kind">${escapeHtml(kindLabel(candidate.kind))}</span>
          </button>
        `).join('');
    searchResults.hidden = !visibleSearchResults.length;
    searchInput.setAttribute('aria-expanded', String(!searchResults.hidden));
    if (searchStatus) {
      searchStatus.className = searchResults.hidden ? 'home-search-empty' : 'home-search-status';
      searchStatus.textContent = visibleSearchResults.length
        ? `${visibleSearchResults.length} search suggestion${visibleSearchResults.length === 1 ? '' : 's'} available.`
        : 'No close suggestion. Try your search in prices or on the map.';
    }
  }

  function strainList(rows) {
    return (Array.isArray(rows) ? rows : []).map(row => {
      const url = new URL('database.html', window.location.href);
      url.searchParams.set('search', row.name);
      url.searchParams.set('detail', 'strain');
      url.searchParams.set('strain', row.name);
      const shopCount = Number(row.shop_count) || 0;
      return `
        <li class="insight-item">
          <a href="${escapeHtml(`${url.pathname.split('/').pop()}${url.search}`)}">
            <b>${escapeHtml(displayName(row.name))}</b>
            <span>Listed by ${shopCount.toLocaleString()} shop${shopCount === 1 ? '' : 's'}${row.average_price == null ? '' : ` · ${escapeHtml(price(row.average_price))}`}</span>
          </a>
        </li>
      `;
    }).join('');
  }

  // Median listing price where the snapshot has it, else the older strain mean.
  const locationPrice = row => (price(row.median_listing_price) !== 'Unavailable'
    ? row.median_listing_price
    : row.average_strain_price);

  function renderLocations(rows) {
    const container = byId('random-location-prices');
    if (!container) return;
    const available = shuffled((Array.isArray(rows) ? rows : [])
      .filter(row => price(locationPrice(row)) !== 'Unavailable'))
      .slice(0, 5);
    if (!available.length) {
      container.innerHTML = '<p class="location-price-empty">Location price averages are unavailable in this snapshot.</p>';
      return;
    }
    container.innerHTML = available.map(row => {
      const url = new URL('map.html', window.location.href);
      url.searchParams.set('source', 'home');
      url.searchParams.set('city', row.name);
      return `
        <a class="location-price-card" href="${escapeHtml(`${url.pathname.split('/').pop()}${url.search}`)}">
          <span>${escapeHtml(displayCity(row.name))}</span>
          <strong>${escapeHtml(price(locationPrice(row)))}</strong>
          <small>${Number(row.active_strains || 0).toLocaleString()} listed strains · ${Number(row.active_shops || 0).toLocaleString()} shops with menus</small>
        </a>
      `;
    }).join('');
  }

  function renderSummary(summary) {
    const amsterdam = summary.amsterdam || {};
    const network = summary.network || {};
    const topStrains = Array.isArray(summary.top_strains) ? summary.top_strains : [];
    const rareStrains = shuffled(summary.rare_strains).slice(0, 5);
    const mappedAmsterdamShops = Number(amsterdam.mapped_shops || amsterdam.active_shops || 0);
    const menuCoveredAmsterdamShops = Number(amsterdam.active_shops || 0);
    const cityCount = Array.isArray(summary.locations) ? summary.locations.length : 0;
    // The median listing matches what visitors see on menus. Older snapshots
    // only carry the strain-weighted mean, so fall back to it with its own label.
    const hasMedian = price(network.median_listing_price) !== 'Unavailable';

    byId('snapshot-date').textContent = formatDate(summary.exported_at_utc);
    byId('database-snapshot-date').textContent = formatDate(summary.exported_at_utc);
    byId('catalog-shop-count').textContent = Number(network.active_shops || 0).toLocaleString();
    byId('catalog-shop-label').textContent = cityCount
      ? `shops with menus in ${cityCount.toLocaleString()} cities`
      : 'shops with menus nationwide';
    byId('catalog-listing-count').textContent = Number(network.active_listings || 0).toLocaleString();
    byId('home-average-price').textContent = price(hasMedian ? network.median_listing_price : network.average_strain_price);
    const averageLabel = byId('home-average-label');
    const averageNote = byId('home-average-note');
    if (averageLabel) averageLabel.textContent = hasMedian ? 'Typical price nationwide' : 'Nationwide average strain price';
    if (averageNote) {
      const comparedCount = Number(network.median_listing_count);
      averageNote.textContent = !hasMedian
        ? 'Each strain contributes its average listed price once.'
        : Number.isFinite(comparedCount) && comparedCount > 0
          ? `Half of the ${comparedCount.toLocaleString()} current prices are below this. Menus over a year old are left out.`
          : `Half of all ${Number(network.active_listings || 0).toLocaleString()} listed prices are below this.`;
    }
    byId('home-most-common').textContent = topStrains.length ? `Top ${topStrains.length}` : 'Unavailable';
    byId('home-most-common-note').textContent =
      `Ranked across ${Number(network.active_shops || 0).toLocaleString()} shops with menu listings nationwide.`;
    byId('home-most-common-list').innerHTML = topStrains.length
      ? strainList(topStrains)
      : '<li class="insight-empty">Current strain rankings are unavailable.</li>';
    byId('home-rare-count').textContent =
      `${Number(summary.rare_strain_count || 0).toLocaleString()} qualifying strains`;
    byId('home-rare-list').innerHTML = rareStrains.length
      ? strainList(rareStrains)
      : '<li class="insight-empty">No 2–3 shop strains are available in this snapshot.</li>';

    byId('coverage-definition').textContent =
      'A menu listing is one strain-and-price entry from a shop\'s latest recorded menu. Menu dates vary, so check a menu before travelling for one item.';
    const excluded = Number(network.excluded_listings || 0);
    byId('coverage-filter-note').textContent =
      `${excluded.toLocaleString()} listing${excluded === 1 ? ' is' : 's are'} left out because the shop is closed or its menu is marked unavailable. In Amsterdam, ${menuCoveredAmsterdamShops.toLocaleString()} of ${mappedAmsterdamShops.toLocaleString()} mapped shops have menus.`;

    renderLocations(summary.locations);
  }

  function renderUnavailable(message) {
    [
      'catalog-shop-count',
      'catalog-listing-count',
      'home-average-price',
      'home-most-common',
      'home-rare-count',
      'snapshot-date',
      'database-snapshot-date'
    ].forEach(id => {
      const element = byId(id);
      if (element) element.textContent = 'Unavailable';
    });
    const note = byId('coverage-filter-note');
    if (note) note.textContent = message || 'The menu summary could not be loaded. Search and map browsing are still available.';
    byId('home-most-common-note').textContent = 'Strain rankings could not be loaded. Explore Menus & prices to try again.';
    byId('home-most-common-list').innerHTML = '<li class="insight-empty">Strain rankings are currently unavailable.</li>';
    byId('home-rare-list').innerHTML = '<li class="insight-empty">The current selection could not be loaded.</li>';
    renderLocations([]);
  }

  function sizeUpdatesViewport() {
    const container = byId('home-updates');
    if (!container || container.dataset.scrollable !== 'true') return;
    const cards = Array.from(container.querySelectorAll('.update-card')).slice(0, 3);
    if (!cards.length) return;
    // Measure complete cards rather than truncating text. On desktop these are
    // one row; on phones they stack. Subtracting the first top also works while
    // the reader is scrolled further down the panel.
    const top = cards[0].getBoundingClientRect().top;
    const bottom = Math.max(...cards.map(card => card.getBoundingClientRect().bottom));
    container.style.maxHeight = `${Math.ceil(bottom - top + 4)}px`;
  }

  function renderUpdates(rows) {
    const container = byId('home-updates');
    if (!container) return;
    const updates = (Array.isArray(rows) ? rows : []).filter(item => item && typeof item === 'object');
    const scrollable = updates.length > 3;
    const help = byId('home-updates-help');
    container.dataset.scrollable = String(scrollable);
    container.style.maxHeight = '';
    if (scrollable) {
      container.setAttribute('tabindex', '0');
      container.setAttribute('aria-describedby', 'home-updates-help');
    } else {
      container.removeAttribute('tabindex');
      container.removeAttribute('aria-describedby');
    }
    if (help) {
      help.hidden = !scrollable;
      help.textContent = scrollable ? `Latest 3 of ${updates.length.toLocaleString()} updates · Scroll inside for older updates ↓` : '';
    }
    if (!updates.length) {
      container.innerHTML = '<p class="updates-empty">No published updates yet. Check back soon.</p>';
      return;
    }
    container.innerHTML = updates.map(item => {
      const rawLink = String(item.link_url || '').trim();
      let link = '';
      try {
        const url = new URL(rawLink, window.location.href);
        if (rawLink && ['http:', 'https:'].includes(url.protocol)) link = rawLink;
      } catch (_) { /* Keep the update readable if its optional link is invalid. */ }
      const linkHtml = link
        ? `<a href="${escapeHtml(link)}"${/^https?:\/\//i.test(link) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(item.link_label || 'Open update')} →</a>`
        : '';
      return `
        <article class="update-card">
          <div class="update-meta"><span>${escapeHtml(item.category || 'News')}</span><time datetime="${escapeHtml(item.published_at_utc || '')}">${escapeHtml(formatDate(item.published_at_utc))}</time></div>
          <h3>${escapeHtml(item.title || 'Budfinder update')}</h3>
          <p>${escapeHtml(item.body || '')}</p>
          ${linkHtml}
        </article>
      `;
    }).join('');
    sizeUpdatesViewport();
    if (typeof ResizeObserver === 'function') {
      if (updatesResizeObserver) updatesResizeObserver.disconnect();
      updatesResizeObserver = new ResizeObserver(sizeUpdatesViewport);
      Array.from(container.querySelectorAll('.update-card')).slice(0, 3)
        .forEach(card => updatesResizeObserver.observe(card));
    }
  }

  async function loadJson(url, label) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error(`${label} returned ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function appendPublicationNote(message) {
    const note = byId('coverage-filter-note');
    if (!note || !message) return;
    note.textContent = `${note.textContent} ${message}`.trim();
  }

  async function init() {
    byId('app-version').textContent = `v${APP_VERSION}`;
    byId('app-updated').textContent = formatDate(siteUpdatedDate());
    bindSearch();
    applyPersonalisation();
    window.addEventListener('budfinder:namechange', applyPersonalisation);
    window.addEventListener('resize', sizeUpdatesViewport);

    // Each section can appear as soon as its own data arrives. A slow updates
    // feed must not hold back the search suggestions or the price summary.
    let loadedSummary = {};
    let loadedIndex = {};
    const summaryPromise = loadJson(SUMMARY_URL, 'Homepage summary').then(summary => {
      const snapshot = String(summary && summary.exported_at_utc || '').trim();
      if (!snapshot) throw new Error('Homepage summary has no export timestamp');
      loadedSummary = summary;
      renderSummary(summary);
      buildSearchCandidates(loadedIndex, loadedSummary);
      return snapshot;
    }).catch(() => {
      renderUnavailable('The menu summary could not be loaded. Search and map browsing are still available.');
      return '';
    }).finally(() => {
      if (summaryRegion) summaryRegion.dataset.ready = 'true';
    });
    const manifestPromise = loadJson(MANIFEST_URL, 'Database manifest')
      .then(manifest => ({ ok: true, value: manifest }))
      .catch(() => ({ ok: false }));
    const searchPromise = loadJson(SEARCH_INDEX_URL, 'Search index').then(index => {
      loadedIndex = index && typeof index === 'object' && !Array.isArray(index) ? index : {};
      buildSearchCandidates(loadedIndex, loadedSummary);
    }).catch(() => {
      buildSearchCandidates(loadedIndex, loadedSummary);
    });
    const updatesPromise = loadJson(UPDATES_URL, 'Homepage updates').then(renderUpdates).catch(() => {
      byId('home-updates').innerHTML = '<p class="updates-empty">Updates could not be loaded. Please try again later.</p>';
    });
    const publicationPromise = Promise.all([summaryPromise, manifestPromise]).then(([snapshot, manifest]) => {
      if (!snapshot) return;
      if (!manifest.ok) {
        appendPublicationNote('The database refresh could not be fully verified. Check an individual menu before travelling.');
      } else if (snapshot !== String(manifest.value && manifest.value.exported_at_utc || '').trim()) {
        appendPublicationNote('These figures use the latest available summary while the rest of the database refresh finishes publishing.');
      }
    });
    await Promise.all([searchPromise, updatesPromise, publicationPromise]);
  }

  init();
})();
