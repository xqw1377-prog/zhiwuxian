import { authFetch, multipartAuthHeaders } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type VisionUploadResult = {
  rawSpeechText: string;
  weaverResponse?: string;
  intentAction?: string;
};

export type VoiceUploadResult = {
  rawSpeechText: string;
  weaverResponse?: string;
};

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('??????'));
    reader.readAsDataURL(file);
  });
}

/** POST /api/v1/quantum/vision-intent ? ?? / ?? */
export async function uploadVisionImage(
  userId: string,
  file: File | Blob,
  filename = 'chat_frame.jpg',
): Promise<VisionUploadResult> {
  const formData = new FormData();
  formData.append('frame', file, filename);

  const res = await authFetch('/api/v1/quantum/vision-intent', {
    method: 'POST',
    headers: { ...multipartAuthHeaders(), 'X-Wuxian-Userid': userId },
    body: formData,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '??????');
  }
  const d = unwrapEnvelope<{
    rawSpeechText?: string;
    intent?: { weaverResponse?: string; actionType?: string };
  }>(json);
  const text = d.rawSpeechText?.trim();
  if (!text) throw new Error('????????????');
  return {
    rawSpeechText: text,
    weaverResponse: d.intent?.weaverResponse,
    intentAction: d.intent?.actionType,
  };
}

/** POST /api/v1/quantum/voice-intent */
export async function uploadVoiceAudio(
  userId: string,
  file: File | Blob,
  filename = 'chat_voice.webm',
): Promise<VoiceUploadResult> {
  const formData = new FormData();
  formData.append('audio', file, filename);

  const res = await authFetch('/api/v1/quantum/voice-intent', {
    method: 'POST',
    headers: { ...multipartAuthHeaders(), 'X-Wuxian-Userid': userId },
    body: formData,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '??????');
  }
  const d = unwrapEnvelope<{
    rawSpeechText?: string;
    intent?: { weaverResponse?: string };
  }>(json);
  const text = d.rawSpeechText?.trim();
  if (!text) throw new Error('????????');
  return {
    rawSpeechText: text,
    weaverResponse: d.intent?.weaverResponse,
  };
}

/** POST /api/v1/topology/vision-intercept ? ?????????????? */
export async function uploadTopologyVision(
  userId: string,
  screenshotData: string,
  intentText: string,
): Promise<{ weaverWhisper: string; detectedConcept: string }> {
  const res = await authFetch('/api/v1/topology/vision-intercept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Wuxian-Userid': userId },
    body: JSON.stringify({ userId, intentText, screenshotData }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '????????');
  }
  const d = unwrapEnvelope<{ weaverWhisper?: string; detectedConcept?: string }>(json);
  return {
    weaverWhisper: d.weaverWhisper?.trim() || '?????',
    detectedConcept: d.detectedConcept?.trim() || '?????',
  };
}

export type AttachmentUploadSummary = {
  lines: string[];
  suggestedTool?: 'vision-intercept' | 'language-coach' | 'video-learn';
};

export async function processChatAttachments(
  userId: string,
  files: File[],
  userText: string,
  mode: 'fast' | 'deep',
): Promise<AttachmentUploadSummary> {
  const lines: string[] = [];
  let suggestedTool: AttachmentUploadSummary['suggestedTool'];

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      if (mode === 'deep') {
        try {
          const dataUrl = await fileToDataUrl(file);
          const topo = await uploadTopologyVision(userId, dataUrl, userText || file.name);
          lines.push(`???�???${topo.detectedConcept}?${topo.weaverWhisper}`);
        } catch {
          const v = await uploadVisionImage(userId, file);
          lines.push(`????${v.rawSpeechText}${v.weaverResponse ? `\n${v.weaverResponse}` : ''}`);
        }
      } else {
        const v = await uploadVisionImage(userId, file);
        lines.push(`????${v.rawSpeechText}${v.weaverResponse ? `\n${v.weaverResponse}` : ''}`);
      }
      suggestedTool = 'vision-intercept';
      continue;
    }

    if (file.type.startsWith('audio/')) {
      const v = await uploadVoiceAudio(userId, file);
      lines.push(`????${v.rawSpeechText}${v.weaverResponse ? `\n${v.weaverResponse}` : ''}`);
      suggestedTool = 'language-coach';
      continue;
    }

    if (file.type.startsWith('video/')) {
      lines.push(`????????${file.name}??????????????????`);
      suggestedTool = 'video-learn';
      continue;
    }

    if (
      file.type.startsWith('text/') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.json')
    ) {
      const text = await file.text();
      lines.push(`???�${file.name}?\n${text.slice(0, 4000)}${text.length > 4000 ? '\n?' : ''}`);
      continue;
    }

    lines.push(`????????${file.name}??${Math.round(file.size / 1024)}KB??????????????`);
  }

  return { lines, suggestedTool };
}
