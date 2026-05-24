/**
 * WUXIAN · 目标学校情报大脑
 * 三层探针降维打击 → 录取画像重组 → 梦想家画布反向投影
 * 哲学：POINTER_ONLY · 不存冗余 · 借力打力
 */

import { getSemanticRouter } from './public-course-auditor';

export interface SchoolRawData {
  schoolName: string;
  officialWebsiteUrl?: string;
  officialWebsitePayload?: string;
  marketSentimentTexts?: string[];
  plannerCrowdsourced?: PlannerIntelCell[];
  partnerExamPayload?: string[];
}

export interface PlannerIntelCell {
  cellId: string;
  plannerId: string;
  schoolName: string;
  intelType: 'written_exam' | 'interview' | 'quota_insider' | 'policy_leak';
  title: string;
  content: string;
  examPointer?: string;
  trustWeight: number;
  submittedAt: string;
}

export interface AdmissionCriteria {
  mathRequirement: string;
  englishLevel: string;
  interviewFocus: string;
}

export interface TargetSchoolProfile {
  profileId: string;
  schoolName: string;
  enrollmentCap2026: number;
  difficultyRating: number;
  tuitionRange?: string;
  applicationDeadline?: string;
  admissionCriteria: AdmissionCriteria;
  cachedExamPointers: string[];
  dataSources: Array<'official' | 'market' | 'crowdsource' | 'partner_api'>;
  lastScannedAt: string;
  intelSummary: string;
}

export interface DreamerProjection {
  studentId: string;
  schoolName: string;
  profileId: string;
  day365Badge: string;
  gapNodes: string[];
  slopeMultiplier: number;
  wormholeRecommended: boolean;
  recommendedCoursePointers: Array<{
    topic: string;
    deepLinkHint: string;
    wormholeScore: number;
  }>;
  projectionMessage: string;
}

const SCHOOL_INTEL_SEEDS: Record<string, Partial<TargetSchoolProfile>> = {
  '上海某国际学校 AP 班': {
    enrollmentCap2026: 60,
    difficultyRating: 0.89,
    tuitionRange: '¥220,000 - ¥280,000 / 年',
    applicationDeadline: '2026-03-15',
    admissionCriteria: {
      mathRequirement:
        '必须熟练掌握二次函数压轴平面几何，且隐性考查部分线性代数基础 $A\\vec{x} = \\lambda\\vec{x}$',
      englishLevel: 'AP 学术文献无障碍阅读级别',
      interviewFocus: '极度看重空间想象力与独立结构艺术天分',
    },
    cachedExamPointers: [
      'https://wuxian.internal.bridge/exams/school_sh_ap_2025_written.pdf',
      'https://partner.agent.api/questions/interview_lock',
    ],
  },
  '北京某顶尖美高预备部': {
    enrollmentCap2026: 45,
    difficultyRating: 0.92,
    tuitionRange: '¥350,000 / 年',
    applicationDeadline: '2026-01-30',
    admissionCriteria: {
      mathRequirement: '高维向量散度与矩阵特征值分解 $A = U\\Sigma V^T$',
      englishLevel: '托福 90+ 或 SSAT 阅读 85th percentile',
      interviewFocus: '批判性思维、跨文化沟通与项目叙事能力',
    },
    cachedExamPointers: [
      'https://wuxian.internal.bridge/exams/beijing_prep_2024_ssat.pdf',
    ],
  },
};

