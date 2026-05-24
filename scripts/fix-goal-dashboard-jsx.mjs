import { readFileSync, writeFileSync } from 'fs';

const path = 'web/src/pages/GoalReverseDashboard.tsx';
let s = readFileSync(path, 'utf8');

s = s.replace(
  '              </ul>\n            </motion.div>\n\n            <motion.div className="bg-[#14161D] border border-gray-900 rounded-2xl p-6 space-y-4">\n              <h4 className="text-xs font-bold text-[#00FF7F]',
  '              </ul>\n            </motion.div>\n\n            <motion.div className="bg-[#14161D] border border-gray-900 rounded-2xl p-6 space-y-4">\n              <h4 className="text-xs font-bold text-[#00FF7F]',
);

// GAP panel: div open, motion close -> div close
s = s.replace(
  /<div className="bg-\[#14161D\] border border-gray-900 rounded-2xl p-6 space-y-4">\s*<h4 className="text-xs font-bold text-gray-400[\s\S]*?<\/ul>\s*<\/motion\.motion\.div>/,
  (m) => m.replace('</motion.div>', '</div>').replace('</motion.div>', '</motion.div>'),
);

// simpler line fixes
const lines = s.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('</motion.div>') && lines[i - 1]?.includes('</ul>')) {
    lines[i] = lines[i].replace('</motion.div>', '</motion.div>');
  }
  if (lines[i].trim() === '</motion.div>' && lines[i - 1]?.includes('DEADLINE:')) {
    lines[i] = '                    </motion.div>';
  }
}
s = lines.join('\n');

// manual fixes
s = s.replace(
  `              </ul>
            </motion.div>

            <motion.div className="bg-[#14161D] border border-gray-900 rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-bold text-[#00FF7F] tracking-wider">// TIMELINE MATRIX</h4>`,
  `              </ul>
            </motion.div>

            <motion.div className="bg-[#14161D] border border-gray-900 rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-bold text-[#00FF7F] tracking-wider">// TIMELINE MATRIX</h4>`,
);

writeFileSync(path, s);
console.log('patched');
