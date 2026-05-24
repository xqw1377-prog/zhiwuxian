import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync, readFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import {
  coreDeconstruct,
  coreReroute,
  coreNightPatrol,
  bridgeDeconstructResponse,
  bridgeRerouteResponse,
  coreListRerouteLogs,
  coreGetGoal,
} from './wuxian-core-api';
import { getCoreDb, todayStr } from './wuxian-core-db';
import type { PersonaVoiceType } from './persona-voices';
import { ValidationError, handleError } from './errors';
import { TOC_BLOCKED_PAGES, TOC_MANIFEST, isTocOnlyMode } from './toc-manifest';
import { getDataDir } from './data-path';
import { verifyShareToken } from './shares-signing';
import {
  WUXIAN_API_CORE,
  WUXIAN_API_ZHI,
  WUXIAN_PRODUCT_NAME,
  WUXIAN_PRODUCT_VERSION,
} from './product-version';
import { registerLegalSpaRedirects } from './legal-spa-redirects';

interface DashboardGoalRow {
  id: string;
  title: string;
  duration_days: number;
  remaining_days: number;
  drive_force: string;
  total_energy: number;
  current_slope: number;
  status: string;
  persona_type: string;
}

interface DashboardTaskRow {
  id: string;
  content: string;
  energy_cost: number;
  sequence_date: string;
  status: string;
}

