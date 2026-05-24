const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  onScreenshotCaptured: (callback) => {
    const handler = (_event, base64Img) => callback(base64Img);
    ipcRenderer.on('WUXIAN_SCREENSHOT_CAPTURED', handler);
    return () => ipcRenderer.removeListener('WUXIAN_SCREENSHOT_CAPTURED', handler);
  },
  onMentorIntrusion: (callback) => {
    const handler = (_event, data) => callback(_event, data);
    ipcRenderer.on('mentor-active-intrusion', handler);
    return () => ipcRenderer.removeListener('mentor-active-intrusion', handler);
  },
  hideInterceptor: () => ipcRenderer.send('WUXIAN_HIDE_INTERCEPTOR'),
  hideGhost: () => ipcRenderer.send('WUXIAN_HIDE_GHOST'),
  wakeMentorShell: (ensureHome = true) => ipcRenderer.send('WUXIAN_WAKE_MENTOR_SHELL', { ensureHome }),
  onGhostFrame: (callback) => {
    const handler = (_event, base64Img) => callback(base64Img);
    ipcRenderer.on('WUXIAN_GHOST_FRAME', handler);
    return () => ipcRenderer.removeListener('WUXIAN_GHOST_FRAME', handler);
  },
  getConfig: () => ipcRenderer.invoke('WUXIAN_GET_CONFIG'),
  startAntiEscape: (payload) => ipcRenderer.send('WUXIAN_MENTOR_INTRUSION_START', payload),
  clearAntiEscape: () => ipcRenderer.send('WUXIAN_MENTOR_INTRUSION_CLEAR'),
  onMentorEscapeWarning: (callback) => {
    const handler = (_event, data) => callback(_event, data);
    ipcRenderer.on('mentor-escape-warning', handler);
    return () => ipcRenderer.removeListener('mentor-escape-warning', handler);
  },
  onMentorLock: (callback) => {
    const handler = (_event, data) => callback(_event, data);
    ipcRenderer.on('mentor-lock-intrusion', handler);
    return () => ipcRenderer.removeListener('mentor-lock-intrusion', handler);
  },
  syncSystemLanguage: (lang) => ipcRenderer.send('sync-system-language', lang),
};

contextBridge.exposeInMainWorld('wuxianDesktop', bridge);
contextBridge.exposeInMainWorld('electronAPI', bridge);
