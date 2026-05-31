/* ===================================================================
   ui.js — DOM controller: top bar, settings drawer, panel layout,
   device list, onboarding overlay, toasts and status pill.
   Pure view concerns; main.js owns the audio/render orchestration and
   passes callbacks in via on*().
   =================================================================== */

import { buildSettingsUI } from './settings.js';

const PANEL_KEYS = {
  showSpectrum: 'spectrum',
  showSpectrogram: 'spectrogram',
  showWaveform: 'waveform',
  showMeters: 'meters',
  showGoniometer: 'goniometer',
};

export class UI {
  constructor(store) {
    this.store = store;
    this.$ = (sel) => document.querySelector(sel);
    this._isMac = /Mac|iPhone|iPad/i.test(navigator.platform || '') || /Mac OS/i.test(navigator.userAgent || '');
    this._isElectron = !!(window.NURK_DESKTOP && window.NURK_DESKTOP.isElectron);
    this.panels = {};
    document.querySelectorAll('.panel').forEach((p) => { this.panels[p.dataset.panel] = p; });

    this._wireDrawer();
    this._wirePanels();
    this.applyLayout(store.all());
    store.subscribe((keys, s) => {
      if (keys.some((k) => k in PANEL_KEYS)) this.applyLayout(s);
    });
  }

  /* ----- callbacks set by main ----- */
  onStart(cb) { this._start = cb; }
  onStop(cb) { this._stop = cb; }
  onPause(cb) { this._pause = cb; }
  onSourceChange(cb) { this._srcChange = cb; }

