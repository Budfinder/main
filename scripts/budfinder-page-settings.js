(() => {
  'use strict';

  const PERSONALISATION_STORAGE_KEYS = ['budfinder_personalisation', 'locate3_personalisation', 'locate2_personalisation'];
  const SAVED_DATA_STORAGE_KEYS = [
    'budfinder_location_preferences',
    'locate3_location_preferences',
    'favorites',
    'budfinder_recent_destinations',
    'locate3_recent_destinations',
    'budfinder_strain_shelf',
    'locate3_strain_shelf',
    'budfinder_saved_journeys',
    'budfinder_map_focus_shops',
    'budfinder_explorer_selected_shops'
  ];
  const DEFAULT_PERSONALISATION = {
    displayName: 'Explorer',
    accent: 'kings-juice',
    showIntroPopupOnLoad: false
  };

  function parseJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  }

  function readPersonalisation() {
    const merged = {};
    PERSONALISATION_STORAGE_KEYS.slice().reverse().forEach(key => {
      const parsed = parseJson(key);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(merged, parsed);
      }
    });
    return Object.assign({}, DEFAULT_PERSONALISATION, merged);
  }

  function savePersonalisation(next) {
    const payload = JSON.stringify(Object.assign({}, DEFAULT_PERSONALISATION, next || {}));
    PERSONALISATION_STORAGE_KEYS.forEach(key => {
      try {
        localStorage.setItem(key, payload);
      } catch (_err) {
        // Storage can be blocked, but the current page can still update.
      }
    });
  }

  function removeStorageKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (_err) {
      // Storage can be blocked in private browsing.
    }
  }

  function ensureStyles() {
    if (document.getElementById('budfinder-page-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'budfinder-page-settings-style';
    style.textContent = `
      .site-settings-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: grid;
        place-items: start end;
        padding: max(76px, calc(env(safe-area-inset-top) + 72px)) max(16px, env(safe-area-inset-right)) 18px max(16px, env(safe-area-inset-left));
        background: rgba(30, 45, 36, 0.18);
        backdrop-filter: blur(6px);
      }

      .site-settings-backdrop[hidden] {
        display: none;
      }

      .site-settings-panel {
        width: min(420px, 100%);
        max-height: calc(100vh - 96px);
        overflow: auto;
        border: 1px solid var(--panel-border, rgba(32, 91, 66, 0.18));
        border-radius: 18px;
        background: var(--panel-strong, rgba(255, 252, 246, 0.96));
        color: var(--ink, #233126);
        box-shadow: 0 24px 58px rgba(31, 42, 35, 0.22);
      }

      .site-settings-head,
      .site-settings-section {
        padding: 18px;
        border-bottom: 1px solid var(--panel-border, rgba(32, 91, 66, 0.18));
      }

      .site-settings-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }

      .site-settings-head h2,
      .site-settings-section h3 {
        margin: 0;
        line-height: 1.1;
      }

      .site-settings-head p,
      .site-settings-section p,
      .site-settings-note {
        margin: 8px 0 0;
        color: var(--muted, #667567);
        font-size: 13px;
        line-height: 1.45;
      }

      .site-settings-section:last-child {
        border-bottom: 0;
      }

      .site-settings-field {
        display: grid;
        gap: 7px;
        margin-top: 12px;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        color: var(--muted, #667567);
      }

      .site-settings-field input,
      .site-settings-field select {
        min-height: 42px;
        border: 1px solid var(--control-border, var(--panel-border, rgba(32, 91, 66, 0.18)));
        border-radius: 12px;
        padding: 0 12px;
        background: var(--control-bg, rgba(255, 255, 255, 0.72));
        color: var(--control-text, var(--ink, #233126));
        color-scheme: var(--control-color-scheme, light);
        font: inherit;
        font-weight: 800;
        text-transform: none;
      }

      .site-settings-field input::placeholder {
        color: var(--control-muted, var(--muted, #667567));
        opacity: 0.82;
      }

      .site-settings-actions,
      .site-settings-confirm {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .site-settings-button,
      .site-settings-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        border: 1px solid var(--control-border, var(--panel-border, rgba(32, 91, 66, 0.18)));
        border-radius: 999px;
        padding: 0 14px;
        background: var(--control-bg, rgba(255, 255, 255, 0.66));
        color: var(--control-text, var(--ink, #233126));
        font: inherit;
        font-weight: 900;
        text-decoration: none;
        cursor: pointer;
      }

      .site-settings-button.primary,
      .site-settings-link.primary {
        border-color: transparent;
        background: linear-gradient(135deg, var(--accent, #2e7b59), var(--accent-strong, #205b42));
        color: var(--button-text, #fff9f0);
      }

      .site-settings-button.danger {
        border-color: rgba(142, 54, 54, 0.28);
        color: #8e3636;
      }

      .site-settings-close {
        flex: 0 0 auto;
        width: 40px;
        min-height: 40px;
        border-radius: 999px;
        padding: 0;
      }

      .site-settings-status {
        min-height: 18px;
        margin-top: 10px;
        color: var(--accent-strong, #205b42);
        font-size: 13px;
        font-weight: 800;
      }

      @media (max-width: 640px) {
        .site-settings-backdrop {
          align-items: start;
          padding-top: max(84px, calc(env(safe-area-inset-top) + 76px));
        }

        .site-settings-panel {
          width: 100%;
          max-height: calc(100vh - 104px);
          border-radius: 14px;
        }

        .site-settings-button,
        .site-settings-link {
          min-height: 44px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'budfinder-page-settings';
    panel.className = 'site-settings-backdrop';
    panel.hidden = true;
    panel.innerHTML = `
      <aside class="site-settings-panel" role="dialog" aria-modal="true" aria-labelledby="site-settings-title">
        <div class="site-settings-head">
          <div>
            <h2 id="site-settings-title" tabindex="-1">Settings</h2>
            <p>Preferences, filters, display, and data tools in one place.</p>
          </div>
          <button class="site-settings-button site-settings-close" type="button" data-site-settings-close aria-label="Close settings">&times;</button>
        </div>

        <section class="site-settings-section" aria-labelledby="site-settings-preferences-title">
          <h3 id="site-settings-preferences-title">Preferences</h3>
          <label class="site-settings-field" for="site-settings-name">
            Your name
            <input id="site-settings-name" type="text" maxlength="24" placeholder="Explorer" />
          </label>
        </section>

        <section class="site-settings-section" aria-labelledby="site-settings-filters-title">
          <h3 id="site-settings-filters-title">Filters</h3>
          <p>Reset stored map handoffs here. Live map category filters are still controlled on the map.</p>
          <div class="site-settings-actions">
            <button id="site-reset-filters" class="site-settings-button" type="button">Reset filters</button>
            <a class="site-settings-link" href="map.html#settings">Open map filters</a>
          </div>
        </section>

        <section class="site-settings-section" aria-labelledby="site-settings-data-title">
          <h3 id="site-settings-data-title">Data</h3>
          <p>Location files and the database explorer stay available without moving this Settings button away from your current page.</p>
          <div class="site-settings-actions">
            <a class="site-settings-link" href="map.html#settings">Choose location file</a>
            <a class="site-settings-link" href="database.html">Open database</a>
            <button id="site-clear-data" class="site-settings-button danger" type="button">Clear saved data</button>
          </div>
          <div id="site-clear-confirm" class="site-settings-confirm" hidden>
            <button id="site-confirm-clear-data" class="site-settings-button danger" type="button">Confirm clear</button>
            <button id="site-cancel-clear-data" class="site-settings-button" type="button">Cancel</button>
          </div>
          <p class="site-settings-note">Saved shops, ratings, notes, recent Destinations, Wanted strains, and saved itineraries live on this device.</p>
        </section>

        <section class="site-settings-section" aria-labelledby="site-settings-display-title">
          <h3 id="site-settings-display-title">Display</h3>
          <label class="site-settings-field" for="site-settings-vibe">
            Colour theme
            <select id="site-settings-vibe" data-budfinder-vibe-selector></select>
          </label>
          <div class="site-settings-actions">
            <button id="site-reset-display" class="site-settings-button" type="button">Reset display</button>
          </div>
          <div id="site-settings-status" class="site-settings-status" role="status" aria-live="polite"></div>
        </section>
      </aside>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function init() {
    const toggles = Array.from(document.querySelectorAll('[data-budfinder-settings-toggle]'));
    if (!toggles.length) return;

    ensureStyles();
    const panel = createPanel();
    const nameInput = panel.querySelector('#site-settings-name');
    const vibeSelect = panel.querySelector('#site-settings-vibe');
    const status = panel.querySelector('#site-settings-status');
    const confirmWrap = panel.querySelector('#site-clear-confirm');
    let previouslyFocusedElement = null;

    function setStatus(message) {
      if (!status) return;
      status.textContent = message || '';
    }

    function syncForm() {
      const personalisation = readPersonalisation();
      if (nameInput) nameInput.value = personalisation.displayName || '';
      if (window.BudfinderTheme) {
        window.BudfinderTheme.applyTheme(personalisation.accent || 'kings-juice', { save: false, dispatch: false });
      }
    }

    function openPanel() {
      previouslyFocusedElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      syncForm();
      panel.hidden = false;
      document.body.classList.add('has-site-settings-open');
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', 'true'));
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#settings`);
      }
      window.setTimeout(() => {
        const heading = panel.querySelector('#site-settings-title');
        if (heading) heading.focus({ preventScroll: true });
      }, 0);
    }

    function closePanel() {
      panel.hidden = true;
      document.body.classList.remove('has-site-settings-open');
      confirmWrap.hidden = true;
      setStatus('');
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
      if ((window.location.hash || '').toLowerCase() === '#settings' && window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      }
      if (previouslyFocusedElement && document.contains(previouslyFocusedElement)) {
        previouslyFocusedElement.focus({ preventScroll: true });
      }
      previouslyFocusedElement = null;
    }

    toggles.forEach(toggle => {
      toggle.setAttribute('aria-controls', panel.id);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', event => {
        event.preventDefault();
        openPanel();
      });
    });

    panel.addEventListener('click', event => {
      if (event.target === panel || event.target.closest('[data-site-settings-close]')) {
        closePanel();
      }
    });

    document.addEventListener('keydown', event => {
      if (panel.hidden) return;
      if (event.key === 'Escape') {
        closePanel();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(element => !element.hidden && element.getClientRects().length > 0);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeIsFocusable = focusable.includes(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !activeIsFocusable)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeIsFocusable)) {
        event.preventDefault();
        first.focus();
      }
    });

    nameInput.addEventListener('input', event => {
      const personalisation = readPersonalisation();
      personalisation.displayName = (event.target.value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      savePersonalisation(personalisation);
      setStatus('Preferences saved.');
    });

    vibeSelect.addEventListener('change', event => {
      const personalisation = readPersonalisation();
      personalisation.accent = event.target.value || DEFAULT_PERSONALISATION.accent;
      savePersonalisation(personalisation);
      if (window.BudfinderTheme) {
        window.BudfinderTheme.applyTheme(personalisation.accent);
      }
      setStatus('Display saved.');
    });

    panel.querySelector('#site-reset-filters').addEventListener('click', () => {
      removeStorageKey('budfinder_map_focus_shops');
      removeStorageKey('budfinder_explorer_selected_shops');
      setStatus('Stored map handoff filters reset.');
    });

    panel.querySelector('#site-clear-data').addEventListener('click', () => {
      confirmWrap.hidden = false;
      setStatus('Confirm below to clear saved local data.');
    });

    panel.querySelector('#site-cancel-clear-data').addEventListener('click', () => {
      confirmWrap.hidden = true;
      setStatus('');
    });

    panel.querySelector('#site-confirm-clear-data').addEventListener('click', () => {
      SAVED_DATA_STORAGE_KEYS.forEach(removeStorageKey);
      confirmWrap.hidden = true;
      setStatus('Saved local data cleared.');
    });

    panel.querySelector('#site-reset-display').addEventListener('click', () => {
      savePersonalisation(DEFAULT_PERSONALISATION);
      if (window.BudfinderTheme) {
        window.BudfinderTheme.applyTheme(DEFAULT_PERSONALISATION.accent);
      }
      syncForm();
      setStatus('Display reset.');
    });

    window.addEventListener('budfinder:vibechange', event => {
      const personalisation = readPersonalisation();
      personalisation.accent = event && event.detail ? event.detail.accent : personalisation.accent;
      savePersonalisation(personalisation);
      setStatus('Display saved.');
    });

    window.addEventListener('hashchange', () => {
      if ((window.location.hash || '').toLowerCase() === '#settings') openPanel();
    });

    syncForm();

    if ((window.location.hash || '').toLowerCase() === '#settings') openPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