const ROOT =
  process.env.WUXIAN_ROOT?.trim()
  || (existsSync(join(__dirname, '..', '..', 'web', 'dist', 'index.html'))
    ? join(__dirname, '..', '..')
    : join(__dirname, '..'));

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function wrap(handler: (req: Request, res: Response) => void | Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

function sendSuccess(res: Response, data: unknown) {
  res.json({ code: 200, status: 'SUCCESS', data });
}

function serveFile(res: Response, filePath: string, contentType = 'text/html; charset=utf-8') {
  if (!existsSync(filePath)) {
    res.status(404).json({ code: 404, error: 'NOT_FOUND' });
    return;
  }
  res.setHeader('Content-Type', contentType);
  res.end(readFileSync(filePath));
}

function boolEnv(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return fallback;
}

function sanitizeShareRelativePath(raw: string): string | null {
  const p = raw.trim().replace(/^\/+/, '');
  if (!p) return null;
  if (p.includes('\0')) return null;
  if (p.includes('..')) return null;
  if (/^[a-zA-Z]+:/.test(p)) return null;
  return p;
}

function resolveShareFile(relPath: string): string | null {
  const candidates = [
    resolve(join(getDataDir(), 'shares', relPath)),
    resolve(join(ROOT, 'public', 'shares', relPath)),
  ];
  for (const abs of candidates) {
    const allowed1 = resolve(join(getDataDir(), 'shares')) + sep;
    const allowed2 = resolve(join(ROOT, 'public', 'shares')) + sep;
    if (!abs.startsWith(allowed1) && !abs.startsWith(allowed2)) continue;
    if (existsSync(abs)) return abs;
  }
  return null;
}

const LEGACY_PAGE_ROUTES = [
  '/goal', '/dashboard', '/wuxian', '/wuxian-dashboard',
  '/wuxian-dashboard.html', '/app', '/app.html', '/organism',
  '/organism.html', '/index.html', '/brand', '/brand.html',
  '/lab', '/evolution-lab',
  '/evolution-lab.html', '/blueprint', '/blueprint.html',
  '/admin', '/admin.html', '/console', '/school-organism',
  '/school-organism.html', '/dreamer-twin', '/dreamer-twin.html',
];

const LEGACY_BLOCKED_PREFIXES = [
  '/api/admin',
  '/api/v1/school', '/api/v1/organism', '/api/v1/twin',
  '/api/v1/life/awareness', '/api/v1/co-learn',
];

export function createExpressApp(): express.Application {
  const app = express();
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/payment/webhook/')) {
      express.raw({ type: '*/*', limit: '512kb' })(req, res, next);
      return;
    }
    const jsonLimit = req.path.startsWith('/api/v1/topology/') ? '4mb' : '1mb';
    express.json({ limit: jsonLimit })(req, res, next);
  });
  app.use((req, res, next) => {
    const configured = process.env.WUXIAN_CORS_ORIGIN?.trim();
    const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    let allowOrigin = '';
    if (configured) {
      const allowed = configured.split(',').map(s => s.trim()).filter(Boolean);
      if (allowed.includes('*')) {
        allowOrigin = '*';
      } else if (requestOrigin && allowed.includes(requestOrigin)) {
        allowOrigin = requestOrigin;
        res.setHeader('Vary', 'Origin');
      }
    } else if (process.env.NODE_ENV !== 'production') {
      allowOrigin = '*';
    }
    if (!allowOrigin && requestOrigin && /^capacitor:\/\/|^ionic:\/\/|^http:\/\/localhost(:\d+)?$/.test(requestOrigin)) {
      allowOrigin = requestOrigin;
      res.setHeader('Vary', 'Origin');
    }
    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Wuxian-Session, X-Consent-Token, X-Wuxian-Userid, X-Wuxian-User-Id, X-Wuxian-Device');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  app.use((req, res, next) => {
    if (isTocOnlyMode()) {
      if (TOC_BLOCKED_PAGES.includes(req.path as typeof TOC_BLOCKED_PAGES[number])) {
        res.status(404).json({ code: 404, error: 'NOT_FOUND', hint: '纯 ToC 模式：此页面已收敛至核心驾驶舱' });
        return;
      }
    }
    if (LEGACY_BLOCKED_PREFIXES.some(p => req.path.startsWith(p))) {
      res.status(404).json({ code: 404, error: 'NOT_FOUND' });
      return;
    }
    next();
  });

  const sharesRequireToken = boolEnv('WUXIAN_SHARES_REQUIRE_TOKEN', process.env.NODE_ENV === 'production');
  if (sharesRequireToken) {
    app.get('/shares/:path(*)', wrap((req, res) => {
      const q = req.query as { t?: string };
      const token = typeof q.t === 'string' ? q.t.trim() : '';
      const v = token ? verifyShareToken(token) : { ok: false as const };
      if (!v.ok) {
        res.status(403).end('Forbidden');
        return;
      }
      if (v.scope !== 'shares') {
        res.status(403).end('Forbidden');
        return;
      }
      const rel = sanitizeShareRelativePath(v.key ?? '');
      if (!rel) {
        res.status(403).end('Forbidden');
        return;
      }
      const file = resolveShareFile(rel);
      if (!file) {
        res.status(404).end('Not found');
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const maxAge = Math.max(0, Math.min(3600, (v.expiresAtSec ?? now) - now));
      res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
      res.sendFile(file);
    }));
  } else {
    app.use('/shares', express.static(join(getDataDir(), 'shares'), { maxAge: '7d', dotfiles: 'deny' }));
    app.use('/shares', express.static(join(ROOT, 'public', 'shares'), { maxAge: '7d', dotfiles: 'deny' }));
  }
  app.use('/client', express.static(join(ROOT, 'client'), { maxAge: '1h', dotfiles: 'deny' }));

  app.use((req, res, next) => {
    const userId = req.wuxianSession?.userId || req.headers['x-wuxian-userid'] || req.query.userId;
    if (!userId && !req.path.startsWith('/api/')) {
      res.setHeader('X-WUXIAN-REQUIRED-AUTH', 'TRUE');
    }
    next();
  });

  getCoreDb();

  app.post('/api/v1/goal/deconstruct', wrap((req, res) => {
    const title = (req.body.goal ?? req.body.title ?? '').trim();
    const days = Number(req.body.totalDays ?? req.body.days);
    const driveForce = req.body.driveSource?.why ?? req.body.driveForce ?? '';
    const personaType = (req.body.personaType ?? 'BUDDY') as PersonaVoiceType;
    const templateId = typeof req.body.templateId === 'string' ? req.body.templateId.trim() : undefined;
    const userId = String(req.body.userId ?? '').trim();
    const directoryId = String(req.body.directoryId ?? '').trim();

    if (!title) throw new ValidationError('缺少目标 (goal / title)');
    if (!days || days < 1) throw new ValidationError('时间锚点必须 ≥ 1 天');

    const core = coreDeconstruct({ title, days, driveForce, personaType, templateId, userId, directoryId });
    res.json(bridgeDeconstructResponse(core, title, days));
  }));

  app.post('/api/v1/goal/reroute', wrap((req, res) => {
    const goalId = req.body.goalId ?? req.body.sessionId;
    if (!goalId) throw new ValidationError('缺少 goalId / sessionId');
    const taskId = req.body.failedTaskId ?? req.body.taskId;
    const todayCompleted = req.body.todayCompleted === true;
    if (todayCompleted && !taskId) throw new ValidationError('缺少 taskId：必须精准完成单个原子任务');

    const core = coreReroute({
      goalId,
      failedTaskId: taskId,
      reason: req.body.reason ?? req.body.userSignal,
      todayCompleted,
    });
    res.json(bridgeRerouteResponse(core));
  }));

  app.post('/api/v1/task/update', wrap((req, res) => {
    const goalId = (req.body.goalId ?? req.body.sessionId ?? '').trim();
    const taskId = (req.body.taskId ?? req.body.failedTaskId ?? '').trim();
    const status = String(req.body.status ?? '').toUpperCase().trim();
    const reason = req.body.reason ?? req.body.userSignal;
    if (!goalId) throw new ValidationError('缺少 goalId');
    if (!taskId) throw new ValidationError('缺少 taskId');
    if (status !== 'DONE' && status !== 'FAILED') throw new ValidationError('status 仅支持 DONE 或 FAILED');

    const core = coreReroute({
      goalId,
      failedTaskId: taskId,
      reason,
      todayCompleted: status === 'DONE',
    });
    res.json(bridgeRerouteResponse(core));
  }));

  app.post('/api/v1/patrol/night', wrap((req, res) => {
    const goalId = req.body.sessionId ?? req.body.goalId;

    if (goalId) {
      const core = coreReroute({
        goalId,
        reason: 'NIGHT_PATROL_SILENT_DETECT',
        todayCompleted: false,
      });
      res.json({
        code: 200,
        status: 'SUCCESS',
        data: {
          ...bridgeRerouteResponse(core).data,
          patrolType: core.silent ? 'SILENT_REROUTE' : 'BUBBLE_PUSH',
          msg: core.companionSpeech,
        },
      });
      return;
    }

    const patrol = coreNightPatrol();
    sendSuccess(res, patrol);
  }));

  app.post('/api/v1/patrol/night/batch', wrap((_req, res) => {
    sendSuccess(res, coreNightPatrol());
  }));

  app.get('/api/v1/goal/:sessionId/reroute-history', wrap((req, res) => {
    const sessionId = param(req.params.sessionId);
    const goal = coreGetGoal(sessionId);
    const logs = coreListRerouteLogs(sessionId);
    sendSuccess(res, { logs, goal, completionRate: 0 });
  }));

  app.get('/api/v1/goal/:goalId/dashboard', wrap((req, res) => {
    const goalId = param(req.params.goalId);
    if (!goalId) throw new ValidationError('缺少 goalId');
    const db = getCoreDb();
    const goal = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(goalId) as DashboardGoalRow | undefined;
    if (!goal) {
      res.status(404).json({ code: 404, error: 'NOT_FOUND', hint: 'Goal not found' });
      return;
    }
    const today = todayStr();
    const tasks = db.prepare(`SELECT * FROM tasks WHERE goal_id = ? AND sequence_date = ? ORDER BY rowid ASC`).all(goalId, today) as DashboardTaskRow[];
    const rows = db.prepare(`
      SELECT sequence_date,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as done_count
      FROM tasks
      WHERE goal_id = ? AND sequence_date <= ?
      GROUP BY sequence_date
      ORDER BY sequence_date DESC
      LIMIT 30
    `).all(goalId, today) as { sequence_date: string; failed_count: number; done_count: number }[];
    let continuousFailDays = 0;
    for (const row of rows) {
      if (row.done_count > 0) break;
      if (row.failed_count > 0) continuousFailDays += 1;
      else break;
    }
    const consumed = db.prepare(
      `SELECT COALESCE(SUM(energy_cost), 0) as consumed FROM tasks WHERE goal_id = ? AND status = 'DONE'`,
    ).get(goalId) as { consumed: number };
    const totalEnergy = Number(goal?.total_energy ?? 0);
    const remainingEnergy = Math.max(0, totalEnergy - Number(consumed.consumed ?? 0));
    const baseSlope = Number(goal?.current_slope ?? 0);
    const failPressure = Math.min(45, continuousFailDays * 18);
    const energyRatio = totalEnergy > 0 ? remainingEnergy / totalEnergy : 0;
    const energyPressure = Math.min(25, energyRatio * 18);
    const durationDays = Math.max(1, Number(goal?.duration_days ?? 1));
    const timePressure = Math.min(20, baseSlope / Math.max(totalEnergy / durationDays, 1) * 8);
    const statusPressure = String(goal?.status ?? '') === 'RISK_ALERT' ? 10 : 0;
    const deviationRisk = Math.min(99, Math.max(0, failPressure + energyPressure + timePressure + statusPressure));

    sendSuccess(res, {
      sessionId: goal.id,
      goalId: goal.id,
      goalVector: goal.title,
      category: /toefl|托福/i.test(goal.title) ? '🚀 90天托福极限破百战略舱' : '动态目标',
      totalDays: Number(goal.duration_days),
      durationDays: Number(goal.duration_days),
      timeSlope: Number(goal.current_slope).toFixed(4),
      energyTotal: Math.round(totalEnergy),
      todayTasks: tasks.map(t => ({
        id: t.id,
        desc: t.content,
        time: Math.round(Number(t.energy_cost)),
        scheduledAt: t.sequence_date === today ? '今日' : t.sequence_date,
        status: t.status,
      })),
      persona: {
        id: String(goal.persona_type || 'BUDDY'),
        name: String(goal.persona_type || 'BUDDY'),
        greeting: '已从数据库恢复目标驾驶舱。今天只需要推进一个原子任务。',
      },
      roadmap: [
        { phase: 1, name: '认知觉醒与基石搭建', daysOffset: Math.floor(Number(goal.duration_days) * 0.2), weight: '30%' },
        { phase: 2, name: '核心瓶颈攻坚', daysOffset: Math.floor(Number(goal.duration_days) * 0.6), weight: '40%' },
        { phase: 3, name: '极限冲刺与终局对齐', daysOffset: Math.floor(Number(goal.duration_days) * 0.9), weight: '30%' },
      ],
      decomposeNote: '已从 wuxian_core.db 恢复目标、任务、斜率与偏离风险',
      persisted: true,
      goal,
      today,
      tasks,
      deviationRisk,
      continuousFailDays,
      remainingEnergy,
    });
  }));

  app.get('/api/health', wrap(async (_req, res) => {
    const { getPipelineStatus } = await import('./video-pipeline');
    const pipeline = await getPipelineStatus();
    const hasCockpitDist = existsSync(join(ROOT, 'web', 'dist', 'index.html'));
    res.json({
      status: 'ok',
      product: WUXIAN_PRODUCT_NAME,
      version: WUXIAN_PRODUCT_VERSION,
      release: `${WUXIAN_PRODUCT_NAME} ${WUXIAN_PRODUCT_VERSION}`,
      engine: 'WuxianCoreEngine',
      api: {
        core: WUXIAN_API_CORE,
        zhi: WUXIAN_API_ZHI,
        legacy: ['v2', 'v3'],
      },
      entry: hasCockpitDist ? '/' : null,
      legal: hasCockpitDist
        ? { privacy: '/privacy', terms: '/terms', spaPrivacy: '/#/privacy', spaTerms: '/#/terms' }
        : null,
      storage: ['wuxian_core.db', 'wuxian_learning.db'],
      dataDir: getDataDir(),
      mode: isTocOnlyMode() ? 'toc' : 'internal',
      paymentMode: process.env.WUXIAN_PAYMENT_MODE ?? 'simulate',
      stripe: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not-configured',
      redis: process.env.REDIS_URL ? 'configured' : 'memory-fallback',
      otel: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 'configured' : 'not-configured',
      pipeline,
    });
  }));

  const legacyStaticRoot = join(ROOT, 'legacy', 'static');
  const legacyStaticOn =
    process.env.WUXIAN_LEGACY_STATIC === '1'
    || process.env.WUXIAN_LEGACY_STATIC?.trim().toLowerCase() === 'true';
  if (legacyStaticOn && existsSync(legacyStaticRoot)) {
    app.use('/legacy', express.static(legacyStaticRoot, { maxAge: '0' }));
  }

  const cockpitDist = join(ROOT, 'web', 'dist');
  const hasCockpit = existsSync(join(cockpitDist, 'index.html'));

  if (hasCockpit) {
    app.use('/assets', express.static(join(cockpitDist, 'assets'), { maxAge: '1h' }));
    app.get('/', wrap((_req, res) => serveFile(res, join(cockpitDist, 'index.html'))));
    registerLegalSpaRedirects(app);
    app.get(LEGACY_PAGE_ROUTES, wrap((req, res) => {
      if (req.path === '/dashboard' || req.path === '/wuxian-dashboard' || req.path === '/wuxian-dashboard.html') {
        res.redirect(302, '/#/');
        return;
      }
      res.redirect(302, '/');
    }));
    app.get('/wuxian-spec.css', wrap((_req, res) => {
      res.redirect(302, '/');
    }));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = handleError(err);
    res.status(status).json(body);
  });

  return app;
}
