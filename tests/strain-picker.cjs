const test = require('node:test');
const assert = require('node:assert/strict');
const { attach } = require('../static/strain-picker.js');

class Element {
  constructor(doc) {
    this.ownerDocument = doc;
    this.value = '';
    this.hidden = true;
    this.id = '';
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  getAttribute(key) { return this.attributes.get(key); }
  addEventListener(key, callback) {
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(callback);
  }
  dispatch(type, extra = {}) {
    const event = { target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
  append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
  replaceChildren() { this.children = []; }
  contains(child) { return this === child || this.children.some(item => item.contains(child)); }
  closest() { return this.dataset.strainIndex != null ? this : this.parent?.closest() || null; }
  scrollIntoView() {}
  focus() {
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement?.dispatch('blur');
    this.ownerDocument.activeElement = this;
    this.dispatch('focus');
  }
  set innerHTML(_value) { assert.fail('Suggestion names must be rendered as text'); }
}

function harness() {
  let clock = 0;
  let next = 1;
  const timers = new Map();
  const requests = [];
  const doc = { activeElement: null, createElement() { return new Element(doc); } };
  doc.defaultView = {
    AbortController,
    setTimeout(callback, delay) { const id = next++; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, signal: options.signal,
        resolve(items) { resolve({ ok: true, json: async () => ({ items }) }); }, reject }));
    }
  };
  const input = new Element(doc);
  const list = new Element(doc); list.id = 'matches';
  const status = new Element(doc);
  const priceInput = new Element(doc);
  const form = new Element(doc); input.form = form;
  const selected = [];
  const resultBatches = [];
  attach({ input, list, status, priceInput, endpoint: '/api/strain_suggest',
    onSelect: item => selected.push(item), onResults: items => resultBatches.push(items) });
  const advance = milliseconds => {
    clock += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
  };
  const type = value => { input.value = value; input.dispatch('input'); advance(80); };
  return { doc, input, list, status, priceInput, form, selected, resultBatches, requests, advance, type };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const matches = [
  { name_display: 'Amnesia Haze', base_type: 'sativa' },
  { name_display: 'Amnesia Haze Master Cut', base_type: 'sativa' }
];

test('arrow keys select ranked options and Enter moves to price without submitting', async () => {
  const h = harness(); h.input.focus();
  h.requests[0].resolve(matches); await settle();
  assert.equal(h.input.getAttribute('aria-expanded'), 'true');
  assert.equal(h.input.getAttribute('aria-activedescendant'), undefined);
  assert.ok(h.list.children.every(option => option.getAttribute('aria-selected') === 'false'));
  h.input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(h.input.getAttribute('aria-activedescendant'), 'matches-option-0');
  h.input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(h.input.getAttribute('aria-activedescendant'), 'matches-option-1');
  h.input.dispatch('keydown', { key: 'ArrowUp' });
  const event = h.input.dispatch('keydown', { key: 'Enter' });
  assert.ok(event.defaultPrevented);
  assert.equal(h.input.value, 'Amnesia Haze');
  assert.equal(h.doc.activeElement, h.priceInput);
  assert.equal(h.selected.length, 1);
  assert.equal(h.list.hidden, true);
});

test('Return can still accept the first result without entering the list', async () => {
  const h = harness(); h.input.focus(); h.requests[0].resolve(matches); await settle();
  h.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.input.value, 'Amnesia Haze');
  assert.equal(h.doc.activeElement, h.priceInput);
  assert.equal(h.selected.length, 1);
});

test('Up enters at the last option and arrows wrap with an updated selection announcement', async () => {
  const h = harness(); h.input.focus(); h.requests[0].resolve(matches); await settle();
  h.input.dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(h.input.getAttribute('aria-activedescendant'), 'matches-option-1');
  assert.match(h.status.textContent, /Amnesia Haze Master Cut highlighted/);
  h.input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(h.input.getAttribute('aria-activedescendant'), 'matches-option-0');
  assert.match(h.status.textContent, /Amnesia Haze highlighted/);
  h.input.dispatch('keydown', { key: 'ArrowUp' });
  h.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.input.value, 'Amnesia Haze Master Cut');
  assert.equal(h.selected.length, 1);
});

