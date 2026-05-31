/* ===================================================================
   preload.js — isolated bridge to the renderer.
   Exposes the desktop flag + the loopback enable/disable IPC that
   electron-audio-loopback's initMain() registers in the main process.
   (Works under sandbox:true — contextBridge/ipcRenderer are available.)
   =================================================================== */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('NURK_DESKTOP', {
  isElectron: true,
  platform: process.platform, // 'darwin' | 'win32' | 'linux'
  enableLoopbackAudio: () => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),
});
