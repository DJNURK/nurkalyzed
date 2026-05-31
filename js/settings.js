/* ===================================================================
   settings.js — schema-driven reactive settings store.
   * SCHEMA below is the single source of truth: every knob in the app.
   * Store: get/set/subscribe + localStorage persistence + export/import.
   * buildSettingsUI() renders the whole Settings drawer from the schema.
   =================================================================== */

import { THEMES, THEME_NAMES } from './themes.js';
import { COLORMAP_NAMES } from './colormaps.js';

const STORAGE_KEY = 'nurkalyzed.settings.v1';

/* ---------------- SCHEMA ----------------
   Each entry: { key, label, type, group, default, ...typeOpts, hint? }
   types: range | number | select | color | toggle | theme | colormap
   `when` (optional): predicate(settings) -> show/hide the control.
----------------------------------------- */
export const SCHEMA = [
  /* ---- Layout & panels ---- */
  { key: 'showSpectrum',    label: 'Spectrum',        type: 'toggle', group: 'Layout', default: true },
  { key: 'showSpectrogram', label: 'Spectrogram',     type: 'toggle', group: 'Layout', default: true },
  { key: 'showWaveform',    label: 'Oscilloscope',    type: 'toggle', group: 'Layout', default: true },
  { key: 'showMeters',      label: 'Loudness meters', type: 'toggle', group: 'Layout', default: true },
  { key: 'showGoniometer',  label: 'Stereo image',    type: 'toggle', group: 'Layout', default: true },
  { key: 'panelGap',        label: 'Panel spacing',   type: 'range', group: 'Layout', default: 14, min: 0, max: 28, step: 1, unit: 'px' },
  { key: 'cornerRadius',    label: 'Corner radius',   type: 'range', group: 'Layout', default: 14, min: 0, max: 28, step: 1, unit: 'px' },

  /* ---- Appearance ---- */
  { key: 'theme',        label: 'Theme preset', type: 'theme',  group: 'Appearance', default: 'midnight' },
  { key: 'bgColor',      label: 'Background',   type: 'color',  group: 'Appearance', default: THEMES.midnight.bgColor },
  { key: 'panelColor',   label: 'Panel',        type: 'color',  group: 'Appearance', default: THEMES.midnight.panelColor },
  { key: 'gridColor',    label: 'Grid lines',   type: 'color',  group: 'Appearance', default: THEMES.midnight.gridColor },
  { key: 'textColor',    label: 'Text',         type: 'color',  group: 'Appearance', default: THEMES.midnight.textColor },
  { key: 'accentColor',  label: 'Accent',       type: 'color',  group: 'Appearance', default: THEMES.midnight.accentColor },
  { key: 'accent2Color', label: 'Accent 2',     type: 'color',  group: 'Appearance', default: THEMES.midnight.accent2Color },
  { key: 'gridOpacity',  label: 'Grid opacity', type: 'range',  group: 'Appearance', default: 0.5, min: 0, max: 1, step: 0.05 },
  { key: 'glow',         label: 'Neon glow',    type: 'toggle', group: 'Appearance', default: true },
  { key: 'glowAmount',   label: 'Glow amount',  type: 'range',  group: 'Appearance', default: 12, min: 0, max: 30, step: 1, unit: 'px', when: (s) => s.glow },

  /* ---- Spectrum ---- */
  { key: 'fftSize',       label: 'FFT size',         type: 'select', group: 'Spectrum', default: '8192',
    options: ['512', '1024', '2048', '4096', '8192', '16384', '32768'] },
  { key: 'smoothing',     label: 'Smoothing',        type: 'range', group: 'Spectrum', default: 0.7, min: 0, max: 0.97, step: 0.01 },
  { key: 'specStyle',     label: 'Style',            type: 'select', group: 'Spectrum', default: 'area',
    options: [['area', 'Filled curve'], ['line', 'Line'], ['bars', 'Bars']] },
  { key: 'specColorMode', label: 'Coloring',         type: 'select', group: 'Spectrum', default: 'gradFreq',
    options: [['gradFreq', 'Gradient by frequency'], ['gradAmp', 'Gradient by level'], ['accent', 'Solid accent']] },
  { key: 'specColorA',    label: 'Color A',          type: 'color', group: 'Spectrum', default: THEMES.midnight.specColorA },
  { key: 'specColorB',    label: 'Color B',          type: 'color', group: 'Spectrum', default: THEMES.midnight.specColorB },
  { key: 'specLineWidth', label: 'Line width',       type: 'range', group: 'Spectrum', default: 2, min: 0.5, max: 5, step: 0.5, unit: 'px' },
  { key: 'specFillOpacity', label: 'Fill opacity',   type: 'range', group: 'Spectrum', default: 0.28, min: 0, max: 1, step: 0.02, when: (s) => s.specStyle !== 'line' },
  { key: 'freqScale',     label: 'Frequency scale',  type: 'select', group: 'Spectrum', default: 'log',
    options: [['log', 'Logarithmic'], ['linear', 'Linear']] },
  { key: 'minFreq',       label: 'Min frequency',    type: 'range', group: 'Spectrum', default: 20, min: 10, max: 500, step: 5, unit: 'Hz' },
  { key: 'maxFreq',       label: 'Max frequency',    type: 'range', group: 'Spectrum', default: 20000, min: 5000, max: 24000, step: 500, unit: 'Hz' },
  { key: 'minDb',         label: 'Floor',            type: 'range', group: 'Spectrum', default: -100, min: -120, max: -40, step: 1, unit: 'dB' },
  { key: 'maxDb',         label: 'Ceiling',          type: 'range', group: 'Spectrum', default: -10, min: -40, max: 12, step: 1, unit: 'dB' },
  { key: 'slope',         label: 'Spectral tilt',    type: 'select', group: 'Spectrum', default: '4.5',
    options: [['0', 'Off (0 dB/oct)'], ['3', '+3 dB/oct'], ['4.5', '+4.5 dB/oct (pink)'], ['6', '+6 dB/oct']] },
  { key: 'peakHold',      label: 'Peak hold',        type: 'toggle', group: 'Spectrum', default: true },
  { key: 'peakDecay',     label: 'Peak fall',        type: 'range', group: 'Spectrum', default: 0.6, min: 0.02, max: 3, step: 0.02, unit: 'dB/f', when: (s) => s.peakHold },
  { key: 'specGrid',      label: 'Show grid',        type: 'toggle', group: 'Spectrum', default: true },
  { key: 'specLabels',    label: 'Show labels',      type: 'toggle', group: 'Spectrum', default: true },

  /* ---- Spectrogram ---- */
  { key: 'sgColormap', label: 'Color map',  type: 'colormap', group: 'Spectrogram', default: 'magma' },
  { key: 'sgSpeed',    label: 'Scroll speed', type: 'range', group: 'Spectrogram', default: 2, min: 1, max: 6, step: 1, unit: 'px/f' },
  { key: 'sgMinDb',    label: 'Floor',      type: 'range', group: 'Spectrogram', default: -90, min: -120, max: -40, step: 1, unit: 'dB' },
  { key: 'sgMaxDb',    label: 'Ceiling',    type: 'range', group: 'Spectrogram', default: -20, min: -40, max: 6, step: 1, unit: 'dB' },
  { key: 'sgLabels',   label: 'Show labels', type: 'toggle', group: 'Spectrogram', default: true },

  /* ---- Oscilloscope ---- */
  { key: 'waveMode',      label: 'Mode',        type: 'select', group: 'Oscilloscope', default: 'mono',
    options: [['mono', 'Mono (sum)'], ['stereo', 'Stereo L/R'], ['filled', 'Filled mono']] },
  { key: 'waveColor',     label: 'Color',       type: 'color', group: 'Oscilloscope', default: THEMES.midnight.accentColor },
  { key: 'waveColorR',    label: 'Right color', type: 'color', group: 'Oscilloscope', default: THEMES.midnight.accent2Color, when: (s) => s.waveMode === 'stereo' },
  { key: 'waveLineWidth', label: 'Line width',  type: 'range', group: 'Oscilloscope', default: 2, min: 0.5, max: 5, step: 0.5, unit: 'px' },
  { key: 'waveGain',      label: 'Amplitude',   type: 'range', group: 'Oscilloscope', default: 1, min: 0.25, max: 6, step: 0.25, unit: '×' },
  { key: 'waveWindow',    label: 'Time window', type: 'range', group: 'Oscilloscope', default: 20, min: 2, max: 80, step: 1, unit: 'ms' },

  /* ---- Loudness meters ---- */
  { key: 'meterScaleMin', label: 'Scale bottom', type: 'range', group: 'Loudness', default: -60, min: -90, max: -30, step: 1, unit: 'dB' },
  { key: 'meterShowPeak', label: 'Peak / RMS bars', type: 'toggle', group: 'Loudness', default: true },
  { key: 'meterShowLufs', label: 'LUFS readouts', type: 'toggle', group: 'Loudness', default: true },
  { key: 'meterTarget',   label: 'LUFS target',  type: 'range', group: 'Loudness', default: -14, min: -31, max: -6, step: 1, unit: 'LUFS' },
  { key: 'meterHoldTime', label: 'Peak hold',    type: 'range', group: 'Loudness', default: 1.5, min: 0, max: 5, step: 0.5, unit: 's' },

  /* ---- Stereo image ---- */
  { key: 'gonioColor',    label: 'Trace color',  type: 'color', group: 'Stereo image', default: THEMES.midnight.accentColor },
  { key: 'gonioMode',     label: 'Mode',         type: 'select', group: 'Stereo image', default: 'dots',
    options: [['dots', 'Dots'], ['lines', 'Lissajous lines']] },
  { key: 'gonioPersist',  label: 'Persistence',  type: 'range', group: 'Stereo image', default: 0.82, min: 0, max: 0.96, step: 0.02 },
  { key: 'gonioGain',     label: 'Zoom',         type: 'range', group: 'Stereo image', default: 1.4, min: 0.5, max: 4, step: 0.1, unit: '×' },
  { key: 'gonioCorr',     label: 'Correlation meter', type: 'toggle', group: 'Stereo image', default: true },
];

