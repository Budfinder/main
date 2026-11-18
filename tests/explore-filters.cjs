const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const explore = require('../scripts/budfinder-explore.js');
const now = Date.parse('2026-10-28T12:00:00Z');
const row = { shop_id: 1, shop_city: 'Amsterdam', strain_name: 'Amnesia Haze', price_amount: 12, price_currency: '€', base_type: 'sativa', is_cali: 0, is_legal: 1, menu_changed_at_utc: '2026-10-20T09:00:00Z' };

test('shared filters require location, type, price, origin, project and source age on the same listing', () => {
  const filters = { city: 'Amsterdam', type: 'sativa', price: 'under15', cali: '0', legal: '1', age: 'fresh' };
  assert.equal(explore.matches(row, filters, {now}), true);
  for (const changes of [{shop_city:'Utrecht'}, {base_type:'hybrid'}, {price_amount:15}, {is_cali:1}, {is_legal:0}, {menu_changed_at_utc:''}]) {
    assert.equal(explore.matches({...row, ...changes}, filters, {now}), false, JSON.stringify(changes));
  }
  assert.equal(explore.matches(row, {...filters, city:' amsterdam '}, {now}), true);
});

test('unknown, zero and non-euro prices never pass a known euro price band', () => {
  for (const price of [null, '', ' ', undefined, 0, -1, 'invalid']) {
    assert.equal(explore.matches({...row, price_amount:price}, {price:'under15'}), false);
    assert.equal(explore.matches({...row, price_amount:price}, {price:'unknown'}), true);
  }
  assert.equal(explore.matches({...row, price_currency:'$'}, {price:'under15'}), false);
  assert.equal(explore.matches({...row, price_amount:20}, {price:'over20'}), true);
  assert.equal(explore.matches({...row, price_amount:19.99}, {price:'over20'}), false);
});

test('source age uses UTC calendar days and treats future and batch-only dates as unknown', () => {
  for (const [date, expected] of [['2026-10-14T00:00:00Z','fresh'],['2026-10-13T23:59:59Z','ageing'],['2026-08-29','ageing'],['2026-08-28','stale'],['2026-10-29','unknown'],['','unknown']]) {
    assert.equal(explore.ageBucket(date, now), expected, date);
  }
  assert.equal(explore.matches({updated_at:'2026-10-28'}, {age:'unknown'}, {now}), true);
  assert.equal(explore.matches(row, {age:'unknown'}, {date:'',now}), true, 'page freshness rules can explicitly mark batch dates unknown');
});

test('map and menu links round-trip all filters without confusing camera city and result location', () => {
  const filters = explore.clean({city:'Utrecht',type:'hybrid',price:'under15',age:'fresh',cali:'1',legal:'0'});
  const map = explore.link('map', {query:'Lemon x Haze',filters,source:'menus',returnTo:'database.html?browser=strains&browse_search=Lemon'});
  const url = new URL(map, 'https://budfinder.org');
  assert.deepEqual(explore.fromUrl(url), filters);
  assert.equal(url.searchParams.get('search'),'Lemon x Haze');
  assert.equal(url.searchParams.get('city'),'Utrecht');
  const menu = new URL(explore.link('menus',{query:'Lemon x Haze',filters,source:'map',returnTo:map}), 'https://budfinder.org');
  assert.deepEqual(explore.fromUrl(menu),filters);
  assert.equal(menu.searchParams.get('search'),'Lemon x Haze');
  assert.equal(new URL(menu.searchParams.get('return_to'),'https://budfinder.org').searchParams.has('return_to'),false);
  assert.equal(explore.fromUrl('map.html?city=Amsterdam').city,'', 'moving the camera is separate from filtering results');
});

test('return links accept only the two result pages and remove nested handoffs', () => {
  for (const value of ['https://evil.example/map.html','//evil.example/map.html','javascript:alert(1)','index.html','https://budfinder.org.evil.example/map.html']) assert.equal(explore.safeReturn(value),'');
  assert.equal(explore.safeReturn('/map.html?search=Gelato&return_to=database.html'),'map.html?search=Gelato');
  assert.equal(new URL(explore.link('menus',{shopId:'105',filters:{price:'under10'}}),'https://budfinder.org').searchParams.get('detail'),'shop');
});

