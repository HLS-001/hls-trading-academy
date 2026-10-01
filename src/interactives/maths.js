/**
 * Level 5 widgets: mean and median, sample size, the expectancy surface, the equity builder, compounding against
 * fixed risk, the ruin explorer, and the expectancy lab. All numbers come from calc/ and sim/.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, s, mdInline, mount } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { multiLine, resultBars } from '../ui/charts.js';
import { numInput } from '../ui/numinput.js';
import * as C from '../calc/index.js';
import { tradeSeries, equityCurve, maxDrawdown, ruinProbability } from '../sim/monte.js';
import { makeRng, freshSeed } from '../learn/rng.js';

const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');
const trimN = (n, d = 2) => String(+Number(n).toFixed(d));
const rTxt = (r) => (r < 0 ? '−' : r > 0 ? '+' : '') + trimN(Math.abs(r), 2) + 'R';
const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const mark = (group, v) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
const chip = (label, v, group, onPick) => {
  const b = h('button', { type: 'button', class: 'opt small', 'data-v': String(v), onclick: () => { mark(group, v); onPick(v); } }, label);
  group.push(b);
  return b;
};

/* ------------------------------------------------------------------ 5.05 mean and median */

export function meanmedian({ onInteract }) {
  const base = [1, -1, 1, 2, -1, 1, 1, -1, 2];
  let last = 2;
  let guess = null;
  let done = false;
  const guesses = [];
  const chart = h('div');
  const read = h('div', { class: 'mm-read' });
  const out = h('div', { class: 'lab-out' });
  const val = h('b', null, '+2R');
  const draw = () => {
    const all = [...base, last];
    chart.replaceChildren(resultBars(all, { highlight: all.length - 1 }));
    read.replaceChildren(h('div', null, h('span', null, 'Mean'), h('b', null, rTxt(C.mean(all)))), h('div', null, h('span', null, 'Median'), h('b', null, rTxt(C.median(all)))));
    val.textContent = rTxt(last);
  };
  const slider = h('input', { type: 'range', min: -3, max: 30, step: 1, value: 2, disabled: true, 'aria-label': 'The last trade in R', oninput: (e) => {
    last = +e.target.value;
    draw();
    if (!done && last >= 12) {
      done = true;
      const all = [...base, last];
      out.replaceChildren(h('p', { class: 'lab-result' }, guess === 'mean' ? 'Right: the mean jumped and the median barely moved.' : 'The mean jumped and the median barely moved.'), h('p', { class: 'lab-teach', html: mdInline(`One big trade moved the **mean** to ${rTxt(C.mean(all))}, but the **median** stayed near ${rTxt(C.median(all))}. When one result dominates, compare the mean with the median before you trust the average.`) }));
      emit('sim.run', { sim: 'meanmedian', guess });
      onInteract();
    }
  } });
  const pick = (v) => { guess = v; slider.disabled = false; out.replaceChildren(h('p', { class: 'hint-line' }, 'Now slide the last trade up to +12R or more.')); };
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Ten trades. Nine are ordinary. You control the tenth.'),
    chart, read,
    h('p', { class: 'lab-q' }, 'If the tenth trade grows from +2R to +20R, what happens?'),
    h('div', { class: 'choices col' }, chip('The mean rises a lot and the median barely moves', 'mean', guesses, pick), chip('The median rises a lot and the mean barely moves', 'median', guesses, pick), chip('Both rise by the same amount', 'both', guesses, pick)),
    h('label', { class: 'slider' }, h('span', null, 'The Tenth Trade ', val), slider), out, note());
}

/* ------------------------------------------------------------------ 5.06 sample size */

