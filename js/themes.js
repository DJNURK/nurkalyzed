/* ===================================================================
   themes.js — named appearance presets. Selecting a theme writes its
   colors into the settings store; from there both CSS (via custom
   properties) and the canvas visualizers read live.
   =================================================================== */

export const THEMES = {
  midnight: {
    label: 'Midnight',
    bgColor: '#0a0c12', panelColor: '#121521', gridColor: '#232a40',
    textColor: '#e8ecf6', accentColor: '#36e0c0', accent2Color: '#6f7bff',
    specColorA: '#36e0c0', specColorB: '#6f7bff', sgColormap: 'magma',
  },
  obsidian: {
    label: 'Obsidian',
    bgColor: '#000000', panelColor: '#0b0b0d', gridColor: '#1c1c22',
    textColor: '#f2f2f5', accentColor: '#ffffff', accent2Color: '#9aa0b5',
    specColorA: '#ffffff', specColorB: '#7f8aa3', sgColormap: 'grayscale',
  },
  sunset: {
    label: 'Sunset',
    bgColor: '#160e16', panelColor: '#1f1320', gridColor: '#3a2238',
    textColor: '#ffe9f2', accentColor: '#ff6f91', accent2Color: '#ffb15c',
    specColorA: '#ffd166', specColorB: '#ef476f', sgColormap: 'inferno',
  },
  forest: {
    label: 'Forest',
    bgColor: '#08120c', panelColor: '#0e1a12', gridColor: '#1d3326',
    textColor: '#e6f6ea', accentColor: '#4ade80', accent2Color: '#a3e635',
    specColorA: '#a3e635', specColorB: '#22c55e', sgColormap: 'viridis',
  },
  ice: {
    label: 'Arctic',
    bgColor: '#070d16', panelColor: '#0d1626', gridColor: '#1c2e47',
    textColor: '#e6f1ff', accentColor: '#56c7ff', accent2Color: '#8b9bff',
    specColorA: '#7fe3ff', specColorB: '#5a8bff', sgColormap: 'ice',
  },
  vapor: {
    label: 'Vaporwave',
    bgColor: '#120821', panelColor: '#1b0f33', gridColor: '#32205c',
    textColor: '#f3e9ff', accentColor: '#ff77e9', accent2Color: '#7af0ff',
    specColorA: '#ff77e9', specColorB: '#7af0ff', sgColormap: 'plasma',
  },
  retro: {
    label: 'Retro Console',
    bgColor: '#0a0f08', panelColor: '#0f160c', gridColor: '#1f2d18',
    textColor: '#d8ffce', accentColor: '#7CFC00', accent2Color: '#caff4d',
    specColorA: '#7CFC00', specColorB: '#caff4d', sgColormap: 'classic',
  },
  paperLight: {
    label: 'Daylight',
    bgColor: '#eef1f6', panelColor: '#ffffff', gridColor: '#d3d9e6',
    textColor: '#1c2230', accentColor: '#1f6feb', accent2Color: '#8957e5',
    specColorA: '#1f6feb', specColorB: '#8957e5', sgColormap: 'viridis',
  },
};

export const THEME_NAMES = Object.keys(THEMES);

/** Push the relevant settings values onto the documentElement as CSS vars. */
export function applyCssVars(settings) {
  const root = document.documentElement.style;
  root.setProperty('--bg', settings.bgColor);
  root.setProperty('--panel', settings.panelColor);
  root.setProperty('--panel-2', mixHex(settings.panelColor, settings.textColor, 0.06));
  root.setProperty('--grid', settings.gridColor);
  root.setProperty('--text', settings.textColor);
  root.setProperty('--muted', mixHex(settings.textColor, settings.panelColor, 0.45));
  root.setProperty('--accent', settings.accentColor);
  root.setProperty('--accent-2', settings.accent2Color);
  root.setProperty('--radius', settings.cornerRadius + 'px');
  root.setProperty('--gap', settings.panelGap + 'px');
}

/** Mix two hex colors (a*(1-t) + b*t) and return a hex string. */
function mixHex(a, b, t) {
  const pa = hx(a), pb = hx(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function hx(hex) {
  let h = (hex || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
