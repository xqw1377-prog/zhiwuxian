import { authFetch } from '../lib/api-auth';
import { unwrapEnvelope } from '../lib/api-envelope';
import { emitWalletBump } from '../lib/wuxian-events';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function DesktopPanel() {
  const { t } = useTranslation();
  const [userId, setUserId] = useState('desktop-user');
  const [apiBase, setApiBase] = useState('');
  const [intentText, setIntentText] = useState('');
  const [capturedImg, setCapturedImg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('INTERCEPTING COGNITIVE FLOW...');
  const [submitting, setSubmitting] = useState(false);
  const [nodeResolved, setNodeResolved] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('desktop-overlay-root');
    document.body.classList.add('desktop-overlay-root');
    return () => {
      document.documentElement.classList.remove('desktop-overlay-root');
      document.body.classList.remove('desktop-overlay-root');
    };
  }, []);

  useEffect(() => {
    const bridge = window.wuxianDesktop;
    if (!bridge) {
      const stored = localStorage.getItem('wuxian_user_id');
      if (stored) setUserId(stored);
      setStatusMsg('非 Electron 环境 · 浏览器预览模式');
      return;
    }

    void bridge.getConfig().then((cfg) => {
      setUserId(cfg.userId);
      setApiBase(cfg.apiBase.replace(/\/$/, ''));
    });

    const off = bridge.onScreenshotCaptured((base64Img) => {
      setCapturedImg(base64Img);
      setStatusMsg('当前桌面视觉已锁定。');
    });

    const offIntrusion = bridge.onMentorIntrusion?.(
      (_event: unknown, data: { payload?: string; mentorText?: string; telemetrySignal?: string }) => {
      if (data?.payload && typeof data.payload === 'string') {
        setCapturedImg(data.payload);
      }
      if (typeof data?.mentorText === 'string' && data.mentorText.trim()) {
        setStatusMsg(data.mentorText.trim());
      } else {
        const sig = String(data?.telemetrySignal ?? '').toUpperCase();
        if (sig === 'FREEZE') {
          setStatusMsg(`${t('telemetry.freeze_title')} ${t('telemetry.freeze_msg')}`);
        } else if (sig === 'VOCAB') {
          setStatusMsg(`${t('telemetry.word_title')} ${t('telemetry.word_msg')}`);
        } else {
          setStatusMsg('导师主动介入：工具已就位。');
        }
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') bridge.hideInterceptor();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      off();
      offIntrusion?.();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleQuickSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!intentText.trim() && !capturedImg) || submitting) return;

    setSubmitting(true);
    setStatusMsg('多模态视觉神经正在解构桌面帧...');

    try {
      const base = apiBase || '';
      const res = await authFetch(`${base}/api/v1/topology/vision-intercept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          intentText: intentText.trim(),
          screenshotData: capturedImg ?? undefined,
          nodeResolved,
        }),
      });
      const json = await res.json().catch(() => null);
      const data = unwrapEnvelope<{
        success?: boolean;
        splitTriggered?: boolean;
        weaverWhisper?: string;
        detectedConcept?: string;
        metrics?: { progressPercentage: number };
        destiny?: {
          challengeIndex: number;
          previousIndex: number;
          mentorWhisper: string;
        };
      }>(json);

      if (data?.success) {
        const pct = data.metrics?.progressPercentage ?? '—';
        const whisper = data.weaverWhisper ?? '';
        if (data.destiny) {
          localStorage.setItem('wuxian_destiny_ping', String(Date.now()));
          emitWalletBump();
        }
        setStatusMsg(
          data.splitTriggered
            ? `🚨 星团分裂！进度退回 ${pct}%`
            : data.destiny
              ? `命运阻力 ${data.destiny.previousIndex}% → ${data.destiny.challengeIndex}% · ${whisper}`
              : data.detectedConcept
                ? `锁定概念: ${data.detectedConcept}`
                : whisper || '✅ 视觉重路由入账成功。',
        );
        setTimeout(() => {
          setIntentText('');
          setCapturedImg(null);
          window.wuxianDesktop?.hideInterceptor();
        }, 1200);
      } else {
        setStatusMsg('🚨 引力场丢失，后端响应拒绝。');
      }
    } catch {
      setStatusMsg('🚨 引力场丢失，请确认 npm run server 已启动。');
    } finally {
      setSubmitting(false);
    }
  }, [apiBase, capturedImg, intentText, nodeResolved, submitting, userId]);

  return (
    <div className="w-full h-screen flex items-center justify-center p-2 box-border bg-transparent">
      <div className="w-full h-full min-h-[160px] bg-[#161820] border-2 border-[#00FF7F] rounded-xl p-4 font-mono shadow-[0_0_30px_rgba(0,255,127,0.2)] select-none overflow-hidden flex flex-col justify-between">
        <header className="flex justify-between items-center text-[10px] gap-2">
          <span className="text-[#00FF7F] tracking-widest font-bold shrink-0">
            WUXIAN // OS LAYER OVERLAY
          </span>
          <span className="text-gray-500 animate-pulse text-right truncate">{statusMsg}</span>
        </header>

        <form onSubmit={handleQuickSubmit} className="relative mt-2">
          <input
            type="text"
            autoFocus
            value={intentText}
            onChange={(ev) => setIntentText(ev.target.value)}
            disabled={submitting}
            placeholder="哪一步学废了？在此输入卡点概念…"
            className="w-full bg-[#0D0E12] text-white placeholder-gray-700 border border-gray-800 focus:border-[#00FF7F] px-4 py-3 rounded-lg text-xs outline-none transition-all disabled:opacity-60"
          />
          <div className="absolute right-3 top-3 text-[9px] text-gray-600 pointer-events-none">
            [ENTER] 跃迁
          </div>
        </form>

        <label className="mt-2 flex items-center gap-2 text-[9px] text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={nodeResolved}
            onChange={(e) => setNodeResolved(e.target.checked)}
            className="accent-[#00FF7F]"
          />
          本卡点已歼灭（因果闭环 −1.5% + 解锁下一战役）
        </label>

        <footer className="text-[9px] text-gray-500 flex justify-between items-center mt-1">
          <span>ESC / 点击外部隐退</span>
          {capturedImg ? (
            <span className="text-[#FF4500]">Multimodal Screen Eye Active</span>
          ) : (
            <span className="text-gray-600">等待屏幕帧…</span>
          )}
        </footer>
      </div>
    </div>
  );
}
