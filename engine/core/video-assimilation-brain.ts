/**
 * WUXIAN · 视频课件深度吞噬与二次评估矩阵
 * (Video Assimilation Brain)
 * ========================================================
 * 工具链矩阵（模拟接口层）：
 *   Layer 1: Whisper / FunASR · OpenCV+YOLO · PaddleOCR
 *   Layer 2: 多模态专家组评级（逻辑密度 / 直觉启发 / 学术准确）
 *   Layer 3: Milvus 向量库 · Neo4j 认知图谱
 *
 * 二次评估灵魂：
 *   第一次 → 老师讲得好不好、表面知识点
 *   第二次 → 认知含金量 + 时空折叠率（虫洞价值）
 */

export type CourseGrade = 'S' | 'A' | 'B' | 'C';

export interface RawVideoPayload {
  videoId: string;
  title?: string;
  sourceUrl?: string;
  ocrTexts: string[];
  audioTranscript: string;
  estimatedDuration: number;
  frameCount?: number;
  keyframeTimestamps?: number[];
}

export interface KnowledgeCell {
  id: string;
  name: string;
  densityScore: number;
  wormholeValue: number;
  reconceptualizedLaTeX: string;
  timestampStart: number;
  timestampEnd: number;
  prerequisiteIds: string[];
  successorIds: string[];
}

export interface PrimaryAssessment {
  logicDensity: number;
  intuitionScore: number;
  academicAccuracy: number;
  verdict: string;
}

export interface SecondaryAssessmentReport {
  videoId: string;
  primaryCategory: string;
  subCategory: string;
  knowledgeCells: KnowledgeCell[];
  overallGrade: CourseGrade;
  primaryAssessment: PrimaryAssessment;
  spatialFoldRate: number;
  toolChainTrace: string[];
}

export interface CognitiveReserveEntry {
  videoId: string;
  report: SecondaryAssessmentReport;
  vectorId: string;
  graphNodeIds: string[];
  reservedAt: string;
  status: 'ACTIVE' | 'FILTERED';
}

export interface VideoClipResolution {
  clipId: string;
  videoId: string;
  title: string;
  cellName: string;
  timestampStart: number;
  timestampEnd: number;
  durationSeconds: number;
  wormholeValue: number;
  laTeX: string;
  message: string;
}

/** 学科分类映射 */
const CATEGORY_MAP: Record<string, { primary: string; sub: string }> = {
  matrix: { primary: 'ADVANCED_MATHEMATICS // 高阶数学', sub: 'LINEAR_ALGEBRA // 线性代数' },
  geometry: { primary: 'ADVANCED_MATHEMATICS // 高阶数学', sub: 'SPATIAL_GEOMETRY // 空间几何学' },
  calculus: { primary: 'ADVANCED_MATHEMATICS // 高阶数学', sub: 'CALCULUS // 微积分' },
  topology: { primary: 'ADVANCED_MATHEMATICS // 高阶数学', sub: 'TOPOLOGY // 拓扑空间' },
  default: { primary: 'CROSS_DISCIPLINE // 跨学科矩阵', sub: 'GENERAL_LOGIC // 通用逻辑' },
};

const GRADE_THRESHOLD = { S: 0.88, A: 0.75, B: 0.55, C: 0 };

export class WuxianVideoAssimilationBrain {
  private reserveByUser: Map<string, Map<string, CognitiveReserveEntry>> = new Map();
  private clipIndexByUser: Map<string, Map<string, VideoClipResolution[]>> = new Map();

