/**
 * Runs a sequence of questions in a container: one at a time, with a progress line, recording each
 * answer as an event (practice) or collecting responses to grade together (exam).
 */

import { emit } from '../core/app.js';
import { h, mount } from '../ui/dom.js';
import { button, bar } from '../ui/kit.js';
import { renderQuestion } from './render.js';
import { resolveItem, gradeItem, answerPayload } from './resolve.js';
import { freshSeed } from '../learn/rng.js';

/**
 * options:
 *   refs        array of item references
 *   ctx         { kind, ref, lessonId? } for events
 *   mode        'practice' | 'exam'
 *   labelFor    (index) => extra header text (exam parts)
 *   onDone      ({ items, results, responses, score, correct, n }) => void
 *   emitEvents  default true in practice
 */
export function runSet({ container, refs, ctx, mode = 'practice', labelFor, onDone, startAt = 0, onProgress, resolved, prefill }) {
  const seed = freshSeed();
  const items = resolved || refs.map((r, i) => resolveItem(r, { seed: seed + i * 7919 }));
  const results = new Array(items.length).fill(null);
  const responses = prefill ? [...prefill] : new Array(items.length).fill(undefined);
  let i = startAt;
  const exam = mode === 'exam';

  const show = () => {
    const item = items[i];
    const last = i === items.length - 1;
    const label = labelFor ? labelFor(i) : null;
    const header = h('div', { class: 'run-head' },
      h('div', { class: 'run-count' }, `Question ${i + 1} of ${items.length}`),
      label ? h('div', { class: 'run-label' }, label) : null,
      bar((i + (results[i] || exam && responses[i] !== undefined ? 1 : 0)) / items.length, { label: 'Questions answered' }));
    const cont = h('div', { class: 'run-next' });
    let done = false;
    const card = renderQuestion(item, {
      mode,
      shuffleSeed: seed,
      onAnswer: (result, response) => {
        if (done) return;
        done = true;
        responses[i] = response;
        results[i] = result;
        if (!exam && result && !result.pending) {
          emit('question.answer', answerPayload(item, result, ctx));
        }
        onProgress && onProgress(i, result, response);
        if (exam) {
          setTimeout(advance, 120);
          return;
        }
        cont.append(button(last ? 'See Results' : 'Continue', { onClick: advance, id: 'next-btn' }));
        cont.scrollIntoView && cont.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    mount(container, header, card.el, cont);
    window.scrollTo && window.scrollTo(0, 0);
  };

  const advance = () => {
    if (i < items.length - 1) {
      i += 1;
      show();
    } else finish();
  };

  const finish = () => {
    const graded = results.filter((r) => r && !r.pending);
    const score = graded.length ? graded.reduce((a, r) => a + (r.score || 0), 0) / graded.length : 0;
    onDone && onDone({ items, results, responses, score, correct: graded.filter((r) => r.correct).length, n: graded.length });
  };

  if (!items.length) finish();
  else show();
  return { items };
}

/** Grade a whole set of stored responses (used by the exam, which does not show results as it goes). */
export function gradeAll(items, responses) {
  return items.map((item, i) => {
    if (item.kind === 'q' && item.q.type === 'written') return { pending: true, score: 0, correct: false, errorTags: [] };
    return gradeItem(item, responses[i]);
  });
}
