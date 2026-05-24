const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wuxianDesktop', {
  onStatus: (cb) => ipcRenderer.on('status', (_e, msg) => cb(msg)),
});
