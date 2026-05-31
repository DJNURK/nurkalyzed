/* ===================================================================
   spectrogram.js — scrolling waterfall.
   History lives in an offscreen device-resolution buffer that we scroll
   left each frame and stamp a fresh column onto; frequency runs bottom→top
   on the same log/linear axis as the spectrum.
   =================================================================== */

import { Visualizer } from './base.js';
import {
  hexToRgb, rgba, clamp, freqToX, xToFreq,
  FREQ_GRID, FREQ_LABELS, fmtGridFreq,
} from '../helpers.js';
import { getColormapLUT } from '../colormaps.js';

export class Spectrogram extends Visualizer {
  constructor(canvas, store) {
    super(canvas, store);
    this._makeBuffer();
  }

  onResize() { this._makeBuffer(); }

  _makeBuffer() {
    this.buf = document.createElement('canvas');
    this.buf.width = this.canvas.width;
    this.buf.height = this.canvas.height;
    this.bctx = this.buf.getContext('2d');
    this.bctx.clearRect(0, 0, this.buf.width, this.buf.height); // transparent until filled
    this._col = null;
  }

  draw(frame) {
    const s = this.store.all();
    const { ctx, w, h } = this;
    const BW = this.buf.width, BH = this.buf.height;
    const speed = Math.max(1, Math.round(s.sgSpeed * this.dpr));

    if (frame.active && frame.binCount > 0) {
      // scroll history left
      this.bctx.globalCompositeOperation = 'copy';
      this.bctx.drawImage(this.buf, -speed, 0);
      this.bctx.globalCompositeOperation = 'source-over';

      // build the new column
      if (!this._col || this._col.width !== speed || this._col.height !== BH) {
        this._col = this.bctx.createImageData(speed, BH);
      }
      const img = this._col;
      const px = img.data;
      const lut = getColormapLUT(s.sgColormap);
      const fMin = s.minFreq;
      const fMax = Math.min(s.maxFreq, frame.sampleRate / 2);
      const log = s.freqScale === 'log';
      const binHz = frame.sampleRate / (frame.binCount * 2);
      const data = frame.freq;
      const range = Math.max(1, s.sgMaxDb - s.sgMinDb);

      for (let y = 0; y < BH; y++) {
        // device row → frequency (top = high freq)
        const nTop = 1 - y / BH;
        const nBot = 1 - (y + 1) / BH;
        const fHi = xToFreq(nTop, fMin, fMax, log);
        const fLo = xToFreq(nBot, fMin, fMax, log);
        let bLo = Math.max(1, Math.floor(fLo / binHz));
        let bHi = Math.min(data.length - 1, Math.ceil(fHi / binHz));
        if (bHi < bLo) bHi = bLo;
        let db = -Infinity;
        for (let b = bLo; b <= bHi; b++) if (data[b] > db) db = data[b];
        let t = clamp((db - s.sgMinDb) / range, 0, 1);
        const li = (t * 255) | 0;
        const r = lut[li * 3], g = lut[li * 3 + 1], bl = lut[li * 3 + 2];
        for (let x = 0; x < speed; x++) {
          const o = (y * speed + x) * 4;
          px[o] = r; px[o + 1] = g; px[o + 2] = bl; px[o + 3] = 255;
        }
      }
      this.bctx.putImageData(img, BW - speed, 0);
    }

    // blit buffer (device px) then overlay labels (CSS px)
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.buf, 0, 0);
    ctx.restore();

    if (s.sgLabels) this._labels(s, frame);
  }

  _labels(s, frame) {
    const { ctx, w, h } = this;
    const fMin = s.minFreq, fMax = Math.min(s.maxFreq, frame.sampleRate / 2);
    const log = s.freqScale === 'log';
    const textCol = hexToRgb(s.textColor);
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const f of FREQ_GRID) {
      if (f < fMin || f > fMax || !FREQ_LABELS.has(f)) continue;
      const yn = 1 - freqToX(f, fMin, fMax, log); // high freq at top
      const y = clamp(yn * h, 8, h - 8);
      ctx.fillStyle = rgba([0, 0, 0], 0.55);
      ctx.fillRect(0, y - 7, 30, 14);
      ctx.fillStyle = rgba(textCol, 0.8);
      ctx.fillText(fmtGridFreq(f), 4, y);
    }
  }
}
