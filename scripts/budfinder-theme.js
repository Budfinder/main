(() => {
  'use strict';

  const STORAGE_KEYS = ['budfinder_personalisation', 'locate3_personalisation', 'locate2_personalisation'];
  const OPTIONS = [
    ['northern-lights', 'Northern Lights', '#2e7b59', '#205b42', '#efe2b6', '#e6d9b6', '#d4e2cb'],
    ['lemon-haze', 'Lemon Haze', '#c3b018', '#7f7208', '#fff09f', '#f4e67a', '#d8e7a2'],
    ['mimosa', 'Mimosa', '#df7a2f', '#8f4413', '#ffd2a1', '#ffbc87', '#f0d0a7'],
    ['og-kush', 'OG Kush', '#3d7a3c', '#224a27', '#e7d7b0', '#dbd1af', '#cadec6'],
    ['sour-diesel', 'Sour Diesel', '#7aa11f', '#4e6713', '#efe39c', '#dde09a', '#cfe0b7'],
    ['wizard-fuel-pheno', 'Wizard Fuel Pheno', '#3f6e5a', '#233e35', '#ddd9c5', '#d2d8cf', '#c8d5dd'],
    ['pineapple-express', 'Pineapple Express', '#b36d2b', '#78451a', '#f4dc9e', '#ebcf8e', '#d7e0b5'],
    ['super-silver-haze', 'Super Silver Haze', '#7b889b', '#475366', '#e8e7df', '#d6dde4', '#c5d1dd'],
    ['tropicana-cherry', 'Tropicana Cherry', '#d4684b', '#8a3d28', '#ffc8a3', '#ffb4a0', '#f0c8bf'],
    ['gelonade', 'Gelonade', '#8bb020', '#55700f', '#f0ef9b', '#dfe97d', '#cce2a5'],
    ['blue-dream', 'Blue Dream', '#2a6d99', '#184564', '#e4dfc7', '#d9e0d8', '#c8dff0'],
    ['cherry-gelato', 'Cherry Gelato', '#8f4058', '#572438', '#efd0d9', '#e4ccd1', '#d9d5d8'],
    ['white-widow', 'White Widow', '#7ea69a', '#4a625b', '#fbfaf2', '#edf3ee', '#dce8e4'],
    ['wedding-cake', 'Wedding Cake', '#b7818d', '#744754', '#f5e4db', '#ece2dd', '#dddcd7'],
    ['runtz', 'Runtz', '#c2479c', '#7c2a63', '#ffd0dd', '#f5c8e4', '#e5d2f2'],
    ['zkittlez', 'Zkittlez', '#6aa53f', '#3f6626', '#efe3a6', '#dfe0a6', '#d0e2bb'],
    ['strawberry-cough', 'Strawberry Cough', '#c85e64', '#823038', '#f5d3d1', '#edd5d7', '#e0d9dc'],
    ['purple-haze', 'Purple Haze', '#7a4cff', '#4025a8', '#e7dcff', '#d5d3ff', '#c8d9f2'],
    ['granddaddy-purple', 'Granddaddy Purple', '#6c3f84', '#3e234f', '#e8d0ea', '#dcc7e0', '#d4c6d4'],
    ['west-ham-united', 'West Ham United', '#7a263a', '#4d1826', '#efd8de', '#e1d7df', '#d3e1eb'],
    ['spurs', 'Spurs', '#10264d', '#09162e', '#f4f4f8', '#e8eaf2', '#d8deec']
  ];
  const ALIASES = {
    amber: 'lemon-haze',
    lagoon: 'blue-dream',
    ember: 'cherry-gelato',
    moss: 'northern-lights',
    'golden-haze': 'lemon-haze',
    'pine-resin': 'og-kush',
    'citrus-haze': 'pineapple-express',
    'rosewood-smoke': 'cherry-gelato',
    'coastal-kush': 'blue-dream',
    'sour diesel': 'sour-diesel',
    'super silver haze': 'super-silver-haze',
    'tropicana cherry': 'tropicana-cherry',
    'white widow': 'white-widow',
    'wedding cake': 'wedding-cake',
    'strawberry cough': 'strawberry-cough',
    'purple haze': 'purple-haze',
    'wizard fuel pheno': 'wizard-fuel-pheno',
    'west-ham': 'west-ham-united',
    'tottenham-hotspur': 'spurs'
  };

  const themes = new Map(OPTIONS.map(([key, label, accent, accentStrong, bgTop, bgMid, bgBottom]) => [
    key,
    { key, label, accent, accentStrong, bgTop, bgMid, bgBottom }
  ]));

  function hexToRgb(hex) {
    const raw = String(hex || '').replace('#', '').trim();
    if (raw.length !== 6) return [46, 123, 89];
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16)
    ];
  }

  function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function normaliseThemeKey(value) {
    const raw = String(value || '').trim();
    const lower = raw.toLowerCase();
    return themes.has(raw) ? raw : (ALIASES[lower] || (themes.has(lower) ? lower : 'northern-lights'));
  }

  function parseJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  }

  function readStoredTheme() {
    for (const key of STORAGE_KEYS) {
      const parsed = parseJson(key);
      if (parsed && parsed.accent) return normaliseThemeKey(parsed.accent);
    }
    return 'northern-lights';
  }

  function writeStoredTheme(themeKey) {
    const current = parseJson(STORAGE_KEYS[0]);
    const next = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    next.accent = themeKey;
    try {
      localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(next));
    } catch (_err) {
      // Storage can be blocked, but the current page can still update visually.
    }
  }

  function setCssVar(name, value) {
    document.documentElement.style.setProperty(name, value);
  }

  function syncSelectors(themeKey) {
    document.querySelectorAll('[data-budfinder-vibe-selector]').forEach(select => {
      if (!select.options.length) {
        OPTIONS.forEach(([key, label]) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = label;
          select.appendChild(option);
        });
      }
      if (select.value !== themeKey) select.value = themeKey;
    });
  }

  function applyTheme(value, options = {}) {
    const themeKey = normaliseThemeKey(value);
    const theme = themes.get(themeKey) || themes.get('northern-lights');
    setCssVar('--bg-top', theme.bgTop);
    setCssVar('--bg-mid', theme.bgMid);
    setCssVar('--bg-bottom', theme.bgBottom);
    setCssVar('--accent', theme.accent);
    setCssVar('--accent-strong', theme.accentStrong);
    setCssVar('--accent-soft', rgba(theme.accent, 0.16));
    setCssVar('--accent-glow', rgba(theme.accent, 0.28));
    setCssVar('--sun-wash', rgba(theme.bgTop, 0.92));
    setCssVar('--mist-wash', rgba(theme.accent, 0.2));
    setCssVar('--resin-glow', rgba(theme.accentStrong, 0.22));
    setCssVar('--panel', 'rgba(255, 249, 239, 0.84)');
    setCssVar('--panel-strong', 'rgba(255, 252, 246, 0.94)');
    setCssVar('--panel-border', rgba(theme.accentStrong, 0.18));
    setCssVar('--panel-alt', 'rgba(255, 255, 255, 0.52)');
    syncSelectors(themeKey);
    if (options.save !== false) writeStoredTheme(themeKey);
    if (options.dispatch !== false) {
      window.dispatchEvent(new CustomEvent('budfinder:vibechange', {
        detail: { accent: themeKey, theme }
      }));
    }
    return themeKey;
  }

  function bindSelectors() {
    const current = readStoredTheme();
    syncSelectors(current);
    document.querySelectorAll('[data-budfinder-vibe-selector]').forEach(select => {
      if (select.dataset.budfinderVibeBound === 'true') return;
      select.dataset.budfinderVibeBound = 'true';
      select.addEventListener('change', () => {
        applyTheme(select.value);
      });
    });
    applyTheme(current, { save: false, dispatch: false });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  window.BudfinderTheme = {
    applyTheme,
    bindSelectors,
    normaliseThemeKey,
    options: OPTIONS.map(([key, label]) => ({ key, label }))
  };

  window.addEventListener('storage', event => {
    if (!STORAGE_KEYS.includes(event.key)) return;
    applyTheme(readStoredTheme(), { save: false, dispatch: false });
  });

  onReady(bindSelectors);
})();
