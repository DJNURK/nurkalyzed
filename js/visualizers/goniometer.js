/* ===================================================================
   goniometer.js — stereo vectorscope (Lissajous) + correlation meter.
   Rotated so mono (L=R) draws as a vertical line; width spreads sideways.
   Phosphor-style persistence fades old points instead of hard-clearing.
   =================================================================== */

import { Visualizer } from './base.js';
import { hexToRgb, rgba, clamp } from '../helpers.js';

export class Goniometer extends Visualizer {
  draw(frame) {
    const s = this.store.all();
    const { ctx, w, h } = this;
    const m = frame.meters;

    // persistence fade (or full clear when idle)
    if (frame.active) {
      ctx.fillStyle = rgba(hexToRgb(s.panelColor), 1 - s.gonioPersist);
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    const corrH = s.gonioCorr ? 22 : 0;
    const cx = w / 2;
    const cy = (h - corrH) / 2;
    const R = Math.min(w, h - corrH) / 2 * 0.86;

    this._guides(s, cx, cy, R);

    if (frame.active) {
      const L = frame.timeL, Rr = frame.timeR;
      const n = Math.min(L.length, Rr.length);
      const stepN = Math.max(1, Math.floor(n / 1024));
      const k = (R * s.gonioGain) / Math.SQRT2;
      const color = hexToRgb(s.gonioColor);

      ctx.save();
      if (s.glow) { ctx.shadowBlur = Math.min(8, s.glowAmount); ctx.shadowColor = s.gonioColor; }

      if (s.gonioMode === 'lines') {
        ctx.strokeStyle = rgba(color, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        let first = true;
        for (let i = 0; i < n; i += stepN) {
          const l = L[i], r = Rr[i];
          const x = cx + (l - r) * k;
          const y = cy - (l + r) * k;
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(color, 0.85);
        for (let i = 0; i < n; i += stepN) {
          const l = L[i], r = Rr[i];
          const x = cx + (l - r) * k;
          const y = cy - (l + r) * k;
          ctx.fillRect(x, y, 1.6, 1.6);
        }
      }
      ctx.restore();
    }

    if (s.gonioCorr) this._corr(s, m.corr, w, h - corrH, corrH, frame.active);
  }

  _guides(s, cx, cy, R) {
    const { ctx } = this;
    const g = hexToRgb(s.gridColor);
    const t = hexToRgb(s.textColor);
    ctx.strokeStyle = rgba(g, s.gridOpacity * 0.8);
    ctx.lineWidth = 1;
    // outer circle
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();
    // axes: vertical (mono), horizontal (anti-phase), and L/R diagonals
    ctx.strokeStyle = rgba(g, s.gridOpacity * 0.6);
    const diag = R * Math.SQRT1_2;
    const lines = [
      [cx, cy - R, cx, cy + R],       // mono (vertical)
      [cx - R, cy, cx + R, cy],       // side (horizontal)
      [cx - diag, cy - diag, cx + diag, cy + diag],
      [cx + diag, cy - diag, cx - diag, cy + diag],
    ];
    for (const [x1, y1, x2, y2] of lines) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // labels
    ctx.fillStyle = rgba(t, 0.4);
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('M', cx, cy - R - 0);
    ctx.fillText('L', cx - diag - 6, cy - diag - 4);
    ctx.fillText('R', cx + diag + 6, cy - diag - 4);
    ctx.fillText('+S', cx + R + 0, cy - 7);
    ctx.fillText('−S', cx - R - 0, cy - 7);
  }

  _corr(s, corr, w, y0, hgt, active) {
    const { ctx } = this;
    const t = hexToRgb(s.textColor);
    const pad = 26;
    const trackW = w - pad * 2;
    const midY = y0 + hgt / 2;
    const c = active ? clamp(corr, -1, 1) : 0;

    // track
    ctx.fillStyle = rgba(hexToRgb(s.gridColor), 0.5);
    ctx.fillRect(pad, midY - 4, trackW, 8);
    // center tick
    ctx.fillStyle = rgba(t, 0.4);
    ctx.fillRect(pad + trackW / 2 - 0.5, midY - 7, 1, 14);
    // value bar from center
    const cxp = pad + trackW / 2;
    const x = cxp + (c * trackW) / 2;
    const col = c < 0 ? '#ff5d6c' : c < 0.4 ? '#f5c451' : '#43d17a';
    ctx.fillStyle = col;
    ctx.fillRect(Math.min(cxp, x), midY - 4, Math.abs(x - cxp), 8);

    ctx.fillStyle = rgba(t, 0.5);
    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillText('−1', 2, midY);
    ctx.textAlign = 'right'; ctx.fillText('+1', w - 2, midY);
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(t, 0.8);
    ctx.fillText(`corr ${c >= 0 ? '+' : ''}${c.toFixed(2)}`, cxp, midY - hgt * 0.0 - 0);
  }
}
