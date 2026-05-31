/* ===================================================================
   NURKALYZED — Electron main process.

   The whole point of the desktop build: capture the computer's *internal*
   audio without a loopback device like BlackHole. We do that by handling
   the renderer's getDisplayMedia() request ourselves and attaching the
   system audio loopback:

     • Windows           → WASAPI loopback
     • macOS 13+ (Ventura) → ScreenCaptureKit loopback
       (needs Screen Recording permission, granted once in System Settings)

   The renderer is your existing web app, unchanged.
   =================================================================== */

const { app, BrowserWindow, session, desktopCapturer, systemPreferences, Menu } = require('electron');
const path = require('path');

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

  // Feed system-audio loopback into the renderer's getDisplayMedia() call.
  // `audio: 'loopback'` = whatever the speakers are playing.
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
        .catch(() => callback({})); // user/OS denied — renderer gets an empty stream
    },
    { useSystemPicker: false }
  );

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  // Pre-warm the microphone permission prompt on macOS for the "Microphone" source.
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
