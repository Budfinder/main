(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./strain-picker.js'));
  else root.BudfinderEntryHelpers = factory(root.BudfinderStrainPicker);
})(typeof window === 'undefined' ? globalThis : window, function (picker) {
  'use strict';

  function attach({ form, shopId, menuRevision = '', editing = false, growers = [], endpoint,
    onSuggestedType, onNameInput, onPriceChange }) {
    const doc = form.ownerDocument;
    const view = doc.defaultView;
    const field = name => form.elements.namedItem(name);
    const strain = field('strain_name');
    const grower = field('grower_custom');
    const cali = field('is_cali');
    const legal = field('is_legal');
    const currency = field('price_currency');
    const weight = field('package_weight_choice');
    const price = field('package_price_amount');
    const typeInputs = Array.from(form.querySelectorAll('input[name="base_type"]'));
    const remember = doc.getElementById('remember_entry_settings');
    const keepType = doc.getElementById('keep_entry_type');
    const growerHint = doc.getElementById('grower_cali_hint');
    const defaultsHint = doc.getElementById('entry_defaults_hint');
    const sectionButton = doc.getElementById('new_entry_section');
    const storageKey = `budfinder.entryDefaults.v1.${shopId}.${menuRevision}`;
    let manualCali = false;
    const typeValue = () => typeInputs.find(input => input.checked)?.value || '';
    const setType = value => typeInputs.forEach(input => { input.checked = input.value === value; });
    const pinned = () => Boolean(keepType?.checked && typeValue());

    const collect = () => ({
      enabled: Boolean(remember?.checked),
      grower: grower.value,
      isCali: cali.checked,
      isLegal: legal.checked,
      currency: currency.value,
      weight: weight.value,
      keepType: Boolean(keepType?.checked),
      type: keepType?.checked ? typeValue() : '',
    });
    const showDefaultsHint = () => {
      if (defaultsHint) defaultsHint.textContent = remember?.checked
        ? 'Grower, flags, currency and pack size stay selected for this shop. Use New section to reset them.'
        : 'Settings will reset after each entry.';
    };
    const persist = () => {
      if (editing || !remember) return;
      try {
        const settings = collect();
        view.sessionStorage.setItem(storageKey, JSON.stringify(settings.enabled ? settings : { enabled: false }));
      } catch (_err) { /* Entry still works when browser storage is unavailable. */ }
      showDefaultsHint();
    };
    const restore = settings => {
      if (!settings || typeof settings !== 'object') return;
      if (remember) remember.checked = settings.enabled !== false;
      if (!settings.enabled) return;
      if (typeof settings.grower === 'string') grower.value = settings.grower.slice(0, 160);
      cali.checked = settings.isCali === true;
      legal.checked = settings.isLegal === true;
      if (['€', '£', '$'].includes(settings.currency)) currency.value = settings.currency;
      if (typeof settings.weight === 'string' && /^\s*\d+(?:[.,]\d+)?\s*g?\s*$/i.test(settings.weight)) weight.value = settings.weight;
      if (keepType) keepType.checked = settings.keepType === true;
      if (settings.keepType && ['sativa', 'indica', 'hybrid', 'hash'].includes(settings.type)) setType(settings.type);
    };
    if (!editing) {
      try { restore(JSON.parse(view.sessionStorage.getItem(storageKey) || 'null')); }
      catch (_err) { /* Ignore stale or unavailable preferences. */ }
    }

    const updateWeightButtons = () => {
      const value = Number(weight.value.trim().replace(/g\s*$/i, '').replace(',', '.'));
      form.querySelectorAll('[data-entry-weight]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.entryWeight) === value));
      });
    };
    const weightChanged = () => { updateWeightButtons(); if (onPriceChange) onPriceChange(); persist(); };
    const chooseType = item => {
      if (editing || pinned() || !item?.base_type) return;
      if (onSuggestedType) onSuggestedType(item);
      else setType(item.base_type);
      persist();
    };
    const growerChanged = force => {
      if (grower.value.trim() && (force || !manualCali)) {
        cali.checked = true;
        if (growerHint) growerHint.textContent = 'Cali selected for this grower. Untick Cali for other origins.';
      } else if (!grower.value.trim() && growerHint) growerHint.textContent = '';
      persist();
    };

    const namePicker = picker.attach({
      input: strain, list: doc.getElementById('strain_suggestions'), status: doc.getElementById('strain_picker_status'),
      priceInput: price, endpoint,
      onSelect: chooseType,
      onResults: items => {
        const text = strain.value.trim().toLocaleLowerCase();
        const exact = items.find(item => item.name_display.trim().toLocaleLowerCase() === text);
        if (exact) chooseType(exact);
      },
      onInput: onNameInput,
    });
    grower.addEventListener('focus', () => { manualCali = false; });
    const growerPicker = picker.attach({
      input: grower, list: doc.getElementById('grower_suggestions'), status: doc.getElementById('grower_picker_status'),
      priceInput: price, sourceItems: growers.map(name => ({ name_display: name })), entity: 'grower',
      onSelect: () => { manualCali = false; growerChanged(true); },
      onInput: () => growerChanged(false),
    });
    cali.addEventListener('change', () => {
      manualCali = true;
      if (growerHint) growerHint.textContent = '';
      persist();
    });
    [legal, currency, keepType, remember, ...typeInputs].filter(Boolean).forEach(input => {
      input.addEventListener('change', () => {
        if ((input === keepType || typeInputs.includes(input)) && onNameInput) onNameInput();
        persist();
      });
    });
    weight.addEventListener('input', weightChanged);
    weight.addEventListener('change', weightChanged);
    form.querySelectorAll('[data-entry-weight]').forEach(button => button.addEventListener('click', () => {
      weight.value = `${button.dataset.entryWeight}g`;
      weightChanged();
      price.focus();
    }));
    if (sectionButton) sectionButton.addEventListener('click', () => {
      grower.value = '';
      cali.checked = false;
      legal.checked = false;
      currency.value = '€';
      weight.value = '1g';
      if (keepType) keepType.checked = false;
      setType('');
      manualCali = false;
      if (growerHint) growerHint.textContent = '';
      if (onNameInput) onNameInput();
      growerPicker.close();
      weightChanged();
      strain.focus();
    });
    form.addEventListener('submit', persist);
    form.addEventListener('keydown', event => {
      if (!event.isComposing && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        namePicker.close();
        growerPicker.close();
        form.requestSubmit();
      }
    }, true);
    form.addEventListener('reset', () => {
      if (editing) return;
      const settings = collect();
      Promise.resolve().then(() => {
        restore(settings);
        manualCali = false;
        if (growerHint) growerHint.textContent = '';
        if (onNameInput) onNameInput();
        updateWeightButtons();
        if (onPriceChange) onPriceChange();
        showDefaultsHint();
      });
    });
    updateWeightButtons();
    if (onPriceChange) onPriceChange();
    showDefaultsHint();
    return { storageKey };
  }

  return { attach };
});
