/** WUXIAN · 密码找回 API */

import type { Application } from 'express';
import { randomBytes, createHash } from 'crypto';
import { wrap, sendSuccess } from './shared';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';
import { ValidationError } from '../errors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.WUXIAN_DATA_DIR || './data';

function getResetDb(): Database.Database {
  const p = path.join(DATA_DIR, 'auth.db');
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS reset_tokens (
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  return db;
}

const requestResetSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ token: z.string().min(1), password: z.string().min(6).max(128) });

export function registerPasswordResetRoutes(app: Application): void {
  app.post('/api/v1/auth/forgot-password', validateBody(requestResetSchema), wrap((req, res) => {
    const { email } = req.body as z.infer<typeof requestResetSchema>;
    const adb = new Database(path.join(DATA_DIR, 'auth.db'));
    const user = adb.prepare('SELECT email FROM users WHERE email = ?').get(email);
    adb.close();
    if (!user) {
      // 不暴露邮箱是否存在
      sendSuccess(res, { ok: true, message: '如果该邮箱已注册，重置链接已发送' });
      return;
    }
    const token = randomBytes(32).toString('hex');
    const rdb = getResetDb();
    rdb.prepare('DELETE FROM reset_tokens WHERE email = ?').run(email);
    rdb.prepare("INSERT INTO reset_tokens (email, token, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run(email, token);
    rdb.close();

    const front = process.env.WUXIAN_FRONTEND_URL?.trim();
    const resetLink = front
      ? `${front.replace(/\/$/, '')}/#/reset-password?token=${token}`
      : `${req.protocol}://${req.get('host')}/#/reset-password?token=${token}`;

    void import('../email-provider').then(({ sendEmail }) =>
      sendEmail({
        to: email,
        subject: 'WUXIAN ZHI · 重置密码',
        text: `请点击以下链接重置密码（1 小时内有效）：\n${resetLink}`,
      }),
    );

    sendSuccess(res, { ok: true, message: '如果该邮箱已注册，重置链接已发送' });
  }));

  app.post('/api/v1/auth/reset-password', validateBody(resetPasswordSchema), wrap((req, res) => {
    const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;
    const rdb = getResetDb();
    const row = rdb.prepare("SELECT email FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')").get(token) as { email: string } | undefined;
    if (!row) throw new ValidationError('重置链接已过期或无效');
    rdb.prepare('UPDATE reset_tokens SET used = 1 WHERE token = ?').run(token);
    rdb.close();

    const { scryptSync, randomBytes: rb } = require('crypto');
    const salt = rb(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    const passwordHash = `${salt}:${hash}`;

    const adb = new Database(path.join(DATA_DIR, 'auth.db'));
    adb.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE email = ?").run(passwordHash, row.email);
    adb.close();

    sendSuccess(res, { ok: true, message: '密码已重置，请使用新密码登录' });
  }));
}
