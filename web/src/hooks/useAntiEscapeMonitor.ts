import { authFetch } from '../lib/api-auth';
import { emitMentorEscapeWarning, emitMentorLock } from '../lib/wuxian-events';
import { useEffect, useRef } from 'react';

const ESCAPE_MS = 180_000;

/**
 * 浏览器 / Electron 渲染进程：导师工具激活时的防逃避遥测
 */
export function useAntiEscapeMonitor(input: {
  userId: string;
  active: boolean;
  missionCode: string;
  targetSchool?: string;
  onValidHit?: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const notifyValidHit = () => {
    clearTimer();
    firedRef.current = false;
    window.wuxianDesktop?.clearAntiEscape?.();
    window.electronAPI?.clearAntiEscape?.();
    input.onValidHit?.();
  };

  useEffect(() => {
    if (!input.active) {
      clearTimer();
      firedRef.current = false;
      window.wuxianDesktop?.clearAntiEscape?.();
      window.electronAPI?.clearAntiEscape?.();
      return;
    }

    firedRef.current = false;
    const mission = input.missionCode || 'OPERATION-01';
    const school = input.targetSchool ?? '';

    window.wuxianDesktop?.startAntiEscape?.({ userId: input.userId, missionCode: mission, targetSchool: school });
    window.electronAPI?.startAntiEscape?.({ userId: input.userId, missionCode: mission, targetSchool: school });

    clearTimer();
    timerRef.current = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      void (async () => {
        try {
          const res = await authFetch('/api/v3.5/billing/escape-penalty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: input.userId, missionCode: mission }),
          });
          const json = await res.json();
          const data = (json as { data?: Record<string, unknown> }).data ?? json;
          emitMentorLock({
            mentorWords: String((data as { mentorWords?: string }).mentorWords ?? ''),
            remainingWarp: Number((data as { remainingWarp?: number }).remainingWarp ?? 0),
            missionCode: mission,
            targetSchool: String((data as { targetSchool?: string }).targetSchool ?? school),
          });
        } catch {
          emitMentorLock({
            mentorWords:
              '曦宝，逃避超时。平台已尝试扣除 Warp 燃料。立刻回到战场，完成卡点撞击。',
            remainingWarp: 0,
            missionCode: mission,
            targetSchool: school,
          });
        }
      })();
    }, ESCAPE_MS);

    const onBlur = () => {
      emitMentorEscapeWarning({
        message: '曦宝，我看到你把窗口切走了。不要在困难面前假装看不见。回到战场。',
      });
    };

    const onVisibility = () => {
      if (document.hidden) onBlur();
    };

    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimer();
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.wuxianDesktop?.clearAntiEscape?.();
      window.electronAPI?.clearAntiEscape?.();
    };
  }, [input.active, input.missionCode, input.targetSchool, input.userId]);

  return { notifyValidHit };
}
