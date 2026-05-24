import { readFileSync, writeFileSync } from 'fs';
const p = 'web/src/components/DeepSeekLockBox.tsx';
let s = readFileSync(p, 'utf8');
const d = '</' + 'div>';
const md = '</' + 'motion.div>';
s = s.replace(
  `            </button>\n          ${md}\n        ${md}\n\n        <div className="flex items-center justify-between`,
  `            </button>\n          ${d}\n        ${d}\n\n        <div className="flex items-center justify-between`,
);
s = s.replace(
  `        </div>\n      ${d}\n    ${d}\n  );\n}`,
  `        </div>\n      ${md}\n    ${md}\n  );\n}`,
);
writeFileSync(p, s);
console.log('ok');
