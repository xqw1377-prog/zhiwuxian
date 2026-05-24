import { useMemo, useState } from 'react';
import { authFetch } from '../lib/api-auth';
import { motion } from 'framer-motion';

function unwrap<T>(json: any): T {
  return (json?.data ?? json) as T;
}

export function BaselineSurvey(props: {
  userId: string;
  onPathGenerated: (input: {
    difficultyIndex: number;
    timeSlopeSuggestion: string;
    timeSlopeWeight: number;
    milestones: Array<{ title: string; isWeaknessTargeted: boolean }>;
  }) => void;
}) {
  const { userId, onPathGenerated } = props;
  const [scores, setScores] = useState<Record<string, string>>({
    GPA: '3.1',
    TOEFL: '82',
    SAT: '',
  });
  const [hoursPerDay, setHoursPerDay] = useState('2.5');
  const [selectedWeaks, setSelectedWeaks] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const availableWeakPool = useMemo(() => ([
    '极坐标求导',
    '高阶级数收敛',
    '微积分基本定理',
    '立体几何',
    '定积分应用',
    '阅读长难句',
    '写作逻辑展开',
    '听力细节回溯',
  ]), []);

  const toggleWeak = (tag: string) => {
    setSelectedWeaks((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleBaselineSubmit = async () => {
    setIsGenerating(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v2/planner/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentScores: scores,
          weakSubjects: selectedWeaks,
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
        const e = (json ?? {}) as { error?: string; message?: string; status?: string };
        setStatusMsg(e.error || e.message || e.status || `请求失败：HTTP ${res.status}`);
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

      if (d?.success && d.plan) {
        onPathGenerated(d.plan);
        setStatusMsg('因果链已生成，路径 A 分母已改写。');
      } else {
        setStatusMsg('未收到有效规划结果');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-[#161820] border border-[#FF4500]/30 rounded-2xl p-6 font-mono space-y-6">
      <div>
        <h3 className="text-sm font-bold text-[#FF4500] tracking-widest">// 第一步：认知现状清算 (BASELINE ANCHOR)</h3>
        <p className="text-[10px] text-gray-500 mt-1">输入真实现状与弱项，让路径 A 从倒计时变成因果链</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {Object.keys(scores).map((key) => (
          <div key={key} className="bg-[#0D0E12] border border-gray-900 rounded-xl p-3">
            <label className="text-[9px] text-gray-500 block uppercase">{key}</label>
            <input
              type="text"
              value={scores[key] ?? ''}
              onChange={(e) => setScores({ ...scores, [key]: e.target.value })}
              className="bg-transparent text-xs text-white font-bold w-full outline-none mt-1 focus:text-[#00FF7F]"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#0D0E12] border border-gray-900 rounded-xl p-3">
          <label className="text-[9px] text-gray-500 block uppercase">HOURS_PER_DAY</label>
          <input
            type="number"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            className="bg-transparent text-xs text-white font-bold w-full outline-none mt-1 focus:text-[#00FF7F]"
          />
        </div>
        <div className="flex items-center text-[10px] text-gray-500">
          多选弱项后会影响 Difficulty D 与 TimeSlope S，并重写通关节点
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 block">选择你目前一碰就碎的底层弱项（多选）:</label>
        <div className="flex flex-wrap gap-2">
          {availableWeakPool.map((tag) => {
            const isSelected = selectedWeaks.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => toggleWeak(tag)}
                className={`text-[10px] px-3 py-1.5 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-[#FF4500]/10 border-[#FF4500] text-[#FF4500] font-bold'
                    : 'bg-[#0D0E12] border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <motion.button
        type="button"
        onClick={handleBaselineSubmit}
        disabled={isGenerating}
        whileTap={{ scale: 0.99 }}
        className="w-full bg-[#FF4500] text-white py-3 rounded-xl font-bold text-xs hover:bg-[#E03D00] transition-colors tracking-widest shadow-[0_0_15px_rgba(255,69,0,0.2)] disabled:opacity-60"
      >
        {isGenerating ? '正在精算 Gap 并重组因果路径…' : '锁定现状：生成因果通关路径'}
      </motion.button>

      {statusMsg && (
        <div className="text-[11px] text-zinc-500 leading-relaxed">
          {statusMsg}
        </div>
      )}
    </div>
  );
}

