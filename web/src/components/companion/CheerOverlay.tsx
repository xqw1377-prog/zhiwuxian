/**
 * 学生端 · 家长鼓励满屏荧光特效（SSE）
 */

import { useEffect, useState, type ReactNode } from 'react';
import { resolveApiUrl } from '../../lib/api-base';
import { emitWalletBump } from '../../lib/wuxian-events';

interface CheerEvent {
  message: string;
  fuelBonus: number;
  cheerStyle: 'FIRE' | 'HEART' | 'SHIELD';
}

const STYLE_GLOW: Record<CheerEvent['cheerStyle'], string> = {
  FIRE: 'from-[#00FF7F]/25 via-emerald-500/10 to-transparent',
  HEART: 'from-rose-500/25 via-pink-500/10 to-transparent',
  SHIELD: 'from-sky-500/25 via-cyan-500/10 to-transparent',
};

export function CheerOverlay({ studentId, children }: { studentId: string; children: ReactNode }) {
  const [cheer, setCheer] = useState<CheerEvent | null>(null);

  useEffect(() => {
    if (!studentId || studentId === 'u-pending-bootstrap') return;
    const url = resolveApiUrl(
      `/api/v1/companion/cheer-stream?studentId=${encodeURIComponent(studentId)}`,
    );
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as CheerEvent;
        setCheer(parsed);
        emitWalletBump();
        window.setTimeout(() => setCheer(null), 5200);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {};
    return () => es.close();
  }, [studentId]);

  return (
    <>
      {cheer && (
        <div className="pointer-events-none fixed inset-0 z-[9999]">
          <div className={`absolute inset-0 bg-gradient-to-b ${STYLE_GLOW[cheer.cheerStyle]} animate-pulse`} />
          {Array.from({ length: 36 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce text-3xl"
              style={{
                left: `${(i * 17) % 100}%`,
                top: `${(i * 23) % 100}%`,
                animationDelay: `${(i % 7) * 0.15}s`,
                animationDuration: `${1.2 + (i % 5) * 0.3}s`,
              }}
            >
              {cheer.cheerStyle === 'FIRE' ? '🔥' : cheer.cheerStyle === 'HEART' ? '❤️' : '☕'}
            </div>
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border-2 border-[#00FF7F]/60 bg-[#030406]/90 px-10 py-8 text-center shadow-[0_0_80px_rgba(0,255,127,0.35)] backdrop-blur-md">
              <p className="text-4xl font-black text-[#00FF7F]">+{cheer.fuelBonus} Warp</p>
              <p className="mt-2 text-lg font-bold text-white">{cheer.message}</p>
              <p className="mt-1 text-[10px] tracking-widest text-[#00FF7F]/70">家长充能已注入战舱</p>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
