/**
 * WUXIAN · 遥测隐私白名单层
 * 在 ingest 入口前过滤敏感字段，确保只落库最小必要数据
 */

const ALLOWED_EVENT_TYPES = new Set([
  'page_view',
  'feature_usage',
  'video_play',
  'video_pause',
  'video_seek',
  'video_complete',
  'task_complete',
  'task_fail',
  'goal_deconstruct',
  'goal_reroute',
  'assimilate_video',
  'wormhole_activate',
  'chat_message',
  'tool_open',
  'tool_close',
  'exam_start',
  'exam_submit',
  'language_practice',
  'daily_review',
  'session_start',
  'session_end',
]);

const SENSITIVE_PATTERNS = [
  /\bpassword\b/i,
  /\btoken\b/i,
  /\bsecret\b/i,
  /\bkey\b/i,
  /\bcredential\b/i,
  /\bssn\b/i,
  /\bpassport\b/i,
  /\bid_card\b/i,
  /\bcredit_card\b/i,
  /\bphone\b/i,
  /\baddress\b/i,
];

interface TelemetryEvent {
  ts: string;
  type: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

function hasSensitiveContent(value: unknown): boolean {
  if (typeof value === 'string') {
    return SENSITIVE_PATTERNS.some((re) => re.test(value));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) => hasSensitiveContent(v));
  }
  return false;
}

function stripSensitiveFields(payload: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (SENSITIVE_PATTERNS.some((re) => re.test(k))) continue;
    if (typeof v === 'string' && v.length > 500) {
      cleaned[k] = v.slice(0, 500) + '...[truncated]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      cleaned[k] = stripSensitiveFields(v as Record<string, unknown>);
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

export function sanitizeTelemetryEvent(event: TelemetryEvent): TelemetryEvent | null {
  if (!event.type || !ALLOWED_EVENT_TYPES.has(event.type)) {
    console.warn(`[PrivacyTelemetry] 丢弃未注册事件类型: ${event.type}`);
    return null;
  }

  if (hasSensitiveContent(event)) {
    console.warn(`[PrivacyTelemetry] 检测到疑似敏感内容，已过滤事件: ${event.type}`);
    return null;
  }

  const safe: TelemetryEvent = {
    ts: event.ts,
    type: event.type,
  };
  if (event.payload) {
    safe.payload = stripSensitiveFields(event.payload);
  }

  return safe;
}

export function sanitizeTelemetryEvents(events: TelemetryEvent[]): TelemetryEvent[] {
  return events
    .map((e) => sanitizeTelemetryEvent(e))
    .filter((e): e is TelemetryEvent => e !== null);
}

export function registerCustomEventType(type: string): void {
  ALLOWED_EVENT_TYPES.add(type);
}

export function isEventTypeAllowed(type: string): boolean {
  return ALLOWED_EVENT_TYPES.has(type);
}
