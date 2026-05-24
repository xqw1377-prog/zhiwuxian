import type { DialogQuickAction, ToolLaunchOpts } from '../context/ZhiChatContext';
import type { ZhiToolId } from '../tools/zhi-tools';
import type { PushItem } from './zhi-proactive-push-api';

export function mapPushToolTabToOpen(
  toolTab?: string,
): { toolId: ZhiToolId; launch?: ToolLaunchOpts } | null {
  switch (toolTab) {
    case 'mistake':
      return { toolId: 'learning-assessment', launch: { assessmentTab: 'mistake' } };
    case 'plan':
      return { toolId: 'learning-path' };
    case 'exam':
      return { toolId: 'learning-assessment', launch: { assessmentTab: 'exam' } };
    case 'textbook':
      return { toolId: 'vision-intercept', launch: { visionTab: 'textbook' } };
    default:
      return null;
  }
}

export function buildProactivePushQuickActions(item: PushItem): DialogQuickAction[] {
  if (!item.action?.label) return [];
  const mapped = mapPushToolTabToOpen(item.action.toolTab);
  if (!mapped) {
    return [{ id: `push-${item.type}`, label: item.action.label }];
  }
  return [
    {
      id: `push-${item.type}`,
      label: item.action.label,
      openToolId: mapped.toolId,
      toolLaunch: mapped.launch,
    },
  ];
}
