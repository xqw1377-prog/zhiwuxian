/**
 * WUXIAN · 认证路由
 */

import type { Application } from 'express';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { wrap, sendSuccess } from './shared';
import { validateBody } from '../middleware/validate';
import { isAuthRelaxed } from '../middleware/session-auth';
import { authBootstrapBodySchema } from '../schemas/auth';
import { z } from 'zod';
import { createSession, resolveSession, revokeAllSessions, revokeSession, getWalletSummary } from '../user-wallet';
import { ValidationError } from '../errors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const AUTH_DB_PATH = process.env.WUXIAN_DATA_DIR
  ? path.join(process.env.WUXIAN_DATA_DIR, 'auth.db')
  : './data/auth.db';

function getAuthDb(): Database.Database {
  const dir = path.dirname(AUTH_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(AUTH_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      user_id TEXT NOT NULL UNIQUE,
      role TEXT DEFAULT 'user',
      banned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  return db;
}

export function createAdminUser(email: string, password: string, displayName?: string): boolean {
  const db = getAuthDb();
  const existing = db.prepare('SELECT email FROM users WHERE email = ?').get(email);
  if (existing) return false;
  const passwordHash = hashPassword(password);
  const hint = `e-${createHash('sha256').update(email).digest('hex').slice(0, 10)}`;
  db.prepare(`INSERT INTO users (email, password_hash, display_name, user_id, role) VALUES (?, ?, ?, ?, 'admin')`).run(
    email, passwordHash, displayName || 'Admin', hint,
  );
  return true;
}

export function isAdminUser(userId: string): boolean {
  try {
    const db = getAuthDb();
    const row = db.prepare('SELECT role FROM users WHERE user_id = ?').get(userId) as { role: string } | undefined;
    return row?.role === 'admin';
  } catch { return false; }
}

export function isUserBanned(userId: string): boolean {
  try {
    const db = getAuthDb();
    const row = db.prepare('SELECT banned FROM users WHERE user_id = ?').get(userId) as { banned: number } | undefined;
    return row?.banned === 1;
  } catch { return false; }
}

export function getAuthDbPath(): string {
  return AUTH_DB_PATH;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const derived = scryptSync(password, salt, 64).toString('hex');
  if (derived.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(derived), Buffer.from(hash));
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  displayName: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function deviceScopedUserId(deviceId: string): string {
  return `d-${createHash('sha256').update(deviceId).digest('hex').slice(0, 10)}`;
}

function allowUserIdHint(): boolean {
  const flag = process.env.WUXIAN_BOOTSTRAP_ALLOW_USER_ID?.trim().toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return isAuthRelaxed();
}

function normalizeUserIdHint(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return '';
  if (v.length > 80) return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) return '';
  return v;
}

export function hasAnyAdminUser(): boolean {
  try {
    const db = getAuthDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
    return row.count > 0;
  } catch { return false; }
}

const setupAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  displayName: z.string().max(50).optional(),
});

export function registerAuthRoutes(app: Application): void {
  app.post('/api/v1/auth/register', validateBody(registerSchema), wrap((req, res) => {
    const { email, password, displayName } = req.body as z.infer<typeof registerSchema>;
    const db = getAuthDb();
    const existing = db.prepare('SELECT email FROM users WHERE email = ?').get(email);
    if (existing) throw new ValidationError('该邮箱已注册');
    const passwordHash = hashPassword(password);
    const hint = `e-${createHash('sha256').update(email).digest('hex').slice(0, 10)}`;
    const session = createSession(hint, displayName || email.split('@')[0]);
    db.prepare('INSERT INTO users (email, password_hash, display_name, user_id) VALUES (?, ?, ?, ?)').run(
      email, passwordHash, displayName || '', session.userId,
    );
    sendSuccess(res, { token: session.token, userId: session.userId, displayName: displayName || null });
  }));

  app.post('/api/v1/auth/login', validateBody(loginSchema), wrap((req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const db = getAuthDb();
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as { email: string; password_hash: string; display_name: string; user_id: string } | undefined;
    if (!row) throw new ValidationError('邮箱未注册');
    if (!verifyPassword(password, row.password_hash)) throw new ValidationError('密码错误');
    const session = createSession(row.user_id, row.display_name || undefined);
    sendSuccess(res, { token: session.token, userId: session.userId, displayName: row.display_name || null });
  }));

  app.get('/api/v1/auth/me', wrap((req, res) => {
    if (!req.wuxianSession) throw new ValidationError('未登录');
    const userId = req.wuxianSession.userId;
    const db = getAuthDb();
    const row = db
      .prepare('SELECT role FROM users WHERE user_id = ?')
      .get(userId) as { role: string } | undefined;
    const role = row?.role === 'admin' ? 'admin' : 'user';
    sendSuccess(res, {
      userId,
      displayName: req.wuxianSession.displayName || null,
      role,
      isAdmin: role === 'admin',
      wallet: getWalletSummary(userId),
    });
  }));

  app.post(
    '/api/v1/auth/bootstrap',
    validateBody(authBootstrapBodySchema),
    wrap((req, res) => {
      const body = req.body as {
        token?: string;
        userId?: string;
        deviceId?: string;
        displayName?: string;
      };

      const token = body.token ?? '';
      if (token) {
        const session = resolveSession(token);
        if (!session) throw new ValidationError('会话已失效，请重新引导');
        sendSuccess(res, {
          token,
          userId: session.userId,
          displayName: session.displayName,
          wallet: getWalletSummary(session.userId),
        });
        return;
      }

      const deviceId = body.deviceId
        ?? (typeof req.headers['x-wuxian-device'] === 'string' ? req.headers['x-wuxian-device'].trim() : '');
      const userHint = (allowUserIdHint() ? normalizeUserIdHint(body.userId) : '')
        || (deviceId ? deviceScopedUserId(deviceId) : '');
      const session = createSession(userHint || undefined, body.displayName);
      sendSuccess(res, {
        token: session.token,
        userId: session.userId,
        displayName: body.displayName ?? null,
        wallet: getWalletSummary(session.userId),
      });
    }),
  );

  app.post(
    '/api/v1/auth/logout',
    wrap((req, res) => {
      const token = req.wuxianSession?.token;
      if (!token) throw new ValidationError('缺少会话');
      revokeSession(token);
      sendSuccess(res, { ok: true });
    }),
  );

  app.post(
    '/api/v1/auth/revoke-all',
    wrap((req, res) => {
      const userId = req.wuxianSession?.userId;
      if (!userId) throw new ValidationError('缺少会话');
      const revoked = revokeAllSessions(userId);
      sendSuccess(res, { ok: true, revoked });
    }),
  );

  // 首次设置管理员（仅当无任何 admin 时可调用）
  app.post('/api/v1/auth/setup-admin', validateBody(setupAdminSchema), wrap((req, res) => {
    if (hasAnyAdminUser()) throw new ValidationError('已存在管理员，无法重复创建');
    const { email, password, displayName } = req.body as z.infer<typeof setupAdminSchema>;
    const ok = createAdminUser(email, password, displayName);
    if (!ok) throw new ValidationError('该邮箱已注册');
    sendSuccess(res, { ok: true, message: '管理员创建成功，请使用邮箱和密码登录' });
  }));
}
