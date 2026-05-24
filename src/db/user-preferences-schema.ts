import { getLearningDb } from '../../server/wuxian-learning-db';

export type ZhiLang = 'zh' | 'en';

export type CloudSyncStatus = 'DISABLED' | 'SYNCED' | 'FAILED';

export type UserPreferencesRow = {
  user_id: string;
  preferred_lang: ZhiLang;
  updated_at: number;
  cloud_sync_status: CloudSyncStatus;
  cloud_key: string | null;
  cloud_url: string | null;
  cloud_synced_at: number | null;
};

let schemaReady = false;

export function initializeUserPreferencesSchema(): void {
  if (schemaReady) return;
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS zhi_user_preferences (
      user_id TEXT PRIMARY KEY,
      preferred_lang TEXT NOT NULL DEFAULT 'zh',
      updated_at INTEGER NOT NULL,
      cloud_sync_status TEXT DEFAULT 'DISABLED',
      cloud_key TEXT,
      cloud_url TEXT,
      cloud_synced_at INTEGER
    );
  `);
  schemaReady = true;
}

function normalizeLang(lang: unknown): ZhiLang {
  return String(lang).toLowerCase() === 'en' ? 'en' : 'zh';
}

export function getUserPreferences(userId: string): UserPreferencesRow | null {
  initializeUserPreferencesSchema();
  const uid = userId.trim();
  if (!uid) return null;
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_user_preferences WHERE user_id = ?`)
    .get(uid) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    user_id: String(row.user_id),
    preferred_lang: normalizeLang(row.preferred_lang),
    updated_at: Number(row.updated_at ?? 0),
    cloud_sync_status: (String(row.cloud_sync_status ?? 'DISABLED') as CloudSyncStatus) ?? 'DISABLED',
    cloud_key: (row.cloud_key as string | null) ?? null,
    cloud_url: (row.cloud_url as string | null) ?? null,
    cloud_synced_at: (row.cloud_synced_at as number | null) ?? null,
  };
}

export function upsertUserLanguagePreference(userId: string, lang: ZhiLang): UserPreferencesRow {
  initializeUserPreferencesSchema();
  const uid = userId.trim();
  const l = normalizeLang(lang);
  const now = Date.now();
  getLearningDb()
    .prepare(`
      INSERT INTO zhi_user_preferences (user_id, preferred_lang, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        preferred_lang = excluded.preferred_lang,
        updated_at = excluded.updated_at
    `)
    .run(uid, l, now);

  return (
    getUserPreferences(uid) ?? {
      user_id: uid,
      preferred_lang: l,
      updated_at: now,
      cloud_sync_status: 'DISABLED',
      cloud_key: null,
      cloud_url: null,
      cloud_synced_at: null,
    }
  );
}

export function updateUserPreferenceCloudSync(input: {
  userId: string;
  status: CloudSyncStatus;
  cloudKey?: string | null;
  cloudUrl?: string | null;
  cloudSyncedAt?: number | null;
}): void {
  initializeUserPreferencesSchema();
  const uid = input.userId.trim();
  if (!uid) return;
  getLearningDb()
    .prepare(`
      UPDATE zhi_user_preferences
      SET cloud_sync_status = ?, cloud_key = ?, cloud_url = ?, cloud_synced_at = ?
      WHERE user_id = ?
    `)
    .run(
      input.status,
      input.cloudKey ?? null,
      input.cloudUrl ?? null,
      input.cloudSyncedAt ?? null,
      uid,
    );
}

