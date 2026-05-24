CREATE TABLE IF NOT EXISTS zhi_cloud_directories (
  dir_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_school TEXT NOT NULL,
  target_major TEXT NOT NULL,
  node_name TEXT NOT NULL,
  node_type TEXT CHECK(node_type IN ('STRATEGY', 'ESSAY_ESSENTIAL', 'ERROR_BANK', 'MATERIAL')),
  cloud_sync_status TEXT DEFAULT 'PENDING' CHECK(cloud_sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
  storage_url TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_zhi_cloud_directories_user ON zhi_cloud_directories(user_id);
CREATE INDEX IF NOT EXISTS idx_zhi_cloud_directories_target ON zhi_cloud_directories(user_id, target_school, target_major);

CREATE TABLE IF NOT EXISTS zhi_cloud_artifacts (
  artifact_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  dir_id TEXT NOT NULL,
  file_title TEXT NOT NULL,
  version_tag TEXT NOT NULL,
  storage_provider TEXT DEFAULT 'S3_COMPATIBLE',
  cloud_key TEXT NOT NULL,
  cdn_url TEXT,
  cloud_sync_status TEXT DEFAULT 'PENDING' CHECK(cloud_sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
  sync_timestamp INTEGER NOT NULL,
  FOREIGN KEY(dir_id) REFERENCES zhi_cloud_directories(dir_id)
);

CREATE INDEX IF NOT EXISTS idx_zhi_cloud_artifacts_user_dir ON zhi_cloud_artifacts(user_id, dir_id);
CREATE INDEX IF NOT EXISTS idx_zhi_cloud_artifacts_user ON zhi_cloud_artifacts(user_id);
