/**
 * Level 13 labs that show what chance and assumptions do to evidence: the Randomness Lab, the Noise Mine, the Fill Assumptions lab,
 * the analytics on a supplied sample journal, and the journal audit exercise.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { h } from '../ui/dom.js';
import { button, chip } from '../ui/kit.js';
import { barsSvg } from '../ui/minichart.js';
import { randomTraders, noiseMine, noiseMineRepeat } from '../sim/noise.js';
import { btSeries, scanSetups, BT } from '../sim/backtest.js';
import { makeRng } from '../learn/rng.js';
import { analyticsPanel } from './analytics.js';
import { auditTrade, auditPassed, SESSION_LABEL } from '../learn/journal.js';

const R2 = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'R';
const choiceRow = (items, current, onPick) => h('div', { class: 'choices wrap' }, ...items.map(([v, label]) => h('button', { type: 'button', class: 'opt small' + (current === v ? ' sel' : ''), 'data-v': String(v), onclick: (e) => { e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); onPick(v); } }, label)));

/* ---------------------------------------------------------------------- Randomness Lab (13.02) */

export function randomlab({ onInteract } = {}) {
  let trades = 50;
  let guess = null;
  let seed = 1;
  let runs = 0;
  const out = h('div', { class: 'lab-out' });
  const run = () => {
    runs += 1;
    const r = randomTraders({ seed: seed + runs * 7, traders: 100, trades, winRate: 0.5, winR: 1, lossR: 1 });
    const step = trades <= 50 ? 4 : trades <= 100 ? 6 : 8;
    const lo = Math.floor(Math.min(...r.traders.map((x) => x.total)) / step) * step;
    const hi = Math.ceil(Math.max(...r.traders.map((x) => x.total)) / step) * step;
    const bins = [];
    for (let b = lo; b < hi; b += step) bins.push({ from: b, label: String(b), n: 0, color: b + step <= 0 ? '#FF5C8A' : '#2DD4BF' });
    for (const x of r.traders) bins[Math.min(bins.length - 1, Math.floor((x.total - lo) / step))].n += 1;
    out.replaceChildren(...[
      h('div', { class: 'lab-kpi' }, kpi('Finished Ahead', `${r.profitable} of 100`), kpi('Look "Significant"', `${r.significant} of 100`), kpi('Best And Worst', `${R2(r.best.total)} / ${R2(r.worst.total)}`)),
      barsSvg({ bins, label: 'Total R of 100 traders who all flip a fair coin' }),
      h('p', { class: 'hint-line' }, `Each bar counts traders by their total R after ${trades} trades. Every one of them had exactly the same fair rules and no edge.`),
      guess ? h('p', null, `You guessed: ${guess}. The count that finished ahead was ${r.profitable}.`) : null,
      h('p', null, `The best trader made ${R2(r.best.total)} with an interval from ${R2(r.best.lo)} to ${R2(r.best.hi)} per trade. ${r.best.looksGood ? 'Their interval is above zero. They look skilled, and they are not.' : 'Even the best has an interval that includes zero.'}`),
      h('p', null, 'Pick the best of many traders and you will always find one who looks good. That is what chance does.')].filter(Boolean));
    if (runs >= 2 && onInteract) onInteract();
  };
  const kpi = (l, v) => h('div', { class: 'an-stat' }, h('span', { class: 'an-l' }, l), h('b', { class: 'an-v' }, v));
  const root = h('div', { class: 'lab randomlab' },
    h('p', { class: 'lab-intro' }, 'One hundred traders each flip a fair coin for every trade: +1R on heads, −1R on tails. Nobody has an edge. First guess how many will finish ahead.'),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Your Guess'), choiceRow([['fewer than 20', 'Under 20'], ['20 to 40', '20 To 40'], ['40 to 60', '40 To 60'], ['more than 60', 'Over 60']], null, (v) => { guess = v; })),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Trades Per Trader'), choiceRow([[25, '25'], [50, '50'], [100, '100'], [200, '200']], 50, (v) => { trades = v; })),
    h('div', { class: 'qactions' }, button('Run The 100 Traders', { onClick: run })),
    out);
  root.__run = run;
  return root;
}

/* ---------------------------------------------------------------------- Noise Mine (13.05) */

const ruleText = (r) => `${r.mode === 'trend' ? 'Go with' : 'Fade'} a close that breaks the last ${r.look} closes, hold ${r.hold} bars`;

