const { desktopCapturer, screen, globalShortcut, powerMonitor, clipboard } = require('electron');
const { execFileSync } = require('child_process');

function intrusionMentorText(data) {
  if (data?.mentorText && String(data.mentorText).trim()) return String(data.mentorText).trim();
  return [data?.zhiOpening, data?.zhiTip, data?.zhiCoachNote].filter(Boolean).join('\n\n');
}

class TelemetrySensor {
  static _mainWindow = null;
  static _apiBase = 'http://127.0.0.1:3401';
  static _userId = 'desktop-user';
  static _isIntervening = false;
  static _interval = null;
  static _lastInterventionAt = 0;
  static _cooldownMs = 60 * 1000;
  static _idleThresholdSec = 300;
  static _lastIdleTriggeredAt = 0;
  static _clipboardWindowMs = 180 * 1000;
  static _clipboardThreshold = 3;
  static _clipboardSamples = [];
  static _lastClipboardText = '';
  static _lang = 'zh';
  static _lastWindowTitleAt = 0;
  static _lastWindowTitle = '';

  static startSensor(mainWindow, config) {
    this._mainWindow = mainWindow;
    this._apiBase = String(config?.apiBase || this._apiBase).replace(/\/$/, '');
    this._userId = String(config?.userId || this._userId);

    console.log('⚡ [Telemetry 3.5] OS 级行为无感遥测雷达已潜入系统底层。');
    this._registerShortcut();
    this._startPolling();
  }

  static setLanguage(lang) {
    const v = String(lang || '').toLowerCase();
    this._lang = v === 'en' ? 'en' : 'zh';
  }

