import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

function playQuantumTick() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    void ctx.close();
  } catch {
    /* 静音环境 */
  }
}

export function DestinyProgressBar({
  challengeIndex,
  mentorWhisper,
  certaintyProgress,
}: {
  challengeIndex: number;
  mentorWhisper: string;
  certaintyProgress?: number;
}) {
  const prevRef = useRef(challengeIndex);
  const [flash, setFlash] = useState(false);
  const spring = useSpring(challengeIndex, { stiffness: 90, damping: 18 });
  const displayIndex = useTransform(spring, (v) => Math.round(v));
  const [shown, setShown] = useState(challengeIndex);

  useEffect(() => {
    spring.set(challengeIndex);
    const unsub = displayIndex.on('change', (v) => setShown(v));
    return () => unsub();
  }, [challengeIndex, displayIndex, spring]);

  useEffect(() => {
    if (challengeIndex < prevRef.current && challengeIndex > 0) {
      playQuantumTick();
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 900);
      prevRef.current = challengeIndex;
      return () => window.clearTimeout(t);
    }
    prevRef.current = challengeIndex;
  }, [challengeIndex]);

  const progress = certaintyProgress ?? Math.max(0, Math.min(100, 100 - challengeIndex));

  return (
    <motion.div
      layout
      className={`w-full space-y-4 rounded-2xl border bg-[#11131A] p-6 font-mono transition-colors duration-500 ${
        flash ? 'border-[#00FF7F]/50 shadow-[0_0_24px_rgba(0,255,127,0.15)]' : 'border-gray-900'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-gray-500">
            // 确定性因果闭环
          </span>
          <span className="text-xs font-bold text-[#00FF7F]">只要你愿意走，路就在往下躺平</span>
        </div>
        <div className="text-right">
          <span className="mb-1 block text-[9px] text-gray-500">当前命运阻力</span>
          <motion.span
            key={shown}
            initial={flash ? { scale: 1.2, color: '#00FF7F' } : false}
            animate={{ scale: 1, color: '#FF4500' }}
            className="text-2xl font-black"
          >
            {shown}%
          </motion.span>
        </div>
      </div>

      <motion.div
        className="h-3 w-full overflow-hidden rounded-full border border-gray-800 bg-gray-950 p-[2px]"
        animate={flash ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#FF4500] to-[#00FF7F]"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 80, damping: 20, duration: 0.7 }}
        />
      </motion.div>

      <div className="rounded-lg border border-gray-900 bg-gray-950 p-3 text-[11px] italic leading-relaxed text-gray-400">
        导师注：{mentorWhisper || '投入有效努力后，此处将显示导师最坚固的信任背书。'}
      </div>
    </motion.div>
  );
}
