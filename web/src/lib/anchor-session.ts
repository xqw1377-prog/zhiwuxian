import type { AnchorProfile } from '../context/ZhiDirectoryContext';

/** 是否已完成「梦校航标」目标页（本地会话标记，与云端目录数据独立） */
const KEY = 'wuxian_anchor_session_done';

/** 云端是否已有有效梦校航标（以服务端 profile 为准） */
export function hasConfiguredAnchor(profile: AnchorProfile | null | undefined): boolean {
  return Boolean(profile?.school?.trim());
}

export function isAnchorSessionDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markAnchorSessionDone(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode */
  }
}

export function clearAnchorSessionDone(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
