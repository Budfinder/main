const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/budfinder-map.js'),'utf8');
const fn=name=>{const match=source.match(new RegExp(`^    function ${name}\\([^]*?^    }`,'m'));assert.ok(match,name);return match[0];};

function harness({city='Amsterdam',all=false,query='Toad Venom',rows}={}) {
  const locations=rows||[
    {id:'ams-a',city:'Amsterdam',coords:[52.37,4.9],coffee:true,visible:true},
    {id:'ams-b',city:'Amsterdam',coords:[52.38,4.91],coffee:true,visible:true},
    {id:'hague',city:'den Haag',coords:[52.08,4.31],coffee:true,visible:true},
    {id:'leeuwarden',city:'Leeuwarden',coords:[53.2,5.79],coffee:true,visible:true}
  ];
  const elements=new Map(['destination-search','map-search-area','map-search-area-status','map-search-area-toggle','map-show-matches','map-scope-summary'].map(id=>[id,{value:id==='destination-search'?query:'',hidden:false,textContent:''}]));
  const fits=[],focuses=[],switches=[];
  const map={zoom:12,center:{lat:52.37,lng:4.9},getZoom(){return this.zoom;},getCenter(){return this.center;},fitBounds(bounds,options){fits.push({ids:bounds.ids,options});},setZoom(value){this.zoom=value;}};
  const context=vm.createContext({URL,URLSearchParams,document:{getElementById:id=>elements.get(id)||null},window:{location:{href:'https://budfinder.org/map.html?city=Amsterdam',search:'?city=Amsterdam'},history:{replaceState(_a,_b,href){const url=new URL(href);context.window.location.href=url.href;context.window.location.search=url.search;}}},
    locations,markers:locations.map(loc=>({id:loc.id,coords:loc.coords})),map,
    mapSearchViewCity:city,mapSearchViewAllCities:all,mapSearchViewQuery:query,locationSearchText:'',strainFilterText:query,
    sharedMenuFilters:{},menuExplore:null,currentCsvPath:'Amsterdam.csv',
    discoveredCsvPaths:['Amsterdam.csv','Den Haag.csv','Leeuwarden.csv','Netherlands.csv'],
    normaliseText:value=>String(value||'').trim().toLowerCase(),
    isMasterCoffeeshopPath:value=>value==='Netherlands.csv',csvLabelFromPath:value=>value.replace('.csv',''),canonicalCsvPath:value=>value,
    isCoffeeShopLocation:loc=>loc.coffee,passesCategoryFilter:loc=>loc.visible,shouldShowMarkerOnMap:loc=>loc.visible,
    haversineDistance:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*100000,
    getMapViewportInsets:()=>({paddingTopLeft:[12,12],paddingBottomRight:[12,12]}),getMeasuredMapRect:()=>({width:800,height:600}),
    isCompactMobileLayout:()=>false,clampViewportInsets:insets=>insets,
    focusMapViewArea:(path,options)=>{focuses.push({path,options});return true;},switchMapViewArea:(path,options)=>{switches.push({path,options});return true;},
    L:{featureGroup:markers=>({getBounds:()=>({ids:markers.map(marker=>marker.id),isValid:()=>true,getSouthWest:()=>({lat:Math.min(...markers.map(marker=>marker.coords[0])),lng:Math.min(...markers.map(marker=>marker.coords[1]))}),getNorthEast:()=>({lat:Math.max(...markers.map(marker=>marker.coords[0])),lng:Math.max(...markers.map(marker=>marker.coords[1]))})})})}
  });
  vm.runInContext(['mapFilterSearchText','normaliseGlobalSearchCity','findCsvPathForGlobalSearchCity','mapViewPathForSearchRows','currentMapSearchCity','beginMapSearchView','hasMapSearchQuery','localMapSearchCity','locationIsInSearchCity','mapSearchAreaInfo','updateMapSearchArea','syncMapViewToSearchRows','fitMapToVisibleMarkers','syncMapSearchUrl'].map(fn).join('\n'),context);
  return {context,elements,map,fits,focuses,switches,locations};
}

