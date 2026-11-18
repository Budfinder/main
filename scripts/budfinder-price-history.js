(() => {
  'use strict';
  const DAY = 86400000;
  // Exclude the earlier expansion from every displayed history and comparison.
  const HISTORY_START = '2026-08-01';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateTime = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  };
  const dateLabel = (value, short = false) => new Date(dateTime(value)).toLocaleDateString('en-GB', {
    day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC'
  });
  const money = value => `€${value.toFixed(2)}/g`;
  const count = value => Number.isInteger(value) && value >= 0 ? value : 0;
  const counted = (value, label) => `${value.toLocaleString()} ${label}${value === 1 ? '' : 's'}`;

  function normaliseData(data) {
    if (!data || data.version !== 1 || data.currency !== '€' || data.unit !== 'g'
      || data.date_basis !== 'recorded_observation' || !Number.isFinite(Date.parse(data.exported_at_utc))
      || !Array.isArray(data.series)) throw new Error('Invalid price history');
    const latest = new Date(data.exported_at_utc).toISOString().slice(0, 10);
    const used = new Set();
    const series = data.series.filter(row => row && typeof row.id === 'string' && row.id && typeof row.name === 'string')
      .map(row => {
        if (used.has(row.id)) throw new Error('Duplicate history scope');
        used.add(row.id);
        const days = new Map();
        for (const point of Array.isArray(row.points) ? row.points : []) {
          if (!point || !Number.isFinite(dateTime(point.date)) || point.date > latest) continue;
          const valid = typeof point.average_price === 'number' && Number.isFinite(point.average_price)
            && point.average_price > 0 && count(point.shop_count) > 0 && count(point.strain_count) > 0 && count(point.listing_count) > 0;
          days.set(point.date, { date: point.date, average_price: valid ? point.average_price : null,
            shop_count: count(point.shop_count), strain_count: count(point.strain_count), listing_count: count(point.listing_count),
            kind: point.kind === 'current' ? 'current' : 'recorded' });
        }
        return { id: row.id, name: row.name, kind: row.kind || 'location', points: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
      });
    if (!series.length) throw new Error('No price history scopes');
    const shops = (Array.isArray(data.benchmark?.shops) ? data.benchmark.shops : [])
      .filter(shop => shop && Number.isInteger(shop.shop_id) && shop.shop_id > 0)
      .map(shop => ({ shopId: shop.shop_id, name: String(shop.name || 'Coffeeshop'), city: String(shop.city || '') }));
    return { series, latest, exportedAt: data.exported_at_utc, benchmarkShops: shops };
  }

  function selectPoints(series, period, latest) {
    const cutoff = Math.max(dateTime(HISTORY_START), period === 'all' ? -Infinity : dateTime(latest) - (Number(period) - 1) * DAY);
    return series.points.filter(point => dateTime(point.date) >= cutoff);
  }

  function buildGeometry(points, width = 800, height = 270, traces = [], axisStart = null, axisEnd = null) {
    const valid = points.filter(point => point.average_price != null);
    if (!valid.length) return null;
    width = Math.max(180, width);
    const box = { left: 45, right: width - 15, top: 18, bottom: height - 35 };
    // Missing-price rows are not observations and must not add empty space.
    const times = valid.map(point => dateTime(point.date));
    const start = Math.min(...times, ...(Number.isFinite(axisStart) ? [axisStart] : [])), end = Math.max(...times, ...(Number.isFinite(axisEnd) ? [axisEnd] : []));
    const visibleTraces = traces.map(trace => ({ ...trace, points: trace.points.filter(point => point.average_price != null && dateTime(point.date) >= start && dateTime(point.date) <= end) }));
    const values = [...valid.map(point => point.average_price), ...visibleTraces.flatMap(trace => trace.points.map(point => point.average_price))];
    const low = Math.min(...values), high = Math.max(...values);
    const rough = (high - low || Math.max(2, high * .15)) / 4;
    const power = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].find(value => value * power >= rough) * power;
    const min = Math.max(0, Math.floor((low - step * .25) / step) * step);
    const max = Math.ceil((high + step * .25) / step) * step;
    const x = time => start === end ? (box.left + box.right) / 2 : box.left + (time - start) / (end - start) * (box.right - box.left);
    const y = value => box.bottom - (value - min) / (max - min) * (box.bottom - box.top);
    // A continuous visual connection between real observations. No intermediate
    // prices or dates are inserted into either the data or the accessible table.
    const segments = [valid.map(point => ({ ...point, x: x(dateTime(point.date)), y: y(point.average_price) }))];
    const ticks = [];
    for (let value = min; value <= max + step / 100 && ticks.length < 12; value += step) ticks.push({ value, y: y(value) });
    const tickCount = start === end ? 1 : width < 500 ? 3 : 5;
    const xTicks = Array.from({ length: tickCount }, (_, index) => {
      const time = tickCount === 1 ? start : start + (end - start) * index / (tickCount - 1);
      return { x: x(time), label: dateLabel(new Date(time).toISOString().slice(0, 10), true), anchor: index === 0 ? 'start' : index === tickCount - 1 ? 'end' : 'middle' };
    });
    return { width, height, box, ticks, xTicks, segments, points: segments.flat(),
      traces: visibleTraces.filter(trace => trace.points.length).map(trace => ({ ...trace, points: trace.points.map(point => ({ ...point, x: x(dateTime(point.date)), y: y(point.average_price) })) })) };
  }

  function chartSvg(geometry, selected, scope) {
    const { width, height, box, ticks, xTicks, segments, points, traces } = geometry;
    const point = points[selected];
    const path = segment => segment.map((item, index) => `${index ? 'L' : 'M'}${item.x.toFixed(2)},${item.y.toFixed(2)}`).join(' ');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="price-chart-title price-chart-desc">
      <title id="price-chart-title">${escape(scope)} recorded average price per gram</title>
      <desc id="price-chart-desc">${escape(dateLabel(points[0].date))} to ${escape(dateLabel(points.at(-1).date))}. The line connects recorded observations. An incomplete latest benchmark is identified in the chart status. Prices between markers are unknown. Use the table below for all values.</desc>
      <defs><linearGradient id="price-history-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".17"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(tick => `<line class="price-history-grid" x1="${box.left}" x2="${box.right}" y1="${tick.y}" y2="${tick.y}"/><text class="price-history-axis" x="${box.left - 10}" y="${tick.y + 4}" text-anchor="end">€${Number(tick.value.toFixed(2))}</text>`).join('')}
      ${xTicks.map(tick => `<text class="price-history-axis" x="${tick.x}" y="${height - 10}" text-anchor="${tick.anchor}">${escape(tick.label)}</text>`).join('')}
      ${traces.map(trace => `<g class="price-history-shop-trace"><title>${escape(trace.name)}</title><path d="${path(trace.points)}"/></g>`).join('')}
      ${segments.filter(segment => segment.length > 1).map(segment => `<path d="${path(segment)} L${segment.at(-1).x},${box.bottom} L${segment[0].x},${box.bottom} Z" fill="url(#price-history-fill)"/><path class="price-history-line" d="${path(segment)}"/>`).join('')}
      ${points.map(item => `<circle class="price-history-dot" cx="${item.x}" cy="${item.y}" r="2"/>`).join('')}
      <line class="price-history-guide" x1="${point.x}" x2="${point.x}" y1="${box.top}" y2="${box.bottom}"/>
      <circle class="price-history-selected" cx="${point.x}" cy="${point.y}" r="5"/>
    </svg>`;
  }

  function mount(doc, runtime) {
    const section = doc.getElementById('price-history');
    if (!section) return null;
    const byId = id => doc.getElementById(id);
    const els = { scope: byId('price-history-scope'), ranges: byId('price-history-ranges'), plot: byId('price-history-plot'),
      value: byId('price-history-value'), date: byId('price-history-date'), coverage: byId('price-history-coverage'),
      status: byId('price-history-status'), table: byId('price-history-rows'), live: byId('price-history-live'),
      controls: byId('price-history-controls'), details: byId('price-history-details'), stamp: byId('price-history-stamp'),
      benchmark: byId('price-history-benchmark'), shops: byId('price-history-shops'),
      benchmarkDescription: byId('price-history-benchmark-description'),
      traceControl: byId('price-history-trace-control'), traceToggle: byId('price-history-trace-toggle'),
      partial: byId('price-history-partial'), partialToggle: byId('price-history-partial-toggle'), partialResult: byId('price-history-partial-result') };
    els.note = byId('price-history-note');
    els.change = byId('price-history-change');
    // Shop traces are opt-in: with them on, the scale must fit every shop
    // (roughly €5–€30) and the benchmark line looks flat.
    const state = { data: null, period: 'all', points: [], geometry: null, selected: -1, showTraces: false, customWarning: '' };

    function showChange(point) {
      if (!els.change) return;
      const first = state.geometry && state.geometry.points[0];
      if (!point || point.partial || !first || first.partial || point === first || !(first.average_price > 0)) {
        els.change.textContent = '';
        els.change.hidden = true;
        return;
      }
      const percent = Math.round((point.average_price - first.average_price) / first.average_price * 1000) / 10;
      const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';
      els.change.textContent = `${sign}${Math.abs(percent).toFixed(1)}% since ${dateLabel(first.date)}`;
      els.change.dataset.trend = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
      els.change.hidden = false;
    }

    function paint(announce = false) {
      const scope = state.data.series.find(row => row.id === els.scope.value) || state.data.series[0];
      const point = state.geometry.points[state.selected];
      els.plot.innerHTML = chartSvg(state.geometry, state.selected, scope.name);
      els.value.textContent = money(point.average_price);
      showChange(point);
      els.date.textContent = `${point.partial ? 'Incomplete latest snapshot' : point.kind === 'current' ? 'Latest snapshot' : 'Recorded average'} · ${dateLabel(point.date)}`;
      const strainCoverage = scope.id === 'custom-benchmark'
        ? `${point.strain_count.toLocaleString()} shop strain ${point.strain_count === 1 ? 'entry' : 'entries'}`
        : counted(point.strain_count, 'strain');
      els.coverage.textContent = `${point.partial ? `${point.shop_count} of ${(scope.shops || state.data.benchmarkShops).length} shops` : counted(point.shop_count, 'shop')} · ${strainCoverage} · ${counted(point.listing_count, 'listing')}`;
      if (announce) els.live.textContent = `${dateLabel(point.date)}: ${money(point.average_price)}, ${els.coverage.textContent}`;
    }

    function render(reset = true) {
      if (!state.data) return;
      const scope = state.data.series.find(row => row.id === els.scope.value) || state.data.series[0];
      const benchmarkShops = scope.shops || state.data.benchmarkShops;
      const strainHeader = byId('price-history-strain-header');
      if (strainHeader) strainHeader.textContent = scope.id === 'custom-benchmark' ? 'Shop strain entries' : 'Strains';
      state.points = selectPoints(scope, state.period, state.data.latest);
      // When a benchmark is incomplete, plot the actual latest reporting-shop
      // average separately rather than pretending it is a full benchmark.
      const latestPoint = state.points.at(-1);
      if (scope.kind === 'benchmark' && latestPoint?.average_price == null && latestPoint?.shop_count > 0) {
        const reported = benchmarkShops.map(shop => state.data.series.find(row => row.id === `shop-${shop.shopId}`)?.points.find(point => point.date === latestPoint.date))
          .filter(point => point && point.average_price != null);
        if (reported.length === latestPoint.shop_count) {
          const average = reported.reduce((sum, point) => sum + point.average_price, 0) / reported.length;
          state.points = [...state.points.slice(0, -1), { ...latestPoint, average_price: average, partial: true }];
        }
      }
      const oldDate = state.geometry?.points[state.selected]?.date;
      const width = els.plot.clientWidth || 800;
      const selectedShopIds = new Set(benchmarkShops.map(shop => `shop-${shop.shopId}`));
      const traces = scope.kind === 'benchmark' && state.showTraces ? state.data.series.filter(row => row.kind === 'shop' && selectedShopIds.has(row.id))
        .map(row => ({ name: row.name, points: selectPoints(row, state.period, state.data.latest) })) : [];
      // Short ranges begin at their first available observation, so their
      // timeline never reserves blank space for dates without a price.
      const firstObservation = state.points.find(point => point.average_price != null);
      const axisStart = state.period === 'all' ? dateTime(HISTORY_START) : dateTime(firstObservation?.date);
      state.geometry = buildGeometry(state.points, width, width < 500 ? 240 : 260, traces, axisStart, dateTime(state.data.latest));
      els.traceControl.hidden = scope.kind !== 'benchmark';
      els.traceToggle.checked = state.showTraces;
      if (els.partial) { els.partial.hidden = true; els.partialResult.hidden = true; els.partialToggle.setAttribute('aria-expanded', 'false'); }
      const coverage = state.points.filter(point => point.average_price != null).map(point => point.shop_count);
      if (scope.kind === 'benchmark') {
        els.note.textContent = `The same ${benchmarkShops.length} shops are used for every marker, with each shop given equal weight. Changes in the strains they stock can still move the average.${scope.id === 'custom-benchmark' ? ' Strain entries count each shop’s strains, so the same strain may be counted more than once.' : ''}`;
        els.benchmarkDescription.textContent = `The same ${benchmarkShops.length} shops are tracked throughout. Each shop contributes its average once, so larger menus do not dominate. The latest incomplete snapshot is shown separately using only shops with prices and is marked on the chart. Missing shops are never silently replaced.`;
        els.shops.innerHTML = benchmarkShops.map(shop => `<a href="database.html?detail=shop&amp;shop_id=${shop.shopId}"><strong>${escape(shop.name)}</strong><span>${escape(shop.city)}</span></a>`).join('');
      } else if (scope.kind === 'shop') {
        els.note.textContent = 'This shop’s average reflects the strains listed at each observation. Changes in the menu mix can move the average.';
      } else if (coverage.length) {
        const low = Math.min(...coverage), high = Math.max(...coverage);
        els.note.textContent = `Coverage in this period: ${low.toLocaleString()}${low === high ? '' : `–${high.toLocaleString()}`} shops. The mix of shops and strains changes, so this is not a like-for-like market price index.`;
      } else {
        els.note.textContent = 'There are no usable observations in this period. Choose another location or time range.';
      }
      els.table.innerHTML = state.points.slice().reverse().map(point => `<tr><th scope="row">${escape(dateLabel(point.date))}</th><td>${point.average_price == null ? 'No recorded price' : `${money(point.average_price)}${point.partial ? ' (incomplete)' : ''}`}</td><td>${point.shop_count.toLocaleString()}</td><td>${point.strain_count.toLocaleString()}</td></tr>`).join('');
      els.ranges.querySelectorAll('[data-price-range]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.priceRange === state.period)));
      if (!state.geometry) {
        els.plot.hidden = true;
        els.plot.removeAttribute('tabindex');
        els.value.textContent = 'No recorded price';
        showChange(null);
        els.date.textContent = scope.name;
        els.coverage.textContent = '';
        els.status.hidden = false;
        els.status.textContent = state.customWarning || (scope.kind === 'benchmark'
          ? `There are no recorded prices for every selected shop in this period.${scope.missingLatest?.length ? ` No current price: ${scope.missingLatest.join(', ')}.` : ''}`
          : 'There are no recorded prices for this location in the selected period.');
        return;
      }
      els.plot.hidden = false;
      els.plot.setAttribute('tabindex', '0');
      state.selected = reset ? state.geometry.points.length - 1 : state.geometry.points.findIndex(point => point.date === oldDate);
      if (state.selected < 0) state.selected = state.geometry.points.length - 1;
      els.status.hidden = state.geometry.points.length > 1;
      els.status.textContent = state.geometry.points.length === 1 ? 'One snapshot is available. More history will appear as menus are recorded.' : '';
      if (scope.kind === 'benchmark' && (state.points.at(-1)?.average_price == null || state.points.at(-1)?.partial)) {
        els.status.hidden = false;
        const missing = scope.missingLatest || benchmarkShops.filter(shop => {
          const row = state.data.series.find(item => item.id === `shop-${shop.shopId}`);
          const latest = row?.points.at(-1);
          return latest?.date === state.data.latest && latest.average_price == null;
        }).map(shop => shop.name);
        const lastComplete = state.geometry.points.filter(point => !point.partial).at(-1);
        els.status.textContent = `${lastComplete ? `Latest complete benchmark: ${dateLabel(lastComplete.date)}. ` : ''}Latest snapshot is incomplete (${state.points.at(-1)?.shop_count || 0} of ${benchmarkShops.length} shops).${missing.length ? ` No current price: ${missing.join(', ')}.` : ''} ${state.points.at(-1)?.partial ? 'The latest point is the average of the shops with prices; it is not directly comparable with the complete benchmark.' : ''}`;
        // Use the latest point for each selected shop only when every reported
        // value is present; otherwise do not suggest a partial result.
        const latestDate = state.points.at(-1).date;
        const latestRows = benchmarkShops.map(shop => state.data.series.find(row => row.id === `shop-${shop.shopId}`)?.points.find(point => point.date === latestDate));
        const reported = latestRows.filter(point => point && point.average_price != null);
        if (els.partial && reported.length && reported.length === state.points.at(-1).shop_count) {
          const subsetAverage = reported.reduce((sum, point) => sum + point.average_price, 0) / reported.length;
          els.partialResult.textContent = `${dateLabel(latestDate)}: ${money(subsetAverage)} across ${reported.length} of ${benchmarkShops.length} shops. This incomplete subset is not directly comparable with the full benchmark.`;
          els.partial.hidden = false;
        }
      }
      if (state.customWarning) { els.status.hidden = false; els.status.textContent = state.customWarning; }
      paint();
    }

    els.partialToggle?.addEventListener('click', () => {
      const expanded = els.partialToggle.getAttribute('aria-expanded') === 'true';
      els.partialToggle.setAttribute('aria-expanded', String(!expanded));
      els.partialResult.hidden = expanded;
    });
    els.scope.addEventListener('change', () => render());
    els.traceToggle.addEventListener('change', () => {
      state.showTraces = els.traceToggle.checked;
      render(false);
    });
    els.ranges.addEventListener('click', event => {
      const button = event.target.closest('[data-price-range]');
      if (!button || !['30', '90', 'all'].includes(button.dataset.priceRange)) return;
      state.period = button.dataset.priceRange;
      render();
    });
    els.plot.addEventListener('keydown', event => {
      if (!state.geometry || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const last = state.geometry.points.length - 1;
      state.selected = event.key === 'Home' ? 0 : event.key === 'End' ? last
        : Math.max(0, Math.min(last, state.selected + (event.key === 'ArrowLeft' ? -1 : 1)));
      paint(true);
    });
    function inspect(event) {
      if (!state.geometry || event.pointerType === 'touch' && event.type === 'pointermove') return;
      const rect = els.plot.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * state.geometry.width;
      const nearest = state.geometry.points.reduce((best, point, index, points) => Math.abs(point.x - x) < Math.abs(points[best].x - x) ? index : best, 0);
      if (nearest === state.selected) return;
      state.selected = nearest;
      paint(event.type === 'click');
    }
    els.plot.addEventListener('pointermove', inspect);
    els.plot.addEventListener('click', inspect);
    runtime.addEventListener('resize', () => render(false));
    if (typeof runtime.ResizeObserver === 'function') {
      const observer = new runtime.ResizeObserver(() => render(false));
      observer.observe(els.plot);
    }

    async function load() {
      const controller = new runtime.AbortController();
      const timeout = runtime.setTimeout(() => controller.abort(), 12000);
      try {
        const get = async path => {
          const response = await runtime.fetch(path, { cache: 'no-cache', signal: controller.signal });
          if (!response.ok) throw new Error('History request failed');
          return response.json();
        };
        const [history, manifest] = await Promise.all([get('database/price_history.json'), get('database/manifest.json')]);
        if (history.exported_at_utc !== manifest.exported_at_utc) throw new Error('History publication is incomplete');
        state.data = normaliseData(history);
        state.customWarning = '';
        const benchmarkApi = runtime.BudfinderBenchmark;
        let customIds = null;
        try { if (benchmarkApi) customIds = benchmarkApi.read(runtime.localStorage); }
        catch (_) { /* The public chart remains available if browser storage is blocked. */ }
        if (customIds) {
          try {
            const individual = benchmarkApi.normaliseHistory(await get('database/price_history_shops.json'), history.exported_at_utc);
            const custom = benchmarkApi.build(individual.shops, customIds, individual.latest);
            const selected = new Set(customIds);
            const extraRows = normaliseData({version:1, currency:'€', unit:'g', date_basis:'recorded_observation', exported_at_utc:history.exported_at_utc,
              series:individual.shops.filter(shop => selected.has(shop.shopId)).map(shop => ({id:`shop-${shop.shopId}`, name:shop.name, kind:'shop', points:shop.points.map(point => ({...point, shop_count:point.average_price == null ? 0 : 1}))}))}).series;
            const extrasById = new Map(extraRows.map(row => [row.id, row]));
            state.data.series = state.data.series.map(row => extrasById.get(row.id) || row);
            const existing = new Set(state.data.series.map(row => row.id));
            state.data.series.push(...extraRows.filter(row => !existing.has(row.id)));
            state.data.series.unshift(custom);
          } catch (_) {
            state.customWarning = 'Your selected benchmark could not be loaded. Showing the public benchmark; your saved selection is unchanged.';
          }
        }
        els.scope.innerHTML = ['benchmark', 'location', 'shop'].map(kind => {
          const rows = state.data.series.filter(row => row.kind === kind);
          const label = { benchmark: 'Fixed benchmark', location: 'All shops by location', shop: 'Individual benchmark shops' }[kind];
          return rows.length ? `<optgroup label="${label}">${rows.map(row => `<option value="${escape(row.id)}">${escape(row.name)}</option>`).join('')}</optgroup>` : '';
        }).join('');
        els.scope.value = state.data.series[0].id;
        els.controls.hidden = false;
        els.details.hidden = false;
        els.benchmark.hidden = !state.data.benchmarkShops.length;
        els.stamp.textContent = `Exported ${dateLabel(state.data.latest)} · €/g`;
        render();
      } catch (_) {
        els.value.textContent = 'History unavailable';
        els.date.textContent = '';
        els.coverage.textContent = '';
        els.plot.hidden = true;
        els.controls.hidden = true;
        els.traceControl.hidden = true;
        els.details.hidden = true;
        els.benchmark.hidden = true;
        els.status.hidden = false;
        els.status.textContent = 'Price history could not be loaded or is still updating. Current prices are available in Menus & prices.';
      } finally {
        controller.abort();
        runtime.clearTimeout(timeout);
        section.setAttribute('aria-busy', 'false');
      }
    }
    runtime.addEventListener('storage', event => {
      if (event.key === runtime.BudfinderBenchmark?.STORAGE_KEY) load();
    });
    runtime.addEventListener('budfinder:saved-data-cleared', () => load());
    return { ready: load() };
  }

  if (typeof module === 'object' && module.exports) module.exports = { normaliseData, selectPoints, buildGeometry, chartSvg, mount };
  else mount(document, window);
})();
