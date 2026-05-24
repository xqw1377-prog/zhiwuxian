export { WuxianCoreEngine, GOAL_TEMPLATES, ARCHETYPE_KEYWORDS } from './wuxian-core-engine';
export { WUXIAN_MANIFEST } from './brand-manifest';
export { AwarenessSensor, simulateClassroomSession } from './awareness-sensor';
export { WuxianTalentRadar, simulateTalentStream } from './talent-radar';
export { WuxianWormholeEngine, buildLearningStateFromRadar, simulateWormholeReadyState } from './wormhole-engine';
export type { LearningState, WormholeJumpResult } from './wormhole-engine';
export {
  WuxianAudioAssimilationEngine,
  simulateClassroomAudio,
  simulateWormholeReadyClassroom,
} from './audio-assimilation-engine';
export type {
  ClassroomAudioPayload,
  AssimilationResult,
  CognitivePyramid,
  NeuralAnchor,
  UserReactionType,
} from './audio-assimilation-engine';
export {
  WuxianLiveCorrectionEngine,
  simulateFlowStroke,
  simulateStuckStroke,
  simulateDeadEndStroke,
} from './live-correction-engine';
export type {
  RealtimePenStroke,
  DeviationSignal,
  LiveCorrectionResult,
  HintLevel,
  InstantRemediationCard,
} from './live-correction-engine';
export {
  WuxianVideoAssimilationBrain,
  getVideoBrain,
  simulateVideoPayload,
  simulateLowGradeVideo,
} from './video-assimilation-brain';
export type {
  RawVideoPayload,
  SecondaryAssessmentReport,
  KnowledgeCell,
  CognitiveReserveEntry,
  VideoClipResolution,
  CourseGrade,
} from './video-assimilation-brain';
export {
  WuxianPublicCourseAuditor,
  WuxianSemanticRouter,
  getPublicCourseAuditor,
  getSemanticRouter,
  detectPlatform,
  simulatePublicCourse,
  seedPublicPointers,
} from './public-course-auditor';
export type {
  PublicCoursePointer,
  CourseCapabilityAudit,
  GraphPointerNode,
  SemanticMatchResult,
  AuditGrade,
  CoursePlatform,
} from './public-course-auditor';
export { getOpenClawOrchestrator } from '../openclaw/orchestrator';
export { getSchoolIntelOrchestrator } from '../openclaw/school-orchestrator';
export { getDualSchoolOrchestrator } from '../openclaw/dual-school-orchestrator';
export { OPENCLAW_SKILLS } from '../openclaw/types';
export type {
  OpenClawDispatchResult,
  OpenClawTaskPlan,
  SkillExecutionStep,
  SkillId,
} from '../openclaw/types';
export {
  WuxianSchoolIntelligence,
  getSchoolIntelligence,
} from './school-intelligence';
export type {
  SchoolRawData,
  PlannerIntelCell,
  TargetSchoolProfile,
  DreamerProjection,
  AdmissionCriteria,
} from './school-intelligence';
export {
  WuxianDualSchoolAligner,
  getDualSchoolAligner,
} from './dual-school-aligner';
export type {
  SchoolMatrixInput,
  WormholeVelocityReport,
  SchoolValueDimensions,
  ActionRouteCell,
} from './dual-school-aligner';
export type * from './types';

// ── 新基础设施 ──
export { PrivacyConsentManager, getPrivacyManager, getDataCategoryLabel } from './privacy-consent';
export type { ConsentGrant, PrivacyProfile, DataCategory, ConsentStatus, DataExportPackage } from './privacy-consent';
export { SubscriptionManager, getSubscriptionManager } from './subscription';
export type { SubscriptionTier, SubscriptionPlan, UserSubscription } from './subscription';
export { AIServiceManager, getAIServiceManager } from './ai-service';
export type { AIServiceName, AIServiceStatus, AIServiceResult } from './ai-service';
export {
  WuxianEvolutionaryEngine,
  getEvolutionaryEngine,
  resonanceFromStroke,
} from './evolutionary-engine';
export type {
  DigitalOrganism,
  InteractionEnergyStream,
  EvolutionResult,
  OrganismAttraction,
  OrganismKind,
  CognitiveResonance,
} from './evolutionary-engine';
export {
  WuxianDailyTraceEngine,
  getDailyTraceEngine,
} from './daily-trace-engine';
export type {
  DailyTraceInput,
  TraceGenesisReport,
  TraceKind,
  HomeworkTracePayload,
  ExamTracePayload,
  EcosystemTracePayload,
} from './daily-trace-engine';
export {
  WuxianCognitiveTwinEngine,
  getCognitiveTwinEngine,
} from './cognitive-twin-engine';
export type {
  CognitiveTwinOrganism,
  TwinSyncInput,
  TwinSyncReport,
  BrainMicroHabits,
  WormholePathCell,
  TwinVitality,
  IntuitionMode,
} from './cognitive-twin-engine';
export { planReroute, type RerouteStage, type ReroutePlanOutput } from './reroute-planner';
export { decomposeGoalSmart, type DecomposeResult } from './goal-decomposer';
export { rerouteGoalIndustrial, syncGoalFromSession, type IndustrialRerouteOutput } from './industrial-reroute';
export { runIndustrialNightPatrol, runNightPatrolBatch, isPatrolWindow } from './industrial-night-patrol';
export { getPersonaSpeech, personaToIndustrial, type PersonaType, type SpeechContext } from './persona-switcher';
