(() => {
  // Keep release metadata here as the single source of truth. The homepage
  // script URL in index.html is cache-busted whenever these values change.
  const APP_VERSION = '1.30';
  const APP_UPDATED = '30 August 2026';
  const SUMMARY_URL = 'database/home_summary.json';
  const MANIFEST_URL = 'database/manifest.json';
  const SEARCH_INDEX_URL = 'database/search_index.json';
  const UPDATES_URL = 'database/updates.json';
  const HOME_AREAS = ['De Pijp', 'Jordaan', 'Centrum', 'Oud-West', 'Oost', 'Noord'];

  const byId = id => document.getElementById(id);
  const summaryRegion = byId('amsterdam-insights');
  const searchForm = byId('home-search-form');
  const searchInput = byId('home-search-input');
  const searchSubmit = byId('home-search-submit');
  const searchResults = byId('home-search-results');
  const searchStatus = byId('home-search-status');
  const personalGreeting = byId('home-personal-greeting');
  let searchCandidates = [];
  let visibleSearchResults = [];
  let activeSearchResult = -1;
  let searchRenderTimer = 0;

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

  function price(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'Unavailable';
    const amount = numeric.toFixed(Number.isInteger(numeric) ? 0 : 2).replace(/0+$/, '').replace(/\.$/, '');
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

  function openSearch(query, candidate = null) {
    const value = String(candidate && candidate.name || query || '').replace(/\s+/g, ' ').trim();
    const url = new URL('map.html', window.location.href);
    url.searchParams.set('source', 'home');
    if (value) url.searchParams.set('search', value);
    const city = candidateCity(candidate) || (value ? 'Netherlands' : 'Amsterdam');
    url.searchParams.set('city', city);
    window.location.href = `${url.pathname.split('/').pop()}${url.search}`;
  }

  function applyPersonalisation() {
    const name = window.BudfinderPersonalisation
      ? window.BudfinderPersonalisation.userName()
      : '';
    if (personalGreeting) {
      personalGreeting.textContent = name
        ? `Welcome back, ${name}`
        : 'Dutch coffeeshop decision engine';
    }
    if (searchSubmit) {
      searchSubmit.textContent = name
        ? `Explore matches for ${name}`
        : 'Explore matching shops';
    }
  }

  function bindSearch() {
    if (searchForm) {
      searchForm.addEventListener('submit', event => {
        event.preventDefault();
        const query = searchInput ? searchInput.value : '';
        const active = visibleSearchResults[activeSearchResult];
        openSearch(query, active || pickSubmitCandidate(query));
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        window.clearTimeout(searchRenderTimer);
        searchRenderTimer = window.setTimeout(() => renderSearchResults(searchInput.value), 60);
      });
      searchInput.addEventListener('focus', () => renderSearchResults(searchInput.value));
      searchInput.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          hideSearchResults();
          return;
        }
        if (!visibleSearchResults.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
        if (event.key === 'Enter' && activeSearchResult < 0) return;
        event.preventDefault();
        if (event.key === 'Enter') {
          const candidate = visibleSearchResults[activeSearchResult];
          openSearch(candidate.name, candidate);
          return;
        }
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        activeSearchResult = (activeSearchResult + direction + visibleSearchResults.length) % visibleSearchResults.length;
        syncActiveSearchResult();
      });
    }
    if (searchResults) {
      searchResults.addEventListener('click', event => {
        const button = event.target.closest('[data-search-result-index]');
        if (!button) return;
        const candidate = visibleSearchResults[Number(button.dataset.searchResultIndex)];
        if (candidate) openSearch(candidate.name, candidate);
      });
    }
    document.addEventListener('click', event => {
      if (searchForm && !searchForm.contains(event.target)) hideSearchResults();
    });
    document.querySelectorAll('[data-search]').forEach(button => {
      button.addEventListener('click', () => openSearch(button.getAttribute('data-search') || ''));
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
    if (candidate.kind === 'strain') return shops ? `Available at ${shops.toLocaleString()} shop${shops === 1 ? '' : 's'}` : 'Strain in the menu database';
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
    if (searchInput && searchInput.value.trim()) renderSearchResults(searchInput.value);
  }

  function rankedCandidates(query, limit = 8) {
    const value = String(query || '').trim();
    if (!value || !window.BudfinderSearch) return [];
    const priority = { shop: 0, city: 1, area: 2, grower: 3, strain: 4, legal: 5 };
    return window.BudfinderSearch.rank(value, searchCandidates, {
      getLabel: candidate => candidate.name,
      getAliases: candidate => candidate.aliases,
      threshold: value.length < 3 ? 0.86 : 0.70
    }).map(result => ({
      ...result,
      rankScore: result.score + (result.item.kind === 'strain'
        ? Math.min(0.08, Math.log10(Number(result.item.shopCount || 0) + 1) * 0.035)
        : 0)
    })).sort((left, right) => (
      right.rankScore - left.rankScore ||
      Number(right.item.shopCount || 0) - Number(left.item.shopCount || 0) ||
      (priority[left.item.kind] ?? 9) - (priority[right.item.kind] ?? 9) ||
      left.item.name.localeCompare(right.item.name, undefined, { sensitivity: 'base' })
    )).slice(0, limit);
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
    visibleSearchResults = [];
    activeSearchResult = -1;
    if (searchResults) searchResults.hidden = true;
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
      if (selected && searchInput) searchInput.setAttribute('aria-activedescendant', button.id);
    });
  }

  function renderSearchResults(query) {
    if (!searchResults || !searchInput) return;
    const value = String(query || '').replace(/\s+/g, ' ').trim();
    if (!value) {
      hideSearchResults();
      if (searchStatus) searchStatus.textContent = '';
      return;
    }
    visibleSearchResults = rankedCandidates(value).map(result => result.item);
    activeSearchResult = -1;
    searchResults.innerHTML = visibleSearchResults.length
      ? visibleSearchResults.map((candidate, index) => `
          <button id="home-search-result-${index}" class="home-search-result" type="button" role="option" aria-selected="false" data-search-result-index="${index}">
            <span class="home-search-result-copy">
              <strong>${escapeHtml(candidate.name)}</strong>
              <span>${escapeHtml(resultMeta(candidate))}</span>
            </span>
            <span class="home-search-result-kind">${escapeHtml(kindLabel(candidate.kind))}</span>
          </button>
        `).join('')
      : '<p class="home-search-empty">No close suggestion yet. Press search to check the nationwide map.</p>';
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    if (searchStatus) {
      searchStatus.textContent = visibleSearchResults.length
        ? `${visibleSearchResults.length} search suggestion${visibleSearchResults.length === 1 ? '' : 's'} available.`
        : 'No close suggestion. Your search can still be checked nationwide.';
    }
  }

  function strainList(rows) {
    return (Array.isArray(rows) ? rows : []).map(row => {
      const url = new URL('database.html', window.location.href);
      url.searchParams.set('search', row.name);
      const shopCount = Number(row.shop_count) || 0;
      return `
        <li class="insight-item">
          <a href="${escapeHtml(`${url.pathname.split('/').pop()}${url.search}`)}">
            <b>${escapeHtml(displayName(row.name))}</b>
            <span>${shopCount.toLocaleString()} active shop${shopCount === 1 ? '' : 's'} · ${escapeHtml(price(row.average_price))}</span>
          </a>
        </li>
      `;
    }).join('');
  }

  function renderLocations(rows) {
    const container = byId('random-location-prices');
    if (!container) return;
    const available = shuffled((Array.isArray(rows) ? rows : [])
      .filter(row => Number.isFinite(Number(row.average_strain_price))))
      .slice(0, 5);
    container.innerHTML = available.map(row => {
      const url = new URL('map.html', window.location.href);
      url.searchParams.set('source', 'home');
      url.searchParams.set('city', row.name);
      return `
        <a class="location-price-card" href="${escapeHtml(`${url.pathname.split('/').pop()}${url.search}`)}" aria-label="Open ${escapeHtml(displayCity(row.name))} on the map">
          <span>${escapeHtml(displayCity(row.name))}</span>
          <strong>${escapeHtml(price(row.average_strain_price))}</strong>
          <small>${Number(row.active_strains || 0).toLocaleString()} active strains · ${Number(row.active_shops || 0).toLocaleString()} active shops</small>
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

    byId('snapshot-date').textContent = formatDate(summary.exported_at_utc);
    byId('database-snapshot-date').textContent = formatDate(summary.exported_at_utc);
    byId('catalog-shop-count').textContent = mappedAmsterdamShops.toLocaleString();
    byId('catalog-shop-label').textContent = 'mapped Amsterdam shops';
    byId('catalog-listing-count').textContent = Number(amsterdam.active_listings || 0).toLocaleString();
    byId('home-average-price').textContent = price(network.average_strain_price);
    byId('home-most-common').textContent = topStrains.length ? `Top ${topStrains.length}` : 'Unavailable';
    byId('home-most-common-note').textContent =
      `Ranked across ${Number(network.active_shops || 0).toLocaleString()} active shops nationwide.`;
    byId('home-most-common-list').innerHTML = topStrains.length
      ? strainList(topStrains)
      : '<li class="insight-empty">Current strain rankings are unavailable.</li>';
    byId('home-rare-count').textContent =
      `${Number(summary.rare_strain_count || 0).toLocaleString()} qualifying strains`;
    byId('home-rare-list').innerHTML = rareStrains.length
      ? strainList(rareStrains)
      : '<li class="insight-empty">No 2–3 shop strains are available in this snapshot.</li>';

    byId('coverage-definition').textContent =
      'A mapped shop is an open Amsterdam coffeeshop marker. One active listing is one current strain-and-price row.';
    byId('coverage-filter-note').textContent =
      `${menuCoveredAmsterdamShops.toLocaleString()} of ${mappedAmsterdamShops.toLocaleString()} mapped Amsterdam shops currently have browsable menu listings. Amsterdam excludes ${Number(amsterdam.excluded_listings || 0).toLocaleString()} unavailable listing${Number(amsterdam.excluded_listings || 0) === 1 ? '' : 's'}. Nationwide signals use ${Number(network.active_listings || 0).toLocaleString()} active listings across ${Number(network.active_shops || 0).toLocaleString()} active shops after excluding ${Number(network.excluded_listings || 0).toLocaleString()} unavailable listing${Number(network.excluded_listings || 0) === 1 ? '' : 's'}.`;

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
    if (note) note.textContent = message || 'The lightweight homepage summary could not be loaded. Search and map browsing are still available.';
  }

  function renderUpdates(rows) {
    const container = byId('home-updates');
    if (!container) return;
    const updates = (Array.isArray(rows) ? rows : []).slice(0, 6);
    if (!updates.length) {
      container.innerHTML = '<p class="updates-empty">No published updates yet. Check back soon.</p>';
      return;
    }
    container.innerHTML = updates.map(item => {
      const link = String(item.link_url || '').trim();
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
  }

  async function loadJson(url, label) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${label} returned ${response.status}`);
    return response.json();
  }

  function appendPublicationNote(message) {
    const note = byId('coverage-filter-note');
    if (!note || !message) return;
    note.textContent = `${note.textContent} ${message}`.trim();
  }

  async function init() {
    byId('app-version').textContent = `v${APP_VERSION}`;
    byId('app-updated').textContent = APP_UPDATED;
    bindSearch();
    applyPersonalisation();
    window.addEventListener('budfinder:namechange', applyPersonalisation);

    const [summaryResult, manifestResult, searchIndexResult, updatesResult] = await Promise.allSettled([
      loadJson(SUMMARY_URL, 'Homepage summary'),
      loadJson(MANIFEST_URL, 'Database manifest'),
      loadJson(SEARCH_INDEX_URL, 'Search index'),
      loadJson(UPDATES_URL, 'Homepage updates')
    ]);

    renderUpdates(updatesResult.status === 'fulfilled' ? updatesResult.value : []);

    buildSearchCandidates(
      searchIndexResult.status === 'fulfilled' ? searchIndexResult.value : {},
      summaryResult.status === 'fulfilled' ? summaryResult.value : {}
    );

    try {
      if (summaryResult.status !== 'fulfilled') throw summaryResult.reason;

      const summary = summaryResult.value;
      const summarySnapshot = String(summary && summary.exported_at_utc || '').trim();
      if (!summarySnapshot) throw new Error('Homepage summary has no export timestamp');

      renderSummary(summary);

      if (manifestResult.status === 'fulfilled') {
        const manifestSnapshot = String(manifestResult.value && manifestResult.value.exported_at_utc || '').trim();
        if (!manifestSnapshot || summarySnapshot !== manifestSnapshot) {
          appendPublicationNote(
            'These homepage figures use the latest available summary while the matching database completion marker is still being published.'
          );
        }
      } else {
        appendPublicationNote(
          'The database completion marker could not be checked, so confirm a specific menu before travelling.'
        );
      }
    } catch (error) {
      renderUnavailable('The lightweight homepage summary could not be loaded. Search and map browsing are still available.');
    }

    if (summaryRegion) summaryRegion.dataset.ready = 'true';
  }

  init();
})();
