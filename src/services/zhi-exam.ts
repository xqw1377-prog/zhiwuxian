/**
 * WUXIAN · 【ZHI】全真模考多模态因果引擎
 * 听、说、读、写四维度断层咬合清算
 */

import { applyDestinyReduction, getMentorPlanView, getSchoolMatrixRow } from '../db/school-matrix';
import { resolveUserLlm } from './deepseek-client';
import { assertWarpBalance, WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';

export type ExamTrack = 'TOEFL' | 'IELTS';

export interface ZhiMockSectionData {
  score?: number;
  maxScore?: number;
  notes?: string;
  transcript?: string;
  draft?: string;
  errorPatterns?: string[];
}

export interface ZhiMockExamInput {
  examTrack?: ExamTrack;
  targetSchool?: string;
  targetTotalScore?: number;
  reading?: ZhiMockSectionData;
  listening?: ZhiMockSectionData;
  speaking?: ZhiMockSectionData;
  writing?: ZhiMockSectionData;
  rawNotes?: string;
  source?: string;
}

export interface ZhiMockReckonResult {
  success: boolean;
  msg?: string;
  totalScore: string;
  targetGap: string;
  crossMetrics: string[];
  nextAction: string;
  zhiReckoning: string;
  warpPointsRemaining: number;
  warpDeducted: number;
  challengeIndex: number;
  reductionPreview?: number;
}

export interface ZhiMockShadowResult {
  passed: boolean;
  zhiReckoning: string;
  warpPointsRemaining: number;
  challengeIndex: number;
  reductionApplied: number;
}

const RECKON_SYSTEM = `你不是考试评分插件，你是智无限终极导师【ZHI】。
对第一使用者曦宝的全套托福/雅思模考执行终极因果清算。禁止安慰性废话。
一针见血指出多模态转换核心死穴：例如听力因果词断层如何摧毁口语 T3 与写作综合题。

严格 JSON，无 Markdown：
{
  "totalScore": "如 TOEFL 94/120 (R24,L25,S21,W24) 或 IELTS 6.5 均分",
  "targetGap": "距离梦校门槛的致命分差，点名最弱单项",
  "crossMetrics": [
    "【多模态连带断层】: 听力…导致口语T3…",
    "【写作逻辑注水】: …"
  ],
  "nextAction": "今晚必须完成的物理破局关卡（影子肉搏战）",
  "zhiReckoning": "含曦宝的冷酷总判词，50字内"
}
crossMetrics 至少 2 条，最多 4 条。`;

function parseReckonJson(content: string): Partial<ZhiMockReckonResult> | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const metrics = raw.crossMetrics ?? raw.cross_metrics;
    const list = Array.isArray(metrics)
      ? metrics.map((m) => String(m).trim()).filter(Boolean).slice(0, 5)
      : [];
    return {
      totalScore: String(raw.totalScore ?? '').trim().slice(0, 120),
      targetGap: String(raw.targetGap ?? raw.target_gap ?? '').trim().slice(0, 240),
      crossMetrics: list,
      nextAction: String(raw.nextAction ?? raw.next_action ?? '').trim().slice(0, 320),
      zhiReckoning: String(raw.zhiReckoning ?? raw.zhi_reckoning ?? '').trim().slice(0, 200),
    };
  } catch {
    return null;
  }
}

function heuristicReckon(
  data: ZhiMockExamInput,
  targetSchool: string,
  challengeIndex: number,
): Omit<ZhiMockReckonResult, 'success' | 'warpPointsRemaining' | 'warpDeducted'> {
  const track = data.examTrack ?? 'TOEFL';
  const r = data.reading?.score ?? 24;
  const l = data.listening?.score ?? 25;
  const s = data.speaking?.score ?? 21;
  const w = data.writing?.score ?? 24;
  const total = r + l + s + w;
  const target = data.targetTotalScore ?? (track === 'IELTS' ? 7 : 105);

  const totalScore =
    track === 'IELTS'
      ? `IELTS 均分约 ${(total / 4).toFixed(1)} (R${r} L${l} S${s} W${w})`
      : `TOEFL ${total} / 120 (R${r}, L${l}, S${s}, W${w})`;

  const gap =
    track === 'IELTS'
      ? `距离【${targetSchool}】雅思门槛还差约 ${Math.max(0, target - total / 4).toFixed(1)} 分，口语/写作联动是死穴。`
      : `距离【${targetSchool}】底线（${target}分）还差 ${Math.max(0, target - total)} 分，口语 ${s} 分是致命死穴。`;

  return {
    totalScore,
    targetGap: gap,
    crossMetrics: [
      `【多模态连带断层】: 听力学术讲座细节抓取存在物理断层（${data.listening?.notes ?? '因果转折词漏捕'}），直接导致口语综合题 T3 丢失核心论据——这不是口语问题，是听力输入因果链断裂。`,
      `【阅读→写作坍缩】: ${data.reading?.notes ?? '长难句结构坍缩'} 使你在独立写作第三层推导时逃向万能模板，高维学术论证严重注水。`,
      `【口语假装流利】: ${data.speaking?.notes ?? '填充词与词汇复用'}，ZHI 判定流速保住了但信息密度低于 CMU 航标要求。`,
    ],
    nextAction:
      '今晚 21:00 前强制锁定 [听力因果词捕捉] 影子肉搏战，信息还原度须达 95%，否则模考清算作废。',
    zhiReckoning: `曦宝，${totalScore} 是你今天的真实骨架。别看柱状图，看断层连线，然后执行死命令。`,
    challengeIndex,
    reductionPreview: 4,
  };
}

