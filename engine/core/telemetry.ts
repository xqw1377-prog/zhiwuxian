import { getPersistentTelemetryManager } from './telemetry-store';

export type TelemetryEventType =
  | 'BOOT'
  | 'VOICE_UTTERANCE'
  | 'PLAYBACK'
  | 'QUIZ'
  | 'VIDEO_ASSIMILATION'
  | 'CLIP_RESOLVED'
  | 'TASK_COMPLETED'
  | 'TASK_REROUTE'
  | 'WORMHOLE_WARP';

export interface TelemetryEvent<TPayload = unknown> {
  userId: string;
  sessionId?: string;
  ts: string;
  type: TelemetryEventType;
  payload?: TPayload;
}

export interface TelemetryIngestRequest {
  userId: string;
  sessionId?: string;
  events: Array<Omit<TelemetryEvent, 'userId' | 'sessionId'> & { userId?: string; sessionId?: string }>;
}

export interface TelemetryAggregate {
  userId: string;
  window: { from: string; to: string; events: number };
  metrics: {
    intuitiveLeap: number;
    patternSensitivity: number;
    foldRate: number;
    consistency: number;
    resilience: number;
  };
  evidence: Array<{
    ts: string;
    type: TelemetryEventType;
    summary: string;
    meta?: Record<string, unknown>;
  }>;
}

export class TelemetryManager {
  private store = getPersistentTelemetryManager();

  ingest(req: TelemetryIngestRequest): { accepted: number } {
    return this.store.ingest(req);
  }

  aggregate(userId: string, windowMs = 30 * 24 * 60 * 60 * 1000): TelemetryAggregate {
    return this.store.aggregate(userId, windowMs);
  }
}

let globalTelemetry: TelemetryManager | null = null;

export function getTelemetryManager(): TelemetryManager {
  if (!globalTelemetry) globalTelemetry = new TelemetryManager();
  return globalTelemetry;
}
