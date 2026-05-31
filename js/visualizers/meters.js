/* ===================================================================
   meters.js — peak / RMS bargraphs (with hold + ballistics) plus
   LUFS momentary / short-term / integrated and Loudness Range readouts.
   =================================================================== */

import { Visualizer } from './base.js';
import { hexToRgb, rgba, clamp } from '../helpers.js';

export class Meters extends Visualizer {
  constructor(canvas, store) {
    super(canvas, store);
    this.d = { pL: -100, pR: -100, rL: -100, rR: -100, hL: -100, hR: -100, holdT: 0, holdTR: 0 };
  }

  draw(frame) {
    const s = this.store.all();
    const { ctx, w, h } = this;
    const m = frame.meters;
    ctx.clearRect(0, 0, w, h);

    const top = 3;                 // dBFS at top of scale (shows "over")
    const bottom = s.meterScaleMin;
    const dt = clamp(frame.dt || 0.016, 0.001, 0.1);
    const at = 1 - Math.exp(-dt / 0.01);   // peak attack
    const rel = 18 * dt;                   // peak release (dB/s)
    const rmsK = 1 - Math.exp(-dt / 0.25); // rms smoothing

    const upd = (cur, target, holdKey) => {
      let v = cur;
      if (!isFinite(target)) target = bottom;
      if (target > v) v += (target - v) * Math.min(1, at * 6);
      else v -= rel;
      return Math.max(bottom, v);
    };

    if (frame.active) {
      this.d.pL = upd(this.d.pL, m.peakL);
      this.d.pR = upd(this.d.pR, m.peakR);
      this.d.rL += (clamp(isFinite(m.rmsL) ? m.rmsL : bottom, bottom, top) - this.d.rL) * rmsK;
      this.d.rR += (clamp(isFinite(m.rmsR) ? m.rmsR : bottom, bottom, top) - this.d.rR) * rmsK;
      // peak hold
      const holdMax = s.meterHoldTime;
      for (const [pk, hk, tk] of [['pL', 'hL', 'holdT'], ['pR', 'hR', 'holdTR']]) {
        if (this.d[pk] >= this.d[hk]) { this.d[hk] = this.d[pk]; this.d[tk] = 0; }
        else { this.d[tk] += dt; if (this.d[tk] > holdMax) this.d[hk] -= rel * 0.6; }
      }
    }

    const yOf = (db) => h - clamp((db - bottom) / (top - bottom), 0, 1) * h;
    const pad = 8;
    const showBars = s.meterShowPeak;
    const showLufs = s.meterShowLufs;
    const barsW = showBars ? Math.min(w * 0.5, 120) : 0;

    if (showBars) this._bars(s, barsW, h, yOf, bottom, top, pad);
    if (showLufs) this._lufs(s, m, barsW + (showBars ? 10 : 0), w, h);
  }

  _bars(s, areaW, h, yOf, bottom, top, pad) {
    const { ctx } = this;
    const labels = ['L', 'R'];
    const vals = [{ p: this.d.pL, r: this.d.rL, hold: this.d.hL }, { p: this.d.pR, r: this.d.rR, hold: this.d.hR }];
    const bw = (areaW - pad * 3) / 2;

    // dB scale ticks
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = rgba(hexToRgb(s.textColor), 0.4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const step = (top - bottom) > 48 ? 12 : 6;
    for (let db = Math.ceil(bottom / step) * step; db <= top; db += step) {
      const y = yOf(db);
      ctx.fillText(db <= -100 ? '' : `${db}`, areaW - 1, clamp(y, 6, h - 6));
    }

    for (let i = 0; i < 2; i++) {
      const x = pad + i * (bw + pad);
      const v = vals[i];
      // track
      ctx.fillStyle = rgba(hexToRgb(s.gridColor), 0.5);
      ctx.fillRect(x, 0, bw, h);
      // rms fill (gradient green→amber→red)
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#2ecc71');
      grad.addColorStop(0.62, '#7ed957');
      grad.addColorStop(0.82, '#f5c451');
      grad.addColorStop(1, '#ff5d6c');
      const yR = yOf(v.r);
      ctx.fillStyle = grad;
      ctx.fillRect(x, yR, bw, h - yR);
      // peak fill (lighter, on top, thinner)
      const yP = yOf(v.p);
      ctx.fillStyle = rgba([255, 255, 255], 0.18);
      ctx.fillRect(x, yP, bw, yR - yP);
      // peak-hold marker
      const yH = yOf(v.hold);
      ctx.fillStyle = v.hold > -1 ? '#ff5d6c' : rgba(hexToRgb(s.textColor), 0.85);
      ctx.fillRect(x, yH - 1, bw, 2);
      // channel label + numeric
      ctx.fillStyle = rgba(hexToRgb(s.textColor), 0.7);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(labels[i], x + bw / 2, h - 2);
      ctx.textBaseline = 'top';
      ctx.fillStyle = rgba(hexToRgb(s.textColor), 0.5);
      ctx.fillText(v.p <= bottom ? '–∞' : v.p.toFixed(0), x + bw / 2, 2);
    }
  }

  _lufs(s, m, x0, w, h) {
    const { ctx } = this;
    const accent = hexToRgb(s.accentColor);
    const text = hexToRgb(s.textColor);
    const colW = w - x0 - 6;
    const cx = x0 + 4;

    const rows = [
      ['MOMENTARY', m.lufsM, 'LUFS'],
      ['SHORT-TERM', m.lufsS, 'LUFS'],
      ['INTEGRATED', m.lufsI, 'LUFS'],
      ['RANGE', m.lra, 'LU'],
    ];
    const rh = Math.min(h / rows.length, 60);
    ctx.textAlign = 'left';
    for (let i = 0; i < rows.length; i++) {
      const [label, val, unit] = rows[i];
      const y = i * rh + rh / 2;
      ctx.textBaseline = 'alphabetic';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = rgba(text, 0.45);
      ctx.fillText(label, cx, y - rh * 0.28);

      let str;
      if (label === 'RANGE') str = isFinite(val) ? val.toFixed(1) : '0.0';
      else str = isFinite(val) ? val.toFixed(1) : '−∞';

      // color the integrated number vs target
      let col = accent;
      if (label === 'INTEGRATED' && isFinite(val)) {
        const diff = Math.abs(val - s.meterTarget);
        col = diff < 1 ? hexToRgb('#43d17a') : diff < 3 ? hexToRgb('#f5c451') : hexToRgb('#ff5d6c');
      }
      ctx.font = '700 22px ui-monospace, monospace';
      ctx.fillStyle = rgba(col, 1);
      ctx.fillText(str, cx, y + rh * 0.22);
      const tw = ctx.measureText(str).width;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = rgba(text, 0.4);
      ctx.fillText(unit, cx + tw + 5, y + rh * 0.22);
    }

    // target hint
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = rgba(text, 0.35);
    ctx.fillText(`target ${s.meterTarget} LUFS`, cx, h - 4);
    void colW;
  }
}