export function noisemine({ onInteract } = {}) {
  let rules = 30;
  let seed = 3;
  let mined = null;
  const out = h('div', { class: 'lab-out' });
  const draw = (stage) => {
    if (!mined) return out.replaceChildren();
    const b = mined.best;
    const parts = [
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Best Rule In The Noise'),
        b ? h('div', null, h('p', null, ruleText(b.rule) + '.'), h('p', { class: 'an-big' }, `In the data it was mined from: ${R2(b.isAvg)} per trade over ${b.isTrades} trades.`), h('p', { class: 'hint-line' }, `Best of ${mined.tested} rules tried. The data is a random walk: it has no pattern in it.`)) : h('p', null, 'No rule took enough trades. Try again.'))];
    if (stage >= 1 && b) parts.push(h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Same Rule On New Data'), h('p', { class: 'an-big' }, `${R2(b.oosAvg)} per trade over ${b.oosTrades} trades.`), h('p', null, 'New random data, not used in the search. The rule has no reason to work here, and it usually does not.')));
    if (stage >= 2) {
      const rep = noiseMineRepeat({ seed, rules, runs: 40 });
      parts.push(h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Forty Repeats'), h('p', null, `The best of ${rules} rules looked good in the search data (at least +0.2R per trade) in ${rep.looksGood} of ${rep.runs} runs. On new data it did so in ${rep.oosGood}.`), h('p', null, `On average, the winner scored ${R2(rep.meanIs)} in-sample and ${R2(rep.meanOos)} on new data.`)));
      if (onInteract) onInteract();
    }
    out.replaceChildren(...parts);
  };
  let stage = 0;
  const mine = () => { seed += 1; mined = noiseMine({ seed, rules, bars: 400 }); stage = 0; draw(0); };
  const root = h('div', { class: 'lab noisemine' },
    h('p', { class: 'lab-intro' }, 'The data is random. The Mine tries many simple rules on it and keeps the best. Then it tests that rule on new random data.'),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'How Many Rules To Try'), choiceRow([[5, '5'], [30, '30'], [96, '96']], 30, (v) => { rules = v; })),
    h('div', { class: 'qactions' }, button('Mine The Noise', { onClick: mine }), button('Test On New Data', { variant: 'ghost', onClick: () => { if (mined) { stage = Math.max(stage, 1); draw(stage); } } }), button('Repeat Forty Times', { variant: 'ghost', onClick: () => { if (mined) { stage = 2; draw(2); } } })),
    out);
  root.__mine = mine;
  root.__stage = (n) => { stage = n; draw(n); };
  return root;
}

/* ---------------------------------------------------------------------- Fill assumptions (13.07) */

const CASES = [
  ['Touch Fills, No Spread', { noSpread: true, sameCandle: 'target' }, 'The chart price is treated as the price you get. Spread is ignored, and a candle that reaches both stop and target takes the target.'],
  ['Spread Included', { sameCandle: 'target' }, 'You buy at the ask, which is the chart price plus the spread. The same-candle rule still favours the target.'],
  ['Spread And Slippage', { slip: 0.5, sameCandle: 'target' }, 'Half a pip of slippage on every entry as well.'],
  ['Conservative', { slip: 0.5, sameCandle: 'stop' }, 'Spread, slippage, and when a candle reaches both stop and target the stop is taken first. This is the rule used in the Backtest Lab.']
];

export function costslab({ onInteract } = {}) {
  const out = h('div', { class: 'lab-out' });
  const run = () => {
    const bars = btSeries(2);
    const to = BT.isBars + BT.oosBars - 1;
    const rows = CASES.map(([name, opt, why]) => {
      const ev = scanSetups(bars, 0, to, opt).filter((e) => e.status === 'valid');
      const total = ev.reduce((a, e) => a + e.r, 0);
      return { name, why, n: ev.length, total, avg: ev.length ? total / ev.length : 0 };
    });
    out.replaceChildren(
      h('table', { class: 'stim-table' }, h('thead', null, h('tr', null, ...['Assumption', 'Trades', 'Total R', 'Average R'].map((x) => h('th', null, x)))), h('tbody', null, ...rows.map((r) => h('tr', null, h('td', null, r.name), h('td', null, String(r.n)), h('td', null, R2(r.total)), h('td', null, R2(r.avg)))))),
      ...rows.map((r) => h('p', { class: 'hint-line' }, `${r.name}: ${r.why}`)),
      h('p', null, `The same rule on the same bars: ${R2(rows[0].avg)} per trade under the kindest assumptions, ${R2(rows[3].avg)} under the conservative ones. The difference is all assumption.`));
    if (onInteract) onInteract();
  };
  const root = h('div', { class: 'lab costslab' },
    h('p', { class: 'lab-intro' }, 'One rule, one set of bars, four sets of assumptions about fills. Guess how much the average R will change, then run them.'),
    h('div', { class: 'qactions' }, button('Run All Four', { onClick: run })), out);
  root.__run = run;
  return root;
}