  /**
   * 全链路：视频吞噬 → 粉碎 → 一次评估 → 二次评估 → 分类储备
   */
  assimilateVideoPipeline(video: RawVideoPayload): SecondaryAssessmentReport {
    const trace: string[] = [];

    trace.push(`[Whisper] 声纹断句完成 · ${video.estimatedDuration}min · ${video.audioTranscript.length} chars`);
    trace.push(`[OpenCV+YOLO] 智能抽帧 ${video.frameCount ?? video.ocrTexts.length} 帧 · PPT/板书切换捕获`);
    trace.push(`[PaddleOCR] LaTeX 公式提取 ${video.ocrTexts.length} 段`);

    const category = this.detectCategory(video);
    const primary = this.executePrimaryAssessment(video);
    const cells = this.extractAndReassessCells(video, category.sub);
    const grade = this.computeGrade(primary, cells);
    const spatialFold = this.computeSpatialFoldRate(cells);

    trace.push(`[Gemini/Claude] 多模态专家组评级 · 逻辑${(primary.logicDensity * 100).toFixed(0)}% · 直觉${(primary.intuitionScore * 100).toFixed(0)}%`);
    trace.push(`[二次评估] 提取 ${cells.length} 知识细胞 · 时空折叠率 ${(spatialFold * 100).toFixed(0)}% · 评级【${grade}】`);

    return {
      videoId: video.videoId,
      primaryCategory: category.primary,
      subCategory: category.sub,
      knowledgeCells: cells,
      overallGrade: grade,
      primaryAssessment: primary,
      spatialFoldRate: spatialFold,
      toolChainTrace: trace,
    };
  }

  /**
   * 核心算法：二次评估与重构
   */
  executeSecondaryAssessment(video: RawVideoPayload): SecondaryAssessmentReport {
    return this.assimilateVideoPipeline(video);
  }

  /**
   * 并网入库：Neo4j 图谱 + Milvus 向量
   */
  saveToCognitiveReserve(userId: string, report: SecondaryAssessmentReport): CognitiveReserveEntry | null {
    if (report.overallGrade !== 'S' && report.overallGrade !== 'A') {
      return {
        videoId: report.videoId,
        report,
        vectorId: '',
        graphNodeIds: [],
        reservedAt: new Date().toISOString(),
        status: 'FILTERED',
      };
    }

    const vectorId = `milvus-${report.videoId}-${Date.now()}`;
    const graphNodeIds = report.knowledgeCells.map(c => `neo4j-${c.id}`);

    const entry: CognitiveReserveEntry = {
      videoId: report.videoId,
      report,
      vectorId,
      graphNodeIds,
      reservedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    const { reserve, clipIndex } = this.getUserStores(userId);
    reserve.set(report.videoId, entry);

    for (const cell of report.knowledgeCells) {
      const clips = clipIndex.get(cell.name) ?? [];
      clips.push({
        clipId: `clip-${cell.id}`,
        videoId: report.videoId,
        title: report.subCategory,
        cellName: cell.name,
        timestampStart: cell.timestampStart,
        timestampEnd: cell.timestampEnd,
        durationSeconds: cell.timestampEnd - cell.timestampStart,
        wormholeValue: cell.wormholeValue,
        laTeX: cell.reconceptualizedLaTeX,
        message: `3 分钟精准切片 · 虫洞权重 ${(cell.wormholeValue * 100).toFixed(0)}%`,
      });
      clipIndex.set(cell.name, clips);

      const keywords = this.extractKeywords(cell.name);
      for (const kw of keywords) {
        const kwClips = clipIndex.get(kw) ?? [];
        kwClips.push(clips[clips.length - 1]);
        clipIndex.set(kw, kwClips);
      }
    }

    return entry;
  }

  /**
   * 伴生纠偏联动：从储备库毫秒级捞出最精准 3 分钟切片
   */
  resolveClipForBlindSpot(userId: string, topic: string, minWormholeValue = 0.5): VideoClipResolution | null {
    const normalized = topic.toLowerCase();
    let best: VideoClipResolution | null = null;

    const { clipIndex } = this.getUserStores(userId);
    for (const [key, clips] of clipIndex.entries()) {
      if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized.slice(0, 4))) {
        for (const clip of clips) {
          if (clip.wormholeValue >= minWormholeValue && (!best || clip.wormholeValue > best.wormholeValue)) {
            best = clip;
          }
        }
      }
    }

    if (!best && clipIndex.size > 0) {
      const all = [...clipIndex.values()].flat();
      best = all.sort((a, b) => b.wormholeValue - a.wormholeValue)[0] ?? null;
    }

    if (best) {
      best.message = `已从认知储备库调出【${best.cellName}】${best.durationSeconds}s 切片，轻柔投射至伴生纠偏流。`;
    }

