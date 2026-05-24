import { getTelemetryManager } from './telemetry';

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
}

export interface RadarCardReport {
  userId: string;
  generatedAt: string;
  windowDays: number;
  axes: RadarAxis[];
  highlights: string[];
  evidence: Array<{ ts: string; type: string; summary: string }>;
}

export function generateRadarCard(userId: string, windowDays = 30): RadarCardReport {
  const telemetry = getTelemetryManager().aggregate(userId, windowDays * 24 * 60 * 60 * 1000);
  const m = telemetry.metrics;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const axes: RadarAxis[] = [
    { key: 'fold', label: '时间折叠率', value: clamp01(m.foldRate) },
    { key: 'il', label: '直觉跃迁(IL)', value: clamp01(m.intuitiveLeap) },
    { key: 'ps', label: '模式敏感(PS)', value: clamp01(m.patternSensitivity) },
    { key: 'consistency', label: '一致性', value: clamp01(m.consistency) },
    { key: 'resilience', label: '韧性', value: clamp01(m.resilience) },
  ];

  const highlights: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const best = [...axes].sort((a, b) => b.value - a.value)[0];
  const worst = [...axes].sort((a, b) => a.value - b.value)[0];
  if (best) highlights.push(`优势模态：${best.label} ${pct(best.value)}`);
  if (worst) highlights.push(`短板模态：${worst.label} ${pct(worst.value)}`);
  highlights.push(`证据链事件：${telemetry.window.events} 条（${windowDays} 天）`);

  return {
    userId,
    generatedAt: new Date().toISOString(),
    windowDays,
    axes,
    highlights,
    evidence: telemetry.evidence.map(e => ({ ts: e.ts, type: e.type, summary: e.summary })),
  };
}