test('search exposes an optional map fit only when the current area has matches',()=>{
  const h=harness();
  h.context.updateMapSearchArea();
  assert.equal(h.elements.get('map-show-matches').hidden,false);
  assert.equal(h.fits.length,0);
  assert.match(h.elements.get('map-search-area-status').textContent,/2 matches in Amsterdam/);
  h.context.mapSearchViewCity='Utrecht';h.context.updateMapSearchArea();
  assert.equal(h.elements.get('map-show-matches').hidden,true);
  assert.equal(h.elements.get('map-search-area-toggle').hidden,false);
  h.context.mapSearchViewCity='';h.context.updateMapSearchArea();
  assert.equal(h.elements.get('map-show-matches').hidden,false);
  assert.match(h.elements.get('map-search-area-status').textContent,/4 matches across all cities/);
});

test('a city passed from menus is reflected in the map and search summaries on entry',()=>{
  const h=harness({city:'',all:true,rows:[
    {id:'wedren',city:'Nijmegen',coords:[51.84,5.87],coffee:true,visible:true}
  ]});
  h.context.sharedMenuFilters.city='Nijmegen';
  h.context.updateMapSearchArea();
  assert.equal(h.elements.get('map-scope-summary').textContent,'1 matching shop · Nijmegen');
  assert.equal(h.elements.get('map-search-area-status').textContent,'1 match in Nijmegen');
  assert.equal(h.elements.get('map-search-area-toggle').hidden,true);
});

test('cafés and other places are counted and can be shown on the map',()=>{
  const h=harness({query:'cafe',rows:[
    {id:'cafe',city:'Amsterdam',coords:[52.37,4.9],coffee:false,visible:true},
    {id:'area',city:'Haarlem',coords:[52.38,4.65],coffee:false,visible:true}
  ]});
  h.context.updateMapSearchArea();
  assert.match(h.elements.get('map-search-area-status').textContent,/1 match in Amsterdam · 1 elsewhere/);
  assert.match(h.elements.get('map-scope-summary').textContent,/1 matching place/);
  assert.equal(h.elements.get('map-show-matches').hidden,false);
  assert.equal(h.context.mapSearchAreaInfo({shopsOnly:true}).total,0);
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.deepEqual(Array.from(h.fits[0].ids),['cafe']);
  h.context.mapSearchViewAllCities=true;h.context.updateMapSearchArea();
  assert.match(h.elements.get('map-search-area-status').textContent,/2 matches across all cities/);
});

test('the matching-shops button fits on request and first dismisses the phone keyboard',()=>{
  const match=source.match(/document\.getElementById\('map-show-matches'\)\.addEventListener\('click', (\(\) => \{[^]*?\n    \})\);/);
  assert.ok(match);
  const h=harness();let blurred=false,collapsed=false,timer;
  const input=h.elements.get('destination-search');
  input.blur=()=>{blurred=true;h.context.document.activeElement=null;};
  h.context.document.activeElement=input;
  h.context.isCompactMobileLayout=()=>true;
  h.context.collapseMapSearchResults=({focus})=>{assert.equal(blurred,true);collapsed=focus;};
  h.context.window.setTimeout=callback=>{timer=callback;};
  const click=vm.runInContext(`(${match[1]})`,h.context);
  click();assert.equal(blurred,true);assert.equal(collapsed,true);assert.equal(h.fits.length,0);
  timer();assert.deepEqual(Array.from(h.fits[0].ids),['ams-a','ams-b']);
});

test('a map search fits matching shops in the current city without discarding other-city markers',()=>{
  const h=harness();const original=h.context.markers.slice();
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.deepEqual(Array.from(h.fits[0].ids),['ams-a','ams-b']);
  assert.deepEqual(h.context.markers,original);assert.equal(h.context.markers.length,4);
  assert.equal(h.context.syncMapViewToSearchRows([{shop_city:'Amsterdam'},{shop_city:'Leeuwarden'}],'Toad Venom'),false);
  assert.equal(h.switches.length,0);
});