export function samplesize({ onInteract }) {
  const WIN = 0.4;
  const WR = 2;
  const exp = WIN * WR - (1 - WIN);
  const sd = Math.sqrt(WIN * WR * WR + (1 - WIN) - exp * exp);
  let n = 30;
  let guess = null;
  const seen = new Set();
  const sizes = [];
  const guesses = [];
  const plot = h('div');
  const out = h('div', { class: 'lab-out' });
  const run = button('Run Ten Traders', { disabled: true, onClick: () => go() });

  const go = () => {
    const seed = freshSeed();
    const means = Array.from({ length: 10 }, (_, k) => C.mean(tradeSeries({ seed: seed + '#' + k, n, winRate: WIN, winR: WR, lossR: 1 })));
    const w = 340;
    const lo = -1.6;
    const hi = 2.0;
    const x = (v) => 12 + ((w - 24) * (Math.max(lo, Math.min(hi, v)) - lo)) / (hi - lo);
    const dots = means.map((m, i) => s('circle', { cx: x(m), cy: 30 + (i % 5) * 9, r: 4.5, fill: m < 0 ? '#FFC83D' : '#2DD4BF', 'fill-opacity': 0.9 }));
    plot.replaceChildren(h('div', { class: 'figure' }, s('svg', { viewBox: '0 0 340 100', class: 'fig', role: 'img', 'aria-label': 'Average result of ten traders' },
      s('line', { x1: x(0), x2: x(0), y1: 8, y2: 78, stroke: 'rgba(165,173,214,.6)', 'stroke-dasharray': '3 3' }),
      s('line', { x1: x(exp), x2: x(exp), y1: 8, y2: 78, stroke: '#FFE8A0', 'stroke-width': 1.5 }),
      ...dots,
      s('text', { x: x(0), y: 92, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9, 'font-family': 'Manrope, sans-serif' }, '0R (no edge)'),
      s('text', { x: x(exp) + 4, y: 14, fill: '#FFE8A0', 'font-size': 9, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, 'true +0.2R'))));
    const neg = means.filter((m) => m < 0).length;
    seen.add(n);
    out.replaceChildren(
      h('p', { class: 'lab-result' }, `${neg} of 10 traders show a NEGATIVE average after ${n} trades.`),
      h('p', { class: 'lab-teach', html: mdInline(`Every trader has the same method, with a real edge of **+0.2R** per trade. The standard error of the average is about **${trimN(sd / Math.sqrt(n), 2)}R** at ${n} trades. It shrinks only with **√n**: four times the trades halves it.`) }));
    emit('sim.run', { sim: 'samplesize', n, guess });
    if (seen.has(30) && seen.has(1000)) onInteract();
  };
  const pickGuess = (v) => { guess = v; run.disabled = false; };
  const root = h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A method wins 40% of the time, +2R on a win and −1R on a loss. Its true average is +0.2R per trade. Ten traders each run it for n trades.'),
    h('p', { class: 'lab-q' }, 'After 30 trades each, how many of the ten will show a NEGATIVE average?'),
    h('div', { class: 'choices' }, chip('None', 'zero', guesses, pickGuess), chip('One to three', 'few', guesses, pickGuess), chip('Five or more', 'many', guesses, pickGuess)),
    h('div', { class: 'choices' }, ...[10, 30, 100, 300, 1000].map((v) => chip(`${v} trades`, v, sizes, (x) => { n = x; }))),
    h('div', { class: 'lab-actions' }, run), plot, out, note());
  mark(sizes, n);
  return root;
}

/* ------------------------------------------------------------------ 5.08 the expectancy surface */

export function expectancysurface({ onInteract }) {
  const RRS = [0.5, 1, 1.5, 2, 3];
  const WRS = [20, 30, 40, 50, 60, 70];
  const tapped = new Set();
  const detail = h('div', { class: 'lab-out' });
  const cells = [];
  const table = h('div', { class: 'es-grid' });
  table.append(h('div', { class: 'es-corner' }, 'Payoff ↓  Win rate →'), ...WRS.map((w) => h('div', { class: 'es-h' }, w + '%')));
  for (const rr of RRS) {
    table.append(h('div', { class: 'es-h' }, `${rr} : 1`));
    for (const w of WRS) {
      const e = Math.round(C.expectancyR({ winRate: w / 100, avgWinR: rr, avgLossR: 1 }) * 1e6) / 1e6;
      const b = h('button', { type: 'button', class: 'es-cell ' + (e > 0.005 ? 'pos' : e < -0.005 ? 'neg' : 'zero'), 'data-k': `${rr}|${w}`, onclick: () => {
        tapped.add(`${rr}|${w}`);
        cells.forEach((c) => c.classList.toggle('sel', c === b));
        detail.replaceChildren(h('p', { class: 'lab-result' }, `Win ${w}% at ${rr} : 1 → expectancy ${rTxt(e)} per trade.`), h('p', { class: 'lab-teach' }, `To break even at ${rr} : 1 you need ${trimN(C.breakevenWinRate(rr) * 100, 1)}% wins.`));
        if (tapped.size >= 6) onInteract();
      } }, (e > 0 ? '+' : e < 0 ? '−' : '') + trimN(Math.abs(e), 2));
      cells.push(b);
      table.append(b);
    }
  }
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Each cell is the expectancy per trade, in R, for a win rate and a payoff (reward-to-risk). Teal cells make money on average. Amber cells lose money on average.'),
    h('p', { class: 'lab-q' }, 'Tap cells. For each payoff, find the lowest win rate that is still profitable.'),
    table, detail, note());
}

