(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BudfinderStrainPicker = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  function attach({ input, list, status, priceInput, endpoint, sourceItems, entity = 'strain', onSelect, onResults, onInput }) {
    const doc = input.ownerDocument;
    const view = doc.defaultView;
    const cache = new Map();
    let items = [];
    let resultQuery = null;
    let active = -1;
    let serial = 0;
    let controller = null;
    let debounce = null;
    let timeout = null;
    let dismissed = false;

    const query = () => input.value.trim();
    const announce = text => { status.textContent = text; };
    const cancel = () => {
      serial += 1;
      view.clearTimeout(debounce);
      view.clearTimeout(timeout);
      if (controller) controller.abort();
      controller = null;
    };
    const hide = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    };
    const highlight = index => {
      active = index;
      Array.from(list.children).forEach((option, position) => {
        option.setAttribute('aria-selected', position === active ? 'true' : 'false');
      });
      const option = list.children[active];
      if (option) {
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
        announce(`${items.length} suggestions. ${items[active].name_display} highlighted.`);
      } else {
        input.removeAttribute('aria-activedescendant');
        announce(`${items.length} suggestions. Use the up and down arrow keys to choose.`);
      }
    };
    const advance = () => { if (priceInput) priceInput.focus(); };
    const pick = index => {
      if (resultQuery !== query() || !items[index]) return;
      const item = items[index];
      cancel();
      input.value = item.name_display;
      hide();
      announce('');
      if (onSelect) onSelect(item);
      advance();
    };
    const render = (next, text, direction) => {
      items = next;
      resultQuery = text;
      active = -1;
      list.replaceChildren();
      items.forEach((item, index) => {
        const option = doc.createElement('button');
        option.type = 'button';
        option.tabIndex = -1;
        option.className = 'strainSuggestion';
        option.id = `${list.id}-option-${index}`;
        option.dataset.strainIndex = String(index);
        option.setAttribute('role', 'option');
        const label = doc.createElement('span');
        label.textContent = item.name_display;
        const type = doc.createElement('span');
        type.className = 'strainSuggestionType';
        type.textContent = item.base_type || '';
        option.append(label, type);
        list.append(option);
      });
      if (items.length) {
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        highlight(direction ? (direction < 0 ? items.length - 1 : 0) : -1);
      } else {
        hide();
        announce(text ? `No existing match. You can keep this name to add a new ${entity}.` : `Type a ${entity} name to search.`);
      }
      if (onResults) onResults(items);
    };

    async function load({ choose = false, direction = 0 } = {}) {
      cancel();
      dismissed = false;
      const token = serial;
      const text = query();
      announce(`Looking up ${entity}s…`);
      let next;
      try {
        if (sourceItems) {
          const terms = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
          next = sourceItems.filter(item => terms.every(term => item.name_display.toLocaleLowerCase().includes(term)))
            .sort((a, b) => {
              const rank = item => item.name_display.toLocaleLowerCase() === text.toLocaleLowerCase() ? 0
                : item.name_display.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()) ? 1 : 2;
              return rank(a) - rank(b) || a.name_display.localeCompare(b.name_display);
            }).slice(0, 12);
        } else if (cache.has(text)) next = cache.get(text);
        else {
          controller = new view.AbortController();
          const requestController = controller;
          timeout = view.setTimeout(() => requestController.abort(), 5000);
          const response = await view.fetch(`${endpoint}?q=${encodeURIComponent(text)}`, { signal: controller.signal });
          if (!response.ok) throw new Error('Suggestions unavailable');
          const data = await response.json();
          next = Array.isArray(data.items) ? data.items.filter(item =>
            item && typeof item.name_display === 'string' && item.name_display.trim()
          ).slice(0, 30) : [];
          if (token !== serial) return;
          cache.set(text, next);
        }
        if (token !== serial || query() !== text || dismissed || doc.activeElement !== input) return;
        view.clearTimeout(timeout);
        controller = null;
        render(next, text, direction);
        if (choose) {
          if (next.length) pick(Math.max(active, 0));
          else advance();
        }
      } catch (_error) {
        if (token !== serial || query() !== text || dismissed || doc.activeElement !== input) return;
        hide();
        items = [];
        resultQuery = null;
        announce('Suggestions unavailable. You can type the full name and use Tab to continue.');
      } finally {
        if (token === serial) view.clearTimeout(timeout);
      }
    }

    input.addEventListener('input', event => {
      cancel();
      hide();
      items = [];
      resultQuery = null;
      dismissed = false;
      if (onInput) onInput();
      if (event.isComposing) return;
      debounce = view.setTimeout(() => load(), 80);
    });
    input.addEventListener('focus', () => load());
    input.addEventListener('compositionend', () => load());
    input.addEventListener('blur', () => { cancel(); hide(); announce(''); });
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        dismissed = true;
        hide();
        announce('');
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        if (resultQuery === query() && items.length && !list.hidden) {
          highlight(active < 0 ? (direction > 0 ? 0 : items.length - 1)
            : (active + direction + items.length) % items.length);
        } else load({ direction });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (dismissed) advance();
        else if (resultQuery === query() && items.length && !list.hidden) pick(Math.max(active, 0));
        else load({ choose: true });
      } else if (event.key === 'Tab') {
        // Keep exactly what the user typed when tabbing to the next field.
        cancel();
        hide();
      }
    });
    list.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-strain-index]')) event.preventDefault();
    });
    list.addEventListener('click', event => {
      const option = event.target.closest('[data-strain-index]');
      if (option && list.contains(option)) pick(Number(option.dataset.strainIndex));
    });
    if (input.form) input.form.addEventListener('reset', () => {
      cancel(); hide(); items = []; resultQuery = null; dismissed = false; announce('');
    });
    if (doc.activeElement === input) load();
    return { close() { cancel(); hide(); announce(''); } };
  }

  return { attach };
});
