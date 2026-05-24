/**
 * WUXIAN · 虫洞引擎 API
 */

import { getSession } from './deconstruct';
import {
  WuxianWormholeEngine,
  simulateWormholeReadyState,
  type LearningState,
} from '../core/wormhole-engine';

const engines = new Map<string, WuxianWormholeEngine>();

function getEngine(sessionId: string): WuxianWormholeEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new WuxianWormholeEngine());
  }
  return engines.get(sessionId)!;
}

export interface WormholeEvaluateRequest {
  sessionId: string;
  state?: LearningState;
  simulate?: boolean;
  currentNode?: string;
}

export function evaluateWormhole(req: WormholeEvaluateRequest) {
  const session = getSession(req.sessionId);
  if (!session) throw new Error('[WUXIAN] Session not found');

  const engine = getEngine(req.sessionId);

  let state: LearningState;

  if (req.state) {
    state = req.state;
  } else if (req.simulate !== false) {
    const nodeMap: Record<string, string> = {
      clearance: 'AP微积分-导数',
      creation: '初中几何-相似三角形',
      endurance: 'SAT阅读-逻辑推断',
      default: '全栈基础-HTML/CSS',
    };
    const node = req.currentNode ?? nodeMap[session.archetype] ?? 'AP微积分-导数';
    state = simulateWormholeReadyState(req.sessionId, node);
  } else {
    throw new Error('[WUXIAN] No learning state provided');
  }

  const result = engine.evaluateWormholeJump(state);

  if (result.isJumpTriggered) {
    session.dreamSpace.timeSlope.currentSlope = result.newDailySlope;
    session.dreamSpace.goalBaseline.vector.evolutionPath = `wormhole-${result.nextKnowledgeNode}`;
  }

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      wormhole: result,
      formula: 'S_g = S_base × (1 + I_L) × (A_rate / Risk_lazy)',
    },
  };
}
