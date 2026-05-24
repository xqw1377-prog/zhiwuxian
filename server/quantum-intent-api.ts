/**
 * WUXIAN · Quantum Intent API
 * 冰山之下：意图解析 + 同化 + 重路由
 * 冰山之上：极简 nextActionNode + 陪伴气泡
 */

import { coreDeconstruct, coreReroute, coreGetGoal, coreGetTodayTasks } from './wuxian-core-api';
import { getLearningDb, learningUid } from './wuxian-learning-db';
import { consumeWarpPower } from './billing-api';
import { generateCognitiveReport } from './billing-api';
import { ingestVideoFromUrl, knowledgeNodesToCells } from './video-pipeline';
import { syncAssimilationToLearningGraph } from './video-pointer-api';
import { assimilateVideo } from '../engine/api/video-assimilation';
import { CombinedPosterEngine } from '../src/services/poster-generator';
import {
  bumpReversingMatrixProgress,
  ensureMatrixForGoal,
} from '../src/db/milestone-schema';
import { runAdaptiveRadar, refineCompanionSpeech, type AdaptiveRadarResult } from '../src/services/adaptive-radar';
import { getReversingMetrics } from '../src/db/milestone-schema';
import { issueMedalForPoster } from '../src/api/relay-network-api';
import { buildShareUrl } from './shares-signing';

const COMPANION_NAME = '织者';
const posterEngine = new CombinedPosterEngine();

export interface QuantumAssimilateInput {
  rawInput: string;
  userId?: string;
  sessionId?: string;
}

export interface ActionNode {
  id: string;
  title: string;
  duration: string;
  minutes: number;
}

export interface RoadmapNode {
  title: string;
  phase: string;
}

export interface QuantumAssimilateOutput {
  success: boolean;
  intent: 'GOAL_DECONSTRUCT' | 'FATIGUE_REROUTE' | 'MIXED_ASSIMILATION';
  companionName: string;
  companionSpeech: string;
  nextActionNode: ActionNode;
  roadmapNodes: RoadmapNode[];
  timeSlope: string;
  sessionId: string;
  effect: 'NEON_BREATH' | 'SILENT_REROUTE';
  folded: boolean;
  cardUrl?: string;
  topologyWarning?: string;
  timeSlopeWeight?: number;
  gravityRelayStars?: number;
  medalVerifyUrl?: string;
  splitTriggered?: boolean;
  reversingMetrics?: {
    progressPercentage: number;
    totalUnits: number;
    completedUnits: number;
    daysLeft: number;
    targetDestination: string;
  };
}

export interface QuantumPulseOutput {
  shouldGreet: boolean;
  companionName: string;
  companionSpeech: string;
  effect: 'NONE' | 'SILENT_REROUTE' | 'GENTLE_BUBBLE';
  nextActionNode: ActionNode | null;
  sessionId: string | null;
  absentDays: number;
}

