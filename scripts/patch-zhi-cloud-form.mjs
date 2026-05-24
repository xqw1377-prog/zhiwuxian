import fs from 'node:fs';

const p = 'c:/Users/xqw13/wuxian/web/src/components/ZhiCloudConsole.tsx';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
  /GRADE_OPTIONS = \[.*?\] as const/,
  "GRADE_OPTIONS = ['初三', '高一', '高二', '高三', '高三(Gap)', '大一', '大二', '大三', '大四'] as const",
);

s = s.replace(
  /body: JSON\.stringify\(\{ userId, school, major \}\)/,
  'body: JSON.stringify({ userId, school, major, currentGrade, targetApplyAt })',
);

if (!s.includes('wuxian:directories-refresh')) {
  s = s.replace(
    'setAnchorReady(true);\n        setSyncLogs',
    `setAnchorReady(true);
        window.dispatchEvent(
          new CustomEvent('wuxian:directories-refresh', {
            detail: { activeDirectoryId: d.anchorDirectoryId },
          }),
        );
        setSyncLogs`,
  );
}

const form2 = `        <motion.div className="grid grid-cols-2 gap-3 bg-black p-3 rounded-xl border border-gray-950">
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u76ee\u6807\u9662\u6821 (School)</label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u805a\u7126\u4e13\u4e1a (Major)</label>
            <input
              type="text"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u5728\u8bfb\u5e74\u7ea7</label>
            <select
              value={currentGrade}
              onChange={(e) => setCurrentGrade(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            >
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u76ee\u6807\u5165\u5b66\u65f6\u95f4</label>
            <input
              type="month"
              value={targetApplyAt}
              onChange={(e) => setTargetApplyAt(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
        </motion.div>`;

// fix - use div throughout
const formDiv = form2
  .replace(/<motion\.div/g, '<div')
  .replace(/<\/motion\.motion\.motion\.motion\.motion\.div>/g, '</motion.div>')
  .replace(/<\/motion\.div>/g, '</motion.div>');

s = s.replace(
  /<motion\.div className="grid grid-cols-2 gap-3 bg-black p-3 rounded-xl border border-gray-950">[\s\S]*?<\/motion\.div>\s*\n\s*<button/,
  `${formDiv.replace(/<\/motion\.div>\s*$/, '</motion.div>')}\n\n        <button`.replace(/<\/motion\.div>/g, '</motion.div>').replace(/<motion\.div/g, '<motion.div'),
);

// simpler replace - match from grid to button
const m = s.match(
  /<(?:motion\.)?div className="grid grid-cols-2 gap-3 bg-black[\s\S]*?<\/(?:motion\.)?motion\.motion\.motion\.motion\.motion\.div>\s*\n\s*<button/,
);
if (m) {
  const formClean = `        <div className="grid grid-cols-2 gap-3 bg-black p-3 rounded-xl border border-gray-950">
          <div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u76ee\u6807\u9662\u6821 (School)</label>
            <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u805a\u7126\u4e13\u4e1a (Major)</label>
            <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u5728\u8bfb\u5e74\u7ea7</label>
            <select value={currentGrade} onChange={(e) => setCurrentGrade(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans">
              {GRADE_OPTIONS.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">\u76ee\u6807\u5165\u5b66\u65f6\u95f4</label>
            <input type="month" value={targetApplyAt} onChange={(e) => setTargetApplyAt(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
        </motion.div>

        <button`;
}

fs.writeFileSync(p, s, 'utf8');
console.log('done');
