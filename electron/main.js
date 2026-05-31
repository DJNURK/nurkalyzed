/* ===================================================================
   NURKALYZED — Electron main process.

   System-audio capture (no BlackHole, no Screen Recording) is provided by
   `electron-audio-loopback`, which drives Electron's native loopback:
     • macOS 14.4+  → Core Audio process tap   (forceCoreAudioTap)
     • Windows      → WASAPI loopback
   initMain() must run before the app is ready (it sets the needed flags).
   The renderer enables loopback over IPC, then calls getDisplayMedia().
   =================================================================== */

const { app, BrowserWindow, Menu, systemPreferences } = require('electron');
const { initMain } = require('electron-audio-loopback');
const path = require('path');

// Force the Core Audio tap path on macOS so system audio works without a
// loopback device or Screen-Recording permission. Must precede app "ready".
initMain({ forceCoreAudioTap: true });

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0a0c12',
    title: 'NURKALYZED',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  // Pre-warm the macOS audio permission prompt (input devices + tap).
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Minimal native menu (keeps standard shortcuts: copy, quit, fullscreen, devtools).
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { role: 'windowMenu' },
  ])
);
