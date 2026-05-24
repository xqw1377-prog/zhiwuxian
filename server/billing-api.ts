/**
 * WUXIAN · 双螺旋商业 API
 * 触点一：空间折叠算力 Warp Power
 * 触点二：认知诊断报告（社交裂变证书）
 */

import { getLearningDb, learningUid } from './wuxian-learning-db';
import { getCoreDb } from './wuxian-core-db';
import { buildReportPosterUrl } from './shares-signing';
import {
  consumeWarpMinutes,
  ensureWallet,
  getWalletSummary,
  addWarpMinutes,
  setWarpUnlimited,
} from './user-wallet';

export const MONTHLY_FREE_WARP_MINUTES = 60;
export const REPORT_UNLOCK_PRICE_CNY = 19.9;

export const WARP_PACKS = [
  { id: 'warp_10h', label: '10 小时硬核折叠包', priceCNY: 39, minutes: 600 },
  { id: 'warp_unlimited_month', label: '全时空折叠月卡', priceCNY: 99, unlimitedDays: 30 },
] as const;

export interface BillingAccount {
  userId: string;
  availableWarpMinutes: number;
  unlimitedUntil: string | null;
  totalWarpPurchased: number;
  lastMonthlyReset: string;
}

export interface ConsumeWarpResult {
  success: boolean;
  code?: 'INSUFFICIENT_WARP_POWER' | 'OK';
  remaining?: number;
  consumed?: number;
  unlimited?: boolean;
  msg?: string;
}

