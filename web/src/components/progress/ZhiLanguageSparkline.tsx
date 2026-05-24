import type { LanguageCurvePoint } from '../../lib/zhi-language-api';

const W = 200;
const H = 48;
const PAD = 4;

export function ZhiLanguageSparkline({
  points,
  compact = false,
}: {
  points: LanguageCurvePoint[];
  compact?: boolean;
}) {
  const scores = points.map((p) => p.score).filter((s): s is number => s != null);
  if (scores.length === 0) {
    return (
      <p className={`text-gray-600 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
        近 7 日暂无口语练习记录，完成一次陪练后显示曲线。
      </p>
    );
  }

  const min = Math.max(0, Math.min(...scores) - 2);
  const max = Math.min(30, Math.max(...scores) + 2);
  const span = max - min || 1;

  const xs = points.map((_, i) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2));
  const ys = points.map((p) => {
    const v = p.score ?? min;
    return H - PAD - ((v - min) / span) * (H - PAD * 2);
  });

  let started = false;
  const segments: string[] = [];
  points.forEach((p, i) => {
    if (p.score == null) {
      started = false;
      return;
    }
    const cmd = started ? 'L' : 'M';
    segments.push(`${cmd}${xs[i]!.toFixed(1)},${ys[i]!.toFixed(1)}`);
    started = true;
  });
  const line = segments.join(' ');

  const last = scores[scores.length - 1]!;
  const first = scores[0]!;
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-[#00FF7F]" aria-hidden>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#1f2937" strokeWidth="0.5" />
        {line && <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
        {points.map((p, i) =>
          p.score != null ? (
            <circle key={p.date} cx={xs[i]} cy={ys[i]} r={compact ? 2 : 2.5} fill="#00FF7F" />
          ) : null,
        )}
      </svg>
      <p className={`flex justify-between text-gray-500 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
        <span>
          {points[0]?.date.slice(5)} → {points[points.length - 1]?.date.slice(5)}
        </span>
        <span className={delta >= 0 ? 'text-[#00FF7F]' : 'text-amber-400'}>
          7 日 {delta >= 0 ? '+' : ''}
          {delta} · 最新 {last}/30
        </span>
      </p>
    </div>
  );
}
