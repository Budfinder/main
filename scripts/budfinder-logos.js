(() => {
  'use strict';

  const LOGO_BASE_PATHS = ['images/logos/'];
  const LOGO_FILE_ALIASES = new Map([
    ['best_friends_centrum.png', 'best_friends_oost.png'],
    ['bulldog_energy.png', 'bulldog_rockshop.png'],
    ['bulldog_no_90.png', 'bulldog_rockshop.png'],
    ['bulldog_palace.png', 'bulldog_rockshop.png']
  ]);

  function logoSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^cs-/, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function logoInitials(value, fallback = 'CS') {
    const parts = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || fallback).slice(0, 2);
  }

  function monogramDataUrl(shopName, shopKey, filename) {
    const label = shopName || logoSlug(shopKey).replace(/_/g, ' ') || filename || 'Coffeeshop';
    const monogram = logoInitials(label);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
        `<rect width="96" height="96" rx="22" fill="#f7fbf8"/>` +
        `<circle cx="48" cy="48" r="35" fill="#183f32"/>` +
        `<text x="48" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="#ffffff">${monogram}</text>` +
      `</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function addLogoPath(out, seen, rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return;
    if (/^(?:data:|https?:\/\/)/i.test(raw)) {
      if (!seen.has(raw)) {
        seen.add(raw);
        out.push(raw);
      }
      return;
    }
    const clean = raw.replace(/^\.?\//, '').replace(/^\/+/, '');
    if (!clean) return;
    const parts = clean.split('/').filter(Boolean);
    const basename = parts[parts.length - 1] || clean;
    const paths = clean.includes('/')
      ? [clean, ...LOGO_BASE_PATHS.flatMap(base => [`${base}${encodeURIComponent(basename)}`, `${base}${basename}`])]
      : LOGO_BASE_PATHS.flatMap(base => [`${base}${encodeURIComponent(basename)}`, `${base}${basename}`]);
    paths.forEach(path => {
      if (seen.has(path)) return;
      seen.add(path);
      out.push(path);
    });
  }

  function candidates(options = {}) {
    const settings = typeof options === 'string' ? { filename: options } : (options || {});
    const filename = String(settings.filename || '').trim();
    const shopKey = String(settings.shopKey || '').trim();
    const shopName = String(settings.shopName || '').trim();
    const out = [];
    const seen = new Set();
    const filenames = [];

    if (filename) filenames.push(filename);
    [logoSlug(shopKey), logoSlug(shopName)]
      .filter(Boolean)
      .forEach(slug => {
        filenames.push(`${slug}.png`, `${slug}.jpg`, `${slug}.svg`);
      });

    filenames.forEach(candidate => {
      addLogoPath(out, seen, candidate);
      const basename = String(candidate).split('/').filter(Boolean).at(-1) || '';
      const alias = LOGO_FILE_ALIASES.get(basename.toLowerCase());
      if (alias) addLogoPath(out, seen, alias);
    });

    if (settings.includeMonogram !== false) {
      const fallback = monogramDataUrl(shopName, shopKey, filename);
      if (!seen.has(fallback)) out.push(fallback);
    }
    return out;
  }

  function advanceImage(img) {
    if (!img) return false;
    const all = String(img.getAttribute('data-candidates') || '').split('|').filter(Boolean);
    const nextIndex = Number(img.getAttribute('data-idx') || 0) + 1;
    if (!all[nextIndex]) return false;
    img.setAttribute('data-idx', String(nextIndex));
    img.src = all[nextIndex];
    return true;
  }

  window.BudfinderLogos = Object.freeze({
    advanceImage,
    candidates,
    initials: logoInitials,
    slug: logoSlug
  });
})();
