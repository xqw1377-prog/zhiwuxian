/** WUXIAN · 管理后台 API */

import type { Application } from 'express';
import { wrap, sendSuccess } from './shared';
import { requireAdmin } from '../middleware/admin-auth';
import { getAuthDbPath } from './auth.routes';
import { isUserBanned, isAdminUser } from './auth.routes';
import { ValidationError } from '../errors';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { queryCostAggregation, queryUserCostSummary, queryUserWarpSpend } from '../../src/db/cost-log-schema';
import { setDailyTokenCap, getDailyTokenCap } from '../../src/services/billing-hub';
import { queryWarpActivationCodes } from '../../src/db/warp-activation-schema';
import { ensureWarpLedger, grantWarpPoints, deductWarpPoints, getWarpLedger } from '../../src/db/relay-schema';
import { getUserLlmSnapshotAll, upsertUserLlmConfig, type LlmProviderId } from '../../src/db/user-llm-config-schema';
import { insertAdminWarpGrant, listAdminWarpGrants } from '../../src/db/admin-ops-schema';
import {
  adminRebuildUserLearningPath,
  getAdminUserLearningSnapshot,
  queryAdminZhiPlatformStats,
} from '../../src/services/admin-learning-ops';
import {
  getAdminFoldTimeUserMetrics,
  queryAdminFoldTimePlatform,
} from '../../src/services/admin-fold-time-metrics';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function openAuthDb(): Database.Database {
  const p = getAuthDbPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  return db;
}

/** 检查 learning.db 是否存在 */
function getLearningDbPath(): string {
  const dataDir = process.env.WUXIAN_DATA_DIR || './data';
  return path.join(dataDir, 'wuxian_learning.db');
}

function safeGet<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function openLearningDb(): Database.Database {
  const p = getLearningDbPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  return db;
}

