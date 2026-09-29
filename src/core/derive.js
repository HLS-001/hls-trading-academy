/**
 * Events are the truth; everything else is derived.
 *
 * Every action the student takes is appended to an immutable event log. This module turns that log
 * into the current state (lessons, concept mastery, exams, written answers, streaks). If a formula
 * changes, the state is simply rebuilt from the log; nothing is lost.
 *
 * applyEvent MUTATES the state it is given, and replay() builds one from scratch.
 */

import { newConceptState, gradeFromAttempt, review, DAY } from '../learn/scheduler.js';
import { masteryOf, withAttempt } from '../learn/mastery.js';
import { dateInZone, addDays } from '../time/zones.js';

export const DEFAULT_SETTINGS = {
  tz: 'America/Guyana',
  acct: 'USD',
  writtenGrading: 'mentor', // 'mentor' | 'self'
  riskCapPct: 1,
  reviewDebtGate: true,
  reviewDebtThreshold: 30,
  freeOrder: false,
  testOut: false,
  revealAttempts: 2,
  mentorPinHash: null,
  sessionSet: 'conventional-v1'
};

export function initialState() {
  return {
    v: 1,
    lastEventId: null,
    eventCount: 0,
    profile: { name: '', createdAt: null },
    settings: { ...DEFAULT_SETTINGS },
    ack: { honesty: null },
    lessons: {},
    concepts: {},
    seen: {},
    exams: {},
    levelsPassed: {},
    written: {},
    examAcc: {},
    study: { days: [], rest: [] },
    rank: { current: 'beginner', history: [] },
    overrides: [],
    counters: { answers: 0, correct: 0, kinds: {} },
    calcUses: {},
    warmups: { count: 0, lastMs: null },
    reviewChecks: {},
    reflections: {},
    backups: { lastMs: null }
  };
}

const dayKey = (state, t) => dateInZone(t, state.settings.tz);

function markStudyDay(state, t) {
  const k = dayKey(state, t);
  if (!state.study.days.includes(k)) state.study.days.push(k);
}

