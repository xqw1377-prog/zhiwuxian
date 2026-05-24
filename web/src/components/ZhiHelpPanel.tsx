import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SHORTCUTS = [
  { keys: 'Alt + Space', desc: '打开/关闭桌面浮窗 (Electron)' },
  { keys: 'Option + Space', desc: '盲投截屏 (Ghost Capture)' },
  { keys: 'Ctrl + Enter', desc: '发送消息' },
  { keys: 'Ctrl + K', desc: '打开工具面板' },
  { keys: 'Esc', desc: '关闭当前面板/抽屉' },
];

const QUICK_CMDS = [
  { cmd: '学习 [科目]', desc: '开始学习指定科目' },
  { cmd: '分析视频 [URL]', desc: '折叠长视频并提取知识节点' },
  { cmd: '我卡住了', desc: '触发重路由，调整学习路径' },
  { cmd: '生成日报', desc: '强制生成今日学习复盘' },
  { cmd: '模考 [科目]', desc: '生成模拟试卷' },
  { cmd: '我的进度', desc: '查看学习进度大盘' },
];

export function ZhiHelpPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-gray-700/60 bg-gray-900/80 text-sm text-gray-400 backdrop-blur-sm transition-colors hover:border-gray-500 hover:text-white lg:bottom-4"
        title="帮助"
      >
        ?
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">帮助 & 快捷键</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded p-1 text-gray-500 transition-colors hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  快捷键
                </h3>
                {SHORTCUTS.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between">
                    <kbd className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
                      {s.keys}
                    </kbd>
                    <span className="text-[11px] text-gray-400">{s.desc}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  快速指令
                </h3>
                {QUICK_CMDS.map((c) => (
                  <div key={c.cmd} className="flex items-start justify-between gap-4">
                    <code className="shrink-0 rounded bg-gray-900 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
                      {c.cmd}
                    </code>
                    <span className="text-right text-[11px] text-gray-400">{c.desc}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                <p className="text-[11px] leading-relaxed text-gray-500">
                  💡 <span className="text-gray-400">提示：</span>
                  直接在聊天框输入目标或视频链接，系统会自动识别你的意图。
                  遇到困难时，试试点击「重路由」或说「我卡住了」。
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
