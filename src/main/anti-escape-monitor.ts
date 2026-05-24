/**
 * WUXIAN 3.5 · 认知逃避判定状态机（Electron 主进程）
 * 导师工具就位后 180s 无有效撞击 + 失焦 → Warp 惩罚 + 全屏锁屏训诫
 */

/** Electron BrowserWindow 最小契约（避免根 typecheck 依赖 electron 包） */
export type MentorBrowserWindow = {
  webContents: { send: (channel: string, payload: unknown) => void };
  on: (event: 'blur', handler: () => void) => void;
  removeListener: (event: 'blur', handler: () => void) => void;
  setAlwaysOnTop: (top: boolean) => void;
  show: () => void;
  focus: () => void;
};

const ESCAPE_THRESHOLD_MS = 180_000;
const IPC_ESCAPE_WARNING = 'mentor-escape-warning';
const IPC_LOCK_INTRUSION = 'mentor-lock-intrusion';

export type AntiEscapePayload = {
  userId: string;
  missionCode: string;
  targetSchool?: string;
};

export class AntiEscapeMonitor {
  private static escapeTimer: ReturnType<typeof setTimeout> | null = null;
  private static currentUserId = '';
  private static missionCode = '';
  private static targetSchool = '';
  private static apiBase = 'http://127.0.0.1:3401';
  private static boundWindow: MentorBrowserWindow | null = null;
  private static blurHandler: (() => void) | null = null;
  private static monitoring = false;

  static isMonitoring(): boolean {
    return AntiEscapeMonitor.monitoring;
  }

  static configure(apiBase: string): void {
    AntiEscapeMonitor.apiBase = apiBase.replace(/\/$/, '');
  }

  /**
   * 导师万能框弹出、工具就位时启动防逃避死线遥测
   */
  static monitorIntrusionFocus(
    mainWindow: MentorBrowserWindow,
    userId: string,
    missionCode: string,
    targetSchool?: string,
  ): void {
    AntiEscapeMonitor.clearMonitor();
    AntiEscapeMonitor.currentUserId = userId.trim();
    AntiEscapeMonitor.missionCode = missionCode.trim() || 'OPERATION-01';
    AntiEscapeMonitor.targetSchool = targetSchool?.trim() || '';
    AntiEscapeMonitor.boundWindow = mainWindow;
    AntiEscapeMonitor.monitoring = true;

    AntiEscapeMonitor.escapeTimer = setTimeout(() => {
      void AntiEscapeMonitor.executeMentorPunishAndWakeup(mainWindow, AntiEscapeMonitor.missionCode);
    }, ESCAPE_THRESHOLD_MS);

    AntiEscapeMonitor.blurHandler = () => {
      if (!AntiEscapeMonitor.monitoring) return;
      console.warn('⚠️ [AntiEscape] 窗口失焦，疑似认知逃避');
      mainWindow.webContents.send(IPC_ESCAPE_WARNING, {
        message: '曦宝，我看到你把窗口切走了。不要在困难面前假装看不见。回到战场。',
      });
    };

    mainWindow.on('blur', AntiEscapeMonitor.blurHandler);
  }

  /** 用户完成有效撞击（投喂/歼灭）后解除监视 */
  static clearMonitor(): void {
    AntiEscapeMonitor.monitoring = false;
    if (AntiEscapeMonitor.escapeTimer) {
      clearTimeout(AntiEscapeMonitor.escapeTimer);
      AntiEscapeMonitor.escapeTimer = null;
    }
    if (AntiEscapeMonitor.boundWindow && AntiEscapeMonitor.blurHandler) {
      AntiEscapeMonitor.boundWindow.removeListener('blur', AntiEscapeMonitor.blurHandler);
    }
    AntiEscapeMonitor.blurHandler = null;
    AntiEscapeMonitor.boundWindow = null;
  }

  private static async executeMentorPunishAndWakeup(
    mainWindow: MentorBrowserWindow,
    missionCode: string,
  ): Promise<void> {
    if (!AntiEscapeMonitor.currentUserId) return;

    let remainingWarp = 0;
    let mentorWords =
      '曦宝，你已经在这个卡点前逃避了整整 3 分钟。为了惩罚你的自我麻痹，平台已代扣 10 Warp 算力燃料。听着，逃避不会让梦校录取门槛降低一分。今晚不解决这个因果漏洞，谁也不准退场。';

    try {
      const res = await fetch(`${AntiEscapeMonitor.apiBase}/api/v3.5/billing/escape-penalty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: AntiEscapeMonitor.currentUserId,
          missionCode,
        }),
      });
      const json = (await res.json()) as {
        data?: { remainingWarp?: number; mentorWords?: string; targetSchool?: string };
      };
      const data = json.data ?? json;
      remainingWarp = Number((data as { remainingWarp?: number }).remainingWarp ?? 0);
      const words = (data as { mentorWords?: string }).mentorWords;
      if (words) mentorWords = words;
      const school = (data as { targetSchool?: string }).targetSchool;
      if (school) AntiEscapeMonitor.targetSchool = school;
    } catch (err) {
      console.error('[AntiEscape] 惩罚清算 API 失败:', err);
    }

    mainWindow.setAlwaysOnTop(true);
    mainWindow.show();
    mainWindow.focus();
    setTimeout(() => mainWindow.setAlwaysOnTop(false), 800);

    mainWindow.webContents.send(IPC_LOCK_INTRUSION, {
      mentorWords,
      remainingWarp,
      missionCode,
      targetSchool: AntiEscapeMonitor.targetSchool || '梦校航道',
    });

    AntiEscapeMonitor.monitoring = false;
    if (AntiEscapeMonitor.escapeTimer) {
      clearTimeout(AntiEscapeMonitor.escapeTimer);
      AntiEscapeMonitor.escapeTimer = null;
    }
  }
}