function ensurePulseRow(userId: string) {
  const db = getLearningDb();
  const row = db.prepare(`SELECT user_id FROM user_pulse WHERE user_id = ?`).get(userId);
  if (!row) {
    db.prepare(`INSERT INTO user_pulse (user_id, last_seen_at, consecutive_absent_days) VALUES (?, CURRENT_TIMESTAMP, 0)`).run(userId);
  }
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function extractGoalTitle(text: string): string {
  const ap = text.match(/AP\s*[\u4e00-\u9fa5a-zA-Z]+/i);
  if (ap) return ap[0].trim();
  const exam = text.match(/([\u4e00-\u9fa5a-zA-Z0-9]+(?:考试|破百|备考))/);
  if (exam) return exam[1];
  const want = text.match(/要(考|学|搞|冲)([\u4e00-\u9fa5a-zA-Z0-9\s]+)/);
  if (want) return want[2].trim().slice(0, 24);
  return text.trim().slice(0, 32) || '当前学习目标';
}

function extractDays(text: string): number {
  const month = text.match(/下个月|下月/);
  if (month) return 30;
  const d = text.match(/(\d+)\s*天/);
  if (d) return Math.max(1, Math.min(365, Number(d[1])));
  const m = text.match(/(\d+)\s*个?月/);
  if (m) return Math.max(1, Number(m[1]) * 30);
  return 30;
}

function extractPainPoint(text: string): string {
  const stuck = text.match(/([\u4e00-\u9fa5a-zA-Z]+)(听不懂|不会|卡住|彻底懵|搞不定)/);
  if (stuck) return `${stuck[1]}${stuck[2]}`;
  const block = text.match(/(函数|导数|积分|极限|矩阵|语法|阅读)[\u4e00-\u9fa5]*/);
  if (block) return block[0];
  return '';
}

function isFatigueSignal(text: string): boolean {
  return /累了|疲惫|摆烂|不想动|跳过|没上线|放弃了/.test(text);
}

function buildMicroNode(title: string, pain: string, minutes = 10): ActionNode {
  const focus = pain || title;
  return {
    id: learningUid(),
    title: pain
      ? `今日原子节点：${focus} 的 10 分钟微观拆解`
      : `今日原子节点：${title}`,
    duration: `${minutes} mins`,
    minutes,
  };
}

function toRoadmap(tasks: { desc: string }[], goalTitle: string): RoadmapNode[] {
  const items = tasks.slice(0, 3);
  if (items.length < 3) {
    return [
      { title: `通关：${goalTitle} 最小认知锚点`, phase: '折叠 1/3' },
      { title: painFallback(goalTitle), phase: '折叠 2/3' },
      { title: '复盘今日阻力并标记下一格', phase: '折叠 3/3' },
    ];
  }
  return items.map((t, i) => ({
    title: t.desc.replace(/^\[[^\]]+\]\s*/, '').slice(0, 48),
    phase: `折叠 ${i + 1}/3`,
  }));
}

function painFallback(goal: string): string {
  return `微观练习：${goal} 核心卡点的一图读懂`;
}

async function synthesizeLeapPoster(
  userId: string,
  whisper: string,
  userName?: string,
): Promise<{ cardUrl?: string; medalVerifyUrl?: string }> {
  try {
    const cardPath = await posterEngine.generateDynamicStarCard({
      userId,
      userName: userName?.trim() || '匿名自学者',
      currentWhisper: whisper,
    });
    const cardUrl = buildShareUrl(cardPath, 3600, userId);
    let medalVerifyUrl: string | undefined;
    try {
      medalVerifyUrl = issueMedalForPoster(userId, cardPath).verifyUrl;
    } catch {
      /* 勋章注册非阻断 */
    }
    return { cardUrl, medalVerifyUrl };
  } catch (err) {
    console.warn('[Quantum] 动态星卡合成失败:', err);
    return {};
  }
}

function fatigueLevelFromText(text: string): number {
  if (isFatigueSignal(text)) return 0.85;
  if (/累了|疲惫|卡住|听不懂/i.test(text)) return 0.55;
  return 0.3;
}

function attachRadarFields(
  userId: string,
  output: QuantumAssimilateOutput,
  radar: AdaptiveRadarResult,
  poster?: { cardUrl?: string; medalVerifyUrl?: string },
): QuantumAssimilateOutput {
  const metrics = getReversingMetrics(userId);
  return {
    ...output,
    companionSpeech: refineCompanionSpeech(output.companionSpeech, radar),
    topologyWarning: radar.topologyWarning,
    timeSlopeWeight: radar.timeSlopeWeight,
    gravityRelayStars: metrics?.gravityRelayStars ?? 0,
    cardUrl: poster?.cardUrl ?? output.cardUrl,
    medalVerifyUrl: poster?.medalVerifyUrl,
    splitTriggered: radar.splitTriggered,
    reversingMetrics: radar.metrics ?? (metrics ? {
      progressPercentage: metrics.progressPercentage,
      totalUnits: metrics.totalUnits,
      completedUnits: metrics.completedUnits,
      daysLeft: metrics.daysLeft,
      targetDestination: metrics.targetDestination,
    } : undefined),
  };
}

