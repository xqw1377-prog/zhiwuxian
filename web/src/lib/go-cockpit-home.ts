import {
  closeToolViaEvent,
  emitDirectoryWorkspaceRefresh,
  emitHideOverlays,
  emitShowAnchor,
  emitWuxianEventUntyped,
  openToolViaEvent,
  type ShowAnchorDetail,
  WUXIAN_EVENTS,
} from './wuxian-events';

/** 打开梦校航标：edit=true 直接展开表单；edit=false 且已设定则先看摘要 */
export function goAnchorPage(opts?: ShowAnchorDetail): void {
  const edit = opts?.edit === true;
  openToolViaEvent('anchor', { silent: true, anchorEdit: edit });
  queueMicrotask(() => emitShowAnchor(opts));
}

/** 进入主驾驶舱；仅在校准完成后调用，避免跳过目标页 */
export function goCockpitHome(
  activeDirectoryId?: string,
  opts?: { collapseCloud?: boolean },
): void {
  window.location.hash = '';

  closeToolViaEvent();
  emitHideOverlays();

  window.wuxianDesktop?.wakeMentorShell?.(true);
  window.electronAPI?.wakeMentorShell?.(true);

  emitDirectoryWorkspaceRefresh(activeDirectoryId);

  if (opts?.collapseCloud !== false) {
    emitWuxianEventUntyped(WUXIAN_EVENTS.enterCockpit);
  }

  const scrollHome = () => {
    document.querySelector('[data-cockpit-home]')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };
  // 等 OmniCockpit 收起全屏遮罩后再滚动，否则仍停在目标页层
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(scrollHome);
  });
}
