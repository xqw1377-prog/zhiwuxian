/**
 * ZHI · 学业现状拍照建档引导（试卷 / 教材进度 / 当前挑战）
 */

import { getBaselineStatus } from '../db/baseline-schema';

/** 对话气泡 / zhiTip 用短版 */
export const ZHI_BASELINE_PHOTO_INVITE_SHORT =
  '想让我更快对准你的差距？用下方 + 或「学业建档」发我：① 最近各科试卷（含分数/错题）② 在学科目教材（目录或进度页，标出学到哪）③ 你现在最大的挑战。';

/** 梦校情报包末尾完整引导 */
export const ZHI_BASELINE_PHOTO_INVITE_BLOCK = [
  '【帮我更快对准你】',
  '可以用沟通 + 拍照的方式建档：',
  '  · 最近各科考上的试卷（拍分数区与错题处）',
  '  · 正在学的科目教材（拍目录或进度页，用笔标出学到哪里）',
  '  · 用一两句话写下：目前最大的挑战 / 最怕的卡点',
  '发在对话里（+ 或拍题拦截）即可，我读完后会把差距预判改成你的真实现状。',
].join('\n');

export function hasUserBaselinePhotos(userId: string): boolean {
  const row = getBaselineStatus(userId.trim());
  if (!row?.current_scores_json) return false;
  try {
    const scores = JSON.parse(row.current_scores_json) as Record<string, unknown>;
    return Object.keys(scores).length > 0;
  } catch {
    return false;
  }
}

export function normalizeGapDetailLine(item: unknown): string {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const effect = o.causalityEffect ?? o.effect ?? o.gap ?? o.message ?? o.text;
    if (typeof effect === 'string' && effect.trim()) return effect.trim();
    const weak = o.weakness ?? o.weak;
    if (typeof weak === 'string' && weak.trim()) return weak.trim();
  }
  return String(item).trim();
}

export function normalizeGapDetails(items: unknown[] | undefined | null): string[] {
  if (!items?.length) return [];
  return items.map(normalizeGapDetailLine).filter(Boolean);
}
