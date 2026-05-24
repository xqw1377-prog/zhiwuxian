import { randomBytes } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { grantWarpPoints } from './relay-schema';

type ActivationCodeRow = {
  code: string;
  warp_amount: number;
  created_at: number;
  expires_at: number;
  redeemed_by: string | null;
  redeemed_at: number;
};

export function initializeWarpActivationSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS warp_activation_codes (
      code TEXT PRIMARY KEY,
      warp_amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER DEFAULT 0,
      redeemed_by TEXT,
      redeemed_at INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_warp_activation_redeemed_by ON warp_activation_codes(redeemed_by, redeemed_at);
  `);
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

function generateCode(): string {
  return `WUX-${randomBytes(6).toString('base64url').toUpperCase()}`;
}

export function createWarpActivationCodes(input: {
  warpAmount: number;
  count: number;
  expiresAtSec?: number;
}): string[] {
  initializeWarpActivationSchema();
  const amount = Math.floor(Number(input.warpAmount));
  const count = Math.floor(Number(input.count));
  const expiresAt = Math.floor(Number(input.expiresAtSec ?? 0));
  const createdAt = nowSec();

  const db = getLearningDb();
  const stmt = db.prepare(`
    INSERT INTO warp_activation_codes (code, warp_amount, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);

  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let ok = false;
    for (let j = 0; j < 12 && !ok; j++) {
      const code = generateCode();
      try {
        stmt.run(code, amount, createdAt, expiresAt);
        codes.push(code);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) throw new Error('FAILED_TO_GENERATE_CODE');
  }
  return codes;
}

export function redeemWarpActivationCode(input: { userId: string; code: string }): {
  granted: number;
  balance: number;
} {
  initializeWarpActivationSchema();
  const db = getLearningDb();
  const uid = input.userId.trim();
  const code = normalizeCode(input.code);
  const now = nowSec();

  const tx = db.transaction(() => {
    const row = db.prepare(`
      SELECT code, warp_amount, created_at, expires_at, redeemed_by, redeemed_at
      FROM warp_activation_codes
      WHERE code = ?
    `).get(code) as ActivationCodeRow | undefined;

    if (!row) throw new Error('INVALID_CODE');
    if (row.expires_at && row.expires_at > 0 && row.expires_at < now) throw new Error('EXPIRED_CODE');
    if (row.redeemed_by) throw new Error('CODE_ALREADY_REDEEMED');

    const upd = db.prepare(`
      UPDATE warp_activation_codes
      SET redeemed_by = ?, redeemed_at = ?
      WHERE code = ? AND redeemed_by IS NULL
    `).run(uid, now, code);
    if (upd.changes !== 1) throw new Error('CODE_ALREADY_REDEEMED');

    const balance = grantWarpPoints(uid, Number(row.warp_amount));
    return { granted: Number(row.warp_amount), balance };
  });

  return tx();
}

export function queryWarpActivationCodes(options: {
  redeemed?: boolean;
  redeemedBy?: string;
  codePrefix?: string;
  limit?: number;
  offset?: number;
}): { rows: ActivationCodeRow[]; total: number } {
  initializeWarpActivationSchema();
  const db = getLearningDb();
  const redeemed = options.redeemed;
  const redeemedBy = (options.redeemedBy ?? '').trim();
  const codePrefix = (options.codePrefix ?? '').trim().toUpperCase();
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 50)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const wheres: string[] = ['1=1'];
  const params: unknown[] = [];
  if (redeemed === true) wheres.push('redeemed_by IS NOT NULL');
  if (redeemed === false) wheres.push('redeemed_by IS NULL');
  if (redeemedBy) { wheres.push('redeemed_by = ?'); params.push(redeemedBy); }
  if (codePrefix) { wheres.push('code LIKE ?'); params.push(`${codePrefix}%`); }
  const where = `WHERE ${wheres.join(' AND ')}`;

  const total = (db.prepare(`SELECT COUNT(*) as count FROM warp_activation_codes ${where}`).get(...params) as { count: number }).count;
  const rows = db.prepare(`
    SELECT code, warp_amount, created_at, expires_at, redeemed_by, redeemed_at
    FROM warp_activation_codes
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as ActivationCodeRow[];

  return { rows, total };
}
