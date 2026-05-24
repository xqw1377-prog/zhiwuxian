/**
 * WUXIAN · OpenClaw 最高调度指挥官
 * Planning + Skill Calling → 驱动 Whisper / Gemini / Neo4j 专项 Skills
 */

import { getSemanticRouter } from '../core/public-course-auditor';
import type {
  OpenClawDispatchResult,
  OpenClawTaskPlan,
  ParsedUserIntent,
  SkillExecutionStep,
  SkillId,
} from './types';
import {
  runVideoStreamSniff,
  runWhisperTranscribe,
  runMultimodalAudit,
  runGraphRegister,
  buildPointerFromUrl,
} from './skills';

const URL_PATTERN = /https?:\/\/[^\s]+/i;

export class OpenClawOrchestrator {

  /**
   * 中央调度入口：理解人类意图 → 规划 Skill 链 → 自动执行
   */
  async dispatch(userInput: string): Promise<OpenClawDispatchResult> {
    const intent = this.parseIntent(userInput);
    const plan = this.planSkillChain(intent);
    const steps: SkillExecutionStep[] = [];
    let finalResult: Record<string, unknown> = {};

    if (plan.intent === 'audit_course' && intent.sourceUrl) {
      const pointer = buildPointerFromUrl(intent.sourceUrl, intent.title ?? undefined);

      const s1 = await runVideoStreamSniff({ sourceUrl: intent.sourceUrl, platform: pointer.platform });
      steps.push(s1);

      const s2 = await runWhisperTranscribe({ durationMin: 45 });
      steps.push(s2);

      const s3 = await runMultimodalAudit(pointer);
      steps.push(s3);

      const audit = (s3.output?.audit as import('../core/public-course-auditor').CourseCapabilityAudit) ?? null;
      if (audit) {
        const s4 = await runGraphRegister(audit);
        steps.push(s4);
        finalResult = {
          audit,
          graphNode: s4.output,
          storageBytes: 0,
          status: s4.output?.registered ? 'SUCCESS // 零存储挂网成功' : 'FILTERED // 评级未达标',
        };
      }
    } else if (plan.intent === 'match_course') {
      const router = getSemanticRouter();
      const match = router.match(userInput, { minWormhole: 0.5 });
      steps.push({
        skillId: 'semantic_match',
        status: 'done',
        log: match.message,
        output: { match },
      });
      finalResult = { match };
    } else {
      steps.push({
        skillId: 'multimodal_audit',
        status: 'failed',
        log: '未检测到有效的公共课件 URL 或匹配意图',
      });
    }

    const status = steps.every(s => s.status === 'done') ? 'SUCCESS'
      : steps.some(s => s.status === 'done') ? 'PARTIAL' : 'FAILED';

    return {
      taskId: plan.taskId,
      status,
      plan,
      steps,
      finalResult,
      companionReply: this.buildCompanionReply(intent, finalResult, status),
    };
  }

  parseIntent(rawInput: string): ParsedUserIntent {
    const urlMatch = rawInput.match(URL_PATTERN);
    const sourceUrl = urlMatch ? urlMatch[0].replace(/[。，,.]$/, '') : null;
    const platform = sourceUrl ? detectPlatformQuick(sourceUrl) : null;

    let title: string | null = null;
    const titleMatch = rawInput.match(/[讲授教]:?\s*([^https]+)/) ||
      rawInput.match(/(清华|MIT|B站).{0,20}(公开课|讲座|视频)/);
    if (titleMatch) title = titleMatch[0].trim().slice(0, 40);

    let intent: ParsedUserIntent['intent'] = 'unknown';
    if (sourceUrl && /评估|审计|audit|分析|奇异值|svd|公开课|课件/i.test(rawInput)) {
      intent = 'audit_course';
    } else if (/匹配|卡壳|路由|找课|推荐/i.test(rawInput)) {
      intent = 'match_course';
    } else if (sourceUrl) {
      intent = 'audit_course';
    }

    return { rawInput, hasUrl: !!sourceUrl, sourceUrl, platform, title, intent };
  }

  planSkillChain(intent: ParsedUserIntent): OpenClawTaskPlan {
    const taskId = `oc-task-${Date.now().toString(36)}`;
    let skillChain: SkillId[] = [];
    let reasoning = '';

    if (intent.intent === 'audit_course') {
      skillChain = ['video_stream_sniff', 'whisper_transcribe', 'multimodal_audit', 'graph_register'];
      reasoning = '检测到公共课件 URL + 评估意图 → 启动四段式零存储审计链路';
    } else if (intent.intent === 'match_course') {
      skillChain = ['semantic_match'];
      reasoning = '检测到匹配/路由意图 → 启动语义路由 Skill';
    } else {
      reasoning = '意图不明确，等待更具体的 URL 或指令';
    }

    return { taskId, intent: intent.intent, skillChain, reasoning };
  }

  private buildCompanionReply(
    intent: ParsedUserIntent,
    result: Record<string, unknown>,
    status: string,
  ): string {
    if (intent.intent === 'audit_course' && result.audit) {
      const a = result.audit as import('../core/public-course-auditor').CourseCapabilityAudit;
      return [
        `OpenClaw 任务完成。已将【${a.targetPointer.title}】审计为 ${a.auditGrade} 级战略指针。`,
        `归类：${a.cognitiveCategory}`,
        `虫洞适应度 ${(a.wormholeAdaptability * 100).toFixed(0)}% · 推荐起点 ${a.recommendedTimeStamp}`,
        `零存储挂网 · 中央库增加 0 字节视频实体。`,
      ].join('\n');
    }
    if (result.match) {
      const m = (result.match as import('../core/public-course-auditor').SemanticMatchResult);
      if (m.matched) return `语义路由命中 → ${m.deepLinkUrl}`;
    }
    return status === 'SUCCESS'
      ? 'OpenClaw 已静默完成 Skill 链路编排。'
      : '请提供公共课件 URL，例如：帮我评估这个 B 站公开课 [URL]';
  }
}

function detectPlatformQuick(url: string): string {
  if (/bilibili/i.test(url)) return 'Bilibili';
  if (/youtube|youtu\.be/i.test(url)) return 'YouTube';
  if (/coursera/i.test(url)) return 'Coursera';
  if (/pan\.|drive\./i.test(url)) return 'Drive';
  return 'OpenCourse';
}

let globalOrchestrator: OpenClawOrchestrator | null = null;

export function getOpenClawOrchestrator(): OpenClawOrchestrator {
  if (!globalOrchestrator) globalOrchestrator = new OpenClawOrchestrator();
  return globalOrchestrator;
}
