/**
 * WUXIAN · 语音转意图管线（Whisper STT → 量子意图解析）
 */

import { unlinkSync } from 'fs';
import multer from 'multer';
import { ValidationError } from './errors';
import { getUploadsDir } from './data-path';
import { parseIntent, type StructuredIntent } from './quantum-intent-parser';
import { transcribeAudioFile } from './llm/speech';
import { getUserLlmApiKey } from '../src/db/user-llm-config-schema';

export interface VoiceIntentResult {
  rawSpeechText: string;
  intent: StructuredIntent;
  message: string;
}

const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, getUploadsDir()),
    filename: (_req: any, file: any, cb: any) => {
      const ext = (file.originalname?.split('.').pop() || 'webm').replace(/[^a-z0-9]/gi, '');
      cb(null, `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'webm'}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ok =
      file.mimetype.startsWith('audio/')
      || file.mimetype === 'video/webm'
      || file.mimetype === 'application/octet-stream';
    if (ok) cb(null, true);
    else cb(new Error('仅接受音频量子流（webm / wav / mp4）'));
  },
});

export const voiceIntentMulter = voiceUpload.single('audio');

function resolveUserId(header: string | string[] | undefined, bodyUserId?: string): string {
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return (fromHeader || bodyUserId || 'me').trim() || 'me';
}

export function resolveCaptureUserId(
  headers: Record<string, string | string[] | undefined>,
  bodyUserId?: string,
): string {
  return resolveUserId(
    headers['x-wuxian-userid'] ?? headers['x-wuxian-user-id'],
    bodyUserId,
  );
}

export async function processVoiceIntent(userId: string, filePath: string): Promise<VoiceIntentResult> {
  try {
    const speech = await transcribeAudioFile(filePath);
    if (!speech) {
      throw new ValidationError(
        '语音转写不可用：请配置 OPENAI_API_KEY（Whisper），或改用文字输入投喂意图。',
      );
    }

    const deepseekKey = getUserLlmApiKey(userId, 'deepseek') || undefined;
    const intent = await parseIntent(speech, deepseekKey);
    return {
      rawSpeechText: speech,
      intent,
      message: '语音已折叠为结构化意图，织者正在重算航线。',
    };
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      /* 临时文件已清理或不存在 */
    }
  }
}
