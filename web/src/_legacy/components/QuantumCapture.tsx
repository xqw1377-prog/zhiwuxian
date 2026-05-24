import { useCallback, useRef, useState } from 'react';
import {multipartAuthHeaders, authFetch } from '../lib/api-auth';

export interface CaptureIntentPayload {
  rawSpeechText: string;
  source: 'voice' | 'vision';
  intent?: {
    actionType: string;
    weaverResponse?: string;
    payload?: { targetUrl?: string; fatigueLevel?: number };
  };
}

interface QuantumCaptureProps {
  userId: string;
  disabled?: boolean;
  variant?: 'fixed' | 'inline';
  showVision?: boolean;
  onCaptured: (payload: CaptureIntentPayload) => void;
  onError?: (message: string) => void;
  /** 从相册选图上传（对话壳 + 号菜单也会走此能力） */
  onUploadImage?: (file: File) => void;
}

function pickAudioMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
  for (const t of candidates) {
    if (!t || MediaRecorder.isTypeSupported(t)) return t || 'audio/webm';
  }
  return 'audio/webm';
}

export function QuantumCapture({
  userId,
  disabled,
  variant = 'fixed',
  showVision = true,
  onCaptured,
  onError,
  onUploadImage,
}: QuantumCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isVisionBusy, setIsVisionBusy] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const uploadVoice = useCallback(async (blob: Blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'intent_voice.webm');

    const res = await authFetch('/api/v1/quantum/voice-intent', {
      method: 'POST',
      headers: { ...multipartAuthHeaders(), 'X-Wuxian-Userid': userId },
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message ?? json.error ?? '语音神经网络解析失败');
    }
    const d = json.data as {
      rawSpeechText?: string;
      intent?: CaptureIntentPayload['intent'];
    };
    if (!d?.rawSpeechText?.trim()) {
      throw new Error('未捕捉到有效语音');
    }
    onCaptured({
      rawSpeechText: d.rawSpeechText,
      intent: d.intent,
      source: 'voice',
    });
  }, [onCaptured, userId]);

  const startCapture = useCallback(async () => {
    if (disabled || isRecording) return;
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickAudioMimeType();
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        releaseStream();
        setIsRecording(false);
        const type = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type });
        if (audioBlob.size < 64) {
          onError?.('录音太短，请按住多说几句');
          return;
        }
        try {
          await uploadVoice(audioBlob);
        } catch (e) {
          onError?.(e instanceof Error ? e.message : '语音上传失败');
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
    } catch {
      releaseStream();
      onError?.('无法访问麦克风，请检查浏览器权限');
    }
  }, [disabled, isRecording, onError, releaseStream, uploadVoice]);

  const stopCapture = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      releaseStream();
      setIsRecording(false);
    }
  }, [releaseStream]);

  const captureScreenFrame = useCallback(async () => {
    if (disabled || isVisionBusy) return;
    setIsVisionBusy(true);
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('当前浏览器不支持屏幕捕捉');
      }
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) resolve();
        else video.onloadeddata = () => resolve();
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建画布');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
      });
      if (!blob) throw new Error('截图编码失败');

      const formData = new FormData();
      formData.append('frame', blob, 'quantum_frame.jpg');

      const res = await authFetch('/api/v1/quantum/vision-intent', {
        method: 'POST',
        headers: { ...multipartAuthHeaders(), 'X-Wuxian-Userid': userId },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? '视觉解析失败');
      }
      const d = json.data as {
        rawSpeechText?: string;
        intent?: CaptureIntentPayload['intent'];
      };
      if (!d?.rawSpeechText?.trim()) {
        throw new Error('未从画面中解析出学习意图');
      }
      onCaptured({
        rawSpeechText: d.rawSpeechText,
        intent: d.intent,
        source: 'vision',
      });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '屏幕捕捉失败');
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setIsVisionBusy(false);
    }
  }, [disabled, isVisionBusy, onCaptured, onError, userId]);

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (disabled || isVisionBusy) return;
      if (onUploadImage) {
        onUploadImage(file);
        return;
      }
      setIsVisionBusy(true);
      try {
        const formData = new FormData();
        formData.append('frame', file, file.name || 'upload.jpg');
        const res = await authFetch('/api/v1/quantum/vision-intent', {
          method: 'POST',
          headers: { ...multipartAuthHeaders(), 'X-Wuxian-Userid': userId },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? json.error ?? '视觉解析失败');
        const d = json.data as {
          rawSpeechText?: string;
          intent?: CaptureIntentPayload['intent'];
        };
        if (!d?.rawSpeechText?.trim()) throw new Error('未从图片中解析出学习内容');
        onCaptured({
          rawSpeechText: d.rawSpeechText,
          intent: d.intent,
          source: 'vision',
        });
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '图片上传失败');
      } finally {
        setIsVisionBusy(false);
      }
    },
    [disabled, isVisionBusy, onCaptured, onError, onUploadImage, userId],
  );

  return variant === 'inline' ? (
    <InlineDock
      isRecording={isRecording}
      isVisionBusy={isVisionBusy}
      disabled={disabled}
      showVision={showVision}
      onStart={startCapture}
      onStop={stopCapture}
      onScreenCapture={captureScreenFrame}
      onPickImage={uploadImageFile}
    />
  ) : (
    <FixedDock
      isRecording={isRecording}
      isVisionBusy={isVisionBusy}
      disabled={disabled}
      showVision={showVision}
      onStart={startCapture}
      onStop={stopCapture}
      onScreenCapture={captureScreenFrame}
    />
  );
}

