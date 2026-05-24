/**
 * WUXIAN · OpenClaw 学校情报编排器
 * 三层探针 → 录取画像重组 → 可选梦想家投影
 */

import { getSchoolIntelligence } from '../core/school-intelligence';
import type { DreamerProjection, TargetSchoolProfile } from '../core/school-intelligence';
import type { OpenClawDispatchResult, SkillExecutionStep } from './types';
import {
  runShadowBrowserCrawl,
  runMarketSentimentScan,
  runPartnerExamGateway,
  runPlannerCrowdsourceMerge,
  assembleRawData,
  type ProbeContext,
} from './school-probes';

export interface SchoolIntelRequest {
  schoolName: string;
  officialWebsiteUrl?: string;
  studentId?: string;
  currentKnowledgeNode?: string;
  runNightly?: boolean;
}

export class SchoolIntelOrchestrator {

  async dispatch(req: SchoolIntelRequest): Promise<OpenClawDispatchResult> {
    const taskId = `sch-intel-${Date.now().toString(36)}`;
    const intel = getSchoolIntelligence();

    if (req.runNightly) {
      const patrol = intel.runNightlyPatrol();
      return {
        taskId,
        status: 'SUCCESS',
        plan: {
          taskId,
          intent: 'school_intel',
          skillChain: ['shadow_browser_crawl', 'market_sentiment_scan'],
          reasoning: '深夜静默巡航 · 扫描已注册学校招生风向',
        },
        steps: [{
          skillId: 'market_sentiment_scan',
          status: 'done',
          log: patrol.message,
          output: patrol as unknown as Record<string, unknown>,
        }],
        finalResult: { patrol },
        companionReply: patrol.message,
      };
    }

    const ctx: ProbeContext = {
      schoolName: req.schoolName,
      officialWebsiteUrl: req.officialWebsiteUrl,
    };

    const crowdCells = intel.listCrowdCells(req.schoolName);
    const steps: SkillExecutionStep[] = [];

    steps.push(await runShadowBrowserCrawl(ctx));
    steps.push(await runMarketSentimentScan(ctx));
    steps.push(await runPartnerExamGateway(ctx));
    steps.push(await runPlannerCrowdsourceMerge(ctx, crowdCells.length));

    const raw = assembleRawData(ctx, steps, crowdCells);
    const profile = intel.conceptualizeSchoolProfile(raw);

    let projection: DreamerProjection | null = null;
    if (req.studentId) {
      projection = intel.projectToDreamerCanvas(
        profile,
        req.studentId,
        req.currentKnowledgeNode ?? '平面几何-相似三角形',
      );
    }

    const status = steps.every(s => s.status === 'done') ? 'SUCCESS' : 'PARTIAL';

    return {
      taskId,
      status,
      plan: {
        taskId,
        intent: 'school_intel',
        skillChain: [
          'shadow_browser_crawl',
          'market_sentiment_scan',
          'partner_exam_gateway',
          'planner_crowdsource_ingest',
        ],
        reasoning: `三层情报探针降维打击 → 重组【${req.schoolName}】录取画像`,
      },
      steps,
      finalResult: { profile, projection, storageBytes: 0 },
      companionReply: this.buildReply(profile, projection),
    };
  }

  private buildReply(profile: TargetSchoolProfile, projection: DreamerProjection | null): string {
    const lines = [
      `OpenClaw 情报中枢完成。【${profile.schoolName}】录取画像已重组。`,
      `2026 硬名额 ${profile.enrollmentCap2026} · 难度系数 ${(profile.difficultyRating * 100).toFixed(0)}%`,
      `数学要求: ${profile.admissionCriteria.mathRequirement}`,
      `数据源: ${profile.dataSources.join(' + ')} · 零冗余存储`,
    ];
    if (projection) {
      lines.push('', projection.projectionMessage);
    }
    return lines.join('\n');
  }
}

let globalSchoolOrchestrator: SchoolIntelOrchestrator | null = null;

export function getSchoolIntelOrchestrator(): SchoolIntelOrchestrator {
  if (!globalSchoolOrchestrator) globalSchoolOrchestrator = new SchoolIntelOrchestrator();
  return globalSchoolOrchestrator;
}
