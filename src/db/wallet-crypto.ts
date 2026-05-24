/**
 * WUXIAN · 用户 API Key 端侧加密（AES-256-CBC）
 * 密钥来自 DB_ENCRYPTION_KEY，生产环境必须配置
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const IV_LENGTH = 16;
const GCM_IV_LENGTH = 12;

const DEV_FALLBACK_KEY = 'wuxian_secure_crypto_key_2026_xib';

function encryptionKey(): Buffer {
  const raw = process.env.DB_ENCRYPTION_KEY?.trim() || DEV_FALLBACK_KEY;
  return createHash('sha256').update(raw, 'utf8').digest();
}

/** 生产环境必须配置 DB_ENCRYPTION_KEY，禁止默认密钥 */
export function assertProductionEncryptionKey(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const key = process.env.DB_ENCRYPTION_KEY?.trim();
  if (!key || key === DEV_FALLBACK_KEY) {
    throw new Error(
      '生产环境必须设置 DB_ENCRYPTION_KEY（至少 32 字符随机串），且不得使用示例默认值',
    );
  }
}

export function encryptApiKey(text: string): string {
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(payload: string): string {
  const parts = payload.split(':');
  if (parts[0] === 'v2' && parts.length === 4) {
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encryptedText = Buffer.from(parts[3], 'hex');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  }

  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = createDecipheriv('aes-256-cbc', encryptionKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskApiKeyHint(encrypted: string | null): boolean {
  return Boolean(encrypted && encrypted.includes(':'));
}
