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
  for (const id of ['toggle-controls','toggle-shelf','toggle-route','route-tools-dropdown','destination-search','clear-selection-toggle','clear-route-focus-btn','map-tools-content']) {
    const classes=new Set();
    elements.set(id,{id,open:false,hidden:false,value:id==='destination-search'?'Gelato':'',attributes:{},
      classList:{toggle(name,enabled){if(enabled) classes.add(name);else classes.delete(name);},contains(name){return classes.has(name);}},
      scrollTop:0,parentElement:{scrollTop:27,classList:{contains:()=>false}},getBoundingClientRect(){return {top:100};},scrollTo({top}){this.scrollTop=top;this.scrolled=true;},
      setAttribute(name,value){this.attributes[name]=value;},focus(){focus=id;},scrollIntoView(){this.scrolled=true;}
    });
  }
  const plannerSummary={getBoundingClientRect(){return {top:400};},focus(){focus='planner-summary';},scrollIntoView(){this.scrolled=true;}};
  const query=elements.get('destination-search');
  const bodyClasses=new Set();
  const body={classList:{toggle(name,on){if(on)bodyClasses.add(name);else bodyClasses.delete(name);},contains:name=>bodyClasses.has(name)}};
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,body},window:{setTimeout:fn=>fn(),clearTimeout(){}},
    isCompactMobileLayout:()=>true,personalisation:{displayName:''},pendingInitialSearchPresentation:true,globalSearchFocusTimer:null,
    controlsVisible:false,controlsCollapsed:false,directionsVisible:false,shelfVisible:false,
    journeyPlanner:{start:{ref:'shop-a'},stops:[{ref:'shop-b'},{ref:'shop-c'}]},selectedCategories:['Coffeeshop'],
    getDefaultLocationCategories:()=>['Coffeeshop'],getSelectedDestinationIndex:()=>null,
    strainFilterText:'',hasExplorerFocus:()=>false,hasLocationSearchFilter:()=>false,hasMissionFilter:()=>false,
    hasCategoryFilter:()=>true,menuExplore:{active:()=>[]},sharedMenuFilters:{},syncExplorerFocusControls(){},
    openRouteTools(){elements.get('route-tools-dropdown').open=true;return {querySelector:()=>plannerSummary};},
    setDirectionsVisible(value){context.directionsVisible=value;},
    setControlsVisible(value){context.controlsVisible=value;context.controlsCollapsed=false;if(value)context.shelfVisible=false;context.syncMapActionDock();},
    setShelfVisible(value){context.shelfVisible=value;if(value)context.controlsVisible=false;context.syncMapActionDock();}
  });
  vm.runInContext(['currentMapUserName','getControlsToggleLabel','focusSearchResultsPanel','syncMapActionDock','focusMapPanelTarget','openMapAction','closeMapActionPanel','syncClearSelectionToggle'].map(shipped).join('\n'),context);
  return {context,elements,query,plannerSummary,body,focused:()=>focus};
}

test('Search returns from route or saved panels without clearing the typed query or itinerary', () => {
  const h=harness(); const itinerary=h.context.journeyPlanner;
  h.context.shelfVisible=true;h.elements.get('route-tools-dropdown').open=true;
  h.context.openMapAction('search');
  assert.equal(h.context.controlsVisible,true);assert.equal(h.context.shelfVisible,false);
  assert.equal(h.elements.get('route-tools-dropdown').open,false);
  assert.equal(h.focused(),'destination-search');assert.equal(h.query.value,'Gelato');
  assert.equal(h.context.journeyPlanner,itinerary);assert.equal(itinerary.stops.length,2);
  assert.equal(h.elements.get('toggle-controls').attributes['aria-expanded'],'true');
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


test('a search completing in the background cannot scroll the route planner away', () => {
  const h=harness();h.context.openMapAction('route');
  const content=h.elements.get('map-tools-content');
  const before=content.scrollTop;
  h.context.focusSearchResultsPanel();
  assert.equal(content.scrollTop,before);assert.equal(h.focused(),'planner-summary');
  assert.equal(h.body.classList.contains('map-route-panel-open'),true);
});
