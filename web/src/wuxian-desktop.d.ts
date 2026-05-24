export interface WuxianDesktopConfig {
  userId: string;
  apiBase: string;
}

export interface AntiEscapeStartPayload {
  userId: string;
  missionCode: string;
  targetSchool?: string;
}

export interface MentorLockIpcPayload {
  mentorWords: string;
  remainingWarp: number;
  missionCode?: string;
  targetSchool?: string;
}

export interface WuxianDesktopBridge {
  onScreenshotCaptured: (callback: (base64Img: string) => void) => () => void;
  hideInterceptor: () => void;
  hideGhost?: () => void;
  wakeMentorShell?: (ensureHome?: boolean) => void;
  onGhostFrame?: (callback: (base64Img: string) => void) => () => void;
  getConfig: () => Promise<WuxianDesktopConfig>;
  startAntiEscape?: (payload: AntiEscapeStartPayload) => void;
  clearAntiEscape?: () => void;
  syncSystemLanguage?: (lang: 'zh' | 'en') => void;
  onMentorEscapeWarning?: (callback: (event: unknown, data: { message?: string }) => void) => () => void;
  onMentorLock?: (callback: (event: unknown, data: MentorLockIpcPayload) => void) => () => void;
  onMentorIntrusion?: (callback: (event: unknown, data: { payload?: string; mentorText?: string; telemetrySignal?: string; vocab?: string[] }) => void) => () => void;
}

declare global {
  interface Window {
    wuxianDesktop?: WuxianDesktopBridge;
    electronAPI?: WuxianDesktopBridge;
  }
}

export {};
