import { getLearningDb } from '../../server/wuxian-learning-db';
import { decryptApiKey, encryptApiKey } from './wallet-crypto';

export type LlmProviderId = 'deepseek' | 'qwen';

export type UserLlmConfigSnapshot = {
  provider: LlmProviderId;
  hasKey: boolean;
  baseURL: string | null;
  model: string | null;
  updatedAt: number;
};

function normalizeProvider(provider: string): LlmProviderId {
  return provider === 'qwen' ? 'qwen' : 'deepseek';
}

export function initializeUserLlmConfigSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_llm_config (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_api_key TEXT,
      base_url TEXT,
      model TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_id, provider)
    );
  `);
}

export function upsertUserLlmConfig(input: {
  userId: string;
  provider: LlmProviderId;
  apiKey?: string | null;
  clearKey?: boolean;
  baseURL?: string | null;
  model?: string | null;
}): { hasKey: boolean } {
  initializeUserLlmConfigSchema();
  const uid = input.userId.trim();
  if (!uid) throw new Error('缺少 userId');
  const provider = normalizeProvider(input.provider);
  const db = getLearningDb();

  const current = db.prepare(`
    SELECT encrypted_api_key, base_url, model
    FROM user_llm_config
    WHERE user_id = ? AND provider = ?
  `).get(uid, provider) as {
    encrypted_api_key: string | null;
    base_url: string | null;
    model: string | null;
  } | undefined;

  const nextBaseUrl =
    input.baseURL !== undefined
      ? (input.baseURL ?? '').trim() || null
      : (current?.base_url ?? null);
  const nextModel =
    input.model !== undefined
      ? (input.model ?? '').trim() || null
      : (current?.model ?? null);

  let nextEncrypted = current?.encrypted_api_key ?? null;
  if (input.clearKey) {
    nextEncrypted = null;
  } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    nextEncrypted = encryptApiKey(input.apiKey.trim());
  }

  db.prepare(`
    INSERT OR IGNORE INTO user_llm_config (user_id, provider, encrypted_api_key, base_url, model)
    VALUES (?, ?, NULL, NULL, NULL)
  `).run(uid, provider);

  db.prepare(`
    UPDATE user_llm_config
    SET encrypted_api_key = ?,
        base_url = ?,
        model = ?,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ? AND provider = ?
  `).run(nextEncrypted, nextBaseUrl, nextModel, uid, provider);

  return { hasKey: Boolean(nextEncrypted) };
}

export function getUserLlmApiKey(userId: string, provider: LlmProviderId): string | null {
  initializeUserLlmConfigSchema();
  const uid = userId.trim();
  if (!uid) return null;
  const p = normalizeProvider(provider);
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT encrypted_api_key
    FROM user_llm_config
    WHERE user_id = ? AND provider = ?
  `).get(uid, p) as { encrypted_api_key: string | null } | undefined;
  const encrypted = row?.encrypted_api_key ?? null;
  if (!encrypted) return null;
  try {
    const decrypted = decryptApiKey(encrypted);
    return decrypted.trim() ? decrypted : null;
  } catch {
    return null;
  }
}

export function getUserLlmSnapshot(userId: string, provider: LlmProviderId): UserLlmConfigSnapshot {
  initializeUserLlmConfigSchema();
  const uid = userId.trim();
  const p = normalizeProvider(provider);
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT encrypted_api_key, base_url, model, updated_at
    FROM user_llm_config
    WHERE user_id = ? AND provider = ?
  `).get(uid, p) as {
    encrypted_api_key: string | null;
    base_url: string | null;
    model: string | null;
    updated_at: number | string | null;
  } | undefined;

  const updatedAt = Math.max(0, Number(row?.updated_at ?? 0) || 0);
  return {
    provider: p,
    hasKey: Boolean(row?.encrypted_api_key),
    baseURL: row?.base_url ?? null,
    model: row?.model ?? null,
    updatedAt,
  };
}

export function getUserLlmSnapshotAll(userId: string): { deepseek: UserLlmConfigSnapshot; qwen: UserLlmConfigSnapshot } {
  return {
    deepseek: getUserLlmSnapshot(userId, 'deepseek'),
    qwen: getUserLlmSnapshot(userId, 'qwen'),
  };
}

export function hasAnyUserLlmKey(userId: string): boolean {
  initializeUserLlmConfigSchema();
  const uid = userId.trim();
  if (!uid) return false;
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT 1 as ok
    FROM user_llm_config
    WHERE user_id = ? AND encrypted_api_key IS NOT NULL AND encrypted_api_key <> ''
    LIMIT 1
  `).get(uid) as { ok: number } | undefined;
  return Boolean(row?.ok);
}
