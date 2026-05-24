/**
 * WUXIAN · 感知器 API
 */

import { AwarenessSensor, simulateClassroomSession } from '../core/awareness-sensor';
import { WUXIAN_MANIFEST } from '../core/brand-manifest';
import { getSession } from './deconstruct';

const sensors = new Map<string, AwarenessSensor>();

function getSensor(sessionId: string): AwarenessSensor {
  if (!sensors.has(sessionId)) {
    sensors.set(sessionId, new AwarenessSensor());
  }
  return sensors.get(sessionId)!;
}

export interface AwarenessScanRequest {
  sessionId: string;
  subject?: string;
  simulateClass?: boolean;
  nearDeadEnd?: boolean;
}

export function scanAwareness(req: AwarenessScanRequest) {
  const session = getSession(req.sessionId);
  if (!session) throw new Error('[WUXIAN] Session not found');

  const sensor = getSensor(req.sessionId);
  const subject = req.subject ?? '当前学科';

  let classroom = null;
  if (req.simulateClass !== false) {
    const signals = simulateClassroomSession(subject);
    const absorptionRate = 60 + Math.floor(Math.random() * 45);
    classroom = sensor.ingestClassroom({
      sessionId: req.sessionId,
      subject,
      durationMinutes: 45,
      signals,
      absorptionRate,
    });
  }

  const glow = sensor.detectGlowCorrection(
    'current_step',
    '重新审视前提条件',
    req.nearDeadEnd ?? Math.random() > 0.6,
  );

  const report = sensor.generateReport(
    classroom,
    session.goal,
    session.life,
    glow.trigger ? glow : null,
  );

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      manifest: WUXIAN_MANIFEST.TAGLINE,
      report,
    },
  };
}

export { WUXIAN_MANIFEST };
