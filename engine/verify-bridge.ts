/**
 * WUXIAN · 两端路由桥梁验证
 * 运行：npx tsx engine/verify-bridge.ts
 */

import { templateStore } from './bridge/template-store';
import { syncBridge } from './bridge/sync-bridge';
import type { AdminTemplatePayload } from './bridge/types';

console.log('══════════════════════════════════════════════════════');
console.log('  WUXIAN · 两端双向路由桥梁验证');
console.log('══════════════════════════════════════════════════════\n');

// ── 1. 管理端：注入梦想模板 ──
templateStore.seedDefaults();

const customTemplate: AdminTemplatePayload = {
  templateId: 'tpl-gaokao-100d',
  title: '100天高考硬核提分',
  goalCategory: 'HARDCORE',
  totalBaseEnergy: 1500,
  standardDays: 100,
  isDeadlineFixed: true,
  version: 0,
  standardMilestones: [
    { phase: 1, description: '薄弱学科诊断', energyPercentage: 0.15 },
    { phase: 2, description: '知识点逐个击破', energyPercentage: 0.40 },
    { phase: 3, description: '真题限时训练', energyPercentage: 0.30 },
    { phase: 4, description: '冲刺模考与心态', energyPercentage: 0.15 },
  ],
};

const published = templateStore.publish(customTemplate);
console.log('[Admin] 模板发布成功');
console.log(`    ID: ${published.templateId}`);
console.log(`    分类: ${published.goalCategory}`);
console.log(`    标准能量: ${published.totalBaseEnergy}`);
console.log(`    标准天数: ${published.standardDays}`);
console.log(`    版本: v${published.version}`);

// ── 2. 同步拉取（模拟用户端毫秒级请求）──
const syncStart = performance.now();
const synced = syncBridge.getTemplateForSync('tpl-cert-30d');
const syncMs = Math.round(performance.now() - syncStart);

console.log(`\n[Sync] 模板同步拉取 (${syncMs}ms)`);
console.log(`    模板: ${synced?.title}`);
console.log(`    里程碑数: ${synced?.standardMilestones.length}`);

// ── 3. 用户端 PC：激活梦想空间 ──
const pcActivation = syncBridge.activate({
  userId: 'user-pc-001',
  chosenTemplateId: 'tpl-cert-30d',
  userGoalText: '45天拿下CPA会计科目',
  userTimeBaseline: 45,
  deviceType: 'PC',
  currentStatus: '有初级基础，未系统复习',
});

console.log('\n[User · PC] 双轴激活');
console.log(`    用户: ${pcActivation.userId}`);
console.log(`    模板: ${pcActivation.templateId} v${pcActivation.templateVersion}`);
console.log(`    时间压缩比: ${pcActivation.timeCompressionRatio.toFixed(2)} (45/30)`);
console.log(`    同步延迟: ${pcActivation.syncLatencyMs}ms`);
console.log(`    布局: ${pcActivation.device.layout}`);
console.log(`    里程碑: ${pcActivation.milestones.length} 个 (全量路线图)`);
console.log(`    今日任务: ${pcActivation.todayTasks.length} 项`);

// ── 4. 用户端 Mobile：同一模板，不同剪裁 ──
const mobileActivation = syncBridge.activate({
  userId: 'user-mobile-001',
  chosenTemplateId: 'tpl-cert-30d',
  userTimeBaseline: 45,
  deviceType: 'MOBILE',
});

console.log('\n[User · Mobile] 双轴激活');
console.log(`    布局: ${mobileActivation.device.layout}`);
console.log(`    交互频次: ${mobileActivation.device.interactionCadence}`);
console.log(`    里程碑: ${mobileActivation.milestones.length} 个 (仅活跃阶段)`);
console.log(`    今日任务: ${mobileActivation.todayTasks.length} 项 (精简)`);
mobileActivation.todayTasks.forEach(t => {
  console.log(`    → [${t.durationMinutes}min] ${t.taskDescription}`);
});

// ── 5. 创造类模板验证 ──
const artActivation = syncBridge.activate({
  userId: 'user-art-001',
  chosenTemplateId: 'tpl-artshow-180d',
  userTimeBaseline: 120,
  deviceType: 'PC',
  currentStatus: '有素描基础',
});

console.log('\n[User · 创造类] 画展模板激活');
console.log(`    时间压缩比: ${artActivation.timeCompressionRatio.toFixed(2)}`);
console.log(`    斜率: ${artActivation.initialSlope.toFixed(4)}`);
artActivation.milestones.forEach(m => {
  console.log(`    Phase ${m.weekIndex}w: ${m.label} (${m.targetEnergy.toFixed(0)} energy)`);
});

console.log('\n══════════════════════════════════════════════════════');
console.log('  两端路由桥梁验证完成');
console.log('  启动 API Server: npm run server');
console.log('══════════════════════════════════════════════════════\n');
