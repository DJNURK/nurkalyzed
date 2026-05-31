# NURKALYZED — Desktop app (Electron)

The desktop build wraps the same web app in [Electron](https://electronjs.org) and captures
your computer's **internal audio natively — no BlackHole, no Screen-Recording** — via
[`electron-audio-loopback`](https://github.com/alectrocute/electron-audio-loopback), which
drives Electron's built-in loopback:

- **macOS 14.4+** → **Core Audio process tap** (`forceCoreAudioTap`) — the same mechanism
  miniMeters uses. macOS may prompt for audio permission once.
- **Windows** → **WASAPI loopback**.

Open the app → **Source → System Audio (internal)** is the default → press **Start**. A
device picker (*Microphone / Input*, auto-selecting any loopback device) and the **Demo
signal** are also available.

> **Permissions note:** these OS audio permissions are tied to the app's code signature. On
> an **unsigned** build (our default CI output) macOS may not persist the grant reliably —
> sign + notarize (Apple Developer ID) for a seamless, miniMeters-like experience.

This lives on the **`desktop` branch**; `main` stays a plain static site for the web/Vercel.

## Run it locally
```bash
git checkout desktop
npm install          # installs electron + electron-builder
npm start            # launches the app
```
The desktop app opens on **Source → System Audio (internal)** — just press **Start** to
analyze whatever your computer is playing. (Device picker and Demo signal are also there.)

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
