/**
 * 梦校唤醒后：写入指标库 + 导师战役表 + 逆向矩阵倒计时
 */

import { SchoolMetricsCompiler } from './metrics-compiler';
import { WuxianMentorEngine } from './mentor-engine';
import {
  buildAnchorBriefPayload,
  finalizeAnchorBriefChat,
  buildTimelineFromApply,
  daysUntilApply,
  matchSchoolIntel,
  milestonesToDynamic,
  type AnchorBriefPayload,
} from './school-anchor-brief';
import { upsertMentorPlan, upsertSchoolTargetMetrics } from '../db/school-matrix';
import {
  detectSchoolPathway,
  mergeMetricsForPathway,
  normalizeAnchorProfileInput,
  parseK12FocusSubject,
  PATHWAY_LABEL,
  type AnchorProfileInput,
} from './school-pathway';
import {
  buildAndPersistLearningPath,
  timelineFromLearningPath,
} from './learning-path-engine';

/** 重算学业指标/倒计时（启发式，不耗 Warp）— 换梦校后同步中央「学业分析」 */
export async function refreshAnchorPlanMetrics(
  input: AnchorProfileInput,
): Promise<AnchorBriefPayload> {
  const normalized = normalizeAnchorProfileInput(input);
  const uid = normalized.userId;
  const school = normalized.school;
  const major = normalized.major;
  const targetLabel = `${school} · ${major}`;
  const daysToDeadline = daysUntilApply(normalized.targetApplyAt);
  const geo = {
    currentSchool: normalized.currentSchool ?? '',
    currentRegion: normalized.currentRegion ?? '',
    targetSchoolRegion: normalized.targetSchoolRegion ?? '',
  };
  const pathway = detectSchoolPathway(school, major, {
    ...geo,
    currentGrade: normalized.currentGrade,
  });

  if (pathway === 'k12_stage') {
    return bootstrapAnchorPlan({
      ...normalized,
      currentSchool: geo.currentSchool,
      currentRegion: geo.currentRegion,
      targetSchoolRegion: geo.targetSchoolRegion,
    });
  }

  const baseline = {
    grade: normalized.currentGrade,
    school,
    major,
    targetApplyAt: normalized.targetApplyAt,
    ...geo,
    pathway,
  };

  const matrix = await SchoolMetricsCompiler.compileGoalAndPlan({
    userId: uid,
    targetSchool: targetLabel,
    currentBaseline: baseline,
    daysToDeadline,
  });

  let timeline =
    matrix.timelineMilestones?.length > 0
      ? matrix.timelineMilestones
      : buildTimelineFromApply(normalized.targetApplyAt, normalized.currentGrade);
  let challengeForPlan = matrix.challengeIndex;

  const wakeLine =
    pathway === 'domestic_cn'
      ? `航标【${targetLabel}】已更新。指标与倒计时已切换为国内高考/强基/竞赛轨（已清除托福/SAT/AP 残留）。`
      : `航标【${targetLabel}】已更新。按当前升学路径重算了标化与专业课节点。`;

  const payload = buildAnchorBriefPayload({
    school,
    major,
    currentGrade: normalized.currentGrade,
    targetApplyAt: normalized.targetApplyAt,
    challengeIndex: matrix.challengeIndex,
    gapDetails: matrix.gapDetails,
  });
  payload.pathway = pathway;
  payload.pathwayLabel = PATHWAY_LABEL[pathway];
  payload.requiredMetrics = mergeMetricsForPathway(
    matchSchoolIntel(school, major).requiredMetrics,
    matrix.requiredMetrics,
    pathway,
  );
  finalizeAnchorBriefChat(payload, uid);
  try {
    const pathDoc = await buildAndPersistLearningPath(uid);
    if (pathDoc.phases.length > 0) {
      timeline = timelineFromLearningPath(pathDoc);
      challengeForPlan = pathDoc.challengeIndex;
      payload.timelineMilestones = timeline;
      payload.dynamicMilestones = milestonesToDynamic(timeline, challengeForPlan);
      payload.challengeIndex = challengeForPlan;
    }
  } catch {
    /* 路径生成失败不阻断航标 */
  }

  const dynamicMilestones = milestonesToDynamic(timeline, challengeForPlan);
  upsertMentorPlan({
    userId: uid,
    targetSchool: targetLabel,
    currentBaseline: baseline,
    mentorWakeUpCall: wakeLine,
    challengeIndex: challengeForPlan,
    causalityGaps: matrix.gapDetails.map((g) => ({ weakness: '差距项', causalityEffect: g })),
    dynamicMilestones,
  });

  return payload;
}

