import { createHash, randomBytes, randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function newBindCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function newParentId(): string {
  return randomUUID();
}

function newParentSessionToken(): string {
  return base64UrlEncode(randomBytes(32));
}

export type ParentBindingRow = {
  parent_id: string;
  student_id: string;
  student_label: string | null;
  class_name: string | null;
  created_at: number;
  revoked_at: number | null;
};

export function initializeParentBindingsSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS parent_bind_requests (
      code TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_label TEXT,
      class_name TEXT,
      created_by_user_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      used_by_parent_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_parent_bind_requests_student ON parent_bind_requests(student_id);

    CREATE TABLE IF NOT EXISTS parent_bindings (
      parent_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_label TEXT,
      class_name TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      revoked_at INTEGER,
      PRIMARY KEY (parent_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_parent_bindings_parent ON parent_bindings(parent_id);

    CREATE TABLE IF NOT EXISTS parent_sessions (
      token_hash TEXT PRIMARY KEY,
      token_prefix TEXT,
      parent_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_parent_sessions_parent ON parent_sessions(parent_id);
  `);
}

export function createParentBindRequest(input: {
  studentId: string;
  createdByUserId: string;
  expiresInSec?: number;
  studentLabel?: string | null;
  className?: string | null;
}): { code: string; expiresAtSec: number } {
  initializeParentBindingsSchema();
  const studentId = input.studentId.trim();
  const createdByUserId = input.createdByUserId.trim();
  if (!studentId) throw new Error('studentId 不能为空');
  if (!createdByUserId) throw new Error('createdByUserId 不能为空');
  const now = Math.floor(Date.now() / 1000);
  const expiresAtSec = now + Math.max(60, Math.min(7 * 86400, Math.floor(input.expiresInSec ?? 15 * 60)));
  const code = newBindCode();
  getLearningDb().prepare(`
    INSERT INTO parent_bind_requests (code, student_id, student_label, class_name, created_by_user_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, studentId, input.studentLabel ?? null, input.className ?? null, createdByUserId, expiresAtSec);
  return { code, expiresAtSec };
}

export function createParentSession(expiresInSec = 180 * 86400): { parentId: string; token: string; expiresAtSec: number } {
  initializeParentBindingsSchema();
  const parentId = newParentId();
  const token = newParentSessionToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAtSec = now + Math.max(3600, Math.min(3650 * 86400, Math.floor(expiresInSec)));
  const hash = tokenHash(token);
  getLearningDb().prepare(`
    INSERT INTO parent_sessions (token_hash, token_prefix, parent_id, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hash, token.slice(0, 8), parentId, expiresAtSec);
  return { parentId, token, expiresAtSec };
}

export function resolveParentSession(token: string): { ok: boolean; parentId?: string } {
  initializeParentBindingsSchema();
  const t = token.trim();
  if (!t) return { ok: false };
  const hash = tokenHash(t);
  const row = getLearningDb().prepare(`
    SELECT parent_id, expires_at, revoked_at FROM parent_sessions WHERE token_hash = ?
  `).get(hash) as { parent_id: string; expires_at: number; revoked_at: number | null } | undefined;
  if (!row) return { ok: false };
  if (row.revoked_at) return { ok: false };
  const now = Math.floor(Date.now() / 1000);
  if (Number(row.expires_at ?? 0) < now) return { ok: false };
  return { ok: true, parentId: String(row.parent_id) };
}

export function listParentBindings(parentId: string): ParentBindingRow[] {
  initializeParentBindingsSchema();
  const pid = parentId.trim();
  if (!pid) return [];
  return getLearningDb().prepare(`
    SELECT parent_id, student_id, student_label, class_name, created_at, revoked_at
    FROM parent_bindings
    WHERE parent_id = ? AND revoked_at IS NULL
    ORDER BY created_at DESC
  `).all(pid) as ParentBindingRow[];
}

export function claimParentBindCode(input: {
  code: string;
  parentId: string;
}): { ok: boolean; studentId?: string; studentLabel?: string | null; className?: string | null; error?: 'INVALID_CODE' | 'EXPIRED' | 'ALREADY_USED' } {
  initializeParentBindingsSchema();
  const code = input.code.trim();
  const parentId = input.parentId.trim();
  if (!code || !parentId) return { ok: false, error: 'INVALID_CODE' };

  const db = getLearningDb();
  const tx = db.transaction((c: string, pid: string) => {
    const row = db.prepare(`
      SELECT code, student_id, student_label, class_name, expires_at, used_at, used_by_parent_id
      FROM parent_bind_requests
      WHERE code = ?
    `).get(c) as {
      code: string;
      student_id: string;
      student_label: string | null;
      class_name: string | null;
      expires_at: number;
      used_at: number | null;
      used_by_parent_id: string | null;
    } | undefined;
    if (!row) return { ok: false as const, error: 'INVALID_CODE' as const };
    const now = Math.floor(Date.now() / 1000);
    if (Number(row.expires_at ?? 0) < now) return { ok: false as const, error: 'EXPIRED' as const };
    if (row.used_at && row.used_by_parent_id && row.used_by_parent_id !== pid) {
      return { ok: false as const, error: 'ALREADY_USED' as const };
    }

    db.prepare(`
      UPDATE parent_bind_requests
      SET used_at = COALESCE(used_at, strftime('%s', 'now')), used_by_parent_id = COALESCE(used_by_parent_id, ?)
      WHERE code = ?
    `).run(pid, c);

    db.prepare(`
      INSERT OR IGNORE INTO parent_bindings (parent_id, student_id, student_label, class_name)
      VALUES (?, ?, ?, ?)
    `).run(pid, row.student_id, row.student_label ?? null, row.class_name ?? null);

    return { ok: true as const, studentId: row.student_id, studentLabel: row.student_label ?? null, className: row.class_name ?? null };
  });

  return tx(code, parentId);
}

export function parentHasBinding(parentId: string, studentId: string): boolean {
  initializeParentBindingsSchema();
  const pid = parentId.trim();
  const sid = studentId.trim();
  if (!pid || !sid) return false;
  const row = getLearningDb().prepare(`
    SELECT 1 FROM parent_bindings
    WHERE parent_id = ? AND student_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).get(pid, sid) as { 1: number } | undefined;
  return Boolean(row);
}
