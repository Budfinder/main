(() => {
  const APP_VERSION = document.documentElement.dataset.appVersion || '1.24';
  const APP_UPDATED = document.documentElement.dataset.appUpdated || '30 July 2026';
  const SUMMARY_URL = 'database/home_summary.json';
  const MANIFEST_URL = 'database/manifest.json';

  const byId = id => document.getElementById(id);
  const summaryRegion = byId('amsterdam-insights');
  const searchForm = byId('home-search-form');
  const searchInput = byId('home-search-input');
  const searchSubmit = byId('home-search-submit');
  const searchSuggestions = byId('home-search-suggestions');
  const personalGreeting = byId('home-personal-greeting');

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

  function openSearch(query) {
    const value = String(query || '').replace(/\s+/g, ' ').trim();
    const url = new URL('map.html', window.location.href);
    url.searchParams.set('source', 'home');
    if (value) url.searchParams.set('search', value);
    window.location.href = `${url.pathname.split('/').pop()}${url.search}`;
  }

  function applyPersonalisation() {
    const name = window.BudfinderPersonalisation
      ? window.BudfinderPersonalisation.userName()
      : '';
    if (personalGreeting) {
      personalGreeting.textContent = name
        ? `Welcome back, ${name}`
        : 'Amsterdam coffeeshop decision engine';
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
        openSearch(searchInput ? searchInput.value : '');
      });
    }
    document.querySelectorAll('[data-search]').forEach(button => {
      button.addEventListener('click', () => openSearch(button.getAttribute('data-search') || ''));
    });
  }

  function updateSuggestions(summary) {
    if (!searchSuggestions) return;
    const common = [
      'Gelato',
      'Family First',
      'De Pijp',
      'Jordaan',
      ...(Array.isArray(summary.top_strains) ? summary.top_strains.map(row => displayName(row.name)) : [])
    ];
    searchSuggestions.innerHTML = Array.from(new Set(common))
      .map(value => `<option value="${escapeHtml(value)}"></option>`)
      .join('');
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
    const available = (Array.isArray(rows) ? rows : [])
      .filter(row => Number.isFinite(Number(row.average_strain_price)))
      .slice(0, 5);
    container.innerHTML = available.map(row => {
      const url = new URL('map.html', window.location.href);
      url.searchParams.set('source', 'home');
      if (row.map_location) url.searchParams.set('location', row.map_location);
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
    updateSuggestions(summary);
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

    const [summaryResult, manifestResult] = await Promise.allSettled([
      loadJson(SUMMARY_URL, 'Homepage summary'),
      loadJson(MANIFEST_URL, 'Database manifest')
    ]);

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
