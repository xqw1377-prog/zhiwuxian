/**
 * WUXIAN · 遥测数据 TTL 清理（防止 SQLite 无限增长）
 */

import { getLearningDb } from './wuxian-learning-db';
import { getCoreDb } from './wuxian-core-db';

export interface TelemetryPurgeResult {
  cognitiveTelemetry: number;
  behavioralEvents: number;
  topologyLogs: number;
  warpConsumptionLogs: number;
  edgeUtterancesDeleted?: number;
  rerouteLogsDeleted?: number;
}

function retentionDays(): number {
  const v = Number(process.env.WUXIAN_TELEMETRY_RETENTION_DAYS);
  return Number.isFinite(v) && v >= 7 ? Math.floor(v) : 90;
}

function isoCutoff(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function unixCutoff(days: number): number {
  return Math.floor((Date.now() - days * 86400000) / 1000);
}

export function purgeStaleTelemetry(): TelemetryPurgeResult {
  const days = retentionDays();
  const iso = isoCutoff(days);
  const unix = unixCutoff(days);
  const learning = getLearningDb();

  const cognitiveTelemetry = learning.prepare(`
    DELETE FROM cognitive_telemetry WHERE timestamp < ?
  `).run(iso).changes;

  const behavioralEvents = learning.prepare(`
    DELETE FROM behavioral_telemetry_events WHERE ts < ?
  `).run(iso).changes;

  let topologyLogs = 0;
  try {
    topologyLogs = learning.prepare(`
      DELETE FROM cognitive_telemetry_logs WHERE created_at < ?
    `).run(unix).changes;
  } catch {
    /* 表可能尚未创建 */
  }

  const warpConsumptionLogs = learning.prepare(`
    DELETE FROM warp_consumption_logs WHERE timestamp < ?
  `).run(iso).changes;

  let edgeUtterancesDeleted = 0;
  try {
    edgeUtterancesDeleted = learning.prepare(`
      DELETE FROM edge_utterances WHERE ts < ?
    `).run(iso).changes;
  } catch { /* 表可能不存在 */ }

  let rerouteLogsDeleted = 0;
  try {
    rerouteLogsDeleted = getCoreDb().prepare(`
      DELETE FROM reroute_logs WHERE timestamp < ?
    `).run(iso).changes;
  } catch { /* 表可能不存在 */ }

  return { cognitiveTelemetry, behavioralEvents, topologyLogs, warpConsumptionLogs, edgeUtterancesDeleted, rerouteLogsDeleted };
}

const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function scheduleTelemetryMaintenance(): void {
  const run = () => {
    try {
      const r = purgeStaleTelemetry();
      const total = r.cognitiveTelemetry + r.behavioralEvents + r.topologyLogs + r.warpConsumptionLogs;
      if (total > 0) {
        console.log(
          `[WUXIAN] 遥测清理 (${retentionDays()}d): cognitive=${r.cognitiveTelemetry} behavioral=${r.behavioralEvents} topology=${r.topologyLogs} warp=${r.warpConsumptionLogs} edge=${r.edgeUtterancesDeleted ?? 0} reroute=${r.rerouteLogsDeleted ?? 0}`,
        );
      }
    } catch (err) {
      console.error('[WUXIAN] 遥测清理失败', err);
    }
  };

  run();
  setInterval(run, MAINTENANCE_INTERVAL_MS).unref?.();

  // core.db 无高频遥测表；预留扩展
  void getCoreDb();
}
