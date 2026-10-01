/**
 * The Calculator Mastery Lab: twenty adaptive mixed problems at a time. Families you are weakest in come up more often.
 * A family is mastered at 90% or better over its last ten problems, spread over at least two days.
 * The level exam stays closed until every family is mastered (your mentor can waive this).
 */

import { app } from '../core/app.js';
import { h, mount } from '../ui/dom.js';
import { button, chip, bar } from '../ui/kit.js';
import { runSet } from '../exercises/runner.js';
import { familyStatus } from '../learn/progress.js';
import { makeRng, freshSeed } from '../learn/rng.js';

const SESSION = 20;

export function masterylab({ level = 3, onInteract = () => {} } = {}) {
  const lv = app.content.levelByNumber.get(level);
  const families = lv.masteryFamilies || [];
  const names = lv.masteryFamilyNames || {};
  const root = h('div', { class: 'lab masterylab' });

  const templatesOf = (cluster) => [...app.content.templates.values()].filter((t) => t.cluster === cluster);

  /** Twenty items: more from families that are weak, a few from mastered ones so they stay fresh. */
  const plan = () => {
    const rng = makeRng('mastery#' + freshSeed());
    const weights = families.map((c) => {
      const st = familyStatus(app.state, c);
      const f = app.state.families[c];
      const tags = {};
      for (const hh of (f ? f.hist : []).slice(-8)) for (const e of hh.e || []) tags[e] = (tags[e] || 0) + 1;
      const repeated = Math.max(0, ...Object.values(tags)) >= 2 ? 1 : 0;
      return { c, w: (st.mastered ? 0.4 : 1 + 3 * (1 - (st.n ? st.accuracy : 0.4)) + (st.n < 10 ? 1 : 0)) + repeated };
    });
    const total = weights.reduce((a, x) => a + x.w, 0);
    const refs = [];
    for (let i = 0; i < SESSION; i++) {
      let r = rng.next() * total;
      let chosen = weights[0].c;
      for (const x of weights) {
        r -= x.w;
        if (r <= 0) {
          chosen = x.c;
          break;
        }
      }
      const tpl = rng.pick(templatesOf(chosen));
      refs.push({ kind: 't', id: tpl.id, seed: rng.int(1, 2 ** 31 - 1) });
    }
    return refs;
  };

  const overview = (message) => {
    const rows = families.map((c) => {
      const st = familyStatus(app.state, c);
      return h('div', { class: 'ml-row' },
        h('div', { class: 'ml-top' }, h('b', null, names[c] || c), st.mastered ? chip('Mastered', 'emerald') : h('span', { class: 'ml-n' }, `${st.n} of 10 problems`)),
        bar(st.n ? st.accuracy : 0, { label: (names[c] || c) + ' accuracy' }),
        h('small', null, st.n ? `${Math.round(st.accuracy * 100)}% over the last ${st.n} · ${st.days} day${st.days === 1 ? '' : 's'}` : 'Not started'));
    });
    const gate = families.every((c) => familyStatus(app.state, c).mastered);
    mount(root,
      h('p', { class: 'lab-intro' }, 'Each session is 20 mixed problems. A family is mastered at 90% or better over its last 10 problems, spread over at least two different days. Every mistake is named so you can see what to fix.'),
      message ? h('div', { class: 'notice' }, message) : null,
      ...rows,
      gate ? h('div', { class: 'callout keypoint' }, h('div', { class: 'callout-title' }, 'Every Family Mastered'), h('p', null, 'The level assessment can open once all the lessons are done.')) : null,
      h('div', { class: 'lab-actions' }, button(gate ? 'Practice Again' : 'Start 20 Problems', { onClick: start })));
  };

  const start = () => {
    runSet({
      container: root,
      refs: plan(),
      ctx: { kind: 'drill', ref: 'mastery-lab' },
      mode: 'practice',
      onDone: (res) => {
        onInteract();
        overview(`Session done: ${res.correct} of ${res.n} right (${Math.round(res.score * 100)}%).`);
      }
    });
  };

  overview();
  return root;
}
