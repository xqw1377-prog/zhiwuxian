import { authFetch } from '../lib/api-auth';
import { unwrapEnvelope } from '../lib/api-envelope';
import { onWuxianEvent, WUXIAN_EVENTS } from '../lib/wuxian-events';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type DirectoryType = 'STRATEGIC_GOAL' | 'ACADEMIC_SUBJECT' | 'ERROR_BANK' | 'CUSTOM';

export type DirectoryItem = {
  id: string;
  title: string;
  type: DirectoryType;
  isPinned: boolean;
  parentId?: string | null;
  goalCount?: number;
  todayTaskCount?: number;
};

export type AnchorProfile = {
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  currentSchool: string;
  currentRegion: string;
  targetSchoolRegion: string;
};

type ZhiDirectoryContextValue = {
  activeId: string | null;
  activeDirectory: DirectoryItem | null;
  setActiveId: (id: string) => void;
  pinned: DirectoryItem[];
  custom: DirectoryItem[];
  anchorProfile: AnchorProfile | null;
  /** 首次目录拉取结束后为 true，避免航标未加载时误开工具面板 */
  directoriesLoaded: boolean;
  refreshDirectories: (preferActiveId?: string) => Promise<void>;
  addCustomDirectory: (title: string) => Promise<void>;
  removeCustomDirectory: (id: string) => Promise<void>;
};

const ZhiDirectoryContext = createContext<ZhiDirectoryContextValue | null>(null);

export function ZhiDirectoryProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [pinned, setPinned] = useState<DirectoryItem[]>([]);
  const [custom, setCustom] = useState<DirectoryItem[]>([]);
  const [anchorProfile, setAnchorProfile] = useState<AnchorProfile | null>(null);
  const [directoriesLoaded, setDirectoriesLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refreshDirectories = useCallback(async (preferActiveId?: string) => {
    const res = await authFetch(`/api/v3.5/zhi/directories/${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (!res.ok) return;
    const d = unwrapEnvelope<{ pinned: DirectoryItem[]; custom: DirectoryItem[]; anchorProfile?: AnchorProfile | null }>(
      json,
    );
    setPinned(d.pinned ?? []);
    setCustom(d.custom ?? []);
    setAnchorProfile(d.anchorProfile ?? null);
    const all = [...(d.pinned ?? []), ...(d.custom ?? [])];
    setActiveId((prev) => {
      if (preferActiveId && all.some((x) => x.id === preferActiveId)) return preferActiveId;
      if (prev && all.some((x) => x.id === prev)) return prev;
      const goal = all.find((x) => x.type === 'STRATEGIC_GOAL');
      return goal?.id ?? d.pinned?.[1]?.id ?? d.pinned?.[0]?.id ?? d.custom?.[0]?.id ?? null;
    });
  }, [userId]);

  const addCustomDirectory = useCallback(
    async (title: string) => {
      const res = await authFetch('/api/v3.5/zhi/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title }),
      });
      if (!res.ok) return;
      const item = unwrapEnvelope<DirectoryItem>(await res.json());
      setCustom((c) => [...c, item]);
      setActiveId(item.id);
    },
    [userId],
  );

  const removeCustomDirectory = useCallback(
    async (id: string) => {
      const res = await authFetch(
        `/api/v3.5/zhi/directories/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) return;
      setCustom((c) => c.filter((x) => x.id !== id));
      setActiveId((prev) => (prev === id ? pinned[1]?.id ?? pinned[0]?.id ?? null : prev));
    },
    [pinned, userId],
  );

  const activeDirectory = useMemo(() => {
    const all = [...pinned, ...custom];
    return all.find((d) => d.id === activeId) ?? null;
  }, [activeId, pinned, custom]);

  const value = useMemo(
    () => ({
      activeId,
      activeDirectory,
      setActiveId,
      pinned,
      custom,
      anchorProfile,
      directoriesLoaded,
      refreshDirectories,
      addCustomDirectory,
      removeCustomDirectory,
    }),
    [
      activeId,
      activeDirectory,
      pinned,
      custom,
      anchorProfile,
      directoriesLoaded,
      refreshDirectories,
      addCustomDirectory,
      removeCustomDirectory,
    ],
  );

  useEffect(() => {
    void refreshDirectories().finally(() => setDirectoriesLoaded(true));
  }, [refreshDirectories]);

  useEffect(() => {
    return onWuxianEvent(WUXIAN_EVENTS.directoriesRefresh, (detail) => {
      void refreshDirectories(detail?.activeDirectoryId);
    });
  }, [refreshDirectories]);

  return (
    <ZhiDirectoryContext.Provider value={value}>{children}</ZhiDirectoryContext.Provider>
  );
}

export function useZhiDirectory(): ZhiDirectoryContextValue {
  const ctx = useContext(ZhiDirectoryContext);
  if (!ctx) throw new Error('useZhiDirectory must be used within ZhiDirectoryProvider');
  return ctx;
}
