/**
 * WUXIAN 2.0 / 3.5 · Electron 桌面常驻拦截 + 防逃避状态机
 */

import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, powerMonitor } from 'electron';
import path from 'path';
import { AntiEscapeMonitor } from '../src/main/anti-escape-monitor';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const API_BASE = process.env.WUXIAN_API_BASE || 'http://127.0.0.1:3401';
const WEB_DEV_URL = process.env.WUXIAN_WEB_DEV_URL || 'http://localhost:5173';
const USER_ID = process.env.WUXIAN_USER_ID || 'desktop-user';
const USER_DATA_DIR =
  process.env.WUXIAN_ELECTRON_USER_DATA_DIR
  || path.join(__dirname, '..', '.cache', 'electron-user-data');

try {
  app.setPath('userData', USER_DATA_DIR);
} catch (_) {}

let interceptWindow: BrowserWindow | null = null;
let ghostWindow: BrowserWindow | null = null;
let mentorShellWindow: BrowserWindow | null = null;

function showAndFocus(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function ensureMentorHome(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const navigate = () => {
    void win.webContents.executeJavaScript(
      `window.location.hash = ''; window.dispatchEvent(new CustomEvent('wuxian:hide-overlays')); window.dispatchEvent(new CustomEvent('wuxian:enter-cockpit'));`,
      true,
    ).catch(() => undefined);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', navigate);
    return;
  }
  navigate();
}

function primaryShortcut(): string {
  return process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space';
}

function fallbackShortcut(): string {
  return 'Alt+Shift+W';
}

function createMentorShellWindow(): void {
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
    void mentorShellWindow.loadURL(WEB_DEV_URL);
  } else {
    const indexHtml = path.join(__dirname, '..', 'web', 'dist', 'index.html');
    void mentorShellWindow.loadFile(indexHtml);
  }

  mentorShellWindow.on('closed', () => {
    mentorShellWindow = null;
  });
}

function mentorTargetWindow(): BrowserWindow | null {
  if (!mentorShellWindow || mentorShellWindow.isDestroyed()) {
    createMentorShellWindow();
  }
  return mentorShellWindow;
}

function wakeMentorShell(opts?: { ensureHome?: boolean }): void {
  const win = mentorTargetWindow();
  if (!win) return;
  interceptWindow?.hide();
  ghostWindow?.hide();
  if (opts?.ensureHome !== false) ensureMentorHome(win);
  showAndFocus(win);
}

function createInterceptWindow(): void {
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
    void interceptWindow.loadURL(`${WEB_DEV_URL}/#desktop-panel`);
  } else {
    const indexHtml = path.join(__dirname, '..', 'web', 'dist', 'index.html');
    void interceptWindow.loadFile(indexHtml, { hash: '/desktop-panel' });
  }

  interceptWindow.on('blur', () => {
    if (AntiEscapeMonitor.isMonitoring()) return;
    interceptWindow?.hide();
  });
}

async function triggerScreenCapture(): Promise<void> {
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
    const primary = sources[0];
    if (primary?.thumbnail) {
      const screenshotBase64 = primary.thumbnail.toDataURL();
      interceptWindow.webContents.send('WUXIAN_SCREENSHOT_CAPTURED', screenshotBase64);
    }
  } catch (err) {
    console.error('⚠️ 桌面视觉捕捉管线中断:', err);
  }
}

function toggleInterceptWindow(): void {
  if (!interceptWindow) return;
  if (interceptWindow.isVisible()) {
    interceptWindow.hide();
    return;
  }
  interceptWindow.show();
  interceptWindow.focus();
  void triggerScreenCapture();
}

function createGhostWindow(): void {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  ghostWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    focusable: true,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void ghostWindow.loadURL(`${WEB_DEV_URL}/#ghost-capture`);
  } else {
    const indexHtml = path.join(__dirname, '..', 'web', 'dist', 'index.html');
    void ghostWindow.loadFile(indexHtml, { hash: '/ghost-capture' });
  }

  ghostWindow.on('closed', () => {
    ghostWindow = null;
  });
}

async function triggerGhostCapture(): Promise<void> {
  if (!ghostWindow) return;
  try {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.min(width, 1920),
        height: Math.min(height, 1200),
      },
    });
    const primary = sources[0];
    if (primary?.thumbnail) {
      ghostWindow.webContents.send('WUXIAN_GHOST_FRAME', primary.thumbnail.toDataURL());
    }
  } catch (err) {
    console.error('⚠️ Ghost 盲投截屏失败:', err);
  }
}

function toggleGhostWindow(): void {
  if (!ghostWindow) return;
  if (ghostWindow.isVisible()) {
    ghostWindow.hide();
    return;
  }
  ghostWindow.show();
  ghostWindow.focus();
  void triggerGhostCapture();
}

function registerGlobalShortcuts(): void {
  const primary = primaryShortcut();
  let registered = globalShortcut.register(primary, toggleGhostWindow);
  if (!registered) {
    const fallback = fallbackShortcut();
    console.warn(`⚠️ 热键 ${primary} 冲突，尝试 ${fallback}`);
    registered = globalShortcut.register(fallback, toggleGhostWindow);
  }
  globalShortcut.register('Alt+Shift+I', toggleInterceptWindow);
  if (registered) {
    console.log(`➡️ [WUXIAN Desktop] Ghost 盲投热键就绪 (${primary})`);
  } else {
    console.warn('⚠️ 全局量子热键注册失败');
  }
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

  AntiEscapeMonitor.configure(API_BASE);
  createInterceptWindow();
  createGhostWindow();
  createMentorShellWindow();
  registerGlobalShortcuts();

  if (process.env.WUXIAN_SHOW_MENTOR_SHELL === '1') {
    mentorShellWindow?.show();
  }
});

ipcMain.on('WUXIAN_HIDE_INTERCEPTOR', () => {
  if (!AntiEscapeMonitor.isMonitoring()) {
    interceptWindow?.hide();
  }
});

ipcMain.on('WUXIAN_HIDE_GHOST', () => {
  ghostWindow?.hide();
});

ipcMain.on('WUXIAN_WAKE_MENTOR_SHELL', (_event, payload?: { ensureHome?: boolean }) => {
  wakeMentorShell({ ensureHome: payload?.ensureHome !== false });
});

ipcMain.handle('WUXIAN_GET_CONFIG', () => ({
  userId: USER_ID,
  apiBase: API_BASE,
}));

ipcMain.on(
  'WUXIAN_MENTOR_INTRUSION_START',
  (_event, payload: { userId?: string; missionCode?: string; targetSchool?: string }) => {
    const win = mentorTargetWindow();
    if (!win) return;
    const userId = String(payload?.userId ?? USER_ID).trim();
    const missionCode = String(payload?.missionCode ?? 'OPERATION-01').trim();
    AntiEscapeMonitor.monitorIntrusionFocus(win, userId, missionCode, payload?.targetSchool);
    ensureMentorHome(win);
    showAndFocus(win);
  },
);

ipcMain.on('WUXIAN_MENTOR_INTRUSION_CLEAR', () => {
  AntiEscapeMonitor.clearMonitor();
});

app.on('will-quit', () => {
  AntiEscapeMonitor.clearMonitor();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
