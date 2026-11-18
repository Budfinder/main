/* Shared public-data rules keep the map, menu explorer and directory in agreement. */
(function (root) {
  'use strict';

  // Normalise source identifiers without changing the public display names.
  function sourceToken(value) {
    let text = String(value || '');
    try { text = decodeURIComponent(text); } catch (_) { /* Retain malformed source text. */ }
    return text.toLowerCase().replace(/^cs-/, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  }

  // Hidden, closed, failed and wrongly attributed menus must not contribute matches.
  function unavailableShopIds(shops) {
    const rows = Array.isArray(shops) ? shops : [];
    const tokens = shop => [sourceToken(shop.name), sourceToken(shop.shop_key)].filter(token => token.length >= 5);
    const closed = shop => shop.is_closed === true || Number(shop.is_closed) === 1 || String(shop.is_closed).toLowerCase() === 'true';
    const closedTokens = [...new Set(rows.filter(closed).flatMap(tokens))];
    return new Set(rows.filter(shop => {
      const ownTokens = new Set(tokens(shop));
      const hidden = shop.show_in_admin != null && (shop.show_in_admin === false || Number(shop.show_in_admin) === 0 || ['false', 'no', 'n', 'off'].includes(String(shop.show_in_admin).trim().toLowerCase()));
      const badStatus = ['closed', 'archived', 'archive', 'previous', 'old', 'error', 'failed'].includes(String(shop.menu_status || '').trim().toLowerCase());
      const wrongSource = closedTokens.some(token => !ownTokens.has(token) && sourceToken(shop.image_url).includes(token));
      return closed(shop) || hidden || badStatus || wrongSource;
    }).map(shop => String(shop.shop_id)));
  }

  // Only HTTP(S) destinations can become public links; an archive is never an official site.
  function webUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  // Require explicit official-site metadata instead of guessing from an unfamiliar hostname.
  function linkLabel(value, official = false) {
    const url = webUrl(value);
    if (!url) return '';
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'coffeeshopmenus.org' || host.endsWith('.coffeeshopmenus.org')) return 'Menu source';
    if (host === 'coffeeshopdirect.com' || host.endsWith('.coffeeshopdirect.com')) return 'Shop directory';
    return official ? 'Official shop website' : 'External website';
  }

  const api = Object.freeze({ unavailableShopIds, webUrl, linkLabel });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BudfinderData = api;
})(typeof window === 'object' ? window : globalThis);
