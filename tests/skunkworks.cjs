/* Verify saved preferences and nearby matching against the map's public data model. */
const test = require('node:test');
const assert = require('node:assert/strict');
const skunk = require('../scripts/budfinder-skunkworks.js');

function storage(entries = {}) {
  const data = new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]));
  return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};
}

test('Matt’s published visits and ratings can be switched off and back on locally', () => {
  const saved = storage();
  assert.equal(skunk.readMattDefaults(saved), true);
  skunk.writeMattDefaults(saved, false);
  assert.equal(skunk.readMattDefaults(saved), false);
  skunk.writeMattDefaults(saved, true);
  assert.equal(skunk.readMattDefaults(saved), true);
  assert.equal(skunk.readMattDefaults({getItem() { throw Error('blocked'); }}), true);
});

test('existing map favourites and old strain keys populate Skunkworks without losing names', () => {
  const saved = storage({locate3_strain_shelf:['Amnesia Haze','G13'],budfinder_strain_shelf:['G13','Gelato'],
    locate3_location_preferences:{'url:/cs-abraxas.html':{visited:true,favorite:true}}});
  assert.equal(skunk.isPopulated(storage()),false);
  assert.equal(skunk.isPopulated(storage({budfinder_location_preferences:{'name:shop|city':{visited:true}}})),true);
  assert.equal(skunk.isPopulated(saved),true);
  assert.deepEqual(skunk.readStrains(saved),['G13','Gelato','Amnesia Haze']);
  assert.equal(skunk.locationKey({name:'Abraxas',city:'Amsterdam',website:'https://www.coffeeshopmenus.org/CS-Abraxas.html'}),'url:/cs-abraxas.html');
  assert.equal(skunk.readLocations(saved)['url:/cs-abraxas.html'].visited,true);
  assert.equal(skunk.normalise('G-13'),skunk.normalise('G13'));
  assert.notEqual(skunk.normalise('G-13 Haze'),skunk.normalise('G13'));
  assert.equal(skunk.normalise('The Hague'),skunk.normalise('Den Haag'));
  skunk.writeStrains(saved,['Gelato']);
  assert.equal(saved.data.get('budfinder_strain_shelf'),saved.data.get('locate3_strain_shelf'));
  assert.deepEqual(skunk.readStrains(saved),['Gelato']);
});

test('profile choices are bounded and stay on the device', () => {
  const saved=storage();
  skunk.writeProfile(saved,{radiusKm:5,maxPrice:12,types:['sativa','hash','sativa','invalid'],showUnvisited:false});
  assert.deepEqual(skunk.readProfile(saved),{radiusKm:5,maxPrice:12,types:['sativa','hash'],showUnvisited:false,preferRecent:true});
  assert.equal(skunk.isPopulated(saved),true);
  assert.deepEqual(skunk.cleanProfile({radiusKm:999,maxPrice:0}),skunk.DEFAULTS);
});

test('short radii filter by metres and retired saved radii move to 5 km', () => {
  const locations = [0, 75, 150, 300].map((metres, index) => ({index,
    loc:{name:`Place ${metres}`,coords:[52.37 + metres / 111195, 4.9],visited:false}}));
  const find = radiusKm => skunk.nearby({origin:[52.37,4.9], locations, offerings:[], profile:{radiusKm}}).unvisited.map(place=>place.name);
  assert.deepEqual(find(0.1),['Place 0','Place 75']);
  assert.deepEqual(find(0.25),['Place 0','Place 75','Place 150']);
  assert.equal(skunk.formatRadius(0.1),'100 m');
  assert.equal(skunk.formatRadius(0.25),'250 m');
  assert.equal(skunk.readProfile(storage({budfinder_skunkworks_v1:{radiusKm:10}})).radiusKm,5);
  assert.equal(skunk.readProfile(storage({budfinder_skunkworks_v1:{radiusKm:20}})).radiusKm,5);
});

