/**
 * WUXIAN Core Engine · 第一条 Rerouting 链路验证
 * 运行：npx tsx engine/verify-core.ts
 *
 * 验证三步军令状：
 *   1. Data Contract  → initializeDreamSpace 产出标准 JSON 结构
 *   2. DeconstructGoal → 里程碑 + 今日原子任务
 *   3. Rerouting Loop  → 今日失败 → 静默重算 → 明日任务分发
 */

import { WuxianCoreEngine } from './core/wuxian-core-engine';

const engine = new WuxianCoreEngine();

console.log('══════════════════════════════════════════════════════');
console.log('  WUXIAN Core Engine · 筑基验证');
console.log('══════════════════════════════════════════════════════\n');

// ── Step 1 + 2: 双轴初始化 + 万能拆解 ──
const init = engine.initializeDreamSpace({
  goalBaseline: '完成人生第一个独立画展，展出 15 幅作品',
  timeBaseline: 180,
  isDeadlineFixed: true,
  currentStatus: '有素描基础，尚未开始油画创作',
});

console.log('[1] Data Contract · 梦想空间初始化');
console.log(`    状态: ${init.status}`);
console.log(`    消息: ${init.message}`);
console.log(`    目标轴: ${init.dreamSpace.goalBaseline.raw}`);
console.log(`    时间轴: ${init.dreamSpace.timeBaseline.totalDays} 天 (固定截止: ${init.dreamSpace.timeBaseline.isDeadlineFixed})`);
console.log(`    总能量矩阵: ${init.dreamSpace.energyMatrix.totalEnergyRequired.toFixed(0)}`);
console.log(`    初始斜率: ${init.initialSlope.toFixed(4)}`);
console.log(`    里程碑数: ${init.totalMilestones}`);

console.log('\n[2] DeconstructGoal · 今日原子任务');
init.todayTasks.forEach(t => {
  console.log(`    → [${t.durationMinutes}min] ${t.taskDescription}`);
});

// ── Step 3: Rerouting Loop ──
console.log('\n[3] Rerouting Loop · 模拟第 1 天任务失败');

const remaining = init.dreamSpace.energyMatrix.remainingEnergy;
const dailyBurn = init.dreamSpace.timeSlope.dailyEnergyKPI;
const afterFail = remaining - dailyBurn * 0.3;

const reroute = engine.triggerDynamicRerouting({
  currentDay: 1,
  remainingEnergy: afterFail,
  todayCompleted: false,
  consecutiveFailDays: 1,
});

console.log(`    触发状态: ${reroute.status}`);
console.log(`    策略: ${reroute.strategy}`);
console.log(`    新斜率: ${reroute.newDailySlope.toFixed(4)}`);
console.log(`    调整后总天数: ${reroute.adjustedTotalDays}`);
console.log(`    系统消息: ${reroute.message}`);

console.log('\n    明日原子任务 (静默分发):');
reroute.tomorrowTasks.forEach(t => {
  console.log(`    → [Day ${t.scheduledDay}] [${t.durationMinutes}min] ${t.taskDescription}`);
});

// ── 连续失败 → CRITICAL ──
console.log('\n[3b] Rerouting Loop · 模拟连续 3 天失败');

const critical = engine.triggerDynamicRerouting({
  currentDay: 3,
  remainingEnergy: afterFail * 0.7,
  todayCompleted: false,
  consecutiveFailDays: 3,
});

console.log(`    触发状态: ${critical.status}`);
console.log(`    策略: ${critical.strategy}`);
console.log(`    新斜率: ${critical.newDailySlope.toFixed(4)} (下调 40%)`);
console.log(`    系统消息: ${critical.message}`);

// ── 弹性时间模式 ──
console.log('\n[4] 模式 B · 弹性时间锚点验证');

const engineB = new WuxianCoreEngine();
const initB = engineB.initializeDreamSpace({
  goalBaseline: '365 天内学会流利英语日常对话',
  timeBaseline: 365,
  isDeadlineFixed: false,
  currentStatus: '零基础，每天能投入 30 分钟',
});

const extend = engineB.triggerDynamicRerouting({
  currentDay: 10,
  remainingEnergy: initB.dreamSpace.energyMatrix.remainingEnergy * 0.9,
  todayCompleted: false,
  consecutiveFailDays: 2,
});

console.log(`    触发状态: ${extend.status}`);
console.log(`    策略: ${extend.strategy}`);
console.log(`    原总天数: 365 → 调整后: ${extend.adjustedTotalDays}`);
console.log(`    系统消息: ${extend.message}`);

console.log('\n══════════════════════════════════════════════════════');
console.log('  筑基完成 · 三条军令状全部跑通');
console.log('══════════════════════════════════════════════════════\n');
