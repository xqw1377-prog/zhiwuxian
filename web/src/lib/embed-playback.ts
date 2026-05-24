/** 从 embed URL 提取 YouTube videoId */
export function youtubeVideoIdFromEmbed(embedUrl: string): string | null {
  const m = embedUrl.match(/embed\/([\w-]{6,})/i);
  return m?.[1] ?? null;
}

export function loadYouTubeIframeApi(): Promise<typeof window.YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('YouTube API 加载超时')), 12000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube API 不可用'));
    };
    if (!document.querySelector('script[data-wuxian-yt-api]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.dataset.wuxianYtApi = '1';
      document.head.appendChild(s);
    }
  });
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: { onReady?: (e: { target: YtPlayer }) => void; onStateChange?: (e: { data: number }) => void };
        },
      ) => YtPlayer;
      PlayerState?: { PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YtPlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};
