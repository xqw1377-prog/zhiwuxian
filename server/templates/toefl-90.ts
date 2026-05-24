export const TOEFL_90_TEMPLATE = {
  templateId: 'TOEFL_90_PRO',
  sceneName: '🚀 90天托福极限破百战略舱',
  days: 90,
  initialSlopeFactor: 1.3,
  stages: [
    { dayRange: [1, 30] as [number, number], name: '词汇囚笼与听力残影重构', baseEnergy: 10 },
    { dayRange: [31, 60] as [number, number], name: '阅读长难句坍缩与口语语流肉搏', baseEnergy: 15 },
    { dayRange: [61, 90] as [number, number], name: '全真模考断层扫描与复活甲冲刺', baseEnergy: 20 },
  ],
  seedTasks: (title: string, slope: number) => ([
    { content: `[TOEFL] 词汇囚笼破拆：用你刚查的 3 个词造 3 句因果句`, cost: Math.max(6, slope * 0.8) },
    { content: `[TOEFL] 听力残影：TPO Lecture 片段 10 分钟，强制复述 30 秒`, cost: Math.max(8, slope) },
    { content: `[TOEFL] 口语肉搏：独立口语 45 秒极限输出（只求清晰，不求完美）`, cost: Math.max(6, slope * 0.75) },
    { content: `[复盘] 标记你今天最想逃避的 1 个卡点（写出来）`, cost: Math.max(4, slope * 0.5) },
    { content: `[复活甲] 只做 5 分钟影子跟读，完成即算回流`, cost: Math.max(3, slope * 0.4) },
  ].slice(0, 3)),
} as const;

