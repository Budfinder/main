const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const shipped = name => {
  const match=source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
  assert.ok(match, name);return match[0];
};

function harness() {
  let focus='';
  const elements = new Map();
  for (const id of ['toggle-controls','toggle-shelf','toggle-route','route-tools-dropdown','destination-search','controls-header-toggle','map-tools-title','clear-selection-toggle','clear-route-focus-btn','map-tools-content']) {
    const classes=new Set();
    elements.set(id,{id,open:false,hidden:false,value:id==='destination-search'?'Gelato':'',attributes:{},
      classList:{toggle(name,enabled){if(enabled) classes.add(name);else classes.delete(name);},contains(name){return classes.has(name);}},
      scrollTop:0,parentElement:{scrollTop:27,classList:{contains:()=>false}},getBoundingClientRect(){return {top:100};},scrollTo({top}){this.scrollTop=top;this.scrolled=true;},
      setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},focus(){focus=id;},scrollIntoView(){this.scrolled=true;}
    });
  }
  const plannerSummary={getBoundingClientRect(){return {top:400};},focus(){focus='planner-summary';},scrollIntoView(){this.scrolled=true;}};
  for (const id of ['stash-shelf-title', 'best-match-title', 'map-search-area-status', 'settings-panel', 'nav-settings-btn']) {
    elements.set(id, { id, hidden: id === 'settings-panel', getBoundingClientRect: () => ({top: 480}),
      attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, focus() { focus = id; } });
  }
  elements.set('best-match-list', {querySelector: () => ({})});
  const query=elements.get('destination-search');
  query.select=()=>{query.selected=true;};
  const bodyClasses=new Set();
  const body={classList:{toggle(name,on){if(on)bodyClasses.add(name);else bodyClasses.delete(name);},contains:name=>bodyClasses.has(name)}};
  const location = { pathname: '/map.html', search: '?search=Gelato', hash: '' };
  const history = { replaceState(_data, _title, url) { location.hash = new URL(url, 'https://budfinder.org').hash; } };
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,body},window:{setTimeout:fn=>fn(),clearTimeout(){},location,history},
    isCompactMobileLayout:()=>true,personalisation:{displayName:''},pendingInitialSearchPresentation:true,hasMapSearchQuery:()=>Boolean(query.value),
    controlsVisible:false,controlsCollapsed:false,directionsVisible:false,shelfVisible:false,
    journeyPlanner:{start:{ref:'shop-a'},stops:[{ref:'shop-b'},{ref:'shop-c'}]},selectedCategories:['Coffeeshop'],
    getDefaultLocationCategories:()=>['Coffeeshop'],getSelectedDestinationIndex:()=>null,
    strainFilterText:'',hasExplorerFocus:()=>false,hasLocationSearchFilter:()=>false,hasMissionFilter:()=>false,
    hasCategoryFilter:()=>true,menuExplore:{active:()=>[]},sharedMenuFilters:{},syncExplorerFocusControls(){},
    openRouteTools(){elements.get('route-tools-dropdown').open=true;return {querySelector:()=>plannerSummary};},
    setDirectionsVisible(value){context.directionsVisible=value;},
    setControlsVisible(value, options={}){context.controlsVisible=value;context.controlsCollapsed=Boolean(options.collapsed);if(value)context.shelfVisible=false;context.syncMapActionDock();},
    setControlsCollapsed(value){context.controlsCollapsed=value;context.syncMapActionDock();},
    setShelfVisible(value){context.shelfVisible=value;if(value)context.controlsVisible=false;context.syncMapActionDock();}
  });
  vm.runInContext(['currentMapUserName','getControlsToggleLabel','collapseMapSearchResults','syncMapActionDock','focusMapPanelTarget','toggleMapControlsHeader','openMapAction','closeMapActionPanel','openSettingsPanel','closeSettingsPanel','syncClearSelectionToggle'].map(shipped).join('\n'),context);
  return {context,elements,query,plannerSummary,body,focused:()=>focus};
}

test('phone Search opens the normal menu without focusing the input or clearing saved context', () => {
  const h=harness(); const itinerary=h.context.journeyPlanner;
  h.context.shelfVisible=true;h.elements.get('route-tools-dropdown').open=true;
  h.context.openMapAction('search');
  assert.equal(h.context.controlsVisible,true);assert.equal(h.context.shelfVisible,false);
  assert.equal(h.elements.get('route-tools-dropdown').open,false);
  assert.equal(h.focused(),'controls-header-toggle');assert.equal(h.query.value,'Gelato');
  assert.equal(h.elements.get('map-tools-content').scrollTop,0);
  assert.equal(h.context.journeyPlanner,itinerary);assert.equal(itinerary.stops.length,2);
  assert.equal(h.elements.get('toggle-controls').attributes['aria-expanded'],'true');
});

test('desktop Search still focuses the input directly', () => {
  const h=harness();h.context.isCompactMobileLayout=()=>false;
  h.context.openMapAction('search');
  assert.equal(h.focused(),'destination-search');
});

test('Your route opens and focuses the planner and announces the saved stop count', () => {
  const h=harness();h.context.openMapAction('route');
  assert.equal(h.context.controlsVisible,true);assert.equal(h.elements.get('route-tools-dropdown').open,true);
  assert.equal(h.body.classList.contains('map-route-panel-open'),true);
  assert.equal(h.context.pendingInitialSearchPresentation,false);
  assert.equal(h.focused(),'planner-summary');assert.equal(h.elements.get('map-tools-content').scrollTop,288);assert.equal(h.elements.get('map-tools-content').parentElement.scrollTop,0);
  assert.equal(h.elements.get('toggle-route').textContent,'Your route · 2');
  assert.equal(h.elements.get('toggle-route').attributes['aria-label'],'Your route, 2 stops');
  assert.equal(h.elements.get('toggle-route').attributes['aria-expanded'],'true');
  assert.equal(h.elements.get('toggle-controls').attributes['aria-expanded'],'false');
});