const GROUP_ORDER = ['Layout', 'Appearance', 'Spectrum', 'Spectrogram', 'Oscilloscope', 'Loudness', 'Stereo image'];

/* keys that, when changed, also reposition the theme back to "custom" */
const APPEARANCE_KEYS = new Set([
  'bgColor', 'panelColor', 'gridColor', 'textColor', 'accentColor', 'accent2Color', 'specColorA', 'specColorB', 'sgColormap',
]);

/* ---------------- STORE ---------------- */
export function createStore() {
  const defaults = {};
  for (const item of SCHEMA) defaults[item.key] = item.default;

  let state = { ...defaults };
  // load persisted
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state = { ...state, ...saved };
  } catch { /* ignore */ }

  const subs = new Set();
  let saveTimer = null;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    }, 250);
  };

  const store = {
    get: (k) => state[k],
    all: () => state,
    /** Subscribe to changes. cb(changedKeys[], state). Returns unsub. */
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    /** Set one or many keys; notifies subscribers with the changed key list. */
    set(patch, opts = {}) {
      const changed = [];
      for (const [k, v] of Object.entries(patch)) {
        if (state[k] !== v) { state[k] = v; changed.push(k); }
      }
      if (!changed.length) return;
      // editing an appearance color drops the "theme" label to custom
      if (!opts.fromTheme && changed.some((k) => APPEARANCE_KEYS.has(k)) && state.theme !== 'custom') {
        state.theme = 'custom';
        changed.push('theme');
      }
      persist();
      for (const cb of subs) cb(changed, state);
    },
    /** Apply a named theme's colors. */
    applyTheme(name) {
      const t = THEMES[name];
      if (!t) return;
      this.set({
        theme: name,
        bgColor: t.bgColor, panelColor: t.panelColor, gridColor: t.gridColor,
        textColor: t.textColor, accentColor: t.accentColor, accent2Color: t.accent2Color,
        specColorA: t.specColorA, specColorB: t.specColorB, sgColormap: t.sgColormap,
      }, { fromTheme: true });
    },
    reset() {
      state = { ...defaults };
      persist();
      for (const cb of subs) cb(Object.keys(defaults), state);
    },
    export: () => JSON.stringify(state, null, 2),
    import(json) {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      const clean = {};
      for (const item of SCHEMA) if (item.key in obj) clean[item.key] = obj[item.key];
      this.set(clean);
    },
  };
  return store;
}

