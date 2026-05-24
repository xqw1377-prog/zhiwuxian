/**
 * WUXIAN · 全时空寄生 API
 * POST /api/v1/audio/assimilate
 */

import {
  WuxianAudioAssimilationEngine,
  simulateClassroomAudio,
  simulateWormholeReadyClassroom,
  type ClassroomAudioPayload,
} from '../core/audio-assimilation-engine';
import { getSession } from './deconstruct';

const engines = new Map<string, WuxianAudioAssimilationEngine>();

function getEngine(sessionId: string): WuxianAudioAssimilationEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new WuxianAudioAssimilationEngine());
  }
  return engines.get(sessionId)!;
}

export interface AudioAssimilateRequest {
  sessionId: string;
  payload?: ClassroomAudioPayload;
  simulate?: boolean;
  subject?: string;
  wormholeDemo?: boolean;
}

export function assimilateClassroomAudio(req: AudioAssimilateRequest) {
  const session = getSession(req.sessionId);
  if (!session) throw new Error('[WUXIAN] Session not found');

  const engine = getEngine(req.sessionId);

  let payload: ClassroomAudioPayload;

  if (req.payload) {
    payload = { ...req.payload, sessionId: req.sessionId };
  } else if (req.simulate !== false) {
    payload = req.wormholeDemo
      ? simulateWormholeReadyClassroom(req.sessionId, req.subject ?? 'CALCULUS')
      : simulateClassroomAudio(req.sessionId, req.subject ?? 'GEOMETRY');
  } else {
    throw new Error('[WUXIAN] No classroom audio payload provided');
  }

  const result = engine.assimilateClassroomAudio(payload);

  if (result.wormholeTriggered && result.wormholeJump) {
    session.dreamSpace.timeSlope.currentSlope = result.wormholeJump.newDailySlope;
    session.dreamSpace.goalBaseline.vector.evolutionPath =
      `audio-wormhole-${result.wormholeJump.nextKnowledgeNode}`;
  }

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      assimilation: result,
      protocol: 'AUDIO_ASSIMILATION_v1',
      layers: {
        layer1: 'LOGIC_BONE',
        layer2: 'BLIND_SPOT',
        layer3: 'WORMHOLE_GATEWAY',
      },
    },
  };
}