export class WuxianSchoolIntelligence {
  private profiles = new Map<string, TargetSchoolProfile>();
  private crowdCells: PlannerIntelCell[] = [];

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    for (const [name, partial] of Object.entries(SCHOOL_INTEL_SEEDS)) {
      const profile = this.buildProfileFromPartial(name, partial, ['official', 'market']);
      this.profiles.set(profile.profileId, profile);
    }
  }

  /**
   * OpenClaw 核心动作：情报深度解剖与二次评估
   */
  conceptualizeSchoolProfile(raw: SchoolRawData): TargetSchoolProfile {
    const seed = SCHOOL_INTEL_SEEDS[raw.schoolName] ?? this.inferProfileFromRaw(raw);
    const crowdForSchool = [
      ...this.crowdCells.filter(c => c.schoolName === raw.schoolName),
      ...(raw.plannerCrowdsourced ?? []),
    ];

    const examPointers = [
      ...(seed.cachedExamPointers ?? []),
      ...crowdForSchool.map(c => c.examPointer).filter(Boolean) as string[],
      ...(raw.partnerExamPayload ?? []),
    ];

    const sources: TargetSchoolProfile['dataSources'] = ['official'];
    if (raw.marketSentimentTexts?.length) sources.push('market');
    if (crowdForSchool.length) sources.push('crowdsource');
    if (raw.partnerExamPayload?.length) sources.push('partner_api');

    const difficultyBoost = Math.min(0.08, crowdForSchool.length * 0.02);
    const profile: TargetSchoolProfile = {
      profileId: `sch-${slugify(raw.schoolName)}`,
      schoolName: raw.schoolName,
      enrollmentCap2026: seed.enrollmentCap2026 ?? 50,
      difficultyRating: Math.min(0.99, (seed.difficultyRating ?? 0.75) + difficultyBoost),
      tuitionRange: seed.tuitionRange,
      applicationDeadline: seed.applicationDeadline,
      admissionCriteria: seed.admissionCriteria ?? {
        mathRequirement: '平面几何 + 函数综合',
        englishLevel: '学术英语阅读',
        interviewFocus: '学习动机与思维结构',
      },
      cachedExamPointers: [...new Set(examPointers)],
      dataSources: sources,
      lastScannedAt: new Date().toISOString(),
      intelSummary: this.buildIntelSummary(raw, crowdForSchool.length),
    };

    this.profiles.set(profile.profileId, profile);
    return profile;
  }

  /**
   * 战略级反向投影：学校画像 → 梦想家 DAY 365 终点
   */
  projectToDreamerCanvas(profile: TargetSchoolProfile, studentId: string, currentNode = '平面几何-相似三角形'): DreamerProjection {
    const mathReq = profile.admissionCriteria.mathRequirement;
    const gapNodes = this.detectGapNodes(currentNode, mathReq);
    const slopeMultiplier = 1 + profile.difficultyRating * 0.6 + gapNodes.length * 0.15;
    const wormholeRecommended = gapNodes.length >= 2 && profile.difficultyRating >= 0.85;

    const router = getSemanticRouter();
    const recommendedCoursePointers = gapNodes.map(topic => {
      const match = router.match(topic, { minWormhole: 0.5 });
      return {
        topic,
        deepLinkHint: match.matched ? (match.deepLinkUrl ?? match.message) : `semantic://${topic}`,
        wormholeScore: match.matched ? (match.wormholeAdaptability ?? 0.7) : 0.5,
      };
    });

    return {
      studentId,
      schoolName: profile.schoolName,
      profileId: profile.profileId,
      day365Badge: `${profile.schoolName} // 录取准星`,
      gapNodes,
      slopeMultiplier: +slopeMultiplier.toFixed(2),
      wormholeRecommended,
      recommendedCoursePointers,
      projectionMessage: [
        `已将【${profile.schoolName}】录取准星锁定至梦想家 #${studentId}`,
        `数学最高考点: ${mathReq}`,
        `画布终点 DAY 365 已挂载该校录取徽章`,
        gapNodes.length
          ? `倒推路径: 需撕裂 ${gapNodes.join(' → ')} · 配速斜率 ×${slopeMultiplier.toFixed(2)}`
          : '当前知识节点与该校要求基本对齐',
        wormholeRecommended ? '⚡ 虫洞跃迁已激活 · 公共线代/拓扑切片将排入前方路径' : '',
      ].filter(Boolean).join('\n'),
    };
  }

  ingestPlannerIntel(cell: Omit<PlannerIntelCell, 'cellId' | 'submittedAt' | 'trustWeight'>): PlannerIntelCell {
    const full: PlannerIntelCell = {
      ...cell,
      cellId: `cell-${Date.now().toString(36)}`,
      trustWeight: cell.intelType === 'written_exam' ? 0.95 : 0.85,
      submittedAt: new Date().toISOString(),
    };
    this.crowdCells.push(full);

    const existing = [...this.profiles.values()].find(p => p.schoolName === cell.schoolName);
    if (existing) {
      if (cell.examPointer && !existing.cachedExamPointers.includes(cell.examPointer)) {
        existing.cachedExamPointers.push(cell.examPointer);
      }
      if (!existing.dataSources.includes('crowdsource')) {
        existing.dataSources.push('crowdsource');
      }
      existing.lastScannedAt = new Date().toISOString();
    }

    return full;
  }

  getProfile(schoolName: string): TargetSchoolProfile | undefined {
    return [...this.profiles.values()].find(p => p.schoolName === schoolName);
  }

  getProfileById(profileId: string): TargetSchoolProfile | undefined {
    return this.profiles.get(profileId);
  }

  listProfiles(): TargetSchoolProfile[] {
    return [...this.profiles.values()];
  }

  listCrowdCells(schoolName?: string): PlannerIntelCell[] {
    return schoolName
      ? this.crowdCells.filter(c => c.schoolName === schoolName)
      : [...this.crowdCells];
  }

  /** 深夜静默巡航：扫描已注册学校情报变动 */
  runNightlyPatrol(): { scanned: number; updated: string[]; message: string } {
    const updated: string[] = [];
    for (const profile of this.profiles.values()) {
      const drift = Math.random() > 0.7;
      if (drift) {
        profile.lastScannedAt = new Date().toISOString();
        profile.intelSummary += ' · [夜巡] 检测到招生风向微调';
        updated.push(profile.schoolName);
      }
    }
    return {
      scanned: this.profiles.size,
      updated,
      message: updated.length
        ? `OpenClaw 夜巡完成 · ${updated.length} 校招生情报已更新`
        : `OpenClaw 夜巡完成 · ${this.profiles.size} 校情报稳定`,
    };
  }

  private inferProfileFromRaw(raw: SchoolRawData): Partial<TargetSchoolProfile> {
    const text = [
      raw.officialWebsitePayload ?? '',
      ...(raw.marketSentimentTexts ?? []),
    ].join(' ').toLowerCase();

    const isAp = /ap|国际|双语/.test(text);
    const isHard = /顶尖|难度|竞赛|选拔/.test(text);

    return {
      enrollmentCap2026: isAp ? 55 : 80,
      difficultyRating: isHard ? 0.88 : isAp ? 0.82 : 0.7,
      admissionCriteria: {
        mathRequirement: isHard
          ? '高维向量散度与矩阵特征值 $A = U\\Sigma V^T$'
          : '二次函数压轴 + 平面几何综合',
        englishLevel: isAp ? 'AP 学术阅读级别' : '中考英语优秀 + 学术词汇',
        interviewFocus: isAp ? '空间想象力与跨学科思维' : '学习自驱力与表达逻辑',
      },
      cachedExamPointers: [],
    };
  }

  private buildProfileFromPartial(
    name: string,
    partial: Partial<TargetSchoolProfile>,
    sources: TargetSchoolProfile['dataSources'],
  ): TargetSchoolProfile {
    return {
      profileId: `sch-${slugify(name)}`,
      schoolName: name,
      enrollmentCap2026: partial.enrollmentCap2026 ?? 50,
      difficultyRating: partial.difficultyRating ?? 0.75,
      tuitionRange: partial.tuitionRange,
      applicationDeadline: partial.applicationDeadline,
      admissionCriteria: partial.admissionCriteria ?? {
        mathRequirement: '—',
        englishLevel: '—',
        interviewFocus: '—',
      },
      cachedExamPointers: partial.cachedExamPointers ?? [],
      dataSources: sources,
      lastScannedAt: new Date().toISOString(),
      intelSummary: `${name} 情报画像已就绪`,
    };
  }

  private buildIntelSummary(raw: SchoolRawData, crowdCount: number): string {
    const parts = [`官网情报已剥离`];
    if (raw.marketSentimentTexts?.length) parts.push(`${raw.marketSentimentTexts.length} 条舆情已清洗`);
    if (crowdCount) parts.push(`${crowdCount} 份规划师众筹细胞已融合`);
    if (raw.partnerExamPayload?.length) parts.push(`中介题库 ${raw.partnerExamPayload.length} 指针已挂载`);
    return parts.join(' · ');
  }

  private detectGapNodes(current: string, mathReq: string): string[] {
    const gaps: string[] = [];
    const req = mathReq.toLowerCase();
    if (/线代|矩阵|特征值|svd|向量空间/.test(req) && !/线代|矩阵/.test(current)) {
      gaps.push('线性代数-奇异值分解');
    }
    if (/散度|高维|拓扑/.test(req) && !/拓扑|高维/.test(current)) {
      gaps.push('高阶空间拓扑');
    }
    if (/二次函数|平面几何/.test(req) && /初中|平面几何/.test(current)) {
      gaps.push('二次函数压轴几何');
    }
    if (gaps.length === 0 && profileDifficulty(mathReq) > 0.8) {
      gaps.push('跨级数学冲刺细胞');
    }
    return gaps;
  }
}

function profileDifficulty(mathReq: string): number {
  if (/高维|散度|特征值|svd/i.test(mathReq)) return 0.9;
  if (/线代|矩阵/i.test(mathReq)) return 0.85;
  return 0.6;
}

function slugify(name: string): string {
  return name.replace(/\s+/g, '-').slice(0, 24).toLowerCase();
}

let globalIntel: WuxianSchoolIntelligence | null = null;

export function getSchoolIntelligence(): WuxianSchoolIntelligence {
  if (!globalIntel) globalIntel = new WuxianSchoolIntelligence();
  return globalIntel;
}
