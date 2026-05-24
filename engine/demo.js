/**
 * WUXIAN · DeconstructGoal 引擎验证脚本
 * 运行：node engine/demo.js
 */

const { DeconstructGoal } = require('./deconstruct-goal');

console.log('═══════════════════════════════════════════');
console.log('  WUXIAN · 万能目标逆向拆解引擎 · 0号种子验证');
console.log('═══════════════════════════════════════════\n');

// 场景 C：国际高中 Top 20 冲刺（大娃种子用户）
const seedUserA = DeconstructGoal({
  dream: '冲刺美国 Top 20 综合性大学，方向：结构设计与美术交叉',
  baseline: '高二，已考 SAT 1400，AP 3 门（微积分BC、物理1、艺术史），有美术作品集和结构设计社团经历',
  totalDays: 540,
  scene: 'intl-top20',
  baselineHints: {
    userId: 'seed-大娃',
    stage: '高二',
    spikes: ['美术', '结构设计'],
    levels: {
      sat: 0.55,
      ap: 0.45,
      spike: 0.35,
      activity: 0.30,
      essay: 0.05,
      mental: 0.40,
    },
  },
  drive: {
    why: '我想用设计改变世界，像扎哈·哈迪德一样把建筑变成艺术',
    keywords: ['设计', '改变世界', '扎哈·哈迪德', '艺术'],
    intensity: 9,
  },
});

printResult('大娃 · 国际 Top 20', seedUserA);

// 场景 C：二娃种子用户
const seedUserB = DeconstructGoal({
  dream: '高一打好基础，目标 Top 30，特长口才与领导力',
  baseline: '高一，托福 85，AP 未考，校辩论队成员，暂无标化成绩',
  totalDays: 720,
  scene: 'intl-top20',
  baselineHints: {
    userId: 'seed-二娃',
    stage: '高一',
    spikes: ['口才', '辩论', '领导力'],
    levels: {
      sat: 0.10,
      ap: 0.05,
      spike: 0.25,
      activity: 0.20,
      essay: 0.0,
      mental: 0.50,
    },
  },
  drive: {
    why: '我想成为能站在台上改变人们想法的人',
    keywords: ['台上', '改变想法', '演讲'],
    intensity: 8,
  },
});

printResult('二娃 · 国际 Top 30', seedUserB);

function printResult(label, result) {
  console.log(`\n── ${label} ──\n`);
  console.log(`  梦想分类：${result.goal.category}`);
  console.log(`  进化轨迹：${result.goal.evolutionPath}`);
  console.log(`  加权总差距：${(result.gap.totalGap * 100).toFixed(1)}%`);
  console.log(`  关键瓶颈：${result.gap.criticalNodes.join(' → ')}`);
  console.log(`  执行力风险：${(result.deviationRisk * 100).toFixed(1)}%`);
  console.log(`  里程碑数：${result.milestones.length}`);
  console.log(`  本周原子任务：`);

  result.atoms
    .filter(a => a.cadence === 'daily')
    .slice(0, 5)
    .forEach(a => {
      console.log(`    [P${a.priority}] ${a.label} (${a.estimatedMinutes}min)`);
    });
}

console.log('\n═══════════════════════════════════════════');
console.log('  引擎验证完成 · Baseline-First 架构已跑通');
console.log('═══════════════════════════════════════════\n');
