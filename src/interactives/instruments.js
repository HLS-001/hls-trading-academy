/**
 * Level 2 widgets: the bond price and yield slider, and the instrument matrix.
 * Each makes you commit to a prediction or an answer before it shows the result.
 */

import { emit } from '../core/app.js';
import { h, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';

const note = () => h('p', { class: 'sim-note' }, 'A teaching example. Illustrates a mechanism; predicts nothing.');

/* ------------------------------------------------------------------ 2.05 bond price and yield */

export function bondslider({ onInteract }) {
  const COUPON = 5;
  let price = 100;
  let guess = null;
  let low = false;
  let high = false;
  const guesses = [];
  const price$ = h('b', null, '$100');
  const yield$ = h('b', { class: 'yield' }, '5.00%');
  const out = h('div', { class: 'lab-out' });
  const slider = h('input', { type: 'range', min: 70, max: 130, step: 1, value: 100, disabled: true, 'aria-label': 'Bond price', oninput: (e) => move(+e.target.value) });
  const bar = h('i', { style: { width: '50%' } });

  const move = (p) => {
    price = p;
    const y = (COUPON / price) * 100;
    price$.textContent = '$' + price;
    yield$.textContent = y.toFixed(2) + '%';
    bar.style.width = Math.min(100, (y / 8) * 100) + '%';
    if (price < 100) low = true;
    if (price > 100) high = true;
    if (low && high) finish();
  };

  const pick = (v, b) => {
    guess = v;
    guesses.forEach((x) => x.classList.toggle('sel', x === b));
    slider.disabled = false;
    out.replaceChildren(h('p', { class: 'hint-line' }, 'Now slide the price below $100, then above it. Watch the yield.'));
  };
  const guessBtn = (label, v) => {
    const b = h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: () => pick(v, b) }, label);
    guesses.push(b);
    return b;
  };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    emit('sim.run', { sim: 'bondslider', guess });
    out.replaceChildren(
      h('p', { class: 'lab-result' }, guess === 'rise' ? 'Your prediction was right: a lower price gives a higher yield.' : 'A lower price gives a HIGHER yield. Check the slider again.'),
      h('p', { class: 'lab-teach', html: mdInline('The coupon is fixed at **$5**. So the yield is $5 divided by the price. Pay less and the same income is a bigger share of what you paid.') }));
    onInteract();
  };

  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A bond pays a $5 coupon every year. You can change what you pay for it.'),
    h('p', { class: 'lab-q' }, 'If you pay LESS for the same bond, what happens to the yield?'),
    h('div', { class: 'choices' }, guessBtn('It Rises', 'rise'), guessBtn('It Falls', 'fall'), guessBtn('It Stays The Same', 'same')),
    h('div', { class: 'bond-read' }, h('div', null, h('span', null, 'Price'), price$), h('div', null, h('span', null, 'Yield'), yield$)),
    h('div', { class: 'bond-bar' }, bar),
    slider,
    out, note());
}

/* ------------------------------------------------------------------ 2.09 the instrument matrix */

const FEATURES = ['You Own The Asset', 'Leverage Is Built In', 'It Has Set Exchange Hours'];
const CHOICES = ['Yes', 'No', 'Depends'];
export const ROWS = [
  { id: 'share', name: 'A Share', cells: [['Yes', 'A share is a piece of the company itself.'], ['No', 'A plain share purchase has no built-in leverage. You would have to borrow to add it.'], ['Yes', 'Shares trade on an exchange with set opening hours.']] },
  { id: 'futures', name: 'A Futures Contract', cells: [['No', 'It is a contract to buy or sell later, not the thing itself.'], ['Yes', 'Margin lets a small deposit control a larger position.'], ['Depends', 'Each contract has its own trading hours. Some trade almost around the clock.']] },
  { id: 'cfd', name: 'A CFD', cells: [['No', 'It is a contract with a provider. You never own the underlying.'], ['Yes', 'Leverage is part of how a CFD works.'], ['Depends', 'A CFD follows its underlying, and the provider sets the hours.']] },
  { id: 'fx', name: 'A Margin Forex Position', cells: [['No', 'In a normal retail account you hold a margin position. You do not take delivery of the currency.'], ['Yes', 'Positions are opened with margin.'], ['No', 'The market is open about 24 hours on weekdays, so there are no set exchange hours.']] }
];

export function instrumentmatrix({ onInteract, lessonId = 'l02-comparing-instruments' }) {
  const picks = {};
  const out = h('div', { class: 'lab-out' });
  const check = button('Check My Matrix', { disabled: true, onClick: () => grade() });
  const cells = [];

  const rows = ROWS.map((row) => h('div', { class: 'mx-row card' },
    h('div', { class: 'mx-name' }, row.name),
    ...FEATURES.map((f, fi) => {
      const key = row.id + ':' + fi;
      const chips = CHOICES.map((c) => {
        const b = h('button', { type: 'button', class: 'opt small', 'data-v': c, onclick: () => { if (done) return; picks[key] = c; chips.forEach((x) => x.classList.toggle('sel', x === b)); check.disabled = Object.keys(picks).length < ROWS.length * FEATURES.length; } }, c);
        return b;
      });
      const line = h('div', { class: 'mx-line', 'data-cell': key }, h('span', null, f), h('div', { class: 'mx-chips' }, ...chips));
      cells.push({ key, line, chips, answer: row.cells[fi][0], why: row.cells[fi][1] });
      return line;
    })));

  let done = false;
  const grade = () => {
    done = true;
    check.disabled = true;
    let right = 0;
    for (const c of cells) {
      const ok = picks[c.key] === c.answer;
      if (ok) right += 1;
      c.line.classList.add(ok ? 'right' : 'wrong');
      c.chips.forEach((b) => (b.disabled = true));
      c.chips.forEach((b) => b.dataset.v === c.answer && b.classList.add(ok ? 'right' : 'missed'));
      if (!ok) c.line.append(h('p', { class: 'flaw-fix' }, c.why));
    }
    const score = right / cells.length;
    emit('question.answer', {
      qid: 'apply-l02-matrix',
      type: 'matrix',
      kind: 'concept',
      concepts: ['instrument-compare'],
      score,
      correct: right === cells.length,
      errorTags: [],
      hinted: false,
      revealed: false,
      ctx: { kind: 'lesson', ref: lessonId },
      homeFor: ['instrument-compare']
    });
    out.replaceChildren(h('p', { class: 'lab-result' }, `${right} of ${cells.length} right.`), h('p', { class: 'lab-teach' }, 'Any wrong cell shows why underneath. Read them before you continue.'));
    onInteract();
  };

  return h('div', { class: 'lab matrix' },
    ...rows,
    h('div', { class: 'lab-actions' }, check),
    out);
}
