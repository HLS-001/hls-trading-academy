/**
 * Analysis at the live edge (E23). The future is hidden. The student states the structure, marks the latest confirmed
 * swings and the invalidation, and writes what would change their view. Only THEN is the future revealed, a few bars at a
 * time, and it is shown neutrally: the score is for the reading, never for what price did next.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { chartView } from '../ui/chartview.js';
import { chartUI } from '../exercises/chartui.js';
import { buildChartQuestion, gradeChart } from '../charts/tasks.js';
import { firstBreach } from '../charts/detect.js';
import { freshSeed } from '../learn/rng.js';

const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');

/** spec: { recipes, seed, minWords } */
export function liveedgelab({ spec, onInteract, lessonId }) {
  const seed = spec.seed || freshSeed();
  const built = buildChartQuestion({ id: 'lab-live', task: 'structure-set', concepts: ['live-edge', 'shift-invalidation'], recipes: spec.recipes || ['trend-up', 'trend-down', 'shift-down', 'range'], n: [2], order: [2], trim: [16, 22], keepSealed: true }, seed);
  const q = built.question;
  if (typeof window !== 'undefined' && window.__HLS_TEST) window.__HLS_TEST.liveQ = q;
  const ui = chartUI(q, { exam: true, commit: () => {} });
  const frame = h('textarea', { class: 'written', rows: 3, placeholder: 'What would change my view? For example: which level, and what price would have to do there.', 'aria-label': 'What would change my view' });
  const out = h('div', { class: 'lab-out' });
  let committed = false;

  const commitBtn = button('Commit My Analysis', { disabled: true, onClick: () => commit() });
  const sync = () => { commitBtn.disabled = committed || !ui.isComplete() || frame.value.trim().length < (spec.minChars || 12); };
  ui.onChange(sync);
  frame.addEventListener('input', sync);

  function commit() {
    if (committed) return;
    committed = true;
    commitBtn.disabled = true;
    frame.disabled = true;
    const response = ui.getResponse();
    const res = gradeChart(q, response);
    ui.lock(res);
    emit('question.answer', { qid: q.id, type: 'choice', kind: 'concept', concepts: q.concepts, score: res.score, correct: res.correct, errorTags: res.errorTags, hinted: false, revealed: false, ctx: { kind: 'lab', ref: lessonId }, homeFor: [] });
    emit('sim.run', { sim: 'liveedge', score: res.score });
    revealSection(res);
    onInteract();
  }

  function revealSection(res) {
    const all = [...q.chart.candles, ...q.sealed];
    const structure = q.parts.find((p) => p.id === 'structure').answer;
    const inval = q.parts.find((p) => p.id === 'inval');
    const lines = [];
    let level = null;
    let dir = null;
    if (inval && inval.kind === 'pick') {
      const i = inval.answer[0];
      const bull = structure === 'bullish';
      level = bull ? q.chart.candles[i][2] : q.chart.candles[i][1];
      dir = bull ? 'down' : 'up';
      lines.push({ price: level, label: 'Invalidation', tone: bull ? 'rose' : 'teal', dashed: true });
    }
    const upto = q.chart.upto;
    let shown = upto;
    const view = chartView({ candles: all.slice(0, shown + 1), height: 226, lines, tappable: false, bands: [] });
    const status = h('div', { class: 'lab-out' });
    const stepBtn = button('Reveal The Next 6 Bars', { onClick: () => {
      shown = Math.min(all.length - 1, shown + 6);
      draw();
    } });
    const draw = () => {
      view.update({ candles: all.slice(0, shown + 1), relTo: upto, bands: shown > upto ? [{ from: upto + 1, to: shown, tone: 'violet', label: 'Revealed' }] : [] });
      const revealedBars = shown - upto;
      let msg = `${revealedBars} of ${all.length - 1 - upto} bars revealed.`;
      if (level !== null && revealedBars > 0) {
        const b = firstBreach(all.slice(0, shown + 1), level, dir, upto, shown, 'close');
        msg += b > 0 ? ` A bar CLOSED ${dir === 'down' ? 'below' : 'above'} the invalidation level at bar +${b - upto}. Under the stated rule, the structure you described no longer holds.` : ' No bar has closed beyond the invalidation level yet, so the structure you described still holds under the rule.';
      }
      status.replaceChildren(h('p', { class: 'lab-result' }, msg));
      if (shown >= all.length - 1) stepBtn.disabled = true;
    };
    draw();
    out.replaceChildren(
      h('p', { class: 'lab-result' }, `Your reading scored ${Math.round(res.score * 100)}%. ${res.correct ? 'Every part matches the stated definition.' : 'Some parts differ from the reference. The marks above show which.'}`),
      h('p', { class: 'lab-teach', html: mdInline('This score is for the **reading**, not for what price does next. The reveal below is neutral: a structure can hold or break after a good analysis, and that does not change the analysis.') }),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'What You Wrote'), h('p', null, frame.value.trim())),
      view.el, status, h('div', { class: 'qactions' }, stepBtn, button('Analyse Another Chart', { variant: 'ghost', onClick: () => root.replaceWith(liveedgelab({ spec: { ...spec, seed: undefined }, onInteract, lessonId })) })));
  }

  const root = h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'The future is hidden. State the structure, mark the latest confirmed swings and the invalidation, and write what would change your view. Then commit.'),
    ui.node,
    h('label', { class: 'slider' }, h('span', null, 'What Would Change My View?'), frame),
    h('div', { class: 'lab-actions' }, commitBtn), out, note());
  return root;
}
