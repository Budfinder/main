/* Reproduce Leaflet's content reparenting to protect the mobile resize regression. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/budfinder-map.js'), 'utf8');

// The small DOM model moves existing nodes, just as real append/setContent do.
class Node {
  constructor(id = '', className = '') {
    this.id = id; this.className = className; this.children = []; this.parentElement = null;
    this.open = false; this.isConnected = true;
    const classes = new Set();
    this.classList = {add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name)};
  }
  append(node) {
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
    node.parentElement = this; this.children.push(node);
  }
  replaceChildren(...nodes) {
    this.children.forEach(node => { node.parentElement = null; }); this.children = [];
    nodes.forEach(node => this.append(node));
  }
  before(node) {
    const parent = this.parentElement;
    node.parentElement = parent; parent.children.splice(parent.children.indexOf(this), 0, node);
  }
  replaceWith(node) {
    const parent = this.parentElement;
    const index = parent.children.indexOf(this);
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
    parent.children.splice(index, 1, node); node.parentElement = parent; this.parentElement = null;
  }
  querySelector(selector) {
    return this.children.find(node => selector === '.fav-btn' && node.className === 'fav-btn') || null;
  }
  closest() { return null; }
  focus() { this.focused = true; }
  showModal() { this.open = true; this.modal = true; }
  show() { this.open = true; this.modal = false; }
  close() { this.open = false; }
}

function harness({compact = true, coffeeshop = true} = {}) {
  // Both sheet and popup retain the same live card and save button throughout.
  const elements = new Map(['mobile-shop-sheet', 'mobile-shop-title', 'mobile-shop-eyebrow', 'mobile-shop-content', 'mobile-shop-actions', 'mobile-shop-close', 'toggle-controls', 'shop-popup-card-0'].map(id => [id, new Node(id)]));
  const popupHost = new Node('popup-host');
  const card = elements.get('shop-popup-card-0');
  const save = new Node('', 'fav-btn'); card.append(save); popupHost.append(card);
  const returnFocus = new Node('original-marker');
  const popup = {
    content: card,
    setContent(node) { this.content = node; this.update(); },
    update() { popupHost.replaceChildren(this.content); }
  };
  const marker = {getPopup: () => popup, closePopup() { this.closed = true; }};
  const context = vm.createContext({
    compact, mobileShopState: null, markers: [marker], locations: [{name: 'Abraxas', db_shop_id: 12, coords: [52.37, 4.89]}],
    document: {getElementById: id => elements.get(id), activeElement: returnFocus, body: new Node(), createComment: () => new Node(), createElement: () => new Node()},
    isCompactMobileLayout: () => context.compact, isCoffeeShopLocation: () => coffeeshop, popupCardId: () => 'shop-popup-card-0',
    escapeHtmlAttr: value => value, priceMenusUrl: () => 'database.html?shop_id=12', syncPopupPersonalState() {}
  });
  const functions = ['openMobileShopSheet', 'syncShopSheetPresentation', 'restoreMobileShopCard', 'closeMobileShopSheet'].map(name => source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'))[0]);
  vm.runInContext(functions.join('\n'), context);
  return {context, elements, popup, popupHost, card, save, marker, returnFocus};
}

test('delayed Leaflet updates cannot take the live menu out of the mobile sheet', () => {
  const h = harness();
  h.context.openMobileShopSheet(0);
  h.popup.update(); h.popup.update();
  assert.equal(h.elements.get('mobile-shop-sheet').open, true);
  assert.equal(h.card.parentElement, h.elements.get('mobile-shop-content'));
  assert.equal(h.save.parentElement, h.elements.get('mobile-shop-actions'));
  assert.notEqual(h.popup.content, h.card);
});

test('other places receive the compact panel and retain their live controls', () => {
  const h = harness({coffeeshop: false}); h.context.openMobileShopSheet(0);
  assert.equal(h.elements.get('mobile-shop-sheet').classList.contains('is-place-panel'), true);
  assert.equal(h.elements.get('mobile-shop-eyebrow').textContent, 'Place details');
  assert.equal(h.save.parentElement, h.elements.get('mobile-shop-actions'));
  assert.equal(h.card.parentElement, h.elements.get('mobile-shop-content'));
  h.context.closeMobileShopSheet();
  assert.equal(h.card.parentElement, h.popupHost);
});

test('closing and reopening restores the same menu, save action and keyboard focus', () => {
  const h = harness();
  h.context.openMobileShopSheet(0); h.context.closeMobileShopSheet();
  assert.equal(h.card.parentElement, h.popupHost);
  assert.equal(h.save.parentElement, h.card);
  assert.equal(h.returnFocus.focused, true);
  assert.equal(h.elements.get('mobile-shop-sheet').open, false);
  assert.equal(h.marker.closed, true);
  h.context.openMobileShopSheet(0);
  assert.equal(h.card.parentElement, h.elements.get('mobile-shop-content'));
  assert.equal(h.elements.get('mobile-shop-content').children.length, 1);
});

test('desktop opens the same live menu in a non-modal panel', () => {
  const h=harness({compact:false});h.context.openMobileShopSheet(0);
  assert.equal(h.elements.get('mobile-shop-sheet').open,true);
  assert.equal(h.elements.get('mobile-shop-sheet').modal,false);
  assert.equal(h.card.parentElement,h.elements.get('mobile-shop-content'));
  h.popup.update();
  assert.equal(h.card.parentElement,h.elements.get('mobile-shop-content'));
});

test('crossing the phone breakpoint preserves the menu and its scroll position', () => {
  const h=harness({compact:false});h.context.openMobileShopSheet(0);
  const content=h.elements.get('mobile-shop-content');content.scrollTop=240;
  h.context.compact=true;h.context.syncShopSheetPresentation();
  assert.equal(h.elements.get('mobile-shop-sheet').modal,true);
  assert.equal(content.scrollTop,240);
  assert.equal(h.card.parentElement,content);
  h.context.compact=false;h.context.syncShopSheetPresentation();
  assert.equal(h.elements.get('mobile-shop-sheet').modal,false);
  assert.equal(content.scrollTop,240);
  assert.equal(content.children.length,1);
});
