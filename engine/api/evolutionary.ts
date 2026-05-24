/**
 * WUXIAN · 数字生命体 API
 */

import {
  getEvolutionaryEngine,
  resonanceFromStroke,
  type InteractionEnergyStream,
  type OrganismKind,
} from '../core/evolutionary-engine';
import type { RealtimePenStroke } from '../core/live-correction-engine';

export interface OrganismInteractRequest {
  studentId: string;
  entityId?: string;
  timeSpentSeconds?: number;
  cognitiveResonance?: InteractionEnergyStream['cognitiveResonance'];
  handwrittenTraceComplexity?: number;
  laTeXTrace?: string;
  problemIndex?: number;
  stroke?: RealtimePenStroke;
  simulate?: boolean;
}

export function interactWithOrganism(req: OrganismInteractRequest) {
  const engine = getEvolutionaryEngine();

  let stream: InteractionEnergyStream;

  if (req.stroke) {
    const s = req.stroke;
    stream = {
      studentId: req.studentId,
      entityId: req.entityId,
      timeSpentSeconds: s.focusMetrics.hesitationSeconds,
      cognitiveResonance: resonanceFromStroke(
        s.focusMetrics.hesitationSeconds,
        s.focusMetrics.hesitationSeconds >= 10,
        s.focusMetrics.hesitationSeconds < 3,
      ),
      handwrittenTraceComplexity: Math.min(1, s.focusMetrics.writingSpeed / 100),
      laTeXTrace: s.rawLogicalData,
      problemIndex: s.currentStepIndex,
    };
  } else {
    stream = {
      studentId: req.studentId,
      entityId: req.entityId,
      timeSpentSeconds: req.timeSpentSeconds ?? 8,
      cognitiveResonance: req.cognitiveResonance ?? 'Smooth',
      handwrittenTraceComplexity: req.handwrittenTraceComplexity ?? 0.5,
      laTeXTrace: req.laTeXTrace,
      problemIndex: req.problemIndex,
    };
  }

  const evolution = engine.interact(stream);
  const tentacles = engine.attractOrganisms(stream.laTeXTrace ?? '', 3);

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      evolution,
      tentacles,
      poolStats: engine.getPoolStats(),
      philosophy: 'DIGITAL_ORGANISM_ZERO_STORAGE',
    },
  };
}

export function listOrganismPool(kind?: OrganismKind) {
  const engine = getEvolutionaryEngine();
  const organisms = engine.listPool(kind);

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      organisms: organisms.sort((a, b) => b.fitnessScore - a.fitnessScore),
      stats: engine.getPoolStats(),
    },
  };
}

export function attractOrganisms(laTeXTrace: string, limit = 3) {
  const engine = getEvolutionaryEngine();
  const tentacles = engine.attractOrganisms(laTeXTrace, limit);

  return {
    code: 200,
    status: 'SUCCESS',
    data: { tentacles, count: tentacles.length },
  };
}

export function getOrganism(entityId: string) {
  const engine = getEvolutionaryEngine();
  const organism = engine.getOrganism(entityId);

  if (!organism) {
    return { code: 404, status: 'NOT_FOUND', data: { message: '生命体不存在' } };
  }

  return { code: 200, status: 'SUCCESS', data: { organism } };
}
