import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useZhiChat, type ReplyMode } from '../../context/ZhiChatContext';
import { fetchLlmHealth, llmStatusLabel, type LlmHealth } from '../../lib/llm-status';
import { ZHI_TOOLS } from '../../tools/zhi-tools';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../../lib/wuxian-events';
import {
  captureImageFromCamera,
  pickImageFromGallery,
  supportsNativeCamera,
} from '../../lib/native-camera';

function pickAudioMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
  for (const t of candidates) {
    if (!t || MediaRecorder.isTypeSupported(t)) return t || 'audio/webm';
  }
  return 'audio/webm';
}

export function ZhiComposer() {
  const {
    attachments,
    activeToolId,
    replyMode,
    busy,
    setReplyMode,
    openTool,
    closeTool,
    addFiles,
    removeAttachment,
    sendMessage,
    ingestVoiceBlob,
  } = useZhiChat();

  const [text, setText] = useState('');
  const [showPlus, setShowPlus] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [recording, setRecording] = useState(false);
  const [composerHint, setComposerHint] = useState<string | null>(null);
  const [llmHealth, setLlmHealth] = useState<LlmHealth | null>(null);
  const [nativeCaptureBusy, setNativeCaptureBusy] = useState(false);
  const nativeCamera = supportsNativeCamera();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.pickImage, () => imageRef.current?.click());
  }, []);

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.focusComposer, () => {
      setComposerHint('描述今日卡点、突破或需要裁决的一件事…');
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
  }, []);

  useEffect(() => {
    void fetchLlmHealth().then(setLlmHealth);
    const t = window.setInterval(() => void fetchLlmHealth().then(setLlmHealth), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const activeTool = ZHI_TOOLS.find((t) => t.id === activeToolId);

  const submit = () => {
    const v = text.trim();
    if (!v && attachments.length === 0) return;
    void sendMessage(v);
    setText('');
    setComposerHint(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const stopMic = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecording(false);
    }
  }, []);

  const ingestNativePhoto = useCallback(
    async (source: 'camera' | 'gallery') => {
      if (nativeCaptureBusy || busy) return;
      setNativeCaptureBusy(true);
      try {
        const file =
          source === 'camera' ? await captureImageFromCamera() : await pickImageFromGallery();
        if (file) {
          const dt = new DataTransfer();
          dt.items.add(file);
          addFiles(dt.files);
          setComposerHint('已选图，发送后将自动视觉解析');
        }
      } catch {
        setComposerHint('无法打开相机或相册，请检查系统权限');
      } finally {
        setNativeCaptureBusy(false);
        setShowPlus(false);
      }
    },
    [addFiles, busy, nativeCaptureBusy],
  );

  const startMic = useCallback(async () => {
    if (recording || busy) return;
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type });
        if (blob.size >= 64) void ingestVoiceBlob(blob);
      };
      rec.start(200);
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [busy, ingestVoiceBlob, recording]);

  return (
    <motion.div className="shrink-0 space-y-2 border-t border-gray-950 pt-3">
      {attachments.length > 0 && (
        <motion.div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-800 bg-black px-2 py-1 text-[10px] text-gray-300"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="h-6 w-6 rounded object-cover" />
              ) : (
                <span>{a.kind === 'video' ? '🎬' : a.kind === 'audio' ? '🎤' : '📎'}</span>
              )}
              <span className="max-w-[8rem] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="text-gray-500 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </motion.div>
      )}

      {activeTool && (
        <motion.div className="flex items-center justify-between rounded-lg border border-[#00FF7F]/30 bg-[#00FF7F]/5 px-3 py-1.5 text-[10px]">
          <span className="text-[#00FF7F]">
            {activeTool.icon} 工具：{activeTool.label}
          </span>
          <button type="button" onClick={closeTool} className="text-gray-400 hover:text-white">
            关闭
          </button>
        </motion.div>
      )}

      {composerHint && (
        <p className="px-1 text-[9px] text-[#00FF7F]/80">{composerHint}</p>
      )}

      {nativeCamera && (
        <motion.div className="flex gap-2 px-1">
          <button
            type="button"
            disabled={nativeCaptureBusy || busy}
            onClick={() => void ingestNativePhoto('camera')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#00FF7F]/40 bg-[#00FF7F]/10 py-2.5 text-[11px] font-bold text-[#00FF7F] disabled:opacity-50"
          >
            📷 拍试卷 / 错题
          </button>
          <button
            type="button"
            disabled={nativeCaptureBusy || busy}
            onClick={() => void ingestNativePhoto('gallery')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-700 bg-black py-2.5 text-[11px] text-gray-300 disabled:opacity-50"
          >
            🖼️ 相册
          </button>
        </motion.div>
      )}

      <motion.div className="rounded-2xl border border-gray-800 bg-[#0A0B0E] shadow-lg">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (composerHint) setComposerHint(null);
          }}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="跟 ZHI 说卡点、成就，或选工具开始…"
          className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-white placeholder:text-gray-600 outline-none"
        />

        <motion.div className="flex items-center justify-between gap-2 px-2 pb-2">
          <motion.div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setShowPlus((v) => !v);
                setShowTools(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-gray-300 hover:bg-gray-900"
              aria-label="添加附件"
            >
              +
            </button>

            <button
              type="button"
              onClick={() => {
                setShowTools((v) => !v);
                setShowPlus(false);
              }}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-900"
            >
              <span className="opacity-70">☰</span>
              工具
            </button>

            <select
              value={replyMode}
              onChange={(e) => setReplyMode(e.target.value as ReplyMode)}
              className="rounded-full border-0 bg-transparent py-1.5 text-[11px] text-gray-400 outline-none"
              title="快速：量子视觉；深度：拓扑拦截"
            >
              <option value="fast">快速</option>
              <option value="deep">深度</option>
            </select>

            <AnimatePresence>
              {showPlus && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full left-0 z-20 mb-1 w-44 rounded-xl border border-gray-800 bg-[#0D0E12] py-1 shadow-xl"
                >
                  {nativeCamera && (
                    <>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-[11px] text-[#00FF7F] hover:bg-gray-900"
                        onClick={() => void ingestNativePhoto('camera')}
                      >
                        📷 拍照（系统相机）
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-[11px] text-gray-300 hover:bg-gray-900"
                        onClick={() => void ingestNativePhoto('gallery')}
                      >
                        🖼️ 相册
                      </button>
                    </>
                  )}
                  {[
                    { label: '照片（立刻拦截）', ref: imageRef },
                    { label: '文件', ref: fileRef },
                    { label: '视频', ref: videoRef },
                    { label: '语音文件', ref: audioRef },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-[11px] text-gray-300 hover:bg-gray-900"
                      onClick={() => {
                        item.ref.current?.click();
                        setShowPlus(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showTools && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full left-12 z-20 mb-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-gray-800 bg-[#0D0E12] py-1 shadow-xl"
                >
                  {ZHI_TOOLS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        openTool(t.id);
                        setShowTools(false);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-900"
                    >
                      <span className="text-[11px] text-white">
                        {t.icon} {t.label}
                      </span>
                      <span className="text-[9px] text-gray-500">{t.description}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="rounded-full bg-[#00FF7F] px-4 py-1.5 text-[11px] font-bold text-black disabled:opacity-50"
            >
              发送
            </button>
            <button
              type="button"
              disabled={busy}
              onMouseDown={() => void startMic()}
              onMouseUp={stopMic}
              onMouseLeave={recording ? stopMic : undefined}
              onTouchStart={(e) => {
                e.preventDefault();
                void startMic();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopMic();
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                recording
                  ? 'bg-[#FF4500] text-white'
                  : 'text-gray-400 hover:bg-gray-900'
              }`}
              title="按住说话"
              aria-label="按住说话"
            >
              🎤
            </button>
          </motion.div>
        </motion.div>
      </motion.div>

      <p className="text-center text-[9px] text-gray-600">
        {llmHealth && (
          <span
            className={
              llmStatusLabel(llmHealth).tone === 'ok'
                ? 'text-[#00FF7F]/80'
                : llmStatusLabel(llmHealth).tone === 'error'
                  ? 'text-rose-400/90'
                  : 'text-amber-500/90'
            }
          >
            {llmStatusLabel(llmHealth).text}
            {' · '}
          </span>
        )}
        照片将自动视觉解析；深度模式启用拓扑拦截。
      </p>

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files, { autoIngestImages: false });
          e.target.value = '';
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={audioRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </motion.div>
  );
}
