/**
 * WUXIAN · SaaS 规划师上帝中台 (Master Control Center)
 * ========================================================
 * 三层管理哲学：
 *   1. 宏观星团拓扑 (Talent Cluster Topology)
 *   2. 危机引力嗅探 (Gravity-Based Alerting)
 *   3. 批量细胞下发 (Mass Cell Injection Chain)
 */

export type StarStatus = 'WORMHOLE' | 'STEADY' | 'CORRECTION' | 'CRISIS' | 'DORMANT';

export interface TalentStar {
  id: string;
  displayId: string;
  slope: number;
  talentConfidence: number;
  lazyRiskScore: number;
  intuitiveLeapIndex: number;
  status: StarStatus;
  color: string;
  orbitAngle: number;
  orbitRadius: number;
  gravityCollapse: boolean;
  label: string;
}

export interface ClusterTopology {
  plannerId: string;
  totalOrganisms: number;
  stars: TalentStar[];
  wormholeOpenRatio: number;
  criticalAlerts: number;
  centerStatus: string;
  generatedAt: string;
}

export interface CrisisAlert {
  starId: string;
  displayId: string;
  lazyRiskScore: number;
  consecutiveDays: number;
  topic: string;
  recommendation: string;
  severity: 'LEVEL_2' | 'LEVEL_3';
}

export interface TalentBurstEvent {
  starId: string;
  displayId: string;
  newSlope: number;
  talentLabel: string;
  wormholeNode: string;
  message: string;
}

export interface MassInjectionResult {
  cellPackageId: string;
  cellTitle: string;
  eligibleCount: number;
  injectedCount: number;
  injectionRatio: number;
  affectedStarIds: string[];
  message: string;
}

const STATUS_COLORS: Record<StarStatus, string> = {
  WORMHOLE: '#39FF14',
  STEADY: '#39FF14',
  CORRECTION: '#FF5E00',
  CRISIS: '#FF5E00',
  DORMANT: '#FFF01F',
};

/** 模拟规划师名下天才星团 */
const SEED_STARS: Omit<TalentStar, 'orbitAngle' | 'orbitRadius'>[] = [
  { id: 'org-0981', displayId: '#0981', slope: 2.1, talentConfidence: 0.88, lazyRiskScore: 0.4, intuitiveLeapIndex: 0.82, status: 'WORMHOLE', color: STATUS_COLORS.WORMHOLE, gravityCollapse: false, label: '虫洞加速中' },
  { id: 'org-1042', displayId: '#1042', slope: 1.2, talentConfidence: 0.72, lazyRiskScore: 0.5, intuitiveLeapIndex: 0.65, status: 'STEADY', color: STATUS_COLORS.STEADY, gravityCollapse: false, label: '稳扎稳打' },
  { id: 'org-1105', displayId: '#1105', slope: 1.0, talentConfidence: 0.68, lazyRiskScore: 0.55, intuitiveLeapIndex: 0.71, status: 'DORMANT', color: STATUS_COLORS.DORMANT, gravityCollapse: false, label: '潜能等待爆发' },
  { id: 'org-0812', displayId: '#0812', slope: 0.7, talentConfidence: 0.45, lazyRiskScore: 0.9, intuitiveLeapIndex: 0.38, status: 'CRISIS', color: '#737373', gravityCollapse: false, label: '惰性风控预警' },
  { id: 'org-1156', displayId: '#1156', slope: 1.5, talentConfidence: 0.79, lazyRiskScore: 0.45, intuitiveLeapIndex: 0.74, status: 'STEADY', color: STATUS_COLORS.STEADY, gravityCollapse: false, label: '稳健推进' },
  { id: 'org-0923', displayId: '#0923', slope: 1.8, talentConfidence: 0.85, lazyRiskScore: 0.35, intuitiveLeapIndex: 0.88, status: 'WORMHOLE', color: STATUS_COLORS.WORMHOLE, gravityCollapse: false, label: '直觉跃迁' },
  { id: 'org-1088', displayId: '#1088', slope: 0.9, talentConfidence: 0.55, lazyRiskScore: 0.7, intuitiveLeapIndex: 0.42, status: 'CORRECTION', color: STATUS_COLORS.CORRECTION, gravityCollapse: false, label: '伴生纠偏中' },
];

const CELL_PACKAGES: Record<string, { id: string; title: string; minTalent: number; domains: string[] }> = {
  ADV_TOPOLOGY_V4: {
    id: 'ADV_TOPOLOGY_V4',
    title: '高阶拓扑空间认知细胞',
    minTalent: 0.65,
    domains: ['SPATIAL', 'MATH', 'STRUCTURE'],
  },
  CHAIN_RULE_V2: {
    id: 'CHAIN_RULE_V2',
    title: '链式法则复合映射细胞',
    minTalent: 0.6,
    domains: ['CALCULUS', 'LOGIC'],
  },
};

