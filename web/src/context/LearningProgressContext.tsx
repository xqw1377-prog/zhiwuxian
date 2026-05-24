import {
  fetchLearningProgressDashboard,
  type LearningProgressDashboardDto,
} from '../lib/learning-progress-api';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onProgressRefresh } from '../lib/wuxian-events';

type LearningProgressContextValue = {
  dashboard: LearningProgressDashboardDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
  directoryTarget: (directoryId: string) => { currentPct: number; targetPct: number } | null;
};

const LearningProgressContext = createContext<LearningProgressContextValue | null>(null);

export function LearningProgressProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [dashboard, setDashboard] = useState<LearningProgressDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchLearningProgressDashboard(userId);
      setDashboard(d);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 45000);
    const offRefresh = onProgressRefresh(() => void refresh());
    return () => {
      window.clearInterval(t);
      offRefresh();
    };
  }, [refresh]);

  const directoryTarget = useCallback(
    (directoryId: string) => {
      const hit = dashboard?.directories.find((d) => d.directoryId === directoryId);
      if (!hit) return null;
      return { currentPct: hit.currentPct, targetPct: hit.targetPct };
    },
    [dashboard],
  );

  const value = useMemo(
    () => ({ dashboard, loading, refresh, directoryTarget }),
    [dashboard, loading, refresh, directoryTarget],
  );

  return (
    <LearningProgressContext.Provider value={value}>{children}</LearningProgressContext.Provider>
  );
}

export function useLearningProgress() {
  const ctx = useContext(LearningProgressContext);
  if (!ctx) throw new Error('useLearningProgress must be used within LearningProgressProvider');
  return ctx;
}
