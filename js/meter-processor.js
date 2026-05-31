/* ===================================================================
   meter-processor.js — AudioWorklet that measures the signal sample-
   accurately (the main-thread AnalyserNode only gives overlapping
   snapshots, which is wrong for loudness integration).

   Two inputs:
     input 0 = linear stereo  -> sample peak + sum-of-squares (for RMS / dBFS)
     input 1 = K-weighted stereo -> sum-of-squares (for LUFS, ITU-R BS.1770)

   Every ~100 ms it posts one accumulated block to the main thread, which
   maintains the sliding loudness windows and gating. Keeping the windows
   on the main thread keeps this processor tiny and robust.
   =================================================================== */

class MeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSamples = Math.max(1, Math.round(sampleRate * 0.1)); // 100 ms
    this._reset();
  }

  _reset() {
    this.count = 0;
    this.peakL = 0; this.peakR = 0;
    this.sqL = 0; this.sqR = 0;     // linear sum of squares
    this.kSqL = 0; this.kSqR = 0;   // K-weighted sum of squares
  }

  process(inputs) {
    const lin = inputs[0];
    const kw = inputs[1];

    let n = 128;
    if (lin && lin.length) {
      const L = lin[0];
      const R = lin.length > 1 ? lin[1] : lin[0];
      n = L.length;
      for (let i = 0; i < n; i++) {
        const l = L[i], r = R[i];
        const al = l < 0 ? -l : l;
        const ar = r < 0 ? -r : r;
        if (al > this.peakL) this.peakL = al;
        if (ar > this.peakR) this.peakR = ar;
        this.sqL += l * l;
        this.sqR += r * r;
      }
    }

    if (kw && kw.length) {
      const L = kw[0];
      const R = kw.length > 1 ? kw[1] : kw[0];
      const m = L.length;
      for (let i = 0; i < m; i++) {
        const l = L[i], r = R[i];
        this.kSqL += l * l;
        this.kSqR += r * r;
      }
    }

    this.count += n;
    if (this.count >= this.blockSamples) {
      this.port.postMessage({
        n: this.count,
        peakL: this.peakL, peakR: this.peakR,
        sqL: this.sqL, sqR: this.sqR,
        kSqL: this.kSqL, kSqR: this.kSqR,
      });
      this._reset();
    }
    return true; // keep alive
  }
}

registerProcessor('meter-processor', MeterProcessor);