  /* ----- top bar wiring ----- */
  wireControls() {
    const startBtn = this.$('#startBtn');
    const sourceType = this.$('#sourceType');
    const deviceWrap = this.$('#deviceWrap');

    startBtn.addEventListener('click', () => this._toggleStart());
    this.$('#overlayStart').addEventListener('click', () => {
      this.hideOverlay();
      this._toggleStart();
    });

    sourceType.addEventListener('change', () => {
      deviceWrap.hidden = sourceType.value !== 'mic';
      this.updateHint(sourceType.value);
      this._srcChange?.(sourceType.value);
    });
    deviceWrap.hidden = sourceType.value !== 'mic';
    this.updateHint(sourceType.value);

    this.$('#pauseBtn').addEventListener('click', () => this._pause?.());
    this.$('#fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
    this.$('#settingsBtn').addEventListener('click', () => this.toggleSettings());

    this.$('#deviceSelect').addEventListener('change', (e) => {
      this.selectedDeviceId = e.target.value || null;
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); this._pause?.(); }
      else if (e.key === 'f') this.toggleFullscreen();
      else if (e.key === 's') this.toggleSettings();
      else if (e.key === 'Escape') { this.closeSettings(); }
    });
  }

  get sourceType() { return this.$('#sourceType').value; }
  get deviceId() { return this.selectedDeviceId || null; }

  /** Show a context-aware tip for the selected source + platform. */
  updateHint(type) {
    const el = this.$('#hintBar');
    if (!el) return;
    let html;
    if (type === 'display' && this._isElectron) {
      html = '<span class="ic">↺</span><span>Captures your computer’s <b>full system audio</b> directly — <b>no BlackHole, no screen recording</b> (Core Audio tap on macOS 14.4+, WASAPI on Windows). Just press <b>Start</b>.' +
        (this._isMac ? ' macOS may ask for audio permission once — allow it.' : '') + '</span>';
    } else if (type === 'display') {
      html = this._isMac
        ? '<span class="ic">ⓘ</span><span>Start opens a <b>screen-share picker</b> (the audio is the <b>“Share tab audio”</b> checkbox — there’s no separate popup). On macOS this needs <b>Chrome/Edge</b> + Screen-Recording permission, and only a <b>Chrome tab</b> can share audio. <b>More reliable:</b> use <b>Microphone / Input</b> with a loopback device like <b>BlackHole</b> for full system sound.</span>'
        : '<span class="ic">ⓘ</span><span>Start opens a <b>screen-share picker</b> — audio is the <b>“Share audio”</b> checkbox there. Pick a tab (<b>Share tab audio</b>) or <b>Entire screen</b> (<b>Share system audio</b>).</span>';
    } else if (type === 'mic') {
      if (this._isElectron && this._hasLoopback) {
        html = '<span class="ic">↺</span><span>Analyzing the selected <b>loopback device</b> (your computer’s output). Change the device above to switch sources.</span>';
      } else if (this._isElectron && this._isMac) {
        html = '<span class="ic">ⓘ</span><span>macOS can’t record the speakers directly, so route them through a free virtual device: install <b>BlackHole</b>, make a <b>Multi-Output</b> (speakers + BlackHole) in <b>Audio MIDI Setup</b>, set it as your output, then pick <b>BlackHole</b> above — that <i>is</i> your computer’s output. Or choose your mic to analyze room sound.</span>';
      } else {
        html = '<span class="ic">ⓘ</span><span>Pick your input device. To analyze what your <b>computer is playing</b>, select a loopback device — e.g. <b>BlackHole</b> (macOS), <b>VB-Cable</b> (Windows) or <b>Stereo Mix</b>.</span>';
      }
    } else {
      html = '<span class="ic">ⓘ</span><span><b>Demo signal</b> plays a synthesized test tone <b>inside the app</b> — no microphone, no permissions, works in any browser. Hit <b>Start</b> to watch every meter come alive, then switch to a real source.</span>';
    }
    el.innerHTML = html;
    el.hidden = false;
  }

  async _toggleStart() {
    const btn = this.$('#startBtn');
    if (btn.classList.contains('is-live')) {
      await this._stop?.();
    } else {
      await this._start?.();
    }
  }

  setLive(live) {
    const btn = this.$('#startBtn');
    btn.classList.toggle('is-live', live);
    btn.querySelector('.label').textContent = live ? 'Stop' : 'Start';
    this.$('#pauseBtn').disabled = !live;
    if (!live) this.setPaused(false);
  }

  setPaused(paused) {
    this.$('#pauseBtn').textContent = paused ? '▶' : '⏸';
    if (paused) this.setStatus('paused', 'Frozen');
  }

  /* ----- status + toasts ----- */
  setStatus(state, text) {
    const el = this.$('#status');
    el.dataset.state = state;
    el.querySelector('.status-text').textContent = text;
  }

  toast(msg, type = '') {
    const wrap = this.$('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, type === 'err' ? 6000 : 3200);
    setTimeout(() => el.remove(), type === 'err' ? 6400 : 3600);
  }

  /* ----- overlay ----- */
  showOverlay() { this.$('#overlay').classList.remove('gone'); }
  hideOverlay() { this.$('#overlay').classList.add('gone'); }
  setOverlayNote(txt) { this.$('#overlayNote').textContent = txt; }

  /* ----- devices ----- */
  populateDevices(devices) {
    const sel = this.$('#deviceSelect');
    const prev = sel.value;
    sel.innerHTML = '';
    if (!devices.length) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'Default input';
      sel.appendChild(o);
      return;
    }
    // A loopback / virtual device is how you capture the computer's *output*.
    const LOOPBACK = /blackhole|soundflower|loopback|aggregate|multi.?output|vb.?(audio|cable)|stereo ?mix|wave ?link|voicemeeter/i;
    let loopbackId = null;
    devices.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      const isLoop = LOOPBACK.test(d.label || '');
      o.textContent = (isLoop ? '↺ ' : '') + (d.label || `Input ${i + 1}`);
      sel.appendChild(o);
      if (isLoop && !loopbackId) loopbackId = d.deviceId;
    });
    // Prefer a loopback device (= your computer's output); else keep prior/first.
    if (loopbackId) sel.value = loopbackId;
    else if (prev) sel.value = prev;
    this.selectedDeviceId = sel.value || null;
    this._hasLoopback = !!loopbackId;
    if (this.sourceType === 'mic') this.updateHint('mic'); // reflect loopback availability
  }

  /* ----- settings drawer ----- */
  _wireDrawer() {
    this.settingsUI = buildSettingsUI(this.$('#settingsGroups'), this.store);
    this.$('#settingsClose').addEventListener('click', () => this.closeSettings());
    this.$('#scrim').addEventListener('click', () => this.closeSettings());
    this.$('#settingsSearch').addEventListener('input', (e) => this.settingsUI.filter(e.target.value));

    this.$('#exportBtn').addEventListener('click', async () => {
      const json = this.store.export();
      try { await navigator.clipboard.writeText(json); this.toast('Settings copied to clipboard.', 'ok'); }
      catch { window.prompt('Copy your settings JSON:', json); }
    });
    this.$('#importBtn').addEventListener('click', () => {
      const json = window.prompt('Paste settings JSON:');
      if (!json) return;
      try { this.store.import(json); this.toast('Settings imported.', 'ok'); }
      catch { this.toast('<b>Invalid</b> settings JSON.', 'err'); }
    });
    this.$('#resetBtn').addEventListener('click', () => {
      if (confirm('Restore all settings to defaults?')) { this.store.reset(); this.toast('Settings reset.'); }
    });
  }

  toggleSettings() { this.$('#settings').classList.contains('open') ? this.closeSettings() : this.openSettings(); }
  openSettings() {
    this.$('#settings').classList.add('open');
    this.$('#settings').setAttribute('aria-hidden', 'false');
    this.$('#scrim').hidden = false;
  }
  closeSettings() {
    this.$('#settings').classList.remove('open');
    this.$('#settings').setAttribute('aria-hidden', 'true');
    this.$('#scrim').hidden = true;
  }

  /* ----- panels / layout ----- */
  _wirePanels() {
    document.querySelectorAll('.panel [data-action="expand"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('.panel').classList.toggle('is-wide');
      });
    });
  }

  applyLayout(s) {
    for (const [key, panel] of Object.entries(PANEL_KEYS)) {
      const el = this.panels[panel];
      if (el) el.classList.toggle('is-hidden', !s[key]);
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
}
