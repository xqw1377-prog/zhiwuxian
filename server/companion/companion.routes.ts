/**
 * WUXIAN · 亲密陪伴 / 家长微信端路由
 */

import type { Application } from 'express';
import { param, wrap, sendSuccess } from '../routes/shared';
import { ZhiCompanionEngine, type DailyReportPayload, type ParentCheerRequest } from './ZhiCompanionEngine';
import { createCheerSseEndpoint } from '../../src/services/parent-cheer-sse';
import { synthesizeDailyReportForStudent } from './companion-daily-synth';
import { listClassRoster, listClasses, upsertClassStudent } from './class-companion';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { verifyShareToken } from '../shares-signing';
import {
  claimParentBindCode,
  createParentBindRequest,
  createParentSession,
  listParentBindings,
  parentHasBinding,
  resolveParentSession,
} from '../../src/db/parent-bindings-schema';

function queryParam(req: { query: Record<string, unknown> }, key: string): string {
  const v = req.query[key];
  return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '';
}

function parentSessionToken(req: { headers: Record<string, unknown> }): string {
  const h = req.headers['x-parent-session'];
  return typeof h === 'string' ? h.trim() : '';
}

function verifyParentLinkToken(req: { query: Record<string, unknown> }, studentId: string): boolean {
  const t = queryParam(req, 't') || queryParam(req, 'token');
  if (!t) return false;
  const v = verifyShareToken(t);
  if (!v.ok) return false;
  if (v.scope !== 'parent_link') return false;
  if (v.uid !== studentId) return false;
  if ((v.key ?? '') !== studentId) return false;
  return true;
}

function requireParentAccess(
  req: { headers: Record<string, unknown>; query: Record<string, unknown> },
  studentId: string,
): { ok: boolean; parentId?: string } {
  const token = parentSessionToken(req);
  if (token) {
    const session = resolveParentSession(token);
    if (session.ok && session.parentId && parentHasBinding(session.parentId, studentId)) {
      return { ok: true, parentId: session.parentId };
    }
  }
  if (verifyParentLinkToken(req, studentId)) {
    return { ok: true };
  }
  return { ok: false };
}

const dailyReportSchema = z.object({
  goalId: z.string().min(1),
  studentId: z.string().min(1),
  knowledgePoints: z.array(z.string()).default([]),
  slopeChange: z.number().default(0),
  dreamSchoolDistance: z.number().default(0),
  zhiComment: z.string().default(''),
  effectiveMinutes: z.number().int().optional(),
  escapeCount: z.number().int().optional(),
  sessionBreakdown: z.object({
    reading: z.number().int().optional(),
    listening: z.number().int().optional(),
    speaking: z.number().int().optional(),
    writing: z.number().int().optional(),
  }).optional(),
});

const cheerSchema = z.object({
  goalId: z.string().min(1),
  studentId: z.string().min(1),
  message: z.string().min(1).max(200),
  fuelBonus: z.number().int().min(1).max(20).default(5),
  cheerStyle: z.enum(['FIRE', 'HEART', 'SHIELD']).default('FIRE'),
});

const bindRequestSchema = z.object({
  studentId: z.string().min(1),
  studentLabel: z.string().max(80).optional(),
  className: z.string().max(80).optional(),
  expiresInSec: z.number().int().min(60).max(7 * 86400).optional(),
});

const bindClaimSchema = z.object({
  code: z.string().min(1).max(80),
});

