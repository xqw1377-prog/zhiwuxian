import { useMemo, useState } from 'react';
import { authFetch } from '../lib/api-auth';
import { motion, AnimatePresence } from 'framer-motion';

type Stage = 'TARGET' | 'BASELINE' | 'DASHBOARD';

type ChatMsg = { role: 'mentor' | 'user'; text: string };

function unwrap<T>(json: any): T {
  return (json?.data ?? json) as T;
}

export function OmniCommandCenter(props: { userId: string }) {
  const { userId } = props;
  const [stage, setStage] = useState<Stage>('TARGET');
  const [inputValue, setInputValue] = useState('');
  const [chatLog, setChatLog] = useState<ChatMsg[]>([
    { role: 'mentor', text: '我是你的自学导师。输入你的终极航标学校（例如：CMU 计算机系），我们来逆向坍缩你的时间因果链。' },
  ]);

  const [targetSchool, setTargetSchool] = useState('');
  const [scores, setScores] = useState({ GPA: '3.1', TOEFL: '82' });
  const [hoursPerDay, setHoursPerDay] = useState('2.5');
  const [weakSubjects, setWeakSubjects] = useState<string[]>([]);

  const [challengeIndex, setChallengeIndex] = useState<number>(0);
  const [timeSlopeSuggestion, setTimeSlopeSuggestion] = useState<string>('');
  const [milestones, setMilestones] = useState<Array<{ title: string; isWeaknessTargeted: boolean }>>([]);

  const [busy, setBusy] = useState(false);

  const weakPool = useMemo(() => ([
    '极坐标求导',
    '高阶级数收敛',
    '微积分基本定理',
    '立体几何',
    '定积分应用',
    '阅读长难句',
    '写作逻辑展开',
    '听力细节回溯',
  ]), []);

  const pushMentor = (text: string) => {
    setChatLog((prev) => [...prev, { role: 'mentor', text }]);
  };

  const pushUser = (text: string) => {
    setChatLog((prev) => [...prev, { role: 'user', text }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    if (busy) return;

    if (stage === 'TARGET') {
      const school = inputValue.trim();
      setTargetSchool(school);
      pushUser(school);
      setInputValue('');
      setBusy(true);

      try {
        const res = await authFetch('/api/v2/quantum/reverse-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            targetDestination: school,
            currentStatus: '待清算：请提交现状成绩与弱项',
            daysToDeadline: 180,
          }),
        });
        const raw = await res.text();
        const json = (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })();
        if (!res.ok) {
          const j = (json ?? {}) as { error?: string; message?: string; status?: string };
          pushMentor(`航标锁定失败：${j.error || j.message || j.status || `HTTP ${res.status}`}`);
          return;
        }

        const d = unwrap<{ success?: boolean }>(json);
        if (d?.success === false) {
          pushMentor('航标锁定失败：目标未写入。');
          return;
        }

        pushMentor(`已锁定航标：【${school}】。现在激活 [现状清算工具]，请如实填写你目前的底牌，拒绝自我感动。`);
        setStage('BASELINE');
      } finally {
        setBusy(false);
      }
    }
  };

  const toggleWeak = (tag: string) => {
    setWeakSubjects((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleBaselineConfirm = async () => {
    if (busy) return;
    setBusy(true);

    const summary = `提交现状: GPA ${scores.GPA} / TOEFL ${scores.TOEFL} / ${hoursPerDay}h·day / 弱项 ${weakSubjects.length} 项`;
    pushUser(summary);
    pushMentor('正在调拨算力网络精算 Gap… 命运因果链正在生成。');

    try {
      const res = await authFetch('/api/v2/planner/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentScores: scores,
          weakSubjects,
          estimatedHoursPerDay: Number(hoursPerDay),
        }),
      });
      const raw = await res.text();
      const json = (() => {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      })();
      if (!res.ok) {
        const j = (json ?? {}) as { error?: string; message?: string; status?: string };
        pushMentor(`Gap 精算失败：${j.error || j.message || j.status || `HTTP ${res.status}`}`);
        return;
      }

      const d = unwrap<{
        success?: boolean;
        plan?: {
          difficultyIndex: number;
          timeSlopeSuggestion: string;
          timeSlopeWeight: number;
          milestones: Array<{ title: string; isWeaknessTargeted: boolean }>;
        };
      }>(json);

      if (!d?.success || !d.plan) {
        pushMentor('Gap 精算失败：未得到有效计划。');
        return;
      }

      setChallengeIndex(Math.round(d.plan.difficultyIndex));
      setTimeSlopeSuggestion(d.plan.timeSlopeSuggestion);
      setMilestones(d.plan.milestones ?? []);
      pushMentor('命运因果链已生成。你只需要执行第一块攻坚，系统负责重算。');
      setStage('DASHBOARD');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto font-mono text-left space-y-4">
      <div className="bg-[#0D0E12] border border-gray-800 rounded-2xl p-6 shadow-[0_0_30px_rgba(0,0,0,0.5)] space-y-4">
        <div className="flex items-center space-x-2 border-b border-gray-900 pb-3 text-[10px] text-gray-500">
          <span className={`w-2 h-2 rounded-full ${stage === 'DASHBOARD' ? 'bg-[#00FF7F]' : 'bg-[#FF4500] animate-pulse'}`} />
          <span>STAGE: {stage}</span>
          <span className="text-gray-700">|</span>
          <span>CURRENT TOOL: {stage === 'BASELINE' ? 'BASELINE_INGESTION' : 'MENTOR_CHAT'}</span>
        </div>

        <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
          {chatLog.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] text-xs rounded-xl p-3 leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gray-900 text-[#00FF7F] border border-gray-800'
                    : 'bg-[#14161D] text-gray-200 border border-gray-950 font-sans italic'
                }`}
              >
                {msg.role === 'mentor' && (
                  <span className="text-[#FF4500] font-bold block text-[10px] not-italic mb-1">// MENTOR WHISPER</span>
                )}
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {stage === 'BASELINE' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#14161D] border border-gray-900 rounded-xl p-4 grid grid-cols-3 gap-3 items-end"
            >
              <div>
                <label className="text-[9px] text-gray-500 block uppercase">真实 GPA</label>
                <input
                  type="text"
                  value={scores.GPA}
                  onChange={(e) => setScores({ ...scores, GPA: e.target.value })}
                  className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-white w-full outline-none mt-1 focus:border-[#FF4500]"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 block uppercase">真实 TOEFL</label>
                <input
                  type="text"
                  value={scores.TOEFL}
                  onChange={(e) => setScores({ ...scores, TOEFL: e.target.value })}
                  className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-white w-full outline-none mt-1 focus:border-[#FF4500]"
                />
              </div>

              <button
                type="button"
                onClick={handleBaselineConfirm}
                disabled={busy}
                className="bg-[#FF4500] hover:bg-[#E03D00] text-white text-[10px] font-bold py-1.5 rounded transition-all tracking-wider disabled:opacity-60"
              >
                {busy ? '精算中…' : '锁死现状 ➔'}
              </button>

              <div className="col-span-3 grid grid-cols-3 gap-3 items-end">
                <div className="col-span-1">
                  <label className="text-[9px] text-gray-500 block uppercase">Hours / day</label>
                  <input
                    type="number"
                    value={hoursPerDay}
                    onChange={(e) => setHoursPerDay(e.target.value)}
                    className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-white w-full outline-none mt-1 focus:border-[#FF4500]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] text-gray-500 block uppercase">Weak Subjects</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {weakPool.map((tag) => {
                      const on = weakSubjects.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleWeak(tag)}
                          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                            on
                              ? 'bg-[#FF4500]/10 border-[#FF4500] text-[#FF4500] font-bold'
                              : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {stage === 'TARGET' && (
          <form onSubmit={handleSubmit} className="flex items-center space-x-3 bg-gray-950 border border-gray-900 rounded-xl p-2 pl-4">
            <span className="text-gray-600 text-xs">➔</span>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="打字，与命运因果链对话..."
              className="bg-transparent text-xs text-white outline-none flex-1 font-sans"
            />
            <button
              type="submit"
              disabled={busy || !inputValue.trim()}
              className="bg-[#14161D] border border-gray-800 text-gray-400 hover:text-[#00FF7F] hover:border-[#00FF7F] px-4 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-60"
            >
              {busy ? '…' : '执行'}
            </button>
          </form>
        )}
      </div>

      <AnimatePresence>
        {stage === 'DASHBOARD' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#0D0E12]/50 border border-gray-950 rounded-2xl p-6 space-y-4 overflow-hidden"
          >
            <div className="flex justify-between items-center border-b border-gray-900 pb-3">
              <div>
                <span className="text-[10px] text-gray-500 block">// 当前逆向战役规划</span>
                <h4 className="text-sm font-bold text-white">{targetSchool} 攻坚战</h4>
                {timeSlopeSuggestion && (
                  <div className="text-[10px] text-zinc-500 mt-1">{timeSlopeSuggestion}</div>
                )}
              </div>
              <span className="text-lg font-black text-[#FF4500]">
                {challengeIndex}% <span className="text-[9px] text-gray-500 font-normal">挑战指数</span>
              </span>
            </div>

            <div className="bg-[#14161D] border border-gray-900 rounded-xl p-4 flex justify-between items-center">
              <div className="space-y-1">
                <span className="text-[10px] text-[#00FF7F] font-bold tracking-widest block">CURRENT MISSION</span>
                <p className="text-xs text-gray-300 font-sans">
                  {milestones[0]?.title ?? '从第一块开始攻坚：把今天的最小动作做完'}
                </p>
              </div>
              <span className="bg-gray-950 text-[#FF4500] border border-gray-900 px-2 py-1 rounded text-[10px] font-bold">
                UID: {userId.slice(0, 10)}
              </span>
            </div>

            {milestones.length > 1 && (
              <div className="text-[10px] text-zinc-500 leading-relaxed">
                NEXT: {milestones.slice(1, 4).map((m) => m.title).join(' · ')}
              </div>
            )}

            <p className="text-[10px] text-gray-600 text-center italic">
              对话框已就绪。在电脑任意界面按下 Option + Space 即可对当前战役执行物理拦截。
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

