const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'),'utf8');
const fn = name => { const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`,'m')); assert.ok(match,name); return match[0]; };
const paths = ['Amsterdam.csv','Rotterdam.csv','Netherlands.csv'];
function cameraHarness() {
  const memory = new Map(), views=[];
  const context = vm.createContext({URLSearchParams,Date,
    MAP_VIEW_STORAGE_KEY:'camera',MAP_SESSION_MAX_AGE_MS:90*86400000,MAP_SESSION_VIEWPORT_MAX_DISTANCE_METERS:100000,
    LOCATION_DATA_EXPLICIT_SELECTION_STORAGE_KEYS:'explicit',
    window:{location:{search:''}},locations:[{coords:[52.37,4.9]}],mapSessionReady:true,initialCameraSettled:true,
    loadStoredJson:(key,fallback)=>memory.get(key)||fallback, saveStoredJson:(key,value)=>memory.set(key,value),
    canonicalCsvPath:path=>path,csvFileNameFromPath:path=>path,csvLabelFromPath:path=>path.replace('.csv',''),
    normaliseGlobalSearchCity:city=>String(city||'').toLowerCase(),isMasterCoffeeshopPath:path=>path==='Netherlands.csv',
    pickDefaultCsvPath:()=>paths[0],pickFirstCsvPath:()=>paths[0],loadSavedCsvPath:()=>memory.get('saved')||'',
    currentMapSearchCity:()=>context.city,city:'Rotterdam',
    haversineDistance:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*100000,
    map:{getCenter:()=>({lat:52.37,lng:4.9}),getZoom:()=>context.zoom,setView:(...args)=>views.push(args)},zoom:13
  });
  vm.runInContext(['isValidPersistedViewport','isPersistedViewportRelevantToLocations','loadLastMapView','persistLastMapView','openingMapViewport','pickInitialCsvPath','pickOpeningCsvPath'].map(fn).join('\n'),context);
  return {context,memory,views};
}

test('new visitors and an old nationwide preference open Amsterdam',()=>{
  const h=cameraHarness(); assert.equal(h.context.pickOpeningCsvPath(paths,null),'Amsterdam.csv');
  h.memory.set('saved','Netherlands.csv');h.memory.set('explicit',true);
  assert.equal(h.context.pickOpeningCsvPath(paths,null),'Amsterdam.csv');
});

test('returning from generic menus restores the last city while explicit city/all-city links win',()=>{
  const h=cameraHarness();h.memory.set('camera',{updatedAt:Date.now(),city:'Rotterdam'});
  h.context.window.location.search='?explore=1&city=Netherlands';
  assert.equal(h.context.pickOpeningCsvPath(paths,'Netherlands.csv'),'Rotterdam.csv');
  assert.equal(h.context.pickOpeningCsvPath(paths,'Amsterdam.csv'),'Amsterdam.csv');
  h.context.window.location.search='?city=Netherlands&search_view=all';
  assert.equal(h.context.pickOpeningCsvPath(paths,'Netherlands.csv'),'Netherlands.csv');
});

test('camera restoration is separate from filter context and refuses low zoom or a different city',()=>{
  const h=cameraHarness();const view={lat:52.37,lng:4.9,zoom:14};
  h.memory.set('camera',{updatedAt:Date.now(),city:'Amsterdam',viewport:view});
  h.context.window.location.search='?explore=1&filter_price=under15';
  assert.equal(h.context.openingMapViewport('Amsterdam.csv'),view);
  assert.equal(h.context.openingMapViewport('Rotterdam.csv'),null);
  h.context.window.location.search='?search=G13';assert.equal(h.context.openingMapViewport('Amsterdam.csv'),null);
  h.context.window.location.search='';view.zoom=2;assert.equal(h.context.openingMapViewport('Amsterdam.csv'),null);
});

test('an accidental world view saves the city without saving that zoom, and startup cannot overwrite memory',()=>{
  const h=cameraHarness();h.context.zoom=2;h.context.persistLastMapView();
  assert.equal(h.memory.get('camera').city,'Rotterdam');assert.equal(h.memory.get('camera').viewport,null);
  h.context.zoom=14;h.context.persistLastMapView();assert.equal(h.memory.get('camera').viewport.zoom,14);
  h.context.initialCameraSettled=false;h.context.city='Amsterdam';h.context.persistLastMapView();
  assert.equal(h.memory.get('camera').city,'Rotterdam');
  h.memory.set('camera',{updatedAt:1,city:'Rotterdam'});assert.equal(h.context.loadLastMapView(),null);
});

test('Clear all cancels pending searches, removes every filter and preserves camera and route stops',()=>{
  const elements=new Map(['destination-search','mission-mode','destination-select'].map(id=>[id,{value:'active'}]));
  const views=[],cancelled=[];const route={stops:[{ref:'shop-a'}]};
  const explore=require('../scripts/budfinder-explore.js');
  const context=vm.createContext({URL,URLSearchParams,
    window:{location:{href:'https://budfinder.org/map.html?search=G13&strain=G13&shops=1&filter_price=under15&search_kind=strain'},
      history:{replaceState(_a,_b,url){context.window.location.href=url;}},clearTimeout:id=>cancelled.push(id)},
    document:{title:'Map',getElementById:id=>elements.get(id)||null},
    map:{getCenter:()=>({lat:52.37,lng:4.9}),getZoom:()=>14,setView:(...args)=>views.push(args),closePopup(){}},
    globalSearchResolveRequestId:7,globalSearchStrainTimer:1,pendingInitialSearchPresentation:true,
    mapSearchEntityKind:'strain',mapSearchViewCity:'Amsterdam',mapSearchViewAllCities:false,mapSearchViewQuery:'G13',
    locationSearchText:'G13',nearbyExploreActive:true,lastDestinationSelectValue:'1',activePopupLocationIndex:1,
    missionMode:'wanted',selectedCategories:['favourites'],journeyPlanner:route,
    menuExplore:explore,sharedMenuFilters:{price:'under15'},sharedMenuFilterControl:{set(){}},
    hideMapSearchSuggestions(){},clearMapFilterHistory(){},clearRouteUi(){},syncCategoryCheckboxes(){},clearExplorerFocus(){},clearActiveStrainFilterState(){},
    getDefaultLocationCategories:()=>['Coffeeshop'],updateNearestLabel(){},updateDestinationDropdown(){},updateDistanceInfo(){},updateMarkers(){},updateSelectionCard(){},refreshDestinationCards(){},updateControlsSummary(){},syncClearSelectionToggle(){},setRouteStatus(){},schedulePersistMapSession(){}
  });
  vm.runInContext(['beginMapSearchView','syncMapSearchUrl','resetMapFilters'].map(fn).join('\n'),context);
  context.resetMapFilters();
  assert.deepEqual(cancelled,[1]);assert.equal(context.globalSearchResolveRequestId,8);
  assert.equal(elements.get('destination-search').value,'');assert.equal(elements.get('destination-select').value,'');
  assert.equal(context.mapSearchViewCity,'');assert.equal(context.nearbyExploreActive,false);
  assert.equal(context.missionMode,'free-roam');assert.equal(context.journeyPlanner,route);assert.equal(route.stops.length,1);
  const url=new URL(context.window.location.href);
  for(const key of ['search','strain','shops','filter_price','search_kind'])assert.equal(url.searchParams.has(key),false,key);
  assert.equal(views.length,1);assert.equal(views[0][1],14);
});