test('nearby cities retain the fitted overview instead of zooming into their empty midpoint',()=>{
  const h=harness({city:'',all:true,rows:[
    {id:'ams',city:'Amsterdam',coords:[52.37,4.9],coffee:true,visible:true},
    {id:'haarlem',city:'Haarlem',coords:[52.38,4.65],coffee:true,visible:true}
  ]});
  // A real bounds fit zooms out enough to show both cities. The old street-zoom
  // override changed this back to 13, hiding the shops at both sides.
  const originalFit=h.map.fitBounds.bind(h.map);
  h.map.fitBounds=(bounds,options)=>{originalFit(bounds,options);h.map.zoom=10;};
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.equal(h.map.zoom,10);
  assert.deepEqual(Array.from(h.fits[0].ids),['ams','haarlem']);
});

test('widely spaced shops within one city also stay inside the fitted bounds',()=>{
  const h=harness({rows:[
    {id:'west',city:'Amsterdam',coords:[52.37,4.78],coffee:true,visible:true},
    {id:'east',city:'Amsterdam',coords:[52.37,4.99],coffee:true,visible:true}
  ]});
  h.map.fitBounds=()=>{h.map.zoom=11;};
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.equal(h.map.zoom,11);
});

test('phone panels cannot consume all of the map bounds padding',()=>{
  const h=harness();
  h.context.isCompactMobileLayout=()=>true;
  h.context.getMapViewportInsets=()=>({paddingTopLeft:[14,14],paddingBottomRight:[14,470]});
  h.context.getMeasuredMapRect=()=>({width:366,height:470});
  vm.runInContext(['clampInsetPair','clampViewportInsets'].map(fn).join('\n'),h.context);
  h.context.fitMapToVisibleMarkers({searchResults:true});
  const options=h.fits[0].options;
  assert.ok(options.paddingTopLeft[1]+options.paddingBottomRight[1]<=470*.46);
  assert.deepEqual(Array.from(h.fits[0].ids),['ams-a','ams-b']);
});

test('search waits until the keyboard layout is dismissed before moving the map',()=>{
  const h=harness();let typing=true;
  h.context.document.body={classList:{contains:()=>typing}};
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.equal(h.fits.length,0);
  typing=false;
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.equal(h.fits.length,1);
});

test('a pending shop flight is stopped before fitting a new strain',()=>{
  const h=harness();const operations=[];
  h.map.stop=()=>operations.push('stop');
  h.map.fitBounds=()=>operations.push('fit');
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.deepEqual(operations,['stop','fit']);
});

test('selecting a new strain from a shop preserves zoom and resets the search scope',async()=>{
  const h=harness({all:true});
  h.context.getCanonicalStrainName=value=>value;
  h.context.resetAtlasFiltersForShelfStrain=()=>{};
  h.context.applyStrainFilter=async query=>{h.context.strainFilterText=query;return true;};
  h.context.setRouteStatus=()=>{};
  let closed=0;h.context.map.closePopup=()=>{closed++;};
  h.context.window.setTimeout=()=>{};
  h.context.document.body={classList:{contains:()=>false}};
  const method=source.match(/^    async function showOtherShopsForStrain\([^]*?^    }/m)[0];
  vm.runInContext(method,h.context);
  await h.context.showOtherShopsForStrain('New strain');
  assert.equal(h.context.mapSearchViewAllCities,false);
  assert.equal(h.context.mapSearchViewCity,'Amsterdam');
  assert.equal(h.fits.length,0);assert.equal(h.map.zoom,12);assert.equal(closed,1);
});

test('selecting a saved strain leaves the map camera unchanged',async()=>{
  const h=harness();let shelfClosed=false;
  h.context.resetAtlasFiltersForShelfStrain=()=>{};
  h.context.applyStrainFilter=async()=>true;
  h.context.isCompactMobileLayout=()=>true;
  h.context.setShelfVisible=value=>{shelfClosed=!value;};
  h.context.window.setTimeout=()=>{throw new Error('Selecting a strain should not schedule a map fit');};
  const method=source.match(/^    async function activateShelfStrain\([^]*?^    }/m)[0];
  vm.runInContext(method,h.context);
  await h.context.activateShelfStrain('Gelato');
  assert.equal(h.map.zoom,12);assert.equal(h.fits.length,0);assert.equal(shelfClosed,true);
});

