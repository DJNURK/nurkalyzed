/* ===================================================================
   helpers.js — small math / DSP / drawing utilities shared everywhere
   =================================================================== */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invlerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/** Convert a linear amplitude (0..1) to decibels (dBFS). */
export const ampToDb = (a) => 20 * Math.log10(Math.max(a, 1e-7));
export const dbToAmp = (db) => Math.pow(10, db / 20);

/* ---------- frequency axis mapping ---------- */

/** Map a frequency to a normalized x position (0..1) on a log or linear axis. */
export function freqToX(freq, fMin, fMax, log) {
  if (log) {
    return Math.log2(freq / fMin) / Math.log2(fMax / fMin);
  }
  return (freq - fMin) / (fMax - fMin);
}

/** Inverse of freqToX — normalized x (0..1) back to a frequency. */
export function xToFreq(x, fMin, fMax, log) {
  if (log) {
    return fMin * Math.pow(fMax / fMin, x);
  }
  return fMin + x * (fMax - fMin);
}

/* ---------- musical notes ---------- */
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Nearest musical note name + octave + cents offset for a frequency. */
export function freqToNote(freq) {
  if (!freq || freq <= 0) return { name: '–', cents: 0 };
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;
  return { name: `${name}${octave}`, cents };
}

/** Format a frequency for display (e.g. "440 Hz", "2.4 kHz"). */
export function fmtFreq(f) {
  if (f >= 1000) return `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz`;
  return `${Math.round(f)} Hz`;
}

/* ---------- color ---------- */

/** Parse "#rrggbb" (or "#rgb") to [r,g,b] 0..255. */
export function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba([r, g, b], a = 1) {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

/** Linear interpolation between two [r,g,b] colors. */
export function mixRgb(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/* ---------- canvas grid helpers ---------- */

/** The "nice" frequency gridlines used by spectrum / spectrogram. */
export const FREQ_GRID = [
  20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900,
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000,
];
/** Subset of FREQ_GRID that get text labels. */
export const FREQ_LABELS = new Set([20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);

export function fmtGridFreq(f) {
  if (f >= 1000) return `${f / 1000}k`;
  return `${f}`;
}

/** Smoothly approach a target value (frame-rate independent-ish easing). */
export function approach(current, target, rate) {
  return current + (target - current) * rate;
}
