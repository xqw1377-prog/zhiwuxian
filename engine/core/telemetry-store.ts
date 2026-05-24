import type { TelemetryEvent, TelemetryEventType, TelemetryIngestRequest, TelemetryAggregate } from './telemetry';
import { insertBehavioralTelemetryEvents, listBehavioralTelemetryEvents } from '../../server/wuxian-learning-db';

export class PersistentTelemetryManager {
  ingest(req: TelemetryIngestRequest): { accepted: number } {
    const normalized = req.events.map(e => ({
      ts: e.ts,
      type: e.type,
      payload: e.payload,
    }));
    const accepted = insertBehavioralTelemetryEvents({
      userId: req.userId,
      sessionId: req.sessionId,
      events: normalized,
    });
    return { accepted };
  }

  aggregate(userId: string, windowMs = 30 * 24 * 60 * 60 * 1000): TelemetryAggregate {
    const now = Date.now();
    const from = new Date(now - windowMs).toISOString();
    const to = new Date(now).toISOString();
    const raw = listBehavioralTelemetryEvents(userId, from, to);
    const slice: TelemetryEvent[] = raw.map(r => ({
      userId: r.userId,
      sessionId: r.sessionId,
      ts: r.ts,
      type: r.type as TelemetryEventType,
      payload: r.payload,
    }));

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const warp = slice.filter(e => e.type === 'WORMHOLE_WARP').length;
    const reroutes = slice.filter(e => e.type === 'TASK_REROUTE').length;
    const completes = slice.filter(e => e.type === 'TASK_COMPLETED').length;
    const clips = slice.filter(e => e.type === 'CLIP_RESOLVED');

    const foldValues = clips
      .map(e => (e.payload as { wormholeValue?: number })?.wormholeValue)
      .filter((v): v is number => typeof v === 'number');
    const foldRate = foldValues.length
      ? clamp01(foldValues.reduce((s, v) => s + v, 0) / foldValues.length)
      : clamp01(warp / 6);

    const quizSignals = slice
      .filter(e => e.type === 'QUIZ')
      .map(e => {
        const p = (e.payload as { score?: number; latencyMs?: number }) ?? {};
        const s = typeof p.score === 'number' ? clamp01(p.score) : 0.6;
        const l = typeof p.latencyMs === 'number' ? clamp01(1 - p.latencyMs / 1500) : 0.5;
        return clamp01(0.65 * s + 0.35 * l);
      });
    const intuitiveLeap = quizSignals.length
      ? clamp01(quizSignals.reduce((s, v) => s + v, 0) / quizSignals.length)
      : clamp01(0.45 + warp * 0.04);

    const playback = slice.filter(e => e.type === 'PLAYBACK').map(e => (e.payload as Record<string, unknown>) ?? {});
    const psSignals = playback.map(p => {
      const skipCount = typeof p.skipCount === 'number' ? p.skipCount : 0;
      const playSpeed = typeof p.playSpeed === 'number' ? p.playSpeed : 1;
      return clamp01(0.55 + Math.min(0.35, skipCount * 0.04) + Math.min(0.25, (playSpeed - 1) * 0.18));
    });
    const patternSensitivity = psSignals.length
      ? clamp01(psSignals.reduce((s, v) => s + v, 0) / psSignals.length)
      : clamp01(0.5);

    const taskTotal = completes + reroutes;
    const consistency = taskTotal ? clamp01(completes / taskTotal) : clamp01(0.55);
    const resilience = taskTotal
      ? clamp01(0.6 + Math.min(0.35, reroutes * 0.03) - Math.min(0.25, (reroutes > 0 ? reroutes / Math.max(1, completes) : 0) * 0.1))
      : clamp01(0.55);

    const evidence: TelemetryAggregate['evidence'] = [];
    const pick = (e: TelemetryEvent, summary: string, meta?: Record<string, unknown>) => {
      evidence.push({ ts: e.ts, type: e.type, summary, meta });
    };

    for (const e of clips.slice(-3)) {
      const p = (e.payload as { cellName?: string; topic?: string; wormholeValue?: number; timestampStart?: number; durationSeconds?: number }) ?? {};
      pick(e, `切片投射：${p.cellName ?? p.topic ?? 'unknown'} · ${Math.round((p.wormholeValue ?? 0) * 100)}%`, {
        timestampStart: p.timestampStart,
        durationSeconds: p.durationSeconds,
      });
    }
    const lastQuiz = slice.filter(e => e.type === 'QUIZ').slice(-1)[0];
    if (lastQuiz) {
      const p = (lastQuiz.payload as { score?: number; latencyMs?: number }) ?? {};
      pick(lastQuiz, `高敏答题：score=${p.score ?? 'n/a'} · latency=${p.latencyMs ?? 'n/a'}ms`);
    }
    const lastReroute = slice.filter(e => e.type === 'TASK_REROUTE').slice(-1)[0];
    if (lastReroute) pick(lastReroute, '触发重路由：系统下调难度并重分配航线');
    const lastComplete = slice.filter(e => e.type === 'TASK_COMPLETED').slice(-1)[0];
    if (lastComplete) pick(lastComplete, '完成同化：任务能量被确认消耗');

    return {
      userId,
      window: { from, to, events: slice.length },
      metrics: { intuitiveLeap, patternSensitivity, foldRate, consistency, resilience },
      evidence,
    };
  }
}

let globalPersistentTelemetry: PersistentTelemetryManager | null = null;

export function getPersistentTelemetryManager(): PersistentTelemetryManager {
  if (!globalPersistentTelemetry) globalPersistentTelemetry = new PersistentTelemetryManager();
  return globalPersistentTelemetry;
}
