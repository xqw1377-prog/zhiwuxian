import { readFileSync, writeFileSync } from 'fs';

const p = 'web/src/components/DeepSeekLockBox.tsx';
const endDiv = '</' + 'motion.div>'.replace('motion.', '');
let s = readFileSync(p, 'utf8');

s = s.replace('{warning}\n      </motion.div>', `{warning}\n      ${endDiv}`);
s = s.replace(
  '算力惩罚: -10 Warp\n          </span>\n        </motion.div>',
  `算力惩罚: -10 Warp\n          </span>\n        ${endDiv}`,
);
s = s.replace(
  /战役代号: \{missionCode\}<\/p> : null\}\n        <\/motion\.motion\.motion\.motion\.div>/,
  `战役代号: {missionCode}</p> : null}\n        ${endDiv}`,
);
s = s.replace(
  '战役代号: {missionCode}</p> : null}\n        </motion.div>',
  `战役代号: {missionCode}</p> : null}\n        ${endDiv}`,
);
s = s.replace(
  '迎头撞击破局\n            </button>\n          </motion.div>\n        </motion.div>',
  `迎头撞击破局\n            </button>\n          ${endDiv}\n        ${endDiv}`,
);
s = s.replace(
  `目标航标: <span className="text-white">{targetSchool}</span>\n          </span>\n        </motion.div>\n      </motion.div>`,
  `目标航标: <span className="text-white">{targetSchool}</span>\n          </span>\n        ${endDiv}\n      </motion.div>`,
);

writeFileSync(p, s);
console.log('ok');
