/* ===================================================================
   spectrum.js — SPAN-style FFT spectrum analyzer.
   Log/linear frequency axis, dB grid, spectral tilt, peak-hold, three
   draw styles, frequency-or-level gradients, and a hover readout
   (frequency + nearest note + level).
   =================================================================== */

import { Visualizer } from './base.js';
import {
  hexToRgb, rgba, clamp, freqToX, xToFreq,
  FREQ_GRID, FREQ_LABELS, fmtGridFreq, freqToNote, fmtFreq,
} from '../helpers.js';

export class Spectrum extends Visualizer {
  constructor(canvas, store, opts = {}) {
    super(canvas, store);
    this.readoutEl = opts.readoutEl || null;
    this.cols = new Float32Array(this.w);
    this.peaks = new Float32Array(this.w).fill(-Infinity);
    this.mouseX = null;

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = clamp(e.clientX - r.left, 0, this.w - 1);
    });
    canvas.addEventListener('pointerleave', () => {
      this.mouseX = null;
      if (this.readoutEl) this.readoutEl.textContent = '';
    });
  }

  onResize() {
    this.cols = new Float32Array(this.w);
    this.peaks = new Float32Array(this.w).fill(-Infinity);
  }

  draw(frame) {
    const s = this.store.all();
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    const fMin = s.minFreq, fMax = Math.min(s.maxFreq, frame.sampleRate / 2);
    const log = s.freqScale === 'log';
    const minDb = s.minDb, maxDb = Math.max(s.maxDb, s.minDb + 6);
    const slope = parseFloat(s.slope);

    if (s.specGrid) this._grid(s, fMin, fMax, log, minDb, maxDb, frame);

    // ----- build one value per pixel column -----
    const cols = this.cols;
    cols.fill(-Infinity);
    if (frame.active && frame.binCount > 0) {
      const binHz = frame.sampleRate / (frame.binCount * 2);
      const data = frame.freq;
      const iStart = Math.max(1, Math.floor(fMin / binHz));
      const iEnd = Math.min(data.length - 1, Math.ceil(fMax / binHz));
      for (let i = iStart; i <= iEnd; i++) {
        const f = i * binHz;
        let db = data[i] + slope * Math.log2(f / 1000); // spectral tilt
        const xn = freqToX(f, fMin, fMax, log);
        const x = (xn * w) | 0;
        if (x < 0 || x >= w) continue;
        if (db > cols[x]) cols[x] = db;
      }
      fillGaps(cols);
    }

    // ----- peak hold -----
    if (s.peakHold) {
      const fall = s.peakDecay * Math.min(3, (frame.dt || 0.016) * 60);
      for (let x = 0; x < w; x++) {
        const v = cols[x];
        this.peaks[x] = Math.max(isFinite(v) ? v : -Infinity, this.peaks[x] - fall);
      }
    }

    const yOf = (db) => h - clamp((db - minDb) / (maxDb - minDb), 0, 1) * h;

    // ----- stroke / fill style -----
    const cA = hexToRgb(s.specColorA);
    const cB = hexToRgb(s.specColorB);
    let stroke;
    if (s.specColorMode === 'accent') {
      stroke = s.accentColor;
    } else if (s.specColorMode === 'gradFreq') {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, rgba(cA)); g.addColorStop(1, rgba(cB));
      stroke = g;
    } else { // gradAmp — vertical
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, rgba(cA)); g.addColorStop(1, rgba(cB));
      stroke = g;
    }

    ctx.save();
    if (s.glow && frame.active) { ctx.shadowBlur = s.glowAmount; ctx.shadowColor = s.specColorMode === 'gradFreq' ? rgba(cB, 0.8) : (typeof stroke === 'string' ? stroke : rgba(cB, 0.8)); }

    if (s.specStyle === 'bars') {
      this._bars(cols, yOf, h, stroke, s, cA, cB);
    } else {
      this._curve(cols, yOf, h, stroke, s, cA, cB);
    }
    ctx.restore();

    // ----- peak line -----
    if (s.peakHold && frame.active) {
      ctx.beginPath();
      let started = false;
      for (let x = 0; x < w; x++) {
        const v = this.peaks[x];
        if (!isFinite(v)) { started = false; continue; }
        const y = yOf(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(hexToRgb(s.textColor), 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (this.mouseX != null) this._hover(s, fMin, fMax, log, minDb, maxDb, yOf, frame);
  }

  _curve(cols, yOf, h, stroke, s, cA, cB) {
    const { ctx, w } = this;
    // build path
    ctx.beginPath();
    let started = false;
    for (let x = 0; x < w; x++) {
      const v = cols[x];
      const y = isFinite(v) ? yOf(v) : h;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }

    if (s.specStyle !== 'line') {
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      let fill;
      if (s.specColorMode === 'accent') {
        fill = rgba(hexToRgb(s.accentColor), s.specFillOpacity);
      } else {
        const g = ctx.createLinearGradient(0, 0, s.specColorMode === 'gradFreq' ? w : 0, s.specColorMode === 'gradFreq' ? 0 : h);
        g.addColorStop(0, rgba(cA, s.specFillOpacity));
        g.addColorStop(1, rgba(cB, s.specFillOpacity * 0.35));
        fill = g;
      }
      ctx.fillStyle = fill;
      ctx.fill();
      // re-stroke the top edge crisply
      ctx.beginPath();
      started = false;
      for (let x = 0; x < w; x++) {
        const v = cols[x];
        const y = isFinite(v) ? yOf(v) : h;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = s.specLineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  _bars(cols, yOf, h, stroke, s) {
    const { ctx, w } = this;
    const bw = Math.max(2, Math.round(s.specLineWidth * 1.5) + 2);
    ctx.fillStyle = stroke;
    for (let x = 0; x < w; x += bw + 1) {
      // max over the bar's pixel span
      let v = -Infinity;
      for (let k = 0; k < bw && x + k < w; k++) if (cols[x + k] > v) v = cols[x + k];
      if (!isFinite(v)) continue;
      const y = yOf(v);
      ctx.fillRect(x, y, bw, h - y);
    }
  }

  _grid(s, fMin, fMax, log, minDb, maxDb, frame) {
    const { ctx, w, h } = this;
    const gridCol = hexToRgb(s.gridColor);
    const textCol = hexToRgb(s.textColor);
    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'bottom';

    // dB horizontal lines
    const step = (maxDb - minDb) > 60 ? 20 : 10;
    const first = Math.ceil(minDb / step) * step;
    for (let db = first; db <= maxDb; db += step) {
      const y = Math.round(h - ((db - minDb) / (maxDb - minDb)) * h) + 0.5;
      ctx.strokeStyle = rgba(gridCol, s.gridOpacity * (db === 0 ? 1 : 0.7));
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      if (s.specLabels) {
        ctx.fillStyle = rgba(textCol, 0.5);
        ctx.textAlign = 'left';
        ctx.fillText(`${db}`, 4, y - 1);
      }
    }

    // frequency vertical lines
    ctx.textAlign = 'center';
    for (const f of FREQ_GRID) {
      if (f < fMin || f > fMax) continue;
      const x = Math.round(freqToX(f, fMin, fMax, log) * w) + 0.5;
      const major = FREQ_LABELS.has(f);
      ctx.strokeStyle = rgba(gridCol, s.gridOpacity * (major ? 0.85 : 0.4));
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      if (s.specLabels && major) {
        ctx.fillStyle = rgba(textCol, 0.55);
        ctx.fillText(fmtGridFreq(f), x, h - 2);
      }
    }
  }

  _hover(s, fMin, fMax, log, minDb, maxDb, yOf, frame) {
    const { ctx, w, h } = this;
    const x = this.mouseX;
    const freq = xToFreq(x / w, fMin, fMax, log);
    const db = isFinite(this.cols[x | 0]) ? this.cols[x | 0] : null;
    const note = freqToNote(freq);
    const accent = hexToRgb(s.accentColor);

    ctx.save();
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    ctx.setLineDash([]);
    if (db != null) {
      const y = yOf(db);
      ctx.fillStyle = rgba(accent, 1);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (this.readoutEl) {
      const lvl = db != null ? `${db.toFixed(1)} dB` : '–';
      const cents = note.cents ? ` ${note.cents > 0 ? '+' : ''}${note.cents}¢` : '';
      this.readoutEl.textContent = `${fmtFreq(freq)} · ${note.name}${cents} · ${lvl}`;
    }
  }
}

/** Linearly interpolate across columns that received no FFT bin. */
function fillGaps(cols) {
  const n = cols.length;
  let i = 0;
  // leading gap → first known
  while (i < n && !isFinite(cols[i])) i++;
  if (i === n) return;
  for (let k = 0; k < i; k++) cols[k] = cols[i];
  let last = i;
  for (let x = i + 1; x < n; x++) {
    if (isFinite(cols[x])) {
      if (x - last > 1) {
        const a = cols[last], b = cols[x];
        for (let j = last + 1; j < x; j++) cols[j] = a + (b - a) * ((j - last) / (x - last));
      }
      last = x;
    }
  }
  for (let k = last + 1; k < n; k++) cols[k] = cols[last];
}