export async function bootstrapAnchorPlan(input: {
  userId: string;
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  currentSchool?: string;
  currentRegion?: string;
  targetSchoolRegion?: string;
}): Promise<AnchorBriefPayload> {
  const uid = input.userId.trim();
  const school = input.school.trim();
  const major = input.major.trim();
  const targetLabel = `${school} · ${major}`;
  const daysToDeadline = daysUntilApply(input.targetApplyAt);
  const geo = {
    currentSchool: input.currentSchool ?? '',
    currentRegion: input.currentRegion ?? '',
    targetSchoolRegion: input.targetSchoolRegion ?? '',
  };
  const pathway = detectSchoolPathway(school, major, { ...geo, currentGrade: input.currentGrade });
  const baseline = {
    grade: input.currentGrade,
    school,
    major,
    targetApplyAt: input.targetApplyAt,
    currentSchool: geo.currentSchool,
    currentRegion: geo.currentRegion,
    targetSchoolRegion: geo.targetSchoolRegion,
    pathway,
  };

  const intel = pathway === 'k12_stage' ? { requiredMetrics: {} as Record<string, string> } : matchSchoolIntel(school, major);
  const timeline = buildTimelineFromApply(input.targetApplyAt, input.currentGrade);

  if (pathway === 'k12_stage') {
    const focus = parseK12FocusSubject(major);
    const goalLine = major.includes('全校') ? major : major;
    const gapDetailsK12 = [
      `阶段目标：${goalLine}（${PATHWAY_LABEL.k12_stage}）`,
      geo.currentSchool
        ? `现就读【${geo.currentSchool}】${input.currentGrade ? ` · ${input.currentGrade}` : ''}`
        : '请填写现就读学校，便于对齐课本进度',
      focus
        ? `主攻【${focus}】：用单元卷/错题本证明每一章都在涨分`
        : '先锁定一个主攻科目，别同时铺太多科',
      `距阶段节点约 ${daysToDeadline} 天，按周交付可验证成果（卷面/错题/听写）`,
    ];
    const requiredK12: Record<string, unknown> = {
      校内目标: goalLine,
      主攻科目: focus ?? '待选择',
      当前年级: input.currentGrade,
    };
    const challengeIndex = 58;
    upsertSchoolTargetMetrics({
      userId: uid,
      targetSchool: targetLabel,
      requiredMetrics: requiredK12,
      currentBaseline: baseline,
      gapDetails: gapDetailsK12,
      challengeIndex,
      timelineMilestones: timeline,
      activePhase: timeline[0]?.phase ?? '本学期',
    });
    const dynamicMilestones = milestonesToDynamic(timeline, challengeIndex);
    upsertMentorPlan({
      userId: uid,
      targetSchool: targetLabel,
      currentBaseline: baseline,
      mentorWakeUpCall: `航标已设为【${goalLine}】。ZHI 按校内节奏追问，不逼你填大学。`,
      challengeIndex,
      causalityGaps: gapDetailsK12.map((g) => ({ weakness: '阶段目标', causalityEffect: g })),
      dynamicMilestones,
    });
    const payload = buildAnchorBriefPayload({
      school,
      major,
      currentGrade: input.currentGrade,
      targetApplyAt: input.targetApplyAt,
      challengeIndex,
      gapDetails: gapDetailsK12,
    });
    payload.pathway = 'k12_stage';
    payload.pathwayLabel = PATHWAY_LABEL.k12_stage;
    payload.chatText = [
      `智宝，当前是【${PATHWAY_LABEL.k12_stage}】，不必先选大学。`,
      `阶段目标：${goalLine}`,
      focus ? `主攻科目：${focus}` : '建议先锁定一科单科突破。',
      `距节点约 ${daysToDeadline} 天。左侧是单元攻坚、错题本与周测归档，用卷面证明进步。`,
      geo.currentSchool ? `现就读：${geo.currentSchool}` : '请补全现就读学校。',
    ].join('\n');
    finalizeAnchorBriefChat(payload, uid);
    return payload;
  }

  let challengeIndex = 72;
  let gapDetails =
    pathway === 'domestic_cn'
      ? [
          `备考窗口约 ${daysToDeadline} 天，需按高考/强基/竞赛节奏拆解数学、物理与信息学节点`,
          geo.currentSchool
            ? `现就读【${geo.currentSchool}】，将对标本校课程与${school}计科录取线差距`
            : `请补充现就读学校，便于对齐课程难度与竞赛布局`,
        ]
      : [
          `备考窗口约 ${daysToDeadline} 天，需按周拆解标化与专业课`,
          '申请者池竞争激烈，需可验证的项目/竞赛深度',
        ];
  let requiredMetrics: Record<string, unknown> = { ...intel.requiredMetrics };

  try {
    const matrix = await SchoolMetricsCompiler.compileGoalAndPlan({
      userId: uid,
      targetSchool: targetLabel,
      currentBaseline: baseline,
      daysToDeadline,
    });
    challengeIndex = matrix.challengeIndex;
    gapDetails = matrix.gapDetails;
    requiredMetrics = mergeMetricsForPathway(intel.requiredMetrics, matrix.requiredMetrics, pathway);
  } catch (err) {
    console.warn('[AnchorBootstrap] metrics compile fallback:', err);
    const merged = mergeMetricsForPathway(intel.requiredMetrics, requiredMetrics, pathway);
    upsertSchoolTargetMetrics({
      userId: uid,
      targetSchool: targetLabel,
      requiredMetrics: merged,
      currentBaseline: baseline,
      gapDetails,
      challengeIndex,
      timelineMilestones: timeline,
      activePhase: timeline[0]?.phase ?? null,
    });
    requiredMetrics = merged;
  }

  try {
    await WuxianMentorEngine.consultAndArchitect({
      userId: uid,
      targetSchool: targetLabel,
      currentBaseline: baseline,
      daysToDeadline,
    });
  } catch (err) {
    console.warn('[AnchorBootstrap] mentor consult fallback:', err);
    const dynamicMilestones = milestonesToDynamic(timeline, challengeIndex);
    upsertMentorPlan({
      userId: uid,
      targetSchool: targetLabel,
      currentBaseline: baseline,
      mentorWakeUpCall: `航标【${targetLabel}】已锁定。按下方倒计时表推进，别再把时间耗在查数据上。`,
      challengeIndex,
      causalityGaps: gapDetails.map((g) => ({ weakness: '差距项', causalityEffect: g })),
      dynamicMilestones,
    });
  }

  const payload = buildAnchorBriefPayload({
    school,
    major,
    currentGrade: input.currentGrade,
    targetApplyAt: input.targetApplyAt,
    challengeIndex,
    gapDetails,
  });
  finalizeAnchorBriefChat(payload, uid);
  try {
    const pathDoc = await buildAndPersistLearningPath(uid);
    if (pathDoc.phases.length > 0) {
      const tl = timelineFromLearningPath(pathDoc);
      payload.timelineMilestones = tl;
      payload.dynamicMilestones = milestonesToDynamic(tl, pathDoc.challengeIndex);
      payload.challengeIndex = pathDoc.challengeIndex;
      upsertMentorPlan({
        userId: uid,
        targetSchool: targetLabel,
        currentBaseline: baseline,
        mentorWakeUpCall: pathDoc.todayFocus
          ? `今日攻坚：${pathDoc.todayFocus.title} · ${pathDoc.summaryLine}`
          : pathDoc.summaryLine,
        challengeIndex: pathDoc.challengeIndex,
        causalityGaps: gapDetails.map((g) => ({ weakness: '差距项', causalityEffect: g })),
        dynamicMilestones: payload.dynamicMilestones,
      });
    }
  } catch {
    /* 路径生成失败不阻断航标 */
  }
  return payload;
}
