import { readFileSync, writeFileSync } from 'fs';

const p = 'web/src/components/ZhiOmniBox.tsx';
let s = readFileSync(p, 'utf8');

const start = s.indexOf('  return (');
const end = s.lastIndexOf('}\n');
const head = s.slice(0, start);
const tail = '\n}\n';

const body = `  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-2xl p-4 font-mono select-none"
    >
      <motion.div className={\`relative rounded-2xl border-2 bg-[#0A0B0E] p-6 transition-all duration-500 \${borderClass}\`}>
        <motion.div className="flex items-center justify-between border-b border-gray-950 pb-3 text-[10px]">
          <motion.div className="flex items-center gap-2">
            <span
              className={\`h-1.5 w-1.5 rounded-full \${boxState === 'LOCKED' ? 'animate-ping bg-[#FF4500]' : 'animate-pulse bg-[#00FF7F]'}\`}
            />
            <span
              className={\`font-black tracking-widest \${boxState === 'LOCKED' ? 'text-[#FF4500]' : 'text-white'}\`}
            >
              {boxState === 'LOCKED' ? '⚠️ ZHI // 铁血认知拦截锁定' : '🧭 ZHI // 命运因果链护航中'}
            </span>
          </motion.div>
          <motion.div className="flex items-center gap-2 rounded border border-gray-900 bg-[#11131A] px-3 py-1 text-[9px] text-gray-400">
            <span>托管算力余额:</span>
            <span className="font-bold text-[#00FF7F]">{warpPoints} Warp</span>
          </motion.div>
        </motion.div>

        <motion.div className="relative my-4 rounded-xl border border-gray-950 bg-[#11131A] p-4">
          <span className="mb-2 block text-[8px] font-black uppercase tracking-widest text-[#FF4500]">
            // ZHI 的镜子
          </span>
          <p className="font-sans text-xs italic leading-relaxed text-gray-200">&ldquo;{zhiText}&rdquo;</p>
          {zhiTip ? <p className="mt-2 text-[10px] text-gray-500">{zhiTip}</p> : null}
        </motion.div>

        <AnimatePresence mode="wait">
          {boxState === 'INTERCEPT' && (
            <motion.div
              key="intercept"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4 rounded-xl border border-gray-900 bg-gray-950 p-4"
            >
              <motion.div className="flex items-center justify-between border-b border-gray-900 pb-2 text-[9px] text-gray-500">
                <span>🔧 ZHI_VISION_INTERCEPT // 屏幕物理残影挂载</span>
                <span className="text-[#00FF7F]">DeepSeek 算力解构已就绪</span>
              </motion.div>
              <motion.div className="grid grid-cols-4 items-center gap-4">
                <motion.div className="col-span-1 flex h-14 items-center justify-center rounded border border-gray-900 bg-[#11131A] text-[9px] font-bold text-[#00FF7F]">
                  [ 拦截快照 ]
                </motion.div>
                <motion.div className="col-span-3 space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400">ZHI 帮扶小抄：</span>
                  <p className="font-sans text-[11px] leading-relaxed text-gray-500">
                    {coachNote ||
                      '别看书了。卡住时先写出泰勒展开首项，用 Ratio Test 拆阶乘，核对是否漏掉高阶无穷小。'}
                  </p>
                </motion.div>
              </motion.div>
              <motion.div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleEscapePenalty()}
                  className="rounded-xl border border-gray-900 bg-gray-950 px-3 text-[10px] text-gray-600 transition-all hover:border-red-900/50 hover:text-red-500"
                >
                  试图切窗逃避 ➔
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBreakthroughInput(coachNote || '微积分泰勒展开首项推导');
                    void handleBreakthrough(true);
                  }}
                  className="flex-1 rounded-xl bg-[#00FF7F] py-2.5 text-center text-xs font-black tracking-widest text-black shadow-[0_0_20px_rgba(0,255,127,0.1)] transition-all hover:bg-[#00E06F]"
                >
                  我学懂了，粉碎这个卡点 ➔
                </button>
              </motion.div>
            </motion.div>
          )}

          {boxState === 'LOCKED' && (
            <motion.div
              key="locked"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-3 rounded-xl border border-[#FF4500]/20 bg-[#FF4500]/5 p-4"
            >
              <span className="block text-[9px] font-bold uppercase text-[#FF4500]">
                // ZHI 唯一解锁钥匙：拒绝任何借口，提交你的第一步推导尝试
              </span>
              <motion.div className="flex gap-2">
                <input
                  type="text"
                  value={breakthroughInput}
                  onChange={(e) => setBreakthroughInput(e.target.value)}
                  placeholder="在这里输入你尝试推导的级数首项以解除锁定…"
                  className="flex-1 rounded-lg border border-gray-900 bg-gray-950 px-3 py-2 text-xs text-white outline-none focus:border-[#FF4500]"
                />
                <button
                  type="button"
                  disabled={busy || !breakthroughInput.trim()}
                  onClick={() => void handleBreakthrough(true)}
                  className="rounded-lg bg-[#FF4500] px-5 py-2 text-xs font-black text-white shadow-[0_0_15px_rgba(255,69,0,0.3)] transition-all hover:bg-[#E03D00] disabled:opacity-50"
                >
                  正面突围
                </button>
              </motion.div>
            </motion.div>
          )}

          {boxState === 'NORMAL' && (
            <motion.form
              key="normal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleReport}
              className="flex items-center gap-2 rounded-xl border border-gray-900 bg-gray-950 p-2 pl-4"
            >
              <input
                type="text"
                value={reportInput}
                onChange={(e) => setReportInput(e.target.value)}
                placeholder="输入你想跟 ZHI 汇报的任何新卡点或成绩…"
                className="flex-1 bg-transparent font-sans text-xs text-white outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-gray-900 bg-[#11131A] px-4 py-1.5 text-xs text-gray-400 transition-colors hover:text-[#00FF7F]"
              >
                向 ZHI 汇报
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <motion.div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-950 pt-3 text-[10px] text-gray-500">
          <span>
            航标学校: <span className="font-bold text-white">{targetSchool}</span>
          </span>
          <motion.div className="flex items-center gap-3">
            <span>
              当前战役: <span className="font-bold text-[#00FF7F]">{missionCode}</span>
            </span>
            <span>
              命运阻力: <span className="font-bold text-[#FF4500]">{challengeIndex}%</span>
            </span>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
`;

writeFileSync(p, head + body + tail);
console.log('ok');
