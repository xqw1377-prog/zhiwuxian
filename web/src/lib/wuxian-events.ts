/**
 * WUXIAN 前端跨模块事件（阶段 C 统一入口）
 * 使用 CustomEvent，保持与既有监听器兼容。
 */

import type { ZhiToolId } from '../tools/zhi-tools';

export const WUXIAN_EVENTS = {
  directoriesRefresh: 'wuxian:directories-refresh',
  directoryWorkspaceRefresh: 'wuxian:directory-workspace-refresh',
  openTool: 'wuxian:open-tool',
  anchorBrief: 'wuxian:anchor-brief',
  proactiveBrief: 'wuxian:proactive-brief',
  dailyReview: 'wuxian:daily-review',
  textbookFocus: 'wuxian:textbook-focus',
  textbookUpdated: 'wuxian:textbook-updated',
  coursewarePrefill: 'wuxian:courseware-prefill',
  enterCockpit: 'wuxian:enter-cockpit',
  showAnchor: 'wuxian:show-anchor',
  closeTool: 'wuxian:close-tool',
  hideOverlays: 'wuxian:hide-overlays',
  pickImage: 'wuxian:pick-image',
  langChanged: 'wuxian:lang-changed',
  walletBump: 'wuxian:destiny-collapse',
  ghostTopology: 'wuxian:ghost-topology',
  examShadow: 'wuxian:exam-shadow',
  visionIntakePreview: 'wuxian:vision-intake-preview',
  videoLearnStart: 'wuxian:video-learn-start',
  focusComposer: 'wuxian:focus-composer',
  mentorLock: 'wuxian:mentor-lock',
  mentorEscapeWarning: 'wuxian:mentor-escape-warning',
  assessmentReady: 'wuxian:assessment-ready',
} as const;

export type AssessmentReadyDetail = {
  paperId: string;
  title: string;
  subjectId?: string;
  assessmentMode?: 'active' | 'passive';
  activeIntro?: string;
  questionCount?: number;
};

/** 钱包/模考等触发 Fuel 列刷新的别名事件 */
export const WUXIAN_WALLET_BUMP_EVENTS = [
  WUXIAN_EVENTS.walletBump,
  WUXIAN_EVENTS.ghostTopology,
  WUXIAN_EVENTS.examShadow,
] as const;

export type WuxianEventName = (typeof WUXIAN_EVENTS)[keyof typeof WUXIAN_EVENTS];

export type DirectoriesRefreshDetail = { activeDirectoryId?: string };
export type DirectoryWorkspaceRefreshDetail = { directoryId?: string };
export type OpenToolDetail = { toolId?: ZhiToolId; silent?: boolean; anchorEdit?: boolean };
export type LangChangedDetail = { lang: string };
export type ShowAnchorDetail = { edit?: boolean };

export type WuxianEventDetailMap = {
  [WUXIAN_EVENTS.directoriesRefresh]: DirectoriesRefreshDetail;
  [WUXIAN_EVENTS.directoryWorkspaceRefresh]: DirectoryWorkspaceRefreshDetail;
  [WUXIAN_EVENTS.openTool]: OpenToolDetail;
  [WUXIAN_EVENTS.langChanged]: LangChangedDetail;
  [WUXIAN_EVENTS.showAnchor]: ShowAnchorDetail;
  [WUXIAN_EVENTS.assessmentReady]: AssessmentReadyDetail;
  [WUXIAN_EVENTS.anchorBrief]: Record<string, unknown>;
  [WUXIAN_EVENTS.proactiveBrief]: Record<string, unknown>;
  [WUXIAN_EVENTS.dailyReview]: Record<string, unknown>;
};

export function emitWuxianEvent<K extends keyof WuxianEventDetailMap>(
  name: K,
  detail?: WuxianEventDetailMap[K],
): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function emitWuxianEventUntyped(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function onWuxianEvent<K extends keyof WuxianEventDetailMap>(
  name: K,
  handler: (detail: WuxianEventDetailMap[K]) => void,
): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<WuxianEventDetailMap[K]>).detail ?? ({} as WuxianEventDetailMap[K]));
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

export function onWuxianEventUntyped(
  name: string,
  handler: (detail: unknown) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

/** 刷新侧栏目录计数 + 中央作战区 */
export function emitDirectoryWorkspaceRefresh(directoryId?: string): void {
  emitWuxianEvent(WUXIAN_EVENTS.directoriesRefresh, {
    activeDirectoryId: directoryId,
  });
  emitWuxianEvent(WUXIAN_EVENTS.directoryWorkspaceRefresh, { directoryId });
}

export function openToolViaEvent(
  toolId: ZhiToolId,
  opts?: { silent?: boolean; anchorEdit?: boolean },
): void {
  emitWuxianEvent(WUXIAN_EVENTS.openTool, {
    toolId,
    silent: opts?.silent,
    anchorEdit: opts?.anchorEdit,
  });
}

export function closeToolViaEvent(): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.closeTool);
}

export function emitShowAnchor(detail?: ShowAnchorDetail): void {
  emitWuxianEvent(WUXIAN_EVENTS.showAnchor, detail ?? {});
}

/** 订阅多个事件，返回统一取消函数 */
export function onWuxianEventsUntyped(
  names: readonly string[],
  handler: (detail: unknown, eventName: string) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail, e.type);
  for (const name of names) window.addEventListener(name, listener);
  return () => {
    for (const name of names) window.removeEventListener(name, listener);
  };
}

export function onWalletBump(handler: () => void): () => void {
  return onWuxianEventsUntyped(WUXIAN_WALLET_BUMP_EVENTS, () => handler());
}

export function emitWalletBump(detail?: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.walletBump, detail);
}

/** 学习进度仪表盘刷新（目录/航标/复盘/教材） */
export const WUXIAN_PROGRESS_REFRESH_EVENTS = [
  WUXIAN_EVENTS.directoriesRefresh,
  WUXIAN_EVENTS.anchorBrief,
  WUXIAN_EVENTS.proactiveBrief,
  WUXIAN_EVENTS.dailyReview,
  WUXIAN_EVENTS.textbookUpdated,
  WUXIAN_EVENTS.assessmentReady,
] as const;

export function onProgressRefresh(handler: () => void): () => void {
  return onWuxianEventsUntyped(WUXIAN_PROGRESS_REFRESH_EVENTS, () => handler());
}

export function emitPickImage(): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.pickImage);
}

export function emitAnchorBrief(detail: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.anchorBrief, detail);
}

export function emitProactiveBrief(detail: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.proactiveBrief, detail);
}

export function emitDailyReview(detail: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.dailyReview, detail);
}

export function emitAssessmentReady(detail: AssessmentReadyDetail): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.assessmentReady, detail);
}

export function emitVisionIntakePreview(detail: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.visionIntakePreview, detail);
}

export function emitGhostTopology(detail?: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.ghostTopology, detail);
}

export function emitExamShadow(detail?: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.examShadow, detail);
}

export function emitFocusComposer(): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.focusComposer);
}

export function emitHideOverlays(): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.hideOverlays);
}

export function emitMentorLock(detail: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.mentorLock, detail);
}

export function emitMentorEscapeWarning(detail: unknown): void {
  emitWuxianEventUntyped(WUXIAN_EVENTS.mentorEscapeWarning, detail);
}
