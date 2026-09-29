/**
 * Mastery: a 0-100 score per concept, and the weak-area rules.
 *
 *   mastery = 100 x ( 0.50 Accuracy + 0.25 Retention + 0.15 Transfer + 0.10 Exam )
 *     Accuracy  recency-weighted correctness over the last 10 attempts (weight 0.85^k);
 *               a hinted attempt counts half, a revealed one counts nothing
 *     Retention min(1, interval in days / 30)
 *     Transfer  the same accuracy, but only for attempts OUTSIDE the concept's home lesson
 *     Exam      accuracy on that concept in level and retention exams
 *               (until there is exam evidence its weight moves to Accuracy: 0.60 / 0.25 / 0.15)
 */

const WINDOW = 10;

const effective = (h) => (h.r ? 0 : h.h ? h.s * 0.5 : h.s);

function weighted(list) {
  // list is oldest -> newest; weight 0.85^k where k = 0 is the newest
  let num = 0;
  let den = 0;
  const rev = [...list].reverse();
  rev.forEach((h, k) => {
    const w = 0.85 ** k;
    num += w * effective(h);
    den += w;
  });
  return den ? num / den : 0;
}

export function masteryOf(cs, examAcc = null) {
  if (!cs || !cs.hist.length) return 0;
  const recent = cs.hist.slice(-WINDOW);
  const A = weighted(recent);
  const R = Math.min(1, cs.intervalDays / 30);
  const transfer = recent.filter((h) => !h.home);
  const T = transfer.length ? weighted(transfer) : 0;
  const m = examAcc === null ? 0.6 * A + 0.25 * R + 0.15 * T : 0.5 * A + 0.25 * R + 0.15 * T + 0.1 * examAcc;
  return Math.round(100 * m);
}

export function statusOf(cs, mastery) {
  if (!cs || !cs.hist.length) return 'new';
  if (mastery >= 80 && cs.intervalDays >= 21) return 'retained';
  if (mastery >= 80) return 'proficient';
  if (mastery >= 65) return 'solid';
  if (mastery >= 40) return 'familiar';
  return 'learning';
}

export const STATUS_LABEL = {
  new: 'New',
  learning: 'Learning',
  familiar: 'Familiar',
  solid: 'Solid',
  proficient: 'Proficient',
  retained: 'Retained'
};

/**
 * Weak when any of:
 *   mastery below 60 with at least 3 attempts AND at least one miss in the last 6
 *     (retention takes days to build, so a perfect record on day one scores below 60 without being weak)
 *   two or more lapses in the last 30 days
 *   the same error tag at least 3 times in the last 8 attempts
 */
export const recentMisses = (cs, n = 6) => cs.hist.slice(-n).filter((h) => h.s < 1).length;

export function weakReasons(cs, mastery, nowMs) {
  const reasons = [];
  if (!cs || !cs.hist.length) return reasons;
  if (cs.hist.length >= 3 && mastery < 60 && recentMisses(cs) > 0) reasons.push({ kind: 'low-mastery', mastery });
  const lapses30 = cs.lapseTimes.filter((t) => nowMs - t <= 30 * 86400000).length;
  if (lapses30 >= 2) reasons.push({ kind: 'lapses', count: lapses30 });
  const tags = {};
  for (const h of cs.hist.slice(-8)) for (const e of h.e || []) tags[e] = (tags[e] || 0) + 1;
  for (const [tag, count] of Object.entries(tags)) if (count >= 3) reasons.push({ kind: 'error-tag', tag, count });
  return reasons;
}

/** Push an attempt onto a concept's history, keeping the last 12. */
export function withAttempt(cs, attempt) {
  return { ...cs, hist: [...cs.hist, attempt].slice(-12) };
}
