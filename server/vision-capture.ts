/**
 * WUXIAN · 屏幕/截图视觉捕捉 → 语义描述 → 量子意图
 */

import { readFileSync, unlinkSync } from 'fs';
import multer from 'multer';
import { ValidationError } from './errors';
import { getUploadsDir } from './data-path';
import { parseIntent, type StructuredIntent } from './quantum-intent-parser';
import { getUserLlmApiKey } from '../src/db/user-llm-config-schema';
import { gatewayOpenAiMessages, resolveVisionGatewayLlm } from '../src/services/llm-gateway';
import type { LlmChatMessageParam } from './llm/llm-provider';

export interface VisionIntentResult {
  sceneDescription: string;
  rawSpeechText: string;
  intent: StructuredIntent;
  message: string;
}

const visionUpload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, getUploadsDir()),
    filename: (_req: any, _file: any, cb: any) => {
      cb(null, `frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ok = file.mimetype.startsWith('image/');
    if (ok) cb(null, true);
    else cb(new Error('仅接受图像帧（jpeg / png / webp）'));
  },
});

export const visionIntentMulter = visionUpload.single('frame');

const VISION_PROMPT = `你是 WUXIAN 学习驾驶舱的视觉感知层。用户在学习时截取了屏幕或题目画面。
用 1–3 句中文概括：学科/题型、卡住的点、用户可能想求助的内容。
不要 Markdown，不要列表，直接输出叙述文本。`;

export async function processVisionIntent(userId: string, filePath: string, mimeType: string): Promise<VisionIntentResult> {
  try {
    const buf = readFileSync(filePath);
    const visionLlm = resolveVisionGatewayLlm(userId);
    let sceneDescription = '桌面视觉帧已捕获（文本模式）';
    if (visionLlm.ready) {
      try {
        const dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;
        const messages: LlmChatMessageParam[] = [
          { role: 'system', content: VISION_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请读图并输出 1–3 句中文概括：学科/题型、卡住点、用户可能想求助的内容。' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ];
        const gw = await gatewayOpenAiMessages(userId, messages, {
          traceId: `vision_capture_${userId}`,
          maxTokens: 220,
          temperature: 0.2,
          llm: visionLlm,
          billable: false,
        });
        const text = (gw.data ?? '').trim();
        if (text) sceneDescription = text;
      } catch {
        /* ignore */
      }
    }
    const rawSpeechText = `【屏幕捕捉】${sceneDescription}`;
    const deepseekKey = getUserLlmApiKey(userId, 'deepseek') || undefined;
    const intent = await parseIntent(rawSpeechText, deepseekKey);

    return {
      sceneDescription,
      rawSpeechText,
      intent,
      message: '视觉引力已捕获',
    };
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
}

export async function describeScreenFromDataUrl(
  userId: string,
  dataUrl: string,
  userHint?: string,
): Promise<string> {
  const _uid = userId;
  const _frame = dataUrl;
  const hint = userHint?.trim();
  return hint ? `桌面学习场景（文本模式）: ${hint}` : '桌面学习场景（文本模式）';
}