test('applying a strain cancels an old shop flight without changing the camera',async()=>{
  const h=harness();let stopped=0,oldPopupOpened=false;
  h.context.mapFocusRequestId=5;
  h.map.stop=()=>{stopped++;if(h.context.mapFocusRequestId===5)oldPopupOpened=true;};
  Object.assign(h.context, {
    globalSearchAppliedStrainKey:'', offeringAttributeFilterKind:'', offeringAttributeFilterValue:'',
    strainAllowedShopIds:null, strainAllowedNameCityKeys:null, strainPriceByShopId:null, strainPriceByNameCity:null,
    strainCheapestShopIds:null, strainCheapestNameCityKeys:null, strainCheapestPriceLabel:'',
    activeStrainNames:[], dbRouteLinksEnabled:false,
    rememberMapFilterState(){}, ensureDbIntegration:async()=>false,
    fetchStrainShopIdsFromJson:async()=>({ids:new Set(['1']),nameCityKeys:new Set()}),
    fetchStrainPriceMapsFromJson:async()=>null,
    locationMatchesStrainMatchSets:()=>true,
    updateDestinationDropdown(){}, updateDistanceInfo(){}, updateMarkers(){},
    updateStrainListSelection(){}, refreshOpenPopupStrainLists(){}, syncActiveStrainShelfButton(){}
  });
  const method=source.match(/^    async function applyStrainFilter\([^]*?^    }/m)[0];
  vm.runInContext(method,h.context);
  const center=h.map.getCenter();
  assert.equal(await h.context.applyStrainFilter('Gelato'),true);
  assert.equal(stopped,1);assert.equal(oldPopupOpened,false);
  assert.equal(h.map.zoom,12);assert.equal(h.map.getCenter(),center);assert.equal(h.fits.length,0);
  assert.equal(h.context.strainFilterText,'Gelato');
});

test('Show all cities fits every matching city and Back restores the local camera',()=>{
  const h=harness({all:true});h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.equal(h.fits[0].ids.length,4);
  h.context.mapSearchViewAllCities=false;h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.deepEqual(Array.from(h.fits[1].ids),['ams-a','ams-b']);
});

test('the Show all cities control still deliberately reframes the results',()=>{
  const h=harness();let saved=0;
  h.context.rememberMapFilterState=()=>{};
  h.context.refreshDestinationCards=()=>{};h.context.updateControlsSummary=()=>{};
  h.context.schedulePersistMapSession=()=>{saved++;};
  h.map.fitBounds=(bounds,options)=>{h.fits.push({ids:bounds.ids,options});h.map.zoom=8;};
  vm.runInContext(fn('toggleMapSearchArea'),h.context);
  h.context.toggleMapSearchArea();
  assert.equal(h.context.mapSearchViewAllCities,true);
  assert.equal(h.fits[0].ids.length,4);
  assert.equal(h.map.zoom,8);
  assert.equal(saved,1);
});

test('zero local matches focus the current city instead of automatically jumping elsewhere',()=>{
  const h=harness({city:'Rotterdam'});h.context.discoveredCsvPaths.push('Rotterdam.csv');
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.equal(h.fits.length,0);assert.equal(h.focuses[0].path,'Rotterdam.csv');assert.equal(h.focuses[0].options.respectFilters,false);
  h.context.updateMapSearchArea();
  assert.equal(h.elements.get('map-search-area-status').textContent,'0 matches in Rotterdam · 4 elsewhere');
  assert.equal(h.elements.get('map-search-area-toggle').hidden,false);
});

test('an empty nationwide search never fits unrelated markers',()=>{
  const h=harness({city:'',rows:[{id:'other',city:'Amsterdam',coords:[52.37,4.9],coffee:true,visible:false}]});
  h.context.fitMapToVisibleMarkers({searchResults:true});assert.equal(h.fits.length,0);
});

