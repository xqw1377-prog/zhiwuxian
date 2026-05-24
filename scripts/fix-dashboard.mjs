import { readFileSync, writeFileSync } from 'fs';

const p = 'web/src/pages/GoalReverseDashboard.tsx';
let s = readFileSync(p, 'utf8');

s = s.replace(
  `  if (loading) {
    return (
      <motion.div className="w-full max-w-4xl bg-[#0D0E12] border border-gray-900 rounded-3xl p-8 font-mono text-[10px] text-gray-600">
        // WUXIAN 3.0 loading...
      </motion.div>
    );
  }`,
  `  if (loading) {
    return (
      <div className="w-full max-w-4xl bg-[#0D0E12] border border-gray-900 rounded-3xl p-8 font-mono text-[10px] text-gray-600">
        // WUXIAN 3.0 loading...
      </div>
    );
  }`,
);

s = s.replace('        </motion.div>\n      </motion.div>\n\n      {matrix', '        </div>\n      </div>\n\n      {matrix');

s = s.replace(
  `          <header className="flex justify-between items-start border-b border-gray-900 pb-6 gap-4 flex-wrap">
            <motion.div className="space-y-2">
              <span className="text-xs font-bold text-[#00FF7F] tracking-widest">// TARGET DESTINATION</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{matrix.targetSchool}</h2>
            </motion.div>
            <motion.div className="flex items-center gap-4">
              <motion.div className="text-right text-[10px] text-gray-500">
                <motion.div>CHALLENGE INDEX</motion.div>
                <motion.div className="text-[#FF4500]">1-100</motion.div>
              </motion.div>
              <motion.div className="w-16 h-16 rounded-full border-2 border-[#FF4500] flex items-center justify-center bg-[#FF4500]/5">
                <span className="text-xl font-black text-[#FF4500]">{challengeIndex}</span>
              </motion.div>
            </motion.div>
          </header>`,
  `          <header className="flex justify-between items-start border-b border-gray-900 pb-6 gap-4 flex-wrap">
            <motion.div className="space-y-2">
              <span className="text-xs font-bold text-[#00FF7F] tracking-widest">// TARGET DESTINATION</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{matrix.targetSchool}</h2>
            </motion.div>
            <motion.div className="flex items-center gap-4">
              <motion.div className="text-right text-[10px] text-gray-500">
                <motion.div>CHALLENGE INDEX</motion.div>
                <motion.div className="text-[#FF4500]">1-100</motion.div>
              </motion.div>
              <motion.div className="w-16 h-16 rounded-full border-2 border-[#FF4500] flex items-center justify-center bg-[#FF4500]/5">
                <span className="text-xl font-black text-[#FF4500]">{challengeIndex}</span>
              </motion.div>
            </motion.div>
          </header>`,
);

// Fix header with divs only
s = s.replace(
  /<header className="flex justify-between[\s\S]*?<\/header>/,
  `          <header className="flex justify-between items-start border-b border-gray-900 pb-6 gap-4 flex-wrap">
            <motion.div className="space-y-2">
              <span className="text-xs font-bold text-[#00FF7F] tracking-widest">// TARGET DESTINATION</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{matrix.targetSchool}</h2>
            </motion.div>
            <motion.div className="flex items-center gap-4">
              <motion.div className="text-right text-[10px] text-gray-500">
                <motion.div>CHALLENGE INDEX</motion.div>
                <motion.div className="text-[#FF4500]">1-100</motion.div>
              </motion.div>
              <motion.div className="w-16 h-16 rounded-full border-2 border-[#FF4500] flex items-center justify-center bg-[#FF4500]/5">
                <span className="text-xl font-black text-[#FF4500]">{challengeIndex}</span>
              </motion.div>
            </motion.div>
          </header>`,
);

writeFileSync(p, s);
console.log('done');