/* ---------------- UI BUILDER ---------------- */
export function buildSettingsUI(container, store) {
  container.innerHTML = '';
  const controls = []; // for search + `when` reactivity

  const groups = {};
  for (const name of GROUP_ORDER) groups[name] = [];
  for (const item of SCHEMA) (groups[item.group] ||= []).push(item);

  for (const name of GROUP_ORDER) {
    const items = groups[name];
    if (!items || !items.length) continue;
    const details = document.createElement('details');
    details.className = 'setting-group';
    if (name === 'Layout' || name === 'Spectrum' || name === 'Appearance') details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = name;
    details.appendChild(summary);
    const wrap = document.createElement('div');
    wrap.className = 'group-items';
    details.appendChild(wrap);

    for (const item of items) {
      const row = makeControl(item, store);
      controls.push({ item, el: row.el });
      wrap.appendChild(row.el);
    }
    container.appendChild(details);
  }

  // Re-evaluate `when` predicates whenever anything changes.
  const refreshVisibility = () => {
    const s = store.all();
    for (const { item, el } of controls) {
      if (item.when) el.classList.toggle('hide', !item.when(s));
    }
  };
  store.subscribe(refreshVisibility);
  refreshVisibility();

  return {
    /** Filter visible controls by a search string. */
    filter(q) {
      const needle = q.trim().toLowerCase();
      for (const { item, el } of controls) {
        const hit = !needle || item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle);
        el.style.display = hit ? '' : 'none';
      }
      // open all groups while searching
      container.querySelectorAll('.setting-group').forEach((d) => { if (needle) d.open = true; });
    },
  };
}

