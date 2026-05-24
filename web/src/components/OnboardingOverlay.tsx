import { useState, useEffect } from 'react';

const ONBOARDING_KEY = 'wuxian_onboarding_done';

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch { return true; }
}

export function markOnboardingDone(): void {
  try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* noop */ }
}

const STEPS = [
  {
    title: '欢迎使用 WUXIAN ZHI Cockpit',
    desc: '你的 AI 学习驾驶舱。ZHI 会主动了解你的学习目标，帮你拆解任务、跟踪进度、智能陪练。',
    icon: '🚀',
  },
  {
    title: '左侧 · 科目目录',
    desc: '管理学习科目与教材。梦校航标首次设定后默认进入主驾驶舱；需要换校时可在侧栏点「更改梦校航标」。',
    icon: '📚',
    highlight: 'sidebar',
  },
  {
    title: '中间 · ZHI 对话',
    desc: '和 ZHI 直接对话——传试卷、问问题、生成学习计划。ZHI 也会主动给你建议。',
    icon: '💬',
    highlight: 'center',
  },
  {
    title: '右侧 · 成长面板',
    desc: '查看算力余额、购买 Warp、管理学习进度和能量分配。',
    icon: '📊',
    highlight: 'fuel',
  },
  {
    title: '开始学习',
    desc: '点击 + 号上传试卷/教材建档，或者直接和 ZHI 说你的学习目标。',
    icon: '🎯',
  },
];

export function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const s = STEPS[step];

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      markOnboardingDone();
      onDone();
    }
  };

  const skip = () => {
    markOnboardingDone();
    onDone();
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={skip} />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 p-8 shadow-2xl text-center animate-fade-in">
        <div className="text-6xl mb-4">{s.icon}</div>
        <h2 className="text-xl font-bold text-white mb-3">{s.title}</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-8">{s.desc}</p>

        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-cyan-400' : 'w-2 bg-gray-600'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={skip}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            跳过
          </button>
          <button
            onClick={next}
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg text-sm font-medium hover:from-cyan-400 hover:to-blue-500 transition-all"
          >
            {step < STEPS.length - 1 ? '下一步' : '开始使用'}
          </button>
        </div>
      </div>
    </div>
  );
}
