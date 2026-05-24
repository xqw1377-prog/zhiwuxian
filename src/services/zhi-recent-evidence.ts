/**
 * 云目录最近学业归档摘要（供 ZHI 对话上下文，轻量 RAG）
 */

import { listZhiArtifacts } from '../db/zhi-cloud-schema';

export function buildRecentLearningEvidenceBlock(userId: string, limit = 5): string {
  const arts = listZhiArtifacts(userId.trim()).slice(0, Math.max(1, limit));
  if (arts.length === 0) return '';

  const lines = arts.map((a) => {
    const at = a.syncTimestamp
      ? new Date(a.syncTimestamp).toISOString().slice(0, 16).replace('T', ' ')
      : '—';
    const tag = a.versionTag?.trim() ? ` · ${a.versionTag}` : '';
    return `  · [${at}] ${a.fileTitle}（目录 ${a.dirId}${tag}）`;
  });

  return ['【最近云目录归档（可追问证据）】', ...lines].join('\n');
}
