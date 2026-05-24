/**
 * WUXIAN Core Engine · 冻结数据契约 TypeScript 类型
 * 与 engine/schema/data-contract.schema.json 一一对应
 */

export type NodeType =
  | 'knowledge'
  | 'skill'
  | 'physical'
  | 'psychological'
  | 'milestone'
  | 'credential';

export interface KnowledgeNode {
  id: string;
  type: NodeType;
  label: string;
  weight: number;
  prerequisites?: string[];
}

export interface GoalVector {
  category: string;
  evolutionPath: string;
  nodes: KnowledgeNode[];
}

export interface GoalBaseline {
  raw: string;
  vector: GoalVector;
}

export interface TimeBaseline {
  totalDays: number;
  isDeadlineFixed: boolean;
  targetDate?: string;
  currentDay: number;
}

export interface EnergyMatrix {
  totalEnergyRequired: number;
  remainingEnergy: number;
  consumedEnergy: number;
  nodeEnergies: Record<string, number>;
}

export interface TimeSlope {
  initialSlope: number;
  currentSlope: number;
  dailyEnergyKPI: number;
  pressureCoefficient: number;
}

export type MilestoneStatus = 'pending' | 'active' | 'done' | 'blocked';

export interface Milestone {
  id: string;
  label: string;
  weekIndex: number;
  targetEnergy: number;
  status: MilestoneStatus;
}

export interface AtomTask {
  taskId: string;
  taskDescription: string;
  durationMinutes: number;
  difficultyWeight: number;
  scheduledDay: number;
  milestoneId?: string;
  nodeId?: string;
  completed: boolean;
}

export type DreamSpaceStatus =
  | 'INITIALIZED'
  | 'ACTIVE'
  | 'REROUTING'
  | 'COMPLETED'
  | 'CRITICAL';

export interface DreamSpace {
  id: string;
  goalBaseline: GoalBaseline;
  timeBaseline: TimeBaseline;
  energyMatrix: EnergyMatrix;
  timeSlope: TimeSlope;
  milestones: Milestone[];
  atoms: AtomTask[];
  status: DreamSpaceStatus;
  createdAt: string;
}

export interface InitializeResult {
  status: 'SUCCESS' | 'ERROR';
  message: string;
  dreamSpace: DreamSpace;
  initialSlope: number;
  totalMilestones: number;
  todayTasks: AtomTask[];
  milestones: Milestone[];
  atoms: AtomTask[];
  deviationRisk: number;
  velocity?: { totalGoalWeight: number; dailyEnergyKPI: number; pressureMode: string };
  persona?: unknown;
  userBaseline?: { targetGoal: string; timeFrameDays: number; currentStatus: string };
}

export type RerouteStatus = 'SILENT' | 'ADJUSTED' | 'EXTENDED' | 'CRITICAL';
export type RerouteStrategy = 'redistribute' | 'compress' | 'extend' | 'reframe';

export interface ReroutingInput {
  currentDay: number;
  remainingEnergy: number;
  todayCompleted: boolean;
  consecutiveFailDays?: number;
}

export interface ReroutingOutput {
  status: RerouteStatus;
  strategy: RerouteStrategy;
  newDailySlope: number;
  adjustedTotalDays: number;
  tomorrowTasks: AtomTask[];
  message: string;
}

export interface InitializeOptions {
  goalBaseline: string;
  timeBaseline: number;
  isDeadlineFixed?: boolean;
  currentStatus?: string;
}