test('Down opens current matches before the debounce and reopens the list after Escape', async () => {
  const h = harness(); h.input.focus();
  h.requests[0].resolve([{ name_display: 'Other Flower', base_type: 'hybrid' }]); await settle();
  h.input.value = 'am haze'; h.input.dispatch('input');
  h.input.dispatch('keydown', { key: 'ArrowDown' });
  assert.match(h.requests[1].url, /q=am%20haze$/);
  h.requests[1].resolve(matches); await settle();
  assert.equal(h.input.getAttribute('aria-activedescendant'), 'matches-option-0');
  assert.equal(h.input.value, 'am haze');
  h.input.dispatch('keydown', { key: 'Escape' });
  assert.equal(h.list.hidden, true);
  h.input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(h.list.hidden, false);
  assert.equal(h.input.getAttribute('aria-activedescendant'), 'matches-option-0');
  h.input.dispatch('keydown', { key: 'ArrowDown' });
  const event = h.input.dispatch('keydown', { key: 'Enter' });
  assert.ok(event.defaultPrevented);
  assert.equal(h.input.value, 'Amnesia Haze Master Cut');
  assert.equal(h.doc.activeElement, h.priceInput);
});

test('typing then immediately pressing Enter never chooses the previous query results', async () => {
  const h = harness(); h.input.focus();
  h.requests[0].resolve([{ name_display: 'Other Flower', base_type: 'hybrid' }]); await settle();
  h.input.value = 'am haze'; h.input.dispatch('input');
  const event = h.input.dispatch('keydown', { key: 'Enter' });
  assert.ok(event.defaultPrevented);
  assert.equal(h.selected.length, 0);
  assert.match(h.requests[1].url, /q=am%20haze$/);
  h.requests[1].resolve(matches); await settle();
  assert.equal(h.input.value, 'Amnesia Haze');
  assert.equal(h.selected.length, 1);
});

test('out-of-order replies cannot replace the current search', async () => {
  const h = harness(); h.input.focus(); h.type('am'); h.type('am haze');
  h.requests[2].resolve(matches); await settle();
  h.requests[1].resolve([{ name_display: 'Am', base_type: 'hybrid' }]);
  h.requests[0].resolve([{ name_display: 'Other Flower', base_type: 'indica' }]); await settle();
  assert.equal(h.list.children[0].children[0].textContent, 'Amnesia Haze');
  h.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.input.value, 'Amnesia Haze');
});

test('Escape retains the typed name and prevents late requests from reopening the list', async () => {
  const h = harness(); h.input.focus(); h.type('A new flower');
  h.input.dispatch('keydown', { key: 'Escape' });
  h.requests[1].resolve(matches); await settle();
  assert.equal(h.list.hidden, true);
  assert.equal(h.input.value, 'A new flower');
  h.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.doc.activeElement, h.priceInput);
  assert.equal(h.selected.length, 0);
});

test('a new name can advance to price without creating or substituting a suggestion', async () => {
  const h = harness(); h.input.focus(); h.input.value = 'New flower';
  h.input.dispatch('input'); h.input.dispatch('keydown', { key: 'Enter' });
  h.requests[1].resolve([]); await settle();
  assert.equal(h.input.value, 'New flower');
  assert.equal(h.doc.activeElement, h.priceInput);
  assert.equal(h.selected.length, 0);
});

test('mouse selection keeps focus until an option is chosen', async () => {
  const h = harness(); h.input.focus(); h.requests[0].resolve(matches); await settle();
  const label = h.list.children[1].children[0];
  const down = h.list.dispatch('pointerdown', { target: label });
  assert.ok(down.defaultPrevented);
  h.list.dispatch('click', { target: label });
  assert.equal(h.input.value, 'Amnesia Haze Master Cut');
  assert.equal(h.doc.activeElement, h.priceInput);
});

test('failed suggestions leave manual entry and normal Tab navigation available', async () => {
  const h = harness(); h.input.focus(); h.requests[0].reject(new Error('offline')); await settle();
  assert.match(h.status.textContent, /type the full name/);
  assert.equal(h.input.dispatch('keydown', { key: 'Tab' }).defaultPrevented, false);
  assert.equal(h.list.hidden, true);
});

test('blur and reset prevent delayed searches from changing fields or categories', async () => {
  const h = harness(); h.input.focus(); h.priceInput.focus();
  h.requests[0].resolve(matches); await settle();
  assert.equal(h.resultBatches.length, 0);
  h.input.focus(); h.form.dispatch('reset');
  h.requests[1].resolve(matches); await settle();
  assert.equal(h.list.hidden, true);
  assert.equal(h.resultBatches.length, 0);
});

test('suggestion names are plain text and IME Enter does not select an option', async () => {
  const h = harness(); h.input.focus();
  h.requests[0].resolve([{ name_display: '<img src=x onerror=alert(1)>', base_type: 'hybrid' }]); await settle();
  assert.equal(h.list.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  const event = h.input.dispatch('keydown', { key: 'Enter', isComposing: true });
  assert.equal(event.defaultPrevented, false);
  assert.equal(h.selected.length, 0);
});
