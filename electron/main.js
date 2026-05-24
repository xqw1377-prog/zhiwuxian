/**
 * WUXIAN 2.0 · Electron 桌面常驻拦截主进程
 * 全局热键 → 荧光绿浮窗 → 屏幕捕获 → IPC 推送前端
 */

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  screen,
  powerMonitor,
} = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const API_BASE = process.env.WUXIAN_API_BASE || 'http://127.0.0.1:3401';
const WEB_DEV_URL = process.env.WUXIAN_WEB_DEV_URL || 'http://localhost:5173';
const USER_ID = process.env.WUXIAN_USER_ID || 'desktop-user';
const USER_DATA_DIR = process.env.WUXIAN_ELECTRON_USER_DATA_DIR || path.join(__dirname, '..', '.cache', 'electron-user-data');

try {
  app.setPath('userData', USER_DATA_DIR);
} catch (_) {}
const { TelemetrySensor } = require('./telemetry-sensor');

let interceptWindow = null;
let mentorShellWindow = null;
let currentLang = 'zh';

function showAndFocus(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function ensureMentorHome(win) {
  if (!win || win.isDestroyed()) return;
  const navigate = () => {
    win.webContents.executeJavaScript(`window.location.hash = '';`, true).catch(() => undefined);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', navigate);
    return;
  }
  navigate();
}

function wakeMentorShell(opts) {
  if (!mentorShellWindow || mentorShellWindow.isDestroyed()) createMentorShellWindow();
  const win = mentorShellWindow;
  if (!win) return;
  interceptWindow?.hide();
  if (!opts || opts.ensureHome !== false) ensureMentorHome(win);
  showAndFocus(win);
}

function primaryShortcut() {
  return process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space';
}

function fallbackShortcut() {
  return process.platform === 'darwin' ? 'Alt+Shift+W' : 'Alt+Shift+W';
}

function createMentorShellWindow() {
  if (mentorShellWindow) return;
  mentorShellWindow = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mentorShellWindow.loadURL(WEB_DEV_URL);
  } else {
    const indexHtml = path.join(__dirname, '..', 'web', 'dist', 'index.html');
    mentorShellWindow.loadFile(indexHtml);
  }

  mentorShellWindow.on('closed', () => {
    mentorShellWindow = null;
  });
}

function createInterceptWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  interceptWindow = new BrowserWindow({
    width: 600,
    height: 180,
    x: Math.floor((width - 600) / 2),
    y: Math.floor(height * 0.25),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    interceptWindow.loadURL(`${WEB_DEV_URL}/#desktop-panel`);
  } else {
    const indexHtml = path.join(__dirname, '..', 'web', 'dist', 'index.html');
    interceptWindow.loadFile(indexHtml, { hash: '/desktop-panel' });
  }

  interceptWindow.on('blur', () => {
    interceptWindow?.hide();
  });
}

async function triggerScreenCapture() {
  if (!interceptWindow) return;
  try {
    const { width, height } = screen.getPrimaryDisplay().size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.min(width, 1080),
        height: Math.min(height, 1350),
      },
    });
    if (sources.length > 0 && sources[0].thumbnail) {
      const screenshotBase64 = sources[0].thumbnail.toDataURL();
      interceptWindow.webContents.send('WUXIAN_SCREENSHOT_CAPTURED', screenshotBase64);
    }
  } catch (err) {
    console.error('⚠️ 桌面视觉捕捉管线中断:', err);
  }
}

function toggleInterceptWindow() {
  if (!interceptWindow) return;
  if (interceptWindow.isVisible()) {
    interceptWindow.hide();
    return;
  }
  interceptWindow.show();
  interceptWindow.focus();
  void triggerScreenCapture();
}

function registerGlobalShortcuts() {
  globalShortcut.register('Alt+Shift+I', toggleInterceptWindow);
}

app.whenReady().then(() => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    wakeMentorShell({ ensureHome: true });
  });
  app.on('activate', () => {
    wakeMentorShell({ ensureHome: true });
  });
  powerMonitor.on('resume', () => {
    wakeMentorShell({ ensureHome: true });
  });

  createInterceptWindow();
  createMentorShellWindow();
  registerGlobalShortcuts();
  TelemetrySensor.startSensor(mentorShellWindow, { apiBase: API_BASE, userId: USER_ID });
  TelemetrySensor.setLanguage(currentLang);
  wakeMentorShell({ ensureHome: true });
});

ipcMain.on('WUXIAN_HIDE_INTERCEPTOR', () => {
  interceptWindow?.hide();
});

ipcMain.on('WUXIAN_WAKE_MENTOR_SHELL', (_event, payload) => {
  wakeMentorShell({ ensureHome: payload?.ensureHome !== false });
});

ipcMain.handle('WUXIAN_GET_CONFIG', () => ({
  userId: USER_ID,
  apiBase: API_BASE,
  webDevUrl: WEB_DEV_URL,
}));

ipcMain.on('sync-system-language', (_event, lang) => {
  currentLang = String(lang || '').toLowerCase() === 'en' ? 'en' : 'zh';
  TelemetrySensor.setLanguage(currentLang);
});

app.on('will-quit', () => {
  TelemetrySensor.stopSensor();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
