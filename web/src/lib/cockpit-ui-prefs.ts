const FUEL_EXPANDED_KEY = 'wuxian_fuel_expanded';

/** 宽屏桌面才默认展开右侧成长栏；平板优先留给对话区 */
export function isWideDesktopLayout(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1280px)').matches;
}

export function defaultFuelExpandedForLayout(): boolean {
  if (!isWideDesktopLayout()) return false;
  return isFuelColumnExpanded();
}

function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(key, value);
  } catch {
    return;
  }
}

export function isFuelColumnExpanded(): boolean {
  return safeGetLocalStorage(FUEL_EXPANDED_KEY) === '1';
}

export function setFuelColumnExpanded(expanded: boolean): void {
  safeSetLocalStorage(FUEL_EXPANDED_KEY, expanded ? '1' : '0');
}