test('Saved strains can be switched directly from search, then closed with focus returned to their button', () => {
  const h=harness();h.context.controlsVisible=true;h.context.openMapAction('saved');
  assert.equal(h.context.shelfVisible,true);assert.equal(h.context.controlsVisible,false);
  assert.equal(h.elements.get('toggle-shelf').attributes['aria-expanded'],'true');
  assert.equal(h.focused(),'stash-shelf-title');
  h.context.closeMapActionPanel();assert.equal(h.context.shelfVisible,false);
  assert.equal(h.focused(),'toggle-shelf');assert.equal(h.query.value,'Gelato');
});

test('closing the route panel preserves its stops and restores keyboard focus', () => {
  const h=harness();h.context.openMapAction('route');h.context.closeMapActionPanel();
  assert.equal(h.context.controlsVisible,false);assert.equal(h.context.journeyPlanner.stops.length,2);
  assert.equal(h.context.pendingInitialSearchPresentation,false);assert.equal(h.body.classList.contains('map-route-panel-open'),false);
  assert.equal(h.focused(),'toggle-route');assert.equal(h.elements.get('toggle-route').attributes['aria-expanded'],'false');
});

test('the normal coffeeshop view does not offer a misleading Undo action', () => {
  const h=harness();h.context.syncClearSelectionToggle();
  assert.equal(h.elements.get('clear-selection-toggle').hidden,true);
  h.context.strainFilterText='Gelato';h.context.syncClearSelectionToggle();
  assert.equal(h.elements.get('clear-selection-toggle').hidden,false);
  assert.equal(h.elements.get('clear-selection-toggle').textContent,'Undo last change');
});


test('the phone results summary offers an accessible way to reopen the search', () => {
  const h=harness();h.context.collapseMapSearchResults({focus:true});
  const header=h.elements.get('controls-header-toggle');
  assert.equal(h.context.controlsCollapsed,true);
  assert.equal(h.elements.get('map-tools-title').textContent,'Show results');
  assert.equal(header.attributes['aria-label'],'Show results');
  assert.equal(header.attributes['aria-describedby'],'controls-summary');
  assert.equal(h.focused(),'controls-header-toggle');
  h.context.openMapAction('search');
  assert.equal(h.context.controlsCollapsed,false);assert.equal(h.query.value,'Gelato');
});

test('collapsing search results leaves an open route planner in place', () => {
  const h=harness();h.context.openMapAction('route');
  const content=h.elements.get('map-tools-content');
  const before=content.scrollTop;
  h.context.collapseMapSearchResults();
  assert.equal(content.scrollTop,before);assert.equal(h.focused(),'planner-summary');
  assert.equal(h.body.classList.contains('map-route-panel-open'),true);
});

test('Show results opens on the list, or on its search area when the list is empty', () => {
  for (const [cards, target] of [[true, 'best-match-title'], [false, 'map-search-area-status']]) {
    const h = harness();
    h.elements.get('best-match-list').querySelector = () => cards ? {} : null;
    h.context.collapseMapSearchResults();
    h.context.toggleMapControlsHeader();
    assert.equal(h.context.controlsCollapsed, false);
    assert.equal(h.focused(), target);
    assert.equal(h.elements.get('map-tools-content').scrollTop, 368);
  }
});

test('map Settings dismisses to its trigger and drops the hash on dismissal or switching to Search', () => {
  const h = harness();
  h.context.openSettingsPanel();
  assert.equal(h.focused(), 'settings-panel');
  assert.equal(h.context.window.location.hash, '#settings');
  assert.equal(h.elements.get('nav-settings-btn').attributes['aria-expanded'], 'true');
  h.context.closeMapActionPanel();
  assert.equal(h.elements.get('settings-panel').hidden, true);
  assert.equal(h.focused(), 'nav-settings-btn');
  assert.equal(h.context.window.location.hash, '');
  h.context.openSettingsPanel();
  h.context.openMapAction('search', { selectQuery: true });
  assert.equal(h.elements.get('settings-panel').hidden, true);
  assert.equal(h.elements.get('nav-settings-btn').attributes['aria-expanded'], 'false');
  assert.equal(h.query.selected, true);
  assert.equal(h.focused(), 'destination-search');
  h.context.openSettingsPanel();
  h.context.closeSettingsPanel();
  assert.equal(h.focused(), 'nav-settings-btn');
  assert.equal(h.context.controlsVisible, false);
});

test('the saved shelf shows all ten saved strains while a different strain is being searched', () => {
  const names = Array.from({ length: 10 }, (_, index) => `Saved ${index + 1}`);
  const scope = vm.createContext({ shelfStrainNames: names, strainFilterText: 'Current search',
    offeringAttributeFilterKind: '', getCanonicalStrainName: String, normaliseText: value => value.toLowerCase(),
    getStrainVisualMeta: () => ({}) });
  vm.runInContext(shipped('getStashShelfEntries'), scope);
  assert.deepEqual(Array.from(scope.getStashShelfEntries(), item => item.name), names);
  assert.equal(scope.getStashShelfEntries(true)[0].name, 'Current search');
});
