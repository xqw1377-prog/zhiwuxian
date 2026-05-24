/**
 * WUXIAN · 生产数据目录（Docker 卷挂载点）
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export function getDataDir(): string {
  const dir = process.env.WUXIAN_DATA_DIR?.trim() || join(__dirname, '..', 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLearningDbPath(): string {
  return join(getDataDir(), 'wuxian_learning.db');
}

export function getCoreDbPath(): string {
  return join(getDataDir(), 'wuxian_core.db');
}

export function getSharesDir(): string {
  const dir = process.env.WUXIAN_SHARES_DIR?.trim()
    || join(getDataDir(), 'shares');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** 语音/视觉捕捉临时目录（上传后即刻删除） */
export function getUploadsDir(): string {
  const dir = join(getDataDir(), 'uploads');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