export class WuxianMasterConsole {
  private stars: TalentStar[] = [];
  private totalOrganisms = 1240;

  constructor(plannerId = 'planner-global-01') {
    this.stars = this.buildCluster(plannerId);
  }

  getClusterTopology(): ClusterTopology {
    const wormholeCount = this.stars.filter(s => s.status === 'WORMHOLE').length;
    const criticalAlerts = this.stars.filter(s => s.gravityCollapse || s.status === 'CRISIS').length;

    return {
      plannerId: 'planner-global-01',
      totalOrganisms: this.totalOrganisms,
      stars: this.stars,
      wormholeOpenRatio: +(wormholeCount / this.stars.length * 100).toFixed(1),
      criticalAlerts,
      centerStatus: criticalAlerts > 0 ? '监测到引力塌陷' : '星团引力平衡',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 危机引力嗅探：Risk_lazy 连续飙升 → 引力场黑洞
   */
  scanCrisisGravity(): { alert: CrisisAlert; updatedStar: TalentStar } {
    const crisisStar = this.stars.find(s => s.id === 'org-0812') ?? this.stars[3];

    crisisStar.lazyRiskScore = 2.1;
    crisisStar.status = 'CRISIS';
    crisisStar.color = '#FF5E00';
    crisisStar.gravityCollapse = true;
    crisisStar.label = '引力塌陷 · 二级风控';

    const alert: CrisisAlert = {
      starId: crisisStar.id,
      displayId: crisisStar.displayId,
      lazyRiskScore: crisisStar.lazyRiskScore,
      consecutiveDays: 3,
      topic: '大学先修微积分 · 高维向量散度',
      recommendation: '建议介入 5 分钟人工心理疏导。系统已自动拉平其明天的成长斜率。',
      severity: 'LEVEL_2',
    };

    return { alert, updatedStar: crisisStar };
  }

  /**
   * 捕获瞬间爆发：直觉指数跨代越迁 → 虫洞炸开
   */
  captureTalentBurst(): { event: TalentBurstEvent; updatedStar: TalentStar } {
    const burstStar = this.stars.find(s => s.id === 'org-1105') ?? this.stars[2];

    burstStar.slope = 3.8;
    burstStar.talentConfidence = 0.96;
    burstStar.intuitiveLeapIndex = 0.95;
    burstStar.status = 'WORMHOLE';
    burstStar.color = '#FFF01F';
    burstStar.label = '虫洞跃迁爆发';
    burstStar.gravityCollapse = false;

    const event: TalentBurstEvent = {
      starId: burstStar.id,
      displayId: burstStar.displayId,
      newSlope: burstStar.slope,
      talentLabel: '空间美学天才',
      wormholeNode: '大学高阶拓扑空间结构',
      message: `瞬间爆发现场：梦想家 ${burstStar.displayId} 刚刚达成了完美认知闭环。系统已跨代调用大学拓扑空间资产，成功将其培育斜率推至 ${burstStar.slope}x！10 年长河折叠成功！`,
    };

    return { event, updatedStar: burstStar };
  }

  /**
   * 批量细胞注入：流星雨式下发认知细胞
   */
  massInjectCells(packageId = 'ADV_TOPOLOGY_V4'): MassInjectionResult {
    const pkg = CELL_PACKAGES[packageId] ?? CELL_PACKAGES.ADV_TOPOLOGY_V4;

    const eligible = this.stars.filter(s => s.talentConfidence >= pkg.minTalent);
    const affectedStarIds: string[] = [];

    for (const star of eligible) {
      star.slope = Math.min(star.slope + 0.3, 4.0);
      if (star.status === 'DORMANT' || star.status === 'STEADY') {
        star.status = 'STEADY';
        star.color = '#39FF14';
      }
      star.label = '细胞注入接收态';
      affectedStarIds.push(star.id);
    }

    const injectionRatio = +(eligible.length / this.stars.length).toFixed(2);

    return {
      cellPackageId: pkg.id,
      cellTitle: pkg.title,
      eligibleCount: eligible.length,
      injectedCount: eligible.length,
      injectionRatio,
      affectedStarIds,
      message: `战略级动作达成！名下 ${(injectionRatio * 100).toFixed(0)}% 梦想家的逆向时间轴画布中已自动生长出对应的「${pkg.title}」微卡片。`,
    };
  }

  private buildCluster(plannerId: string): TalentStar[] {
    const angles = [45, 135, 225, 315, 60, 180, 300];
    const radii = [0.85, 0.75, 0.9, 0.7, 0.8, 0.65, 0.88];

    return SEED_STARS.map((seed, i) => ({
      ...seed,
      orbitAngle: angles[i % angles.length],
      orbitRadius: radii[i % radii.length],
    }));
  }
}

let globalConsole: WuxianMasterConsole | null = null;

export function getMasterConsole(): WuxianMasterConsole {
  if (!globalConsole) {
    globalConsole = new WuxianMasterConsole();
  }
  return globalConsole;
}
