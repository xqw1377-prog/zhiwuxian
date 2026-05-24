/**
 * WUXIAN · ZHI 学习趋势预测引擎
 * 根据历史遥测数据预测用户学习趋势、建议调整策略
 */

import { getLearningDb } from './wuxian-learning-db';
import { getCoreDb } from './wuxian-core-db';

export interface LearningTrend {
  userId: string;
  momentum: number;
  consistency: number;
  velocity: number;
  predictedCompletionRate: number;
  riskLevel: 'low' | 'medium' | 'high';
  insights: string[];
  recommendedActions: string[];
}

export interface TrendDataPoint {
  date: string;
  tasksCompleted: number;
  tasksTotal: number;
  energyConsumed: number;
  studyMinutes: number;
}

function getCompletionRate(trend: TrendDataPoint[]): number {
  if (trend.length === 0) return 0;
  const totalTasks = trend.reduce((s, d) => s + d.tasksTotal, 0);
  const completedTasks = trend.reduce((s, d) => s + d.tasksCompleted, 0);
  return totalTasks > 0 ? completedTasks / totalTasks : 0;
}

function getConsistencyScore(trend: TrendDataPoint[]): number {
  if (trend.length < 3) return 1;
  const activeDays = trend.filter((d) => d.tasksTotal > 0).length;
  return activeDays / trend.length;
}

function getVelocity(trend: TrendDataPoint[]): number {
  if (trend.length < 2) return 0;
  const recent = trend.slice(-7);
  const avgEnergy = recent.reduce((s, d) => s + d.energyConsumed, 0) / recent.length;
  return avgEnergy;
}

function assessRiskLevel(
  consistency: number,
  velocity: number,
  completionRate: number,
): 'low' | 'medium' | 'high' {
  if (consistency < 0.3 || velocity < 10 || completionRate < 0.2) return 'high';
  if (consistency < 0.6 || velocity < 50 || completionRate < 0.5) return 'medium';
  return 'low';
}

function generateInsights(
  trend: TrendDataPoint[],
  consistency: number,
  velocity: number,
  completionRate: number,
  _riskLevel: string,
): string[] {
  const insights: string[] = [];

  if (trend.length === 0) {
    insights.push('尚无足够数据生成趋势分析。开始学习后将自动分析。');
    return insights;
  }

  if (consistency < 0.3) {
    insights.push('学习连续性较低，建议设置每日固定学习时段培养习惯。');
  } else if (consistency < 0.6) {
    insights.push('学习连续性中等，保持节奏可进一步提升效率。');
  } else {
    insights.push('学习连续性好，良好的习惯是进步的基础。');
  }

  if (velocity > 100) {
    insights.push('学习能量投入充沛，注意合理分配防止疲劳。');
  } else if (velocity < 30) {
    insights.push('学习能量投入偏低，可尝试增加单次学习时长。');
  }

  if (completionRate > 0.8) {
    insights.push('任务完成率高，目标设定合理。');
  } else if (completionRate < 0.4) {
    insights.push('任务完成率偏低，建议检查目标是否过于激进。');
  }

  return insights;
}

function generateRecommendations(
  riskLevel: string,
  consistency: number,
  velocity: number,
  completionRate: number,
): string[] {
  const actions: string[] = [];

  if (riskLevel === 'high') {
    actions.push('建议重新评估当前目标，拆分为更小的里程碑。');
    actions.push('考虑使用「虫洞跃迁」跳过过于困难的知识节点。');
  }

  if (consistency < 0.4) {
    actions.push('启用每日提醒，帮助建立学习习惯。');
  }

  if (completionRate < 0.5) {
    actions.push('尝试降低每日任务量，优先保证完成率。');
  }

  if (actions.length === 0) {
    actions.push('当前学习状态良好，继续保持。');
    actions.push('尝试挑战更高难度的学习内容。');
  }

  return actions;
}

export function computeLearningTrend(userId: string): LearningTrend {
  const learning = getLearningDb();
  getCoreDb();

  const rawTrends = learning.prepare(`
    SELECT DATE(ts) as date,
           COUNT(*) as tasksTotal
    FROM behavioral_telemetry_events
    WHERE user_id = ? AND ts > datetime('now', '-30 days')
    GROUP BY DATE(ts)
    ORDER BY date ASC
  `).all(userId) as { date: string; tasksTotal: number }[];

  const rawCompletions = learning.prepare(`
    SELECT DATE(completed_at) as date,
           COUNT(*) as tasksCompleted,
           SUM(energy_cost) as energyConsumed
    FROM tasks
    WHERE user_id = ? AND completed_at > datetime('now', '-30 days')
    GROUP BY DATE(completed_at)
    ORDER BY date ASC
  `).all(userId) as { date: string; tasksCompleted: number; energyConsumed: number }[];

  const trendMap = new Map<string, TrendDataPoint>();
  for (const r of rawTrends) {
    trendMap.set(r.date, {
      date: r.date,
      tasksCompleted: 0,
      tasksTotal: r.tasksTotal,
      energyConsumed: 0,
      studyMinutes: 0,
    });
  }
  for (const r of rawCompletions) {
    const existing = trendMap.get(r.date);
    if (existing) {
      existing.tasksCompleted = r.tasksCompleted;
      existing.energyConsumed = r.energyConsumed;
    } else {
      trendMap.set(r.date, {
        date: r.date,
        tasksCompleted: r.tasksCompleted,
        tasksTotal: 0,
        energyConsumed: r.energyConsumed,
        studyMinutes: 0,
      });
    }
  }

  const trend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const completionRate = getCompletionRate(trend);
  const consistency = getConsistencyScore(trend);
  const velocity = getVelocity(trend);
  const riskLevel = assessRiskLevel(consistency, velocity, completionRate);

  return {
    userId,
    momentum: velocity,
    consistency,
    velocity,
    predictedCompletionRate: completionRate,
    riskLevel,
    insights: generateInsights(trend, consistency, velocity, completionRate, riskLevel),
    recommendedActions: generateRecommendations(riskLevel, consistency, velocity, completionRate),
  };
}