/* ------------------------------------------------------------------ 5.10 the equity builder */

export function equitybuilder({ onInteract }) {
  const seq = [];
  let riskPct = 1;
  const risks = [];
  const chart = h('div');
  const read = h('div', { class: 'mm-read' });
  const out = h('div', { class: 'lab-out' });
  let done = false;

  const draw = () => {
    const cum = [0];
    seq.forEach((r) => cum.push(cum[cum.length - 1] + r));
    chart.replaceChildren(seq.length ? multiLine([{ label: 'Running total (R)', values: cum, color: '#2DD4BF' }], { baseline: 0, fmt: (v) => trimN(v, 1) + 'R', hgt: 140 }) : h('p', { class: 'hint-line' }, 'Tap results to build a run of trades.'));
    const ddR = C.maxDrawdownR(seq);
    const curve = equityCurve(seq, { mode: 'percent', riskPct, start: 10000 });
    const dd = maxDrawdown(curve);
    read.replaceChildren(
      h('div', null, h('span', null, 'Total'), h('b', null, rTxt(cum[cum.length - 1]))),
      h('div', null, h('span', null, 'Max Drawdown'), h('b', null, trimN(ddR, 1) + 'R')),
      h('div', null, h('span', null, `Drawdown At ${riskPct}% Risk`), h('b', null, trimN(dd.dd * 100, 1) + '%')),
      h('div', null, h('span', null, 'Gain To Recover'), h('b', null, dd.dd > 0 ? trimN(dd.recovery * 100, 1) + '%' : '—')));
    const goal = seq.length >= 10 && ddR >= 4 && cum[cum.length - 1] > 0;
    out.replaceChildren(...[h('p', { class: goal ? 'lab-result' : 'hint-line' }, goal ? 'Challenge met: a run that ends ahead, yet suffered a drawdown of 4R or more.' : 'Challenge: build at least 10 trades that END ahead but have a drawdown of at least 4R.'), goal ? h('p', { class: 'lab-teach', html: mdInline('Profitable runs still contain deep drawdowns. The **recovery** needed is always bigger than the fall: −20% needs +25%, −50% needs +100%.') }) : null].filter(Boolean));
    if (goal && !done) {
      done = true;
      emit('sim.run', { sim: 'equitybuilder', trades: seq.length });
      onInteract();
    }
  };
  const add = (r) => { if (seq.length < 24) { seq.push(r); draw(); } };
  const riskChips = [1, 2, 5].map((v) => chip(`${v}% risk`, v, risks, (x) => { riskPct = x; draw(); }));
  mark(risks, riskPct);
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Build a run of trades one result at a time. Watch the running total and the drawdown.'),
    h('div', { class: 'choices' }, ...[['+3R', 3], ['+2R', 2], ['+1R', 1], ['−1R', -1]].map(([l, v]) => h('button', { type: 'button', class: 'opt small', onclick: () => add(v) }, l))),
    h('div', { class: 'choices' }, h('button', { type: 'button', class: 'opt small', onclick: () => { seq.pop(); draw(); } }, 'Undo'), h('button', { type: 'button', class: 'opt small', onclick: () => { seq.length = 0; draw(); } }, 'Clear')),
    chart, read, h('div', { class: 'choices' }, ...riskChips), out, note());
}

/* ------------------------------------------------------------------ 5.11 compounding against fixed risk */

