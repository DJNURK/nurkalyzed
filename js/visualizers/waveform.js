/* ===================================================================
   waveform.js — oscilloscope. Rising-edge trigger keeps the trace from
   sliding; mono / stereo / filled modes; adjustable time window & gain.
   =================================================================== */

import { Visualizer } from './base.js';
import { hexToRgb, rgba, clamp } from '../helpers.js';

export class Waveform extends Visualizer {
  draw(frame) {
    const s = this.store.all();
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // grid
    const gridCol = hexToRgb(s.gridColor);
    ctx.strokeStyle = rgba(gridCol, s.gridOpacity * 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke();
    ctx.strokeStyle = rgba(gridCol, s.gridOpacity * 0.4);
    for (const fy of [0.25, 0.75]) {
      ctx.beginPath(); ctx.moveTo(0, h * fy + 0.5); ctx.lineTo(w, h * fy + 0.5); ctx.stroke();
    }

    if (!frame.active) return;

    const sr = frame.sampleRate;
    const win = clamp(Math.round((s.waveWindow / 1000) * sr), 16, frame.time.length);
    const gain = s.waveGain;

    ctx.save();
    if (s.glow) { ctx.shadowBlur = s.glowAmount; }
    ctx.lineWidth = s.waveLineWidth;
    ctx.lineJoin = 'round';

    if (s.waveMode === 'stereo') {
      this._trace(frame.timeL, win, gain, s.waveColor, false, frame.timeL);
      this._trace(frame.timeR, win, gain, s.waveColorR, false, frame.timeL);
    } else {
      this._trace(frame.time, win, gain, s.waveColor, s.waveMode === 'filled', frame.time);
    }
    ctx.restore();
  }

  /** Draw one channel. `trigSrc` is the signal used for the rising-edge trigger. */
  _trace(buf, win, gain, color, filled, trigSrc) {
    const { ctx, w, h } = this;
    const start = triggerIndex(trigSrc, win);
    const mid = h / 2;
    const amp = (h / 2) * 0.92;

    ctx.shadowColor = color;
    ctx.strokeStyle = color;

    ctx.beginPath();
    for (let i = 0; i < win; i++) {
      const x = (i / (win - 1)) * w;
      const v = clamp(buf[start + i] * gain, -1.2, 1.2);
      const y = mid - v * amp;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (filled) {
      ctx.save();
      ctx.lineTo(w, mid); ctx.lineTo(0, mid); ctx.closePath();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(hexToRgb(color), 0.18);
      ctx.fill();
      ctx.restore();
    }
    ctx.stroke();
  }
}

/** Find a rising zero-crossing so the waveform appears stationary. */
function triggerIndex(buf, win) {
  const maxStart = buf.length - win;
  if (maxStart <= 0) return 0;
  const limit = Math.min(maxStart, Math.floor(buf.length * 0.4));
  for (let i = 1; i < limit; i++) {
    if (buf[i - 1] < 0 && buf[i] >= 0) return i;
  }
  return 0;
}