function FixedDock(props: {
  isRecording: boolean;
  isVisionBusy: boolean;
  disabled?: boolean;
  showVision: boolean;
  onStart: () => void;
  onStop: () => void;
  onScreenCapture: () => void;
}) {
  const { isRecording, isVisionBusy, disabled, showVision, onStart, onStop, onScreenCapture } = props;

  return (
    <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-3">
      {showVision && (
        <button
          type="button"
          disabled={disabled || isVisionBusy}
          onClick={onScreenCapture}
          className="w-12 h-12 rounded-full flex items-center justify-center text-[10px] tracking-wider border border-zinc-800 bg-[#161820] text-zinc-400 hover:border-[#00FF7F] hover:text-[#00FF7F] disabled:opacity-40 transition-all shadow-lg"
          title="捕捉屏幕 / 题目画面"
        >
          {isVisionBusy ? '…' : '截屏'}
        </button>
      )}

      <button
        type="button"
        disabled={disabled}
        onMouseDown={onStart}
        onMouseUp={onStop}
        onMouseLeave={isRecording ? onStop : undefined}
        onTouchStart={(e) => {
          e.preventDefault();
          onStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onStop();
        }}
        className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xs tracking-wider transition-all duration-300 shadow-lg ${
          isRecording
            ? 'bg-[#FF4500] text-white scale-110 shadow-[0_0_20px_rgba(255,69,0,0.4)]'
            : 'bg-[#161820] text-[#00FF7F] border border-gray-800 hover:border-[#00FF7F]'
        } disabled:opacity-40`}
      >
        {isRecording ? '聆听中' : '按住说'}
      </button>
    </div>
  );
}

function InlineDock(props: {
  isRecording: boolean;
  isVisionBusy: boolean;
  disabled?: boolean;
  showVision: boolean;
  onStart: () => void;
  onStop: () => void;
  onScreenCapture: () => void;
  onPickImage?: (file: File) => void;
}) {
  const { isRecording, isVisionBusy, disabled, showVision, onStart, onStop, onScreenCapture, onPickImage } =
    props;
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {showVision && onPickImage && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickImage(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={disabled || isVisionBusy}
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-zinc-800 bg-[#161820] px-4 py-2 text-[10px] text-zinc-300 hover:border-[#00FF7F] hover:text-[#00FF7F] disabled:opacity-40"
          >
            {isVisionBusy ? '解析中…' : '上传题目照片'}
          </button>
        </>
      )}
      {showVision && (
        <button
          type="button"
          disabled={disabled || isVisionBusy}
          onClick={onScreenCapture}
          className="w-12 h-12 rounded-full flex items-center justify-center text-[10px] tracking-wider border border-zinc-800 bg-[#161820] text-zinc-400 hover:border-[#00FF7F] hover:text-[#00FF7F] disabled:opacity-40 transition-all shadow-lg"
          title="捕捉屏幕 / 题目画面"
        >
          {isVisionBusy ? '…' : '截屏'}
        </button>
      )}

      <button
        type="button"
        disabled={disabled}
        onMouseDown={onStart}
        onMouseUp={onStop}
        onMouseLeave={isRecording ? onStop : undefined}
        onTouchStart={(e) => {
          e.preventDefault();
          onStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onStop();
        }}
        className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-[11px] transition-all duration-300 ${
          isRecording
            ? 'bg-[#FF4500] text-white scale-110 shadow-[0_0_25px_rgba(255,69,0,0.5)]'
            : 'bg-[#161820] text-[#00FF7F] border border-gray-800 hover:border-[#00FF7F] shadow-md'
        } disabled:opacity-40`}
      >
        {isRecording ? '聆听中' : '按住说'}
      </button>
    </div>
  );
}
