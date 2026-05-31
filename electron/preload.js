/* ===================================================================
   preload.js — runs in an isolated context with access to Electron.
   We expose only a tiny, read-only flag so the renderer can tell it's
   running inside the desktop app (and behave accordingly).
   =================================================================== */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('NURK_DESKTOP', {
  isElectron: true,
  platform: process.platform, // 'darwin' | 'win32' | 'linux'
});
