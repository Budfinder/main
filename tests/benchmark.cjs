/* Test personalised benchmarks using real history semantics and page actions. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../scripts/budfinder-benchmark.js');
const {mount} = require('../scripts/budfinder-price-history.js');
const stamp = '2026-11-15T21:59:02Z';
const ids = Array.from({length:20}, (_, index) => index + 1);
const history = () => ({version:1, exported_at_utc:stamp, currency:'€',unit:'g',date_basis:'recorded_observation',
  shops:Array.from({length:21}, (_, index) => ({shop_id:index+1,name:`Shop ${index+1}`,city:'Amsterdam', points:[
    {date:'2026-11-01',average_price:10+index,shop_count:1,strain_count:2,listing_count:3,kind:'recorded'},
    {date:'2026-11-15',average_price:10+index,shop_count:1,strain_count:2,listing_count:3,kind:'current'}
  ]}))});
const storage = () => {const memory=new Map();return {getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};};

test('selection accepts any non-empty number of unique IDs and is reversible',()=>{
  const saved=storage();assert.equal(api.read(saved),null);
  assert.throws(()=>api.write(saved,[]));assert.throws(()=>api.write(saved,[1,1]));
  for (const selection of [[1], [1,2], [...ids, 21]]) { api.write(saved,selection); assert.deepEqual(api.read(saved),selection); }
  api.write(saved,ids);assert.deepEqual(api.read(saved),ids);
  api.reset(saved);assert.equal(api.read(saved),null);
});

test('benchmark keeps its exact membership and gaps when a shop loses its menu',()=>{
  const raw=history();raw.shops[0].points.splice(1,0,{date:'2026-11-05',average_price:null,shop_count:0,strain_count:0,listing_count:0,kind:'recorded'});
  const data=api.normaliseHistory(raw,stamp),result=api.build(data.shops,ids,data.latest);
  assert.equal(result.points.find(point=>point.date==='2026-11-01').average_price,19.5);
  const missing=result.points.find(point=>point.date==='2026-11-05');assert.equal(missing.average_price,null);assert.equal(missing.shop_count,19);
  const latest=result.points.at(-1);assert.equal(latest.average_price,19.5);assert.equal(latest.strain_count,40);assert.equal(latest.kind,'current');
  assert.throws(()=>api.build(data.shops,[...ids.slice(0,19),99],data.latest),/missing/);
  raw.shops[1].points.pop();assert.throws(()=>api.normaliseHistory(raw,stamp),/current snapshot/);
  assert.throws(()=>api.normaliseHistory(history(),'2026-11-14'),/updating/);
});

test('published shop timelines reproduce every original complete benchmark price',()=>{
  const base=JSON.parse(fs.readFileSync(require.resolve('../database/price_history.json'),'utf8'));
  const raw=JSON.parse(fs.readFileSync(require.resolve('../database/price_history_shops.json'),'utf8'));
  const data=api.normaliseHistory(raw,base.exported_at_utc);
  const calculated=api.build(data.shops,base.benchmark.shops.map(shop=>shop.shop_id),data.latest);
  const values=new Map(calculated.points.map(point=>[point.date,point.average_price]));
  for(const point of base.series.find(row=>row.id==='benchmark').points) assert.equal(values.get(point.date),point.average_price,point.date);
  const latestPoint=base.series.find(row=>row.id==='benchmark').points.find(point=>point.date===data.latest);
  assert.equal(calculated.missingLatest.length,latestPoint?.average_price == null
    ? base.benchmark.shops.length - Number(latestPoint?.shop_count || 0) : 0);
});

class Element {
  constructor(){this.hidden=true;this.value='';this.textContent='';this.innerHTML='';this.dataset={};this.attributes=new Map();this.listeners={};this.clientWidth=400;this.disabled=false;}
  addEventListener(type,fn){this.listeners[type]=fn;}
  setAttribute(key,value){this.attributes.set(key,String(value));} removeAttribute(key){this.attributes.delete(key);}
  querySelectorAll(){return [];} getBoundingClientRect(){return {left:0,width:400};}
  dispatch(type,extra={}){this.listeners[type]?.({type,target:this,preventDefault(){},...extra});}
}

test('Skunkworks allows one shop to be replaced and saved without touching the public benchmark',async()=>{
  const source=fs.readFileSync(require.resolve('../scripts/budfinder-benchmark-page.js'),'utf8');
  const names=['benchmark-shop-search','benchmark-search-results','benchmark-selected','benchmark-search-status','benchmark-status','benchmark-save','benchmark-reset','benchmark-selected-heading'];
  const els=Object.fromEntries(names.map(name=>[name,new Element()]));const saved=storage(),raw=history();
  const base={exported_at_utc:stamp,benchmark:{shops:ids.map(shop_id=>({shop_id}))}};
  const window={BudfinderBenchmark:api,addEventListener(){}};
  const fetch=async path=>({ok:true,json:async()=>path.includes('shops.json')?raw:base});
  vm.runInNewContext(source,{window,document:{getElementById:id=>els[id]},localStorage:saved,fetch,Promise});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(els['benchmark-selected-heading'].textContent,/Selected shops · 20/);
  els['benchmark-selected'].dispatch('click',{target:{closest:()=>({dataset:{benchmarkRemove:'20'}})}});
  assert.equal(els['benchmark-save'].disabled,false);
  els['benchmark-shop-search'].value='Shop 21';els['benchmark-shop-search'].dispatch('input');
  assert.match(els['benchmark-search-results'].innerHTML,/Shop 21/);
  els['benchmark-search-results'].dispatch('click',{target:{closest:()=>({dataset:{benchmarkAdd:'21'},disabled:false})}});
  els['benchmark-save'].dispatch('click');assert.deepEqual(api.read(saved),[...ids.slice(0,19),21]);
  assert.equal(base.benchmark.shops[19].shop_id,20);
  els['benchmark-reset'].dispatch('click');assert.equal(api.read(saved),null);
});

test('homepage loads a custom benchmark, and safely falls back if shop history is stale',async()=>{
  const raw=history(),saved=storage();api.write(saved,ids);
  const base={version:1,currency:'€',unit:'g',date_basis:'recorded_observation',exported_at_utc:stamp,
    benchmark:{shops:ids.map(id=>({shop_id:id,name:`Shop ${id}`,city:'Amsterdam'}))},series:[
      {id:'benchmark',name:'Public benchmark',kind:'benchmark',points:[{date:'2026-11-15',average_price:100,shop_count:20,strain_count:3,listing_count:4,kind:'current'}]},
      {id:'netherlands',name:'Netherlands',points:[{date:'2026-11-15',average_price:15,shop_count:20,strain_count:3,listing_count:4,kind:'current'}]}
    ]};
  const names=['price-history','price-history-scope','price-history-ranges','price-history-plot','price-history-value','price-history-date','price-history-coverage','price-history-status','price-history-rows','price-history-live','price-history-controls','price-history-details','price-history-stamp','price-history-note','price-history-benchmark','price-history-shops','price-history-benchmark-description','price-history-trace-control','price-history-trace-toggle','price-history-strain-header'];
  for (const stale of [false,true]) {
    const els=Object.fromEntries(names.map(name=>[name,new Element()]));
    const runtime={BudfinderBenchmark:api,localStorage:saved,AbortController,addEventListener(){},setTimeout(){return 1;},clearTimeout(){},
      fetch:async path=>({ok:true,json:async()=>path.includes('price_history_shops')?(stale?{...raw,exported_at_utc:'2026-11-14T00:00:00Z'}:raw):path.includes('price_history.json')?base:{exported_at_utc:stamp}})};
    await mount({getElementById:id=>els[id]},runtime).ready;
    assert.equal(els['price-history-value'].textContent,stale?'€100.00/g':'€19.50/g');
    if(stale)assert.match(els['price-history-status'].textContent,/saved selection is unchanged/);
    else assert.equal(els['price-history-strain-header'].textContent,'Shop strain entries');
    assert.deepEqual(api.read(saved),ids);
  }
});

// A larger or smaller benchmark retains equal weighting and reports its own size.
test('custom benchmarks use the selected number of shops with equal weight', () => {
  const data=api.normaliseHistory(history(),stamp);
  const small=api.build(data.shops,[1,2],data.latest);
  assert.equal(small.name,'Your 2-shop benchmark');
  assert.equal(small.points.at(-1).average_price,10.5);
  assert.equal(small.points.at(-1).shop_count,2);
  const large=api.build(data.shops,[...ids,21],data.latest);
  assert.equal(large.name,'Your 21-shop benchmark');
  assert.equal(large.points.at(-1).average_price,20);
  assert.equal(large.points.at(-1).shop_count,21);
});
