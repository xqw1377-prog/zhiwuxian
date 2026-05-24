/**
 * WUXIAN · 认知图谱数据库（管理端全局模板库）
 * 内存实现，后续替换为 PostgreSQL / Redis
 */

import type { AdminTemplatePayload, GoalCategory } from './types';

class TemplateStore {
  private templates = new Map<string, AdminTemplatePayload>();
  private versionIndex = new Map<string, number>();

  publish(payload: AdminTemplatePayload): AdminTemplatePayload {
    const existing = this.templates.get(payload.templateId);
    const version = existing ? existing.version + 1 : 1;

    const template: AdminTemplatePayload = {
      ...payload,
      version,
      publishedAt: new Date().toISOString(),
    };

    this.templates.set(payload.templateId, template);
    this.versionIndex.set(payload.templateId, version);
    return template;
  }

  get(templateId: string): AdminTemplatePayload | null {
    return this.templates.get(templateId) ?? null;
  }

  list(): AdminTemplatePayload[] {
    return Array.from(this.templates.values()).sort(
      (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
    );
  }

  getVersion(templateId: string): number {
    return this.versionIndex.get(templateId) ?? 0;
  }

  seedDefaults(): void {
    const seeds: AdminTemplatePayload[] = [
      {
        templateId: 'tpl-cert-30d',
        title: '30天硬核通关考证',
        goalCategory: 'HARDCORE',
        totalBaseEnergy: 1000,
        standardDays: 30,
        isDeadlineFixed: true,
        version: 0,
        standardMilestones: [
          { phase: 1, description: '知识框架搭建', energyPercentage: 0.25 },
          { phase: 2, description: '高频考点刷题', energyPercentage: 0.35 },
          { phase: 3, description: '全真模考冲刺', energyPercentage: 0.25 },
          { phase: 4, description: '考前心理调整', energyPercentage: 0.15 },
        ],
      },
      {
        templateId: 'tpl-english-365d',
        title: '365天流利英语养成',
        goalCategory: 'HABIT',
        totalBaseEnergy: 1200,
        standardDays: 365,
        isDeadlineFixed: false,
        version: 0,
        standardMilestones: [
          { phase: 1, description: '发音与基础词汇', energyPercentage: 0.20 },
          { phase: 2, description: '日常对话突破', energyPercentage: 0.30 },
          { phase: 3, description: '场景化表达', energyPercentage: 0.30 },
          { phase: 4, description: '流利度巩固', energyPercentage: 0.20 },
        ],
      },
      {
        templateId: 'tpl-artshow-180d',
        title: '180天独立画展筹备',
        goalCategory: 'CREATIVE',
        totalBaseEnergy: 1000,
        standardDays: 180,
        isDeadlineFixed: true,
        version: 0,
        standardMilestones: [
          { phase: 1, description: '灵感积累与技法修炼', energyPercentage: 0.30 },
          { phase: 2, description: '作品批量产出', energyPercentage: 0.40 },
          { phase: 3, description: '策展与布展', energyPercentage: 0.20 },
          { phase: 4, description: '开展与复盘', energyPercentage: 0.10 },
        ],
      },
    ];

    for (const seed of seeds) {
      this.publish(seed);
    }
  }
}

export const templateStore = new TemplateStore();

export function categoryToArchetype(category: GoalCategory): string {
  const map: Record<GoalCategory, string> = {
    HARDCORE: 'clearance',
    HABIT: 'endurance',
    CREATIVE: 'creation',
  };
  return map[category];
}
