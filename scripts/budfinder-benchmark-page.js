/* Let a visitor choose a private, fixed 20-shop price-history benchmark. */
(() => {
  'use strict';
  const api = window.BudfinderBenchmark;
  const byId = id => document.getElementById(id);
  const search = byId('benchmark-shop-search');
  const results = byId('benchmark-search-results');
  const selectedList = byId('benchmark-selected');
  const searchStatus = byId('benchmark-search-status');
  const status = byId('benchmark-status');
  const save = byId('benchmark-save');
  const reset = byId('benchmark-reset');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const normalise = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let shops = [], defaults = [], selected = [];

  function render() {
    const byShopId = new Map(shops.map(shop => [shop.shopId, shop]));
    const query = normalise(search.value).trim();
    const matches = query ? shops.filter(shop => normalise(`${shop.name} ${shop.city}`).includes(query)) : [];
    searchStatus.textContent = query ? `${matches.length} matching shop${matches.length === 1 ? '' : 's'}${matches.length > 20 ? ' · showing 20' : ''}.` : 'Type a shop or town to search.';
    results.innerHTML = matches.slice(0, 20).map(shop => {
      const chosen = selected.includes(shop.shopId);
      const hasCurrent = shop.points.at(-1)?.average_price != null;
      return `<li><span><strong>${escape(shop.name)}</strong><small>${escape(shop.city)}${hasCurrent ? '' : ' · no current price'}</small></span><button type="button" data-benchmark-add="${shop.shopId}" ${chosen || selected.length >= api.SHOP_LIMIT ? 'disabled' : ''}>${chosen ? 'Selected' : 'Add'}</button></li>`;
    }).join('');
    selectedList.innerHTML = selected.map(id => {
      const shop = byShopId.get(id);
      const name = shop?.name || `Unavailable shop #${id}`;
      const note = shop && shop.points.at(-1)?.average_price == null ? ' · no current price' : '';
      return `<li><span><strong>${escape(name)}</strong><small>${escape(shop?.city || '')}${note}</small></span><button type="button" data-benchmark-remove="${id}" aria-label="Remove ${escape(name)}">Remove</button></li>`;
    }).join('');
    byId('benchmark-selected-heading').textContent = `Selected shops · ${selected.length} of ${api.SHOP_LIMIT}`;
    save.disabled = selected.length !== api.SHOP_LIMIT || selected.some(id => !byShopId.has(id));
    reset.disabled = !defaults.length;
  }
  search.addEventListener('input', render);
  results.addEventListener('click', event => {
    const button = event.target.closest('[data-benchmark-add]');
    if (!button || button.disabled) return;
    const id = Number(button.dataset.benchmarkAdd);
    if (shops.some(shop => shop.shopId === id) && !selected.includes(id) && selected.length < api.SHOP_LIMIT) selected.push(id);
    render();
  });
  selectedList.addEventListener('click', event => {
    const button = event.target.closest('[data-benchmark-remove]');
    if (!button) return;
    selected = selected.filter(id => id !== Number(button.dataset.benchmarkRemove));
    render();
  });
  save.addEventListener('click', () => {
    try {
      api.write(localStorage, selected);
      const missing = selected.map(id => shops.find(shop => shop.shopId === id)).filter(shop => shop && shop.points.at(-1)?.average_price == null);
      status.textContent = missing.length ? `Saved on this device. ${missing.map(shop => shop.name).join(', ')} ${missing.length === 1 ? 'has' : 'have'} no current price, so the latest benchmark may be incomplete.` : 'Saved on this device. Your homepage graph will use these 20 shops.';
    } catch (_) { status.textContent = 'Could not save this benchmark on this device.'; }
  });
  reset.addEventListener('click', () => {
    try { api.reset(localStorage); selected = defaults.slice(); render(); status.textContent = 'The homepage will use the public benchmark on this device.'; }
    catch (_) { status.textContent = 'Could not save this preference on this device.'; }
  });
  window.addEventListener('storage', event => {
    if (event.key !== api.STORAGE_KEY) return;
    selected = api.read(localStorage) || defaults.slice();
    render();
    status.textContent = 'Benchmark updated on this device.';
  });
  window.addEventListener('budfinder:saved-data-cleared', () => {
    selected = defaults.slice();
    render();
    status.textContent = 'The public benchmark is selected on this device.';
  });
  Promise.all(['database/price_history.json', 'database/price_history_shops.json'].map(async path => {
    const response = await fetch(path, {cache:'no-cache'});
    if (!response.ok) throw new Error('History unavailable');
    return response.json();
  })).then(([history, individual]) => {
    const data = api.normaliseHistory(individual, history.exported_at_utc);
    shops = data.shops.sort((a,b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city));
    defaults = (history.benchmark?.shops || []).map(shop => Number(shop.shop_id));
    selected = api.read(localStorage) || defaults.slice();
    render();
    status.textContent = api.read(localStorage) ? 'Your saved benchmark is loaded.' : 'The public benchmark is selected. Make changes and save them for this device.';
  }).catch(() => {
    search.disabled = true;
    searchStatus.textContent = 'Shop histories could not be loaded. Try again after the next database export.';
    status.textContent = 'Your existing benchmark choice has not been changed.';
  });
})();