function makeControl(item, store) {
  const el = document.createElement('div');
  el.className = 'setting';

  const label = document.createElement('label');
  label.textContent = item.label;
  el.appendChild(label);

  const valTag = document.createElement('span');
  valTag.className = 'val';

  const setVal = (txt) => { valTag.textContent = txt; };

  switch (item.type) {
    case 'range': {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = item.min; input.max = item.max; input.step = item.step;
      input.value = store.get(item.key);
      input.className = 'control';
      const show = (v) => setVal(`${(+v).toFixed(item.step < 1 ? 2 : 0)}${item.unit ? ' ' + item.unit : ''}`);
      show(input.value);
      el.appendChild(valTag);
      input.addEventListener('input', () => { show(input.value); store.set({ [item.key]: +input.value }); });
      store.subscribe((keys) => { if (keys.includes(item.key)) { input.value = store.get(item.key); show(input.value); } });
      el.appendChild(input);
      break;
    }
    case 'number': {
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'control'; input.value = store.get(item.key);
      input.addEventListener('change', () => store.set({ [item.key]: +input.value || 0 }));
      el.appendChild(input);
      break;
    }
    case 'select':
    case 'theme':
    case 'colormap': {
      const sel = document.createElement('select');
      sel.className = 'control';
      let opts = item.options;
      if (item.type === 'theme') opts = THEME_NAMES.map((n) => [n, THEMES[n].label]).concat([['custom', 'Custom']]);
      if (item.type === 'colormap') opts = COLORMAP_NAMES.map((n) => [n, n[0].toUpperCase() + n.slice(1)]);
      for (const o of opts) {
        const opt = document.createElement('option');
        const [val, text] = Array.isArray(o) ? o : [o, o];
        opt.value = val; opt.textContent = text;
        sel.appendChild(opt);
      }
      sel.value = store.get(item.key);
      sel.addEventListener('change', () => {
        if (item.type === 'theme') store.applyTheme(sel.value);
        else store.set({ [item.key]: sel.value });
      });
      store.subscribe((keys) => { if (keys.includes(item.key)) sel.value = store.get(item.key); });
      el.appendChild(sel);
      break;
    }
    case 'color': {
      const input = document.createElement('input');
      input.type = 'color'; input.className = 'control'; input.value = store.get(item.key);
      input.addEventListener('input', () => store.set({ [item.key]: input.value }));
      store.subscribe((keys) => { if (keys.includes(item.key)) input.value = store.get(item.key); });
      el.appendChild(input);
      break;
    }
    case 'toggle': {
      const sw = document.createElement('label');
      sw.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.checked = !!store.get(item.key);
      const track = document.createElement('span'); track.className = 'track';
      sw.appendChild(input); sw.appendChild(track);
      input.addEventListener('change', () => store.set({ [item.key]: input.checked }));
      store.subscribe((keys) => { if (keys.includes(item.key)) input.checked = !!store.get(item.key); });
      // toggles sit on the right of the label row
      el.appendChild(sw);
      el.style.gridTemplateColumns = '1fr auto';
      break;
    }
  }
  return { el };
}
