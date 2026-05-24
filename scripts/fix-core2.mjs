import { readFileSync, writeFileSync } from 'fs';
const p = 'web/src/CoreCockpit.tsx';
let s = readFileSync(p, 'utf8');
s = s.replace(
  '        />\n      </div>\n\n      {matrixMetrics && (',
  '        />\n      </motion.div>\n\n      {matrixMetrics && (',
);
writeFileSync(p, s);
console.log('fixed');
