/* Settings for Skunkworks reuse the same saved strains and shop preferences as the map. */
(() => {
  'use strict';
  const api = window.BudfinderSkunkworks;
  const byId = id => document.getElementById(id);
  const status = byId('skunk-status');
  const shopSearch = byId('skunk-shop-search');
  let shops = [];

  function announce(message) { status.textContent = message; }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  }
  function safely(callback) {
    try { callback(); } catch (_) { announce('Your browser could not save these choices. Check that site storage is available.'); }
  }
  function renderStrains() {
    const names = api.readStrains(localStorage);
    byId('skunk-strain-list').innerHTML = names.length
      ? names.map(name => `<li><span>${escapeHtml(name)}</span><button type="button" data-remove-strain="${escapeHtml(name)}" aria-label="Remove ${escapeHtml(name)} from saved strains">Remove</button></li>`).join('')
      : '<li>No saved strains yet.</li>';
  }
  function shopPreference(shop, preferences) { return preferences[api.locationKey(shop)] || {}; }
  function isVisited(shop, pref) { return typeof pref.visited === 'boolean' ? pref.visited : api.readMattDefaults(localStorage) && String(shop.visited || '').trim().toLowerCase() === 'y'; }
  function renderShopRow(shop, preferences) {
    const pref = shopPreference(shop, preferences);
    const visited = isVisited(shop, pref);
    return `<li><span><strong>${escapeHtml(shop.name)}</strong><small>${escapeHtml(shop.city)}</small></span><div class="skunkworks-shop-actions">
      <button type="button" data-shop-key="${escapeHtml(shop.shop_key)}" data-shop-action="favorite" aria-pressed="${pref.favorite === true}">${pref.favorite ? 'Saved' : 'Save shop'}</button>
      <button type="button" data-shop-key="${escapeHtml(shop.shop_key)}" data-shop-action="visited" aria-pressed="${visited}">${visited ? 'Visited' : 'Mark visited'}</button></div></li>`;
  }
  function renderShops() {
    const preferences = api.readLocations(localStorage);
    const query = api.normalise(shopSearch.value);
    const found = query ? shops.filter(shop => api.normalise(`${shop.name} ${shop.city}`).includes(query)) : [];
    byId('skunk-shop-results').innerHTML = found.slice(0, 15).map(shop => renderShopRow(shop, preferences)).join('');
    byId('skunk-shop-status').textContent = !shops.length ? 'Shop list is loading or unavailable.' : !query
      ? 'Type a shop or town to search.' : `${found.length} matching shop${found.length === 1 ? '' : 's'}${found.length > 15 ? ' · Showing the first 15' : ''}.`;
    const saved = shops.filter(shop => shopPreference(shop, preferences).favorite === true);
    byId('skunk-saved-shops').innerHTML = saved.length ? saved.map(shop => renderShopRow(shop, preferences)).join('') : '<li>No saved shops yet.</li>';
  }
  function renderProfile() {
    const profile = api.readProfile(localStorage);
    byId('skunk-radius').value = String(profile.radiusKm);
    byId('skunk-unvisited').checked = profile.showUnvisited;
    byId('skunk-recent').checked = profile.preferRecent;
    byId('skunk-matt-defaults').checked = api.readMattDefaults(localStorage);
    document.querySelectorAll('input[name="type"]').forEach(input => { input.checked = profile.types.includes(input.value); });
  }
  byId('skunk-strain-form').addEventListener('submit', event => {
    event.preventDefault();
    safely(() => {
      const input = byId('skunk-strain-input');
      const value = input.value.replace(/\s+/g, ' ').trim();
      if (!value) { announce('Type a strain name first.'); return; }
      const names = api.readStrains(localStorage);
      if (names.some(name => api.normalise(name) === api.normalise(value))) { announce(`${value} is already saved.`); return; }
      if (names.length >= 10) { announce('You can save up to 10 strains. Remove one first.'); return; }
      api.writeStrains(localStorage, [value, ...names]);
      input.value = '';
      renderStrains();
      announce(`${value} saved. Strain matches use the exact name.`);
    });
  });
  byId('skunk-strain-list').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-strain]');
    if (!button) return;
    safely(() => {
      const value = button.dataset.removeStrain;
      api.writeStrains(localStorage, api.readStrains(localStorage).filter(name => api.normalise(name) !== api.normalise(value)));
      renderStrains();
      byId('skunk-strain-input').focus();
      announce(`${value} removed from saved strains.`);
    });
  });
  shopSearch.addEventListener('input', renderShops);
  function changeShop(event) {
    const button = event.target.closest('[data-shop-action]');
    if (!button) return;
    safely(() => {
      const shop = shops.find(item => item.shop_key === button.dataset.shopKey);
      if (!shop) return;
      const key = api.locationKey(shop);
      if (!key) { announce('This shop cannot be saved because it has no stable location key.'); return; }
      const preferences = api.readLocations(localStorage);
      const current = shopPreference(shop, preferences);
      if (button.dataset.shopAction === 'favorite') {
        const saved = shops.filter(item => shopPreference(item, preferences).favorite === true);
        if (!current.favorite && saved.length >= 10) { announce('You can save up to 10 shops. Remove one first.'); return; }
        preferences[key] = { ...current, favorite: !current.favorite };
        announce(`${shop.name} ${preferences[key].favorite ? 'saved' : 'removed from saved shops'}.`);
      } else {
        preferences[key] = { ...current, visited: !isVisited(shop, current) };
        announce(`${shop.name} marked ${preferences[key].visited ? 'visited' : 'not visited'}.`);
      }
      api.writeLocations(localStorage, preferences);
      // The map also reads a legacy index list when there are no saved shops.
      // Clear it when the last favourite is removed so it cannot reappear.
      if (!Object.values(preferences).some(value => value && value.favorite === true)) localStorage.setItem('favorites', '[]');
      renderShops();
      const next = [...document.querySelectorAll('[data-shop-key]')].find(item => item.dataset.shopKey === shop.shop_key && item.dataset.shopAction === button.dataset.shopAction);
      next?.focus();
    });
  }
  byId('skunk-shop-results').addEventListener('click', changeShop);
  byId('skunk-saved-shops').addEventListener('click', changeShop);
  byId('skunk-preferences-form').addEventListener('submit', event => {
    event.preventDefault();
    safely(() => {
      api.writeProfile(localStorage, {
        ...api.readProfile(localStorage), radiusKm: Number(byId('skunk-radius').value),
        types: [...document.querySelectorAll('input[name="type"]:checked')].map(input => input.value),
        showUnvisited: byId('skunk-unvisited').checked,
        preferRecent: byId('skunk-recent').checked
      });
      api.writeMattDefaults(localStorage, byId('skunk-matt-defaults').checked);
      renderShops();
      announce('Preferences saved. Open the map and choose “What’s around?”');
    });
  });
  window.addEventListener('storage', event => {
    if (api.STRAIN_KEYS.includes(event.key)) renderStrains();
    if (api.LOCATION_KEYS.includes(event.key)) renderShops();
    if (event.key === api.PROFILE_KEY) renderProfile();
    if (event.key === api.MATT_DEFAULTS_KEY) { renderProfile(); renderShops(); }
  });
  // Storage events do not fire in the tab which cleared its own settings.
  window.addEventListener('budfinder:saved-data-cleared', () => {
    safely(() => { renderStrains(); renderShops(); renderProfile(); });
    announce('Saved choices cleared on this device.');
  });

  safely(() => { renderStrains(); renderProfile(); });
  Promise.allSettled([
    fetch('database/search_index.json').then(response => { if (!response.ok) throw new Error('Search index unavailable'); return response.json(); }),
    fetch('database/locations/coffeeshops.csv').then(response => { if (!response.ok) throw new Error('Shop list unavailable'); return response.text(); })
  ]).then(([search, locations]) => {
    if (search.status === 'fulfilled') {
      byId('skunk-strain-options').innerHTML = (search.value.strains || []).map(row => `<option value="${escapeHtml(row.name)}"></option>`).join('');
    }
    if (locations.status === 'fulfilled' && window.Papa) {
      shops = Papa.parse(locations.value, { header: true, skipEmptyLines: true }).data
        .filter(shop => shop.name && shop.shop_key && String(shop.status || '').toLowerCase() !== 'closed')
        .sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city));
      renderShops();
    } else {
      byId('skunk-shop-status').textContent = 'The shop list could not be loaded. Refresh to try again.';
    }
  });
})();
