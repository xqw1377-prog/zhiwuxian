import { motion } from 'framer-motion';
import type { ProactiveBriefDto } from '../../lib/zhi-proactive-api';

export function ZhiCommProtocolCard({ brief }: { brief: ProactiveBriefDto }) {
  return (
    <motion.div
      className="max-w-[92%] rounded-xl border border-gray-800 bg-[#0A0B0E] p-3 text-left text-[10px] text-gray-400"
      role="region"
      aria-label="沟通形式目录"
    >
      <p className="mb-1 text-[11px] font-bold text-[#00FF7F]">
        沟通形式目录
        {brief.protocolEstablished ? ` · 第 ${brief.sessionCount} 次主动议程` : ' · 立约中'}
        {' · '}
        {brief.activeModeLabel}
      </p>
      {!brief.protocolEstablished && (
        <p className="mb-2 text-[9px] text-gray-500">
          第一次沟通：我先立约，此后按你的学习进度与梦校目标主动开口，不是你问我答。
        </p>
      )}

      <ul className="mb-3 space-y-1.5">
        {brief.protocolDirectory.map((m) => (
          <li
            key={m.id}
            className={
              m.id === brief.activeMode
                ? 'rounded border border-[#00FF7F]/30 bg-[#00FF7F]/5 px-2 py-1.5 text-gray-200'
                : 'px-2 py-0.5'
            }
          >
            <span className="text-[#00FF7F]">{m.label}</span>
            <span className="text-gray-600"> — {m.trigger}</span>
            {m.id === brief.activeMode && (
              <p className="mt-1 text-[9px] text-gray-400">ZHI：{m.zhiRole}</p>
            )}
          </li>
        ))}
      </ul>

      {brief.sections.length > 0 && (
        <div className="space-y-2 border-t border-gray-900 pt-2">
          <p className="text-[9px] uppercase tracking-widest text-gray-600">本次议程</p>
          {brief.sections.map((s) => (
            <motion.div key={s.title}>
              <p className="text-[10px] font-medium text-gray-300">【{s.title}】</p>
              <p className="mt-0.5 whitespace-pre-wrap text-[9px] leading-relaxed text-gray-500">
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
