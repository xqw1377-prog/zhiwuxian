/**
 * WUXIAN · v1 + v3.5 统一对象类型
 * 桥接目标路由核心与 ZHI 能力层
 */

export type GoalType = 'TOEFL' | 'ACADEMIC' | 'GENERIC';
export type TaskStatus = 'TODO' | 'DONE' | 'FAILED' | 'SKIPPED';
export type GoalStatus = 'ACTIVE' | 'RISK_ALERT' | 'COMPLETED' | 'ABANDONED';
export type DirectoryType = 'STRATEGIC_GOAL' | 'ACADEMIC_SUBJECT' | 'ERROR_BANK' | 'CUSTOM';
export type TaskSource = 'deconstruct' | 'reroute' | 'night_patrol' | 'manual';

export interface Mission {
  missionId: string;
  userId: string;
  title: string;
  goalType: GoalType;
  directoryId?: string;
  createdAt: string;
  updatedAt: string;
  status: GoalStatus;
}

export interface Directory {
  id: string;
  title: string;
  type: DirectoryType;
  isPinned: boolean;
  parentId?: string | null;
  goalCount?: number;
  todayTaskCount?: number;
}

export interface Goal {
  id: string;
  title: string;
  durationDays: number;
  remainingDays: number;
  driveForce: string;
  totalEnergy: number;
  currentSlope: number;
  status: GoalStatus;
  personaType: string;
  goalType: GoalType;
  userId?: string;
  directoryId?: string;
}

export interface Task {
  id: string;
  goalId: string;
  sequenceDate: string;
  content: string;
  energyCost: number;
  status: TaskStatus;
  failReason?: string | null;
  source?: TaskSource;
  parentTaskId?: string;
  attemptCount?: number;
}

export interface Artifact {
  artifactId: string;
  dirId: string;
  fileTitle: string;
  versionTag: string;
  cloudKey: string;
  cdnUrl?: string | null;
}

export interface Intervention {
  type: 'reroute' | 'escape_penalty' | 'night_patrol' | 'shadow_challenge';
  goalId: string;
  action: string;
  oldSlope: number;
  newSlope: number;
  speech: string;
  timestamp: string;
}

export interface EnergyLedger {
  totalEnergy: number;
  remainingEnergy: number;
  consumed: number;
  currentSlope: number;
  deviationRisk: number;
  continuousFailDays: number;
}
