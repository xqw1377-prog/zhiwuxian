import { authFetch } from '../lib/api-auth';
import { useCallback, useEffect, useState, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CyberStarCard from '../CyberStarCard';
import ReversingDashboard, { type ReversingMetrics } from './components/ReversingDashboard';
import { MentorVisionDashboard } from './pages/MentorVisionDashboard';
import CertificationDrawer from '../components/CertificationDrawer';
import { StarLeagueDashboard } from './components/StarLeagueDashboard';
import { QuantumCapture, type CaptureIntentPayload } from './components/QuantumCapture';
import { TopologyTelemetry } from './components/TopologyTelemetry';
import { WalletShield } from '../components/WalletShield';
import { BaselineSurvey } from './components/BaselineSurvey';
import { AUTH_TOKEN_KEY, authHeaders, jsonAuthHeaders, setAuthToken } from '../lib/api-auth';

interface ActionNode {
  id: string;
  title: string;
  duration: string;
  minutes?: number;
}

interface RoadmapNode {
  title: string;
  phase: string;
}

interface WalletSummary {
  availableWarpMinutes: number;
  unlimitedUntil: string | null;
  credits: number;
  tier: string;
  wormholeEnabled: boolean;
  isLifetimeCertified?: boolean;
  hasPrivateApiKey?: boolean;
}

const USER_KEY = 'wuxian_user_id';
const SESSION_KEY = 'wuxian_quantum_session';

function getUserId() {
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = `u-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

async function confirmPayment(orderId: string) {
  const res = await authFetch('/api/v1/payment/confirm', {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ orderId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? '支付确认失败');
  return json.data as { wallet?: WalletSummary };
}

export default function CoreCockpit() {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [wormholeFlash, setWormholeFlash] = useState(false);
  const [isWarping, setIsWarping] = useState(false);
  const [companionSpeech, setCompanionSpeech] = useState('航线很稳。你只管往前走，掉队了，我来重算。');
  const [companionName] = useState('织者');
  const [currentNode, setCurrentNode] = useState<ActionNode>({
    id: 'boot',
    title: '等待你的第一次投喂',
    duration: '—',
  });
  const [roadmap, setRoadmap] = useState<RoadmapNode[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(localStorage.getItem(SESSION_KEY));
  const [showStarCard, setShowStarCard] = useState(false);
  const [starPreview, setStarPreview] = useState<Record<string, unknown> | null>(null);
  const [completing, setCompleting] = useState(false);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [paying, setPaying] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [warpOverlay, setWarpOverlay] = useState(false);
  const [intentNodes, setIntentNodes] = useState<{ id: string; title: string }[]>([]);
  const [leapPosterUrl, setLeapPosterUrl] = useState<string | null>(null);
  const [walletRefreshKey, setWalletRefreshKey] = useState(0);
  const [splitShaking, setSplitShaking] = useState(false);

  const [matrixMetrics, setMatrixMetrics] = useState<ReversingMetrics | null>(null);
  const [reversingWhisper, setReversingWhisper] = useState('确立你的终极目的地，时间将开始倒推。');
  const [targetDestination, setTargetDestination] = useState('');
  const [daysLeft, setDaysLeft] = useState(180);

  const userId = getUserId();

  const applyQuantumPayload = (d: Record<string, unknown> | undefined) => {
    if (!d) return;
    if (d.companionSpeech) setCompanionSpeech(String(d.companionSpeech));
    if (d.topologyWarning) setCompanionSpeech(String(d.topologyWarning));
    if (d.nextActionNode) setCurrentNode(d.nextActionNode as ActionNode);
    if (d.roadmapNodes) setRoadmap(d.roadmapNodes as RoadmapNode[]);
    if (d.sessionId) {
      const sid = String(d.sessionId);
      setSessionId(sid);
      localStorage.setItem(SESSION_KEY, sid);
    }
    if (d.effect === 'NEON_BREATH' || d.folded) setBreathing(true);
    const card = (d.cardUrl ?? d.posterUrl) as string | undefined;
    if (card) setLeapPosterUrl(card);
    const rm = d.reversingMetrics as ReversingMetrics | undefined;
    if (rm) setMatrixMetrics(rm);
    if (d.splitTriggered) {
      setSplitShaking(true);
      setTimeout(() => setSplitShaking(false), 1200);
    }
  };

  const handleTopologyMetricsUpdate = (
    metrics: ReversingMetrics,
    whisper: string,
    splitTriggered: boolean,
  ) => {
    setMatrixMetrics(metrics);
    setReversingWhisper(whisper);
    if (splitTriggered) {
      setSplitShaking(true);
      setCompanionSpeech(whisper);
      setTimeout(() => setSplitShaking(false), 1200);
    }
  };

  const refreshWallet = useCallback(async () => {
    const res = await authFetch(`/api/v1/wallet/${userId}`, { headers: jsonAuthHeaders() });
    const json = await res.json();
    if (json.data) setWallet(json.data);
  }, [userId]);

  const triggerCrossPathLeap = useCallback(async (delta = 1) => {
    if (!matrixMetrics) return;
    setIsWarping(true);
    setTimeout(() => setIsWarping(false), 2000);
    setReversingWhisper('捕捉到一次局部跃迁，因果链条已重组，进度条向前逼近。');
    try {
      const res = await authFetch('/api/v1/quantum/reversing-advance', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ userId, delta }),
      });
      const json = await res.json().catch(() => null);
      const d = (json?.data ?? json) as { metrics?: ReversingMetrics | null } | null;
      if (d?.metrics) setMatrixMetrics(d.metrics);
    } catch {
      setMatrixMetrics((prev) => {
        if (!prev) return prev;
        const nextCompleted = Math.min(prev.totalUnits, prev.completedUnits + Math.max(1, delta));
        return {
          ...prev,
          completedUnits: nextCompleted,
          progressPercentage: Math.round((nextCompleted / prev.totalUnits) * 100),
        };
      });
    }
  }, [matrixMetrics, userId]);

  const bootstrapAuth = useCallback(async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const res = await authFetch('/api/v1/auth/bootstrap', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ userId, token: token ?? undefined }),
    });
    const json = await res.json();
    if (json.data?.token) setAuthToken(json.data.token);
    if (json.data?.userId) localStorage.setItem(USER_KEY, json.data.userId);
    if (json.data?.wallet) setWallet(json.data.wallet);
    else await refreshWallet();
  }, [refreshWallet, userId]);

  const pulse = useCallback(async () => {
    const params = new URLSearchParams({ userId });
    if (sessionId) params.set('sessionId', sessionId);
    const res = await authFetch(`/api/v1/quantum/pulse?${params}`, { headers: authHeaders() });
    const json = await res.json();
    const d = json.data;
    if (!d) return;
    if (d.companionSpeech) setCompanionSpeech(d.companionSpeech);
    if (d.nextActionNode) setCurrentNode(d.nextActionNode);
    if (d.sessionId) {
      setSessionId(d.sessionId);
      localStorage.setItem(SESSION_KEY, d.sessionId);
    }
    if (d.effect === 'GENTLE_BUBBLE') setBreathing(true);
  }, [sessionId, userId]);

  useEffect(() => {
    bootstrapAuth().then(() => pulse());
  }, [bootstrapAuth, pulse]);

  const executeAssimilation = async (
    raw: string,
    preIntent?: CaptureIntentPayload['intent'],
  ) => {
    const text = raw.trim();
    if (!text) return;
    setIsProcessing(true);
    setBreathing(false);
    setWormholeFlash(false);
    setIntentNodes([]);

    try {
      let intent = preIntent as {
        actionType: string;
        payload: { targetUrl?: string; fatigueLevel?: number };
        weaverResponse: string;
      } | undefined;

      if (!intent) {
        const intentRes = await authFetch('/api/v1/quantum/intent', {
          method: 'POST',
          headers: jsonAuthHeaders(),
          body: JSON.stringify({ rawInput: text, userId }),
        });
        const intentJson = await intentRes.json();
        intent = intentJson.data;
      }

      if (intent?.weaverResponse) {
        setCompanionSpeech(intent.weaverResponse);
      }

      if (intent?.actionType === 'ASSIMILATE_VIDEO') {
        setWarpOverlay(true);
        setIntentNodes([
          { id: '1', title: '【核心量子态解析】' },
          { id: '2', title: '【时空纠缠边界定理】' },
          { id: '3', title: '【非线性折叠应用】' },
        ]);

        setTimeout(async () => {
          setWarpOverlay(false);
          try {
            const res = await authFetch('/api/v1/quantum/assimilate', {
              method: 'POST',
              headers: jsonAuthHeaders(),
              body: JSON.stringify({ rawInput: text, userId, sessionId }),
            });
            const json = await res.json();
            const d = json.data;
            if (res.status === 402 || d?.success === false) {
              setCompanionSpeech(d?.companionSpeech ?? '折叠算力不足。充值后继续时空折叠。');
              setShowRecharge(true);
              setIsProcessing(false);
              return;
            }
            applyQuantumPayload(d);
            await triggerCrossPathLeap(1);
          } catch {
            setCompanionSpeech('时空折叠完成。继续投喂，我来消化。');
          }
          setInputValue('');
          await refreshWallet();
          setIsProcessing(false);
        }, 2800);
        return;
      }

      const res = await authFetch('/api/v1/quantum/assimilate', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ rawInput: text, userId, sessionId }),
      });
      const json = await res.json();
      const d = json.data;
      if (res.status === 402 || d?.success === false) {
        setCompanionSpeech(d?.companionSpeech ?? '折叠算力不足。充值后继续时空折叠。');
        setShowRecharge(true);
        return;
      }
      applyQuantumPayload(d);
      if (/https?:\/\//i.test(text)) {
        setWormholeFlash(true);
        setTimeout(() => setWormholeFlash(false), 2400);
      }
      setInputValue('');
      await triggerCrossPathLeap(1);
      await refreshWallet();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssimilation = () => executeAssimilation(inputValue);

  const handleCaptureResult = async (payload: CaptureIntentPayload) => {
    setInputValue(payload.rawSpeechText);
    if (payload.intent?.weaverResponse) {
      setCompanionSpeech(payload.intent.weaverResponse);
    } else {
      setCompanionSpeech(
        payload.source === 'voice' ? '声音引力已捕获，正在折叠…' : '画面已读入，正在重路由…',
      );
    }
    await executeAssimilation(payload.rawSpeechText, payload.intent);
  };

  const handleComplete = async () => {
    if (!sessionId) return;
    setCompleting(true);
    try {
      const res = await authFetch('/api/v1/quantum/complete', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ userId, sessionId, nodeId: currentNode.id }),
      });
      const json = await res.json();
      applyQuantumPayload(json.data as Record<string, unknown>);
      setBreathing(false);
    } finally {
      setCompleting(false);
    }
  };

  const handleStarCard = async () => {
    const res = await authFetch('/api/v1/quantum/starcard', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ userId, sessionId }),
    });
    const json = await res.json();
    setStarPreview(json.data);
    setShowStarCard(true);
  };

  const handleRecharge = async (packId: string) => {
    setPaying(true);
    try {
      const createRes = await authFetch('/api/v1/payment/create', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ userId, productId: packId }),
      });
      const createJson = await createRes.json();
      const orderId = createJson.data?.orderId;
      if (!orderId) throw new Error('创建订单失败');
      const confirmed = await confirmPayment(orderId);
      if (confirmed.wallet) setWallet(confirmed.wallet);
      else await refreshWallet();
      setShowRecharge(false);
      setCompanionSpeech('算力已注入。继续把链接扔进来，我来折叠。');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0E12] text-white font-sans relative overflow-hidden flex flex-col items-center justify-start pt-24 px-6 pb-12 space-y-8 selection:bg-emerald-500/30">
      <WalletShield
        userId={userId}
        refreshKey={walletRefreshKey}
        onClick={() => setShowRecharge((v) => !v)}
      />

      <AnimatePresence>
        {isWarping && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0D0E12]"
          >
            <div className="absolute w-[700px] h-[700px] rounded-full bg-gradient-to-br from-[#00FF7F] to-[#FF4500] opacity-15 blur-[140px] animate-pulse" />
            <motion.h1
              animate={{ letterSpacing: ['3px', '15px', '3px'], opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-[#00FF7F] text-2xl font-mono font-bold tracking-widest z-10"
            >
              WUXIAN // TIME COGNITION WARPING
            </motion.h1>
            <p className="text-xs text-gray-500 font-mono mt-4 z-10">正在强行弯曲时间线，反向侵蚀死线…</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {warpOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#0D0E12]"
          >
            <div className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#00FF7F] to-[#FF4500] opacity-20 blur-[120px] animate-pulse" />
            <motion.h1
              animate={{ letterSpacing: ['2px', '12px', '2px'] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-[#00FF7F] text-3xl font-mono tracking-widest font-bold z-10"
            >
              WUXIAN // WARP POWER ACTIVATED
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>

      {wormholeFlash && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.8, 1.2, 1.4] }}
          transition={{ duration: 2.2 }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.35),transparent_55%)]"
        />
      )}

      <AnimatePresence>
        {showRecharge && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full max-w-2xl p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md"
          >
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">折叠算力充值 · 模拟收银台</div>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={paying}
                onClick={() => handleRecharge('warp_10h')}
                className="text-[10px] px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
              >
                ¥39 · 10h
              </button>
              <button
                disabled={paying}
                onClick={() => handleRecharge('warp_unlimited_month')}
                className="text-[10px] px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
              >
                ¥99 · 月卡无限
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-4xl mb-6">
        <MentorVisionDashboard userId={userId} />
      </div>

      <motion.div className="w-full max-w-2xl">
        <ReversingDashboard
          userId={userId}
          onMatrixActivated={(m, dest, days) => {
            setMatrixMetrics(m);
            setTargetDestination(dest);
            setDaysLeft(days);
            setReversingWhisper('终极因果锚点已确立。开始执行逆向压迫推进。');
          }}
          externalMetrics={matrixMetrics}
          externalTarget={targetDestination}
          externalDays={daysLeft}
          externalWhisper={reversingWhisper}
          splitShaking={splitShaking}
        />
      </motion.div>

      {matrixMetrics && (
        <div className="w-full max-w-2xl mt-4">
          <BaselineSurvey
            userId={userId}
            onPathGenerated={(p) => {
              setReversingWhisper(`D=${p.difficultyIndex} / S=${p.timeSlopeWeight.toFixed(2)} · ${p.timeSlopeSuggestion}`);
              setCompanionSpeech(`因果链已重组：${p.milestones[0]?.title ?? '从第一块开始攻坚'}`);
              void authFetch(`/api/v1/quantum/reversing-metrics?userId=${encodeURIComponent(userId)}`)
                .then(r => r.json().catch(() => null))
                .then((j) => {
                  const d = (j?.data ?? j) as { metrics?: ReversingMetrics | null } | null;
                  if (d?.metrics) setMatrixMetrics(d.metrics);
                })
                .catch(() => {});
            }}
          />
        </div>
      )}

      <div className="w-full max-w-2xl mt-4">
        <TopologyTelemetry userId={userId} onMetricsUpdate={handleTopologyMetricsUpdate} />
      </div>

      <div className={`w-full max-w-2xl bg-[#161820] border border-gray-800 rounded-2xl p-6 space-y-6 relative ${breathing ? 'breath-border' : ''}`}>
        <header className="flex justify-between items-center">
          <div>
            <h4 className="text-xs font-mono tracking-widest text-[#00FF7F] uppercase">// 路径 B: 零摩擦量子意图捕捉</h4>
            <p className="text-[11px] text-gray-400 italic mt-1">“{reversingWhisper}”</p>
          </div>
          {matrixMetrics && (
            <span className="text-[10px] bg-red-950/50 border border-[#FF4500]/30 text-[#FF4500] px-2 py-0.5 rounded-md font-mono">
              与目标长线强绑定中
            </span>
          )}
        </header>

        <div className="text-emerald-400/90 text-sm leading-relaxed">
          <span className="text-zinc-500">{companionName}：</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={companionSpeech}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-zinc-300"
            >
              「{companionSpeech}」
            </motion.span>
          </AnimatePresence>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void executeAssimilation(inputValue);
          }}
          className="relative"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="贴入网课链接，或直接描述你当前学不下去的卡点…"
            className="w-full bg-[#0D0E12] text-white placeholder-gray-700 border border-gray-800 focus:border-[#00FF7F] px-5 py-4 rounded-xl text-xs focus:outline-none transition-all pr-24"
          />
          <button
            type="submit"
            disabled={isProcessing || !inputValue.trim()}
            className="absolute right-2 top-2 bottom-2 px-4 bg-[#00FF7F] text-[#0D0E12] rounded-lg font-bold text-xs hover:bg-[#00E672] transition-colors disabled:opacity-60"
          >
            {isProcessing ? '折叠中…' : '投喂意图'}
          </button>
        </form>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleStarCard}
            className="text-[10px] text-zinc-500 hover:text-emerald-400 uppercase tracking-widest"
          >
            生成赛博星卡
          </button>
          <div className="flex items-center gap-2">
            {sessionId && currentNode.id !== 'boot' && (
              <button
                type="button"
                onClick={handleComplete}
                disabled={completing}
                className="text-[10px] uppercase tracking-widest text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 rounded px-2 py-1"
              >
                {completing ? '…' : '点亮节点'}
              </button>
            )}
          </div>
        </div>

        {intentNodes.length > 0 && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center items-center space-x-4 bg-[#0D0E12] p-4 rounded-xl border border-gray-900"
            >
              {intentNodes.map((node, i) => (
                <Fragment key={node.id}>
                  <div className="text-[11px] font-mono text-[#00FF7F] bg-[#161820] px-3 py-1.5 rounded-md border border-[#00FF7F]/20">
                    {node.title}
                  </div>
                  {i < intentNodes.length - 1 && <span className="text-gray-700 text-xs">➔</span>}
                </Fragment>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {roadmap.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {roadmap.map((n) => (
              <div key={n.phase} className="border border-emerald-500/15 rounded-lg p-3 bg-emerald-500/5">
                <div className="text-[9px] text-emerald-400/70 uppercase tracking-widest">{n.phase}</div>
                <div className="text-[11px] text-zinc-300 mt-1 leading-snug line-clamp-3">{n.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center space-y-2">
        <QuantumCapture
          userId={userId}
          disabled={isProcessing}
          variant="inline"
          showVision
          onCaptured={handleCaptureResult}
          onError={(msg) => setCompanionSpeech(msg)}
        />
        <span className="text-[10px] text-gray-600 tracking-wider">遭遇卡点时按住碎碎念，松开即重路由</span>
      </div>

      <p className="mt-6 text-[10px] text-zinc-600 tracking-widest">
        Edge Shield · 本地脱敏 · 你负责专注，我负责重路由
      </p>

      {showStarCard && starPreview && (
        <CyberStarCard
          data={starPreview}
          onClose={() => setShowStarCard(false)}
          userId={userId}
          onWalletRefresh={refreshWallet}
        />
      )}

      <div className="w-full max-w-2xl mx-auto mt-8 px-2">
        <StarLeagueDashboard userId={userId} />
      </div>

      <CertificationDrawer
        userId={userId}
        isLifetimeCertified={wallet?.isLifetimeCertified}
        hasPrivateApiKey={wallet?.hasPrivateApiKey}
        onSync={() => {
          void refreshWallet();
          setWalletRefreshKey((v) => v + 1);
        }}
      />

      {leapPosterUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setLeapPosterUrl(null)}
        >
          <div
            className="max-w-[min(100%,420px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] text-emerald-400/80 tracking-[0.35em] uppercase mb-3 text-center">
              1080×1350 赛博星卡 · 长按保存分享
            </p>
            <img
              src={leapPosterUrl}
              alt="WUXIAN 动态星卡"
              className="w-full rounded-lg border border-emerald-500/30 shadow-[0_0_40px_rgba(0,255,127,0.15)]"
            />
            <button
              type="button"
              onClick={() => setLeapPosterUrl(null)}
              className="mt-4 w-full py-2 text-xs text-zinc-400 border border-zinc-700 rounded hover:border-emerald-500/50"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