  static stopSensor() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    const primary = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space';
    const fallback = 'Alt+Shift+W';
    if (globalShortcut.isRegistered(primary)) globalShortcut.unregister(primary);
    if (globalShortcut.isRegistered(fallback)) globalShortcut.unregister(fallback);
  }

  static _registerShortcut() {
    const primary = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space';
    const fallback = 'Alt+Shift+W';
    let ok = globalShortcut.register(primary, () => {
      void this._manualIntrusion();
    });
    if (!ok) {
      ok = globalShortcut.register(fallback, () => {
        void this._manualIntrusion();
      });
    }
  }

  static _startPolling() {
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(() => {
      void this._tick();
    }, 15000);
  }

  static async _tick() {
    if (!this._mainWindow || this._isIntervening) return;
    const now = Date.now();
    if (now - this._lastInterventionAt < this._cooldownMs) return;
    await this._checkIdleStall(now);
    await this._checkClipboardVocab(now);
    try {
      const activeWindowTitle = await this._getForegroundWindowTitle(now);
      const url = `${this._apiBase}/api/v3.5/zhi/intrusion`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this._userId,
          force: false,
          userFeedback: [
            '系统自动流速遥测触发',
            activeWindowTitle ? `【前台窗口】${activeWindowTitle}` : '',
          ].filter(Boolean).join('\n'),
          userText: [
            '系统自动流速遥测触发',
            activeWindowTitle ? `【前台窗口】${activeWindowTitle}` : '',
          ].filter(Boolean).join('\n'),
        }),
      });
      const json = await res.json().catch(() => null);
      const data = (json?.data ?? json) || {};
      if (!res.ok) return;
      if (!data.shouldTrigger) return;
      this._lastInterventionAt = now;

      if (String(data.activeTool || 'NONE') === 'VISION_INTERCEPT') {
        const screenshotBase64 = await this.captureCurrentScreen();
        await this.dispatchToMentor({
          type: 'VISION_INTERCEPT',
          payload: screenshotBase64,
          mentorText: intrusionMentorText(data),
          remainingWarp: data.remainingWarp,
          stage: data.stage,
          chargedWarp: data.chargedWarp,
        });
        return;
      }

      await this.dispatchToMentor({
        type: String(data.activeTool || 'NONE'),
        payload: null,
        mentorText: data.mentorText,
        remainingWarp: data.remainingWarp,
        stage: data.stage,
        chargedWarp: data.chargedWarp,
      });
    } catch (err) {
      console.error('[TelemetrySensor] tick error:', err);
    }
  }

  static async _checkIdleStall(now) {
    try {
      const idleSec = Number(powerMonitor.getSystemIdleTime?.() ?? 0);
      if (!Number.isFinite(idleSec) || idleSec < this._idleThresholdSec) return;
      if (now - this._lastIdleTriggeredAt < this._cooldownMs) return;

      this._lastIdleTriggeredAt = now;
      this._lastInterventionAt = now;

      const activeWindowTitle = await this._getForegroundWindowTitle(now);
      const screenshotBase64 = await this.captureCurrentScreen();
      const ocrText = await this._extractOcrText(screenshotBase64);
      const res = await fetch(`${this._apiBase}/api/v2/omni/intrusion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this._userId,
          force: true,
          userText:
            this._lang === 'en'
              ? [
                `[Telemetry-A] ${Math.floor(idleSec / 60)} min idle. Possible cognitive stall. Intervene now.`,
                activeWindowTitle ? `[Foreground] ${activeWindowTitle}` : '',
                ocrText ? `[OCR] ${ocrText}` : '',
              ].filter(Boolean).join('\n')
              : [
                `【遥测A】检测到全局无输入 ${Math.floor(idleSec / 60)} 分钟：疑似发呆/认知卡死。立刻介入并开启最合适工具。`,
                activeWindowTitle ? `【前台窗口】${activeWindowTitle}` : '',
                ocrText ? `【OCR】${ocrText}` : '',
              ].filter(Boolean).join('\n'),
        }),
      });
      const json = await res.json().catch(() => null);
      const data = (json?.data ?? json) || {};
      if (!res.ok) return;

      await this.dispatchToMentor({
        type: String(data.activeTool || 'VISION_INTERCEPT'),
        payload: screenshotBase64,
        activeWindowTitle,
        ocrText,
        telemetrySignal: 'FREEZE',
        mentorText:
          intrusionMentorText(data) ||
          (this._lang === 'en'
            ? '🚨 ZHI // COGNITIVE STAGNATION BLOCKED — Xibao, you have been staring at this vector for 5 minutes. Idle gaze wastes your Warp fuel. Stand up, or let me drag you into the next combat variant!'
            : '🚨 ZHI // 认知僵死判定 — 智宝，你已经盯着这个界面发呆 5 分钟了。无意识的凝视是在挥霍 Warp 燃料。起立，或者让我带你盲打下一道变式题！'),
        remainingWarp: data.remainingWarp,
        stage: data.stage,
        chargedWarp: data.chargedWarp,
      });
    } catch (err) {
      console.error('[TelemetrySensor] idle check error:', err);
    }
  }

  static _extractWordCandidates(text) {
    const t = String(text || '').trim();
    if (!t) return [];
    if (t.length > 32) return [];
    const asciiWord = t.match(/^[A-Za-z][A-Za-z\-']{1,30}$/);
    if (asciiWord) return [t.toLowerCase()];
    const zh = t.match(/^[\u4e00-\u9fa5]{2,8}$/);
    if (zh) return [t];
    return [];
  }

  static async _checkClipboardVocab(now) {
    try {
      const txt = String(clipboard.readText?.() ?? '').trim();
      if (!txt || txt === this._lastClipboardText) return;
      this._lastClipboardText = txt;

      const words = this._extractWordCandidates(txt);
      if (words.length === 0) return;

      const cutoff = now - this._clipboardWindowMs;
      this._clipboardSamples = this._clipboardSamples.filter((x) => x.ts >= cutoff);
      for (const w of words) this._clipboardSamples.push({ ts: now, w });

      const uniq = Array.from(new Set(this._clipboardSamples.map((x) => x.w)));
      if (uniq.length < this._clipboardThreshold) return;
      if (now - this._lastInterventionAt < this._cooldownMs) return;

      this._lastInterventionAt = now;
      const activeWindowTitle = await this._getForegroundWindowTitle(now);
      const res = await fetch(`${this._apiBase}/api/v2/omni/intrusion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this._userId,
          force: true,
          userText:
            this._lang === 'en'
              ? [
                `[Telemetry-B] High-frequency lookups: ${uniq.slice(0, 6).join(', ')}. Trigger active speaking drill now.`,
                activeWindowTitle ? `[Foreground] ${activeWindowTitle}` : '',
              ].filter(Boolean).join('\n')
              : [
                `【遥测B】3分钟内高频查词：${uniq.slice(0, 6).join(', ')}。立刻生成托福 T2 口语变异段落并下达盲说指令。`,
                activeWindowTitle ? `【前台窗口】${activeWindowTitle}` : '',
              ].filter(Boolean).join('\n'),
        }),
      });
      const json = await res.json().catch(() => null);
      const data = (json?.data ?? json) || {};
      if (!res.ok) return;

      await this.dispatchToMentor({
        type: String(data.activeTool || 'VISION_INTERCEPT'),
        payload: null,
        activeWindowTitle,
        telemetrySignal: 'VOCAB',
        mentorText:
          intrusionMentorText(data) ||
          (this._lang === 'en'
            ? '⚠️ COGNITIVE COMFORT-ZONE INTERCEPTED! — High-frequency word lookups detected. ZHI prohibits self-delusion via passive reading. Triggering active Shadow Sparring NOW!'
            : '⚠️ 温水煮青蛙拦截！— 检测到你高频查询了生词。ZHI 拒绝让你靠查词麻痹自己。现在，请立刻进入影子口语肉搏战！'),
        remainingWarp: data.remainingWarp,
        stage: data.stage,
        chargedWarp: data.chargedWarp,
        vocab: uniq.slice(0, 8),
      });

      this._clipboardSamples = [];
    } catch (err) {
      console.error('[TelemetrySensor] clipboard check error:', err);
    }
  }

  static async _manualIntrusion() {
    if (!this._mainWindow || this._isIntervening) return;
    this._isIntervening = true;
    try {
      const now = Date.now();
      const activeWindowTitle = await this._getForegroundWindowTitle(now);
      const screenshotBase64 = await this.captureCurrentScreen();
      const ocrText = await this._extractOcrText(screenshotBase64);
      const res = await fetch(`${this._apiBase}/api/v2/omni/intrusion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this._userId,
          force: true,
          userText: [
            'Option+Space 物理拦截触发',
            activeWindowTitle ? `【前台窗口】${activeWindowTitle}` : '',
            ocrText ? `【OCR】${ocrText}` : '',
          ].filter(Boolean).join('\n'),
        }),
      });
      const json = await res.json().catch(() => null);
      const data = (json?.data ?? json) || {};
      this._lastInterventionAt = Date.now();
      await this.dispatchToMentor({
        type: String(data.activeTool || 'VISION_INTERCEPT'),
        payload: screenshotBase64,
        activeWindowTitle,
        ocrText,
        mentorText: data.mentorText,
        remainingWarp: data.remainingWarp,
        stage: data.stage,
        chargedWarp: data.chargedWarp,
      });
    } catch (err) {
      console.error('[TelemetrySensor] manual intrusion error:', err);
    } finally {
      this._isIntervening = false;
    }
  }

  static async _getForegroundWindowTitle(now) {
    try {
      const ttlMs = 2500;
      if (now - this._lastWindowTitleAt < ttlMs && this._lastWindowTitle) return this._lastWindowTitle;
      if (process.platform !== 'win32') return '';
      const script = [
        'Add-Type @"',
        'using System;',
        'using System.Text;',
        'using System.Runtime.InteropServices;',
        'public class Win32 {',
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);',
        '}',
        '"@;',
        '$hwnd = [Win32]::GetForegroundWindow();',
        '$sb = New-Object System.Text.StringBuilder 512;',
        '[Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null;',
        '$sb.ToString()',
      ].join('\n');
      const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 800 });
      const title = String(out || '').trim().slice(0, 160);
      this._lastWindowTitleAt = now;
      this._lastWindowTitle = title;
      return title;
    } catch {
      return '';
    }
  }

  static async _extractOcrText(dataUrl) {
    const enabled = String(process.env.WUXIAN_OCR_ENABLE ?? '1').trim() !== '0';
    if (!enabled) return '';
    const img = String(dataUrl || '');
    if (!img.startsWith('data:image/')) return '';
    const maxMs = Math.max(200, Number(process.env.WUXIAN_OCR_MAX_MS ?? 2500));
    const lang = String(process.env.WUXIAN_OCR_LANG ?? 'eng').trim() || 'eng';
    try {
      const mod = await import('tesseract.js').catch(() => null);
      const createWorker = mod?.createWorker;
      if (typeof createWorker !== 'function') return '';
      const worker = await createWorker(lang);
      try {
        const ocrPromise = worker.recognize(img).then((r) => String(r?.data?.text ?? ''));
        const text = await Promise.race([
          ocrPromise,
          new Promise((resolve) => setTimeout(() => resolve(''), maxMs)),
        ]);
        const cleaned = String(text || '')
          .replace(/\s+/g, ' ')
          .replace(/[^\u4e00-\u9fa5A-Za-z0-9+\-*/=().,:;!?%\[\]{} ]/g, '')
          .trim()
          .slice(0, 420);
        return cleaned;
      } finally {
        await worker.terminate().catch(() => {});
      }
    } catch {
      return '';
    }
  }

  static async captureCurrentScreen() {
    try {
      const display = screen.getPrimaryDisplay();
      const { width, height } = display.size;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.min(width, 1080),
          height: Math.min(height, 1350),
        },
      });
      const primary = sources[0];
      if (primary && primary.thumbnail) return primary.thumbnail.toDataURL();
    } catch (err) {
      console.error('[TelemetrySensor] capture error:', err);
    }
    return null;
  }

  static async dispatchToMentor(packet) {
    if (!this._mainWindow) return;
    this._mainWindow.show();
    this._mainWindow.focus();
    this._mainWindow.webContents.send('mentor-active-intrusion', {
      ...packet,
      lang: this._lang,
      timestamp: Date.now(),
      userId: this._userId,
    });
  }
}

module.exports = {
  TelemetrySensor,
};