    return best;
  }

  listReserve(userId: string): CognitiveReserveEntry[] {
    const { reserve } = this.getUserStores(userId);
    return [...reserve.values()].filter(e => e.status === 'ACTIVE');
  }

  getReserveStats(userId: string) {
    const active = this.listReserve(userId);
    const totalCells = active.reduce((s, e) => s + e.report.knowledgeCells.length, 0);
    const sGrade = active.filter(e => e.report.overallGrade === 'S').length;
    const { clipIndex } = this.getUserStores(userId);
    return {
      totalVideos: active.length,
      totalCells,
      sGradeAssets: sGrade,
      clipIndexSize: clipIndex.size,
    };
  }

  private getUserStores(userId: string): { reserve: Map<string, CognitiveReserveEntry>; clipIndex: Map<string, VideoClipResolution[]> } {
    let reserve = this.reserveByUser.get(userId);
    if (!reserve) {
      reserve = new Map<string, CognitiveReserveEntry>();
      this.reserveByUser.set(userId, reserve);
    }
    let clipIndex = this.clipIndexByUser.get(userId);
    if (!clipIndex) {
      clipIndex = new Map<string, VideoClipResolution[]>();
      this.clipIndexByUser.set(userId, clipIndex);
    }
    return { reserve, clipIndex };
  }

  private detectCategory(video: RawVideoPayload) {
    const text = (video.audioTranscript + video.ocrTexts.join(' ')).toLowerCase();
    if (text.includes('矩阵') || text.includes('matrix')) return CATEGORY_MAP.matrix;
    if (text.includes('几何') || text.includes('topology') || text.includes('空间')) return CATEGORY_MAP.geometry;
    if (text.includes('微积分') || text.includes('导数') || text.includes('积分')) return CATEGORY_MAP.calculus;
    if (text.includes('拓扑')) return CATEGORY_MAP.topology;
    return CATEGORY_MAP.default;
  }

  private executePrimaryAssessment(video: RawVideoPayload): PrimaryAssessment {
    const wordCount = video.audioTranscript.split(/\s+/).length;
    const formulaCount = video.ocrTexts.length;
    const duration = video.estimatedDuration;

    const logicDensity = Math.min(0.98, 0.5 + formulaCount * 0.08 + (wordCount / duration) * 0.002);
    const intuitionScore = Math.min(0.95, 0.4 + (video.audioTranscript.includes('比喻') || video.audioTranscript.includes('想象') ? 0.25 : 0.1));
    const academicAccuracy = Math.min(0.99, 0.6 + formulaCount * 0.06);

    let verdict = '层层递进，逻辑严密';
    if (logicDensity < 0.6) verdict = '废话偏多，需二次提炼';
    if (intuitionScore > 0.8) verdict = '具象化比喻出色，直觉启发度高';

    return { logicDensity, intuitionScore, academicAccuracy, verdict };
  }

  private extractAndReassessCells(video: RawVideoPayload, subCategory: string): KnowledgeCell[] {
    const baseCells: Omit<KnowledgeCell, 'id'>[] = [
      {
        name: '高维空间转动矩阵拓扑不变量',
        densityScore: 0.92,
        wormholeValue: 0.95,
        reconceptualizedLaTeX: '$$R(\\theta) = \\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}$$',
        timestampStart: 720,
        timestampEnd: 900,
        prerequisiteIds: ['cell-trig-base'],
        successorIds: ['cell-eigenvalue'],
      },
      {
        name: '齐次坐标系下的平移变换失真纠偏',
        densityScore: 0.78,
        wormholeValue: 0.6,
        reconceptualizedLaTeX: "$$\\vec{x}' = M \\cdot \\vec{x} + \\vec{t}$$",
        timestampStart: 1080,
        timestampEnd: 1260,
        prerequisiteIds: ['cell-matrix-mult'],
        successorIds: ['cell-projective'],
      },
      {
        name: '特征值谱分解与几何意义的瞬时对齐',
        densityScore: 0.86,
        wormholeValue: 0.82,
        reconceptualizedLaTeX: '$$A = Q\\Lambda Q^{-1}$$',
        timestampStart: 1440,
        timestampEnd: 1620,
        prerequisiteIds: ['cell-eigenvalue'],
        successorIds: ['cell-fourier'],
      },
      {
        name: '傅里叶变换的空间折叠视角（应用驱动）',
        densityScore: 0.9,
        wormholeValue: 0.93,
        reconceptualizedLaTeX: '$$\\hat{f}(\\xi)=\\int_{-\\infty}^{\\infty} f(x)e^{-2\\pi i x\\xi}\\,dx$$',
        timestampStart: 1800,
        timestampEnd: 1980,
        prerequisiteIds: ['cell-fourier'],
        successorIds: [],
      },
    ];

    if (subCategory.includes('微积分')) {
      baseCells[0] = {
        name: '链式法则复合映射的直觉解构',
        densityScore: 0.88,
        wormholeValue: 0.82,
        reconceptualizedLaTeX: "$$(f \\circ g)'(x) = f'(g(x)) \\cdot g'(x)$$",
        timestampStart: 600,
        timestampEnd: 780,
        prerequisiteIds: ['cell-derivative-base'],
        successorIds: ['cell-multivariable'],
      };
    }

    return baseCells.map((c, i) => ({
      ...c,
      id: `${video.videoId}-cell-${i + 1}`,
    }));
  }

  private computeGrade(primary: PrimaryAssessment, cells: KnowledgeCell[]): CourseGrade {
    const avgWormhole = cells.reduce((s, c) => s + c.wormholeValue, 0) / cells.length;
    const composite = primary.logicDensity * 0.35 + primary.intuitionScore * 0.25 +
      primary.academicAccuracy * 0.25 + avgWormhole * 0.15;

    if (composite >= GRADE_THRESHOLD.S) return 'S';
    if (composite >= GRADE_THRESHOLD.A) return 'A';
    if (composite >= GRADE_THRESHOLD.B) return 'B';
    return 'C';
  }

  private computeSpatialFoldRate(cells: KnowledgeCell[]): number {
    if (cells.length === 0) return 0;
    return cells.reduce((s, c) => s + c.wormholeValue * c.densityScore, 0) / cells.length;
  }

  private extractKeywords(name: string): string[] {
    const parts = name.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
    return [...parts, '矩阵', '变换', '拓扑', '叉乘', '行列式'].filter((v, i, a) => a.indexOf(v) === i);
  }
}

