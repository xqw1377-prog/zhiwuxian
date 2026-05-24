/**
 * ZHI 工具流 · LLM 调用统一沙箱前缀
 * 所有验收卷 / 对话 / 路径生成在进模型前必须经 ZhiPathwaySandbox
 */

import type { LlmChatMessage } from '../llm/llm-provider';
import { ZhiPathwaySandbox, type GuardrailResolveInput, type PathwayGuardrail } from '../gateway/ZhiPathwaySandbox';

export type ZhiToolLlmContext = GuardrailResolveInput & {
  userId: string;
};

/** 解析沙箱（对话 / 出卷 / 路径规划入口） */
export function resolvePathwayGuardrail(ctx: ZhiToolLlmContext): PathwayGuardrail {
  return ZhiPathwaySandbox.injectSystemGuardrail({
    userId: ctx.userId,
    goalId: ctx.goalId ?? null,
  });
}

/** 业务 system + 沙箱铁律 → 单条 system 消息 */
export function buildSandboxedSystemContent(
  baseSystemPrompt: string,
  ctx: ZhiToolLlmContext,
): string {
  return ZhiPathwaySandbox.prefixGuardrail(baseSystemPrompt, {
    userId: ctx.userId,
    goalId: ctx.goalId ?? null,
  });
}

/**
 * 构造带沙箱的 messages（沙箱 system 置于最前，焊死赛道）
 */
export function buildSandboxedLlmMessages(
  ctx: ZhiToolLlmContext,
  baseSystemPrompt: string,
  userContent: string,
  extraMessages: LlmChatMessage[] = [],
): LlmChatMessage[] {
  const systemContent = buildSandboxedSystemContent(baseSystemPrompt, ctx);
  return [
    { role: 'system', content: systemContent },
    ...extraMessages,
    { role: 'user', content: userContent },
  ];
}

/** 对模型输出做赛道消毒（国内高三禁美本术语） */
export function sanitizeLlmOutput(text: string, ctx: ZhiToolLlmContext): string {
  const g = resolvePathwayGuardrail(ctx);
  return ZhiPathwaySandbox.sanitizeModelText(text, g.track);
}
