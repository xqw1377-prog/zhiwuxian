/**
 * WUXIAN · OpenClaw 双端重力场编排器
 */

import {
  getDualSchoolAligner,
  type SchoolMatrixInput,
  type WormholeVelocityReport,
} from '../core/dual-school-aligner';
import type { OpenClawDispatchResult, SkillExecutionStep } from './types';
import {
  runCurrentSchoolProbe,
  runTargetSchoolProbe,
  runExamLatexCrush,
  runDualGravityAlign,
} from './dual-school-probes';

export class DualSchoolOrchestrator {

  async dispatch(matrix: SchoolMatrixInput): Promise<OpenClawDispatchResult> {
    const taskId = `dual-sch-${Date.now().toString(36)}`;
    const steps: SkillExecutionStep[] = [];

    steps.push(await runCurrentSchoolProbe(matrix.currentSchool));
    steps.push(await runTargetSchoolProbe(matrix.targetSchool));

    const currentPapers = matrix.currentSchool.examPapers ?? [];
    const targetExams = matrix.targetSchool.admissionExams ?? [];
    steps.push(await runExamLatexCrush(currentPapers, targetExams));

    const aligner = getDualSchoolAligner();
    const report = aligner.alignDualSchoolValue(matrix);

    steps.push(await runDualGravityAlign(
      report.gravityGapScore,
      report.valueDimensions.gravityGapIndex.wormholeRequired,
    ));

    const status = steps.every(s => s.status === 'done') ? 'SUCCESS' : 'PARTIAL';

    return {
      taskId,
      status,
      plan: {
        taskId,
        intent: 'dual_school_align',
        skillChain: [
          'current_school_probe',
          'target_school_probe',
          'exam_latex_crush',
          'dual_gravity_align',
        ],
        reasoning: `双端时空重力场审计 · ${matrix.currentSchool.name} → ${matrix.targetSchool.name}`,
      },
      steps,
      finalResult: { report, storageBytes: 0 },
      companionReply: report.companionBrief,
    };
  }
}

let globalDualOrchestrator: DualSchoolOrchestrator | null = null;

export function getDualSchoolOrchestrator(): DualSchoolOrchestrator {
  if (!globalDualOrchestrator) globalDualOrchestrator = new DualSchoolOrchestrator();
  return globalDualOrchestrator;
}

export type { WormholeVelocityReport, SchoolMatrixInput };