export function registerAdminRoutes(app: Application): void {
  // ── 用户管理 ──────────────────────────────────────────────────────────────

  app.get('/api/v1/admin/users', requireAdmin, wrap((req, res) => {
    const db = openAuthDb();
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const role = String(req.query.role || '').trim();

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    if (search) {
      where += ' AND (email LIKE ? OR display_name LIKE ? OR user_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role === 'admin' || role === 'user') {
      where += ' AND role = ?';
      params.push(role);
    }

    const total = (db.prepare(`SELECT COUNT(*) as count FROM users ${where}`).get(...params) as { count: number }).count;
    const users = db.prepare(`SELECT email, display_name, user_id, role, banned, created_at, updated_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    sendSuccess(res, { users, total, page, limit, totalPages: Math.ceil(total / limit) });
  }));

  app.get('/api/v1/admin/users/:userId', requireAdmin, wrap((req, res) => {
    const db = openAuthDb();
    const user = db.prepare('SELECT email, display_name, user_id, role, banned, created_at, updated_at FROM users WHERE user_id = ?').get(req.params.userId);
    if (!user) throw new ValidationError('用户不存在');
    sendSuccess(res, { user });
  }));

  const updateRoleSchema = z.object({ role: z.enum(['user', 'admin']) });
  app.put('/api/v1/admin/users/:userId/role', requireAdmin, validateBody(updateRoleSchema), wrap((req, res) => {
    const db = openAuthDb();
    const { role } = req.body as z.infer<typeof updateRoleSchema>;
    const user = db.prepare('SELECT user_id FROM users WHERE user_id = ?').get(req.params.userId) as { user_id: string } | undefined;
    if (!user) throw new ValidationError('用户不存在');
    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE user_id = ?").run(role, req.params.userId);
    sendSuccess(res, { ok: true, userId: req.params.userId, role });
  }));

  const banSchema = z.object({ banned: z.boolean() });
  app.put('/api/v1/admin/users/:userId/ban', requireAdmin, validateBody(banSchema), wrap((req, res) => {
    const db = openAuthDb();
    const { banned } = req.body as z.infer<typeof banSchema>;
    const user = db.prepare('SELECT user_id FROM users WHERE user_id = ?').get(req.params.userId) as { user_id: string } | undefined;
    if (!user) throw new ValidationError('用户不存在');
    const actorId = req.wuxianSession?.userId;
    if (req.params.userId === actorId) throw new ValidationError('不能封禁自己');
    db.prepare('UPDATE users SET banned = ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(banned ? 1 : 0, req.params.userId);
    sendSuccess(res, { ok: true, userId: req.params.userId, banned });
  }));

  app.delete('/api/v1/admin/users/:userId', requireAdmin, wrap((req, res) => {
    const db = openAuthDb();
    const actorId = req.wuxianSession?.userId;
    if (req.params.userId === actorId) throw new ValidationError('不能删除自己');
    const result = db.prepare('DELETE FROM users WHERE user_id = ?').run(req.params.userId);
    if (result.changes === 0) throw new ValidationError('用户不存在');
    sendSuccess(res, { ok: true });
  }));

  // ── 收入与统计 ────────────────────────────────────────────────────────────

  app.get('/api/v1/admin/stats', requireAdmin, wrap((_req, res) => {
    const adb = openAuthDb();
    const totalUsers = (adb.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    const adminCount = (adb.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;
    const bannedCount = (adb.prepare('SELECT COUNT(*) as count FROM users WHERE banned = 1').get() as { count: number }).count;

    const billing = safeGet(() => {
      const ldb = new Database(getLearningDbPath());
      const totalWarp = (ldb.prepare('SELECT COALESCE(SUM(warp_minutes), 0) as total FROM unified_wallet').get() as { total: number }).total;
      const activeUsers = (ldb.prepare("SELECT COUNT(DISTINCT user_id) as count FROM billing_usage WHERE used_at > datetime('now', '-7 days')").get() as { count: number }).count;
      ldb.close();
      return { totalWarpPurchased: totalWarp, activeUsers7d: activeUsers };
    }, { totalWarpPurchased: 0, activeUsers7d: 0 });

    const zhi = safeGet(() => queryAdminZhiPlatformStats(), {
      learningPathUsers: 0,
      assessmentPapers7d: 0,
      pendingCoursewareReview: 0,
      paidOrders30d: 0,
      paidRevenueCny30d: 0,
    });

    const foldTime = safeGet(() => queryAdminFoldTimePlatform(30), null);

    sendSuccess(res, {
      totalUsers,
      adminCount,
      bannedCount,
      ...billing,
      zhi,
      foldTime: foldTime
        ? {
            okr: foldTime.okr,
            cohortCounts: foldTime.cohortCounts,
            loopCompletionRatePct: foldTime.loopCompletionRatePct,
            avgFoldIndexL2L3: foldTime.avgFoldIndexL2L3,
          }
        : null,
    });
  }));

  app.get('/api/v1/admin/stats/fold-time', requireAdmin, wrap((req, res) => {
    const limit = Math.min(200, Math.max(10, parseInt(String(req.query.limit)) || 80));
    sendSuccess(res, queryAdminFoldTimePlatform(limit));
  }));

  app.get('/api/v1/admin/metrics/users/:userId', requireAdmin, wrap((req, res) => {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) throw new ValidationError('缺少 userId');
    sendSuccess(res, getAdminFoldTimeUserMetrics(userId));
  }));

  app.get('/api/v1/admin/stats/revenue', requireAdmin, wrap((_req, res) => {
    const billing = safeGet(() => {
      const ldb = new Database(getLearningDbPath());
      const rows = ldb.prepare(`
        SELECT date(used_at) as day, SUM(warp_minutes) as warp, COUNT(DISTINCT user_id) as users
        FROM billing_usage
        WHERE used_at > datetime('now', '-30 days')
        GROUP BY date(used_at)
        ORDER BY day
      `).all() as { day: string; warp: number; users: number }[];
      const paidRows = ldb
        .prepare(
          `SELECT date(paid_at) as day, COUNT(*) as orders, COALESCE(SUM(amount_cny), 0) as revenue_cny
           FROM payment_orders
           WHERE status = 'PAID' AND paid_at > datetime('now', '-30 days')
           GROUP BY date(paid_at)
           ORDER BY day`,
        )
        .all() as { day: string; orders: number; revenue_cny: number }[];
      ldb.close();
      return { daily: rows, paidDaily: paidRows };
    }, { daily: [], paidDaily: [] });

    sendSuccess(res, billing);
  }));

  // ── ZHI 学习运营（对标主产品）────────────────────────────────────────────

  app.get('/api/v1/admin/learning/users/:userId', requireAdmin, wrap((req, res) => {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) throw new ValidationError('缺少 userId');
    sendSuccess(res, {
      ...getAdminUserLearningSnapshot(userId),
      foldTime: getAdminFoldTimeUserMetrics(userId),
    });
  }));

  app.post('/api/v1/admin/learning/users/:userId/rebuild-path', requireAdmin, wrap(async (req, res) => {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) throw new ValidationError('缺少 userId');
    const result = await adminRebuildUserLearningPath(userId);
    sendSuccess(res, result);
  }));

  app.get('/api/v1/admin/stats/system', requireAdmin, wrap((_req, res) => {
    const dbSize = safeGet(() => {
      const p = getLearningDbPath();
      return fs.existsSync(p) ? fs.statSync(p).size : 0;
    }, 0);

    sendSuccess(res, {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      dataDir: process.env.WUXIAN_DATA_DIR || './data',
      dbSize,
      paymentMode: process.env.WUXIAN_PAYMENT_MODE || 'simulate',
      stripe: !!process.env.STRIPE_SECRET_KEY,
      redis: !!process.env.REDIS_URL,
      otel: !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    });
  }));

  // ── LLM 成本管理 ───────────────────────────────────────────────────────────

  app.get('/api/v1/admin/llm/cost-aggregation', requireAdmin, wrap((_req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(String(_req.query.days)) || 30));
    const data = queryCostAggregation(days);
    sendSuccess(res, data);
  }));

  app.get('/api/v1/admin/llm/user-summary', requireAdmin, wrap((_req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(String(_req.query.days)) || 30));
    const data = queryUserCostSummary(days);
    sendSuccess(res, data);
  }));

  const tokenCapSchema = z.object({ userId: z.string().min(1), dailyTokenCap: z.number().int().min(0) });
  app.put('/api/v1/admin/llm/token-cap', requireAdmin, validateBody(tokenCapSchema), wrap((_req, res) => {
    const { userId, dailyTokenCap } = _req.body as z.infer<typeof tokenCapSchema>;
    setDailyTokenCap(userId, dailyTokenCap);
    sendSuccess(res, { ok: true, userId, dailyTokenCap });
  }));

  app.get('/api/v1/admin/payment/orders', requireAdmin, wrap((req, res) => {
    const status = String(req.query.status ?? '').trim().toUpperCase();
    const userId = String(req.query.userId ?? '').trim();
    const provider = String(req.query.provider ?? '').trim().toLowerCase();
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days)) || 30));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit)) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset)) || 0);

    const db = openLearningDb();
    try {
      const wheres: string[] = [`created_at > datetime('now', ?)`];
      const params: unknown[] = [`-${days} days`];
      if (status) { wheres.push('status = ?'); params.push(status); }
      if (userId) { wheres.push('user_id = ?'); params.push(userId); }
      if (provider) { wheres.push('payment_provider = ?'); params.push(provider); }
      const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

      const total = (db.prepare(`SELECT COUNT(*) as count FROM payment_orders ${where}`).get(...params) as { count: number }).count;
      const orders = db.prepare(`
        SELECT id, user_id, product_type, product_id, amount_cny, currency, status,
               payment_provider, payment_ref, third_party_tx_id, created_at, paid_at
        FROM payment_orders
        ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Record<string, unknown>[];

      sendSuccess(res, { orders, total, limit, offset, days });
    } finally {
      db.close();
    }
  }));

  app.get('/api/v1/admin/activation-codes', requireAdmin, wrap((req, res) => {
    const redeemedQ = String(req.query.redeemed ?? '').trim().toLowerCase();
    const redeemed =
      redeemedQ === '1' || redeemedQ === 'true'
        ? true
        : redeemedQ === '0' || redeemedQ === 'false'
          ? false
          : undefined;
    const redeemedBy = String(req.query.redeemedBy ?? '').trim();
    const codePrefix = String(req.query.codePrefix ?? '').trim();
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit)) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset)) || 0);
    const result = queryWarpActivationCodes({ redeemed, redeemedBy, codePrefix, limit, offset });
    sendSuccess(res, result);
  }));

  const grantWarpSchema = z.object({
    userId: z.string().min(1).max(80),
    amount: z.number().int().min(1).max(500_000),
    reason: z.string().max(40).optional(),
    note: z.string().max(200).optional(),
  });
  app.post('/api/v1/admin/warp/grant', requireAdmin, validateBody(grantWarpSchema), wrap((req, res) => {
    const { userId, amount, reason, note } = req.body as z.infer<typeof grantWarpSchema>;
    ensureWarpLedger(userId);
    const balance = grantWarpPoints(userId, amount);
    const adminUserId = req.wuxianSession?.userId ?? '';
    const audit = adminUserId ? insertAdminWarpGrant({ adminUserId, userId, amount, reason, note }) : null;
    sendSuccess(res, { ok: true, userId, granted: amount, balance, audit });
  }));

  const adjustWarpSchema = z.object({
    userId: z.string().min(1).max(80),
    amount: z.number().int().min(-500_000).max(500_000),
    reason: z.string().max(40).optional(),
    note: z.string().max(200).optional(),
  }).refine((v) => v.amount !== 0, { message: 'amount 不能为 0' });
  app.post('/api/v1/admin/warp/adjust', requireAdmin, validateBody(adjustWarpSchema), wrap((req, res) => {
    const { userId, amount, reason, note } = req.body as z.infer<typeof adjustWarpSchema>;
    ensureWarpLedger(userId);
    const nextBalance =
      amount > 0
        ? grantWarpPoints(userId, amount)
        : deductWarpPoints(userId, Math.abs(amount));
    const adminUserId = req.wuxianSession?.userId ?? '';
    const audit = adminUserId ? insertAdminWarpGrant({ adminUserId, userId, amount, reason, note }) : null;
    sendSuccess(res, { ok: true, userId, amount, balance: nextBalance, audit });
  }));

  app.get('/api/v1/admin/warp/grants', requireAdmin, wrap((req, res) => {
    const userId = String(req.query.userId ?? '').trim();
    const adminUserId = String(req.query.adminUserId ?? '').trim();
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit)) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset)) || 0);
    sendSuccess(res, listAdminWarpGrants({ userId, adminUserId, limit, offset }));
  }));

  app.get('/api/v1/admin/users/:userId/llm-snapshot', requireAdmin, wrap((req, res) => {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) throw new ValidationError('缺少 userId');
    sendSuccess(res, getUserLlmSnapshotAll(userId));
  }));

  app.get('/api/v1/admin/users/:userId/wallet-overview', requireAdmin, wrap((req, res) => {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) throw new ValidationError('缺少 userId');
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days)) || 7));
    const ledger = getWarpLedger(userId);
    const spend = queryUserWarpSpend(userId, days);
    sendSuccess(res, {
      userId,
      warpPoints: Number(ledger.available_warp_points ?? 0),
      invitationCode: ledger.invitation_code ?? '',
      spend,
    });
  }));

  app.delete('/api/v1/admin/users/:userId/llm-key', requireAdmin, wrap((req, res) => {
    const userId = String(req.params.userId ?? '').trim();
    const providerQ = String(req.query.provider ?? 'all').trim().toLowerCase();
    if (!userId) throw new ValidationError('缺少 userId');
    const providers: LlmProviderId[] =
      providerQ === 'qwen'
        ? ['qwen']
        : providerQ === 'deepseek'
          ? ['deepseek']
          : ['deepseek', 'qwen'];
    const result: Record<string, unknown> = {};
    providers.forEach((p) => {
      result[p] = upsertUserLlmConfig({ userId, provider: p, clearKey: true });
    });
    sendSuccess(res, { ok: true, userId, cleared: providers, result });
  }));
}
