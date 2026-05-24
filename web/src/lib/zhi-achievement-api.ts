import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type AchievementDto = {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
  progressCurrent: number;
  progressTarget: number;
  status: string;
  category: string;
};

export async function fetchAllAchievements(userId: string): Promise<AchievementDto[]> {
  const res = await authFetch(`/api/v3.5/zhi/achievement/all/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取成就列表失败');
  return unwrapEnvelope<AchievementDto[]>(json);
}

export async function fetchUnlockedAchievements(userId: string): Promise<AchievementDto[]> {
  const res = await authFetch(`/api/v3.5/zhi/achievement/unlocked/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取已解锁成就失败');
  return unwrapEnvelope<AchievementDto[]>(json);
}

export async function checkAndUnlockAchievements(
  userId: string,
  category: string,
  progressValue: number,
): Promise<AchievementDto[]> {
  const res = await authFetch('/api/v3.5/zhi/achievement/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, category, progressValue }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '检测成就失败');
  return unwrapEnvelope<AchievementDto[]>(json);
}