test('nearby discoveries use exact strain names, actual map distance and eligible per-gram prices', () => {
  const locations=[
    {index:0,loc:{name:'Near',city:'Amsterdam',coords:[52.37,4.90],db_shop_id:1,visited:false},favorite:true},
    {index:1,loc:{name:'Visited',city:'Amsterdam',coords:[52.371,4.90],db_shop_id:2,visited:true},favorite:false},
    {index:2,loc:{name:'Far',city:'Amsterdam',coords:[52.50,4.90],db_shop_id:3,visited:false}},
    {index:3,loc:{name:'Other',city:'Amsterdam',coords:[52.37,4.901],db_shop_id:4,visited:false}}
  ];
  const row=(id,strain,price,extra={})=>({shop_id:id,shop_name:'Near',shop_city:'Amsterdam',strain_name:strain,base_type:'sativa',price_amount:price,price_currency:'€',price_unit:'g',...extra});
  const offers=[row(1,'Gelato',11),row(1,'Gelato',8),row(1,'Gelato Cake',5),row(1,'Unknown',null),row(1,'Wrong currency',2,{price_currency:'$'}),row(1,'Wrong unit',2,{price_unit:'pack'}),row(2,'Gelato',null),row(3,'Gelato',3),row(4,'Gelato',1,{blocked:true})];
  const compareAverage=(strain,price)=>strain==='Gelato' ? {tone:price<12?'cheaper':'expensive',average:12,diff:price-12,sampleSize:3} : {tone:'expensive',average:4,diff:price-4,sampleSize:2};
  const result=skunk.nearby({origin:[52.37,4.9],locations,offerings:offers,strains:['Gelato'],profile:{radiusKm:2,maxPrice:10},isEligible:item=>!item.blocked,compareAverage});
  assert.deepEqual(result.favourites.map(item=>[item.name,item.strain,item.price]),[['Near','Gelato',8],['Visited','Gelato',null]]);
  assert.deepEqual(result.deals.map(item=>[item.name,item.strain,item.price,item.average,item.saving]),[['Near','Gelato',8,12,4]]);
  assert.deepEqual(result.unvisited.map(item=>item.name),['Near','Other']);
  assert.deepEqual(result.shops.map(item=>item.name),['Near']);
  assert.ok(result.unvisited[0].distance < 1);
});

test('an authoritative shop ID never inherits a different same-name shop menu', () => {
  const locations=[{index:0,loc:{name:'Same',city:'Amsterdam',coords:[52.37,4.9],db_shop_id:2,visited:false}}];
  const offerings=[{shop_id:1,shop_name:'Same',shop_city:'Amsterdam',strain_name:'Gelato',base_type:'hybrid',price_amount:7,price_unit:'g',price_currency:'€'}];
  const found=skunk.nearby({origin:[52.37,4.9],locations,offerings,strains:['Gelato'],profile:{radiusKm:2,maxPrice:10}});
  assert.equal(found.favourites.length,0);assert.equal(found.deals.length,0);assert.equal(found.unvisited.length,1);
});

test('chosen types and unvisited preference narrow the results without removing saved shops', () => {
  const locations=[{index:0,loc:{name:'Near',city:'Amsterdam',coords:[52.37,4.9],db_shop_id:1,visited:false},favorite:true}];
  const offerings=[{shop_id:1,strain_name:'Gelato',base_type:'hybrid',price_amount:8,price_unit:'g',price_currency:'€'}];
  const found=skunk.nearby({origin:[52.37,4.9],locations,offerings,strains:['Gelato'],profile:{types:['hash'],showUnvisited:false}});
  assert.equal(found.favourites.length,0);assert.equal(found.deals.length,0);assert.equal(found.unvisited.length,0);assert.equal(found.shops.length,1);
});