test('a homepage search retains its nationwide opening scope',()=>{
  const h=harness({city:'',query:''});h.context.currentCsvPath='Netherlands.csv';
  h.context.window.location.search='?city=Netherlands&source=home&search=Toad+Venom';h.elements.get('destination-search').value='Toad Venom';
  h.context.beginMapSearchView('Toad Venom',{fromUrl:true});assert.equal(h.context.mapSearchViewCity,'');
  h.context.fitMapToVisibleMarkers({searchResults:true});assert.equal(h.fits[0].ids.length,4);
});

test('a new search after panning uses the visible city rather than the old opening city',()=>{
  const h=harness({query:''});h.locations.push({id:'rot',city:'Rotterdam',coords:[51.92,4.48],coffee:true,visible:true});
  h.map.center={lat:51.92,lng:4.48};h.context.beginMapSearchView('Toad Venom');
  assert.equal(h.context.mapSearchViewCity,'Rotterdam');assert.equal(h.context.currentCsvPath,'Amsterdam.csv');
});

test('camera scope survives URL reloads while remaining separate from location filters',()=>{
  const h=harness({all:true});h.context.syncMapSearchUrl('Toad Venom');
  const url=new URL(h.context.window.location.href);
  assert.equal(url.searchParams.get('search_city'),'Amsterdam');assert.equal(url.searchParams.get('search_view'),'all');assert.equal(url.searchParams.has('filter_city'),false);
  h.context.mapSearchViewCity='';h.context.mapSearchViewAllCities=false;h.context.mapSearchViewQuery='';
  h.context.beginMapSearchView('Toad Venom',{fromUrl:true});assert.equal(h.context.mapSearchViewCity,'Amsterdam');assert.equal(h.context.mapSearchViewAllCities,true);
  h.context.beginMapSearchView('');h.context.syncMapSearchUrl('');assert.equal(new URL(h.context.window.location.href).searchParams.has('search_city'),false);
});

test('local-result copy counts both local and other-city matches without widening automatically',()=>{
  const h=harness();h.context.updateMapSearchArea();
  assert.equal(h.elements.get('map-search-area-status').textContent,'2 matches in Amsterdam · 2 elsewhere');
  assert.equal(h.elements.get('map-search-area-toggle').textContent,'Show all cities');
  h.context.mapSearchViewAllCities=true;h.context.updateMapSearchArea();
  assert.equal(h.elements.get('map-search-area-toggle').textContent,'Back to Amsterdam');assert.equal(h.fits.length,0);
});


test('Undo restores the visible strain or grower query even when plain location search is empty',()=>{
  const h=harness();
  assert.equal(h.context.mapFilterSearchText({locationSearchText:'',strainFilterText:'Toad Venom'}),'Toad Venom');
  assert.equal(h.context.mapFilterSearchText({searchText:'Toad venom',locationSearchText:'',strainFilterText:'Toad Venom'}),'Toad venom');
  assert.equal(h.context.mapFilterSearchText({offeringAttributeFilterValue:'Karma',strainFilterText:'Grower: Karma'}),'Karma');
});


test('crossing the phone layout breakpoint keeps the chosen search zoom',()=>{
  const h=harness();const timers=[];
  h.context.document.body={classList:{contains:name=>name==='compact-layout'}};
  h.context.syncViewportCssVars=()=>{};h.context.syncCompactLayoutState=()=>{};
  h.context.syncControlsChrome=()=>{};h.context.invalidateMapSizeSettled=()=>{};
  h.context.directionsVisible=true;h.context.setDirectionsVisible=()=>{};
  h.context.mobileShopState=null;h.context.activePopupLocationIndex=null;
  h.context.mapSearchResizeFitTimer=null;h.context.window.setTimeout=callback=>{timers.push(callback);return 1;};
  h.context.window.clearTimeout=()=>{};
  vm.runInContext(fn('handleViewportResize'),h.context);
  h.context.handleViewportResize();assert.equal(timers.length,0);assert.equal(h.fits.length,0);assert.equal(h.map.zoom,12);
});
