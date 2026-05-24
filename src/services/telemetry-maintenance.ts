import { getLearningDb } from '../../server/wuxian-learning-db';

const RETENTION_DAYS_DEFAULT = 90;
const GC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

interface CleanupReport {
  telemetryEventsRemoved: number;
  edgeUtterancesRemoved: number;
  oldRerouteLogsRemoved: number;
  oldGraphVersionsRemoved: number;
  duration: number;
}

function getRetentionDays(): number {
  return envInt('WUXIAN_TELEMETRY_RETENTION_DAYS', RETENTION_DAYS_DEFAULT);
}

function getGraphVersionRetentionDays(): number {
  return envInt('WUXIAN_GRAPH_VERSION_RETENTION_DAYS', 30);
}

export function runTelemetryCleanup(): CleanupReport {
  const start = Date.now();
  const db = getLearningDb();
  const retention = getRetentionDays();
  const graphRetention = getGraphVersionRetentionDays();
  const cutoff = daysAgo(retention);
  const graphCutoff = daysAgo(graphRetention);

  const telemetryEventsRemoved = db.prepare(
    'DELETE FROM behavioral_telemetry_events WHERE ts < ?'
  ).run(cutoff).changes;

  const edgeUtterancesRemoved = db.prepare(
    'DELETE FROM edge_utterances WHERE ts < ?'
  ).run(cutoff).changes;

  const oldRerouteLogsRemoved = db.prepare(
    'DELETE FROM reroute_logs WHERE timestamp < ?'
  ).run(cutoff).changes;

  let oldGraphVersionsRemoved = 0;

  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_graph_versions'").get()) {
    oldGraphVersionsRemoved = db.prepare(
      'DELETE FROM knowledge_graph_versions WHERE created_at < ?'
    ).run(graphCutoff).changes;
  }

  const duration = Date.now() - start;

  const report: CleanupReport = {
    telemetryEventsRemoved,
    edgeUtterancesRemoved,
    oldRerouteLogsRemoved,
    oldGraphVersionsRemoved,
    duration,
  };

  console.log(`[TelemetryMaintenance] 清理完成: ${JSON.stringify(report)}`);
  return report;
}

let gcTimer: ReturnType<typeof setInterval> | null = null;

export function startTelemetryMaintenance(): void {
  if (gcTimer) return;

  console.log(`[TelemetryMaintenance] 启动定时清理 (间隔: ${GC_INTERVAL_MS}ms, 遥测保留: ${getRetentionDays()}天)`);
  runTelemetryCleanup();
  gcTimer = setInterval(runTelemetryCleanup, GC_INTERVAL_MS);
}

export function stopTelemetryMaintenance(): void {
  if (gcTimer) {
    clearInterval(gcTimer);
    gcTimer = null;
  }
}
