/* Protect the map's compact controls and its optional discovery action. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../map.html'), 'utf8');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../styles/budfinder-map-controls.css'), 'utf8');

test('places stays above search and the search and price explanations share one control', () => {
  assert.ok(html.indexOf('class="panel-section map-category-shortcuts') < html.indexOf('class="panel-section search-wanted-panel'));
  const help = html.match(/<details class="map-matching-help">([^]*?)<\/details>/)[1];
  assert.match(help, /How search and prices work/);
  assert.match(help, /Search matches/);
  assert.match(help, /Price comparisons/);
  assert.match(help, /same strain, currency and unit/);
  assert.match(html, /class="map-quick-searches"/);
});

test('compact results can be expanded and restored without losing their actions', () => {
  assert.match(html, /id="best-match-compact"[^>]*aria-pressed="false"[^>]*>Detailed view/);
  assert.match(html, /id="best-match-list" class="best-match-list is-compact"/);
  const match = source.match(/document\.getElementById\('best-match-compact'\)\.addEventListener\('click', (event => \{[^]*?\n    \})\);/);
  assert.ok(match, 'The real view toggle is present');
  const state = new Set(['is-compact']);
  const button = {attrs: {'aria-pressed':'false'}, getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; }, textContent: 'Detailed view'};
  const context = vm.createContext({bestMatchList:{classList:{toggle(name, on) { if(on) state.add(name); else state.delete(name); }}}});
  const click = vm.runInContext(`(${match[1]})`, context);
  click({currentTarget:button});
  assert.equal(state.has('is-compact'),false);
  assert.equal(button.attrs['aria-pressed'],'true');
  click({currentTarget:button});
  assert.equal(state.has('is-compact'),true);
  assert.equal(button.attrs['aria-pressed'],'false');
  assert.equal(button.textContent,'Detailed view');
  assert.match(css, /\.best-match-list\.is-compact \.best-match-actions\s*\{\s*display:\s*flex/);
});

test('nearby discovery stays hidden without a profile and clear filters stays on screen', () => {
  assert.match(html, /id="skunk-nearby-button"[^>]*hidden/);
  assert.match(css, /#ui-toggles button\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(html, /id="clear-map-filters"[^>]*aria-label="Clear all filters"/);
});

test('nearby results precede the optional explanation while radius remains visible', () => {
  const dialog = html.slice(html.indexOf('<dialog id="skunk-nearby-dialog"'), html.indexOf('</dialog>', html.indexOf('<dialog id="skunk-nearby-dialog"')));
  assert.ok(dialog.indexOf('id="skunk-nearby-radius"') < dialog.indexOf('id="skunk-nearby-results"'));
  assert.ok(dialog.indexOf('id="skunk-nearby-results"') < dialog.indexOf('class="skunk-nearby-help"'));
  assert.match(dialog, /Distances are straight-line/);
});
