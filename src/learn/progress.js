/**
 * Progression: what is locked, what is next, and how far along the student is.
 * All functions are pure and take the derived state plus the indexed content.
 *
 * Rules (Part 4, section 4.3):
 *   Level 0 is always open. Level 1 opens when Level 0 is complete. Level N+1 opens when Level N's
 *   final assessment is passed. Lessons inside a level unlock in order (the mentor may allow free order).
 *   A lesson marked "preview" is open regardless, and labelled as a preview.
 */

import { isDue, DAY } from './scheduler.js';
import { masteryOf } from './mastery.js';

export function lessonDone(state, lessonId) {
  return state.lessons[lessonId]?.state === 'completed';
}

export function levelComplete(level, state) {
  if (level.number === 0) {
    return level.lessonIds.every((id) => lessonDone(state, id)) && !!state.ack.honesty;
  }
  return !!state.levelsPassed[level.number];
}

export function levelUnlocked(level, state, content) {
  if (level.number === 0) return true;
  const prev = content.levelByNumber.get(level.number - 1);
  if (!prev) return false;
  if (state.settings.testOut) return true;
  return levelComplete(prev, state);
}

/** 'completed' | 'in-progress' | 'available' | 'locked' */
export function lessonStatus(lesson, state, content) {
  if (lessonDone(state, lesson.id)) return 'completed';
  const level = content.levelByNumber.get(lesson.level);
  if (!lesson.preview) {
    if (!level || !levelUnlocked(level, state, content)) return 'locked';
    if (!state.settings.freeOrder) {
      const idx = level.lessonIds.indexOf(lesson.id);
      for (let i = 0; i < idx; i++) {
        if (!lessonDone(state, level.lessonIds[i])) return 'locked';
      }
    }
  }
  return state.lessons[lesson.id] ? 'in-progress' : 'available';
}

export function levelStatus(level, state, content) {
  if (!levelUnlocked(level, state, content)) return 'locked';
  if (level.planned) return 'planned';
  if (state.levelsPassed[level.number] || (level.number === 0 && levelComplete(level, state))) return 'passed';
  const done = level.lessonIds.filter((id) => lessonDone(state, id)).length;
  return done > 0 ? 'in-progress' : 'available';
}

/** The next lesson the student should do, or null. */
export function nextLesson(state, content) {
  for (const level of content.levels) {
    if (level.planned) continue;
    if (!levelUnlocked(level, state, content)) break;
    for (const id of level.lessonIds) {
      if (!lessonDone(state, id)) {
        const lesson = content.lessons.get(id);
        if (lesson && lessonStatus(lesson, state, content) !== 'locked') return lesson;
      }
    }
    if (level.number !== 0 && !state.levelsPassed[level.number]) return null; // exam is next, not a lesson
  }
  return null;
}

/** The level exam is available once every lesson in the level is done and no targeted review is pending. */
export function examStatus(level, state, content) {
  const bpId = level.finalBlueprint;
  if (!bpId) return { available: false, reason: 'No exam for this level.' };
  const allDone = level.lessonIds.every((id) => lessonDone(state, id));
  if (!allDone && !state.settings.testOut) return { available: false, reason: 'Finish every lesson in this level first.' };
  const exam = state.exams[bpId];
  if (exam && exam.reviewPending && exam.reviewPending.length) {
    return { available: false, reason: 'Complete your targeted review first.', reviewPending: exam.reviewPending };
  }
  if (exam && exam.passed) return { available: false, reason: 'Passed.', passed: true };
  const last = exam && exam.attempts[exam.attempts.length - 1];
  if (last && last.status === 'awaiting-mentor') return { available: false, reason: 'Waiting for your mentor to review the written answer.', awaiting: true };
  return { available: true };
}

/** Concepts that are due for review right now. */
export function dueConcepts(state, nowMs) {
  return Object.values(state.concepts).filter((c) => isDue(c, nowMs));
}

/** Review debt: how many concepts are overdue. A soft gate on starting new lessons. */
export function reviewDebt(state, nowMs) {
  return dueConcepts(state, nowMs).length;
}

export function debtGateActive(state, nowMs) {
  return state.settings.reviewDebtGate && reviewDebt(state, nowMs) > state.settings.reviewDebtThreshold;
}

/**
 * Progress for one level, weighted so that reading alone cannot fill the bar:
 *   coverage 40, accuracy 30, retention 20, assessment 10
 * (When a level has no exam, the assessment weight moves to coverage.)
 */
export function levelProgress(level, state, content, nowMs = Date.now()) {
  if (level.planned || !level.lessonIds.length) return 0;
  const coverage = level.lessonIds.filter((id) => lessonDone(state, id)).length / level.lessonIds.length;
  const concepts = level.conceptIds || [];
  const states = concepts.map((c) => state.concepts[c]).filter(Boolean);
  const accuracy = states.length ? states.reduce((a, cs) => a + masteryOf(cs) / 100, 0) / concepts.length : 0;
  const retention = states.length ? states.reduce((a, cs) => a + Math.min(1, cs.intervalDays / 30), 0) / concepts.length : 0;
  const exam = level.finalBlueprint ? state.exams[level.finalBlueprint] : null;
  const best = exam && exam.attempts.length ? Math.max(...exam.attempts.map((a) => a.overall)) : 0;
  const passed = exam && exam.passed;
  if (!level.finalBlueprint) return 0.5 * coverage + 0.3 * accuracy + 0.2 * retention;
  return 0.4 * coverage + 0.3 * accuracy + 0.2 * retention + 0.1 * (passed ? 1 : best * 0.9);
}

/** Levels passed out of the levels that exist. */
export function programProgress(state, content) {
  const real = content.levels.filter((l) => l.number >= 1);
  return { passed: real.filter((l) => state.levelsPassed[l.number]).length, total: real.length };
}

export const RANKS = [
  { id: 'beginner', name: 'Beginner', requires: 'Start' },
  { id: 'market-student', name: 'Market Student', requires: 'Levels 1 to 5 and Retention Check 1' },
  { id: 'chart-student', name: 'Chart Student', requires: 'Level 6' },
  { id: 'structure-student', name: 'Structure Student', requires: 'Levels 7 and 8 and Retention Check 2' },
  { id: 'risk-student', name: 'Risk Student', requires: 'Levels 9 to 11 and Retention Check 3' },
  { id: 'strategy-student', name: 'Strategy Student', requires: 'Level 12' },
  { id: 'backtesting-student', name: 'Backtesting Student', requires: 'Level 13 and Retention Check 4' },
  { id: 'apprentice', name: 'Apprentice', requires: 'Track P and the Capstone' }
];

export const rankName = (id) => (RANKS.find((r) => r.id === id) || RANKS[0]).name;
