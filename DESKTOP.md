# NURKALYZED — Desktop app (Electron)

The desktop build wraps the same web app in [Electron](https://electronjs.org).

**Capturing your computer's output:**
- **Windows** → select **Stereo Mix / VB-Cable** (or use the screen-loopback source) — WASAPI works well here.
- **macOS** → macOS does **not** let an app read the speaker output directly, so the app
  defaults to a **device picker** (Source → *Computer Audio / Input*) and auto-selects a
  **loopback device** if one is present. To capture your output, install
  [**BlackHole**](https://existential.audio/blackhole/) (free), make a *Multi-Output Device*
  (speakers + BlackHole) in **Audio MIDI Setup**, set it as your output, then pick **BlackHole**.
  (The screen-recording loopback source exists too, but it's unreliable on unsigned builds.)

This lives on the **`desktop` branch**; `main` stays a plain static site for the web/Vercel.

## Run it locally
```bash
git checkout desktop
npm install          # installs electron + electron-builder
npm start            # launches the app
```
The desktop app opens on **Source → Computer Audio / Input**; pick your device (a loopback
device = your computer's output) and **Start**. (Demo signal works here too with no setup.)

## Build installers
```bash
npm run dist:mac     # → dist/NURKALYZED-1.0.0-arm64.dmg  (+ x64)
npm run dist:win     # → dist/NURKALYZED Setup 1.0.0.exe   (NSIS)
npm run dist         # both (only works fully on the matching OS)
```
> You generally build the macOS `.dmg` on a Mac and the Windows `.exe` on Windows (or via
> CI). GitHub Actions with a macOS + Windows matrix is the easy way to produce both.

## Shipping checklist (so users don't get scary warnings)
- **macOS:** sign + notarize with an **Apple Developer ID** ($99/yr). electron-builder
  notarizes automatically when these env vars are set:
  ```bash
  export APPLE_ID="you@example.com"
  export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
  export APPLE_TEAM_ID="XXXXXXXXXX"
  npm run dist:mac
  ```
  The app already declares the mic entitlement + usage strings (`electron/entitlements.mac.plist`,
  `package.json` → `build.mac.extendInfo`). The first system-audio capture triggers the macOS
  **Screen Recording** prompt — grant it in *System Settings › Privacy & Security › Screen
  Recording*, then reopen the app.
- **Windows:** optional **code-signing certificate** removes the SmartScreen warning. Point
  electron-builder at it via `CSC_LINK` / `CSC_KEY_PASSWORD`.
- **Auto-update:** add `electron-updater` + publish to GitHub Releases for "updates itself".

## How the system-audio capture works
`electron/main.js` registers `session.setDisplayMediaRequestHandler(...)` and answers the
renderer's `getDisplayMedia()` with `{ video: <screen>, audio: 'loopback' }`. The renderer
(your existing `js/`) is unchanged except for two no-op-on-web tweaks gated behind
`window.NURK_DESKTOP.isElectron` (set by `electron/preload.js`).
