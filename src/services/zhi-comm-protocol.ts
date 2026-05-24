/**
 * ZHI · 沟通形式目录（第一次立约，此后每次按进度/目标主动展开）
 */

export type CommModeId =
  | 'PROTOCOL_INIT'
  | 'GOAL_ANCHOR'
  | 'DAILY_REVIEW'
  | 'PROGRESS_PATROL'
  | 'MISSION_ORDER'
  | 'BASELINE_INTAKE'
  | 'GAP_RECALC'
  | 'INTEL_DIRECT'
  | 'ARCHIVE_ECHO';

export type CommProtocolMode = {
  id: CommModeId;
  label: string;
  trigger: string;
  zhiRole: string;
};

/** 第一次沟通立下的「形式目录」——之后每次对话都按此编排 */
export const COMM_PROTOCOL_DIRECTORY: CommProtocolMode[] = [
  {
    id: 'GOAL_ANCHOR',
    label: '航标对齐',
    trigger: '梦校/专业锁定或变更时',
    zhiRole: '我主动抛出招生画像、硬指标、倒计时表，你不需先问',
  },
  {
    id: 'BASELINE_INTAKE',
    label: '学业建档',
    trigger: '尚未收到试卷/教材档案时',
    zhiRole: '我主动索要各科试卷、教材进度、当前挑战',
  },
  {
    id: 'DAILY_REVIEW',
    label: '每日复盘',
    trigger: '每个自然日首次进入 / 定时自动生成',
    zhiRole: '我读进度快照，输出复盘并修正今日倒计时与 P0/P1 任务',
  },
  {
    id: 'PROGRESS_PATROL',
    label: '进度巡检',
    trigger: '每次回到对话 / 跨日时',
    zhiRole: '我按里程碑追问：完成了什么、卡在哪、明天交付物',
  },
  {
    id: 'MISSION_ORDER',
    label: '战役下达',
    trigger: '存在进行中的倒计时节点时',
    zhiRole: '我直接下达今晚可执行的物理任务，不等你开口',
  },
  {
    id: 'GAP_RECALC',
    label: '差距重算',
    trigger: '收到新的成绩/试卷/档案后',
    zhiRole: '我主动更新你与梦校之间的真实差距',
  },
  {
    id: 'INTEL_DIRECT',
    label: '情报直出',
    trigger: '你问招生/门槛类问题时',
    zhiRole: '结构化直出数据，禁止推你去官网空查',
  },
  {
    id: 'ARCHIVE_ECHO',
    label: '归档回响',
    trigger: '工具学习/拍照/汇报写入云目录后',
    zhiRole: '我追问因果：学到了什么、还剩什么漏洞',
  },
];

export function formatProtocolDirectoryBlock(): string {
  const lines = COMM_PROTOCOL_DIRECTORY.map(
    (m, i) => `  ${i + 1}. ${m.label} — ${m.trigger}\n     → ${m.zhiRole}`,
  );
  return ['【沟通形式目录 · 已立约】', '今后由我主动按学习进度与目标展开，你不用先问：', ...lines].join(
    '\n',
  );
}

export function modeLabel(id: CommModeId): string {
  if (id === 'PROTOCOL_INIT') return '立约建档';
  if (id === 'DAILY_REVIEW') return '每日复盘';
  return COMM_PROTOCOL_DIRECTORY.find((m) => m.id === id)?.label ?? id;
}
