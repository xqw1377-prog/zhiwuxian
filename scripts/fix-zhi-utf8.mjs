import fs from 'node:fs';
const p = 'c:/Users/xqw13/wuxian/web/src/components/ZhiCloudConsole.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('          </motion.div>\r\n        </motion.div>', '          </div>\r\n        </div>');
s = s.replace('          </motion.div>\n        </motion.div>', '          </div>\n        </motion.div>');
const pairs = [
  ["GRADE_OPTIONS = ['??', '??', '??', '??', '??(Gap)', '??', '??', '??', '??']", "GRADE_OPTIONS = ['初三', '高一', '高二', '高三', '高三(Gap)', '大一', '大二', '大三', '大四']"],
  ["useState('????')", "useState('清华大学')"],
  ["useState('???')", "useState('计算机')"],
  ["useState<string>('??')", "useState<string>('高三')"],
  ['???? (School)', '目标院校 (School)'],
  ['???? (Major)', '聚焦专业 (Major)'],
  ['block uppercase mb-1">????</label>', 'block uppercase mb-1">在读年级</label>'],
  ['block uppercase mb-1">??????</label>', 'block uppercase mb-1">目标入学时间</label>'],
];
for (const [a, b] of pairs) s = s.split(a).join(b);
fs.writeFileSync(p, s, 'utf8');