export function compounding({ onInteract }) {
  let seed = freshSeed();
  let riskPct = 2;
  let sequences = 1;
  const risks = [];
  const shown = new Set([2]);
  const chart = h('div');
  const out = h('div', { class: 'lab-out' });
  const draw = () => {
    const rs = tradeSeries({ seed, n: 80, winRate: 0.5, winR: 1.5, lossR: 1 });
    const pct = equityCurve(rs, { mode: 'percent', riskPct, start: 10000 });
    const fixed = equityCurve(rs, { mode: 'fixed', riskPct, start: 10000 });
    const a = maxDrawdown(pct);
    const b = maxDrawdown(fixed);
    chart.replaceChildren(multiLine([{ label: `${riskPct}% of current balance`, values: pct, color: '#2DD4BF' }, { label: `${riskPct}% of the starting balance, fixed`, values: fixed, color: '#FFC83D' }], { baseline: 10000, fmt: money, hgt: 170 }));
    out.replaceChildren(
      h('div', { class: 'fs-grid' },
        h('div', { class: 'fs-card' }, h('b', null, 'Percent Of Current'), h('strong', null, money(pct[pct.length - 1])), h('span', null, `worst drawdown ${trimN(a.dd * 100, 1)}%`)),
        h('div', { class: 'fs-card' }, h('b', null, 'Fixed Dollars'), h('strong', null, money(fixed[fixed.length - 1])), h('span', null, `worst drawdown ${trimN(b.dd * 100, 1)}%`))),
      h('p', { class: 'lab-teach', html: mdInline('Both use the **same 80 trades**. Risking a percent of the current balance grows faster after wins and shrinks the bets after losses. Fixed dollars do neither. Try a bigger risk and watch the drawdowns.') }));
    emit('sim.run', { sim: 'compounding', riskPct });
    if (shown.size >= 2 && sequences >= 2) onInteract();
  };
  const riskChips = [1, 2, 5, 10].map((v) => chip(`${v}% risk`, v, risks, (x) => { riskPct = x; shown.add(x); draw(); }));
  mark(risks, riskPct);
  const root = h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A method wins 50% of the time, +1.5R on a win and −1R on a loss. The same 80 trades are run two ways.'),
    h('div', { class: 'choices' }, ...riskChips), chart, out,
    h('div', { class: 'qactions' }, button('New Sequence', { variant: 'ghost', onClick: () => { seed = freshSeed(); sequences += 1; draw(); } })), note());
  draw();
  return root;
}

/* ------------------------------------------------------------------ 5.12 the ruin explorer */

export function ruinexplorer({ onInteract }) {
  const WRS = [35, 40, 45, 50, 55, 60];
  const RISKS = [0.5, 1, 2, 5, 10];
  let ruinDD = 0.5;
  let payoff = 1;
  let guess = null;
  const dds = [];
  const pays = [];
  const guesses = [];
  const grid = h('div', { class: 'es-grid ruin' });
  const out = h('div', { class: 'lab-out' });
  const run = button('Run The Simulation', { disabled: true, onClick: () => go() });

  const go = async () => {
    run.disabled = true;
    grid.replaceChildren(h('div', { class: 'es-corner' }, 'Risk ↓  Win rate →'), ...WRS.map((w) => h('div', { class: 'es-h' }, w + '%')));
    const seed = freshSeed();
    const results = {};
    for (const r of RISKS) {
      grid.append(h('div', { class: 'es-h' }, r + '%'));
      for (const w of WRS) {
        await new Promise((res) => setTimeout(res, 0));
        const p = ruinProbability({ seed: `${seed}#${r}#${w}`, winRate: w / 100, winR: payoff, lossR: 1, riskPct: r, trades: 200, ruinDD, runs: 500 });
        results[`${r}|${w}`] = p;
        const tone = p >= 0.5 ? 'neg' : p >= 0.15 ? 'mid' : 'pos';
        grid.append(h('div', { class: 'es-cell ' + tone }, Math.round(p * 100) + '%'));
      }
    }
    const low = results[`1|${payoff === 1 ? 45 : 40}`];
    const high = results[`10|${payoff === 1 ? 45 : 40}`];
    out.replaceChildren(
      h('p', { class: 'lab-result' }, `Each cell is the share of 500 simulated accounts that suffered a ${Math.round(ruinDD * 100)}% drawdown within 200 trades.`),
      h('p', { class: 'lab-teach', html: mdInline(`The same method at **1%** risk had ruined ${Math.round(low * 100)}% of accounts. At **10%** risk, ${Math.round(high * 100)}%. What you risk per trade changes your chance of surviving a bad run, even when the odds per trade are identical.`) }));
    emit('sim.run', { sim: 'ruinexplorer', ruinDD, payoff, guess });
    onInteract();
    run.disabled = false;
  };
  const pickGuess = (v) => { guess = v; run.disabled = false; };
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Ruin must be defined first. Here it means a drawdown of the size you choose. Each cell simulates 500 accounts of 200 trades.'),
    h('div', { class: 'choices' }, chip('Ruin = 30% Drawdown', 0.3, dds, (v) => { ruinDD = v; }), chip('Ruin = 50% Drawdown', 0.5, dds, (v) => { ruinDD = v; })),
    h('div', { class: 'choices' }, chip('Win 1R, Lose 1R', 1, pays, (v) => { payoff = v; }), chip('Win 2R, Lose 1R', 2, pays, (v) => { payoff = v; })),
    h('p', { class: 'lab-q' }, 'A method with the same odds is run at 1% risk per trade and at 10%. Which is likelier to suffer a deep drawdown?'),
    h('div', { class: 'choices' }, chip('1% risk', 'low', guesses, pickGuess), chip('10% risk', 'high', guesses, pickGuess), chip('The same', 'same', guesses, pickGuess)),
    h('div', { class: 'lab-actions' }, run), grid, out, note());
}

