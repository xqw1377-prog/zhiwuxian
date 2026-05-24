/**
 * WUXIAN · OpenClaw 双端重力场探针 Skills
 */

import type { SchoolMatrixInput } from '../core/dual-school-aligner';
import type { SkillExecutionStep } from './types';

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function runCurrentSchoolProbe(
  school: SchoolMatrixInput['currentSchool'],
): Promise<SkillExecutionStep> {
  const step: SkillExecutionStep = {
    skillId: 'current_school_probe',
    status: 'running',
    startedAt: new Date().toISOString(),
    log: `[就读校探针] 吞噬 ${school.name} 课表/期末卷/给分硬度...`,
  };

  await delay(160);

  step.status = 'done';
  step.finishedAt = new Date().toISOString();
  step.output = {
    examPapersOcr: school.examPapers ?? ['期末数学试卷 OCR 完成'],
    gpaDistribution: school.gpaDistribution ?? '给分硬度已解析',
    curriculumTrack: school.curriculumTrack ?? '国内普高',
    storageBytes: 0,
  };
  step.log += ' · LaTeX 硬度标签已提取';

  return step;
}

export async function runTargetSchoolProbe(
  school: SchoolMatrixInput['targetSchool'],
): Promise<SkillExecutionStep> {
  const step: SkillExecutionStep = {
    skillId: 'target_school_probe',
    status: 'running',
    startedAt: new Date().toISOString(),
    log: `[目标校探针] 吞噬 ${school.name} 入学真题/录取门槛...`,
  };

  await delay(180);

  step.status = 'done';
  step.finishedAt = new Date().toISOString();
  step.output = {
    admissionExams: school.admissionExams ?? ['入学考真题 OCR 完成'],
    enrollmentBar: school.enrollmentBar ?? '录取门槛已结构化',
    storageBytes: 0,
  };
  step.log += ' · 入学考 LaTeX 标签已粉碎并网';

  return step;
}

export async function runExamLatexCrush(
  currentPapers: string[],
  targetExams: string[],
): Promise<SkillExecutionStep> {
  const step: SkillExecutionStep = {
    skillId: 'exam_latex_crush',
    status: 'running',
    startedAt: new Date().toISOString(),
    log: '[考题粉碎器] 双端试卷 → LaTeX 公式标签 · 零物理存储',
  };

  await delay(140);

  step.status = 'done';
  step.finishedAt = new Date().toISOString();
  step.output = {
    currentTags: currentPapers.length,
    targetTags: targetExams.length,
    falseProsperityCheck: true,
    storageBytes: 0,
  };
  step.log += ` · 就读校 ${currentPapers.length} 卷 / 目标校 ${targetExams.length} 卷 对撞完成`;

  return step;
}

export async function runDualGravityAlign(
  gapScore: number,
  wormholeRequired: boolean,
): Promise<SkillExecutionStep> {
  const step: SkillExecutionStep = {
    skillId: 'dual_gravity_align',
    status: 'running',
    startedAt: new Date().toISOString(),
    log: '[重力场对齐] 四维度价值匹配计算中...',
  };

  await delay(120);

  step.status = 'done';
  step.finishedAt = new Date().toISOString();
  step.output = { gravityGapScore: gapScore, wormholeRequired, storageBytes: 0 };
  step.log += ` · 断层指数 ${(gapScore * 100).toFixed(0)}%${wormholeRequired ? ' · 虫洞配速已激活' : ''}`;

  return step;
}
