/**
 * WUXIAN · 语音转写（OpenAI Whisper，失败时返回 null）
 */

import { createReadStream } from 'fs';
import OpenAI from 'openai';

function openaiSttClient(apiKeyOverride?: string): OpenAI | null {
  const key = apiKeyOverride?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
  return new OpenAI({ apiKey: key, baseURL });
}

export async function transcribeAudioFile(
  filePath: string,
  options?: { apiKeyOverride?: string; language?: string },
): Promise<string | null> {
  const client = openaiSttClient(options?.apiKeyOverride);
  if (!client) return null;

  const model = process.env.WUXIAN_WHISPER_MODEL?.trim() || 'whisper-1';
  try {
    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(filePath) as unknown as File,
      model,
      language: options?.language ?? 'zh',
    });
    const text = transcription.text?.trim();
    return text || null;
  } catch (err) {
    console.warn('[WUXIAN STT] Whisper failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