let globalBrain: WuxianVideoAssimilationBrain | null = null;

export function getVideoBrain(): WuxianVideoAssimilationBrain {
  if (!globalBrain) {
    globalBrain = new WuxianVideoAssimilationBrain();
  }
  return globalBrain;
}

/** 模拟 100GB 网盘硬核视频吞噬 */
export function simulateVideoPayload(videoId = 'vid-topology-master-001'): RawVideoPayload {
  return {
    videoId,
    title: '空间几何与矩阵变换 · 院士级硬核讲座',
    sourceUrl: 'https://pan.example/wuxian/topology-100gb',
    estimatedDuration: 92,
    frameCount: 1847,
    keyframeTimestamps: [120, 480, 720, 1080, 1440, 1920, 2400],
    audioTranscript: [
      '今天我们来讲高维空间的转动矩阵。想象你站在一个旋转木马上，',
      '每一个点的坐标都在随着角度 theta 发生变化。这不是死记公式，',
      '而是拓扑不变量在背后支撑。矩阵乘法本质上是一种线性变换的复合。',
      '当我们引入齐次坐标，平移和旋转就可以统一在一个乘法框架里。',
    ].join(''),
    ocrTexts: [
      'R(θ) = [[cosθ, -sinθ], [sinθ, cosθ]]',
      'det(R) = 1  // 转动保持面积不变',
      "x' = Mx + t  // 齐次坐标平移",
      '相似三角形 → 仿射变换 → 射影变换',
    ],
  };
}

/** 模拟低质量课件（将被过滤） */
export function simulateLowGradeVideo(videoId = 'vid-low-quality-099'): RawVideoPayload {
  return {
    videoId,
    title: '流水账式概念罗列',
    estimatedDuration: 45,
    frameCount: 12,
    audioTranscript: '这个公式要记住，那个公式也要记住，考试会考。',
    ocrTexts: ['公式1', '公式2'],
  };
}
