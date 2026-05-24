/**
 * WUXIAN 3.0 · 确定性因果闭环（能量守恒与因果达成引擎）
 * 目标 × 现状 × 路径 咬合后，有效努力物理削减「命运阻力」。
 */

import {
  applyDestinyReduction,
  getMentorPlanView,
  type DynamicMilestone,
} from '../db/school-matrix';
import { bumpReversingMatrixProgress } from '../db/milestone-schema';
import { cognizeTopologyNode } from '../api/topology-engine';

export interface DestinyHardWorkResult {
  challengeIndex: number;
  previousIndex: number;
  reduction: number;
  mentorWhisper: string;
  certaintyProgress: number;
  unlockedPhase: string | null;
  dynamicMilestones?: DynamicMilestone[];
}

function buildMentorWhisper(
  challengeIndex: number,
  targetSchool: string,
  reduction: number,
  solvedNodeCount: number,
): string {
  const school = targetSchool.trim() || '梦校';
  if (challengeIndex < 30) {
    return `现在的你，已经具备了把梦想变成现实的全部物理条件。去拿回属于你的王座。`;
  }
  if (challengeIndex < 50) {
    return `引力斜率正在放缓。${school} 不再遥不可及——你刚刚用实打实的改变，把阻力削掉了 ${reduction.toFixed(1)} 个点。`;
  }
  if (solvedNodeCount > 0) {
    return `我看到了你的改变。这一刀切在因果链上，${school} 离你近了 ${Math.max(1, Math.round(reduction))} 公里。继续保持。`;
  }
  if (reduction >= 2) {
    return `有效撞击已入账。命运阻力下降 ${reduction.toFixed(1)}%——只要你愿意走，路就在往下躺平。`;
  }
  return `每一次抬头、每一次硬啃，系统都记下了。继续投喂路径 B，让 ${school} 的门槛向你坍缩。`;
}

export class DestinyExecutionEngine {
  /**
   * 路径 B / 桌面拦截：有效自学或歼灭认知卡点后，物理扣减挑战指数。
   * 公式：每修复 1 卡点 −1.5%；每高强度 1 小时 −0.5%。
   */
  static async registerHardWork(
    userId: string,
    hoursInvested: number,
    solvedNodeCount: number,
    options?: { resolvedConcept?: string },
  ): Promise<DestinyHardWorkResult | null> {
    const uid = userId.trim();
    if (!uid) return null;

    const hours = Math.max(0, Number(hoursInvested) || 0);
    const solved = Math.max(0, Math.round(Number(solvedNodeCount) || 0));
    const reduction = solved * 1.5 + hours * 0.5;

    if (reduction <= 0) return null;

    const planBefore = getMentorPlanView(uid);
    if (!planBefore) return null;

    if (solved > 0 && options?.resolvedConcept?.trim()) {
      cognizeTopologyNode(uid, options.resolvedConcept.trim());
    }

    if (solved > 0) {
      bumpReversingMatrixProgress(uid, Math.min(3, solved));
    } else if (hours >= 0.5) {
      bumpReversingMatrixProgress(uid, 1);
    }

    const mentorWhisper = buildMentorWhisper(
      Math.max(1, planBefore.challengeIndex - reduction),
      planBefore.targetSchool,
      reduction,
      solved,
    );

    const applied = applyDestinyReduction(uid, reduction, solved, mentorWhisper);
    if (!applied) return null;

    const planAfter = getMentorPlanView(uid);

    return {
      challengeIndex: applied.challengeIndex,
      previousIndex: applied.previousIndex,
      reduction: applied.reduction,
      mentorWhisper: applied.mentorWhisper,
      certaintyProgress: applied.certaintyProgress,
      unlockedPhase: applied.unlockedPhase,
      dynamicMilestones: planAfter?.dynamicMilestones,
    };
  }
}