/* ---------------------------------------------------------------------- sample journal analytics (13.10) */

/** A made-up journal of 60 trades. Small positive average, wide spread, so the interval includes zero. */
export function sampleJournal(n = 60, seed = 9) {
  const rng = makeRng(seed);
  const sessions = ['london', 'newyork', 'tokyo'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const win = rng.next() < 0.42;
    const r = win ? Math.round((1.4 + rng.next() * 1.8) * 100) / 100 : Math.round((-0.6 - rng.next() * 0.55) * 100) / 100;
    const day = 1 + Math.floor(i / 3);
    out.push({ id: 's' + i, r, date: `2026-02-${String(Math.min(28, day)).padStart(2, '0')}`, time: `${String(7 + (i % 9)).padStart(2, '0')}:00`, market: 'EURUSD', direction: rng.next() < 0.55 ? 'long' : 'short', session: sessions[i % 3], setup: i % 4 === 0 ? 'Retest' : 'Breakout', source: 'backtest' });
  }
  return out;
}

export function statslab13({ onInteract } = {}) {
  const panel = analyticsPanel({ trades: sampleJournal() });
  let clicks = 0;
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.an-filter .opt')) {
      clicks += 1;
      if (clicks >= 4 && onInteract) onInteract();
    }
  });
  const root = h('div', { class: 'lab statslab13' }, panel);
  return root;
}

/* ---------------------------------------------------------------------- journal audit exercise (13.09) */

const FLAWED = {
  id: 'audit1', source: 'demo', date: '2026-03-10', time: '14:30', market: 'EURUSD', direction: 'long', session: 'tokyo', setup: 'Retest', entry: 1.085, stop: 1.09, target: 1.1, exit: 1.0935, lots: 0.2, riskMoney: 50, riskPct: 0.5, resultR: 2.5,
  reason: 'Retest of the broken level held', violations: 'none', disconfirming: 'A UK release due in three hours', screenshot: true
};
const FIX = { stop: 1.08, riskMoney: 100, resultR: 1.7, session: 'newyork' };

export function journalaudit({ onInteract } = {}) {
  const t = { ...FLAWED };
  const host = h('div', { class: 'card rp-checks' });
  const inputs = {};
  const draw = () => {
    const a = auditTrade(t, { riskCap: 1 });
    host.replaceChildren(h('div', { class: 'card-title' }, 'Accuracy Audit'), ...a.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.text))));
    if (auditPassed(a) && onInteract) onInteract();
  };
  const num = (key, label) => {
    const inp = h('input', { type: 'text', inputmode: 'decimal', class: 'jf-in', 'aria-label': label });
    inp.value = String(t[key]);
    inp.addEventListener('input', () => { const v = parseFloat(inp.value.replace(',', '.')); if (!Number.isNaN(v)) { t[key] = v; draw(); } });
    inputs[key] = inp;
    return h('label', { class: 'jf' }, h('span', { class: 'jf-l' }, label), inp);
  };
  const sess = h('div', { class: 'choices wrap' }, ...['tokyo', 'frankfurt', 'london', 'newyork'].map((k) => h('button', { type: 'button', class: 'opt small' + (t.session === k ? ' sel' : ''), 'data-v': k, onclick: () => { t.session = k; sess.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x.dataset.v === k)); draw(); } }, SESSION_LABEL[k])));
  const root = h('div', { class: 'lab journalaudit' },
    h('p', { class: 'lab-intro' }, 'A journal entry with four mistakes in it. The audit shows what does not agree. Fix the record until every check passes. The broker ticket: EUR/USD long, 0.20 lots, entered 1.0850 at 14:30 UTC on 10 March 2026, exited 1.0935, with the stop at 1.0800.'),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Entry'), num('stop', 'Stop-Loss'), num('riskMoney', 'Money At Risk'), num('resultR', 'Result In R'), h('div', { class: 'jf' }, h('span', { class: 'jf-l' }, 'Session'), sess)),
    host);
  draw();
  root.__fixAll = () => {
    Object.assign(t, FIX);
    for (const k of ['stop', 'riskMoney', 'resultR']) inputs[k].value = String(FIX[k]);
    sess.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x.dataset.v === FIX.session));
    draw();
  };
  return root;
}
