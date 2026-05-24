import { readFileSync, writeFileSync } from 'fs';

const p = 'web/src/CoreCockpit.tsx';
let s = readFileSync(p, 'utf8');
s = s.replace(
  `<GoalReverseDashboard userId={userId} />
      </motion.div>

      <motion.div className="w-full max-w-2xl">`,
  `<GoalReverseDashboard userId={userId} />
      </div>

      <motion.div className="w-full max-w-2xl">`,
);
writeFileSync(p, s);
console.log('ok');
