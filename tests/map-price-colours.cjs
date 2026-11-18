/* Price colours must retain their meaning and contrast across map themes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../styles/budfinder-map-controls.css'), 'utf8');
const html = fs.readFileSync(require.resolve('../map.html'), 'utf8');

// Read the shipped colour declarations, rather than a separate test palette.
function priceColour(kind, tone) {
  const selector = `.popup-menu-value-summary.is-${kind}`;
  const rules = [...css.matchAll(/([^{}]+)\{\s*color:\s*(#[\da-f]{6})\s*;\s*\}/gi)];
  const rule = rules.find(match => match[1].includes(selector) && match[1].includes('data-map-theme-tone="dark"') === (tone === 'dark'));
  assert.ok(rule, `${tone} ${kind} summary and strain labels`);
  assert.match(rule[1], new RegExp(`\\.popup-strain-value\\.is-${kind}`));
  return rule[2];
}

// Calculate contrast against the actual dark control surfaces and light panels.
function luminance(hex) {
  const values = hex.match(/[\da-f]{2}/gi).map(part => parseInt(part, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((first, second) => first - second);
  return (y + 0.05) / (x + 0.05);
}

test('below average is green and above average is red regardless of theme accents', () => {
  for (const tone of ['light', 'dark']) {
    const green = priceColour('cheaper', tone).match(/[\da-f]{2}/gi).map(part => parseInt(part, 16));
    const red = priceColour('expensive', tone).match(/[\da-f]{2}/gi).map(part => parseInt(part, 16));
    assert.ok(green[1] > green[0] && green[1] > green[2], `${tone} cheaper`);
    assert.ok(red[0] > red[1] && red[0] > red[2], `${tone} expensive`);
  }
  assert.match(html, /budfinder-map-controls\.css\?v=[\w-]+/);
});

test('both colours are readable against the map theme surfaces', () => {
  const themeDeclaration = source.match(/    const mapThemeToneOverrides = \{[^]*?^    };/m)[0];
  const themes = vm.runInNewContext(`${themeDeclaration}\nmapThemeToneOverrides`);
  for (const theme of Object.values(themes)) {
    for (const background of [theme.surface, theme.surfaceStrong]) {
      for (const kind of ['cheaper', 'expensive']) {
        assert.ok(contrast(priceColour(kind, 'dark'), background) >= 4.5, `${kind} on ${background}`);
      }
    }
  }
  for (const background of ['#ffffff', '#fff9ef']) {
    for (const kind of ['cheaper', 'expensive']) assert.ok(contrast(priceColour(kind, 'light'), background) >= 4.5);
  }
});
