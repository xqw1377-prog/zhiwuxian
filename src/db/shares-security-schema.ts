import { getLearningDb } from '../../server/wuxian-learning-db';

export type ShareTokenScope = 'shares' | 'report_poster' | 'parent_link';

export function initializeSharesSecuritySchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_token_policy (
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      token_version INTEGER DEFAULT 1,
      revoked_before INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_id, scope)
    );

    CREATE TABLE IF NOT EXISTS share_token_revoked (
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      jti TEXT NOT NULL,
      revoked_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_id, scope, jti)
    );
  `);
}

function normalizeScope(scope: string): ShareTokenScope {
  if (scope === 'report_poster') return 'report_poster';
  if (scope === 'parent_link') return 'parent_link';
  return 'shares';
}

export function ensureShareTokenPolicy(userId: string, scope: ShareTokenScope): void {
  const uid = userId.trim() || 'public';
  const sc = normalizeScope(scope);
  const db = getLearningDb();
  db.prepare(`
    INSERT OR IGNORE INTO share_token_policy (user_id, scope, token_version, revoked_before)
    VALUES (?, ?, 1, 0)
  `).run(uid, sc);
}

export function getShareTokenPolicy(userId: string, scope: ShareTokenScope): { tokenVersion: number; revokedBefore: number } {
  const uid = userId.trim() || 'public';
  const sc = normalizeScope(scope);
  ensureShareTokenPolicy(uid, sc);
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT token_version, revoked_before
    FROM share_token_policy
    WHERE user_id = ? AND scope = ?
  `).get(uid, sc) as { token_version: number; revoked_before: number } | undefined;
  return {
    tokenVersion: Math.max(1, Number(row?.token_version ?? 1)),
    revokedBefore: Math.max(0, Number(row?.revoked_before ?? 0)),
  };
}

export function revokeShareTokenJti(userId: string, scope: ShareTokenScope, jti: string): void {
  const uid = userId.trim() || 'public';
  const sc = normalizeScope(scope);
  const id = jti.trim();
  if (!id) return;
  ensureShareTokenPolicy(uid, sc);
  const db = getLearningDb();
  db.prepare(`
    INSERT OR IGNORE INTO share_token_revoked (user_id, scope, jti)
    VALUES (?, ?, ?)
  `).run(uid, sc, id);
}

export function isShareTokenJtiRevoked(userId: string, scope: ShareTokenScope, jti: string): boolean {
  const uid = userId.trim() || 'public';
  const sc = normalizeScope(scope);
  const id = jti.trim();
  if (!id) return false;
  ensureShareTokenPolicy(uid, sc);
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT jti FROM share_token_revoked WHERE user_id = ? AND scope = ? AND jti = ?
  `).get(uid, sc, id) as { jti: string } | undefined;
  return Boolean(row?.jti);
}

export function revokeShareTokensBefore(userId: string, scope: ShareTokenScope, revokedBeforeSec: number): void {
  const uid = userId.trim() || 'public';
  const sc = normalizeScope(scope);
  const ts = Math.max(0, Math.floor(revokedBeforeSec));
  ensureShareTokenPolicy(uid, sc);
  const db = getLearningDb();
  db.prepare(`
    UPDATE share_token_policy
    SET revoked_before = ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ? AND scope = ?
  `).run(ts, uid, sc);
}

export function rotateShareTokenVersion(userId: string, scope: ShareTokenScope): number {
  const uid = userId.trim() || 'public';
  const sc = normalizeScope(scope);
  ensureShareTokenPolicy(uid, sc);
  const db = getLearningDb();
  db.prepare(`
    UPDATE share_token_policy
    SET token_version = token_version + 1, updated_at = strftime('%s', 'now')
    WHERE user_id = ? AND scope = ?
  `).run(uid, sc);
  return getShareTokenPolicy(uid, sc).tokenVersion;
}
