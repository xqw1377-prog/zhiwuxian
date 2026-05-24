/**
 * WUXIAN · 原子任务粉碎机
 * 将梦想粉碎到「15分钟一定能完成」的原子维度
 */

import type { GoalArchetype } from './persona-switcher';

export interface AtomTaskDTO {
  id: string;
  desc: string;
  time: number;
  scheduledAt: string;
  nodeType: string;
}

const ATOM_POOLS: Record<GoalArchetype, string[]> = {
  clearance: [
    '用 {time} 分钟专攻「{topic}」第 {n} 组高频错题（限时完成）',
    '今天下午 {hour}:00，完成 {time} 分钟「{topic}」知识点闭环训练',
    '用 {time} 分钟复盘昨日模考第 {n} 道错题，写出错因关键词',
    '限时 {time} 分钟刷题：{topic} · 目标正确率 ≥ 80%',
  ],
  endurance: [
    '今天 {hour}:00，用 {time} 分钟完成今日打卡单元（{topic}）',
    '用 {time} 分钟进行「{topic}」刻意练习，完成后解锁今日勋章',
    '睡前 {time} 分钟：{topic} 复习 + 1 条学习心得记录',
  ],
  creation: [
    '今天下午 {hour}:00，用 {time} 分钟推进「{topic}」作品第 {n} 个细节',
    '用 {time} 分钟完成「{topic}」技法练习（不求完美，只求动手）',
    '用 {time} 分钟整理「{topic}」灵感素材库，新增 ≥ 3 条笔记',
  ],
};

const TOPIC_EXTRACT: Record<GoalArchetype, (goal: string) => string> = {
  clearance: (g) => {
    if (/全栈|架构|开源/.test(g)) return '全栈架构核心模块';
    if (/SAT|托福|雅思/.test(g)) return '标化阅读逻辑';
    if (/高考|考/.test(g)) return '薄弱学科突破';
    return '核心知识缺口';
  },
  endurance: (g) => {
    if (/英语|语言/.test(g)) return '日常口语表达';
    if (/阅读/.test(g)) return '深度阅读积累';
    return '习惯养成单元';
  },
  creation: (g) => {
    if (/画|美术|展/.test(g)) return '作品集创作';
    if (/开源|系统/.test(g)) return '开源项目迭代';
    return '核心作品打磨';
  },
};

export function forgeAtomTasks(
  goal: string,
  archetype: GoalArchetype,
  count = 3,
  options?: {
    granularity?: 'normal' | 'reduced' | 'micro';
    missDays?: number;
    userSignal?: string;
  },
): AtomTaskDTO[] {
  const pool = ATOM_POOLS[archetype];
  const topic = TOPIC_EXTRACT[archetype](goal);
  const hour = 14;
  const granularity = options?.granularity ?? 'normal';
  const missDays = options?.missDays ?? 0;
  const tasks: AtomTaskDTO[] = [];

  const durationScale = granularity === 'micro' ? 0.5 : granularity === 'reduced' ? 0.7 : 1;
  const effectiveCount = granularity === 'micro' ? 1 : granularity === 'reduced' ? 2 : count;

  for (let i = 0; i < effectiveCount; i++) {
    const tpl = pool[i % pool.length];
    let time = Math.round((i === 0 ? 15 : i === 1 ? 20 : 10) * durationScale);
    if (granularity === 'micro') time = 5;
    if (options?.userSignal === 'TASK_TOO_HARD') time = Math.max(5, time - 5);

    let desc = tpl
      .replace('{time}', String(time))
      .replace('{topic}', topic)
      .replace('{n}', String(i + 3))
      .replace('{hour}', String(hour + i));

    if (granularity === 'micro') {
      desc = `今天只做 ${time} 分钟：${topic} 最小重启动作（完成即赢）`;
    } else if (granularity === 'reduced' && missDays >= 2) {
      desc = `[降级] ${desc}（已拆碎，降低难度）`;
    }

    tasks.push({
      id: `atom-${Date.now()}-${i}`,
      desc,
      time,
      scheduledAt: granularity === 'micro' ? '今日 · 微启动' : `今日 ${hour + i}:00`,
      nodeType: archetype,
    });
  }

  return tasks;
}
