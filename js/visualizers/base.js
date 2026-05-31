/* ===================================================================
   base.js — common canvas plumbing for every visualizer:
   DPI-correct sizing via ResizeObserver, and convenient w/h in CSS px.
   =================================================================== */

export class Visualizer {
  constructor(canvas, store) {
    this.canvas = canvas;
    this.store = store;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.w = 0;
    this.h = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas.parentElement || canvas);
    this._resize();
  }

  _resize() {
    const host = this.canvas.parentElement || this.canvas;
    const rect = host.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.onResize?.();
  }

  /** Override in subclasses. `frame` is the shared per-frame data bundle. */
  draw(/* frame */) {}

  destroy() { this._ro.disconnect(); }
}
