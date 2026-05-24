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

export function isFuelColumnExpanded(): boolean {
  return localStorage.getItem(FUEL_EXPANDED_KEY) === '1';
}

export function setFuelColumnExpanded(expanded: boolean): void {
  localStorage.setItem(FUEL_EXPANDED_KEY, expanded ? '1' : '0');
}
