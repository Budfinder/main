/* Exercise the on-map discovery flow, including location consent and route actions. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../scripts/budfinder-skunkworks.js');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'),'utf8');
const start = source.indexOf('    // Skunkworks remains out of the way');
const end = source.indexOf("    document.getElementById('toggle-controls').addEventListener",start);
assert.ok(start>=0 && end>start,'Map discovery controls are present');
const code = source.slice(start,end);

function harness({failMenus=false}={}) {
  const memory=new Map();
  const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,value)};
  const ids=['skunk-nearby-button','skunk-nearby-dialog','skunk-nearby-close','skunk-nearby-status','skunk-nearby-results','skunk-nearby-origin','skunk-nearby-edit','skunk-nearby-centre','skunk-nearby-location','skunk-nearby-recent','skunk-nearby-radius','settings-site-defaults','settings-site-defaults-status'];
  const els=Object.fromEntries(ids.map(id=>[id,{id,hidden:false,open:false,innerHTML:'',textContent:'',listeners:{},dataset:{},attrs:{},
    addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(k,v){this.attrs[k]=v;},focus(){},
    showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},querySelectorAll(){return this.routeButtons||[];}}]));
  const classes=new Set();const body={classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
  const document={body,getElementById:id=>els[id]||null};
  let geoRequests=0,geoSuccess,geoFailure,routeAdded=false,focused=null;
  const navigator={geolocation:{getCurrentPosition(success,failure){geoRequests++;geoSuccess=success;geoFailure=failure;}}};
  const map={getCenter:()=>({lat:52.37,lng:4.9})};
  const locations=[{name:'Alpha',city:'Amsterdam',coords:[52.37,4.9],db_shop_id:1,Coffeeshop:true,visited:false}];
  const offerings=[{shop_id:1,shop_name:'Alpha',shop_city:'Amsterdam',strain_name:'Gelato',base_type:'hybrid',price_amount:8,price_unit:'g',price_currency:'€',source_menu_date:'2026-10-01'}];
  const window={BudfinderSkunkworks:api,addEventListener(){}};
  const context=vm.createContext({window,document,navigator,localStorage,map,locations,favorites:[0],shelfStrainNames:['Gelato'],
    strainAveragePricesByKey:new Map([['gelato',new Map([['€|g',{count:3}]])]]),
    normaliseText:value=>String(value).toLowerCase(),
    getAveragePriceComparisonForEntries:(_strain,entries)=>({tone:'cheaper',average:12,diff:entries[0].amount-12}),
    loadActiveOfferingsRows:async()=>{if(failMenus)throw new Error('offline');return offerings;},ensurePopupStrainIndex:async()=>true,isCoffeeShopLocation:loc=>loc.Coffeeshop,isClosedLocation:()=>false,isActiveOfferingRowAvailable:()=>true,
    formatDistanceMeters:m=>`${Math.round(m)} m`,getDisplayOfferingUpdatedAt:r=>r.source_menu_date,offeringFreshnessDateSource:()=>({field:'source_menu_date'}),
    getPopupMenuDateInfo:()=>null,formatPopupMenuDateInfo:info=>info?.value?`Menu dated ${info.value}`:'Menu date unknown',
    shouldShowMarkerOnMap:()=>true,menuExplore:{link:()=> 'database.html?shop_id=1'},currentMapReturnUrl:()=> 'map.html',
    isLocationInItinerary:()=>routeAdded,toggleJourneyStopByIndex:()=>{routeAdded=!routeAdded;},selectDestinationIndex:index=>{focused=index;},focusDestinationOnMap:index=>{focused=index;},
    escapeHtml:String,escapeHtmlAttr:String,loadStoredObject:()=>({}),loadStoredJson:()=>[],loadStoredArray:()=>[],normaliseShelfStrainNames:x=>x,
    mobileShopState:null,hydrateLocationPreferences(){},updateMarkers(){},updateControlsSummary(){},refreshDestinationCards(){},updateDestinationDropdown(){}});
  vm.runInContext(code,context);
  return {context,els,classes,localStorage,locations,geoRequests:()=>geoRequests,grantLocation:(lat,lng)=>geoSuccess({coords:{latitude:lat,longitude:lng}}),denyLocation:()=>geoFailure({code:1}),focused:()=>focused};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('empty nearby results offer the next radius and keep the same origin',async()=>{
  const h=harness();h.locations[0].coords=[52.38,4.9];api.writeProfile(h.localStorage,{radiusKm:0.1});
  h.els['skunk-nearby-button'].listeners.click();await settle();
  assert.match(h.els['skunk-nearby-results'].innerHTML,/No suggestions within 100 m/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Try 250 m/);
  h.els['skunk-nearby-results'].listeners.click({target:{closest:()=>({dataset:{skunkAction:'expand-radius',radius:'0.25'}})}});await settle();
  assert.equal(api.readProfile(h.localStorage).radiusKm,0.25);
  assert.match(h.els['skunk-nearby-origin'].textContent,/map centre · within 250 m/);
  assert.equal(h.geoRequests(),0);
});

test('empty results at the largest radius offer a different starting point',async()=>{
  const h=harness();h.locations[0].coords=[52.5,4.9];api.writeProfile(h.localStorage,{radiusKm:5});
  h.els['skunk-nearby-button'].listeners.click();await settle();
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Try another starting point/);
  assert.doesNotMatch(h.els['skunk-nearby-results'].innerHTML,/expand-radius/);
});

test('map setting saves site defaults on the device',()=>{
  const h=harness();
  h.els['settings-site-defaults'].listeners.change({target:{checked:false}});
  assert.equal(api.readSiteDefaults(h.localStorage),false);
  assert.match(h.els['settings-site-defaults-status'].textContent,/Saved on this device/);
});

test('map button appears with a profile and location is requested only after choosing it',async()=>{
  const h=harness();h.context.syncSkunkworksButton();
  assert.equal(h.els['skunk-nearby-button'].hidden,true);assert.equal(h.geoRequests(),0);
  api.writeProfile(h.localStorage,{radiusKm:2,maxPrice:10});h.context.syncSkunkworksButton();
  assert.equal(h.els['skunk-nearby-button'].hidden,false);
  h.els['skunk-nearby-button'].listeners.click();await settle();
  assert.equal(h.geoRequests(),0);assert.match(h.els['skunk-nearby-origin'].textContent,/map centre/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Gelato · Alpha/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/€8\/g/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Good deals · 10% or more below average/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Worth a look/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Saved strain · 33% below average · Saved shop · Not marked visited · Within 1 km/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Average €12\/g · €4\/g below average · 3 shops/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Not marked visited/);
  h.els['skunk-nearby-location'].listeners.click();assert.equal(h.geoRequests(),1);
  h.grantLocation(52.37,4.9);await settle();
  assert.match(h.els['skunk-nearby-origin'].textContent,/your location/);
});

test('location denial and unavailable menus preserve a usable map-centre fallback',async()=>{
  const h=harness({failMenus:true});api.writeProfile(h.localStorage,{radiusKm:2,maxPrice:10});
  h.els['skunk-nearby-button'].listeners.click();await settle();
  assert.match(h.els['skunk-nearby-status'].textContent,/Menu data could not be loaded/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Not marked visited/);
  h.els['skunk-nearby-location'].listeners.click();h.denyLocation();
  assert.match(h.els['skunk-nearby-status'].textContent,/map centre/);
  h.els['skunk-nearby-centre'].listeners.click();await settle();
  assert.match(h.els['skunk-nearby-origin'].textContent,/map centre/);
});

test('recent-date preference persists and refreshes the current origin',async()=>{
  const h=harness();api.writeProfile(h.localStorage,{radiusKm:2});
  h.els['skunk-nearby-button'].listeners.click();await settle();
  assert.equal(h.els['skunk-nearby-recent'].checked,true);
  h.els['skunk-nearby-recent'].listeners.change({target:{checked:false}});await settle();
  assert.equal(api.readProfile(h.localStorage).preferRecent,false);
  assert.match(h.els['skunk-nearby-origin'].textContent,/map centre/);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/Worth a look/);
});

test('changing the radius saves it and refreshes the same origin without requesting location',async()=>{
  const h=harness();api.writeProfile(h.localStorage,{radiusKm:2});
  h.els['skunk-nearby-button'].listeners.click();await settle();
  assert.equal(h.els['skunk-nearby-radius'].value,'2');
  h.els['skunk-nearby-radius'].listeners.change({target:{value:'5'}});await settle();
  assert.equal(api.readProfile(h.localStorage).radiusKm,5);
  assert.match(h.els['skunk-nearby-origin'].textContent,/map centre · within 5 km/);
  assert.equal(h.geoRequests(),0);
  assert.match(h.els['skunk-nearby-results'].innerHTML,/<details class="skunk-nearby-category"><summary>Good deals/);
});

test('the nearby dialog accepts and displays a 100 m radius',async()=>{
  const h=harness();api.writeProfile(h.localStorage,{radiusKm:2});
  h.els['skunk-nearby-button'].listeners.click();await settle();
  h.els['skunk-nearby-radius'].listeners.change({target:{value:'0.1'}});await settle();
  assert.equal(api.readProfile(h.localStorage).radiusKm,0.1);
  assert.match(h.els['skunk-nearby-origin'].textContent,/within 100 m/);
});

test('adding a shop updates every copy in the nearby results and viewing closes the dialog',async()=>{
  const h=harness();api.writeProfile(h.localStorage,{radiusKm:2,maxPrice:10});
  h.els['skunk-nearby-button'].listeners.click();await settle();
  const copies=[{dataset:{index:'0'},setAttribute(k,v){this[k]=v;}},{dataset:{index:'0'},setAttribute(k,v){this[k]=v;}}];
  h.els['skunk-nearby-dialog'].routeButtons=copies;
  const action=(kind)=>({target:{closest:()=>({dataset:{index:'0',skunkAction:kind}})}});
  h.els['skunk-nearby-results'].listeners.click(action('route'));
  assert.deepEqual(copies.map(button=>button.textContent),['Added to route','Added to route']);
  assert.deepEqual(copies.map(button=>button['aria-pressed']),['true','true']);
  h.els['skunk-nearby-results'].listeners.click(action('view'));
  assert.equal(h.els['skunk-nearby-dialog'].open,false);assert.equal(h.focused(),0);
});
