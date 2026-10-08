// The only bridge between the game and the desktop: quit, fullscreen, save files and Steam.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cagebossDesktop', {
  quit: () => ipcRenderer.send('cageboss:quit'),
  setFullscreen: (on) => ipcRenderer.send('cageboss:fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('cageboss:isFullscreen'),
  // saves mirrored as files in the user-data folder (Steam Auto-Cloud syncs that folder)
  files: {
    readAll: () => ipcRenderer.sendSync('cageboss:files:readAll'),
    write: (key, value) => ipcRenderer.send('cageboss:files:write', String(key), String(value)),
    remove: (key) => ipcRenderer.send('cageboss:files:remove', String(key)),
  },
  achievement: (id) => ipcRenderer.send('cageboss:achievement', String(id)),
});