function displayNameFromUserId(userId: string): string {
  if (userId.startsWith('d-')) return '航道旅人';
  const short = userId.replace(/^u-/, '').slice(0, 8);
  return short ? `学员-${short}` : '匿名自学者';
}

export async function assimilateQuantum(input: QuantumAssimilateInput): Promise<QuantumAssimilateOutput> {
  const raw = (input.rawInput ?? '').trim();
  const userId = input.userId ?? 'anonymous';
  if (!raw) throw new Error('rawInput 不能为空');

  ensurePulseRow(userId);
  const db = getLearningDb();
  const radar = runAdaptiveRadar({
    userId,
    rawInput: raw,
    fatigueLevel: fatigueLevelFromText(raw),
    parentGoalId: input.sessionId ?? null,
  });

  const goalTitle = extractGoalTitle(raw);
  const days = extractDays(raw);
  const pain = extractPainPoint(raw);
  const url = extractUrl(raw);
  const fatigue = isFatigueSignal(raw);

  let sessionId = input.sessionId ?? '';
  let companionSpeech = '';
  let effect: QuantumAssimilateOutput['effect'] = 'NEON_BREATH';
  let intent: QuantumAssimilateOutput['intent'] = 'MIXED_ASSIMILATION';
  let nextActionNode: ActionNode;
  let roadmapNodes: RoadmapNode[] = [];
  let timeSlope = '0';

  if (fatigue && sessionId) {
    const reroute = coreReroute({ goalId: sessionId, reason: 'USER_FATIGUE_SIGNAL', todayCompleted: false });
    intent = 'FATIGUE_REROUTE';
    effect = 'SILENT_REROUTE';
    companionSpeech = '检测到重力异常，航线已自动修正。今天我们要完成的原子任务缩减了——准备好了就点亮它。';
    const task = reroute.nextTasks[0];
    nextActionNode = task
      ? { id: task.id, title: task.desc, duration: `${task.time} mins`, minutes: task.time }
      : buildMicroNode(goalTitle, pain, 5);
    roadmapNodes = reroute.nextTasks.slice(0, 3).map((t, i) => ({
      title: t.desc,
      phase: `修正 ${i + 1}/3`,
    }));
    timeSlope = reroute.newSlope.toFixed(4);
  } else {
    let ingestSource = 'intent';
    if (url) {
      const ingested = await ingestVideoFromUrl(url, sessionId || userId, userId);
      const warp = consumeWarpPower({
        userId,
        videoDurationMinutes: ingested.durationMinutes,
        goalId: sessionId || undefined,
        videoId: ingested.payload.videoId,
      });
      if (!warp.success) {
        companionSpeech = warp.msg ?? '折叠算力不足，请先充值。';
        nextActionNode = buildMicroNode(goalTitle, pain, 8);
        roadmapNodes = toRoadmap([], goalTitle);
        return {
          success: false,
          intent: 'MIXED_ASSIMILATION',
          companionName: COMPANION_NAME,
          companionSpeech,
          nextActionNode,
          roadmapNodes,
          timeSlope: '0',
          sessionId: sessionId || '',
          effect: 'NEON_BREATH',
          folded: false,
        };
      }

      await assimilateVideo({ userId, payload: ingested.payload, simulate: false, autoReserve: true });
      const graph = syncAssimilationToLearningGraph({
        userId,
        videoId: ingested.payload.videoId,
        title: ingested.payload.title ?? goalTitle,
        sourceUrl: url,
        estimatedDurationMin: ingested.durationMinutes,
        cells: knowledgeNodesToCells(ingested.knowledgeNodes),
      });
      ingestSource = ingested.source;
      sessionId = sessionId || graph.courseId;

      const first = ingested.cellsPreview[0];
      nextActionNode = {
        id: learningUid(),
        title: first ? `今日原子节点：${first.title}` : buildMicroNode(goalTitle, pain, 10).title,
        duration: '10 mins',
        minutes: 10,
      };
      roadmapNodes = ingested.cellsPreview.slice(0, 3).map((c, i) => ({
        title: c.title,
        phase: `折叠 ${i + 1}/3 · ${ingestSource}`,
      }));
      timeSlope = (ingested.durationMinutes / Math.max(days, 1)).toFixed(4);
      intent = 'MIXED_ASSIMILATION';
      companionSpeech = `时空折叠完成（${ingestSource}）。今天只需通关这个 ${nextActionNode.minutes} 分钟的微观拆解。其余的，交给我。`;

      db.prepare(`
        UPDATE user_pulse SET last_seen_at = CURRENT_TIMESTAMP, consecutive_absent_days = 0, active_goal_id = ?
        WHERE user_id = ?
      `).run(sessionId, userId);

      ensureMatrixForGoal(userId, goalTitle, days);
      bumpReversingMatrixProgress(userId, 2);
      const poster = await synthesizeLeapPoster(
        userId,
        companionSpeech,
        displayNameFromUserId(userId),
      );

      return attachRadarFields(userId, {
        success: true,
        intent,
        companionName: COMPANION_NAME,
        companionSpeech,
        nextActionNode,
        roadmapNodes,
        timeSlope,
        sessionId,
        effect,
        folded: true,
      }, radar, poster);
    }

    const driveForce = pain
      ? `卡点：${pain}。${raw.slice(0, 120)}`
      : raw.slice(0, 160);

    const core = coreDeconstruct({
      title: goalTitle,
      days,
      driveForce,
      personaType: 'BUDDY',
    });
    sessionId = core.goalId;
    timeSlope = core.metrics.timeSlope.toFixed(4);
    intent = url ? 'MIXED_ASSIMILATION' : 'GOAL_DECONSTRUCT';

    const micro = core.todayTasks[0];
    nextActionNode = micro
      ? { id: micro.id, title: micro.desc, duration: `${micro.time} mins`, minutes: micro.time }
      : buildMicroNode(goalTitle, pain);

    if (pain) {
      nextActionNode = buildMicroNode(goalTitle, pain, 10);
    }

    roadmapNodes = toRoadmap(core.todayTasks, goalTitle);

    companionSpeech = pain
      ? `时空折叠完成。今天只需通关这个 ${nextActionNode.minutes} 分钟的微观拆解——${pain} 这块，交给我。`
      : `时空折叠完成。今天只需通关这个 ${nextActionNode.minutes} 分钟的节点。其余的，交给我。`;
  }

  ensureMatrixForGoal(userId, goalTitle, days);
  bumpReversingMatrixProgress(userId, intent === 'FATIGUE_REROUTE' ? 1 : 2);

  db.prepare(`
    UPDATE user_pulse SET last_seen_at = CURRENT_TIMESTAMP, consecutive_absent_days = 0, active_goal_id = ?
    WHERE user_id = ?
  `).run(sessionId, userId);

  const poster = await synthesizeLeapPoster(
    userId,
    companionSpeech,
    displayNameFromUserId(userId),
  );

  return attachRadarFields(userId, {
    success: true,
    intent,
    companionName: COMPANION_NAME,
    companionSpeech,
    nextActionNode,
    roadmapNodes,
    timeSlope,
    sessionId,
    effect,
    folded: true,
  }, radar, poster);
}

