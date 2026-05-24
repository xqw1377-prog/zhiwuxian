-- WUXIAN · 智无限认知目录图谱（固定战略 + 动态战术双轨）

CREATE TABLE IF NOT EXISTS zhi_cognitive_directory (
    directory_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('STRATEGIC_GOAL', 'ACADEMIC_SUBJECT', 'ERROR_BANK', 'CUSTOM')),
    is_pinned INTEGER DEFAULT 0,
    parent_id TEXT,
    display_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_zhi_dir_user ON zhi_cognitive_directory(user_id);
CREATE INDEX IF NOT EXISTS idx_zhi_dir_pinned ON zhi_cognitive_directory(user_id, is_pinned);
