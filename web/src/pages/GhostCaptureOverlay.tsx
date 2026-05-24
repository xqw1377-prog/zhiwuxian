import { authFetch } from '../lib/api-auth';
import { unwrapEnvelope } from '../lib/api-envelope';
import { emitGhostTopology } from '../lib/wuxian-events';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Rect = { x: number; y: number; w: number; h: number };

type TopologyPayload = {
  syllabusDirect: string;
  causalityGap: string;
  resistanceReduction: number;
  expectedApBefore: number;
  expectedApAfter: number;
  zhiVoiceLine: string;
  coachNote: string;
  challengeIndex: number;
  warpPointsRemaining: number;
};

async function cropDataUrlAsync(full: string, rect: Rect): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scaleX = img.naturalWidth / window.innerWidth;
      const scaleY = img.naturalHeight / window.innerHeight;
      const canvas = document.createElement('canvas');
      const w = Math.max(1, Math.round(rect.w * scaleX));
      const h = Math.max(1, Math.round(rect.h * scaleY));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(
        img,
        Math.round(rect.x * scaleX),
        Math.round(rect.y * scaleY),
        w,
        h,
        0,
        0,
        w,
        h,
      );
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(null);
    img.src = full;
  });
}

export function GhostCaptureOverlay() {
  const [userId, setUserId] = useState('desktop-user');
  const [apiBase, setApiBase] = useState('');
  const [phase, setPhase] = useState<'SELECT' | 'UPLOADING' | 'WIDGET'>('SELECT');
  const [dragging, setDragging] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [fullFrame, setFullFrame] = useState<string | null>(null);
  const [widget, setWidget] = useState<TopologyPayload | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('ghost-capture-root');
    document.body.classList.add('ghost-capture-root');
    return () => {
      document.documentElement.classList.remove('ghost-capture-root');
      document.body.classList.remove('ghost-capture-root');
    };
  }, []);

  useEffect(() => {
    const bridge = window.wuxianDesktop;
    if (!bridge) return;
    void bridge.getConfig().then((cfg) => {
      setUserId(cfg.userId);
      setApiBase(cfg.apiBase.replace(/\/$/, ''));
    });
    const off = bridge.onGhostFrame?.((base64) => {
      setFullFrame(base64);
      setPhase('SELECT');
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') bridge.hideGhost?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off?.();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!text.trim() || typeof window === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* optional */
    }
  }, []);

  const submitSelection = useCallback(
    async (r: Rect) => {
      if (!fullFrame) return;
      setPhase('UPLOADING');
      const cropped = await cropDataUrlAsync(fullFrame, r);
      const base = apiBase || '';
      try {
        const res = await authFetch(`${base}/api/v3.5/zhi/ghost-blind`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            intentText: 'Option+Space 盲投：框选真题与草稿区域',
            screenshotData: cropped ?? fullFrame,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error('盲投上传失败');
        const data = unwrapEnvelope<TopologyPayload>(json);
        setWidget(data);
        setPhase('WIDGET');
        window.setTimeout(() => speak(data.zhiVoiceLine), 2000);
        emitGhostTopology({ userId, ...data });
        window.setTimeout(() => window.wuxianDesktop?.hideGhost?.(), 12000);
      } catch {
        setPhase('SELECT');
        window.wuxianDesktop?.hideGhost?.();
      }
    },
    [apiBase, fullFrame, speak, userId],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== 'SELECT') return;
    const x = e.clientX;
    const y = e.clientY;
    origin.current = { x, y };
    setDragging(true);
    setRect({ x, y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !origin.current) return;
    const x = Math.min(origin.current.x, e.clientX);
    const y = Math.min(origin.current.y, e.clientY);
    const w = Math.abs(e.clientX - origin.current.x);
    const h = Math.abs(e.clientY - origin.current.y);
    setRect({ x, y, w, h });
  };

  const onPointerUp = () => {
    if (!dragging || !rect || rect.w < 8 || rect.h < 8) {
      setDragging(false);
      return;
    }
    setDragging(false);
    void submitSelection(rect);
  };

  const laserH = rect && phase === 'SELECT';
  const widgetVisible = phase === 'WIDGET' && widget;

  return (
    <motion.div
      className="fixed inset-0 z-[99999] cursor-crosshair touch-none"
      style={{ background: phase === 'SELECT' ? 'rgba(0,0,0,0.12)' : 'transparent' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {phase === 'SELECT' && !dragging && (
        <>
          <div
            className="pointer-events-none fixed left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#00FF7F] shadow-[0_0_12px_#00FF7F]"
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest text-[#00FF7F]/80"
          >
            ZHI 盲投 · 拉框选中题目与草稿 · Esc 取消
          </motion.div>
        </>
      )}

      {laserH && (
        <motion.div
          className="pointer-events-none absolute border-2 border-[#00FF7F] shadow-[0_0_20px_rgba(0,255,127,0.5)]"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        >
          <span className="absolute -top-1 left-0 right-0 h-[2px] bg-[#00FF7F]" />
          <span className="absolute -bottom-1 left-0 right-0 h-[2px] bg-[#00FF7F]" />
          <span className="absolute -left-1 bottom-0 top-0 w-[2px] bg-[#00FF7F]" />
          <span className="absolute -right-1 bottom-0 top-0 w-[2px] bg-[#00FF7F]" />
        </motion.div>
      )}

      {phase === 'UPLOADING' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none fixed right-4 top-1/2 w-[2px] -translate-y-1/2"
          style={{ height: '40vh', background: 'linear-gradient(180deg, transparent, #00FF7F, transparent)' }}
        />
      )}

      <AnimatePresence>
        {widgetVisible && (
          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto fixed right-3 top-1/2 z-[100000] max-w-xs -translate-y-1/2 rounded-xl border border-[#00FF7F]/30 bg-[#090A0D]/95 p-3 font-mono text-[10px] shadow-[0_0_40px_rgba(0,255,127,0.15)] backdrop-blur-md"
          >
            <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-[#00FF7F]">
              // ZHI 边缘便签
            </span>
            <p className="mb-2 text-xs italic text-gray-200">&ldquo;{widget.zhiVoiceLine}&rdquo;</p>
            <p className="text-[#00FF7F]">{widget.syllabusDirect}</p>
            <p className="mt-1 text-gray-500">{widget.causalityGap}</p>
            <p className="mt-2 text-[#FF4500]">
              AP {widget.expectedApBefore}→{widget.expectedApAfter} · −{widget.resistanceReduction}%
            </p>
          </motion.aside>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
