/**
 * Grading for the static question types. Numeric problems are graded in templates.js.
 *
 * Every grader returns { correct, score (0..1), errorTags[], feedback }.
 * Written answers are never graded here: they return { pending: true }.
 */

import { gradeNumeric, formatUnit } from './templates.js';

const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

function gradeNum(q, response) {
  const problem = {
    answer: q.answer,
    tolerance: { abs: q.tolerance ?? 1e-9, rel: 0 },
    wrong: q.wrong || [],
    answerText: formatUnit(q.answer, q.unit || {}),
    explanation: q.explanation || ''
  };
  return gradeNumeric(problem, response);
}

export function gradeQuestion(q, response) {
  switch (q.type) {
    case 'num': return gradeNum(q, response);
    case 'mcq': return gradeMcq(q, response);
    case 'multi': return gradeMulti(q, response);
    case 'tfr': return gradeTfr(q, response);
    case 'sort': return gradeSort(q, response);
    case 'sequence': return gradeSequence(q, response);
    case 'match': return gradeMatch(q, response);
    case 'written': return { pending: true, correct: false, score: 0, errorTags: [], feedback: '' };
    case 'frame': return gradeFrame(q, response);
    default: throw new Error('Cannot grade question type: ' + q.type);
  }
}

function gradeMcq(q, response) {
  const correct = String(response) === String(q.answer);
  const tag = q.optionTags && q.optionTags[response];
  return {
    correct,
    score: correct ? 1 : 0,
    errorTags: correct || !tag ? [] : [tag],
    feedback: correct ? q.explanation || '' : ((q.optionFeedback && q.optionFeedback[response]) || '') + (q.explanation ? ' ' + q.explanation : ''),
    expected: q.answer
  };
}

function gradeMulti(q, response) {
  const picks = Array.isArray(response) ? response : [];
  const hits = picks.filter((p) => q.answer.includes(p)).length;
  const misses = picks.filter((p) => !q.answer.includes(p)).length;
  const exact = same(picks, q.answer);
  const wrongTags = picks.filter((p) => !q.answer.includes(p) && q.optionTags && q.optionTags[p]).map((p) => q.optionTags[p]);
  const feedback = exact
    ? q.explanation || ''
    : picks
        .filter((p) => !q.answer.includes(p))
        .map((p) => (q.optionFeedback && q.optionFeedback[p]) || '')
        .filter(Boolean)
        .join(' ') + (q.explanation ? ' ' + q.explanation : '');
  return { correct: exact, score: Math.max(0, (hits - misses) / q.answer.length), errorTags: wrongTags, feedback: feedback.trim(), expected: q.answer };
}

function gradeTfr(q, response) {
  const r = response || {};
  const valueOk = r.value === q.answer;
  const reasonOk = r.reason === q.reasonAnswer;
  const score = valueOk && reasonOk ? 1 : valueOk ? 0.5 : 0;
  let feedback = q.explanation || '';
  if (valueOk && !reasonOk) feedback = 'The verdict is right, but the reason is not. ' + ((q.reasonFeedback && q.reasonFeedback[r.reason]) || '') + ' ' + (q.explanation || '');
  else if (!valueOk) feedback = ((q.reasonFeedback && q.reasonFeedback[r.reason]) || '') + ' ' + (q.explanation || '');
  const tags = [];
  if (!reasonOk && q.reasonTags && q.reasonTags[r.reason]) tags.push(q.reasonTags[r.reason]);
  return { correct: score === 1, score, errorTags: tags, feedback: feedback.trim(), expected: { value: q.answer, reason: q.reasonAnswer } };
}

function gradeSort(q, response) {
  const r = response || {};
  const ids = q.items.map((i) => i.id);
  const right = ids.filter((id) => r[id] === q.answer[id]);
  const wrong = ids.filter((id) => r[id] !== q.answer[id]);
  const feedback = wrong
    .map((id) => (q.itemFeedback && q.itemFeedback[id]) || '')
    .filter(Boolean)
    .join(' ');
  return {
    correct: wrong.length === 0,
    score: right.length / ids.length,
    errorTags: [],
    feedback: wrong.length === 0 ? q.explanation || '' : (feedback + ' ' + (q.explanation || '')).trim(),
    wrongItems: wrong,
    expected: q.answer
  };
}

function gradeSequence(q, response) {
  const r = Array.isArray(response) ? response : [];
  const right = q.answer.filter((id, i) => r[i] === id).length;
  const exact = right === q.answer.length && r.length === q.answer.length;
  return { correct: exact, score: right / q.answer.length, errorTags: [], feedback: q.explanation || '', expected: q.answer };
}

function gradeMatch(q, response) {
  const r = response || {};
  const ids = q.left.map((l) => l.id);
  const right = ids.filter((id) => r[id] === q.answer[id]).length;
  return { correct: right === ids.length, score: right / ids.length, errorTags: [], feedback: q.explanation || '', expected: q.answer };
}

function gradeFrame(q, response) {
  const r = response || {};
  const filled = q.fields.filter((f) => (r[f.id] || '').trim().length >= (f.min ?? 8));
  const complete = filled.length === q.fields.length;
  return {
    correct: complete,
    score: filled.length / q.fields.length,
    errorTags: [],
    feedback: complete ? q.explanation || 'All eight questions answered.' : 'Answer every question in your own words before you continue.',
    unscored: true
  };
}

/** Anything the student sees as the "right answer" after a wrong attempt, for display. */
export function isAutoGraded(q) {
  return q.type !== 'written';
}
