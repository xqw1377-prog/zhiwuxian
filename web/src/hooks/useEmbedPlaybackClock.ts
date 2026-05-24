import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYouTubeIframeApi, youtubeVideoIdFromEmbed, type YtPlayer } from '../lib/embed-playback';

type Source =
  | { kind: 'youtube'; embedUrl: string }
  | { kind: 'bilibili'; embedUrl: string }
  | { kind: 'manual' }
  | null;

/** 外链播放进度：YouTube 用 IFrame API；B 站用手动进度条 */
export function useEmbedPlaybackClock(source: Source, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const pollRef = useRef<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [manualTime, setManualTime] = useState(0);
  const [ready, setReady] = useState(false);

  const effectiveTime =
    source?.kind === 'youtube' ? currentTime : source?.kind === 'bilibili' ? manualTime : 0;

  useEffect(() => {
    if (!enabled || source?.kind !== 'youtube' || !containerRef.current) return;

    const videoId = youtubeVideoIdFromEmbed(source.embedUrl);
    if (!videoId) return;

    let destroyed = false;

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (!YT?.Player || destroyed || !containerRef.current) return;
        playerRef.current?.destroy();
        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onReady: (e) => {
              setReady(true);
              setDuration(e.target.getDuration() || 0);
            },
          },
        });
      })
      .catch(() => setReady(false));

    pollRef.current = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        setCurrentTime(p.getCurrentTime());
        const d = p.getDuration();
        if (d > 0) setDuration(d);
      } catch {
        /* player not ready */
      }
    }, 500);

    return () => {
      destroyed = true;
      if (pollRef.current != null) window.clearInterval(pollRef.current);
      try {
        playerRef.current?.destroy();
      } catch {
        /* */
      }
      playerRef.current = null;
      setReady(false);
    };
  }, [enabled, source?.kind, source?.kind === 'youtube' ? source.embedUrl : '']);

  const seekTo = useCallback(
    (sec: number) => {
      const t = Math.max(0, sec);
      if (source?.kind === 'youtube' && playerRef.current?.seekTo) {
        playerRef.current.seekTo(t, true);
        setCurrentTime(t);
      } else if (source?.kind === 'bilibili') {
        setManualTime(t);
      }
    },
    [source],
  );

  return {
    containerRef,
    effectiveTime,
    duration: source?.kind === 'bilibili' ? Math.max(duration, manualTime, 3600) : duration,
    manualTime,
    setManualTime,
    seekTo,
    ready,
    isYouTube: source?.kind === 'youtube',
    isBilibili: source?.kind === 'bilibili',
  };
}
