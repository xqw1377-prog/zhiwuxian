import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { resolveUserLlm } from './deepseek-client';
import { WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import { getReversingMatrixRow, initializeReversingMatrixSystem } from '../db/milestone-schema';
import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { upgradeDatabaseToTopology } from '../db/topology-schema';

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function clampFloat(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function newNodeId(): string {
  return `node_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export type PlannerMilestone = {
  title: string;
  isWeaknessTargeted: boolean;
};

export type PlannerResult = {
  success: boolean;
  difficultyIndex: number;
  timeSlopeWeight: number;
  timeSlopeSuggestion: string;
  milestones: PlannerMilestone[];
};

function fallbackPlan(input: { target: string; weak: string[]; scores: Record<string, string>; hours: number | null }): PlannerResult {
  const weak = input.weak.filter(Boolean).slice(0, 8);
  const base = 45 + weak.length * 6;
  const penalty = input.hours && input.hours < 2 ? 12 : 0;
  const difficultyIndex = clampInt(base + penalty, 1, 100, 70);
  const timeSlopeWeight = clampFloat(1 + difficultyIndex / 120, 0.8, 2.0, 1.2);
  const timeSlopeSuggestion = difficultyIndex >= 80 ? '高压因果纠缠推进' : '稳定推进';

  const milestones: PlannerMilestone[] = [];
  for (const w of weak) {
    milestones.push({ title: `攻坚块: ${w}`, isWeaknessTargeted: true });
  }
  milestones.push({ title: '攻坚块: 核心题型拆解与错因归档', isWeaknessTargeted: false });
  milestones.push({ title: '攻坚块: 模考节奏与时间分配压测', isWeaknessTargeted: false });

  const finalMilestones = milestones.slice(0, 8);
  return { success: true, difficultyIndex, timeSlopeWeight, timeSlopeSuggestion, milestones: finalMilestones };
}

async function llmPlan(input: {
  userId: string;
  target: string;
  weak: string[];
  scores: Record<string, string>;
  hours: number | null;
}): Promise<PlannerResult> {
  const llm = resolveUserLlm(input.userId);
  if (!llm) return fallbackPlan(input);

  const gw = await gatewayJsonCompletion<Partial<PlannerResult>>(input.userId, [
    {
      role: 'system',
      content: [
        '你是一个深谙备考与硬核自学的金牌魔鬼教练。',
        '对比用户的现状成绩、弱项标签、终极目标，生成一条因果通关路径。',
        '只返回 JSON，不要任何多余文本。',
        '{',
        '  "difficultyIndex": number,',
        '  "timeSlopeWeight": number,',
        '  "timeSlopeSuggestion": string,',
        '  "milestones": [',
        '    {"title": string, "isWeaknessTargeted": boolean}',
        '  ]',
        '}',
        '约束：difficultyIndex 1-100；timeSlopeWeight 0.8-2.0；milestones 5-8 个，标题必须是具体可执行的攻坚块。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【终极目标】:${input.target}`,
        `【现状成绩】:${JSON.stringify(input.scores)}`,
        `【核心弱项】:${JSON.stringify(input.weak)}`,
        `【日均可支配小时】:${input.hours ?? '未知'}`,
      ].join('\n'),
    },
  ], {
    traceId: `planner_${input.userId}`,
    flatWarp: { cost: WARP_COST.PLANNER_REGEN, reason: 'PLANNER_REGEN' },
  });

  if (!gw.chargeOk || !gw.data) return fallbackPlan(input);
  const parsed = gw.data;

  const milestonesRaw = Array.isArray((parsed as any).milestones) ? (parsed as any).milestones : [];
  const milestones: PlannerMilestone[] = milestonesRaw
    .map((m: any) => ({
      title: typeof m?.title === 'string' ? m.title.trim().slice(0, 120) : '',
      isWeaknessTargeted: Boolean(m?.isWeaknessTargeted),
    }))
    .filter((m: PlannerMilestone) => Boolean(m.title))
    .slice(0, 8);

  if (milestones.length < 3) return fallbackPlan(input);

  return {
    success: true,
    difficultyIndex: clampInt(parsed.difficultyIndex, 1, 100, 70),
    timeSlopeWeight: clampFloat((parsed as any).timeSlopeWeight, 0.8, 2.0, 1.2),
    timeSlopeSuggestion: typeof parsed.timeSlopeSuggestion === 'string' && parsed.timeSlopeSuggestion.trim()
      ? parsed.timeSlopeSuggestion.trim().slice(0, 32)
      : '稳定推进',
    milestones,
  };
}

export async function generateCustomPath(userId: string): Promise<PlannerResult> {
  const uid = userId.trim();
  if (!uid) throw new Error('缺少 userId');

  initializeReversingMatrixSystem();
  upgradeDatabaseToTopology();

  const matrix = getReversingMatrixRow(uid);
  const baselineRow = getBaselineStatus(uid);
  if (!matrix?.target_destination || !matrix.target_deadline_timestamp) throw new Error('缺少路径 A 航标');
  if (!baselineRow) throw new Error('缺少现状评估数据');

  const baseline = parseBaseline(baselineRow);
  const target = matrix.target_destination;

  let plan: PlannerResult;
  try {
    plan = await llmPlan({
      userId: uid,
      target,
      weak: baseline.weakSubjects,
      scores: baseline.currentScores,
      hours: baseline.estimatedHoursPerDay,
    });
  } catch {
    plan = fallbackPlan({
      target,
      weak: baseline.weakSubjects,
      scores: baseline.currentScores,
      hours: baseline.estimatedHoursPerDay,
    });
  }

  const db = getLearningDb();
  const milestones = plan.milestones.slice(0, 8);
  const totalUnits = Math.max(1, milestones.length);

  db.transaction(() => {
    db.prepare(`DELETE FROM cognitive_telemetry_logs WHERE user_id = ?`).run(uid);
    db.prepare(`DELETE FROM cognitive_topology_embeddings WHERE user_id = ?`).run(uid);
    db.prepare(`DELETE FROM cognitive_topology_nodes WHERE user_id = ?`).run(uid);

    const insert = db.prepare(`
      INSERT INTO cognitive_topology_nodes (node_id, user_id, parent_goal_id, node_title, status, hit_count)
      VALUES (?, ?, ?, ?, ?, 0)
    `);

    milestones.forEach((m, idx) => {
      insert.run(newNodeId(), uid, null, m.title, idx === 0 ? 'ACTIVE' : 'LOCKED');
    });

    db.prepare(`
      UPDATE goal_reversing_matrix
      SET total_cognitive_units = ?,
          completed_cognitive_units = 0,
          time_slope_weight = ?,
          difficulty_index = ?,
          updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(totalUnits, plan.timeSlopeWeight, plan.difficultyIndex, uid);
  })();

  return plan;
}

