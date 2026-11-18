/* Shared, dependency-free menu filters and links between the map and menus. */
(() => {
  'use strict';
  const KEYS = ['city', 'type', 'price', 'age', 'cali', 'legal'];
  const normalise = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const choices = {
    type: [['', 'All types'], ['sativa', 'Sativa'], ['indica', 'Indica'], ['hybrid', 'Hybrid'], ['hash', 'Hash']],
    price: [['', 'Any price'], ['under10', 'Under €10/g'], ['under15', 'Under €15/g'], ['under20', 'Under €20/g'], ['over20', '€20/g and over'], ['unknown', 'Price unknown']],
    age: [['', 'Any menu age'], ['fresh', 'Within 14 days'], ['ageing', '15–60 days'], ['stale', 'Over 60 days'], ['unknown', 'Date unknown']],
    cali: [['', 'Any origin'], ['1', 'Cali'], ['0', 'Not Cali']],
    legal: [['', 'Any project status'], ['1', 'Legal project'], ['0', 'Outside legal project']]
  };
  const labels = { city: 'Location', type: 'Type', price: 'Price per gram', age: 'Menu age', cali: 'Origin', legal: 'Legal project' };

  function clean(input = {}) {
    if (!input || typeof input !== 'object') input = {};
    const output = Object.fromEntries(KEYS.map(key => [key, '']));
    output.city = String(input.city || '').trim().slice(0, 100);
    if (['netherlands', 'all netherlands', 'all'].includes(normalise(output.city))) output.city = '';
    for (const key of KEYS.filter(key => key !== 'city')) {
      const value = String(input[key] ?? '');
      output[key] = choices[key].some(([option]) => option === value) ? value : '';
    }
    return output;
  }

  function fromUrl(value) {
    const url = new URL(value, 'https://budfinder.org/');
    return clean(Object.fromEntries(KEYS.map(key => [key, url.searchParams.get(`filter_${key}`) || ''])));
  }

  function applyToUrl(url, filters) {
    const values = clean(filters);
    for (const key of KEYS) {
      if (values[key]) url.searchParams.set(`filter_${key}`, values[key]);
      else url.searchParams.delete(`filter_${key}`);
    }
    return url;
  }

  function active(filters) { return KEYS.filter(key => clean(filters)[key]); }

  function safeReturn(value) {
    try {
      const url = new URL(value, 'https://budfinder.org/');
      if (url.origin !== 'https://budfinder.org' || !['/map.html', '/database.html'].includes(url.pathname)) return '';
      url.searchParams.delete('return_to');
      return `${url.pathname.slice(1)}${url.search}`;
    } catch (_) { return ''; }
  }

  function link(target, context = {}) {
    const page = target === 'map' ? 'map.html' : 'database.html';
    const url = new URL(page, 'https://budfinder.org/');
    applyToUrl(url, context.filters);
    url.searchParams.set('explore', '1');
    const query = String(context.query || '').trim();
    const shopId = /^\d+$/.test(String(context.shopId || '')) ? String(context.shopId) : '';
    if (query) url.searchParams.set('search', query);
    if (target === 'map') {
      url.searchParams.set('city', context.filters?.city || context.city || 'Netherlands');
      if (shopId) url.searchParams.set('shops', shopId);
      if (context.strain) url.searchParams.set('strain', context.strain);
    } else if (shopId) {
      url.searchParams.set('detail', 'shop');
      url.searchParams.set('shop_id', shopId);
    } else if (context.strain) {
      url.searchParams.set('detail', 'strain');
      url.searchParams.set('strain', context.strain);
    } else if (context.browser) {
      url.searchParams.set('browser', context.browser === 'strains' ? 'strains' : 'shops');
    }
    if (context.source) url.searchParams.set('source', context.source === 'map' ? 'map' : 'menus');
    const back = safeReturn(context.returnTo);
    if (back) url.searchParams.set('return_to', back);
    return `${page}${url.search}`;
  }

  function ageBucket(value, now = Date.now()) {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time)) return 'unknown';
    const day = date => Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
    const days = day(new Date(now)) - day(new Date(time));
    return days < 0 ? 'unknown' : days <= 14 ? 'fresh' : days <= 60 ? 'ageing' : 'stale';
  }

  function matches(row, filters, options = {}) {
    const values = clean(filters);
    if (values.city && normalise(row.shop_city || row.city) !== normalise(values.city)) return false;
    if (values.type && normalise(row.base_type) !== values.type) return false;
    if (values.cali && String(Number(row.is_cali) || 0) !== values.cali) return false;
    if (values.legal && String(Number(row.is_legal) || 0) !== values.legal) return false;
    if (values.price) {
      const price = row.price_amount == null || String(row.price_amount).trim() === '' ? NaN : Number(row.price_amount);
      const known = Number.isFinite(price) && price > 0 && (row.price_currency || '€') === '€';
      if (values.price === 'unknown') { if (known) return false; }
      else if (!known || (values.price === 'under10' && price >= 10) || (values.price === 'under15' && price >= 15)
        || (values.price === 'under20' && price >= 20) || (values.price === 'over20' && price < 20)) return false;
    }
    if (values.age) {
      const date = options.date !== undefined ? options.date
        : row.source_menu_date || row.menu_date || row.listing_date || row.menu_changed_at_utc || '';
      if (ageBucket(date, options.now) !== values.age) return false;
    }
    return true;
  }

  function mount(host, { filters = {}, cities = [], collapsed = false, onChange } = {}) {
    if (!host) return null;
    let values = clean(filters);
    const cityOptions = [...new Set(cities.map(city => String(city || '').trim()).filter(Boolean).map(city => city[0].toUpperCase() + city.slice(1)))].sort((a, b) => a.localeCompare(b));
    if (values.city && !cityOptions.some(city => normalise(city) === normalise(values.city))) cityOptions.push(values.city);
    const options = { ...choices, city: [['', 'All Netherlands'], ...cityOptions.map(city => [city, city])] };
    const field = key => `<label for="${host.id}-${key}">${labels[key]}<select id="${host.id}-${key}" data-explore-filter="${key}">${options[key].map(([value, label]) => `<option value="${escape(value)}">${escape(label)}</option>`).join('')}</select></label>`;
    host.innerHTML = `<details class="explore-filter-panel"${collapsed ? '' : ' open'}>
      <summary>Filters <span data-explore-filter-count aria-live="polite" aria-atomic="true"></span></summary>
      <div class="explore-filter-fields">${['city', 'type', 'price', 'age'].map(field).join('')}</div>
      <details class="explore-more-filters"><summary>More filters</summary><div class="explore-filter-fields">${['cali', 'legal'].map(field).join('')}</div></details>
      <p class="explore-filter-help">Filters match the same menu item. Prices are per gram; menu dates may be unknown.</p>
    </details><div class="explore-filter-chips" aria-label="Active menu filters"></div>`;
    const controls = [...host.querySelectorAll('[data-explore-filter]')];
    const chips = host.querySelector('.explore-filter-chips');
    const count = host.querySelector('[data-explore-filter-count]');
    function update(next) {
      values = clean(next);
      controls.forEach(control => {
        const key = control.dataset.exploreFilter;
        control.value = options[key].find(([option]) => normalise(option) === normalise(values[key]))?.[0] || '';
      });
      const keys = active(values);
      count.textContent = keys.length ? `${keys.length} active` : 'All menus';
      chips.innerHTML = keys.map(key => {
        const name = options[key].find(([option]) => normalise(option) === normalise(values[key]))?.[1] || values[key];
        return `<button type="button" data-remove-explore-filter="${key}" aria-label="Remove ${escape(labels[key].toLowerCase())} filter: ${escape(name)}">${escape(name)} <span aria-hidden="true">×</span></button>`;
      }).join('') + (keys.length ? '<button type="button" class="explore-clear-filters" data-clear-explore-filters>Clear filters</button>' : '');
    }
    host.addEventListener('change', event => {
      const key = event.target.dataset?.exploreFilter;
      if (!KEYS.includes(key)) return;
      values = clean({ ...values, [key]: event.target.value });
      update(values);
      onChange?.({ ...values });
    });
    host.addEventListener('click', event => {
      const remove = event.target.closest('[data-remove-explore-filter]');
      const clear = event.target.closest('[data-clear-explore-filters]');
      if (!remove && !clear) return;
      const previousButtons = [...chips.querySelectorAll('button')];
      const focusIndex = Math.max(0, previousButtons.indexOf(remove || clear));
      update(clear ? {} : { ...values, [remove.dataset.removeExploreFilter]: '' });
      onChange?.({ ...values });
      const focusHost = host.isConnected === false ? host.ownerDocument?.getElementById(host.id) : host;
      const remaining = [...(focusHost?.querySelector('.explore-filter-chips')?.querySelectorAll('button') || [])];
      (remaining[Math.min(focusIndex, remaining.length - 1)] || focusHost?.querySelector('.explore-filter-panel > summary'))?.focus();
    });
    update(values);
    return { set: update, get: () => ({ ...values }) };
  }

  const api = { clean, fromUrl, applyToUrl, active, safeReturn, link, ageBucket, matches, mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.BudfinderExplore = api;
})();