/* ------------------------------------------------------------------ 5.13 the expectancy lab */

export function statslab({ onInteract, lessonId = 'l05-expectancy-lab' }) {
  let seed = freshSeed();
  let data = [];
  const inputs = {};
  const out = h('div', { class: 'lab-out' });
  const tbl = h('div', { class: 'sl-table' });
  const fields = h('div', { class: 'pc-form' });
  const STATS = [
    { id: 'wins', label: 'Number Of Winners', dec: 0, get: (s) => s.wins, tol: 0.01 },
    { id: 'wr', label: 'Win Rate', suffix: '%', dec: 1, get: (s) => s.winRate * 100, tol: 0.06 },
    { id: 'avg', label: 'Expectancy (R)', suffix: 'R', dec: 2, neg: true, get: (s) => s.expectancy, tol: 0.01 },
    { id: 'pf', label: 'Profit Factor', dec: 2, get: (s) => s.profitFactor, tol: 0.01 },
    { id: 'dd', label: 'Max Drawdown (R)', suffix: 'R', dec: 2, get: (s) => s.maxDrawdownR, tol: 0.01 },
    { id: 'streak', label: 'Longest Losing Streak', dec: 0, get: (s) => s.streaks.loss, tol: 0.01 }
  ];
  const generate = () => {
    const rng = makeRng('lab#' + seed);
    data = Array.from({ length: 40 }, () => rng.pick([-1, -1, -1, -1, -1, -0.5, 1, 1.5, 2, 2, 3]));
    if (!data.some((x) => x < 0) || !data.some((x) => x > 0)) data[0] = -1;
    tbl.replaceChildren(h('p', { class: 'hint-line' }, 'Forty trades, in order. Any trade within 0.1R of zero would count as breakeven; none here do.'), h('div', { class: 'sl-grid' }, ...data.map((r, i) => h('span', { class: r < 0 ? 'neg' : 'pos' }, `${i + 1}: ${r > 0 ? '+' : '−'}${Math.abs(r)}`))));
    out.replaceChildren();
    STATS.forEach((st) => inputs[st.id].set(null, { silent: true }));
    check.disabled = false;
  };
  STATS.forEach((st) => {
    inputs[st.id] = numInput({ label: st.label, value: null, suffix: st.suffix || '', allowNegative: !!st.neg, max: 8 });
    fields.append(inputs[st.id].el);
  });
  const check = button('Check My Answers', { onClick: () => {
    const truth = C.tradeStats(data);
    let right = 0;
    const rows = STATS.map((st) => {
      const want = st.get(truth);
      const got = inputs[st.id].value;
      const ok = got !== null && Math.abs(got - want) <= st.tol + 1e-9;
      if (ok) right += 1;
      return h('div', { class: 'pc-row' }, h('span', null, st.label), h('b', { class: ok ? 'strong' : 'weak' }, `${ok ? '✓' : '✗'}  the engine says ${trimN(want, st.dec)}${st.suffix || ''}`));
    });
    check.disabled = true;
    out.replaceChildren(h('div', { class: 'pc-rows' }, ...rows), h('p', { class: 'lab-result' }, `${right} of ${STATS.length} match the engine.`), h('p', { class: 'lab-teach', html: mdInline('For a wrong figure, redo it by hand with the **Expectancy Calculator**. The mistakes are usually a forgotten sign, a count that was off by one, or a drawdown taken from the wrong high point.') }));
    emit('question.answer', { qid: 'apply-l05-lab', type: 'stats', kind: 'numeric', concepts: ['expectancy', 'profit-factor', 'drawdown'], score: right / STATS.length, correct: right === STATS.length, errorTags: [], hinted: false, revealed: false, ctx: { kind: 'lesson', ref: lessonId }, homeFor: ['expectancy'] });
    onInteract();
  } });
  const root = h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Work out every statistic for these forty trades, using the calculator tools, then check your answers against the engine.'),
    tbl, fields, h('div', { class: 'lab-actions' }, check), out,
    h('div', { class: 'qactions' }, button('New Data', { variant: 'ghost', onClick: () => { seed = freshSeed(); generate(); } })), note());
  generate();
  return root;
}
