import { readFileSync, writeFileSync } from 'fs';

const p = 'web/src/pages/MentorVisionDashboard.tsx';
const md = '</' + 'motion.div>';
const div = '</' + 'motion.div>'.replace('motion.', '');
let s = readFileSync(p, 'utf8');

// form toolbar + form grid
s = s.replace(
  `          {error ? <span className="text-[11px] text-[#FF4500]">{error}</span> : null}
        ${md}
      ${md}

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}`,
  `          {error ? <span className="text-[11px] text-[#FF4500]">{error}</span> : null}
        ${div}
      ${div}

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}`,
);

// wake-up block already motion — fix mistaken close before grid
s = s.replace(
  `        ) : null}
      ${md}

      <motion.div className="grid grid-cols-1 gap-8 lg:grid-cols-5">`,
  `        ) : null}
      ${md}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">`,
);

// causality panel inner list + panel close
s = s.replace(
  `            )}
          ${md}
        ${md}

        <div className="col-span-2`,
  `            )}
          ${motion.div}
        ${motion.div}

        <div className="col-span-2`,
);

// fix: causality panel should close with div not motion
s = s.replace(
  `            )}
          ${md}
        ${md}

        <div className="col-span-2`,
  `            )}
          ${div}
        ${div}

        <motion.div className="col-span-2`,
);

// header row in deadlines
s = s.replace(
  `              <span className="text-[9px] font-normal text-gray-500"> /100</span>
            </span>
          ${md}
          <div className="ml-2`,
  `              <span className="text-[9px] font-normal text-gray-500"> /100</span>
            </span>
          ${div}
          <div className="ml-2`,
);

// milestone row flex
s = s.replace(
  `                  <span className="font-bold text-[#FF4500]">{ms.deadline}</span>
                ${md}
                <p className="font-sans text-xs text-white">`,
  `                  <span className="font-bold text-[#FF4500]">{ms.deadline}</span>
                </div>
                <p className="font-sans text-xs text-white">`,
);

// milestone item + timeline + right panel + grid
s = s.replace(
  `                <p className="font-sans text-[10px] italic text-gray-500">Mentor: {ms.mentorWhisper}</p>
              ${md}
            ))}
          ${md}
        ${md}
      ${md}

      <footer`,
  `                <p className="font-sans text-[10px] italic text-gray-500">Mentor: {ms.mentorWhisper}</p>
              </motion.div>
            ))}
          ${motion.div}
        ${motion.div}
      ${motion.div}

      <footer`,
);

// col-span-3 open tag
s = s.replace(
  `<motion.div className="col-span-3 space-y-4 rounded-2xl border border-gray-950 bg-[#14161D] p-6">`,
  `<div className="col-span-3 space-y-4 rounded-2xl border border-gray-950 bg-[#14161D] p-6">`,
);

writeFileSync(p, s);
console.log('ok');
