/**
 * WUXIAN · 自适应虫洞跳跃核心引擎 (Wormhole Engine)
 * ========================================================
 * 核心公式：
 *   S_g = S_base × (1 + I_L) × (A_rate / Risk_lazy)
 *
 * 触发条件：
 *   A_rate > 0.95 且 S_g ≥ 2.5 → 炸开虫洞，跨级跃迁
 */

export interface LearningState {
  userId: string;
  currentKnowledgeNode: string;
  absorptionRate: number;
  intuitiveLeapIndex: number;
  lazyRiskScore: number;
}

export interface WormholeJumpResult {
  isJumpTriggered: boolean;
  nextKnowledgeNode: string;
  nextNodeLabel: string;
  currentNodeLabel: string;
  newDailySlope: number;
  dynamicSlope: number;
  formulaBreakdown: {
    S_base: number;
    IL_factor: number;
    absorption: number;
    lazyRisk: number;
    S_g: number;
  };
  skippedNodes: string[];
  msgToUser: string;
}

const BASE_SLOPE = 1.0;
const WORMHOLE_SLOPE_THRESHOLD = 2.5;
const WORMHOLE_ABSORPTION_THRESHOLD = 0.95;

/** 知识图谱跨代跃迁映射 */
const KNOWLEDGE_WORMHOLE_MAP: Record<string, { next: string; label: string; skipped: string[] }> = {
  '初中几何-相似三角形': {
    next: 'ADVANCED_SPATIAL_TOPOLOGY',
    label: '高阶空间拓扑与结构美学',
    skipped: ['高中几何-圆幂定理', '高中解析几何-圆锥曲线', '大学线性代数-向量空间'],
  },
  '高中物理-电磁感应': {
    next: 'UNIVERSITY_ELECTRODYNAMICS',
    label: '大学电动力学与麦克斯韦方程组',
    skipped: ['高中物理-交流电', '大学普通物理-电磁场论'],
  },
  'SAT阅读-逻辑推断': {
    next: 'ADVANCED_CRITICAL_REASONING',
    label: '高阶批判性思维与学术论文解构',
    skipped: ['SAT阅读-高级词汇', '大学学术写作-论证结构'],
  },
  'AP微积分-导数': {
    next: 'UNIVERSITY_REAL_ANALYSIS',
    label: '大学实分析与拓扑空间结构',
    skipped: ['AP微积分-积分应用', '大学微积分-多元函数', '大学数学-实数理论'],
  },
  '全栈基础-HTML/CSS': {
    next: 'ADVANCED_SYSTEM_ARCHITECTURE',
    label: '高阶系统架构与分布式工程',
    skipped: ['前端框架-React进阶', '后端工程-Node.js', '系统设计-微服务'],
  },
  'DEFAULT': {
    next: 'ADVANCED_CROSS_DISCIPLINE_MATRIX',
    label: '跨学科高阶知识矩阵',
    skipped: ['当前层级+1', '当前层级+2', '当前层级+3'],
  },
};

const NODE_LABELS: Record<string, string> = {
  '初中几何-相似三角形': '初中几何 · 相似三角形',
  '高中物理-电磁感应': '高中物理 · 电磁感应',
  'SAT阅读-逻辑推断': 'SAT阅读 · 逻辑推断',
  'AP微积分-导数': 'AP微积分 · 导数',
  '全栈基础-HTML/CSS': '全栈基础 · HTML/CSS',
};

export class WuxianWormholeEngine {

  /**
   * 虫洞公式：计算动态配速斜率
   * S_g = S_base × (1 + I_L) × (A_rate / Risk_lazy)
   */
  computeDynamicSlope(state: LearningState): number {
    const lazyRisk = Math.max(0.1, state.lazyRiskScore);
    return BASE_SLOPE * (1 + state.intuitiveLeapIndex) * (state.absorptionRate / lazyRisk);
  }

  /**
   * 动态配速与时空折叠核心算法
   */
  evaluateWormholeJump(state: LearningState): WormholeJumpResult {
    const S_g = this.computeDynamicSlope(state);
    const lazyRisk = Math.max(0.1, state.lazyRiskScore);
    const currentLabel = NODE_LABELS[state.currentKnowledgeNode] ?? state.currentKnowledgeNode;

    const breakdown = {
      S_base: BASE_SLOPE,
      IL_factor: 1 + state.intuitiveLeapIndex,
      absorption: state.absorptionRate,
      lazyRisk,
      S_g: +S_g.toFixed(4),
    };

    if (
      state.absorptionRate > WORMHOLE_ABSORPTION_THRESHOLD &&
      S_g >= WORMHOLE_SLOPE_THRESHOLD &&
      state.lazyRiskScore < 1.5
    ) {
      const jump = this.lookupHighLevelNode(state.currentKnowledgeNode);

      return {
        isJumpTriggered: true,
        nextKnowledgeNode: jump.next,
        nextNodeLabel: jump.label,
        currentNodeLabel: currentLabel,
        newDailySlope: S_g,
        dynamicSlope: S_g,
        formulaBreakdown: breakdown,
        skippedNodes: jump.skipped,
        msgToUser: [
          'WUXIAN 监测到你的认知闭环已达成完美平衡。',
          '世俗的年级和教材对你而言已经变成了平庸的裹脚布。',
          `时空虫洞已经炸开，我们直接跳过机械刷题，降落至高维坐标：【${jump.label}】。`,
          `S_g = ${S_g.toFixed(2)} · 吸收率 ${(state.absorptionRate * 100).toFixed(0)}% · I_L ${state.intuitiveLeapIndex.toFixed(2)}`,
          '坐稳了，你的数字手足正在陪你把 10 年缩写进 1 年！',
        ].join('\n'),
      };
    }

    const gentleSlope = Math.max(0.5, S_g);
    const isTired = state.lazyRiskScore >= 1.5;

    return {
      isJumpTriggered: false,
      nextKnowledgeNode: state.currentKnowledgeNode,
      nextNodeLabel: currentLabel,
      currentNodeLabel: currentLabel,
      newDailySlope: gentleSlope,
      dynamicSlope: S_g,
      formulaBreakdown: breakdown,
      skippedNodes: [],
      msgToUser: isTired
        ? '保持平稳呼吸，今天我们放慢配速，我陪你稳扎稳打夯实这颗细胞。'
        : `当前配速斜率 S_g = ${S_g.toFixed(2)}。继续夯实【${currentLabel}】，虫洞阈值尚未触发。`,
    };
  }

  private lookupHighLevelNode(currentNode: string) {
    return KNOWLEDGE_WORMHOLE_MAP[currentNode] ?? KNOWLEDGE_WORMHOLE_MAP.DEFAULT;
  }
}

/** 从天分雷达指标构造学习状态 */
export function buildLearningStateFromRadar(
  userId: string,
  currentNode: string,
  absorptionRate: number,
  IL: number,
  lazyRiskScore: number,
): LearningState {
  return {
    userId,
    currentKnowledgeNode: currentNode,
    absorptionRate,
    intuitiveLeapIndex: IL,
    lazyRiskScore,
  };
}

/** 模拟虫洞就绪状态（演示用） */
export function simulateWormholeReadyState(userId: string, node?: string): LearningState {
  return {
    userId,
    currentKnowledgeNode: node ?? 'AP微积分-导数',
    absorptionRate: 0.97,
    intuitiveLeapIndex: 0.85,
    lazyRiskScore: 0.6,
  };
}
