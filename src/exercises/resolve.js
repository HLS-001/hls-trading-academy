/**
 * Turning a reference (a question id, "t:template-id", or an inline exercise) into something renderable
 * and gradeable, and building the event that records an answer.
 */

import { app } from '../core/app.js';
import { instantiate, gradeNumeric, gradeSteps } from '../learn/templates.js';
import { gradeQuestion } from '../learn/grade.js';
import { freshSeed } from '../learn/rng.js';

/** ref: 'q-id' | 't:template-id' | { kind: 'q'|'t'|'inline', id?, seed?, q?, mode? } */
export function resolveItem(ref, { seed } = {}) {
  const c = app.content;
  if (typeof ref === 'string') ref = ref.startsWith('t:') ? { kind: 't', id: ref.slice(2) } : { kind: 'q', id: ref };
  if (ref.kind === 'inline') return { kind: 'q', q: ref.q, id: ref.q.id, concepts: ref.q.concepts || [], inline: true, ref };
  if (ref.kind === 'q') {
    const q = c.questions.get(ref.id);
    if (!q) throw new Error('Unknown question ' + ref.id);
    return { kind: 'q', q, id: q.id, concepts: q.concepts || [], ref };
  }
  if (ref.kind === 't') {
    const tpl = c.templates.get(ref.id);
    if (!tpl) throw new Error('Unknown template ' + ref.id);
    const s = ref.seed ?? seed ?? freshSeed();
    const problem = instantiate(tpl, s);
    return { kind: 't', tpl, problem, id: problem.id, tid: tpl.id, seed: s, concepts: tpl.concepts || [], ref, mode: ref.mode || 'single' };
  }
  throw new Error('Bad item reference');
}

export function gradeItem(item, response) {
  if (item.kind === 't') {
    if (item.mode === 'steps') {
      const g = gradeSteps(item.problem, response, item.tpl);
      const errorTags = [];
      return { correct: g.correct, score: g.score, errorTags, feedback: g.correct ? item.problem.explanation : '', steps: g.steps, carriedAny: g.carriedAny };
    }
    return gradeNumeric(item.problem, response);
  }
  return gradeQuestion(item.q, response);
}

export const kindOf = (item) => (item.kind === 't' || item.q.type === 'num' ? 'numeric' : 'concept');

/** The concepts whose HOME lesson this is, so transfer can be told apart from home-lesson practice. */
export function homeFor(ctx) {
  if (ctx && ctx.lessonId) {
    const l = app.content.lessons.get(ctx.lessonId);
    if (l) return l.concepts?.introduces || [];
  }
  return [];
}

/** The payload of a question.answer event. */
export function answerPayload(item, result, ctx, extra = {}) {
  return {
    qid: item.kind === 'q' ? item.q.id : undefined,
    tid: item.kind === 't' ? item.tpl.id : undefined,
    seed: item.kind === 't' ? item.seed : undefined,
    type: item.kind === 't' ? 'numeric' : item.q.type,
    kind: kindOf(item),
    concepts: item.concepts,
    score: result.score ?? 0,
    correct: !!result.correct,
    errorTags: result.errorTags || [],
    hinted: !!extra.hinted,
    revealed: !!extra.revealed,
    critical: item.kind === 'q' ? !!item.q.critical : !!item.tpl.critical,
    ctx: { kind: ctx.kind, ref: ctx.ref },
    homeFor: homeFor(ctx)
  };
}

/** Everything the exam needs to know about a graded item. */
export function examResultOf(item, result) {
  const q = item.kind === 'q' ? item.q : null;
  return {
    score: result.score ?? 0,
    correct: !!result.correct,
    errorTags: result.errorTags || [],
    concepts: item.concepts,
    critical: q ? !!q.critical : !!item.tpl.critical,
    tags: q ? q.tags || [] : item.tpl.tags || []
  };
}
