import { useLearningProgress } from '../../context/LearningProgressContext';
import { ZhiDreamMomentumCurves } from '../progress/ZhiDreamMomentumCurves';
import { ZhiLearningPathTimeline } from './ZhiLearningPathTimeline';
import { emitPickImage } from '../../lib/wuxian-events';
import type { SchoolPathway } from '../../lib/school-pathway';

export type AnchorBriefDto = {
  chatText?: string;
  daysRemaining: number;
  challengeIndex: number;
  requiredMetrics: Record<string, unknown>;
  dynamicMilestones: Array<{
    codeName: string;
    deadline: string;
    mission: string;
    status?: string;
    mentorWhisper?: string;
  }>;
  pathway?: SchoolPathway;
  pathwayLabel?: string;
};

const METRIC_KEY_SKIP = /^(mentor|wake|coach)/i;

export function ZhiAnchorCountdown({
  brief,
  userId,
}: {
  brief: AnchorBriefDto;
  userId?: string;
}) {
  const { dashboard } = useLearningProgress();
  const momentum = dashboard?.momentum;
  const pathway = brief.pathway ?? dashboard?.pathway;
  const metrics = Object.entries(brief.requiredMetrics ?? {}).filter(
    ([k, v]) => v != null && String(v).trim() && !METRIC_KEY_SKIP.test(k),
  );

  const onPickBaseline = () => {
    emitPickImage();
  };

  return (
    <div className="max-w-[90%] rounded-xl border border-[#00FF7F]/25 bg-[#00FF7F]/5 p-3 text-left font-mono text-[10px] text-gray-300">
      <p className="mb-2 text-[11px] font-bold text-[#00FF7F]">
        梦校倒计时 · 距入学还有 {brief.daysRemaining} 天 · 阻力 {brief.challengeIndex}%
        {pathwayLabel(pathway, brief.pathwayLabel) ? (
          <span className="ml-2 font-normal text-gray-500">
            · {pathwayLabel(pathway, brief.pathwayLabel)}
          </span>
        ) : null}
      </p>

      {metrics.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">硬指标</p>
          <ul className="space-y-0.5">
            {metrics.map(([k, v]) => (
              <li key={k}>
                <span className="text-gray-500">{k}</span> <span className="text-white">{String(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">进度表</p>
      <ul className="space-y-2">
        {brief.dynamicMilestones.map((m) => (
          <li
            key={`${m.codeName}-${m.deadline}`}
            className={`rounded-lg border px-2 py-1.5 ${
              m.status === 'IN_PROGRESS'
                ? 'border-[#00FF7F]/40 bg-[#00FF7F]/10'
                : 'border-gray-900 bg-black/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#00FF7F]">{m.deadline}</span>
              <span className="text-[8px] text-gray-500">
                {m.status === 'IN_PROGRESS'
                  ? '进行中'
                  : m.status === 'COMPLETED'
                    ? '已完成'
                    : '待解锁'}
              </span>
            </div>
            <p className="mt-0.5 font-bold text-white">{m.codeName}</p>
            <p className="text-gray-400">{m.mission}</p>
          </li>
        ))}
      </ul>

      {momentum && <ZhiDreamMomentumCurves momentum={momentum} compact />}

      {userId ? (
        <div className="mt-3">
          <ZhiLearningPathTimeline userId={userId} compact />
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPickBaseline}
        className="mt-3 w-full rounded-lg border border-dashed border-[#00FF7F]/30 py-1.5 text-[9px] text-[#00FF7F]/80 hover:bg-[#00FF7F]/10"
      >
        + 投喂试卷/教材（学业建档）
      </button>
    </div>
  );
}

function pathwayLabel(pathway?: SchoolPathway, label?: string): string | null {
  if (label?.trim()) return label.trim();
  if (pathway === 'domestic_cn') return '国内高考/强基/竞赛路径';
  if (pathway === 'us_intl') return '美本/国际标化路径';
  if (pathway === 'generic') return '综合升学路径';
  return null;
}