export function registerCompanionRoutes(app: Application): void {
  /**
   * 学生/老师端 → 创建一次性扫码绑定码（用于家长扫码关联）
   * POST /api/v1/companion/parent-bind/request
   */
  app.post('/api/v1/companion/parent-bind/request', validateBody(bindRequestSchema), wrap((req, res) => {
    const userId = req.wuxianSession?.userId ?? '';
    if (!userId) {
      res.status(401).json({ code: 401, status: 'UNAUTHORIZED', message: '请先登录' });
      return;
    }
    const body = req.body as z.infer<typeof bindRequestSchema>;
    const created = createParentBindRequest({
      studentId: body.studentId,
      createdByUserId: userId,
      expiresInSec: body.expiresInSec,
      studentLabel: body.studentLabel ?? null,
      className: body.className ?? null,
    });
    const base = (process.env.WUXIAN_FRONTEND_URL || 'http://localhost:3401').replace(/\/$/, '');
    const url = `${base}/#/parent/bind?code=${encodeURIComponent(created.code)}`;
    sendSuccess(res, { code: created.code, url, expiresAtSec: created.expiresAtSec });
  }));

  /**
   * 家长扫码 → 领取会话并建立绑定
   * POST /api/v1/companion/parent-bind/claim
   */
  app.post('/api/v1/companion/parent-bind/claim', validateBody(bindClaimSchema), wrap((req, res) => {
    const body = req.body as z.infer<typeof bindClaimSchema>;
    const incoming = parentSessionToken(req as any);
    const existing = incoming ? resolveParentSession(incoming) : { ok: false as const };
    const created = existing.ok ? null : createParentSession();
    const sessionToken = existing.ok ? incoming : (created?.token ?? '');
    const parentId = existing.ok ? (existing.parentId ?? '') : (created?.parentId ?? '');
    if (!parentId) {
      res.status(500).json({ code: 500, status: 'ERROR', message: '无法创建家长会话' });
      return;
    }
    const claimed = claimParentBindCode({ code: body.code, parentId });
    if (!claimed.ok) {
      res.status(403).json({ code: 403, status: 'FORBIDDEN', message: '绑定码无效或已过期' });
      return;
    }
    const bindings = listParentBindings(parentId);
    sendSuccess(res, {
      parentSession: sessionToken,
      students: bindings.map((b) => ({
        studentId: b.student_id,
        studentLabel: b.student_label,
        className: b.class_name,
      })),
    });
  }));

  /**
   * 家长端 → 查询已绑定学生列表
   * GET /api/v1/companion/parent/me
   */
  app.get('/api/v1/companion/parent/me', wrap((req, res) => {
    const token = parentSessionToken(req as any);
    const session = token ? resolveParentSession(token) : { ok: false as const };
    if (!session.ok || !session.parentId) {
      res.status(401).json({ code: 401, status: 'UNAUTHORIZED', message: '请先扫码关联' });
      return;
    }
    const bindings = listParentBindings(session.parentId);
    sendSuccess(res, {
      students: bindings.map((b) => ({
        studentId: b.student_id,
        studentLabel: b.student_label,
        className: b.class_name,
      })),
    });
  }));

  /**
   * 家长微信端 → 拉取孩子最新战报
   * GET /api/v1/companion/parent-view/:studentId
   */
  app.get('/api/v1/companion/parent-view/:studentId', wrap((req, res) => {
    const studentId = param(req.params.studentId as unknown as string | string[]);
    const auth = requireParentAccess(req as any, studentId);
    if (!auth.ok) {
      res.status(403).json({ code: 403, status: 'FORBIDDEN', message: '家长权限不足，请扫码关联后查看' });
      return;
    }
    const card = ZhiCompanionEngine.composeWeChatCard(studentId);
    if (!card) {
      return sendSuccess(res, { dashboard: null, message: '暂无战报数据' });
    }
    sendSuccess(res, { dashboard: card });
  }));

  /**
   * 家长微信端 → 点击鼓励按钮
   * POST /api/v1/companion/parent-cheer
   */
  app.post('/api/v1/companion/parent-cheer', validateBody(cheerSchema), wrap((req, res) => {
    const body = req.body as z.infer<typeof cheerSchema>;
    const auth = requireParentAccess(req as any, body.studentId);
    if (!auth.ok) {
      res.status(403).json({ code: 403, status: 'FORBIDDEN', message: '家长权限不足，请扫码关联后鼓励' });
      return;
    }
    const result = ZhiCompanionEngine.injectParentEncouragement(body as ParentCheerRequest);
    sendSuccess(res, {
      ok: true,
      message: '鼓励已穿越引力场，无感送达孩子屏幕！',
      ...result,
    });
  }));

  /**
   * 系统内部 → 生成每日战报（定时任务触发）
   * POST /api/v1/companion/daily-report
   */
  app.post('/api/v1/companion/synthesize/:studentId', wrap((req, res) => {
    const studentId = param(req.params.studentId as unknown as string | string[]);
    const ok = synthesizeDailyReportForStudent(studentId);
    sendSuccess(res, { ok, message: ok ? '战报已熔炼' : '跳过' });
  }));

  app.post('/api/v1/companion/daily-report', validateBody(dailyReportSchema), wrap((req, res) => {
    const body = req.body as z.infer<typeof dailyReportSchema>;
    ZhiCompanionEngine.generateDailyReport(body as DailyReportPayload);
    sendSuccess(res, { ok: true, message: '战报已生成' });
  }));

  /**
   * 家长/老师 → 查看历史战报
   * GET /api/v1/companion/reports/:studentId
   */
  app.get('/api/v1/companion/reports/:studentId', wrap((req, res) => {
    const studentId = param(req.params.studentId as unknown as string | string[]);
    const auth = requireParentAccess(req as any, studentId);
    if (!auth.ok) {
      res.status(403).json({ code: 403, status: 'FORBIDDEN', message: '家长权限不足，请扫码关联后查看' });
      return;
    }
    const limit = Math.min(90, Math.max(1, parseInt(String(req.query.limit)) || 14));
    const reports = ZhiCompanionEngine.getReportsHistory(studentId, limit);
    sendSuccess(res, { reports, total: reports.length });
  }));

  /**
   * 家长 → 查看月度/年度复盘
   * GET /api/v1/companion/recap/:studentId?days=30
   */
  app.get('/api/v1/companion/recap/:studentId', wrap((req, res) => {
    const studentId = param(req.params.studentId as unknown as string | string[]);
    const auth = requireParentAccess(req as any, studentId);
    if (!auth.ok) {
      res.status(403).json({ code: 403, status: 'FORBIDDEN', message: '家长权限不足，请扫码关联后查看' });
      return;
    }
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days)) || 30));
    const recap = ZhiCompanionEngine.getMacroRecap(studentId, days);
    sendSuccess(res, recap);
  }));

  /**
   * 学生端 SSE 推送（家长鼓励实时通知）
   * GET /api/v1/companion/cheer-stream?studentId=xxx
   */
  app.get('/api/v1/companion/cheer-stream', (req, res) => {
    createCheerSseEndpoint(req as any, res as any);
  });

  /** 机构 · 班级列表 */
  app.get('/api/v1/companion/classes', wrap((req, res) => {
    if (!req.wuxianSession?.userId) {
      res.status(401).json({ code: 401, status: 'UNAUTHORIZED', message: '请先登录' });
      return;
    }
    sendSuccess(res, { classes: listClasses() });
  }));

  /** 机构 · 班级花名册 + 家长链接 */
  app.get('/api/v1/companion/classes/:classId/roster', wrap((req, res) => {
    if (!req.wuxianSession?.userId) {
      res.status(401).json({ code: 401, status: 'UNAUTHORIZED', message: '请先登录' });
      return;
    }
    const classId = param(req.params.classId as unknown as string | string[]);
    sendSuccess(res, { classId, roster: listClassRoster(classId) });
  }));

  const rosterSchema = z.object({
    classId: z.string().min(1),
    className: z.string().optional(),
    studentId: z.string().min(1),
    studentLabel: z.string().optional(),
    parentPhone: z.string().optional(),
  });

  app.post('/api/v1/companion/classes/roster', validateBody(rosterSchema), wrap((req, res) => {
    if (!req.wuxianSession?.userId) {
      res.status(401).json({ code: 401, status: 'UNAUTHORIZED', message: '请先登录' });
      return;
    }
    const body = req.body as z.infer<typeof rosterSchema>;
    upsertClassStudent(body);
    sendSuccess(res, { ok: true, parentLink: listClassRoster(body.classId).find((r) => r.studentId === body.studentId) });
  }));
}
