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
  const elements=new Map(['destination-search','map-search-area','map-search-area-status','map-search-area-toggle','map-scope-summary'].map(id=>[id,{value:id==='destination-search'?query:'',hidden:false,textContent:''}]));
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

test('a map search fits matching shops in the current city without discarding other-city markers',()=>{
  const h=harness();const original=h.context.markers.slice();
  h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.deepEqual(Array.from(h.fits[0].ids),['ams-a','ams-b']);
  assert.deepEqual(h.context.markers,original);assert.equal(h.context.markers.length,4);
  assert.equal(h.context.syncMapViewToSearchRows([{shop_city:'Amsterdam'},{shop_city:'Leeuwarden'}],'Toad Venom'),false);
  assert.equal(h.switches.length,0);
});

test('Show all cities fits every matching city and Back restores the local camera',()=>{
  const h=harness({all:true});h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.equal(h.fits[0].ids.length,4);
  h.context.mapSearchViewAllCities=false;h.context.fitMapToVisibleMarkers({searchResults:true});
  assert.deepEqual(Array.from(h.fits[1].ids),['ams-a','ams-b']);
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


test('crossing the phone layout breakpoint refits search matches after layout settles',()=>{
  const h=harness();const timers=[];
  h.context.document.body={classList:{contains:()=>true}};
  h.context.syncViewportCssVars=()=>{};h.context.syncCompactLayoutState=()=>{};
  h.context.syncControlsChrome=()=>{};h.context.invalidateMapSizeSettled=()=>{};
  h.context.directionsVisible=true;h.context.setDirectionsVisible=()=>{};
  h.context.mobileShopState=null;h.context.activePopupLocationIndex=null;
  h.context.mapSearchResizeFitTimer=null;h.context.window.setTimeout=callback=>{timers.push(callback);return 1;};
  h.context.window.clearTimeout=()=>{};
  vm.runInContext(fn('handleViewportResize'),h.context);
  h.context.handleViewportResize();assert.equal(timers.length,1);assert.equal(h.fits.length,0);
  timers[0]();assert.deepEqual(Array.from(h.fits[0].ids),['ams-a','ams-b']);
});
