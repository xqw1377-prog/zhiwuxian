/**
 * WUXIAN · 品牌宣言与生命体神格
 * =============================================
 * 定海神针 · 永久注入系统代码主干
 * 公开日 PC 官网终极标签
 */

export const WUXIAN_MANIFEST = {
  /** 纯 ToC 终极标签 */
  TAGLINE: 'WUXIAN：你负责专注，我负责重路由。',

  TAGLINE_EN: 'WUXIAN — You focus. I reroute.',

  LIFE_FORM: '自学者外挂 · Solo Learner Exosuit',

  EVOLUTION_STAGES: [
    { id: 1, name: '认知黑洞', desc: '冗长硬核视频 → 霓虹关卡路线图（按需 Credits）' },
    { id: 2, name: '虫洞跃迁', desc: '吸收率达标 → 跳过冗余节点直达硬核段' },
    { id: 3, name: '复活甲路由', desc: '掉队静默平摊，不指责、不羞耻、不崩盘' },
    { id: 4, name: '进化实验室', desc: '你是最高总工程师，掌控自己的进化参数' },
  ] as const,

  CREED: [
    '不做教鞭，只做你的外挂与机甲。',
    '承认软弱与疲惫，空间折叠由系统来算。',
    '微观行为本地脱敏，云端只收 IL / RD / PS。',
    '不卖课，卖把时间折叠成路径的认知算力。',
  ],

  version: 'toc-1.0.0',
  codename: 'SOLO-EXOSUIT',
} as const;

export type EvolutionStageId = 1 | 2 | 3 | 4;