export function pulseQuantum(userId: string, sessionId?: string): QuantumPulseOutput {
  ensurePulseRow(userId);
  const db = getLearningDb();

  const row = db.prepare(`SELECT * FROM user_pulse WHERE user_id = ?`).get(userId) as {
    last_seen_at: string;
    consecutive_absent_days: number;
    active_goal_id: string | null;
  };

  const goalId = sessionId ?? row.active_goal_id ?? '';
  const lastSeen = new Date(row.last_seen_at);
  const now = new Date();
  const absentDays = Math.floor((now.getTime() - lastSeen.getTime()) / (24 * 60 * 60 * 1000));

  db.prepare(`UPDATE user_pulse SET last_seen_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(userId);

  if (absentDays >= 3 && goalId) {
    const reroute = coreReroute({
      goalId,
      reason: 'ABSENT_GRAVITY_ANOMALY',
      todayCompleted: false,
    });
    db.prepare(`UPDATE user_pulse SET consecutive_absent_days = ? WHERE user_id = ?`).run(absentDays, userId);

    const task = reroute.nextTasks[0] ?? coreGetTodayTasks(goalId)[0];
    const nextActionNode: ActionNode | null = task
      ? {
          id: 'id' in task ? String((task as { id: string }).id) : learningUid(),
          title: 'content' in task
            ? String((task as { content: string }).content)
            : String((task as { desc: string }).desc),
          duration: '5 mins',
          minutes: 5,
        }
      : { id: learningUid(), title: '看这一张图，点亮今日唯一节点', duration: '5 mins', minutes: 5 };

    return {
      shouldGreet: true,
      companionName: COMPANION_NAME,
      companionSpeech: '检测到重力异常，航线已自动修正。今天我们要完成的原子任务缩减为：看这一张图。准备好了就点亮它。',
      effect: 'GENTLE_BUBBLE',
      nextActionNode,
      sessionId: goalId,
      absentDays,
    };
  }

  let nextActionNode: ActionNode | null = null;
  if (goalId) {
    const goal = coreGetGoal(goalId);
    const tasks = coreGetTodayTasks(goalId);
    const t = tasks.find(x => x.status === 'TODO') ?? tasks[0];
    if (t && goal) {
      nextActionNode = {
        id: t.id,
        title: t.content,
        duration: `${Math.round(t.energy_cost)} mins`,
        minutes: Math.round(t.energy_cost),
      };
    }
  }

  return {
    shouldGreet: absentDays >= 1,
    companionName: COMPANION_NAME,
    companionSpeech: absentDays >= 1
      ? '航线很稳。你只管往前走，掉队了，我来重算。'
      : '把链接、截图或你当下的状态扔进来。我来折叠时空。',
    effect: absentDays >= 1 ? 'NONE' : 'NONE',
    nextActionNode,
    sessionId: goalId || null,
    absentDays,
  };
}

export function completeQuantumNode(input: {
  userId: string;
  sessionId: string;
  nodeId?: string;
  userName?: string;
}): Promise<{ success: boolean; companionSpeech: string; cardUrl?: string; medalVerifyUrl?: string }> {
  const reroute = coreReroute({
    goalId: input.sessionId,
    todayCompleted: true,
  });
  ensurePulseRow(input.userId);
  getLearningDb().prepare(`
    UPDATE user_pulse SET last_seen_at = CURRENT_TIMESTAMP, consecutive_absent_days = 0 WHERE user_id = ?
  `).run(input.userId);

  bumpReversingMatrixProgress(input.userId, 1);
  const speech = reroute.companionSpeech || '节点已点亮。路径在往前走。';

  return synthesizeLeapPoster(
    input.userId,
    '因果链条已重组，进度条向前逼近。',
    input.userName,
  ).then((poster) => ({
    success: true,
    companionSpeech: speech,
    cardUrl: poster.cardUrl,
    medalVerifyUrl: poster.medalVerifyUrl,
  }));
}

export function generateQuantumStarCard(userId: string, sessionId?: string) {
  return generateCognitiveReport({ userId, goalId: sessionId });
}
