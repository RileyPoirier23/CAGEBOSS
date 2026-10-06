// The only bridge between the game and the desktop: quit and fullscreen.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cagebossDesktop', {
  quit: () => ipcRenderer.send('cageboss:quit'),
  setFullscreen: (on) => ipcRenderer.send('cageboss:fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('cageboss:isFullscreen'),
});
