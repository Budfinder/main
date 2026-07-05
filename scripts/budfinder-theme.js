(() => {
  'use strict';

  const STORAGE_KEYS = ['budfinder_personalisation', 'locate3_personalisation', 'locate2_personalisation'];
  const HERO_THEME_PRESETS = [
    {
      key: 'kings-juice',
      label: 'Kings Juice',
      bgTop: '#06100e',
      bgMid: '#0a1918',
      bgBottom: '#07100f',
      text: '#f4fff8',
      muted: '#a8bdb4',
      accent: '#4df49a',
      accentStrong: '#16b76d',
      secondary: '#f0b854',
      border: 'rgba(153, 255, 203, 0.16)',
      panel: 'rgba(10, 22, 20, 0.72)',
      panelStrong: 'rgba(12, 27, 24, 0.9)',
      panelAlt: 'rgba(255, 255, 255, 0.07)',
      chip: 'rgba(77, 244, 154, 0.1)'
    },
    {
      key: 'blue-zushi',
      label: 'Blue Zushi',
      bgTop: '#030b13',
      bgMid: '#071622',
      bgBottom: '#050a12',
      text: '#eff8ff',
      muted: '#a5bac4',
      accent: '#61e8ff',
      accentStrong: '#2aa8bd',
      secondary: '#a4ff6a',
      border: 'rgba(97, 232, 255, 0.18)',
      panel: 'rgba(7, 18, 29, 0.76)',
      panelStrong: 'rgba(8, 22, 34, 0.92)',
      panelAlt: 'rgba(182, 236, 255, 0.08)',
      chip: 'rgba(97, 232, 255, 0.11)'
    },
    {
      key: 'shoreline',
      label: 'Shoreline',
      bgTop: '#061416',
      bgMid: '#10241f',
      bgBottom: '#07100f',
      text: '#fff8e8',
      muted: '#c2ba9f',
      accent: '#5fe6b0',
      accentStrong: '#249b79',
      secondary: '#f6c66f',
      border: 'rgba(246, 198, 111, 0.2)',
      panel: 'rgba(14, 28, 25, 0.76)',
      panelStrong: 'rgba(17, 33, 29, 0.92)',
      panelAlt: 'rgba(246, 198, 111, 0.08)',
      chip: 'rgba(95, 230, 176, 0.1)'
    },
    {
      key: 'amazing-haze',
      label: 'Amazing Haze',
      bgTop: '#07120a',
      bgMid: '#0d2012',
      bgBottom: '#09100b',
      text: '#f4fff1',
      muted: '#adc4a8',
      accent: '#7df37b',
      accentStrong: '#2aa94b',
      secondary: '#d6e86c',
      border: 'rgba(125, 243, 123, 0.18)',
      panel: 'rgba(10, 25, 13, 0.76)',
      panelStrong: 'rgba(13, 32, 18, 0.92)',
      panelAlt: 'rgba(125, 243, 123, 0.08)',
      chip: 'rgba(125, 243, 123, 0.11)'
    },
    {
      key: 'moonrocks',
      label: 'Moonrocks',
      bgTop: '#120d07',
      bgMid: '#21170c',
      bgBottom: '#0d0c09',
      text: '#fff7e8',
      muted: '#c8bda6',
      accent: '#ffbf63',
      accentStrong: '#c97822',
      secondary: '#55e79c',
      border: 'rgba(255, 191, 99, 0.2)',
      panel: 'rgba(26, 19, 11, 0.76)',
      panelStrong: 'rgba(35, 25, 13, 0.92)',
      panelAlt: 'rgba(255, 191, 99, 0.08)',
      chip: 'rgba(255, 191, 99, 0.11)'
    },
    {
      key: 'classic-budfinder',
      label: 'Classic Budfinder',
      bgTop: '#efe2b6',
      bgMid: '#e6d9b6',
      bgBottom: '#d4e2cb',
      text: '#203128',
      muted: '#5b6b61',
      accent: '#2e7b59',
      accentStrong: '#205b42',
      secondary: '#b46b20',
      border: 'rgba(98, 113, 95, 0.18)',
      panel: 'rgba(255, 249, 239, 0.84)',
      panelStrong: 'rgba(255, 252, 246, 0.94)',
      panelAlt: 'rgba(255, 255, 255, 0.52)',
      chip: 'rgba(46, 123, 89, 0.13)'
    }
  ];
  const LEGACY_OPTIONS = [
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
  const LEGACY_THEME_PRESETS = LEGACY_OPTIONS.map(([key, label, accent, accentStrong, bgTop, bgMid, bgBottom]) => ({
    key,
    label,
    accent,
    accentStrong,
    bgTop,
    bgMid,
    bgBottom,
    text: '#203128',
    muted: '#5b6b61',
    secondary: key === 'lemon-haze' ? '#8a7614' : '#b46b20',
    border: rgba(accentStrong, 0.18),
    panel: 'rgba(255, 249, 239, 0.84)',
    panelStrong: 'rgba(255, 252, 246, 0.94)',
    panelAlt: 'rgba(255, 255, 255, 0.52)',
    chip: rgba(accent, 0.13),
    classic: true
  }));
  const THEME_PRESETS = [...HERO_THEME_PRESETS, ...LEGACY_THEME_PRESETS];
  const OPTIONS = THEME_PRESETS.map(theme => [
    theme.key,
    theme.label,
    theme.accent,
    theme.accentStrong,
    theme.bgTop,
    theme.bgMid,
    theme.bgBottom
  ]);
  const ALIASES = {
    'neon-night': 'kings-juice',
    'midnight-radar': 'blue-zushi',
    'canal-glow': 'shoreline',
    'emerald-haze': 'amazing-haze',
    'amber-route': 'moonrocks',
    'kings juice': 'kings-juice',
    "king's juice": 'kings-juice',
    'blue zushi': 'blue-zushi',
    amazinghaze: 'amazing-haze',
    'amazing haze': 'amazing-haze',
    amber: 'moonrocks',
    lagoon: 'shoreline',
    ember: 'moonrocks',
    moss: 'northern-lights',
    'golden-haze': 'moonrocks',
    'pine-resin': 'amazing-haze',
    'citrus-haze': 'moonrocks',
    'rosewood-smoke': 'shoreline',
    'coastal-kush': 'blue-zushi',
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

  const themes = new Map(THEME_PRESETS.map(theme => [theme.key, theme]));

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

  function relativeLuminance(hex) {
    return hexToRgb(hex).map(channel => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  }

  function contrastRatio(lumA, lumB) {
    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function bestTextForBackgrounds(backgrounds) {
    const darkText = '#06100e';
    const lightText = '#fffaf4';
    const darkLum = relativeLuminance(darkText);
    const lightLum = relativeLuminance(lightText);
    const backgroundLums = backgrounds.map(relativeLuminance);
    const darkScore = Math.min(...backgroundLums.map(lum => contrastRatio(darkLum, lum)));
    const lightScore = Math.min(...backgroundLums.map(lum => contrastRatio(lightLum, lum)));
    return darkScore >= lightScore ? darkText : lightText;
  }

  function normaliseThemeKey(value) {
    const raw = String(value || '').trim();
    const lower = raw.toLowerCase();
    return themes.has(raw) ? raw : (ALIASES[lower] || (themes.has(lower) ? lower : 'kings-juice'));
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
    return 'kings-juice';
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
    const theme = themes.get(themeKey) || themes.get('kings-juice');
    const isClassic = !!theme.classic || theme.key === 'classic-budfinder';
    setCssVar('--bg-top', theme.bgTop);
    setCssVar('--bg-mid', theme.bgMid);
    setCssVar('--bg-bottom', theme.bgBottom);
    setCssVar('--page-bg', theme.bgBottom);
    setCssVar('--accent', theme.accent);
    setCssVar('--accent-strong', theme.accentStrong);
    setCssVar('--secondary-accent', theme.secondary);
    setCssVar('--accent-soft', rgba(theme.accent, 0.16));
    setCssVar('--accent-glow', rgba(theme.accent, 0.28));
    setCssVar('--sun-wash', isClassic ? rgba(theme.bgTop, 0.92) : rgba(theme.accent, 0.12));
    setCssVar('--mist-wash', rgba(theme.accent, isClassic ? 0.2 : 0.16));
    setCssVar('--resin-glow', rgba(theme.secondary, isClassic ? 0.22 : 0.16));
    setCssVar('--ink', theme.text);
    setCssVar('--muted', theme.muted);
    setCssVar('--soft', rgba(theme.text, isClassic ? 0.58 : 0.56));
    setCssVar('--panel', theme.panel);
    setCssVar('--panel-strong', theme.panelStrong);
    setCssVar('--panel-border', theme.border);
    setCssVar('--panel-alt', theme.panelAlt);
    setCssVar('--island-bg', theme.panel);
    setCssVar('--line', theme.border);
    setCssVar('--line-strong', rgba(theme.accent, 0.28));
    setCssVar('--chip-bg', theme.chip);
    setCssVar('--button-bg', `linear-gradient(135deg, ${theme.accent}, ${theme.secondary})`);
    setCssVar('--button-hover', `linear-gradient(135deg, ${theme.secondary}, ${theme.accent})`);
    setCssVar('--button-text', bestTextForBackgrounds([theme.accent, theme.secondary]));
    setCssVar('--leaf-pattern-opacity', isClassic ? '0.065' : '0.035');
    setCssVar('--leaf-pattern-blend', isClassic ? 'multiply' : 'screen');
    setCssVar('--control-color-scheme', isClassic ? 'light' : 'dark');
    setCssVar('--control-bg', isClassic ? 'rgba(255, 255, 255, 0.72)' : rgba(theme.text, 0.1));
    setCssVar('--control-bg-strong', isClassic ? 'rgba(255, 255, 255, 0.88)' : rgba(theme.text, 0.16));
    setCssVar('--control-bg-hover', isClassic ? 'rgba(255, 255, 255, 0.96)' : rgba(theme.text, 0.22));
    setCssVar('--control-border', isClassic ? 'rgba(92, 107, 97, 0.16)' : rgba(theme.text, 0.2));
    setCssVar('--control-text', theme.text);
    setCssVar('--control-muted', theme.muted);
    setCssVar('--control-selected-bg', isClassic ? rgba(theme.accent, 0.14) : rgba(theme.accent, 0.22));
    setCssVar('--control-selected-border', rgba(theme.accent, isClassic ? 0.3 : 0.42));
    setCssVar('--amber', theme.secondary);
    setCssVar('--amber-strong', theme.secondary);
    setCssVar('--green', theme.accent);
    setCssVar('--green-strong', theme.accentStrong);
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
