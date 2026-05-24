import type { AnchorProfile, DirectoryItem } from '../context/ZhiDirectoryContext';
import type { ZhiToolId } from '../tools/zhi-tools';

export type QuickAction = {
  id: string;
  label: string;
  toolId?: ZhiToolId;
  /** 触发系统选图（摄影拦截） */
  pickImage?: boolean;
};

export function buildQuickActions(
  anchor: AnchorProfile | null,
  focus: DirectoryItem | null,
): QuickAction[] {
  const title = focus?.title ?? '';
  const actions: QuickAction[] = [];

  if (!anchor) {
    actions.push({ id: 'anchor', label: '🎯 设定梦校航标', toolId: 'anchor' });
    actions.push({ id: 'assessment', label: '🧪 摸底评估', toolId: 'learning-assessment' });
  } else {
    actions.push({ id: 'anchor-edit', label: '✏️ 更改梦校航标', toolId: 'anchor' });
    actions.push({ id: 'starter', label: '🚀 从短板开始', toolId: 'vision-intercept', pickImage: true });
    actions.push({ id: 'assessment', label: '🧪 摸底评估', toolId: 'learning-assessment' });
  }

  actions.push({ id: 'vision', label: '📷 上传试卷/作业', toolId: 'vision-intercept', pickImage: true });
  actions.push({ id: 'language', label: '🎙 45s 口语', toolId: 'language-coach' });
  actions.push({ id: 'video', label: '▶ 视频学习', toolId: 'video-learn' });

  if (title.includes('文书') || title.includes('ESSAY') || focus?.type === 'STRATEGIC_GOAL') {
    actions.push({ id: 'essay', label: '✍️ 文书舱', toolId: 'anchor' });
  }
  if (title.includes('错题') || focus?.type === 'ERROR_BANK') {
    actions.push({ id: 'error', label: '🔥 错题熔炉', pickImage: true });
  }
  if (title.includes('材料') || title.includes('MATERIAL')) {
    actions.push({ id: 'material', label: '📎 上传材料', pickImage: true });
  }

  actions.push({ id: 'report', label: '⚡ 因果汇报', toolId: 'causal-report' });

  return actions.slice(0, 6);
}
