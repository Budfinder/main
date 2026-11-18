const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const searchSource = fs.readFileSync(require.resolve('../scripts/budfinder-search.js'), 'utf8');
const shipped = name => {
  const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
  assert.ok(match, name);
  return match[0];
};

function harness(query, options = {}) {
  const timers = [], applied = [], strains = [], urls = [], reads = [], fits = [], switches = [];
  const input = { value: query };
  const status = { textContent: '' };
  const rows = options.rows || [{ grower: 'Amsterdam Exotics', shop_id: 147 }, { grower: 'Jordaan Genetics', shop_id: 1 }, { grower: 'Katsu Seeds', shop_id: 2 }];
  const context = vm.createContext({
    document: { activeElement: null, getElementById: id => id === 'destination-search' ? input : id === 'destination-search-status' ? status : null },
    window: { setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {} },
    locations: [{ name: 'Katsu' }, { name: 'Jordaan', area: true }],
    discoveredCsvPaths: ['Amsterdam.csv', 'Den Haag.csv', 'Netherlands.csv'],
    isMasterCoffeeshopPath: path => path === 'Netherlands.csv', csvLabelFromPath: path => path.replace('.csv', ''),
    isAreaLocation: loc => !!loc.area, getAreaSearchAliases: loc => [loc.name],
    globalSearchResolveRequestId: 0, globalSearchStrainTimer: null, activeStrainNames: options.names || ['Gelato'],
    globalSearchAppliedStrainKey: '', pendingInitialSearchPresentation: true,
    updateDestinationSearchStatus() {}, refreshDestinationCards() {}, focusSearchResultsPanel() {}, fitMapToVisibleMarkers() { fits.push(true); },
    async openGlobalDestinationSearchTarget() { return false; },
    bestGlobalStrainMatch() { return ''; }, isActiveOfferingRowAvailable: () => true,
    async loadActiveOfferingsRows() { reads.push('menus'); return rows; },
    async applyOfferingAttributeFilter(kind, value) { applied.push({ kind, value }); return true; },
    async applyStrainFilter(query) { strains.push(query); return true; },
    updateDestinationDropdown() {}, updateMarkers() {},
    syncMapViewToSearchRows() { switches.push(true); }, syncMapSearchUrl: query => urls.push(query), updateGlobalSearchSuggestions() {}
  });
  vm.runInContext(searchSource, context);
  vm.runInContext(['normaliseText', 'normaliseGlobalSearchCity', 'findCsvPathForGlobalSearchCity', 'getOfferingAttributeMatch', 'collectMatchedActiveOfferingRows', 'scheduleGlobalSearchStrainResolve'].map(shipped).join('\n'), context);
  return { context, input, applied, strains, urls, reads, fits, switches, async resolve() {
    context.scheduleGlobalSearchStrainResolve(query, 163, { immediate: true, allowTownSwitch: true, entityKind: options.kind });
    await timers.shift()();
  } };
}

for (const query of ['Amsterdam', 'The Hague', 'Katsu', 'Jordaan']) {
  test(`exact place “${query}” survives the later grower/strain resolution`, async () => {
    const h = harness(query);
    await h.resolve();
    assert.equal(h.input.value, query);
    assert.equal(h.applied.length, 0);
    assert.equal(h.reads.length, 0, 'The delayed menu lookup cannot reinterpret an exact place');
    assert.equal(h.context.pendingInitialSearchPresentation, false);
  });
}

test('an explicit grower search still resolves normally', async () => {
  const h = harness('Amsterdam Exotics');
  await h.resolve();
  assert.deepEqual(h.applied, [{ kind: 'grower', value: 'Amsterdam Exotics' }]);
  assert.equal(h.input.value, 'Amsterdam Exotics');
  assert.deepEqual(h.urls, ['Amsterdam Exotics']);
});

test('a stale scheduled query cannot overwrite a subsequent edit', async () => {
  const h = harness('Amsterdam');
  h.input.value = 'Amsterdam Exotics';
  await h.resolve();
  assert.equal(h.input.value, 'Amsterdam Exotics');
  assert.equal(h.applied.length, 0);
  assert.equal(h.reads.length, 0);
});


for (const query of ['g13', 'G-13', 'g 13']) {
  test(`submitted ${query} selects G-13 and cannot be intercepted by a partial grower`, async () => {
    const h = harness(query, { names: ['G-13', 'G13 Haze'], rows: [
      { strain_name: 'G-13', grower: 'G13 Genetics', shop_id: 1 },
      { strain_name: 'G13 Haze', shop_id: 2 }
    ] });
    await h.resolve();
    assert.deepEqual(h.strains, ['G-13']);
    assert.equal(h.applied.length, 0);
    assert.equal(h.input.value, 'G-13');
    assert.deepEqual(h.urls, ['G-13']);
    assert.equal(h.fits.length, 1, 'A submitted strain search frames the matching shops');
    assert.equal(h.switches.length, 0, 'A strain search does not switch city');
  });
}

test('choosing a grower explicitly keeps that intent even when a strain has the same name', async () => {
  const h = harness('G13', { kind: 'grower', names: ['G-13'], rows: [{grower:'G13',shop_id:1}] });
  await h.resolve();
  assert.deepEqual(h.applied, [{kind:'grower',value:'G13'}]);
  assert.equal(h.strains.length, 0);
});

test('two-character strains such as K2 can be submitted from the map too', async () => {
  const h = harness('K2', {names:['K2'],rows:[{strain_name:'K2',shop_id:1}]});
  await h.resolve();
  assert.deepEqual(h.strains, ['K2']);
});
