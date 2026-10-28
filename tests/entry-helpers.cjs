const test = require('node:test');
const assert = require('node:assert/strict');
const { attach } = require('../static/entry-helpers.js');

class Element {
  constructor(doc) {
    this.ownerDocument = doc; this.value = ''; this.checked = false; this.hidden = true;
    this.id = ''; this.children = []; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map();
    this.textContent = '';
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(key, callback) {
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(callback);
  }
  dispatch(type, extra = {}) {
    const event = { target: this, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
  append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
  replaceChildren() { this.children = []; }
  contains(child) { return this === child || this.children.some(node => node.contains(child)); }
  closest() { return this.dataset.strainIndex != null ? this : this.parent?.closest() || null; }
  scrollIntoView() {}
  focus() {
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement?.dispatch('blur');
    this.ownerDocument.activeElement = this; this.dispatch('focus');
  }
}

function harness({ memory = new Map(), shopId = 1, menuRevision = 'menu-a', editing = false, storageBroken = false } = {}) {
  const ids = new Map();
  const doc = { activeElement: null, createElement() { return new Element(doc); }, getElementById(id) { return ids.get(id) || null; } };
  doc.defaultView = { setTimeout, clearTimeout, AbortController,
    fetch: async () => ({ ok: true, json: async () => ({ items: [{ name_display: 'Amnesia Haze', base_type: 'sativa' }] }) }),
    sessionStorage: {
      getItem(key) { if (storageBroken) throw new Error('disabled'); return memory.get(key) ?? null; },
      setItem(key, value) { if (storageBroken) throw new Error('disabled'); memory.set(key, value); },
    }
  };
  const node = (id, value = '') => { const element = new Element(doc); element.id = id; element.value = value; ids.set(id, element); return element; };
  const form = node('entryForm');
  const fields = new Map();
  for (const [name, value] of Object.entries({ strain_name: '', grower_custom: '', is_cali: '', is_legal: '',
    price_currency: '€', package_weight_choice: '1g', package_price_amount: '', notes: '', consolidate_type: '' })) {
    const element = node(name, value); element.form = form; fields.set(name, element);
  }
  const radios = ['sativa', 'indica', 'hybrid', 'hash'].map(value => node(`type-${value}`, value));
  const weights = ['1', '3.5', '5'].map(value => { const element = node(`weight-${value}`); element.dataset.entryWeight = value; return element; });
  form.elements = { namedItem(name) { return fields.get(name) || null; } };
  form.querySelectorAll = selector => selector === 'input[name="base_type"]' ? radios : weights;
  form.submitCount = 0; form.requestSubmit = () => { form.submitCount++; form.dispatch('submit'); };
  ['strain_suggestions', 'strain_picker_status', 'grower_suggestions', 'grower_picker_status', 'grower_cali_hint'].forEach(id => node(id));
  if (!editing) {
    node('remember_entry_settings').checked = true;
    node('keep_entry_type'); node('entry_defaults_hint'); node('new_entry_section');
  } else {
    fields.get('strain_name').value = 'Existing flower'; fields.get('package_price_amount').value = '50';
    fields.get('grower_custom').value = 'Amsterdam Genetics'; radios[2].checked = true;
  }
  const api = attach({ form, shopId, menuRevision, editing, growers: ['Doja', 'Wizard Trees', 'Amsterdam Genetics'],
    endpoint: '/api/strain_suggest', onPriceChange() {}, onNameInput() {} });
  return { ids, fields, radios, weights, doc, memory, form, api, get: name => fields.get(name), id: name => ids.get(name) };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const typeGrower = (h, value) => { h.get('grower_custom').focus(); h.get('grower_custom').value = value; h.get('grower_custom').dispatch('input'); };

test('typing or selecting a grower enables Cali, with a persistent manual override', () => {
  const h = harness();
  typeGrower(h, 'Wizard Trees');
  assert.equal(h.get('is_cali').checked, true);
  h.get('is_cali').checked = false; h.get('is_cali').dispatch('change');
  assert.equal(h.get('is_cali').checked, false);
  const next = harness({ memory: h.memory });
  assert.equal(next.get('grower_custom').value, 'Wizard Trees');
  assert.equal(next.get('is_cali').checked, false);
  next.get('grower_custom').focus();
  next.id('grower_suggestions').dispatch('click', { target: next.id('grower_suggestions').children[0] });
  assert.equal(next.get('is_cali').checked, true);
});

test('remembered defaults never carry a strain, price, notes or global type changes', () => {
  const h = harness();
  h.get('strain_name').value = 'Old flower'; h.get('package_price_amount').value = '100';
  h.get('notes').value = 'Old notes'; h.get('consolidate_type').checked = true;
  typeGrower(h, 'Doja'); h.weights[1].dispatch('click');
  h.get('is_legal').checked = true; h.get('is_legal').dispatch('change');
  const next = harness({ memory: h.memory });
  assert.equal(next.get('grower_custom').value, 'Doja');
  assert.equal(next.get('package_weight_choice').value, '3.5g');
  assert.equal(next.get('is_cali').checked, true);
  assert.equal(next.get('is_legal').checked, true);
  assert.equal(next.get('strain_name').value, '');
  assert.equal(next.get('package_price_amount').value, '');
  assert.equal(next.get('notes').value, '');
  assert.equal(next.get('consolidate_type').checked, false);
  const stored = h.memory.get(h.api.storageKey);
  assert.doesNotMatch(stored, /Old flower|Old notes|100|consolidate_type/);
});

test('defaults are isolated by shop and by menu image', () => {
  const h = harness(); typeGrower(h, 'Doja');
  assert.equal(harness({ memory: h.memory, shopId: 2 }).get('grower_custom').value, '');
  assert.equal(harness({ memory: h.memory, menuRevision: 'new-menu' }).get('grower_custom').value, '');
});

test('editing opens with its original data even when add-entry defaults exist', () => {
  const h = harness(); typeGrower(h, 'Doja'); h.weights[1].dispatch('click');
  const edit = harness({ memory: h.memory, editing: true });
  assert.equal(edit.get('strain_name').value, 'Existing flower');
  assert.equal(edit.get('package_price_amount').value, '50');
  assert.equal(edit.get('grower_custom').value, 'Amsterdam Genetics');
  assert.equal(edit.get('is_cali').checked, false);
  assert.equal(edit.get('package_weight_choice').value, '1g');
  assert.equal(edit.radios[2].checked, true);
});

test('a pinned section type is retained; unpinning restores strain suggestions', async () => {
  const h = harness(); h.radios[3].checked = true; h.id('keep_entry_type').checked = true; h.id('keep_entry_type').dispatch('change');
  const next = harness({ memory: h.memory });
  next.get('strain_name').value = 'Amnesia Haze'; next.get('strain_name').focus(); await settle();
  assert.equal(next.radios[3].checked, true);
  assert.equal(next.radios[0].checked, false);
  next.id('keep_entry_type').checked = false; next.id('keep_entry_type').dispatch('change');
  next.get('strain_name').dispatch('keydown', { key: 'Enter' });
  assert.equal(next.radios[0].checked, true);
});

test('New section resets shared settings without discarding an entry being typed', () => {
  const h = harness(); typeGrower(h, 'Doja'); h.weights[1].dispatch('click');
  h.get('is_legal').checked = true; h.radios[3].checked = true; h.id('keep_entry_type').checked = true;
  h.get('strain_name').value = 'Current draft'; h.get('package_price_amount').value = '100';
  h.id('new_entry_section').dispatch('click');
  assert.equal(h.get('grower_custom').value, '');
  assert.equal(h.get('is_cali').checked, false);
  assert.equal(h.get('is_legal').checked, false);
  assert.equal(h.get('package_weight_choice').value, '1g');
  assert.equal(h.id('keep_entry_type').checked, false);
  assert.ok(h.radios.every(radio => !radio.checked));
  assert.equal(h.get('strain_name').value, 'Current draft');
  assert.equal(h.get('package_price_amount').value, '100');
});

test('quick sizes update selection and focus price; command/control Enter uses normal form saving', () => {
  const h = harness(); h.weights[1].dispatch('click');
  assert.equal(h.get('package_weight_choice').value, '3.5g');
  assert.equal(h.weights[1].attributes.get('aria-pressed'), 'true');
  assert.equal(h.doc.activeElement, h.get('package_price_amount'));
  const event = h.form.dispatch('keydown', { key: 'Enter', metaKey: true });
  assert.ok(event.defaultPrevented && event.stopped);
  assert.equal(h.form.submitCount, 1);
  const ordinary = h.form.dispatch('keydown', { key: 'Enter' });
  assert.equal(ordinary.defaultPrevented, false);
});

test('remembering can be switched off and browser-storage failures do not block entry', () => {
  const h = harness(); typeGrower(h, 'Doja'); h.id('remember_entry_settings').checked = false;
  h.id('remember_entry_settings').dispatch('change');
  const next = harness({ memory: h.memory });
  assert.equal(next.id('remember_entry_settings').checked, false);
  assert.equal(next.get('grower_custom').value, '');
  const broken = harness({ storageBroken: true });
  assert.doesNotThrow(() => typeGrower(broken, 'Wizard Trees'));
  assert.equal(broken.get('is_cali').checked, true);
});
