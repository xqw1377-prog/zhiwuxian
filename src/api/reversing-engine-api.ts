import { gatewayJsonCompletion } from '../services/llm-gateway';
import { WARP_COST } from '../services/billing-hub';
import { getReversingMetrics, upsertReversingMatrix } from '../db/milestone-schema';
import { getCognitiveTopology } from '../db/cognitive-topology-schema';

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function fallbackReverse(input: { targetDestination: string; currentStatus: string; daysToDeadline: number }) {
  const totalUnits = clampInt(80, 50, 120, 80);
  const initialCompletedUnits = clampInt(
    input.currentStatus.length > 20 ? 12 : 8,
    1,
    totalUnits - 1,
    8,
  );
  const weaverReversingWhisper = '目的地已锁定。剩余时间不是恐吓，是你的操控面板。';
  return { totalUnits, initialCompletedUnits, weaverReversingWhisper };
}

export async function reversePlan(input: {
  userId: string;
  targetDestination: string;
  currentStatus: string;
  daysToDeadline: number;
}): Promise<{
  success: boolean;
  whisper: string;
  metrics: {
    targetDestination: string;
    daysLeft: number;
    progressPercentage: number;
    totalUnits: number;
    completedUnits: number;
  };
}> {
  const userId = input.userId.trim();
  const targetDestination = input.targetDestination.trim();
  const currentStatus = input.currentStatus.trim();
  const daysToDeadline = clampInt(input.daysToDeadline, 1, 3650, 180);

  const now = Math.floor(Date.now() / 1000);
  const deadlineTimestamp = now + daysToDeadline * 24 * 60 * 60;

  let totalUnits = 80;
  let initialCompletedUnits = 8;
  let whisper = '目的地已锁定。剩余时间不是恐吓，是你的操控面板。';

  if (process.env.DEEPSEEK_API_KEY?.trim() || userId) {
    try {
      const gw = await gatewayJsonCompletion<{
        totalUnits?: number;
        initialCompletedUnits?: number;
        weaverReversingWhisper?: string;
      }>(userId, [
        {
          role: 'system',
          content: [
            '你是 WUXIAN 操作系统的逆向时空折叠引擎。',
            '你必须采用“以终为始”的逻辑，摒弃传统线性计划，将目标强行切割为离散的可消化认知包数量。',
            '只返回 JSON，不要任何多余文本。',
            '{',
            '  "totalUnits": number,',
            '  "initialCompletedUnits": number,',
            '  "weaverReversingWhisper": "一句冷酷、充满科幻感、给用户极大掌控力的逆向低语，30字以内。"',
            '}',
            '约束：totalUnits 建议 50-120；initialCompletedUnits 不能为 0 且必须 < totalUnits。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `目标目的地: ${targetDestination}\n当前状态评估数据: ${currentStatus}\n距离生死线还有: ${daysToDeadline}天`,
        },
      ], {
        traceId: `reverse_plan_${userId}`,
        flatWarp: { cost: WARP_COST.PLANNER_REGEN, reason: 'PLANNER_REGEN' },
      });
      if (!gw.chargeOk) {
        const fb = fallbackReverse({ targetDestination, currentStatus, daysToDeadline });
        totalUnits = fb.totalUnits;
        initialCompletedUnits = fb.initialCompletedUnits;
        whisper = fb.weaverReversingWhisper;
      } else if (gw.data) {
        const parsed = gw.data;
        totalUnits = clampInt(parsed.totalUnits, 50, 120, totalUnits);
        initialCompletedUnits = clampInt(
          parsed.initialCompletedUnits,
          1,
          totalUnits - 1,
          initialCompletedUnits,
        );
        const w =
          typeof parsed.weaverReversingWhisper === 'string' ? parsed.weaverReversingWhisper.trim() : '';
        if (w) whisper = w.slice(0, 40);
      } else {
        const fb = fallbackReverse({ targetDestination, currentStatus, daysToDeadline });
        totalUnits = fb.totalUnits;
        initialCompletedUnits = fb.initialCompletedUnits;
        whisper = fb.weaverReversingWhisper;
      }
    } catch {
      const fb = fallbackReverse({ targetDestination, currentStatus, daysToDeadline });
      totalUnits = fb.totalUnits;
      initialCompletedUnits = fb.initialCompletedUnits;
      whisper = fb.weaverReversingWhisper;
    }
  } else {
    const fb = fallbackReverse({ targetDestination, currentStatus, daysToDeadline });
    totalUnits = fb.totalUnits;
    initialCompletedUnits = fb.initialCompletedUnits;
    whisper = fb.weaverReversingWhisper;
  }

  upsertReversingMatrix({
    userId,
    targetDestination,
    baselineScore: 50,
    deadlineTimestamp,
    totalUnits,
    completedUnits: initialCompletedUnits,
  });

  const metrics = getReversingMetrics(userId);
  const safeMetrics = metrics ?? {
    targetDestination,
    daysLeft: daysToDeadline,
    progressPercentage: Math.round((initialCompletedUnits / totalUnits) * 100),
    totalUnits,
    completedUnits: initialCompletedUnits,
    baselineScore: 50,
    deadlineTimestamp,
    updatedAt: now,
  };

  return {
    success: true,
    whisper,
    metrics: {
      targetDestination: safeMetrics.targetDestination,
      daysLeft: safeMetrics.daysLeft,
      progressPercentage: safeMetrics.progressPercentage,
      totalUnits: safeMetrics.totalUnits,
      completedUnits: safeMetrics.completedUnits,
    },
  };
}

/** WUXIAN 2.0 · 结合认知拓扑图初始化逆向计划 */
export async function reversePlanWithTopology(input: {
  userId: string;
  targetDestination: string;
  currentStatus: string;
  daysToDeadline: number;
}) {
  const base = await reversePlan(input);
  const topology = getCognitiveTopology(input.userId);
  return {
    ...base,
    topology: {
      nodeCount: topology.nodes.length,
      edgeCount: topology.edges.length,
      timeSlopeWeight: topology.timeSlopeWeight,
      gravityRelayStars: topology.gravityRelayStars,
    },
  };
}

