/** The daily Warm-Up and focused practice sets. */

import { app, emit } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { button, card, chip, ornament, leafBurst } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { runSet } from '../exercises/runner.js';
import { composeWarmup, composeFocus } from '../learn/warmup.js';
import { masteryOf, statusOf, STATUS_LABEL } from '../learn/mastery.js';
import { studyStreak } from '../core/derive.js';
import { freshSeed } from '../learn/rng.js';

function summary({ title, res, extra }) {
  const pctScore = Math.round(res.score * 100);
  return h('div', { class: 'session-done' },
    h('div', { class: 'eyebrow' }, title),
    h('div', { class: 'big-score' }, pctScore + '%'),
    h('p', null, `${res.correct} of ${res.n} right.`),
    ornament(),
    ...(extra || []));
}

export function warmupView() {
  const st = app.state;
  const screen = begin({ title: 'Warm-Up', back: '#/today', focus: true });
  const items = composeWarmup(st, app.content, { nowMs: Date.now(), size: 10, seed: freshSeed() });
  if (!items.length) {
    return mount(screen, card({ class: 'gate' }, h('h2', null, 'Nothing To Warm Up Yet'), h('p', null, 'Finish your first lesson. Old material comes back here so it stays with you.'), button('Back To Today', { onClick: () => go('#/today') })));
  }
  runSet({
    container: screen,
    refs: items.map((it) => ({ kind: it.kind, id: it.id, seed: it.seed })),
    ctx: { kind: 'warmup', ref: new Date().toISOString().slice(0, 10) },
    onDone: (res) => {
      emit('warmup.complete', { count: res.n, correct: res.correct });
      const streak = studyStreak(app.state, Date.now());
      const weakLeft = items.length;
      mount(screen, summary({
        title: 'Warm-Up Complete',
        res,
        extra: [h('p', { class: 'done-sub' }, `Study streak: ${streak} day${streak === 1 ? '' : 's'}.`), h('div', { class: 'qactions col' }, button('Back To Today', { onClick: () => go('#/today') }))]
      }));
      leafBurst(screen.querySelector('.big-score'));
    }
  });
}

export function focusView({ concept }, query = {}) {
  const c = app.content;
  const meta = c.concepts.get(concept);
  const back = query.review ? `#/review/${query.review}` : '#/progress';
  const screen = begin({ title: meta ? meta.name : 'Practice', back, focus: true });
  if (!meta) return mount(screen, card(h('p', null, 'That topic does not exist.')));
  const items = composeFocus(app.state, c, concept, { size: 8, seed: freshSeed() });
  if (!items.length) return mount(screen, card(h('p', null, 'There are no practice items for this topic yet.')));
  runSet({
    container: screen,
    refs: items.map((it) => ({ kind: it.kind, id: it.id, seed: it.seed })),
    ctx: { kind: query.review ? 'review' : 'drill', ref: 'focus:' + concept },
    onDone: (res) => {
      const passed = res.score >= 0.8;
      if (query.review) emit('review.check', { blueprintId: query.review, concept, score: res.score });
      const cs = app.state.concepts[concept];
      const mastery = cs ? masteryOf(cs) : 0;
      mount(screen, summary({
        title: 'Practice Set Done',
        res,
        extra: [
          h('p', { class: 'done-sub' }, `${meta.name}: ${STATUS_LABEL[statusOf(cs, mastery)]} · mastery ${mastery}`),
          query.review ? h('p', { class: 'hint-line' }, passed ? 'Cleared. This concept is off your review list.' : 'You need 80% to clear this concept. Try another set.') : null,
          h('div', { class: 'qactions col' }, button('Another Set', { variant: passed ? 'ghost' : 'primary', onClick: () => focusView({ concept }, query) }), button(query.review ? 'Back To The Review' : 'Back', { variant: 'ghost', onClick: () => go(back) }))
        ]
      }));
    }
  });
}
