/**
 * WUXIAN · 人格切换 + Rerouting 全链路验证
 * 运行：node engine/demo-persona.js
 */

const { DeconstructGoal } = require('./deconstruct-goal');
const { switchPersona, personalizeAtom } = require('./persona-switcher');
const { reroute } = require('./rerouting');

console.log('═══════════════════════════════════════════════════');
console.log('  WUXIAN · Persona Switcher + Rerouting 全链路验证');
console.log('═══════════════════════════════════════════════════\n');

const testCases = [
  {
    label: '分类 A · 高考冲刺',
    goal: '高考冲刺一本线，目前差 45 分',
    days: 90,
    scene: 'gaokao',
    baseline: '高三，一模 520 分，薄弱科目数学和物理',
  },
  {
    label: '分类 B · 语言习惯',
    goal: '365 天内学会流利英语日常对话',
    days: 365,
    scene: 'custom',
    baseline: '零基础，每天能投入 30 分钟',
  },
  {
    label: '分类 C · 艺术创作',
    goal: '完成人生第一个独立画展，展出 15 幅作品',
    days: 180,
    scene: 'custom',
    baseline: '有素描基础，尚未开始油画创作',
  },
  {
    label: '混合类 · 国际名校 + 设计',
    goal: '冲刺美国 Top 20，结构设计与美术交叉方向',
    days: 540,
    scene: 'intl-top20',
    baseline: '高二，SAT 1400，AP 3 门，有美术作品集',
  },
  {
    label: '混合类 · 考上美院',
    goal: '考上中国美术学院油画系',
    days: 365,
    scene: 'custom',
    baseline: '高二艺考生，省统考已过，文化课中等',
  },
];

for (const tc of testCases) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${tc.label}`);
  console.log(`${'─'.repeat(50)}`);

  const result = DeconstructGoal({
    dream: tc.goal,
    baseline: tc.baseline,
    totalDays: tc.days,
    scene: tc.scene,
  });

  const persona = switchPersona({
    targetGoal: tc.goal,
    timeFrameDays: tc.days,
    totalGap: result.gap.totalGap,
    scene: tc.scene,
  });

  console.log(`\n  [人格混合向量]`);
  console.log(`    铁血教练 A：${(persona.archetypeBlend.clearance * 100).toFixed(1)}%`);
  console.log(`    养成伙伴 B：${(persona.archetypeBlend.endurance * 100).toFixed(1)}%`);
  console.log(`    精神导师 C：${(persona.archetypeBlend.creation * 100).toFixed(1)}%`);
  console.log(`\n  [主人格] ${persona.primaryConfig.name} (${persona.primaryPersona})`);
  console.log(`  [副人格] ${persona.secondaryConfig.name} (${persona.secondaryPersona})`);
  console.log(`  [每日能量 KPI] ${persona.dailyEnergyKPI.toFixed(4)}`);
  console.log(`  [压力系数] ${(persona.pressureCoefficient * 100).toFixed(1)}%`);
  console.log(`\n  [问候语] ${persona.greetingTemplate}`);

  if (result.atoms.length > 0) {
    const atom = personalizeAtom(result.atoms[0], persona);
    console.log(`\n  [原子任务人格化] ${atom.taskDescription}`);
  }

  // 模拟 Rerouting：连续 3 天未完成
  const rerouteResult = reroute(
    {
      totalTasksPlanned: 30,
      totalTasksCompleted: 18,
      consecutiveFailDays: 3,
      remainingDays: 60,
      emotionScore: 4,
      deadlineFixed: tc.scene === 'gaokao' || tc.scene === 'intl-top20',
    },
    {
      originalDailyKPI: persona.dailyEnergyKPI,
      totalDays: tc.days,
      totalGap: result.gap.totalGap,
      persona,
      drive: {
        why: '这是我最想实现的梦想',
        keywords: ['梦想', '坚持'],
        intensity: 8,
      },
    }
  );

  console.log(`\n  [Rerouting 模拟 · 连续 3 天懈怠]`);
  console.log(`    级别：${rerouteResult.level}`);
  console.log(`    偏离度：${rerouteResult.deviationPercent.toFixed(1)}%`);
  console.log(`    策略：${rerouteResult.strategy}`);
  console.log(`    切换人格：${rerouteResult.activePersona}`);
  console.log(`    系统消息：${rerouteResult.systemMessage}`);
}

console.log('\n═══════════════════════════════════════════════════');
console.log('  全链路验证完成');
console.log('═══════════════════════════════════════════════════\n');