test('deals use the map average, count shops once and ignore the old absolute price limit', () => {
  const fs=require('node:fs');
  const vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../scripts/budfinder-map.js'),'utf8');
  const names=['getOfferingPriceEntry','getPriceCompareKey','buildStrainAveragePriceMap','getAveragePriceComparisonForEntries'];
  const context=vm.createContext({normaliseText:skunk.normalise,
    normaliseNameCityKey:(name,city)=>`${skunk.normalise(name)}|${skunk.normalise(city)}`,
    findLocationIndexForShopMatch:id=>Number.isFinite(id)?id:null,
    formatPriceValue:(amount,currency,unit)=>`${currency}${amount}/${unit}`,
    strainAveragePricesByKey:new Map()});
  vm.runInContext(names.map(name=>{
    const match=source.match(new RegExp(`^    function ${name}\\([^]*?^    }`,'m'));
    assert.ok(match,name);return match[0];
  }).join('\n'),context);
  const row=(shopId,strain,amount,extra={})=>({shop_id:shopId,shop_name:`Shop ${shopId}`,shop_city:'Amsterdam',strain_name:strain,
    base_type:'hybrid',price_amount:amount,price_unit:'g',price_currency:'€',...extra});
  const rows=[row(1,'Premium',12),row(1,'Premium',20),row(2,'Premium',24),row(1,'Cheap But Above',8),row(2,'Cheap But Above',6),
    row(1,'Rare',3),row(1,'Premium',1,{price_currency:'$'}),row(3,'Premium',1,{blocked:true})];
  const eligible=rows.filter(item=>!item.blocked);
  context.strainAveragePricesByKey=context.buildStrainAveragePriceMap(eligible);
  const compareAverage=(name,amount)=>{
    const comparison=context.getAveragePriceComparisonForEntries(name,[{amount,currency:'€',unit:'g'}]);
    const sample=context.strainAveragePricesByKey.get(skunk.normalise(name))?.get('€|g');
    return comparison && sample ? {...comparison,sampleSize:sample.count} : null;
  };
  const locations=[{index:0,loc:{name:'Shop 1',city:'Amsterdam',coords:[52.37,4.9],db_shop_id:1,visited:false}}];
  const result=skunk.nearby({origin:[52.37,4.9],locations,offerings:rows,strains:['Rare'],profile:{maxPrice:10},
    isEligible:item=>!item.blocked,compareAverage});
  assert.equal(result.deals.length,1);
  assert.equal(result.deals[0].strain,'Premium');
  assert.equal(result.deals[0].price,12);
  assert.equal(result.deals[0].average,18);
  assert.equal(result.deals[0].saving,6);
  assert.equal(result.deals[0].sampleSize,2);
  assert.equal(result.favourites[0].strain,'Rare');
  assert.ok(!result.deals.some(item=>item.strain==='Rare'),'A single-shop strain has no comparable average');
  assert.ok(!result.deals.some(item=>item.strain==='Cheap But Above'),'Low price alone does not imply a deal');
});

test('deal threshold, sample size and date preference rank transparent leads', () => {
  // All shops are nearby; dates and sample counts distinguish the results.
  const names = ['Recent large sample', 'Recent small sample', 'Old large sample', 'Unknown', 'Future', 'Small saving'];
  const locations = names.map((name, index) => ({ index, favorite: index === 0,
    loc: { name, city: 'Amsterdam', coords: [52.37 + index * 0.0001, 4.9], db_shop_id: index + 1, visited: index === 2 } }));
  const dates = ['2026-11-10', '2026-11-09', '2026-06-01', '', '2027-01-01', '2026-11-10'];
  const offerings = names.map((name, index) => ({ shop_id: index + 1, shop_name: name, shop_city: 'Amsterdam',
    strain_name: `Strain ${index}`, base_type: 'hybrid', price_amount: index === 5 ? 9.1 : 9,
    price_currency: '€', price_unit: 'g', date: dates[index] }));
  const compareAverage = (strain, price) => ({ tone: 'cheaper', average: 10, diff: price - 10,
    sampleSize: strain === 'Strain 1' ? 2 : 5 });
  const base = { origin: [52.37, 4.9], locations, offerings, strains: ['Strain 0'],
    compareAverage, getDateInfo: row => ({ value: row.date, field: 'source_menu_date' }), now: Date.parse('2026-11-15T12:00:00Z') };
  const recent = skunk.nearby({ ...base, profile: { preferRecent: true } });
  assert.deepEqual(recent.deals.map(item => item.name), names.slice(0, 5));
  assert.ok(!recent.deals.some(item => item.name === 'Small saving'), 'A 9% saving is not a 10% deal');
  assert.equal(recent.highlights.filter(item => item.index === 0).length, 1, 'A shop is highlighted once');
  assert.deepEqual(recent.highlights[0].reasons, ['Saved strain', '10% below average', 'Saved shop', 'Not marked visited', 'Within 1 km']);
  assert.equal(recent.deals[4].freshnessRank, 3, 'Future dates are unknown');
  const noDatePreference = skunk.nearby({ ...base, profile: { preferRecent: false } });
  assert.equal(noDatePreference.deals[1].name, 'Old large sample', 'A larger comparison ranks above a small sample when recency is off');
});
