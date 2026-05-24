/**
 * WUXIAN 两端双向架构 · 冻结路由数据契约
 * Platform Admin ↔ User Client (PC / Mobile)
 */

// ── 管理端 ──

export type GoalCategory = 'HARDCORE' | 'HABIT' | 'CREATIVE';

export interface StandardMilestone {
  phase: number;
  description: string;
  energyPercentage: number;
}

export interface AdminTemplatePayload {
  templateId: string;
  title: string;
  goalCategory: GoalCategory;
  totalBaseEnergy: number;
  standardDays: number;
  standardMilestones: StandardMilestone[];
  isDeadlineFixed: boolean;
  publishedAt?: string;
  version: number;
}

export interface TemplatePublishResult {
  status: 'PUBLISHED' | 'UPDATED';
  templateId: string;
  version: number;
  syncedAt: string;
}

export interface AbandonRateMetric {
  templateId: string;
  title: string;
  goalCategory: GoalCategory;
  activeUsers: number;
  abandonRate: number;
}

// ── 用户端 ──

export type DeviceType = 'PC' | 'MOBILE';

export interface UserSpaceActivation {
  userId: string;
  chosenTemplateId: string;
  userGoalText?: string;
  userTimeBaseline: number;
  deviceType: DeviceType;
  currentStatus?: string;
}

export interface DeviceAdaptedPayload {
  deviceType: DeviceType;
  layout: 'immersive' | 'compact';
  interactionCadence: 'low' | 'high';
  showFullRoadmap: boolean;
  showTodayOnly: boolean;
}

export interface UserActivationResult {
  status: 'ACTIVATED';
  userId: string;
  dreamSpaceId: string;
  templateId: string;
  templateVersion: number;
  syncedAt: string;
  syncLatencyMs: number;
  timeCompressionRatio: number;
  initialSlope: number;
  device: DeviceAdaptedPayload;
  todayTasks: import('../core/types').AtomTask[];
  milestones: import('../core/types').Milestone[];
  dreamSpace: import('../core/types').DreamSpace;
}

// ── 路由常量 ──

export const API_ROUTES = {
  ADMIN: {
    PUBLISH_TEMPLATE: 'POST /api/admin/templates',
    LIST_TEMPLATES: 'GET /api/admin/templates',
    GET_TEMPLATE: 'GET /api/admin/templates/:id',
    ANALYTICS_ABANDON: 'GET /api/admin/analytics/abandon-rate',
  },
  USER: {
    ACTIVATE: 'POST /api/user/activate',
    GET_SPACE: 'GET /api/user/spaces/:userId',
    SYNC_TEMPLATE: 'GET /api/sync/template/:templateId',
  },
} as const;

export const GOAL_CATEGORY_MAP: Record<GoalCategory, string> = {
  HARDCORE: 'clearance',
  HABIT: 'endurance',
  CREATIVE: 'creation',
};
