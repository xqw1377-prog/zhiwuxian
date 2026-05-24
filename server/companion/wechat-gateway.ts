/**
 * 家长战报 · 微信 / 企业微信 Webhook 推送
 */

import type { DailyReportPayload } from './ZhiCompanionEngine';

export type WeChatPushPayload = {
  type: 'DAILY_REPORT';
  studentId: string;
  date: string;
  card: Record<string, unknown> | null;
  parentH5Url: string;
};

function buildParentH5Url(studentId: string): string {
  const base = (process.env.WUXIAN_FRONTEND_URL || 'http://localhost:3401').replace(/\/$/, '');
  const token = process.env.WUXIAN_PARENT_LINK_TOKEN?.trim();
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${base}/#/parent/${encodeURIComponent(studentId)}${q}`;
}

export async function pushDailyReportToWeChat(
  payload: DailyReportPayload,
  dateStr: string,
  card: Record<string, unknown> | null,
): Promise<{ sent: boolean; channel: string }> {
  const webhook = process.env.WECHAT_COMPANION_WEBHOOK_URL?.trim();
  const body: WeChatPushPayload = {
    type: 'DAILY_REPORT',
    studentId: payload.studentId,
    date: dateStr,
    card,
    parentH5Url: buildParentH5Url(payload.studentId),
  };

  if (!webhook) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[WeChat Gateway] 未配置 WEBHOOK，战报 H5:', body.parentH5Url);
    }
    return { sent: false, channel: 'none' };
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[WeChat Gateway] HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { sent: false, channel: 'webhook' };
    }
    console.log(`[WeChat Gateway] 已推送战报 → ${payload.studentId}`);
    return { sent: true, channel: 'webhook' };
  } catch (err) {
    console.warn('[WeChat Gateway] 推送失败:', err instanceof Error ? err.message : err);
    return { sent: false, channel: 'webhook' };
  }
}

export async function pushParentCheerToWeChat(
  studentId: string,
  message: string,
  fuelBonus: number,
): Promise<void> {
  const webhook = process.env.WECHAT_COMPANION_WEBHOOK_URL?.trim();
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'PARENT_CHEER',
        studentId,
        message,
        fuelBonus,
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* 非阻塞 */
  }
}
