# NURKALYZED

A completely customizable, real-time **audio analyzer** for the browser — think
**SPAN** / **miniMeters**, but as a website. Point it at your computer's audio (a
browser tab, your whole screen, or any input device) and watch it come apart into:

- **Spectrum analyzer** — log/linear FFT, dB grid, spectral tilt (pink-noise slope),
  peak-hold, line / filled / bar styles, frequency-or-level gradients, and a live
  hover readout showing frequency + nearest musical note + level.
- **Spectrogram** — scrolling waterfall with perceptual colormaps (magma, inferno,
  viridis, plasma, ice, classic, grayscale).
- **Oscilloscope** — triggered waveform, mono / stereo / filled.
- **Loudness meters** — Peak & RMS bargraphs with ballistics + hold, and
  **LUFS** Momentary / Short-term / Integrated + **Loudness Range** (ITU-R BS.1770 /
  EBU R128 style, K-weighted).
- **Stereo image** — goniometer/vectorscope with phosphor persistence and a
  correlation meter.

Everything — colors, scales, FFT size, smoothing, curves, which panels show, the
whole theme — is editable in the **⚙ Settings** drawer and saved to your browser.
Settings can be exported/imported as JSON.

---

## Run it

Browsers only allow audio capture from a **secure context**, so open it via
`localhost` (not by double-clicking the HTML file). From this folder:

```bash
python3 -m http.server 8000
```

then open **http://localhost:8000** in **Chrome** or **Edge** (recommended for system
audio). On macOS you can also just double-click **`start.command`**.

> No build step, no dependencies — it's plain HTML/CSS/ES-modules.

---

## Just want to see it work?

Pick **Source → Demo signal (no mic)** and hit **Start**. It synthesizes a test tone
*inside* the app — no microphone, no permissions, works in **any** browser (Chrome,
Edge, Safari, Firefox). Every visualizer comes alive instantly. Then switch to a real
source below.

## Capturing your computer's audio

Browsers can't grab raw "system audio" directly; you route it in through a capture
the browser *is* allowed to make:

| Platform | How to get system audio |
|---|---|
| **Windows / Linux (Chrome/Edge)** | Source → *System / Tab Audio* → **Start** → in the picker choose **Entire screen** and tick **“Share system audio.”** |
| **Any platform** | Choose **Share a Chrome tab** and tick **“Share tab audio”** to analyze exactly what that tab is playing (YouTube, a DAW's web player, etc.). |
| **macOS (full system audio)** | macOS doesn't expose system audio to Chrome's screen share. Install a virtual loopback device (e.g. **BlackHole** or **Loopback**), route your output through it, then pick it under Source → **Microphone / Input**. |
| **Microphone / line-in** | Source → *Microphone / Input* → pick the device → **Start**. |

Audio is analyzed silently (the analysis path is muted), so you won't get feedback or
echo.

**Browser support for real audio:** *Tab / system audio* sharing needs **Chrome or
Edge** — Safari and Firefox don't support sharing audio with a page. On Safari/Firefox
use **Microphone / Input** (a mic, or a loopback device like BlackHole for system
sound). The **Demo signal** works everywhere.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Freeze / resume |
| `F` | Fullscreen |
| `S` | Toggle settings |
| `Esc` | Close settings |

---

## Deploy to Vercel

It's a static site — **no build step, no backend.** Vercel serves it over HTTPS, which
is a secure context, so microphone / tab-audio capture works in production (and the
Demo signal works everywhere). A `vercel.json` is included with sensible headers.

**Option A — Vercel dashboard (no local tooling):**
1. Push this folder to a GitHub/GitLab repo (see below).
2. Go to [vercel.com](https://vercel.com) → **Add New… → Project** → import the repo.
3. **Framework Preset: Other**, **Build Command: (none)**, **Output Directory: `./`** → **Deploy**.
4. You get a public `https://<project>.vercel.app` URL.

**Option B — Vercel CLI** (needs Node.js installed):
```bash
npm i -g vercel
vercel            # from this folder — accept the defaults
vercel --prod     # promote to your production URL
```

Pushing to GitHub from this folder:
```bash
git init -b main          # already done if you cloned this
git add -A && git commit -m "NURKALYZED"
git remote add origin https://github.com/<you>/nurkalyzed.git
git push -u origin main
```

## How it works (brief)

- Capture via `getDisplayMedia` (system/tab) or `getUserMedia` (input).
- A Web Audio graph feeds `AnalyserNode`s (mono spectrum + per-channel scope/goniometer)
  and an `AudioWorklet` that measures the signal sample-accurately.
- Loudness uses a K-weighting filter chain (high-shelf + RLB high-pass) feeding the
  worklet; the main thread does the 400 ms / 3 s windows and two-stage gating for
  Integrated loudness. (It's a faithful real-time approximation of BS.1770, not a
  certified compliance meter.)
- Each visualizer is a small canvas renderer driven by one shared
  `requestAnimationFrame` loop; all knobs live in a schema-driven settings store
  (`js/settings.js`) persisted to `localStorage`.

## Project layout

```
index.html
css/styles.css
js/
  main.js              boot + render loop
  audio-engine.js      capture, analysers, loudness
  meter-processor.js   AudioWorklet (sample-accurate metering)
  settings.js          schema + reactive store + settings UI
  themes.js            appearance presets
  colormaps.js         spectrogram colormaps
  ui.js                top bar, drawer, layout, toasts
  helpers.js           DSP / drawing utilities
  visualizers/
    base.js  spectrum.js  spectrogram.js  waveform.js  meters.js  goniometer.js
```
