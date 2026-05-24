/**
 * WUXIAN · 学校情报 API
 */

import {
  getSchoolIntelligence,
  type PlannerIntelCell,
  type TargetSchoolProfile,
} from '../core/school-intelligence';
import { getSchoolIntelOrchestrator } from '../openclaw/school-orchestrator';
import { getDualSchoolOrchestrator } from '../openclaw/dual-school-orchestrator';
import type { SchoolMatrixInput } from '../core/dual-school-aligner';

export interface SchoolIntelScanRequest {
  schoolName: string;
  officialWebsiteUrl?: string;
  studentId?: string;
  currentKnowledgeNode?: string;
}

export interface CrowdsourceUploadRequest {
  plannerId: string;
  schoolName: string;
  intelType: PlannerIntelCell['intelType'];
  title: string;
  content: string;
  examPointer?: string;
}

export async function scanSchoolIntel(req: SchoolIntelScanRequest) {
  const orchestrator = getSchoolIntelOrchestrator();
  const result = await orchestrator.dispatch(req);

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      openclaw: result,
      role: 'SCHOOL_INTELLIGENCE_PROBE_COMMANDER',
      philosophy: 'POINTER_ONLY_ZERO_STORAGE',
    },
  };
}

export async function runSchoolNightlyPatrol() {
  const orchestrator = getSchoolIntelOrchestrator();
  const result = await orchestrator.dispatch({ schoolName: '_patrol', runNightly: true });

  return {
    code: 200,
    status: 'SUCCESS',
    data: { patrol: result.finalResult.patrol, openclaw: result },
  };
}

export function uploadCrowdsourceIntel(req: CrowdsourceUploadRequest) {
  const intel = getSchoolIntelligence();
  const cell = intel.ingestPlannerIntel(req);

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      cell,
      message: `机密细胞已入库 · 规划师 ${req.plannerId} 算法权重 +${(cell.trustWeight * 10).toFixed(0)}%`,
      totalCells: intel.listCrowdCells(req.schoolName).length,
    },
  };
}

export function listSchoolProfiles() {
  const intel = getSchoolIntelligence();
  const profiles = intel.listProfiles();

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      profiles,
      stats: {
        totalSchools: profiles.length,
        crowdCells: intel.listCrowdCells().length,
        storageBytes: 0,
      },
    },
  };
}

export function getSchoolProfile(schoolName: string) {
  const intel = getSchoolIntelligence();
  const profile = intel.getProfile(schoolName);

  if (!profile) {
    return { code: 404, status: 'NOT_FOUND', data: { message: `未找到 ${schoolName} 情报画像` } };
  }

  return { code: 200, status: 'SUCCESS', data: { profile } };
}

export function projectDreamerToSchool(schoolName: string, studentId: string, currentNode?: string) {
  const intel = getSchoolIntelligence();
  const profile = intel.getProfile(schoolName);

  if (!profile) {
    return { code: 404, status: 'NOT_FOUND', data: { message: '请先执行学校情报扫描' } };
  }

  const projection = intel.projectToDreamerCanvas(profile, studentId, currentNode);

  return {
    code: 200,
    status: 'SUCCESS',
    data: { projection, profile },
  };
}

export async function alignDualSchool(matrix: SchoolMatrixInput) {
  const orchestrator = getDualSchoolOrchestrator();
  const result = await orchestrator.dispatch(matrix);

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      openclaw: result,
      report: result.finalResult.report,
      role: 'DUAL_SCHOOL_GRAVITY_AUDITOR',
      philosophy: 'POINTER_ONLY_ZERO_STORAGE',
    },
  };
}
