import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import { emitDirectoryWorkspaceRefresh } from './wuxian-events';

const CLOUD_MOUNT = '::CLOUD_MOUNT_';

type CloudDir = {
  dirId: string;
  nodeName: string;
  nodeType: string;
};

export function cognitiveIdToCloudDirId(cognitiveId: string | null): string | null {
  if (!cognitiveId) return null;
  const i = cognitiveId.indexOf(CLOUD_MOUNT);
  if (i >= 0) return cognitiveId.slice(i + CLOUD_MOUNT.length) || null;
  return null;
}

async function fetchCloudDirs(userId: string): Promise<CloudDir[]> {
  const res = await authFetch(`/api/v3.5/cloud/state/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return [];
  const d = unwrapEnvelope<{ directories?: CloudDir[] }>(json);
  return d.directories ?? [];
}

function pickCloudDir(dirs: CloudDir[], focusTitle: string | null): CloudDir | null {
  if (dirs.length === 0) return null;
  const t = focusTitle ?? '';
  if (t.includes('??')) {
    return dirs.find((d) => d.nodeType === 'ESSAY_ESSENTIAL') ?? null;
  }
  if (t.includes('??')) {
    return dirs.find((d) => d.nodeType === 'ERROR_BANK') ?? null;
  }
  if (t.includes('??')) {
    return dirs.find((d) => d.nodeType === 'MATERIAL') ?? null;
  }
  return (
    dirs.find((d) => d.nodeType === 'ESSAY_ESSENTIAL') ??
    dirs.find((d) => d.nodeType !== 'STRATEGY') ??
    dirs[0]
  );
}

export async function resolveCloudDirId(
  userId: string,
  cognitiveDirId: string | null,
  focusTitle: string | null,
): Promise<string | null> {
  const mapped = cognitiveIdToCloudDirId(cognitiveDirId);
  if (mapped) return mapped;
  const dirs = await fetchCloudDirs(userId);
  return pickCloudDir(dirs, focusTitle)?.dirId ?? null;
}

export async function pushChatTurnToCloud(input: {
  userId: string;
  cloudDirId: string;
  title: string;
  userText: string;
  attachSummary: string;
  fileNames: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const content = JSON.stringify(
    {
      kind: 'CHAT_TURN',
      userText: input.userText,
      attachSummary: input.attachSummary,
      fileNames: input.fileNames,
      savedAt: new Date().toISOString(),
    },
    null,
    2,
  );

  const res = await authFetch('/api/v3.5/cloud/artifacts/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      dirId: input.cloudDirId,
      title: input.title.slice(0, 80) || '????',
      content,
      version: `CHAT_${Date.now()}`,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; message?: string };
    return { ok: false, error: err.error || err.message || '?????' };
  }
  return { ok: true };
}

/** ????????????????????? */
export async function syncChatTurnToCloud(input: {
  userId: string;
  cognitiveDirId: string | null;
  focusTitle: string | null;
  userText: string;
  attachSummary: string;
  fileNames: string[];
}): Promise<{ ok: boolean; nodeHint?: string; error?: string }> {
  const cloudDirId = await resolveCloudDirId(input.userId, input.cognitiveDirId, input.focusTitle);
  if (!cloudDirId) {
    return { ok: false, error: '?????????????????????' };
  }

  const title =
    input.fileNames[0] ||
    input.userText.slice(0, 48) ||
    `?? ${new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;

  const pushed = await pushChatTurnToCloud({
    userId: input.userId,
    cloudDirId,
    title,
    userText: input.userText,
    attachSummary: input.attachSummary,
    fileNames: input.fileNames,
  });

  if (pushed.ok) {
    emitDirectoryWorkspaceRefresh(input.cognitiveDirId ?? undefined);
  }

  return pushed.ok
    ? { ok: true, nodeHint: input.focusTitle?.replace(/^\s*[??]\s*/, '') ?? '???' }
    : { ok: false, error: pushed.error };
}
