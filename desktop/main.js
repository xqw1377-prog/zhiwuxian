/**
 * WUXIAN 2.0 · Electron 桌面外壳
 * 全局快捷键 → 屏幕帧 + 活动窗口信息 → /api/v2/desktop/capture
 */

const {
  app,
  BrowserWindow,
  globalShortcut,
  desktopCapturer,
  screen,
  ipcMain,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const API_BASE = process.env.WUXIAN_API_BASE || 'http://127.0.0.1:3401';
const USER_ID = process.env.WUXIAN_USER_ID || 'desktop-user';

let trayWindow = null;

function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: 360,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  trayWindow.loadFile(path.join(__dirname, 'overlay.html'));
}

function registerShortcuts() {
  const accel = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Shift+W';
  const ok = globalShortcut.register(accel, () => {
    void captureAndAssimilate();
  });
  if (!ok) {
    console.warn(`[WUXIAN Desktop] 快捷键注册失败: ${accel}`);
  } else {
    console.log(`[WUXIAN Desktop] 已绑定 ${accel} → 零跳出同化`);
  }
}

async function captureScreenPng() {
  const { width, height } = screen.getPrimaryDisplay().size;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, Math.min(width, 1920), height: Math.min(height, 1080) },
  });
  const primary = sources[0];
  if (!primary?.thumbnail) throw new Error('无法抓取屏幕帧');
  return primary.thumbnail.toPNG();
}

function postDesktopCapture(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(`${API_BASE}/api/v2/desktop/capture`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function captureAndAssimilate() {
  try {
    if (trayWindow) {
      trayWindow.showInactive();
      trayWindow.webContents.send('status', '正在折叠当前屏幕…');
    }

    const png = await captureScreenPng();
    const tmp = path.join(app.getPath('temp'), `wuxian-capture-${Date.now()}.png`);
    fs.writeFileSync(tmp, png);

    const activeUrl = process.env.WUXIAN_ACTIVE_URL || '';

    const json = await postDesktopCapture({
      userId: USER_ID,
      activeWindowUrl: activeUrl,
      caption: '桌面全局快捷键捕获 · 屏幕帧已摄入同化管线',
      fatigueLevel: 0.25,
    });

    if (trayWindow) {
      trayWindow.webContents.send('status', json?.data?.assimilate?.companionSpeech ?? '同化完成');
      setTimeout(() => trayWindow?.hide(), 2400);
    }
    console.log('[WUXIAN Desktop] capture ok', json?.data?.assimilate?.cardUrl ?? '');
  } catch (err) {
    console.error('[WUXIAN Desktop] capture failed', err);
    if (trayWindow) {
      trayWindow.webContents.send('status', '捕获失败 · 请确认后端已启动');
    }
  }
}

app.whenReady().then(() => {
  createTrayWindow();
  registerShortcuts();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
