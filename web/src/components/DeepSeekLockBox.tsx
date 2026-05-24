import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {jsonAuthHeaders, authFetch } from '../lib/api-auth';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../lib/wuxian-events';
import { useTranslation } from 'react-i18next';

export type MentorLockPayload = {
  mentorWords: string;
  remainingWarp: number;
  missionCode?: string;
  targetSchool?: string;
};

function readBridge() {
  return window.wuxianDesktop ?? window.electronAPI;
}

export function DeepSeekLockBox({
  userId,
  onBreakthrough,
}: {
  userId: string;
  onBreakthrough?: () => void;
}) {
  const { t } = useTranslation();
  const [isLocked, setIsLocked] = useState(false);
  const [mentorText, setMentorText] = useState('');
  const [warpPoints, setWarpPoints] = useState(0);
  const [targetSchool, setTargetSchool] = useState('CMU CS');
  const [missionCode, setMissionCode] = useState('');
  const [fixValue, setFixValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState('');

  const applyLock = useCallback((data: MentorLockPayload) => {
    setIsLocked(true);
    setMentorText(data.mentorWords);
    setWarpPoints(data.remainingWarp);
    if (data.targetSchool) setTargetSchool(data.targetSchool);
    if (data.missionCode) setMissionCode(data.missionCode);
    setWarning('');
  }, []);

  const releaseLock = useCallback(() => {
    setIsLocked(false);
    setFixValue('');
    setWarning('');
    readBridge()?.clearAntiEscape?.();
    onBreakthrough?.();
  }, [onBreakthrough]);

  useEffect(() => {
    const offLock = onWuxianEventUntyped(WUXIAN_EVENTS.mentorLock, (detail) => {
      if (detail) applyLock(detail as MentorLockPayload);
    });
    const offWarn = onWuxianEventUntyped(WUXIAN_EVENTS.mentorEscapeWarning, (detail) => {
      const msg = (detail as { message?: string } | undefined)?.message;
      if (msg) setWarning(msg);
    });
    const offHide = onWuxianEventUntyped(WUXIAN_EVENTS.hideOverlays, releaseLock);

    const bridge = readBridge();
    const offBridgeLock = bridge?.onMentorLock?.((_ev, data) => applyLock(data as MentorLockPayload));
    const offBridgeWarn = bridge?.onMentorEscapeWarning?.((_ev, data) => {
      const msg = (data as { message?: string })?.message;
      if (msg) setWarning(msg);
    });

    return () => {
      offLock();
      offWarn();
      offHide();
      offBridgeLock?.();
      offBridgeWarn?.();
    };
  }, [applyLock, releaseLock]);

  const handleBreakthrough = async () => {
    if (!fixValue.trim() || busy) return;
    setBusy(true);
    try {
      const res = await authFetch('/api/v1/topology/vision-intercept', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          userId,
          intentText: fixValue.trim(),
          nodeResolved: true,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t('lockBox.submitFail'));
      }
      releaseLock();
    } catch (e) {
      setWarning(e instanceof Error ? e.message : t('lockBox.keepStriking'));
    } finally {
      setBusy(false);
    }
  };

  if (!isLocked) {
    if (!warning) return null;
    return (
      <div className="fixed bottom-6 left-1/2 z-40 max-w-md -translate-x-1/2 rounded-lg border border-[#FF4500]/40 bg-[#14161D] px-4 py-2 text-[10px] text-[#FF4500] shadow-lg">
        {warning}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 font-mono backdrop-blur-md select-none"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-xl space-y-6 rounded-2xl border-2 border-[#FF4500] bg-[#0D0E12] p-6 shadow-[0_0_80px_rgba(255,69,0,0.2)]"
      >
        <div className="flex items-center justify-between border-b border-gray-900 pb-3 text-[10px]">
          <div className="flex items-center gap-2 text-[#FF4500]">
            <span className="h-2 w-2 animate-ping rounded-full bg-[#FF4500]" />
            <span className="font-black tracking-widest">{t('lockBox.heading')}</span>
          </div>
          <span className="rounded border border-[#FF4500]/30 bg-[#FF4500]/10 px-2 py-0.5 font-bold text-[#FF4500]">
            {t('lockBox.warpPenalty')}
          </span>
        </div>

        <div className="rounded-xl border border-gray-950 bg-[#14161D] p-4">
          <span className="mb-2 block text-[10px] font-bold text-[#FF4500]">{t('lockBox.mentorCutoff')}</span>
          <p className="font-sans text-xs italic leading-relaxed text-gray-200">&ldquo;{mentorText}&rdquo;</p>
          {missionCode ? <p className="mt-2 text-[9px] text-gray-600">{t('lockBox.missionCode', { code: missionCode })}</p> : null}
        </div>

        <div className="space-y-3 rounded-xl border border-gray-900 bg-gray-950 p-4">
          <span className="block text-[9px] uppercase text-gray-500">
            {t('lockBox.instruction')}
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={fixValue}
              onChange={(e) => setFixValue(e.target.value)}
              placeholder={t('lockBox.placeholder')}
              className="flex-1 rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]"
            />
            <button
              type="button"
              disabled={busy || !fixValue.trim()}
              onClick={() => void handleBreakthrough()}
              className="rounded-lg bg-[#FF4500] px-6 py-2 text-xs font-black text-white shadow-[0_0_15px_rgba(255,69,0,0.4)] transition-all hover:bg-[#E03D00] disabled:opacity-50"
            >
              {busy ? t('lockBox.judging') : t('lockBox.button')}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-gray-600">
          <span>
            {t('lockBox.warpRemaining', { points: warpPoints })}
          </span>
          <span>
            {t('lockBox.targetSchool', { school: targetSchool })}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
