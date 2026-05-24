/**
 * WUXIAN · 伴生作业纠偏 API
 * POST /api/v1/co-learn/monitor
 */

import {
  WuxianLiveCorrectionEngine,
  simulateFlowStroke,
  simulateStuckStroke,
  simulateDeadEndStroke,
  type RealtimePenStroke,
} from '../core/live-correction-engine';
import { getSession } from './deconstruct';
import { analyzeTalent } from './talent-radar';
import { resolveVideoClip } from './video-assimilation';
import { semanticMatch } from './public-course';
import { interactWithOrganism } from './evolutionary';
import { synchronizeTwin } from './cognitive-twin';

const engines = new Map<string, WuxianLiveCorrectionEngine>();

function getEngine(sessionId: string): WuxianLiveCorrectionEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new WuxianLiveCorrectionEngine());
  }
  return engines.get(sessionId)!;
}

export type CoLearnScenario = 'flow' | 'stuck' | 'dead_end' | 'custom';

export interface CoLearnMonitorRequest {
  sessionId: string;
  stroke?: RealtimePenStroke;
  scenario?: CoLearnScenario;
  simulate?: boolean;
}

export function monitorCoLearn(req: CoLearnMonitorRequest) {
  const session = getSession(req.sessionId);
  if (!session) throw new Error('[WUXIAN] Session not found');

  const engine = getEngine(req.sessionId);
  const userId = req.sessionId;

  let stroke: RealtimePenStroke;
  let IL = 0.65;

  if (req.stroke) {
    stroke = { ...req.stroke, userId: req.stroke.userId || userId };
  } else if (req.simulate !== false) {
    const scenario = req.scenario ?? 'stuck';
    if (scenario === 'flow') stroke = simulateFlowStroke(userId);
    else if (scenario === 'dead_end') stroke = simulateDeadEndStroke(userId);
    else stroke = simulateStuckStroke(userId);

    try {
      const talent = analyzeTalent({ sessionId: req.sessionId, simulate: true });
      IL = talent.data.metrics.intuitiveLeap;
      stroke.intuitiveLeapIndex = IL;
    } catch {
      stroke.intuitiveLeapIndex = IL;
    }
  } else {
    throw new Error('[WUXIAN] No pen stroke data provided');
  }

  if (!stroke.intuitiveLeapIndex) {
    stroke.intuitiveLeapIndex = IL;
  }

  const result = engine.monitorStepProgression(stroke);

  let videoClip = null;
  let publicCourseCard = null;

  if (result.signal.hasDeviation) {
    const topic = '矩阵行列式 高维矩阵叉乘 洛必达 导数';
    const matchRes = semanticMatch({ topic, minWormhole: 0.5 });
    if (matchRes.data.match.matched) {
      publicCourseCard = matchRes.data.match;
    } else {
      const clipRes = resolveVideoClip({ userId, topic, minWormholeValue: 0.5 });
      videoClip = clipRes.data.clip;
    }
  }

  let organismEvolution = null;
  let organismTentacles = null;
  let twinSync = null;
  try {
    const evoRes = interactWithOrganism({
      studentId: userId,
      stroke,
      cognitiveResonance: result.flowCelebration
        ? 'Breakthrough'
        : result.signal.hasDeviation
          ? 'Stuck'
          : 'Smooth',
    });
    organismEvolution = evoRes.data.evolution;
    organismTentacles = evoRes.data.tentacles;
  } catch {
    /* organism layer optional */
  }

  try {
    const twinRes = synchronizeTwin({
      studentId: userId,
      laTeXTrace: stroke.rawLogicalData,
      hesitationMs: Math.round(stroke.focusMetrics.hesitationSeconds * 1000),
      frictionCoefficient: Math.min(0.99, 1 - (stroke.focusMetrics.writingSpeed ?? 0.5)),
      writingVelocity: stroke.focusMetrics.writingSpeed,
      fatigueLevel: stroke.focusMetrics.flowState != null
        ? 1 - stroke.focusMetrics.flowState
        : undefined,
    });
    twinSync = twinRes.data.report;
  } catch {
    /* twin layer optional */
  }

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      correction: result,
      videoClip,
      publicCourseCard,
      organismEvolution,
      organismTentacles,
      twinSync,
      protocol: 'LIVE_CO_LEARNING_v2',
      principles: [
        'PRE_EMPTIVE_FAILURE_DETECTION',
        'MINIMAL_INTRUSION_RIPPLE',
        'DEGRADED_HINT_SCAFFOLDING',
        'DIGITAL_ORGANISM_EVOLUTION',
        'COGNITIVE_TWIN_SYNCHRONIZATION',
      ],
    },
  };
}
