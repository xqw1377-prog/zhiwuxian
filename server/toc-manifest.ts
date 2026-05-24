/**
 * WUXIAN · 纯 ToC 产品宣言
 * 铁板钉钉：站在学习者这边，不做教鞭，只做外挂与机甲
 */

export const TOC_MANIFEST = {
  positioning: 'PURE_TOC',
  tagline: '你负责专注，我负责重路由',
  subline: '市面上的产品逼你成为自律机器；WUXIAN 承认你的软弱、疲惫与直觉。',
  creed: [
    '不做教鞭，只做你的外挂与机甲。',
    '掉队不指责，路径静默重算，绝不让你产生挫败感。',
    '微观行为在本地脱敏，云端只收 IL / RD / PS 三个抽象指标。',
    '不卖课，卖认知算力——把时间折叠成你能走的路径。',
  ],
  products: {
    warpPower: {
      id: 'WARP_POWER',
      name: '空间折叠算力',
      model: '免费 60 分钟/月 · ¥39/10h · ¥99/月无限',
      pitch: '50 小时冗长废话 → 2 小时高能节点的时间作弊器',
    },
    cognitiveCertificate: {
      id: 'COGNITIVE_REPORT',
      name: '天赋诊断证书',
      model: '¥19.9/次解锁',
      pitch: '霓虹赛博认知证书 · 朋友圈裂变广告位',
    },
    cognitiveBlackhole: {
      id: 'ASSIMILATION',
      name: '认知黑洞提取',
      model: '消耗 Warp Power',
      pitch: '50 小时冗长硬核视频 → 几分钟吐出霓虹荧光关卡路线图',
    },
    revivalArmor: {
      id: 'SUBSCRIPTION',
      name: '复活甲订阅',
      model: '¥29/月起',
      pitch: '连续摆烂？虫洞降级保护。不弹窗、不羞耻，认知能量默默平摊',
    },
    wormholeAccelerator: {
      id: 'WORMHOLE',
      name: '长视频学习加速器',
      model: 'Growth+ 解锁',
      pitch: '吸收率达标 → 霓虹跃迁，跳过冗余基础节点直达硬核段',
    },
  },
  lab: {
    name: '高能进化实验室',
    path: '/lab',
    description: '你是自己进化的最高总工程师。内容注入、星团拓扑、危机扫描——全部在你手里。',
  },
  blockedInToc: [
    'admin', 'school-organism', 'dreamer-twin', 'organism-demo',
    'api/admin', 'api/v1/school', 'api/v1/organism', 'api/v1/twin',
    'api/v1/life/awareness', 'api/v1/co-learn',
  ],
  version: 'toc-1.0.0',
} as const;

export function isTocOnlyMode(): boolean {
  return process.env.WUXIAN_INTERNAL !== '1';
}

export const TOC_BLOCKED_API_PREFIXES = [
  '/api/admin',
  '/api/v1/school',
  '/api/v1/organism',
  '/api/v1/twin',
  '/api/v1/life/awareness',
  '/api/v1/co-learn',
] as const;

export const TOC_BLOCKED_PAGES = [
  '/admin',
  '/admin.html',
  '/console',
  '/school-organism',
  '/school-organism.html',
  '/dreamer-twin',
  '/dreamer-twin.html',
  '/organism.html',
  '/index.html',
] as const;