function mapHarness() {
  const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'),'utf8');
  const functions = source.slice(source.indexOf('    function sharedFilteredOfferingRows('),source.indexOf('    async function setSharedMenuFilters('));
  const context = vm.createContext({ menuExplore:explore, sharedMenuFilters:explore.clean({price:'under15'}), sharedMenuMatchIds:null,
    sharedMenuMatchKey:'', sharedMenuMatchRows:null, strainFilterText:'Amnesia Haze', offeringAttributeFilterKind:'', offeringAttributeFilterValue:'',
    locations:[], dbUnavailableShopIds:new Set(),
    buildStrainPricingInsightFromRows:()=>({byShopId:new Map(),byNameCity:new Map(),cheapestShopIds:new Set(),cheapestNameCityKeys:new Set()}),
    activeOfferingsRows:[row,{...row,shop_id:2,price_amount:25},{...row,shop_id:2,strain_name:'Other strain',price_amount:5}],
    isActiveOfferingRowAvailable:()=>true, getDisplayOfferingUpdatedAt:r=>r.menu_changed_at_utc||'', normaliseText:v=>String(v||'').toLowerCase().trim(),
    collectMatchedActiveOfferingRows:(q,rows)=>rows.filter(r=>r.strain_name.toLowerCase()===q)
  });
  vm.runInContext(functions,context);
  return context;
}

test('map filtering cannot admit an expensive searched strain through another cheap strain at that shop', () => {
  const h=mapHarness(); h.refreshSharedMenuMatchIds();
  assert.equal(h.passesSharedMenuFilters({db_shop_id:1,city:'Amsterdam'}),true);
  assert.equal(h.passesSharedMenuFilters({db_shop_id:2,city:'Amsterdam'}),false);
  h.sharedMenuFilters=explore.clean({city:'Utrecht'});h.refreshSharedMenuMatchIds();
  assert.equal(h.passesSharedMenuFilters({db_shop_id:1,city:'Amsterdam'}),false);
  assert.equal(h.passesSharedMenuFilters({db_shop_id:2,city:'Utrecht'}),true);
});

test('map filters stay on the requested grower or legal-project listing', () => {
  const h=mapHarness(); h.offeringAttributeFilterKind='grower';h.offeringAttributeFilterValue='Karma';
  h.activeOfferingsRows=[{...row,grower:'Karma',price_amount:22},{...row,grower:'Other',price_amount:5}];
  h.refreshSharedMenuMatchIds();assert.equal(h.passesSharedMenuFilters({db_shop_id:1,city:'Amsterdam'}),false);
  h.offeringAttributeFilterKind='legal';h.activeOfferingsRows=[{...row,price_amount:22},{...row,is_legal:0,price_amount:5}];
  h.refreshSharedMenuMatchIds();assert.equal(h.passesSharedMenuFilters({db_shop_id:1,city:'Amsterdam'}),false);
});


test('removing a filter retains the other choices and keyboard focus, while Clear resets all', () => {
  const controls=['city','type','price','age','cali','legal'].map(key=>({dataset:{exploreFilter:key},value:''}));
  let focused='', buttons=[];
  const summary={focus(){focused='summary';}};
  const count={textContent:''};
  const chips={querySelectorAll(){return buttons;},set innerHTML(value){
    this.html=value;
    buttons=[...value.matchAll(/data-remove-explore-filter="([^"]+)"|data-clear-explore-filters/g)].map(match=>({
      dataset:match[1]?{removeExploreFilter:match[1]}:{},
      closest(selector){return selector==='[data-remove-explore-filter]'? (match[1]?this:null) : (!match[1]?this:null);},
      focus(){focused=match[1]||'clear';}
    }));
  }};
  const events={};
  const host={id:'test-filters',querySelectorAll(){return controls;},querySelector(selector){return selector==='.explore-filter-chips'?chips:selector==='[data-explore-filter-count]'?count:summary;},addEventListener(type,handler){events[type]=handler;}};
  let changed;
  const component=explore.mount(host,{filters:{city:'amsterdam',price:'under15'},cities:['Amsterdam'],onChange:filters=>{changed=filters;}});
  assert.equal(controls[0].value,'Amsterdam','URL casing must not blank the selected city');
  assert.equal(count.textContent,'2 active');
  events.click({target:buttons[0]});
  assert.equal(changed.city,'');assert.equal(changed.price,'under15');assert.equal(focused,'price');
  events.click({target:buttons.at(-1)});
  assert.deepEqual(component.get(),explore.clean({}));assert.equal(focused,'summary');
});
