/**
 * WUXIAN · 间隔重复引擎（SM-2 算法改良版）
 * 根据用户表现自动安排复习时间，对抗遗忘曲线
 */

export interface ReviewItem {
  id: string;
  userId: string;
  subject: string;
  content: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
}

export interface ReviewResult {
  itemId: string;
  quality: number;
  newEaseFactor: number;
  newInterval: number;
  newRepetitions: number;
  nextReviewAt: string;
}

function calculateNextReview(
  quality: number,
  easeFactor: number,
  interval: number,
  repetitions: number,
): { easeFactor: number; interval: number; repetitions: number } {
  quality = Math.max(0, Math.min(5, quality));

  let newEaseFactor = easeFactor;
  let newInterval = interval;
  let newRepetitions = repetitions;

  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    const ef = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEaseFactor = Math.max(1.3, ef);

    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEaseFactor);
    }

    newRepetitions = repetitions + 1;
  }

  return { easeFactor: newEaseFactor, interval: newInterval, repetitions: newRepetitions };
}

export function processReview(
  item: ReviewItem,
  quality: number,
): ReviewResult {
  const { easeFactor, interval, repetitions } = calculateNextReview(
    quality,
    item.easeFactor,
    item.interval,
    item.repetitions,
  );

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);

  return {
    itemId: item.id,
    quality,
    newEaseFactor: easeFactor,
    newInterval: interval,
    newRepetitions: repetitions,
    nextReviewAt: nextDate.toISOString().split('T')[0],
  };
}

export function getDueItems(items: ReviewItem[]): ReviewItem[] {
  const today = new Date().toISOString().split('T')[0];
  return items
    .filter((item) => item.nextReviewAt <= today)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
}

export function getItemStats(items: ReviewItem[]): {
  total: number;
  due: number;
  mastered: number;
  averageEaseFactor: number;
} {
  const due = getDueItems(items);
  const mastered = items.filter((i) => i.repetitions >= 5 && i.easeFactor >= 2.5);
  const avgEf = items.length > 0
    ? items.reduce((s, i) => s + i.easeFactor, 0) / items.length
    : 2.5;

  return {
    total: items.length,
    due: due.length,
    mastered: mastered.length,
    averageEaseFactor: Math.round(avgEf * 100) / 100,
  };
}

export function estimateMasteryDate(
  items: ReviewItem[],
  dailyCapacity: number,
): Date | null {
  const unmastered = items.filter((i) => i.repetitions < 5);
  if (unmastered.length === 0) return null;

  const duePerDay = getDueItems(items).length;
  const daysToClear = Math.ceil(duePerDay / Math.max(1, dailyCapacity));
  const totalDays = Math.ceil(unmastered.length / Math.max(1, dailyCapacity)) + daysToClear;

  const estimated = new Date();
  estimated.setDate(estimated.getDate() + totalDays);
  return estimated;
}
