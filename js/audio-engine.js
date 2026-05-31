/* ===================================================================
   audio-engine.js — capture + analysis graph.

   Graph (all silent: everything funnels into a gain=0 node so the audio
   is analyzed but never played back, avoiding feedback for system audio):

      source ┬─────────────────────────────► analyser (mono spectrum/scope)
             ├── splitter ─0─► analyserL ───►
             │            └─1─► analyserR ───►──┐
             ├──────────────────────────────► meter#0 (linear)  ┐
             └── K-shelf ► K-highpass ───────► meter#1 (K-weight)┘ → muteGain(0) → out

   The AudioWorklet measures sample-accurate peak / RMS / K-weighted energy;
   this module turns its 100 ms blocks into LUFS-M/S/I + LRA on the main thread.
   =================================================================== */

import { ampToDb } from './helpers.js';

const LUFS_OFFSET = -0.691; // ITU-R BS.1770 absolute calibration constant

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.running = false;
    this.sampleRate = 48000;

    this.analyser = null;
    this.analyserL = null;
    this.analyserR = null;

    // shared per-frame buffers (reallocated on fftSize change)
    this.freq = new Float32Array(0);
    this.time = new Float32Array(0);
    this.timeL = new Float32Array(0);
    this.timeR = new Float32Array(0);

    // loudness bookkeeping
    this._blocks = [];          // recent 100 ms blocks (for M/S windows), capped at 3 s
    this._gateEnergies = [];    // 400 ms gating-block energies that pass the absolute gate
    this._stHistory = [];       // short-term loudness samples (for LRA)

    this.meters = emptyMeters();
    this._sourceType = null;
    this._isMac = /Mac|iPhone|iPad/i.test(navigator.platform || '') || /Mac OS/i.test(navigator.userAgent || '');
  }

  /* ---------------- lifecycle ---------------- */

  async start(sourceType, deviceId) {
    this._sourceType = sourceType;

    // Demo signal: synthesize audio internally — no capture, no permissions,
    // works in every browser. Great for confirming the analyzer works.
    if (sourceType === 'demo') {
      await this.stop();
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      await this.ctx.resume();
      this.sampleRate = this.ctx.sampleRate;
      const demoSrc = this._buildDemoSource(this.ctx);
      await this._buildGraph(this.ctx, demoSrc);
      this.running = true;
      return;
    }

    // Capture APIs require a secure context (https or localhost).
    if (!window.isSecureContext || !navigator.mediaDevices) {
      throw new Error('Open this over http://localhost or https:// — browsers block audio capture on insecure pages (a file:// path or a bare LAN IP won’t work).');
    }

    // 1. acquire a MediaStream *first*, before tearing down any old session.
    //    This call must run inside the click's user-activation, so nothing of
    //    ours may `await` ahead of it.
    const constraintsAudio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    let stream;
    if (sourceType === 'display') {
      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error('This browser can’t capture tab/system audio. Use Chrome or Edge, or switch Source to “Microphone / Input”.');
      }
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,                 // Chrome only offers audio when video is requested
        audio: constraintsAudio,
        systemAudio: 'include',      // hint Chrome to include system audio where possible
        selfBrowserSurface: 'include',
      });
      for (const t of stream.getVideoTracks()) t.stop(); // we only need the audio
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(this._isMac
          ? 'No audio was shared. On macOS, choose a Chrome TAB and tick “Share tab audio”. (Sharing a whole screen/window can’t include audio on macOS — for full system sound, route output through a loopback device like BlackHole and pick it under “Microphone / Input”.)'
          : 'No audio was shared. In the picker choose a tab or “Entire screen”, then tick “Share audio”.');
      }
    } else {
      const audio = { ...constraintsAudio };
      if (deviceId) audio.deviceId = { exact: deviceId };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      } catch (e) {
        // fall back to the default device if the chosen one is unavailable
        if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { ...constraintsAudio }, video: false });
        } else { throw e; }
      }
    }

    // 2. now safe to tear down a previous session and adopt the new stream
    await this.stop();
    this.stream = stream;

    // 3. build graph
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.sampleRate = this.ctx.sampleRate;
    const source = this.ctx.createMediaStreamSource(this.stream);
    await this._buildGraph(this.ctx, source);

    // if the user stops sharing from the browser UI, tidy up
    this.stream.getAudioTracks().forEach((t) => {
      t.addEventListener('ended', () => { if (this.running) this._onTrackEnded?.(); });
    });

    this.running = true;
  }

  /** Wire any source node into the analysers + K-weighted loudness worklet. */
  async _buildGraph(ctx, source) {
    const mute = ctx.createGain();
    mute.gain.value = 0;            // analyze silently — never plays back
    mute.connect(ctx.destination);

    // main (mono) analyser
    this.analyser = ctx.createAnalyser();
    this.analyser.smoothingTimeConstant = 0.7;
    source.connect(this.analyser);
    this.analyser.connect(mute);

    // per-channel analysers
    const splitter = ctx.createChannelSplitter(2);
    source.connect(splitter);
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.smoothingTimeConstant = 0;
    this.analyserR.smoothingTimeConstant = 0;
    splitter.connect(this.analyserL, 0);
    splitter.connect(this.analyserR, 1);
    this.analyserL.connect(mute);
    this.analyserR.connect(mute);

    this._allocBuffers();

    // K-weighting chain (approximation of BS.1770 pre-filter + RLB highpass)
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 1681.97;
    shelf.gain.value = 4.0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 38.13;
    hp.Q.value = 0.5;
    source.connect(shelf);
    shelf.connect(hp);

    // loudness/peak worklet (graceful fallback if unavailable)
    this._resetLoudness();
    try {
      await ctx.audioWorklet.addModule('js/meter-processor.js');
      const meter = new AudioWorkletNode(ctx, 'meter-processor', {
        numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1],
      });
      source.connect(meter, 0, 0); // linear
      hp.connect(meter, 0, 1);     // K-weighted
      meter.connect(mute);
      meter.port.onmessage = (e) => this._onMeterBlock(e.data);
      this._meterNode = meter;
    } catch (err) {
      console.warn('AudioWorklet unavailable; LUFS metering disabled.', err);
    }
  }

  /** Synthesize a lively stereo demo signal: chord + slow sweep + noise + motion. */
  _buildDemoSource(ctx) {
    const out = ctx.createGain();
    out.gain.value = 0.5;
    const now = ctx.currentTime;
    const nodes = [out];
    const add = (...n) => nodes.push(...n);

    // sustained chord → stable spectral peaks + waveform shape
    [110, 164.81, 220, 329.63].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.05;
      const pan = ctx.createStereoPanner(); pan.pan.value = i % 2 ? 0.4 : -0.4;
      o.connect(g); g.connect(pan); pan.connect(out);
      o.start(now); add(o, g, pan);
    });

    // slow swept tone → motion across spectrum/spectrogram, panned for stereo width
    const sweep = ctx.createOscillator(); sweep.type = 'triangle'; sweep.frequency.value = 3000;
    const sweepGain = ctx.createGain(); sweepGain.gain.value = 0.07;
    const fLfo = ctx.createOscillator(); fLfo.frequency.value = 0.12;
    const fLfoGain = ctx.createGain(); fLfoGain.gain.value = 2600; // ±2600 Hz around 3 kHz
    fLfo.connect(fLfoGain); fLfoGain.connect(sweep.frequency);
    const sweepPan = ctx.createStereoPanner();
    const pLfo = ctx.createOscillator(); pLfo.frequency.value = 0.2; // pan motion (sine ±1)
    pLfo.connect(sweepPan.pan);
    sweep.connect(sweepGain); sweepGain.connect(sweepPan); sweepPan.connect(out);
    sweep.start(now); fLfo.start(now); pLfo.start(now);
    add(sweep, sweepGain, fLfo, fLfoGain, sweepPan, pLfo);

    // decorrelated stereo noise → broadband spectrogram + realistic correlation
    const noise = ctx.createBufferSource();
    noise.buffer = this._makeNoiseBuffer(ctx, 2); noise.loop = true;
    const nHp = ctx.createBiquadFilter(); nHp.type = 'highpass'; nHp.frequency.value = 40;
    const nLp = ctx.createBiquadFilter(); nLp.type = 'lowpass'; nLp.frequency.value = 6000; nLp.Q.value = 0.5;
    const nGain = ctx.createGain(); nGain.gain.value = 0.04;
    noise.connect(nHp); nHp.connect(nLp); nLp.connect(nGain); nGain.connect(out);
    noise.start(now); add(noise, nHp, nLp, nGain);

    // amplitude "breathing" → meters move
    const aLfo = ctx.createOscillator(); aLfo.frequency.value = 0.15;
    const aLfoGain = ctx.createGain(); aLfoGain.gain.value = 0.22;
    aLfo.connect(aLfoGain); aLfoGain.connect(out.gain);
    aLfo.start(now); add(aLfo, aLfoGain);

    this._demoNodes = nodes;
    return out;
  }

  /** A 2 s looping, lightly pink-tinted, per-channel-decorrelated noise buffer. */
  _makeNoiseBuffer(ctx, channels = 2) {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
    for (let c = 0; c < channels; c++) {
      const d = buf.getChannelData(c);
      let last = 0, max = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = 0.985 * last + 0.015 * white;  // leaky integrator → pink-ish tilt
        d[i] = white * 0.35 + last * 3.2;
        const a = Math.abs(d[i]); if (a > max) max = a;
      }
      if (max > 0) for (let i = 0; i < len; i++) d[i] /= max;
    }
    return buf;
  }

  async stop() {
    this.running = false;
    if (this._demoNodes) {
      for (const n of this._demoNodes) { try { n.stop && n.stop(); } catch {} try { n.disconnect && n.disconnect(); } catch {} }
      this._demoNodes = null;
    }
    if (this._meterNode) { try { this._meterNode.port.onmessage = null; this._meterNode.disconnect(); } catch {} this._meterNode = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (this.ctx) { try { await this.ctx.close(); } catch {} this.ctx = null; }
    this.analyser = this.analyserL = this.analyserR = null;
    this.meters = emptyMeters();
    this._resetLoudness();
  }

  onTrackEnded(cb) { this._onTrackEnded = cb; }

  /* ---------------- settings ---------------- */

  applyAnalyserSettings(s) {
    if (!this.analyser) return;
    const size = +s.fftSize;
    if (this.analyser.fftSize !== size) {
      this.analyser.fftSize = size;
      // keep per-channel analysers reasonably sized (cap for performance)
      const chSize = Math.min(size, 8192);
      this.analyserL.fftSize = chSize;
      this.analyserR.fftSize = chSize;
      this._allocBuffers();
    }
    this.analyser.smoothingTimeConstant = s.smoothing;
  }

  _allocBuffers() {
    const n = this.analyser.frequencyBinCount;
    this.freq = new Float32Array(n);
    this.time = new Float32Array(this.analyser.fftSize);
    this.timeL = new Float32Array(this.analyserL.fftSize);
    this.timeR = new Float32Array(this.analyserR.fftSize);
  }

  /* ---------------- per-frame read ---------------- */

  /** Pull the latest data into shared buffers. Returns false if not running. */
  readFrame() {
    if (!this.analyser) return false;
    this.analyser.getFloatFrequencyData(this.freq);
    this.analyser.getFloatTimeDomainData(this.time);
    this.analyserL.getFloatTimeDomainData(this.timeL);
    this.analyserR.getFloatTimeDomainData(this.timeR);
    this.meters.corr = this._correlation();
    return true;
  }

  get binCount() { return this.analyser ? this.analyser.frequencyBinCount : 0; }

  /** Pearson-style stereo correlation over the current frame (-1..+1). */
  _correlation() {
    const L = this.timeL, R = this.timeR;
    const n = Math.min(L.length, R.length);
    if (!n) return 0;
    let sLR = 0, sLL = 0, sRR = 0;
    for (let i = 0; i < n; i++) { sLR += L[i] * R[i]; sLL += L[i] * L[i]; sRR += R[i] * R[i]; }
    const d = Math.sqrt(sLL * sRR);
    return d < 1e-9 ? 0 : sLR / d;
  }

  /* ---------------- loudness ---------------- */

  _resetLoudness() {
    this._blocks = [];
    this._gateEnergies = [];
    this._stHistory = [];
  }

  /** Reset the integrated (LUFS-I) and LRA measurement. */
  resetIntegrated() {
    this._gateEnergies = [];
    this._stHistory = [];
    this.meters.lufsI = -Infinity;
    this.meters.lra = 0;
  }

  _onMeterBlock(b) {
    // instantaneous peak / RMS for this 100 ms block
    this.meters.peakL = ampToDb(b.peakL);
    this.meters.peakR = ampToDb(b.peakR);
    this.meters.rmsL = ampToDb(Math.sqrt(b.sqL / b.n));
    this.meters.rmsR = ampToDb(Math.sqrt(b.sqR / b.n));

    this._blocks.push(b);
    // keep ~3 s of blocks for the short-term window
    const maxBlocks = 32;
    if (this._blocks.length > maxBlocks) this._blocks.shift();

    this.meters.lufsM = this._windowLoudness(4);   // 400 ms momentary
    this.meters.lufsS = this._windowLoudness(30);  // 3 s short-term

    // integrated: gating block = last 400 ms (4 blocks), 75 % overlap (step 100 ms)
    if (this._blocks.length >= 4) {
      const e = this._sliceEnergy(this._blocks.length - 4, 4);
      const loud = LUFS_OFFSET + 10 * Math.log10(Math.max(e, 1e-12));
      if (loud > -70) { // absolute gate
        this._gateEnergies.push(e);
        if (this._gateEnergies.length > 120000) this._gateEnergies.shift();
      }
      this.meters.lufsI = this._integrated();
    }

    if (isFinite(this.meters.lufsS)) {
      this._stHistory.push(this.meters.lufsS);
      if (this._stHistory.length > 36000) this._stHistory.shift();
      this.meters.lra = this._loudnessRange();
    }
  }

  /** Mean K-weighted energy (msL+msR) over the last `count` 100 ms blocks. */
  _windowLoudness(count) {
    const start = Math.max(0, this._blocks.length - count);
    if (this._blocks.length - start < 1) return -Infinity;
    const e = this._sliceEnergy(start, this._blocks.length - start);
    if (e <= 0) return -Infinity;
    return LUFS_OFFSET + 10 * Math.log10(e);
  }

  _sliceEnergy(start, count) {
    let kL = 0, kR = 0, n = 0;
    for (let i = start; i < start + count; i++) {
      const b = this._blocks[i];
      kL += b.kSqL; kR += b.kSqR; n += b.n;
    }
    if (n === 0) return 0;
    return kL / n + kR / n; // channel weights G_L = G_R = 1.0
  }

  /** Two-stage gated integrated loudness over the whole measurement. */
  _integrated() {
    const E = this._gateEnergies;
    if (!E.length) return -Infinity;
    let sum = 0;
    for (const e of E) sum += e;
    const meanAbs = sum / E.length;
    const relThresh = Math.pow(10, (LUFS_OFFSET + 10 * Math.log10(meanAbs) - 10 - LUFS_OFFSET) / 10);
    let s2 = 0, c2 = 0;
    for (const e of E) if (e >= relThresh) { s2 += e; c2++; }
    if (!c2) return -Infinity;
    return LUFS_OFFSET + 10 * Math.log10(s2 / c2);
  }

  /** Loudness Range (EBU R128): 10th–95th percentile of gated short-term values. */
  _loudnessRange() {
    const H = this._stHistory.filter((v) => v > -70);
    if (H.length < 10) return 0;
    // relative gate at -20 LU below the mean
    let sum = 0; for (const v of H) sum += v;
    const gate = sum / H.length - 20;
    const G = H.filter((v) => v >= gate).sort((a, b) => a - b);
    if (G.length < 2) return 0;
    const pct = (p) => G[Math.min(G.length - 1, Math.max(0, Math.round((p / 100) * (G.length - 1))))];
    return Math.max(0, pct(95) - pct(10));
  }

  /* ---------------- devices ---------------- */

  async listInputDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'audioinput');
    } catch { return []; }
  }
}

function emptyMeters() {
  return {
    peakL: -Infinity, peakR: -Infinity,
    rmsL: -Infinity, rmsR: -Infinity,
    lufsM: -Infinity, lufsS: -Infinity, lufsI: -Infinity,
    lra: 0, corr: 0,
  };
}
