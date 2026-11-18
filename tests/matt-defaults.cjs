/* Check that published values and device overrides remain independent. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../scripts/budfinder-skunkworks.js');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');
const extract = name => {
  const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
  assert.ok(match, name);
  return match[0];
};

test('device overrides survive hiding and restoring Budfinder’s published values', () => {
  const data = new Map();
  const localStorage = {getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value)};
  const locations = [
    {name:'Published',siteVisited:true,siteRating:4},
    {name:'Personal',siteVisited:true,siteRating:3}
  ];
  const prefs = {Personal:{visited:false,rating:5,favorite:true}};
  const fields = {
    '.visited-checkbox':{checked:false},
    '.rating-stars':{setAttribute(key,value){this[key]=value;}},
    '.popup-site-review':{hidden:true,textContent:''}
  };
  const context = vm.createContext({
    locations, localStorage, window:{BudfinderSkunkworks:api},
    document:{getElementById:()=>({querySelector:selector=>fields[selector]})},
    popupCardId:()=>'', renderStars:value=>`stars:${value}`,
    shelfStrainNames:[], normaliseShelfStrainNames:items=>items, saveShelfStrains(){},
    favorites:[], legacyFavoriteIndices:[], readLocationPreference:loc=>prefs[loc.name],
    writeLocationPreference(){}, persistLegacyFavorites(){}
  });
  vm.runInContext(['hydrateLocationPreferences','syncPopupPersonalState'].map(extract).join('\n'), context);
  context.hydrateLocationPreferences();
  assert.deepEqual(locations.map(loc=>[loc.visited,loc.rating]),[[true,4],[false,5]]);
  context.syncPopupPersonalState(1);
  assert.equal(fields['.popup-site-review'].textContent,'Visited by Budfinder · Budfinder rating: 3/5');
  assert.equal(fields['.popup-site-review'].hidden,false);
  assert.equal(fields['.rating-stars']['data-rating'],'5');
  api.writeSiteDefaults(localStorage,false);
  context.hydrateLocationPreferences();
  context.syncPopupPersonalState(1);
  assert.deepEqual(locations.map(loc=>[loc.visited,loc.rating]),[[false,0],[false,5]]);
  assert.equal(fields['.popup-site-review'].hidden,true);
  api.writeSiteDefaults(localStorage,true);
  context.hydrateLocationPreferences();
  assert.deepEqual(locations.map(loc=>[loc.visited,loc.rating]),[[true,4],[false,5]]);
  assert.equal(prefs.Personal.favorite,true);
});

test('map provides a focusable landmark, skip link and keyboard-operated ratings', () => {
  const html = fs.readFileSync(require.resolve('../map.html'),'utf8');
  const css = fs.readFileSync(require.resolve('../styles/budfinder-map-controls.css'),'utf8');
  assert.match(html, /class="map-skip-link" href="#map"/);
  assert.match(html, /<main id="map"[^>]*tabindex="0"[^>]*><h1 class="map-visually-hidden">/);
  assert.match(css, /\.map-skip-link:focus/);
  assert.match(source, /<button type="button" class="rating-stars"/);
});
