import {
  generateDefaultDirectories,
  getSchoolAnchorProfile,
  listZhiArtifacts,
  listZhiDirectories,
  saveSchoolAnchorProfile,
} from '../db/zhi-cloud-schema';
import { syncCognitiveDirectoriesFromCloud } from '../db/directory-schema';
import { bootstrapAnchorPlan, refreshAnchorPlanMetrics } from '../services/anchor-plan-bootstrap';
import { migrateUserPathway } from '../services/pathway-migrate';
import { loadAnchorBriefForUser, type AnchorBriefPayload } from '../services/school-anchor-brief';
import {
  detectSchoolPathway,
  normalizeAnchorProfileInput,
  type AnchorProfileInput,
} from '../services/school-pathway';
import { ZhiStorageBridge } from '../services/ZhiStorageBridge';

export type AnchorBriefDto = {
  chatText: string;
  daysRemaining: number;
  challengeIndex: number;
  timelineMilestones: unknown[];
  dynamicMilestones: unknown[];
  requiredMetrics: Record<string, unknown>;
  pathway: string;
  pathwayLabel: string;
};

function toAnchorBriefDto(brief: Awaited<ReturnType<typeof refreshAnchorPlanMetrics>> | null): AnchorBriefDto | null {
  if (!brief) return null;
  return {
    chatText: brief.chatText,
    daysRemaining: brief.daysRemaining,
    challengeIndex: brief.challengeIndex,
    timelineMilestones: brief.timelineMilestones,
    dynamicMilestones: brief.dynamicMilestones,
    requiredMetrics: brief.requiredMetrics,
    pathway: brief.pathway,
    pathwayLabel: brief.pathwayLabel,
  };
}

export type SyncAnchorDirectoriesResult = {
  success: true;
  anchorDirectoryId: string;
  anchorProfile: ReturnType<typeof getSchoolAnchorProfile>;
  directories: ReturnType<typeof generateDefaultDirectories>;
  anchorBrief: AnchorBriefDto | null;
};

/** 保存航标 + 重算侧栏目录 + 学业指标/倒计时（中央分析区同步） */
export async function syncAnchorDirectories(input: AnchorProfileInput): Promise<SyncAnchorDirectoriesResult> {
  const normalized = normalizeAnchorProfileInput(input);
  saveSchoolAnchorProfile(normalized);
  migrateUserPathway(normalized.userId);
  const dirs = generateDefaultDirectories({
    userId: normalized.userId,
    school: normalized.school,
    major: normalized.major,
    currentGrade: normalized.currentGrade,
    currentSchool: normalized.currentSchool,
    currentRegion: normalized.currentRegion,
    targetSchoolRegion: normalized.targetSchoolRegion,
  });
  const anchor = syncCognitiveDirectoriesFromCloud(
    normalized.userId,
    normalized.school,
    normalized.major,
    {
      currentGrade: normalized.currentGrade,
      targetApplyAt: normalized.targetApplyAt,
      currentSchool: normalized.currentSchool,
      currentRegion: normalized.currentRegion,
      targetSchoolRegion: normalized.targetSchoolRegion,
    },
  );
  let anchorBrief: AnchorBriefDto | null = null;
  try {
    anchorBrief = toAnchorBriefDto(await refreshAnchorPlanMetrics(normalized));
  } catch (err) {
    console.warn('[ZhiCloud] refreshAnchorPlanMetrics:', err);
    anchorBrief = toAnchorBriefDto(loadAnchorBriefForUser(normalized.userId) as Awaited<ReturnType<typeof refreshAnchorPlanMetrics>> | null);
  }
  return {
    success: true,
    anchorDirectoryId: anchor.id,
    anchorProfile: getSchoolAnchorProfile(normalized.userId),
    directories: dirs,
    anchorBrief,
  };
}

export async function generateAndListZhiDirectories(input: AnchorProfileInput) {
  const normalized = normalizeAnchorProfileInput(input);
  const synced = await syncAnchorDirectories(normalized);
  const profile = synced.anchorProfile;

  let anchorBrief: AnchorBriefPayload | null = loadAnchorBriefForUser(normalized.userId);
  if (!anchorBrief) {
    try {
      anchorBrief = await bootstrapAnchorPlan({
        ...normalized,
        currentSchool: normalized.currentSchool ?? '',
        currentRegion: normalized.currentRegion ?? '',
        targetSchoolRegion: normalized.targetSchoolRegion ?? '',
      });
    } catch (err) {
      console.warn('[ZhiCloud] anchor plan bootstrap:', err);
    }
  }

  const pathway = detectSchoolPathway(normalized.school, normalized.major, {
    currentSchool: normalized.currentSchool,
    currentRegion: normalized.currentRegion,
    targetSchoolRegion: normalized.targetSchoolRegion,
    currentGrade: normalized.currentGrade,
  });

  return {
    success: true,
    directories: synced.directories,
    anchorDirectoryId: synced.anchorDirectoryId,
    anchorProfile: profile,
    pathway,
    anchorBrief: anchorBrief
      ? {
          chatText: anchorBrief.chatText,
          daysRemaining: anchorBrief.daysRemaining,
          challengeIndex: anchorBrief.challengeIndex,
          timelineMilestones: anchorBrief.timelineMilestones,
          dynamicMilestones: anchorBrief.dynamicMilestones,
          requiredMetrics: anchorBrief.requiredMetrics,
          pathway: anchorBrief.pathway,
          pathwayLabel: anchorBrief.pathwayLabel,
        }
      : null,
  };
}

export function getZhiCloudState(userId: string) {
  const profile = getSchoolAnchorProfile(userId);
  return {
    success: true,
    directories: listZhiDirectories(userId, profile?.school, profile?.major),
    artifacts: listZhiArtifacts(userId),
    anchorProfile: profile,
  };
}

export async function pushZhiArtifact(input: {
  userId: string;
  dirId: string;
  title: string;
  content: string;
  version: string;
  artifactId?: string;
}) {
  const pushed = await ZhiStorageBridge.pushArtifactToCloud(input);
  return { success: pushed.success, url: pushed.url, cloudKey: pushed.cloudKey };
}

