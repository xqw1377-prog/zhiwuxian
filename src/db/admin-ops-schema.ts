import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type AdminWarpGrantRow = {
  id: string;
  admin_user_id: string;
  user_id: string;
  amount: number;
  reason: string;
  note: string;
  created_at: number;
};

export function initializeAdminOpsSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_warp_grants (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_warp_grants_user ON admin_warp_grants(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_warp_grants_admin ON admin_warp_grants(admin_user_id, created_at);
  `);
}

export function insertAdminWarpGrant(input: {
  adminUserId: string;
  userId: string;
  amount: number;
  reason?: string;
  note?: string;
}): AdminWarpGrantRow {
  initializeAdminOpsSchema();
  const db = getLearningDb();
  const id = `awg_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const adminUserId = input.adminUserId.trim();
  const userId = input.userId.trim();
  const amount = Math.floor(Number(input.amount));
  const reason = (input.reason ?? '').trim().slice(0, 40);
  const note = (input.note ?? '').trim().slice(0, 200);
  const createdAt = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO admin_warp_grants (id, admin_user_id, user_id, amount, reason, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, adminUserId, userId, amount, reason, note, createdAt);

  return {
    id,
    admin_user_id: adminUserId,
    user_id: userId,
    amount,
    reason,
    note,
    created_at: createdAt,
  };
}

export function listAdminWarpGrants(options: {
  userId?: string;
  adminUserId?: string;
  limit?: number;
  offset?: number;
}): { rows: AdminWarpGrantRow[]; total: number } {
  initializeAdminOpsSchema();
  const db = getLearningDb();
  const userId = (options.userId ?? '').trim();
  const adminUserId = (options.adminUserId ?? '').trim();
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const wheres: string[] = ['1=1'];
  const params: unknown[] = [];
  if (userId) { wheres.push('user_id = ?'); params.push(userId); }
  if (adminUserId) { wheres.push('admin_user_id = ?'); params.push(adminUserId); }
  const where = `WHERE ${wheres.join(' AND ')}`;

  const total = (db.prepare(`SELECT COUNT(*) as count FROM admin_warp_grants ${where}`).get(...params) as { count: number }).count;
  const rows = db.prepare(`
    SELECT id, admin_user_id, user_id, amount, reason, note, created_at
    FROM admin_warp_grants
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as AdminWarpGrantRow[];

  return { rows, total };
}

