import { readFileSync, writeFileSync } from 'fs';

const p = 'web/src/pages/MentorVisionDashboard.tsx';
let s = readFileSync(p, 'utf8');

s = s.replace(
  `          {error ? <span className="text-[11px] text-[#FF4500]">{error}</span> : null}
        </motion.div>
      </motion.div>`,
  `          {error ? <span className="text-[11px] text-[#FF4500]">{error}</span> : null}
        </div>
      </motion.div>`,
);

s = s.replace(
  `            )}
          </motion.div>
        </motion.div>

        <motion.div className="col-span-2`,
  `            )}
          </motion.div>
        </motion.div>

        <motion.div className="col-span-2`,
);

// fix causality inner close
s = s.replace(
  `          </motion.div>
        </motion.div>

        <motion.div className="col-span-2 space-y-4`,
  `          </motion.div>
        </motion.div>

        <motion.div className="col-span-2 space-y-4`,
);

s = s.replace(
  `                <div className="flex justify-between text-[10px]">
                  <span className="font-bold tracking-widest text-gray-400">{ms.codeName}</span>
                  <span className="font-bold text-[#FF4500]">{ms.deadline}</span>
                </motion.div>`,
  `                <div className="flex justify-between text-[10px]">
                  <span className="font-bold tracking-widest text-gray-400">{ms.codeName}</span>
                  <span className="font-bold text-[#FF4500]">{ms.deadline}</span>
                </motion.div>`,
);

s = s.replace(
  `                <p className="font-sans text-[10px] italic text-gray-500">Mentor: {ms.mentorWhisper}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>`,
  `                <p className="font-sans text-[10px] italic text-gray-500">Mentor: {ms.mentorWhisper}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>`,
);

writeFileSync(p, s);
console.log('done');