/** Consecutive study days ending today or yesterday. Rest days do not break a streak. */
export function studyStreak(state, nowMs) {
  const days = new Set(state.study.days);
  const rest = new Set(state.study.rest);
  let d = dateInZone(nowMs, state.settings.tz);
  if (!days.has(d) && !rest.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d) || rest.has(d)) {
    if (days.has(d)) n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/* ------------------------------------------------ event handlers */

const H = {};

H['profile.set'] = (s, e) => {
  s.profile.name = e.payload.name ?? s.profile.name;
  if (!s.profile.createdAt) s.profile.createdAt = e.t;
};

H['settings.set'] = (s, e) => {
  s.settings[e.payload.key] = e.payload.value;
};

H['ack.honesty'] = (s, e) => {
  s.ack.honesty = e.t;
};

H['lesson.open'] = (s, e) => {
  const l = (s.lessons[e.payload.lessonId] = s.lessons[e.payload.lessonId] || { state: 'in-progress', step: 0, checkpointBest: 0, completedAt: null });
  if (l.state !== 'completed') l.state = 'in-progress';
};

H['lesson.step'] = (s, e) => {
  const l = (s.lessons[e.payload.lessonId] = s.lessons[e.payload.lessonId] || { state: 'in-progress', step: 0, checkpointBest: 0, completedAt: null });
  l.step = Math.max(l.step, e.payload.step);
};

H['lesson.complete'] = (s, e) => {
  const p = e.payload;
  const l = (s.lessons[p.lessonId] = s.lessons[p.lessonId] || { state: 'in-progress', step: 0, checkpointBest: 0, completedAt: null });
  l.state = 'completed';
  l.completedAt = l.completedAt || e.t;
  l.checkpointBest = Math.max(l.checkpointBest, p.checkpointScore ?? 0);
  markStudyDay(s, e.t);
};

H['question.answer'] = (s, e) => {
  const p = e.payload;
  s.counters.answers += 1;
  if (p.correct) s.counters.correct += 1;
  const k = (s.counters.kinds[p.kind || 'other'] = s.counters.kinds[p.kind || 'other'] || { n: 0, sum: 0 });
  k.n += 1;
  k.sum += p.score;
  const base = p.tid || p.qid;
  if (base) s.seen[base] = (s.seen[base] || 0) + 1;
  for (const concept of p.concepts || []) {
    const before = s.concepts[concept] || newConceptState(concept);
    const wasSolid = masteryOf(before) >= 65;
    const grade = gradeFromAttempt({ score: p.score, hinted: !!p.hinted, revealed: !!p.revealed, firstTryStreak: before.firstTryStreak });
    let cs = review(before, grade, e.t);
    cs = withAttempt(cs, {
      t: e.t,
      s: p.score,
      h: !!p.hinted,
      r: !!p.revealed,
      home: (p.homeFor || []).includes(concept),
      ctx: p.ctx?.kind || 'lesson',
      e: p.errorTags || []
    });
    if (grade === 0 && wasSolid) cs.slipping = true;
    else if (cs.slipping && cs.firstTryStreak >= 3) cs.slipping = false;
    s.concepts[concept] = cs;
  }
  if (p.ctx?.kind === 'warmup' || p.ctx?.kind === 'drill') markStudyDay(s, e.t);
};

H['warmup.complete'] = (s, e) => {
  s.warmups.count += 1;
  s.warmups.lastMs = e.t;
  markStudyDay(s, e.t);
};

H['rest.day'] = (s, e) => {
  const k = dayKey(s, e.t);
  if (!s.study.rest.includes(k)) s.study.rest.push(k);
};

function attemptStatus(attempt) {
  if (!attempt.autoPass) return 'failed';
  const w = attempt.written || [];
  if (w.some((x) => x.status === 'pending' || x.status === 'unsubmitted')) return 'awaiting-mentor';
  return w.every((x) => x.status === 'meets') ? 'passed' : 'failed-written';
}

function settleAttempt(s, blueprintId, attempt, t) {
  const exam = s.exams[blueprintId];
  attempt.status = attemptStatus(attempt);
  if (attempt.status === 'passed') {
    exam.passed = true;
    exam.passedAt = exam.passedAt || t;
    exam.reviewPending = [];
    if (attempt.level !== undefined) s.levelsPassed[attempt.level] = s.levelsPassed[attempt.level] || t;
  } else if (attempt.status === 'failed') {
    exam.reviewPending = (attempt.diagnostic?.weakConcepts || []).map((c) => c.concept);
  }
}

H['exam.submit'] = (s, e) => {
  const p = e.payload;
  const exam = (s.exams[p.blueprintId] = s.exams[p.blueprintId] || { attempts: [], passed: false, passedAt: null, reviewPending: [] });
  const attempt = {
    attemptId: p.attemptId,
    t: e.t,
    level: p.level,
    seed: p.seed,
    form: p.form,
    overall: p.result.overall,
    parts: p.result.parts,
    gates: p.result.gates,
    autoPass: p.result.autoPass,
    written: p.result.written,
    diagnostic: p.result.diagnostic,
    status: p.result.status
  };
  exam.attempts.push(attempt);
  for (const [concept, v] of Object.entries(p.examAcc || {})) {
    const a = (s.examAcc[concept] = s.examAcc[concept] || { n: 0, sum: 0 });
    a.n += v.n;
    a.sum += v.sum;
  }
  settleAttempt(s, p.blueprintId, attempt, e.t);
};

function findAttempt(s, attemptId) {
  for (const [blueprintId, exam] of Object.entries(s.exams)) {
    const attempt = exam.attempts.find((a) => a.attemptId === attemptId);
    if (attempt) return { blueprintId, attempt };
  }
  return null;
}

H['written.submit'] = (s, e) => {
  const p = e.payload;
  const rec = (s.written[p.wid] = {
    wid: p.wid,
    questionId: p.questionId,
    text: p.text,
    at: e.t,
    ctx: p.ctx || {},
    self: p.self || null,
    status: 'pending',
    selfAssessed: false,
    marks: null,
    comment: '',
    reviewedAt: null
  });
  // Self-assessment counts only if the mentor has switched grading to "self"; it is always flagged as self-assessed.
  if (s.settings.writtenGrading === 'self' && p.self && p.self.meets) {
    rec.status = 'meets';
    rec.selfAssessed = true;
  }
  if (rec.ctx.kind === 'exam') {
    const found = findAttempt(s, rec.ctx.ref);
    if (found) {
      const w = found.attempt.written.find((x) => x.questionId === p.questionId);
      if (w) {
        w.status = rec.status;
        w.wid = p.wid;
      }
      settleAttempt(s, found.blueprintId, found.attempt, e.t);
    }
  }
};

H['mentor.review'] = (s, e) => {
  const p = e.payload;
  const rec = s.written[p.wid];
  if (!rec) return;
  rec.status = p.verdict; // 'meets' | 'partly' | 'notyet'
  rec.selfAssessed = false;
  rec.marks = p.marks || null;
  rec.comment = p.comment || '';
  rec.reviewedAt = e.t;
  if (rec.ctx.kind === 'exam') {
    const found = findAttempt(s, rec.ctx.ref);
    if (found) {
      const w = found.attempt.written.find((x) => x.questionId === rec.questionId);
      if (w) w.status = p.verdict;
      settleAttempt(s, found.blueprintId, found.attempt, e.t);
    }
  }
};

H['mentor.override'] = (s, e) => {
  s.overrides.push({ ...e.payload, t: e.t });
  if (e.payload.type === 'pass-level') s.levelsPassed[e.payload.target] = e.t;
};

H['review.check'] = (s, e) => {
  const p = e.payload;
  const rc = (s.reviewChecks[p.concept] = s.reviewChecks[p.concept] || { best: 0, n: 0 });
  rc.best = Math.max(rc.best, p.score);
  rc.n += 1;
  if (p.score >= 0.8) {
    const exam = s.exams[p.blueprintId];
    if (exam) exam.reviewPending = exam.reviewPending.filter((c) => c !== p.concept);
  }
};

H['rank.award'] = (s, e) => {
  s.rank.current = e.payload.rank;
  s.rank.history.push({ rank: e.payload.rank, t: e.t });
};

H['reflect.save'] = (s, e) => {
  s.reflections[e.payload.lessonId] = { text: e.payload.text, marks: e.payload.marks || null, at: e.t };
};

H['calc.use'] = (s, e) => {
  const k = e.payload.calc;
  s.calcUses[k] = (s.calcUses[k] || 0) + 1;
};

H['backup.done'] = (s, e) => {
  s.backups.lastMs = e.t;
};

export function applyEvent(state, event) {
  const h = H[event.type];
  if (h) h(state, event);
  state.lastEventId = event.id;
  state.eventCount += 1;
  return state;
}

export function replay(events) {
  const state = initialState();
  const sorted = [...events].sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of sorted) applyEvent(state, e);
  return state;
}

export const knownEventTypes = () => Object.keys(H);
export { DAY };
