/* ===================================================================
   main.js — boot + orchestration.
   Creates the store, audio engine, visualizers and UI; runs a single
   requestAnimationFrame loop that reads one frame of audio data and
   feeds every *visible* visualizer.
   =================================================================== */

import { createStore } from './settings.js';
import { applyCssVars } from './themes.js';
import { AudioEngine } from './audio-engine.js';
import { UI } from './ui.js';
import { Spectrum } from './visualizers/spectrum.js';
import { Spectrogram } from './visualizers/spectrogram.js';
import { Waveform } from './visualizers/waveform.js';
import { Meters } from './visualizers/meters.js';
import { Goniometer } from './visualizers/goniometer.js';

const store = createStore();
const engine = new AudioEngine();
const ui = new UI(store);

let paused = false;
let lastT = performance.now();

/* ---------- visualizers ---------- */
const canvas = (name) => document.querySelector(`canvas[data-canvas="${name}"]`);
const viz = {
  spectrum:    { v: new Spectrum(canvas('spectrum'), store, { readoutEl: document.querySelector('#spectrumReadout') }), key: 'showSpectrum' },
  spectrogram: { v: new Spectrogram(canvas('spectrogram'), store), key: 'showSpectrogram' },
  waveform:    { v: new Waveform(canvas('waveform'), store), key: 'showWaveform' },
  meters:      { v: new Meters(canvas('meters'), store), key: 'showMeters' },
  goniometer:  { v: new Goniometer(canvas('goniometer'), store), key: 'showGoniometer' },
};

/* ---------- reactive settings → CSS + analyser ---------- */
applyCssVars(store.all());
store.subscribe((keys, s) => {
  applyCssVars(s);
  if (keys.includes('fftSize') || keys.includes('smoothing')) engine.applyAnalyserSettings(s);
});

/* ---------- UI wiring ---------- */
ui.wireControls();
ui.onSourceChange(async (type) => {
  if (type === 'mic') ui.populateDevices(await engine.listInputDevices());
});

const LIVE_LABEL = { display: 'Live · system', mic: 'Live · input', demo: 'Live · demo' };
const START_TOAST = {
  display: 'Capturing shared audio. <b>Tip:</b> share a tab and tick “Share audio” for cleanest results.',
  mic: 'Listening to your input device.',
  demo: 'Playing the internal demo signal — no audio is captured. Switch Source to analyze real audio.',
};

ui.onStart(async () => {
  ui.setStatus('idle', 'Connecting…');
  try {
    await engine.start(ui.sourceType, ui.deviceId);
    engine.applyAnalyserSettings(store.all());
    engine.onTrackEnded(() => stopAll('Source ended.'));
    paused = false;
    ui.setLive(true);
    ui.setStatus('live', LIVE_LABEL[ui.sourceType] || 'Live');
    ui.hideOverlay();
    if (ui.sourceType === 'mic') ui.populateDevices(await engine.listInputDevices());
    ui.toast(START_TOAST[ui.sourceType] || 'Running.', 'ok');
  } catch (err) {
    console.error(err);
    ui.setLive(false);
    ui.setStatus('error', 'Error');
    ui.toast(`<b>Couldn't start.</b> ${friendlyError(err, ui.sourceType)}`, 'err');
  }
});

ui.onStop(async () => { await stopAll('Stopped'); });
ui.onPause(() => {
  if (!engine.running) return;
  paused = !paused;
  ui.setPaused(paused);
  if (!paused) ui.setStatus('live', LIVE_LABEL[ui.sourceType] || 'Live');
});

async function stopAll(msg) {
  await engine.stop();
  paused = false;
  ui.setLive(false);
  ui.setStatus('idle', msg || 'Idle');
}

/* ---------- render loop ---------- */
const idleFreq = new Float32Array(0);
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  const active = engine.running && !paused;
  if (active) engine.readFrame();

  const frame = {
    active,
    dt,
    freq: engine.freq.length ? engine.freq : idleFreq,
    time: engine.time,
    timeL: engine.timeL,
    timeR: engine.timeR,
    sampleRate: engine.sampleRate,
    binCount: engine.binCount,
    meters: engine.meters,
  };

  const s = store.all();
  for (const { v, key } of Object.values(viz)) {
    if (s[key]) v.draw(frame);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- onboarding note ---------- */
(function onboarding() {
  const hasDisplay = !!navigator.mediaDevices?.getDisplayMedia;
  const isMac = /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent);
  let note = '';
  if (!hasDisplay) {
    note = 'Your browser can’t capture system audio — use Microphone / Input, or open this in Chrome/Edge.';
  } else if (isMac) {
    note = 'On macOS, Chrome captures audio from a shared browser tab (tick “Share tab audio”). For full system audio, choose Microphone / Input with a loopback device.';
  } else {
    note = 'For system-wide audio on Windows/Linux, share your entire screen and enable “Share system audio”.';
  }
  ui.setOverlayNote(note);
})();

function friendlyError(err, sourceType) {
  const n = err?.name || '';
  const ua = navigator.userAgent || '';
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || '') || /Mac OS/i.test(ua);
  const isChromium = /Chrome|Chromium|Edg\//.test(ua) && !/OPR|SamsungBrowser/.test(ua);
  const display = sourceType === 'display';

  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'NotSupportedError') {
    if (display) {
      if (!isChromium) {
        return 'tab/system-audio capture needs <b>Chrome</b> or <b>Edge</b> — Safari and Firefox don’t support sharing audio. <br><b>Easiest fix:</b> switch Source to <b>Microphone / Input</b> (use a loopback device like BlackHole to feed it your computer’s output).';
      }
      return isMac
        ? 'the browser blocked screen capture (no picker appeared). <br><b>Most reliable fix on macOS:</b> switch Source to <b>Microphone / Input</b> and pick a loopback device like <b>BlackHole</b> for system sound. <br><b>To use screen-share instead:</b> grant your browser <b>Screen Recording</b> in System&nbsp;Settings › Privacy&nbsp;&amp;&nbsp;Security, then fully <b>quit &amp; reopen</b> it — and share a <b>Chrome tab</b> with <b>“Share tab audio”</b> (whole-screen audio isn’t available on macOS).'
        : 'screen capture was blocked or cancelled. Click <b>Start</b> again, choose a tab or <b>Entire screen</b>, and tick <b>“Share audio / Share system audio”</b>. If the dialog never appears, allow screen sharing for this site.';
    }
    return isMac
      ? 'microphone access is blocked. <br>① Click the <b>site-info icon</b> (left of the address bar) → <b>Microphone → Allow</b>, then reload. <br>② Also enable your browser in <b>System Settings › Privacy &amp; Security › Microphone</b>. <br>③ Press <b>Start</b> again.'
      : 'microphone access is blocked. Click the <b>site-info icon</b> left of the address bar → <b>Microphone → Allow</b>, reload, then press Start again.';
  }
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'no matching audio input was found. Pick a different device, or check it’s plugged in.';
  if (n === 'NotReadableError') return 'the device is in use by another app, or the OS denied access. Close other apps using it and retry.';
  if (n === 'AbortError') return 'the capture was cancelled.';
  return `${err?.message || 'unknown error.'}${n ? ` (${n})` : ''}`;
}

// expose for debugging in the console
window.NURKALYZED = { store, engine, viz };
