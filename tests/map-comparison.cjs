/* Regression coverage for map menu dates, saved-strain comparisons and result ordering. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const explore = require('../scripts/budfinder-explore.js');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');

function load(context, names) {
  const functions = names.map(name => {
    const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(match, `Missing map function ${name}`);
    return match[0];
  });
  vm.runInContext(functions.join('\n'), context);
}

test('menu dates distinguish source dates from observations and reject future dates', () => {
  const context = vm.createContext({menuExplore: explore,
    popupMenuUpdatedByShopId: new Map(), popupMenuUpdatedByNameCity: new Map(),
    dbShopMetaById: new Map(), popupMenuBatchSignal: null,
    MENU_BATCH_FRESHNESS_FIELDS: new Set(['updated_at']),
    normaliseNameCityKey: (name, city) => `${name}|${city}`,
    formatDisplayDate: value => value.slice(0, 10),
    getDisplayShopMetaUpdatedAt: meta => meta.menu_changed_at_utc || ''});
  load(context, ['getFreshnessTime', 'offeringFreshnessDateSource', 'trustedOfferingUpdatedAt',
    'isSharedBatchOfferingDate', 'getDisplayOfferingUpdatedAt', 'pushPopupMenuUpdated',
    'getPopupMenuDateInfo', 'getPopupMenuUpdatedAt', 'formatPopupMenuDateInfo', 'getPopupMenuDateLabel']);
  const dates = context.popupMenuUpdatedByShopId;
  context.pushPopupMenuUpdated(dates, '1', {source_menu_date:'2025-01-02'});
  assert.equal(context.getPopupMenuDateLabel({db_shop_id:1}), 'Menu dated 2025-01-02');
  context.pushPopupMenuUpdated(dates, '1', {fetched_at_utc:'2025-02-03'});
  assert.equal(context.getPopupMenuDateLabel({db_shop_id:1}), 'Menu observed 2025-02-03');
  assert.equal(context.getPopupMenuUpdatedAt({db_shop_id:1}), '2025-02-03');
  context.pushPopupMenuUpdated(dates, '2', {updated_at:'2025-02-03'});
  assert.equal(context.getPopupMenuDateLabel({db_shop_id:2}), 'Menu date unknown');
  context.pushPopupMenuUpdated(dates, '3', {source_menu_date:'2999-01-01'});
  assert.equal(context.getPopupMenuDateLabel({db_shop_id:3}), 'Menu date unknown');
});

test('strain result dates come from matching listings at that shop', () => {
  const context = vm.createContext({
    menuExplore:explore, sharedMenuFilters:{}, strainFilterText:'Gelato',
    offeringAttributeFilterKind:'', offeringAttributeFilterValue:'',
    activeOfferingsRows:[
      {shop_id:1,shop_name:'Alpha',shop_city:'Amsterdam',strain_name:'Gelato',source_menu_date:'2025-01-01'},
      {shop_id:1,shop_name:'Alpha',shop_city:'Amsterdam',strain_name:'Amnesia Haze',source_menu_date:'2025-06-01'},
      {shop_id:2,shop_name:'Beta',shop_city:'Amsterdam',strain_name:'Gelato',source_menu_date:'2025-02-01'}
    ],
    isActiveOfferingRowAvailable:()=>true, isLeftOutOfComparisons:()=>false,
    getOfferingPriceEntry:()=>null,
    normaliseText:s=>String(s||'').toLowerCase().trim(),
    normaliseNameCityKey:(name,city)=>`${name}|${city}`,
    collectMatchedActiveOfferingRows:(query,rows)=>rows.filter(row=>row.strain_name.toLowerCase()===query),
    sharedFilteredOfferingRows:rows=>rows,
    pushPopupMenuUpdated:(map,key,row)=>map.set(key,{value:row.source_menu_date,field:'source_menu_date'})
  });
  load(context,['buildMapResultMenuDates']);
  const dates = context.buildMapResultMenuDates();
  assert.equal(dates.byId.get('1').value,'2025-01-01');
  assert.equal(dates.byId.get('2').value,'2025-02-01');
  context.strainFilterText='';
  assert.equal(context.buildMapResultMenuDates(),null);
});

test('saved-strain comparison ranks exact matches, honours filters and keeps route actions', () => {
  const locations = [
    {name:'Alpha',city:'Amsterdam',Coffeeshop:true,strains:['Gelato','Amnesia Haze']},
    {name:'Beta',city:'Amsterdam',Coffeeshop:true,strains:['Amnesia Haze']},
    {name:'Other',city:'Amsterdam',Coffeeshop:true,strains:['Gelato Cake']},
    {name:'Filtered',city:'Amsterdam',Coffeeshop:true,strains:['Gelato'],filtered:true}
  ];
  const context = vm.createContext({locations, shelfStrainNames:['Gelato','Amnesia Haze','White Widow'],
    popupStrainIndexReady:true, normaliseText:s=>String(s||'').toLowerCase().trim(),
    getPopupStrainsForLocation:loc=>loc.strains, isCoffeeShopLocation:loc=>loc.Coffeeshop,
    passesCategoryFilter:loc=>!loc.filtered, compareStringsAlpha:(a,b)=>a.localeCompare(b),
    isLocationInItinerary:i=>i===0, getPopupMenuDateLabel:()=> 'Menu date unknown',
    escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')});
  load(context, ['getSavedStrainMatchesForLocation', 'renderSavedStrainShopMatches']);
  const grid={}, summary={};
  context.renderSavedStrainShopMatches(grid,summary);
  assert.match(summary.textContent, /2 shops/);
  assert.match(grid.innerHTML, /2 of 3 saved strains listed/);
  assert.match(grid.innerHTML, /Gelato, Amnesia Haze/);
  assert.ok(grid.innerHTML.indexOf('Alpha') < grid.innerHTML.indexOf('Beta'));
  assert.doesNotMatch(grid.innerHTML, /Other|Filtered|Gelato Cake/);
  assert.match(grid.innerHTML, /Added to route/);
  assert.match(grid.innerHTML, /Add to route/);
  assert.match(grid.innerHTML, /View on map/);
});

test('freshest-first map results put unknown dates last and preserve the result actions', () => {
  const elements = {
    'best-match-order':{value:'freshest'},
    'best-match-list':{innerHTML:'',closest:()=>({hidden:false})},
    'best-match-summary':{textContent:''}
  };
  const locations = [{name:'Old',Coffeeshop:true},{name:'Unknown',Coffeeshop:true},{name:'New',Coffeeshop:true}];
  const context = vm.createContext({document:{getElementById:id=>elements[id]||null}, locations,
    menuExplore:explore, shelfStrainNames:['Gelato','Amnesia Haze','White Widow'],
    renderMapStrainResult(){},hasBestMatchContext:()=>true,isCoffeeShopLocation:loc=>loc.Coffeeshop,
    localMapSearchCity:()=>'',isCompactMobileLayout:()=>false,getBestMatchSummary:()=> '3 visible stops.',
    getFreshnessTime:value=>{const time=Date.parse(value);return Number.isFinite(time)?time:null;},
    inferCityFromCsvPath:()=>'',currentCsvPath:'',buildBestMatchReason:()=> 'Matching strain',
    escapeHtml:String,escapeHtmlAttr:String,bestMatchLogoHtml:()=>'',offeringAttributeFilterKind:'',strainFilterText:'',
    getCanonicalStrainName:()=>'',priceMenusUrl:()=>'',bestMatchReveal:{key:'',count:0}});
  load(context,['bestMatchPageSize','renderBestMatches']);
  context.renderBestMatches([
    {index:0,name:'Old',updatedAt:'2024-01-01',freshnessLabel:'Menu dated 2024',freshnessTone:'old'},
    {index:1,name:'Unknown',updatedAt:'',freshnessLabel:'Menu date unknown',freshnessTone:'unknown'},
    {index:2,name:'New',updatedAt:'2025-01-01',freshnessLabel:'Menu dated 2025',freshnessTone:'fresh',strainCount:2,savedMatches:['Gelato','Amnesia Haze']}
  ]);
  const html=elements['best-match-list'].innerHTML;
  assert.ok(html.indexOf('New') < html.indexOf('Old'));
  assert.ok(html.indexOf('Old') < html.indexOf('Unknown'));
  assert.match(html,/is-age-unknown/);
  assert.match(html,/2 of 3 saved strains listed: Gelato, Amnesia Haze/);
  assert.match(html,/data-best-match-action="details"/);
  assert.match(html,/data-best-match-action="itinerary"/);
});

test('a phone shows the first six matches and a Show more button reveals the rest', () => {
  const elements = {
    'best-match-order':{value:'best'},
    'best-match-list':{innerHTML:'',closest:()=>({hidden:false})},
    'best-match-summary':{textContent:''}
  };
  const locations = Array.from({length:8},(_,i)=>({name:`Shop ${i+1}`,city:'Nijmegen',Coffeeshop:true}));
  let city = 'Nijmegen';
  const context = vm.createContext({document:{getElementById:id=>elements[id]||null}, locations,
    menuExplore:explore, shelfStrainNames:[], renderMapStrainResult(){}, hasBestMatchContext:()=>true,
    isCoffeeShopLocation:loc=>loc.Coffeeshop, localMapSearchCity:()=>city,
    locationIsInSearchCity:(loc,name)=>loc.city===name, isCompactMobileLayout:()=>true,
    getBestMatchSummary:()=> '8 visible stops.', getFreshnessTime:()=>null, inferCityFromCsvPath:()=>'',
    currentCsvPath:'', buildBestMatchReason:()=> 'Matches Amnesia Haze', escapeHtml:String, escapeHtmlAttr:String,
    bestMatchLogoHtml:()=>'', offeringAttributeFilterKind:'', strainFilterText:'Amnesia Haze',
    getCanonicalStrainName:()=> 'Amnesia Haze', priceMenusUrl:()=>'', bestMatchReveal:{key:'',count:0}});
  load(context,['bestMatchPageSize','renderBestMatches']);
  const items = locations.map((loc,index)=>({index,name:loc.name,city:'Nijmegen'}));
  const cards = () => (elements['best-match-list'].innerHTML.match(/class="best-match-card"/g) || []).length;
  context.renderBestMatches(items);
  assert.equal(cards(), 6);
  assert.match(elements['best-match-summary'].textContent, /8 matches in Nijmegen\. Showing 6 best matches\./);
  assert.match(elements['best-match-list'].innerHTML, /data-best-match-more>Show 2 more<\/button>/);
  // What the button's click handler does: open the next page and render again.
  context.bestMatchReveal.count = 6 + context.bestMatchPageSize();
  context.renderBestMatches(items);
  assert.equal(cards(), 8);
  assert.doesNotMatch(elements['best-match-list'].innerHTML, /data-best-match-more/);
  assert.equal(elements['best-match-summary'].textContent, '8 matches in Nijmegen.');
  // A refresh of the same results keeps them open; a different search starts again.
  context.renderBestMatches(items.slice().reverse());
  assert.equal(cards(), 8);
  const more = Array.from({length:14},(_,i)=>({name:`Other ${i}`,city:'Nijmegen',Coffeeshop:true}));
  locations.push(...more);
  context.renderBestMatches(more.map((loc,i)=>({index:8+i,name:loc.name,city:'Nijmegen'})));
  assert.equal(cards(), 6);
  assert.match(elements['best-match-list'].innerHTML, /Show 6 more/);
});

