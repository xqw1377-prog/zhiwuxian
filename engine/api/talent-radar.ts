/**
 * WUXIAN · 天分捕获雷达 API
 */

import {
  WuxianTalentRadar,
  simulateTalentStream,
  type BehaviorStream,
  type TaskCategory,
} from '../core/talent-radar';
import { getSession } from './deconstruct';

const radars = new Map<string, WuxianTalentRadar>();

function getRadar(sessionId: string): WuxianTalentRadar {
  if (!radars.has(sessionId)) {
    radars.set(sessionId, new WuxianTalentRadar());
  }
  return radars.get(sessionId)!;
}

export interface TalentAnalyzeRequest {
  sessionId: string;
  stream?: BehaviorStream;
  simulate?: boolean;
  taskCategory?: TaskCategory;
}

export function analyzeTalent(req: TalentAnalyzeRequest) {
  const session = getSession(req.sessionId);
  if (!session) throw new Error('[WUXIAN] Session not found');

  const radar = getRadar(req.sessionId);

  const stream = req.stream ?? (req.simulate !== false
    ? simulateTalentStream(req.sessionId, req.taskCategory ?? 'SPATIAL_ART')
    : null);

  if (!stream) {
    throw new Error('[WUXIAN] No behavior stream provided');
  }

  const metrics = radar.getMetricsOnly(stream);
  const report = radar.analyzeBehaviorStream(stream);

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      metrics: {
        intuitiveLeap: metrics.IL,
        resilienceDensity: metrics.RD,
        patternSensitivity: metrics.PS,
        composite: metrics.composite,
      },
      talentDetected: !!report,
      report,
      awakeningTriggered: !!report,
    },
  };
}