export class ZhiExamEngine {
  /**
   * 全套全真模考清算（25 Warp）
   */
  static async reckonFullMockExam(
    userId: string,
    examData: ZhiMockExamInput,
  ): Promise<ZhiMockReckonResult> {
    const uid = userId.trim();
    if (!uid) throw new Error('缺少 userId');

    const plan = getMentorPlanView(uid);
    const row = getSchoolMatrixRow(uid);
    const targetSchool =
      examData.targetSchool ?? plan?.targetSchool ?? row?.target_school ?? 'CMU 计算机系';
    const challengeIndex = Number(plan?.challengeIndex ?? row?.challenge_index ?? 92);

    const balance = assertWarpBalance(uid, WARP_COST.FULL_MOCK_EXAM);
    if (!balance.ok) {
      return {
        success: false,
        msg: 'Warp 燃料舱余量不足，无法驱动 ZHI 模考清算矩阵。',
        totalScore: '',
        targetGap: '',
        crossMetrics: [],
        nextAction: '',
        zhiReckoning: '曦宝，托管算力见底。全真清算矩阵熄火——先充值燃料舱。',
        warpPointsRemaining: balance.remaining,
        warpDeducted: 0,
        challengeIndex,
      };
    }

    if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
      const h = heuristicReckon({ ...examData, targetSchool }, targetSchool, challengeIndex);
      return {
        success: true,
        ...h,
        warpPointsRemaining: balance.remaining,
        warpDeducted: 0,
      };
    }

    let parsed: Partial<ZhiMockReckonResult> | null = null;
    let warpRemaining = balance.remaining;
    let warpDeducted = 0;
    try {
      const gw = await gatewayJsonCompletion<Partial<ZhiMockReckonResult>>(uid, [
        { role: 'system', content: RECKON_SYSTEM },
        {
          role: 'user',
          content: `梦校航标: ${targetSchool} | 当前命运阻力: ${challengeIndex}%\n【模考数据】:\n${JSON.stringify({ ...examData, targetSchool }, null, 2)}`,
        },
      ], {
        traceId: `exam_reckon_${uid}`,
        maxTokens: 1100,
        flatWarp: { cost: WARP_COST.FULL_MOCK_EXAM, reason: 'FULL_MOCK_EXAM' },
      });
      if (!gw.chargeOk) {
        return {
          success: false,
          msg: 'Warp 燃料舱余量不足，无法驱动 ZHI 模考清算矩阵。',
          totalScore: '',
          targetGap: '',
          crossMetrics: [],
          nextAction: '',
          zhiReckoning: '算力清算失败。',
          warpPointsRemaining: gw.warpRemaining,
          warpDeducted: 0,
          challengeIndex,
        };
      }
      warpRemaining = gw.warpRemaining;
      warpDeducted = gw.warpDeducted;
      if (gw.data) parsed = parseReckonJson(JSON.stringify(gw.data)) ?? gw.data;
    } catch (err) {
      console.warn('[ZhiExam] DeepSeek 降级:', err);
    }

    const base = parsed
      ? {
          ...heuristicReckon({ ...examData, targetSchool }, targetSchool, challengeIndex),
          ...parsed,
          challengeIndex,
        }
      : heuristicReckon({ ...examData, targetSchool }, targetSchool, challengeIndex);

    return {
      success: true,
      totalScore: base.totalScore,
      targetGap: base.targetGap,
      crossMetrics: base.crossMetrics.length
        ? base.crossMetrics
        : heuristicReckon({ ...examData, targetSchool }, targetSchool, challengeIndex).crossMetrics,
      nextAction: base.nextAction,
      zhiReckoning:
        base.zhiReckoning ||
        '清算完成。曦宝，这就是今天的真实骨架。看致命断层，执行今晚死命令。',
      warpPointsRemaining: warpRemaining,
      warpDeducted: warpDeducted,
      challengeIndex,
      reductionPreview: 4,
    };
  }

  /**
   * 模考影子突围：击穿听力/口语联动断层后扣减命运阻力
   */
  static async completeMockShadowMission(input: {
    userId: string;
    missionNote?: string;
  }): Promise<ZhiMockShadowResult> {
    const uid = input.userId.trim();
    if (!uid) throw new Error('缺少 userId');

    const applied = applyDestinyReduction(
      uid,
      4,
      1,
      input.missionNote ??
        '听力因果词影子肉搏战胜利。信息还原度达标，模考连带断层已补丁焊死。',
    );

    const plan = getMentorPlanView(uid);
    const challengeIndex = applied?.challengeIndex ?? Number(plan?.challengeIndex ?? 88);

    return {
      passed: true,
      zhiReckoning:
        applied?.mentorWhisper ??
        '曦宝，这块断层补丁焊死了，命运阻力应声下跌。继续锁定航标，往前冲锋。',
      warpPointsRemaining: assertWarpBalance(uid, 0).remaining,
      challengeIndex,
      reductionApplied: applied?.reduction ?? 4,
    };
  }
}
