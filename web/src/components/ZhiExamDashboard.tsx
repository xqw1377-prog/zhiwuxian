import { authFetch } from '../lib/api-auth';
import { unwrapEnvelope } from '../lib/api-envelope';
import { emitExamShadow, emitWalletBump } from '../lib/wuxian-events';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type DashboardState = 'MOCK_START' | 'ANALYZING' | 'RECKONING';

type ExamResult = {
  totalScore: string;
  targetGap: string;
  crossMetrics: string[];
  nextAction: string;
};

type ExamTrack = 'TOEFL' | 'IELTS';

const DEFAULT_EXAM = {
  examTrack: 'TOEFL' as ExamTrack,
  targetSchool: 'CMU 计算机系',
  targetTotalScore: 105,
  source: 'TPO 全真模考',
  reading: { score: 24, notes: '长难句结构坍缩，推断题耗时超标' },
  listening: { score: 25, notes: '学术讲座因果转折词捕捉不足' },
  speaking: { score: 21, notes: 'T3 综合题丢失核心论据，嗯啊填充偏多' },
  writing: { score: 24, notes: '独立写作第三层推导逃向万能模板' },
};

export function ZhiExamDashboard({ userId }: { userId: string }) {
  const [warpPoints, setWarpPoints] = useState(0);
  const [challengeIndex, setChallengeIndex] = useState(92);
  const [dashboardState, setDashboardState] = useState<DashboardState>('MOCK_START');
  const [examTrack, setExamTrack] = useState<ExamTrack>('TOEFL');
  const [examResult, setExamResult] = useState<ExamResult>({
    totalScore: '',
    targetGap: '',
    crossMetrics: [],
    nextAction: '',
  });
  const [mentorText, setMentorText] = useState(
    '曦宝，我是 ZHI。托福模考不是做模拟题，而是清算命运阻力的镜子。下方 [全真多模态考场大盘] 已就绪，提交今日语流与答卷，我们开始剥洋葱。',
  );
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3.5/billing/status/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok) {
        const d = unwrapEnvelope<{ availableWarpPoints: number; challengeIndex: number | null }>(json);
        setWarpPoints(d.availableWarpPoints ?? 0);
        if (d.challengeIndex != null) setChallengeIndex(d.challengeIndex);
      }
    } catch {
      /* offline */
    }
  }, [userId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const runMockReckon = async () => {
    setDashboardState('ANALYZING');
    setMentorText(
      '正在启动 DeepSeek 高维多模态推理流。清算听、说、读、写因果交织网络，曦宝，直面底牌的时间到了…',
    );
    setBusy(true);
    try {
      const res = await authFetch('/api/v3.5/zhi/mock-reckon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          examData: { ...DEFAULT_EXAM, examTrack, targetSchool: DEFAULT_EXAM.targetSchool },
        }),
      });
      const json = await res.json();
      const d = unwrapEnvelope<{
        success: boolean;
        msg?: string;
        totalScore: string;
        targetGap: string;
        crossMetrics: string[];
        nextAction: string;
        zhiReckoning: string;
        warpPointsRemaining: number;
        challengeIndex: number;
      }>(json);

      if (!res.ok || !d.success) {
        setMentorText(d.msg ?? d.zhiReckoning ?? '模考清算失败');
        setDashboardState('MOCK_START');
        return;
      }

      setExamResult({
        totalScore: d.totalScore,
        targetGap: d.targetGap,
        crossMetrics: d.crossMetrics,
        nextAction: d.nextAction,
      });
      setMentorText(
        d.zhiReckoning ||
          '清算完成。曦宝，这就是你今天的真实骨架。别看图表，看致命断层和 ZHI 今晚的死命令。',
      );
      setWarpPoints(d.warpPointsRemaining);
      setChallengeIndex(d.challengeIndex);
      setDashboardState('RECKONING');
      emitWalletBump();
    } catch (err) {
      setMentorText(err instanceof Error ? err.message : '清算管线中断');
      setDashboardState('MOCK_START');
    } finally {
      setBusy(false);
    }
  };

  const enterShadowMission = async () => {
    setBusy(true);
    try {
      const res = await authFetch('/api/v3.5/zhi/mock-shadow-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          missionNote: examResult.nextAction,
        }),
      });
      const json = await res.json();
      const d = unwrapEnvelope<{
        zhiReckoning: string;
        challengeIndex: number;
        warpPointsRemaining: number;
      }>(json);
      if (!res.ok) throw new Error('影子突围入账失败');

      setChallengeIndex(d.challengeIndex);
      setWarpPoints(d.warpPointsRemaining);
      setDashboardState('MOCK_START');
      setMentorText(
        d.zhiReckoning ??
          '听力因果词影子肉搏战胜利。曦宝，断层补丁焊死，命运阻力应声下跌。继续锁定航标。',
      );
      emitWalletBump();
      emitExamShadow({ nextAction: examResult.nextAction });
      void refreshStatus();
    } catch (err) {
      setMentorText(err instanceof Error ? err.message : '影子突围失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-2xl select-none p-4 font-mono text-left"
    >
      <motion.div className="space-y-4 rounded-2xl border-2 border-[#00FF7F]/30 bg-[#0A0B0E] p-6 shadow-[0_0_50px_rgba(0,255,127,0.05)]">
        <motion.div className="flex items-center justify-between border-b border-gray-950 pb-3 text-[10px]">
          <motion.div className="flex items-center space-x-2 text-[#00FF7F]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF7F]" />
            <span className="font-black tracking-widest">ZHI // LANGUAGE EVALUATION &amp; ANALYSIS</span>
          </motion.div>
          <motion.div className="flex items-center gap-2">
            <select
              value={examTrack}
              onChange={(e) => setExamTrack(e.target.value as ExamTrack)}
              disabled={dashboardState !== 'MOCK_START'}
              className="rounded border border-gray-900 bg-[#11131A] px-2 py-0.5 text-[9px] text-gray-400"
            >
              <option value="TOEFL">TOEFL</option>
              <option value="IELTS">IELTS</option>
            </select>
            <motion.div className="rounded border border-gray-900 bg-[#11131A] px-3 py-1 text-[9px] text-gray-400">
              托管算力: <span className="font-bold text-[#00FF7F]">{warpPoints} Warp</span>
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div className="rounded-xl border border-gray-950 bg-[#11131A] p-4">
          <span className="mb-2 block text-[8px] font-black uppercase tracking-widest text-[#FF4500]">
            // ZHI 的镜子
          </span>
          <p className="font-sans text-xs italic leading-relaxed text-gray-200">&ldquo;{mentorText}&rdquo;</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {dashboardState === 'MOCK_START' && (
            <motion.div
              key="start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 rounded-xl border border-gray-900 bg-gray-950 p-6 text-center"
            >
              <p className="font-sans text-xs text-gray-400">
                📊 检测到 TPO/官方模考卷含听、说、读、写语流（默认载入今日切片：R24 L25 S21 W24）
              </p>
              <motion.div className="grid grid-cols-4 gap-2 text-[10px]">
                {(['R', 'L', 'S', 'W'] as const).map((k, i) => {
                  const scores = [24, 25, 21, 24];
                  return (
                    <motion.div
                      key={k}
                      className="rounded border border-gray-900 bg-black py-2"
                    >
                      <span className="text-gray-500">{k}</span>
                      <span className="ml-1 font-bold text-[#00FF7F]">{scores[i]}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runMockReckon()}
                className="rounded-xl bg-[#00FF7F] px-6 py-2.5 text-xs font-black tracking-widest text-black shadow-[0_0_20px_rgba(0,255,127,0.1)] transition-all hover:bg-[#00E06F] disabled:opacity-50"
              >
                一键驱动 ZHI 物理清算语言大盘（25 Warp）➔
              </button>
            </motion.div>
          )}

          {dashboardState === 'ANALYZING' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center space-y-3 rounded-xl border border-gray-900 bg-gray-950 p-8"
            >
              <span className="animate-pulse text-xs tracking-widest text-[#00FF7F]">
                DEEPSEEK INFERENCE FLOW // 算力全量买单中…
              </span>
              <motion.div
                className="h-[2px] w-16 bg-[#00FF7F]"
                animate={{ scaleX: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              />
            </motion.div>
          )}

          {dashboardState === 'RECKONING' && (
            <motion.div
              key="reckon"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 rounded-xl border border-gray-900 bg-gray-950 p-4"
            >
              <motion.div className="flex items-start justify-between rounded-lg border border-gray-950 bg-black p-3">
                <motion.div>
                  <span className="block text-[9px] uppercase text-gray-500">当前全真清算得分</span>
                  <span className="text-sm font-black text-white">{examResult.totalScore}</span>
                </motion.div>
                <motion.div className="text-right">
                  <span className="block text-[9px] uppercase text-[#FF4500]">🚨 命运鸿沟精算</span>
                  <p className="mt-0.5 font-sans text-[11px] text-gray-400">{examResult.targetGap}</p>
                </motion.div>
              </motion.div>

              <motion.div className="space-y-2">
                <span className="block text-[9px] uppercase text-gray-500">// 跨多模态致命断层连线</span>
                {examResult.crossMetrics.map((metric) => (
                  <motion.div
                    key={metric.slice(0, 48)}
                    className="rounded border border-gray-900 bg-[#11131A] p-2.5 font-sans text-[11px] leading-relaxed text-gray-300"
                  >
                    {metric}
                  </motion.div>
                ))}
              </motion.div>

              <motion.div className="space-y-2 rounded-xl border border-[#FF4500]/30 bg-[#FF4500]/5 p-3">
                <span className="block text-[10px] font-black uppercase tracking-widest text-[#FF4500]">
                  ➔ ZHI 今晚突围死命令
                </span>
                <p className="font-sans text-[11px] italic text-gray-300">
                  &ldquo;{examResult.nextAction}&rdquo;
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enterShadowMission()}
                  className="w-full rounded-lg bg-[#FF4500] py-2 text-center text-xs font-black tracking-widest text-white shadow-[0_0_15px_rgba(255,69,0,0.2)] transition-all hover:bg-[#E03D00] disabled:opacity-50"
                >
                  立刻进入 [影子肉搏战] 击穿听力断层 ➔
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div className="mt-4 flex items-center justify-between border-t border-gray-950 pt-3 text-[10px] text-gray-500">
          <span>
            创始人航标: <span className="font-bold text-white">CMU 计算机系</span>
          </span>
          <div className="flex items-center space-x-3">
            <span>
              当前战役: <span className="font-bold text-[#00FF7F]">TOEFL 全真攻坚</span>
            </span>
            <span>
              命运阻力: <span className="font-bold text-[#FF4500]">{challengeIndex}%</span>
            </span>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
