/**
 * Spaced repetition on CONCEPTS, an SM-2 variant (the same constants as the HLS Law App).
 *
 * The unit is the concept, not a single question, so a student cannot pass by remembering one
 * answer. When a review is due the app generates a fresh item for the concept.
 *
 *   wrong                        AGAIN -> 1 day, ease -0.2 (min 1.3), one lapse
 *   correct after a hint         HARD
 *   correct first try            GOOD
 *   correct first try, 3rd time  EASY
 *   intervals: 1 day, 3 days, then previous x ease, capped at 120 days
 */

export const DAY = 86400000;
export const GRADE = { AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 };

export function newConceptState(concept) {
  return {
    concept,
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    lapseTimes: [],
    dueMs: null,
    firstTryStreak: 0,
    lastMs: null,
    slipping: false,
    hist: [] // last attempts: { t, s, h, r, home, ctx, e[] }
  };
}

/** Map one attempt to a review grade. */
export function gradeFromAttempt({ score, hinted = false, revealed = false, firstTryStreak = 0 }) {
  if (revealed || score < 0.5) return GRADE.AGAIN;
  if (hinted || score < 1) return GRADE.HARD;
  return firstTryStreak >= 2 ? GRADE.EASY : GRADE.GOOD;
}

export function review(state, grade, nowMs) {
  const s = { ...state, lapseTimes: [...state.lapseTimes] };
  if (grade < 3) {
    s.lapses += 1;
    s.lapseTimes = [...s.lapseTimes, nowMs].slice(-6);
    s.reps = 0;
    s.intervalDays = 1;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.firstTryStreak = 0;
  } else {
    s.reps += 1;
    if (s.reps === 1) s.intervalDays = 1;
    else if (s.reps === 2) s.intervalDays = 3;
    else s.intervalDays = Math.min(120, Math.round(s.intervalDays * s.ease));
    s.ease = Math.max(1.3, s.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    s.firstTryStreak = grade >= GRADE.GOOD ? s.firstTryStreak + 1 : 0;
  }
  s.dueMs = nowMs + s.intervalDays * DAY;
  s.lastMs = nowMs;
  return s;
}

export const isDue = (state, nowMs) => state.dueMs !== null && state.dueMs <= nowMs;

/** How overdue a concept is, in days (0 if not due). */
export const overdueDays = (state, nowMs) => (isDue(state, nowMs) ? (nowMs - state.dueMs) / DAY : 0);