export interface CognitiveReportPreview {
  reportId: string;
  userId: string;
  goalId: string | null;
  ilPeak: number;
  psPeak: number;
  resilienceDensity: number;
  summaryText: string;
  isUnlocked: boolean;
  shareUrl: string | null;
  paymentRequired: boolean;
  price: string;
  msg: string;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function ensureBillingRow(userId: string) {
  ensureWallet(userId);
}

function applyMonthlyGrant(_userId: string): void {
  ensureWallet(_userId);
}

export function getBillingAccount(userId: string): BillingAccount {
  const w = getWalletSummary(userId);
  return {
    userId: w.userId,
    availableWarpMinutes: w.availableWarpMinutes,
    unlimitedUntil: w.unlimitedUntil,
    totalWarpPurchased: w.totalWarpPurchased,
    lastMonthlyReset: new Date().toISOString(),
  };
}

import { getQuantumExecutionStrategy } from '../src/api/user-api';

export function consumeWarpPower(input: {
  userId: string;
  videoDurationMinutes: number;
  goalId?: string;
  videoId?: string;
}): ConsumeWarpResult {
  const { userId, videoDurationMinutes, goalId, videoId } = input;
  if (!videoDurationMinutes || videoDurationMinutes <= 0) {
    throw new Error('videoDurationMinutes 必须 > 0');
  }

  ensureWallet(userId);

  const strategy = getQuantumExecutionStrategy(userId);
  if (!strategy.shouldChargeWarpMinutes) {
    const w = ensureWallet(userId);
    const msg = strategy.usesPrivateKey
      ? '已使用您的私有 API Key 执行同化，本次免扣 Warp 算力。'
      : strategy.isLifetime
        ? '终身认证会员：本次同化免扣 Warp 算力。'
        : '本次同化免扣 Warp 算力。';
    logWarpConsumption(userId, videoId, 0, w.warp_minutes, true);
    return {
      success: true,
      code: 'OK',
      remaining: w.warp_minutes,
      consumed: 0,
      unlimited: strategy.isLifetime || strategy.usesPrivateKey,
      msg,
    };
  }

  const db = getLearningDb();
  const result = db.transaction(() => {
    const consumed = consumeWarpMinutes(userId, videoDurationMinutes);
    if (!consumed.ok) return consumed;
    logWarpConsumption(userId, videoId, videoDurationMinutes, consumed.remaining, consumed.unlimited);
    return consumed;
  })();

  if (!result.ok) {
    return {
      success: false,
      code: 'INSUFFICIENT_WARP_POWER',
      remaining: result.remaining,
      msg: '空间折叠能量不足。当前剩余额度无法支撑该长视频的认知同化（Assimilation），请及时充值认知算力。',
    };
  }

  if (goalId) bumpGoalWarpConsumed(goalId, videoDurationMinutes);

  return {
    success: true,
    code: 'OK',
    remaining: result.remaining,
    consumed: videoDurationMinutes,
    unlimited: result.unlimited,
    msg: result.unlimited
      ? '全时空折叠月卡生效，本次同化免扣额度。'
      : `已消耗 ${videoDurationMinutes.toFixed(1)} 分钟折叠算力，剩余 ${result.remaining.toFixed(1)} 分钟。`,
  };
}

function logWarpConsumption(
  userId: string,
  videoId: string | undefined,
  minutes: number,
  remaining: number,
  unlimited: boolean,
): void {
  getLearningDb().prepare(`
    INSERT INTO warp_consumption_logs (id, user_id, video_id, minutes_consumed, remaining_after, unlimited_flag)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(learningUid(), userId, videoId ?? null, minutes, remaining, unlimited ? 1 : 0);
}

function bumpGoalWarpConsumed(goalId: string, minutes: number): void {
  const core = getCoreDb();
  const cols = core.prepare(`PRAGMA table_info(goals)`).all() as { name: string }[];
  if (cols.some(c => c.name === 'warp_power_consumed')) {
    core.prepare(`UPDATE goals SET warp_power_consumed = COALESCE(warp_power_consumed, 0) + ? WHERE id = ?`).run(minutes, goalId);
  }
}

export function purchaseWarpPack(userId: string, packId: string): BillingAccount & { pack: typeof WARP_PACKS[number] } {
  const pack = WARP_PACKS.find(p => p.id === packId);
  if (!pack) throw new Error(`未知算力包: ${packId}`);

  if ('minutes' in pack && pack.minutes) addWarpMinutes(userId, pack.minutes);
  if ('unlimitedDays' in pack && pack.unlimitedDays) setWarpUnlimited(userId, pack.unlimitedDays);

  return { ...getBillingAccount(userId), pack };
}

function computeTelemetryPeaks(userId: string) {
  const db = getLearningDb();
  const summary = db.prepare(`
    SELECT
      AVG(play_speed) as avg_speed,
      MAX(quiz_score) as max_score,
      AVG(quiz_score) as avg_quiz,
      AVG(interaction_latency) as avg_latency
    FROM cognitive_telemetry WHERE user_id = ?
  `).get(userId) as {
    avg_speed: number | null;
    max_score: number | null;
    avg_quiz: number | null;
    avg_latency: number | null;
  } | undefined;

  const quiz = summary?.max_score ?? summary?.avg_quiz ?? 0.85;
  const latency = summary?.avg_latency ?? 2500;
  const ilPeak = clamp01(quiz * 0.7 + Math.max(0, 1 - latency / 5000) * 0.3);

  const speed = summary?.avg_speed ?? 1.25;
  const psPeak = clamp01(Math.min(1, (0.5 * (speed >= 1.5 ? 1.2 : 1) * 1.3) / 0.78));

  return { ilPeak, psPeak };
}

function computeResilienceDensity(goalId: string | null): number {
  if (!goalId) return 0.72;
  const countRow = getCoreDb().prepare(
    `SELECT COUNT(*) as count FROM reroute_logs WHERE goal_id = ?`,
  ).get(goalId) as { count: number };
  const rerouteCount = countRow?.count ?? 0;
  return clamp01(Math.max(0.1, 1 - rerouteCount * 0.08));
}

export function generateCognitiveReport(input: {
  userId: string;
  goalId?: string;
  courseId?: string;
}): CognitiveReportPreview {
  const { userId, goalId, courseId } = input;
  const { ilPeak, psPeak } = computeTelemetryPeaks(userId);
  const resilienceDensity = computeResilienceDensity(goalId ?? null);

  const reportId = learningUid();
  const shareToken = learningUid().slice(0, 12);
  const summaryText = ilPeak >= 0.9
    ? '在本次对抗认知负荷的航程中，你展现出了远超同龄人的高阶模式敏感度。'
    : '你的认知波形呈现稳定的自学者模态，路径重路由韧性良好。';

  getLearningDb().prepare(`
    INSERT INTO cognitive_reports
      (id, user_id, goal_id, course_id, il_peak, ps_peak, resilience_density, is_unlocked, share_token, summary_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(reportId, userId, goalId ?? null, courseId ?? null, ilPeak, psPeak, resilienceDensity, shareToken, summaryText);

  return {
    reportId,
    userId,
    goalId: goalId ?? null,
    ilPeak,
    psPeak,
    resilienceDensity,
    summaryText,
    isUnlocked: false,
    shareUrl: null,
    paymentRequired: true,
    price: REPORT_UNLOCK_PRICE_CNY.toFixed(2),
    msg: '基础认知波形已生成。解锁完整 0.5px 极客星团拓扑报告及高清社交朋友圈分享卡片，请充值解锁。',
  };
}

export function unlockCognitiveReport(reportId: string, userId: string): CognitiveReportPreview {
  const db = getLearningDb();
  const row = db.prepare(`SELECT * FROM cognitive_reports WHERE id = ? AND user_id = ?`).get(reportId, userId) as {
    id: string;
    user_id: string;
    goal_id: string | null;
    course_id: string | null;
    il_peak: number;
    ps_peak: number;
    resilience_density: number;
    is_unlocked: number;
    share_token: string;
    summary_text: string;
  } | undefined;

  if (!row) throw new Error('报告不存在或无权访问');

  const ttlDaysRaw = Number(process.env.WUXIAN_REPORT_SHARE_TTL_DAYS);
  const ttlDays = Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0 ? ttlDaysRaw : 365;
  const shareUrl = buildReportPosterUrl(reportId, userId, ttlDays * 86400);
  db.prepare(`UPDATE cognitive_reports SET is_unlocked = 1, share_url = ? WHERE id = ?`).run(shareUrl, reportId);

  return {
    reportId: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    ilPeak: row.il_peak,
    psPeak: row.ps_peak,
    resilienceDensity: row.resilience_density,
    summaryText: row.summary_text,
    isUnlocked: true,
    shareUrl,
    paymentRequired: false,
    price: REPORT_UNLOCK_PRICE_CNY.toFixed(2),
    msg: '天赋拓扑原件已解锁。截图分享你的霓虹认知证书。',
  };
}

export function getCognitiveReport(reportId: string, userId?: string) {
  const row = getLearningDb().prepare(`SELECT * FROM cognitive_reports WHERE id = ?`).get(reportId) as {
    id: string;
    user_id: string;
    goal_id: string | null;
    course_id: string | null;
    il_peak: number;
    ps_peak: number;
    resilience_density: number;
    is_unlocked: number;
    share_token: string;
    share_url: string | null;
    summary_text: string;
    created_at: string;
  } | undefined;

  if (!row) return null;
  if (userId && row.user_id !== userId) return null;
  const ttlDaysRaw = Number(process.env.WUXIAN_REPORT_SHARE_TTL_DAYS);
  const ttlDays = Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0 ? ttlDaysRaw : 365;
  const signedShareUrl = row.is_unlocked === 1
    ? buildReportPosterUrl(row.id, row.user_id, ttlDays * 86400)
    : null;
  const shareUrl = row.is_unlocked === 1
    ? (signedShareUrl ?? row.share_url)
    : row.share_url;

  return {
    reportId: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    courseId: row.course_id,
    ilPeak: row.il_peak,
    psPeak: row.ps_peak,
    resilienceDensity: row.resilience_density,
    summaryText: row.summary_text,
    isUnlocked: row.is_unlocked === 1,
    shareUrl,
    shareToken: row.share_token,
    createdAt: row.created_at,
  };
}

export function verifyReportShareToken(reportId: string, token: string): boolean {
  const row = getLearningDb().prepare(
    `SELECT share_token, is_unlocked FROM cognitive_reports WHERE id = ?`,
  ).get(reportId) as { share_token: string; is_unlocked: number } | undefined;
  return !!row && row.is_unlocked === 1 && row.share_token === token;
}
