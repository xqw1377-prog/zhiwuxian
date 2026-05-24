import Database from 'better-sqlite3';

const db = new Database('data/wuxian_learning.db');
const anchors = db
  .prepare(
    `SELECT user_id, target_school, target_major FROM zhi_school_anchor
     WHERE target_school LIKE '%清华%' OR target_school LIKE '%中国%'`,
  )
  .all();
console.log('Tsinghua anchors:', anchors);
for (const a of anchors) {
  const pins = db
    .prepare(
      `SELECT directory_id, title FROM zhi_cognitive_directory WHERE user_id = ? AND is_pinned = 1 ORDER BY display_order`,
    )
    .all(a.user_id);
  console.log(`\n--- ${a.user_id} (${a.target_school} · ${a.target_major}) ---`);
  for (const p of pins) console.log(' ', p.title);
}
