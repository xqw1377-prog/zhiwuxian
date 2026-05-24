/**
 * WUXIAN · 终身认证与私有 API Key 路由逻辑
 */

import { getLearningDb } from '../../server/wuxian-learning-db';
import {
  ensureWalletRow,
  LIFETIME_ACTIVATION_CODES,
} from '../db/wallet-schema';
import { encryptApiKey, maskApiKeyHint } from '../db/wallet-crypto';
import { getUserLlmApiKey, getUserLlmSnapshot, hasAnyUserLlmKey, upsertUserLlmConfig } from '../db/user-llm-config-schema';

export interface QuantumExecutionStrategy {
  apiKey: string | undefined;
  baseURL?: string;
  model?: string;
  shouldChargeWarpMinutes: boolean;
  isLifetime: boolean;
  usesPrivateKey: boolean;
}

export interface SaveUserConfigInput {
  userId: string;
  apiKey?: string;
  ltcCode?: string;
}

export interface SaveUserConfigResult {
  success: boolean;
  message: string;
  isLifetimeCertified: boolean;
  hasPrivateApiKey: boolean;
}

function resolveLifetimeFlag(ltcCode?: string): number {
  if (!ltcCode?.trim()) return 0;
  const code = ltcCode.trim();
  return LIFETIME_ACTIVATION_CODES.includes(code) ? 1 : 0;
}

export function saveUserWalletConfig(input: SaveUserConfigInput): SaveUserConfigResult {
  const { userId } = input;
  if (!userId?.trim()) throw new Error('缺少 userId');

  ensureWalletRow(userId);
  const db = getLearningDb();

  const current = db.prepare(`
    SELECT is_lifetime_certified, encrypted_api_key FROM user_wallet WHERE user_id = ?
  `).get(userId) as { is_lifetime_certified: number; encrypted_api_key: string | null } | undefined;

  const activateLifetime = resolveLifetimeFlag(input.ltcCode);
  const newLifetime = Math.max(current?.is_lifetime_certified ?? 0, activateLifetime);

  let encryptedKey = current?.encrypted_api_key ?? null;
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    encryptedKey = encryptApiKey(input.apiKey.trim());
    upsertUserLlmConfig({ userId, provider: 'deepseek', apiKey: input.apiKey.trim() });
  }

  db.prepare(`
    UPDATE user_wallet
    SET is_lifetime_certified = ?,
        encrypted_api_key = ?,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(newLifetime, encryptedKey, userId);

  const isLifetime = newLifetime === 1;
  return {
    success: true,
    message: isLifetime
      ? '终身认同状态与加密引力钥匙已锁定。'
      : encryptedKey
        ? '私有引力钥匙已加密锁死。'
        : '认证配置已同步。',
    isLifetimeCertified: isLifetime,
    hasPrivateApiKey: maskApiKeyHint(encryptedKey),
  };
}

/**
 * 视频同化 / 意图引擎：决定使用哪把 Key、是否扣 Warp
 */
export function getQuantumExecutionStrategy(userId: string): QuantumExecutionStrategy {
  ensureWalletRow(userId);
  const row = getLearningDb().prepare(`
    SELECT is_lifetime_certified, encrypted_api_key FROM user_wallet WHERE user_id = ?
  `).get(userId) as { is_lifetime_certified: number; encrypted_api_key: string | null } | undefined;

  const isLifetime = (row?.is_lifetime_certified ?? 0) === 1;

  const privateKey = getUserLlmApiKey(userId, 'deepseek');
  const deepseekKey = privateKey || process.env.DEEPSEEK_API_KEY?.trim();
  const snap = privateKey ? getUserLlmSnapshot(userId, 'deepseek') : null;
  return {
    apiKey: deepseekKey || undefined,
    baseURL: deepseekKey
      ? (snap?.baseURL ?? '').trim() || process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1'
      : undefined,
    model: deepseekKey
      ? (snap?.model ?? '').trim() || process.env.WUXIAN_DEEPSEEK_MODEL?.trim() || 'deepseek-v4pro'
      : undefined,
    shouldChargeWarpMinutes: !isLifetime && !privateKey,
    isLifetime,
    usesPrivateKey: Boolean(privateKey),
  };
}

export function getUserCertificationStatus(userId: string) {
  ensureWalletRow(userId);
  const row = getLearningDb().prepare(`
    SELECT is_lifetime_certified, encrypted_api_key FROM user_wallet WHERE user_id = ?
  `).get(userId) as { is_lifetime_certified: number; encrypted_api_key: string | null } | undefined;
  const hasKey = maskApiKeyHint(row?.encrypted_api_key ?? null) || hasAnyUserLlmKey(userId);

  return {
    isLifetimeCertified: (row?.is_lifetime_certified ?? 0) === 1,
    hasPrivateApiKey: hasKey,
  };
}
