/** WUXIAN · 社交登录/微信 OAuth */

import type { Application } from 'express';
import { createHash } from 'crypto';
import { wrap, sendSuccess } from './shared';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { createSession } from '../user-wallet';
import { ValidationError } from '../errors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.WUXIAN_DATA_DIR || './data';
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';

function getSocialDb(): Database.Database {
  const p = path.join(DATA_DIR, 'auth.db');
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (provider, provider_user_id)
    )
  `);
  return db;
}

/**
 * 微信小程序登录
 * 前端 wx.login() → code → 服务器换 session_key + openid
 */
async function wechatCodeToOpenId(code: string): Promise<{ openid: string; unionid?: string; sessionKey: string }> {
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
    throw new ValidationError('微信登录未配置');
  }
  const res = await fetch(
    `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&js_code=${code}&grant_type=authorization_code`,
  );
  const json = await res.json() as { openid?: string; unionid?: string; session_key?: string; errcode?: number; errmsg?: string };
  if (json.errcode || !json.openid) {
    throw new ValidationError(`微信登录失败: ${json.errmsg || 'unknown'}`);
  }
  return { openid: json.openid, unionid: json.unionid, sessionKey: json.session_key || '' };
}

const wechatLoginSchema = z.object({ code: z.string().min(1), displayName: z.string().optional() });

export function registerSocialLoginRoutes(app: Application): void {
  // 微信小程序登录
  app.post('/api/v1/auth/social/wechat', validateBody(wechatLoginSchema), wrap(async (req, res) => {
    const { code, displayName } = req.body as z.infer<typeof wechatLoginSchema>;
    const { openid } = await wechatCodeToOpenId(code);

    const sdb = getSocialDb();
    const existing = sdb.prepare('SELECT user_id FROM social_accounts WHERE provider = ? AND provider_user_id = ?').get('wechat', openid) as { user_id: string } | undefined;

    if (existing) {
      const session = createSession(existing.user_id);
      sendSuccess(res, { token: session.token, userId: session.userId, isNew: false });
    } else {
      const hint = `wx-${createHash('sha256').update(openid).digest('hex').slice(0, 10)}`;
      const session = createSession(hint, displayName || '微信用户');
      sdb.prepare('INSERT INTO social_accounts (provider, provider_user_id, user_id, display_name) VALUES (?, ?, ?, ?)').run('wechat', openid, session.userId, displayName || '');
      sendSuccess(res, { token: session.token, userId: session.userId, isNew: true });
    }
  }));

  // 获取已绑定的社交账号列表
  app.get('/api/v1/auth/social/accounts', wrap((req, res) => {
    const userId = req.wuxianSession?.userId;
    if (!userId) throw new ValidationError('未登录');
    const sdb = getSocialDb();
    const accounts = sdb.prepare('SELECT provider, provider_user_id, display_name, avatar_url, created_at FROM social_accounts WHERE user_id = ?').all(userId);
    sendSuccess(res, { accounts });
  }));
}
