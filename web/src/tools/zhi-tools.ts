export type ZhiToolId =
  | 'vision-intercept'
  | 'language-coach'
  | 'video-learn'
  | 'anchor'
  | 'causal-report'
  | 'evolution-ledger'
  | 'courseware-admin'
  | 'learning-assessment'
  | 'learning-path';

export type ZhiToolDef = {
  id: ZhiToolId;
  label: string;
  description: string;
  icon: string;
};

export const ZHI_TOOLS: ZhiToolDef[] = [
  {
    id: 'vision-intercept',
    label: '摄影拦截',
    description: '拍试卷建档，或书名+出版社自动展开目录与知识点',
    icon: '📷',
  },
  {
    id: 'language-coach',
    label: '语言陪练',
    description: '梦校托福对标 · 今日口语战役 · 练完入账左侧进度',
    icon: '🎙',
  },
  {
    id: 'video-learn',
    label: '视频学习',
    description: 'AI 按知识缺口匹配优质课件 · 标签+质量 · 陪看卡点',
    icon: '▶',
  },
  {
    id: 'anchor',
    label: '梦校航标',
    description: '院校、专业、年级与入学时间',
    icon: '🎯',
  },
  {
    id: 'causal-report',
    label: '因果汇报',
    description: '完成 / 卡点 / 明日交付 — 结构化入账并修正计划',
    icon: '⚡',
  },
  {
    id: 'evolution-ledger',
    label: '进化账本',
    description: '流速、阻力与路径重算',
    icon: '📈',
  },
  {
    id: 'courseware-admin',
    label: '课件库审核',
    description: 'B 级课件人工复核，升 A 后优先匹配推荐',
    icon: '📚',
  },
  {
    id: 'learning-assessment',
    label: '学习评估',
    description: '分科试卷 · 托福雅思模考 · 每日知识点评测',
    icon: '📋',
  },
  {
    id: 'learning-path',
    label: '学习路径',
    description: '梦校时间轴 · 知识点验收 · 今日攻坚与关键考期',
    icon: '🗺',
  },
];

export function getTool(id: ZhiToolId): ZhiToolDef | undefined {
  return ZHI_TOOLS.find((t) => t.id === id);
}
