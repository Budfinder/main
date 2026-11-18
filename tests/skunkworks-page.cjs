/* Exercise the page's save actions using the same storage shared with the map. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../scripts/budfinder-skunkworks.js');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-skunkworks-page.js'),'utf8');

function harness() {
  const memory=new Map();
  const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  const ids=['skunk-status','skunk-shop-search','skunk-strain-list','skunk-shop-results','skunk-shop-status','skunk-saved-shops','skunk-radius','skunk-unvisited','skunk-recent','skunk-site-defaults','skunk-strain-form','skunk-strain-input','skunk-preferences-form','skunk-strain-options'];
  const els=Object.fromEntries(ids.map(id=>[id,{id,value:'',checked:false,innerHTML:'',textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},focus(){}}]));
  const types=['sativa','indica','hybrid','hash'].map(value=>({value,checked:false}));
  const doc={getElementById:id=>els[id]||null,querySelectorAll:selector=>selector==='input[name="type"]'?types:selector==='input[name="type"]:checked'?types.filter(x=>x.checked):[]};
  const window={BudfinderSkunkworks:api, Papa:{parse:()=>({data:[{name:'Abraxas',city:'Amsterdam',shop_key:'cs-abraxas',website:'https://www.coffeeshopmenus.org/cs-abraxas.html',visited:'y',status:'open'}]})},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const fetch=async url=>({ok:true,json:async()=>({strains:[{name:'Amnesia Haze'}]}),text:async()=>url});
  const context=vm.createContext({window,document:doc,localStorage,fetch,Papa:window.Papa,Promise,URL});
  vm.runInContext(source,context);
  return {els,types,localStorage,memory,window};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('turning site defaults off and on leaves personal visits untouched',async()=>{
  const h=harness();await settle();
  h.els['skunk-shop-search'].value='Abraxas';h.els['skunk-shop-search'].listeners.input();
  assert.equal(h.els['skunk-site-defaults'].checked,true);
  assert.match(h.els['skunk-shop-results'].innerHTML,/>Visited<\/button>/);
  h.els['skunk-site-defaults'].checked=false;
  h.els['skunk-preferences-form'].listeners.submit({preventDefault(){}});
  assert.equal(api.readSiteDefaults(h.localStorage),false);
  assert.match(h.els['skunk-shop-results'].innerHTML,/>Mark visited<\/button>/);
  h.els['skunk-shop-results'].listeners.click({target:{closest:()=>({dataset:{shopKey:'cs-abraxas',shopAction:'visited'}})}});
  h.els['skunk-site-defaults'].checked=true;
  h.els['skunk-preferences-form'].listeners.submit({preventDefault(){}});
  assert.equal(api.readSiteDefaults(h.localStorage),true);
  assert.equal(api.readLocations(h.localStorage)['url:/cs-abraxas.html'].visited,true);
});

test('page saves strains, favourites, visited state and settings using existing map storage',async()=>{
  const h=harness();await settle();
  h.els['skunk-strain-input'].value='Amnesia Haze';
  h.els['skunk-strain-form'].listeners.submit({preventDefault(){}});
  assert.deepEqual(api.readStrains(h.localStorage),['Amnesia Haze']);
  assert.match(h.els['skunk-strain-list'].innerHTML,/Amnesia Haze/);
  h.els['skunk-shop-search'].value='Abraxas';h.els['skunk-shop-search'].listeners.input();
  const click=action=>({target:{closest:()=>({dataset:{shopKey:'cs-abraxas',shopAction:action}})}});
  h.els['skunk-shop-results'].listeners.click(click('favorite'));
  assert.equal(api.readLocations(h.localStorage)['url:/cs-abraxas.html'].favorite,true);
  h.els['skunk-shop-results'].listeners.click(click('visited'));
  assert.equal(api.readLocations(h.localStorage)['url:/cs-abraxas.html'].visited,false);
  api.writeProfile(h.localStorage,{maxPrice:12});
  h.els['skunk-radius'].value='5';h.types[3].checked=true;
  h.els['skunk-preferences-form'].listeners.submit({preventDefault(){}});
  assert.deepEqual(api.readProfile(h.localStorage),{radiusKm:5,maxPrice:12,types:['hash'],showUnvisited:true,preferRecent:true});
  assert.match(h.els['skunk-status'].textContent,/Preferences saved/);
});

test('clearing saved data from settings refreshes the page in the same tab',async()=>{
  const h=harness();await settle();
  h.els['skunk-strain-input'].value='Gelato';
  h.els['skunk-strain-form'].listeners.submit({preventDefault(){}});
  h.memory.clear();
  h.window.listeners['budfinder:saved-data-cleared']();
  assert.match(h.els['skunk-strain-list'].innerHTML,/No saved strains yet/);
  assert.equal(h.els['skunk-radius'].value,'2');
});

test('the settings page loads and saves the 250 m radius',async()=>{
  const h=harness();await settle();
  h.els['skunk-radius'].value='0.25';
  h.els['skunk-preferences-form'].listeners.submit({preventDefault(){}});
  assert.equal(api.readProfile(h.localStorage).radiusKm,0.25);
});

test('both radius menus show the same supported choices',()=>{
  for (const file of ['../map.html','../skunkworks.html']) {
    const html=fs.readFileSync(require.resolve(file),'utf8');
    const options=html.match(/<select id="skunk-(?:nearby-)?radius">([^]*?)<\/select>/)[1];
    assert.deepEqual([...options.matchAll(/value="([^"]+)"/g)].map(match=>Number(match[1])),api.RADIUS_OPTIONS_KM);
  }
});

test('removing the last favourite clears legacy map indices so it cannot return',async()=>{
  const h=harness();await settle();
  h.localStorage.setItem('favorites','[0]');
  const pref={'url:/cs-abraxas.html':{favorite:true,visited:true}};
  api.writeLocations(h.localStorage,pref);
  h.els['skunk-shop-results'].listeners.click({target:{closest:()=>({dataset:{shopKey:'cs-abraxas',shopAction:'favorite'}})}});
  assert.equal(h.localStorage.getItem('favorites'),'[]');
  assert.equal(api.readLocations(h.localStorage)['url:/cs-abraxas.html'].visited,true);
  assert.equal(api.readLocations(h.localStorage)['url:/cs-abraxas.html'].favorite,false);
});
