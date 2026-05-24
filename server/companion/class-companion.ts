/**
 * 班级 / 机构 · 家长链接批量生成
 */

import { getLearningDb } from '../wuxian-learning-db';
import { ensureCompanionSchema } from './companion-schema';
import { getCoreDb } from '../wuxian-core-db';
import { signParentLinkToken } from '../shares-signing';

export function ensureClassCompanionSchema(): void {
  const db = getCoreDb();
  ensureCompanionSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS companion_class_roster (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id TEXT NOT NULL,
      class_name TEXT NOT NULL DEFAULT '',
      student_id TEXT NOT NULL,
      student_label TEXT NOT NULL DEFAULT '',
      parent_phone TEXT DEFAULT '',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(class_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_class_roster_class ON companion_class_roster(class_id);
  `);
}

function parentLink(studentId: string): string {
  const base = (process.env.WUXIAN_FRONTEND_URL || 'http://localhost:3401').replace(/\/$/, '');
  const signed = signParentLinkToken(studentId, 180 * 86400);
  return `${base}/#/parent/${encodeURIComponent(studentId)}?t=${encodeURIComponent(signed.token)}`;
}

export function upsertClassStudent(input: {
  classId: string;
  className?: string;
  studentId: string;
  studentLabel?: string;
  parentPhone?: string;
}): void {
  ensureClassCompanionSchema();
  const db = getCoreDb();
  db.prepare(`
    INSERT INTO companion_class_roster (class_id, class_name, student_id, student_label, parent_phone)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(class_id, student_id) DO UPDATE SET
      class_name = excluded.class_name,
      student_label = excluded.student_label,
      parent_phone = excluded.parent_phone
  `).run(
    input.classId,
    input.className ?? input.classId,
    input.studentId,
    input.studentLabel ?? input.studentId,
    input.parentPhone ?? '',
  );
}

export function listClassRoster(classId: string): Array<{
  studentId: string;
  studentLabel: string;
  parentPhone: string;
  parentLink: string;
  hasReport: boolean;
}> {
  ensureClassCompanionSchema();
  const db = getCoreDb();
  getLearningDb();
  const rows = db.prepare(`
    SELECT student_id, student_label, parent_phone FROM companion_class_roster
    WHERE class_id = ? ORDER BY student_label
  `).all(classId) as Array<{ student_id: string; student_label: string; parent_phone: string }>;

  return rows.map((r) => {
    const report = db.prepare(`
      SELECT 1 FROM student_companion_reports WHERE student_id = ? LIMIT 1
    `).get(r.student_id);
    return {
      studentId: r.student_id,
      studentLabel: r.student_label,
      parentPhone: r.parent_phone,
      parentLink: parentLink(r.student_id),
      hasReport: Boolean(report),
    };
  });
}

export function listClasses(): Array<{ classId: string; className: string; studentCount: number }> {
  ensureClassCompanionSchema();
  const db = getCoreDb();
  return db.prepare(`
    SELECT class_id as classId, MAX(class_name) as className, COUNT(*) as studentCount
    FROM companion_class_roster GROUP BY class_id ORDER BY class_id
  `).all() as Array<{ classId: string; className: string; studentCount: number }>;
}
