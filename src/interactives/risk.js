/**
 * Level 10 widgets: the streak ladder (the centrepiece lab), the drawdown distribution (Monte Carlo) and the hidden
 * common exposure across several positions. Numbers come from calc/ and sim/. The course does not prescribe a risk percentage.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, s, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { multiLine } from '../ui/charts.js';
import * as C from '../calc/index.js';
import { monteCarlo, pathFan } from '../sim/monte.js';
import { freshSeed } from '../learn/rng.js';

const F = 'Manrope, sans-serif';
const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');
const mark = (group, v) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
const chip = (label, v, group, onPick) => {
  const b = h('button', { type: 'button', class: 'opt small', 'data-v': String(v), onclick: () => { mark(group, v); onPick(v); } }, label);
  group.push(b);
  return b;
};
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const p1 = (v) => (Math.round(v * 10) / 10).toFixed(1) + '%';

/* ------------------------------------------------------------------ 10.01 and 10.10 the streak ladder */

/** spec.mode: 'intro' (fewer controls) or 'lab' (balance, mode and repeat). */
export function streakladder({ spec, onInteract }) {
  let balance = 10000;
  let risk = 1;
  let mode = 'current';
  let guess = null;
  const ran = new Set();
  const guesses = [];
  const riskChips = [];
  const balChips = [];
  const modeChips = [];
  const stage = h('div');
  const out = h('div', { class: 'lab-out' });
  const run = button('Run The Ladder', { disabled: true, onClick: () => go() });

  const go = () => {
    const rows = C.streakLadder({ balance, riskPct: risk, mode });
    const curve = C.streakLadder({ balance, riskPct: risk, mode, losses: Array.from({ length: 21 }, (_, i) => i) }).map((r) => r.equity);
    stage.replaceChildren(multiLine([{ label: `${risk}% ${mode === 'current' ? 'of the current balance' : 'of the starting balance'}, after each loss`, values: curve, color: '#FFC83D' }], { baseline: balance, fmt: money, hgt: 150 }));
    const mine = C.streakLadder({ balance, riskPct: risk, mode, losses: [guess] })[0];
    out.replaceChildren(
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'stim-table' },
        h('thead', null, h('tr', null, ...['Losses', 'Balance', 'Down', 'To Recover'].map((c) => h('th', null, c)))),
        h('tbody', null, ...rows.map((r) => h('tr', null, h('td', null, String(r.losses)), h('td', null, money(r.equity)), h('td', null, p1(r.drawdownPct)), h('td', null, p1(r.recoveryPct))))))),
      h('p', { class: 'lab-result' }, `You said you would survive ${guess} losses in a row. At ${risk}% risk, that is ${money(mine.equity)}: down ${p1(mine.drawdownPct)}, and it needs a gain of ${p1(mine.recoveryPct)} to get back.`),
      h('p', { class: 'lab-teach', html: mdInline(mode === 'current' ? 'Each loss is a percent of the **current** balance, so the losses shrink as the balance shrinks. The gain needed to recover still grows faster than the fall.' : 'Each loss is the same **dollar** amount, a percent of the STARTING balance. The account falls in a straight line, and can reach zero.') }));
    ran.add(`${risk}|${mode}`);
    emit('sim.run', { sim: 'streakladder', risk, mode, guess });
    if (ran.size >= 3) onInteract();
  };
  const pick = (v) => { guess = +v; run.disabled = false; };
  const controls = [
    h('div', { class: 'lab-row' }, h('span', null, 'Risk Per Trade'), h('div', { class: 'choices' }, ...[0.5, 1, 2, 5, 10].map((v) => chip(`${v}%`, v, riskChips, (x) => { risk = +x; })))),
    spec.mode === 'lab' ? h('div', { class: 'lab-row' }, h('span', null, 'Account'), h('div', { class: 'choices' }, ...[5000, 10000, 25000].map((v) => chip(money(v), v, balChips, (x) => { balance = +x; })))) : null,
    spec.mode === 'lab' ? h('div', { class: 'lab-row' }, h('span', null, 'Risk Is A Percent Of'), h('div', { class: 'choices' }, chip('The Current Balance', 'current', modeChips, (x) => { mode = x; }), chip('The Starting Balance', 'fixed', modeChips, (x) => { mode = x; }))) : null
  ].filter(Boolean);
  mark(riskChips, risk);
  mark(balChips, balance);
  mark(modeChips, mode);
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'An account of $10,000 takes losses one after another, and nothing else. Choose a risk per trade.'),
    ...controls,
    h('p', { class: 'lab-q' }, 'State your answer first: how many losses in a row would you survive before you would stop trading?'),
    h('div', { class: 'choices' }, ...[3, 5, 8, 10, 15, 20].map((v) => chip(String(v), v, guesses, pick))),
    h('div', { class: 'lab-actions' }, run), stage, out, note());
}

/* ------------------------------------------------------------------ 10.11 drawdown distributions */

export function montecarlolab({ onInteract }) {
  let win = 45;
  let pay = 1;
  let risk = 1;
  const seen = new Set();
  const g1 = [];
  const g2 = [];
  const g3 = [];
  const stage = h('div');
  const out = h('div', { class: 'lab-out' });
  const go = () => {
    const seed = freshSeed();
    const args = { seed, winRate: win / 100, winR: pay, lossR: 1, riskPct: risk, trades: 100, runs: 1500 };
    const r = monteCarlo(args);
    const fan = pathFan({ seed, winRate: win / 100, winR: pay, lossR: 1, riskPct: risk, trades: 100, paths: 14 });
    const all = fan.flat();
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const W = 340;
    const Hh = 150;
    const x = (i) => 8 + ((W - 16) * i) / 100;
    const y = (v) => 10 + (Hh - 24) * (1 - (v - lo) / (hi - lo || 1));
    stage.replaceChildren(h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'fig', role: 'img', 'aria-label': 'Fourteen equity paths from the same rules' },
      s('line', { x1: 8, x2: W - 8, y1: y(10000), y2: y(10000), stroke: 'rgba(165,173,214,.4)', 'stroke-dasharray': '3 3' }),
      ...fan.map((p, k) => s('path', { d: p.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' '), fill: 'none', stroke: k % 2 ? '#2DD4BF' : '#FFC83D', 'stroke-width': 1.2, 'stroke-opacity': 0.7 })),
      s('text', { x: 8, y: Hh - 4, fill: 'var(--muted)', 'font-size': 9, 'font-family': F }, '100 trades, same rules, 14 different runs'))));
    out.replaceChildren(
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'stim-table' },
        h('thead', null, h('tr', null, ...['Across 1,500 Runs', 'Lucky 5%', 'Middle', 'Unlucky 5%'].map((c) => h('th', null, c)))),
        h('tbody', null,
          h('tr', null, h('td', null, 'Worst Drawdown'), h('td', null, p1(r.drawdown.p5 * 100)), h('td', null, p1(r.drawdown.p50 * 100)), h('td', null, p1(r.drawdown.p95 * 100))),
          h('tr', null, h('td', null, 'Longest Losing Streak'), h('td', null, String(r.streak.p5)), h('td', null, String(r.streak.p50)), h('td', null, String(r.streak.p95))),
          h('tr', null, h('td', null, 'Ending Balance'), h('td', null, money(r.ending.p95)), h('td', null, money(r.ending.p50)), h('td', null, money(r.ending.p5)))))),
      h('p', { class: 'lab-teach', html: mdInline(`The same rules gave very different runs. In the unlucky 5%, the worst drawdown reached **${p1(r.drawdown.p95 * 100)}** and the longest losing streak was **${r.streak.p95}**. Plan for the unlucky end, not the middle. This assumes the win rate and payoff are TRUE. Your real ones are estimates.`) }));
    seen.add(`${win}|${pay}|${risk}`);
    emit('sim.run', { sim: 'montecarlo', win, pay, risk });
    if (seen.size >= 3) onInteract();
  };
  const controls = h('div', { class: 'lab-controls' },
    h('div', { class: 'lab-row' }, h('span', null, 'Win Rate'), h('div', { class: 'choices' }, ...[35, 45, 50, 55].map((v) => chip(`${v}%`, v, g1, (x) => { win = +x; go(); })))),
    h('div', { class: 'lab-row' }, h('span', null, 'Win Size'), h('div', { class: 'choices' }, chip('1R', 1, g2, (x) => { pay = +x; go(); }), chip('2R', 2, g2, (x) => { pay = +x; go(); }))),
    h('div', { class: 'lab-row' }, h('span', null, 'Risk Per Trade'), h('div', { class: 'choices' }, ...[0.5, 1, 2, 5].map((v) => chip(`${v}%`, v, g3, (x) => { risk = +x; go(); })))));
  mark(g1, win);
  mark(g2, pay);
  mark(g3, risk);
  go();
  return h('div', { class: 'lab' }, h('p', { class: 'lab-intro' }, 'One hundred trades from the same rules, run 1,500 times. Loss size is always 1R. Change the rules and watch the spread of results.'), controls, stage, out, note());
}

/* ------------------------------------------------------------------ 10.07 the hidden common exposure */

const PRICE = { EURUSD: 1.1, GBPUSD: 1.3, AUDUSD: 0.66, USDJPY: 150, USDCHF: 0.89, EURJPY: 163, GBPJPY: 190, AUDJPY: 100, EURGBP: 0.85 };
const USD_EQ = { USD: 1, EUR: 1.1, GBP: 1.3, AUD: 0.66, JPY: 1 / 150, CHF: 1.12 };
const SCENARIOS = [
  { id: 'A', label: 'Set A', positions: [['EURUSD', 1, 1], ['GBPUSD', 1, 1], ['AUDUSD', 1, 1], ['USDJPY', -1, 1]] },
  { id: 'B', label: 'Set B', positions: [['EURJPY', -1, 1], ['GBPJPY', -1, 1], ['USDJPY', -1, 1]] },
  { id: 'C', label: 'Set C', positions: [['USDJPY', 1, 1], ['USDCHF', 1, 1], ['EURUSD', -1, 1], ['GBPUSD', -1, 1]] }
];

export function exposurelab({ onInteract }) {
  const seen = new Set();
  const group = [];
  const guessGroup = [];
  const list = h('div');
  const out = h('div', { class: 'lab-out' });
  let cur = SCENARIOS[0];
  let guess = null;
  const show = () => {
    const pos = cur.positions.map(([symbol, dir, lots]) => ({ symbol, dir, lots, price: PRICE[symbol] }));
    list.replaceChildren(h('div', { class: 'tbl-wrap' }, h('table', { class: 'stim-table' },
      h('thead', null, h('tr', null, ...['Pair', 'Direction', 'Lots'].map((c) => h('th', null, c)))),
      h('tbody', null, ...cur.positions.map(([sym, dir, lots]) => h('tr', null, h('td', null, sym.slice(0, 3) + '/' + sym.slice(3)), h('td', null, dir > 0 ? 'Long' : 'Short'), h('td', null, lots.toFixed(2))))))));
    guess = null;
    mark(guessGroup, '');
    out.replaceChildren();
    reveal.disabled = true;
    return pos;
  };
  const reveal = button('Show The Exposure By Currency', { disabled: true, onClick: () => {
    const pos = cur.positions.map(([symbol, dir, lots]) => ({ symbol, dir, lots, price: PRICE[symbol] }));
    const ex = C.currencyExposure(pos);
    const rows = Object.entries(ex).map(([ccy, units]) => ({ ccy, usd: units * (USD_EQ[ccy] || 1) })).sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd));
    const top = rows[0];
    const max = Math.abs(top.usd);
    out.replaceChildren(
      h('div', { class: 'fig-bars' }, ...rows.map((r) => h('div', { class: 'hbar-row' }, h('span', null, r.ccy), h('div', { class: 'hbar' }, h('i', { style: { width: (Math.abs(r.usd) / max) * 100 + '%', background: r.usd < 0 ? 'var(--gold-lo)' : 'var(--teal)' } })), h('b', null, (r.usd < 0 ? '−' : '+') + money(Math.abs(r.usd)))))),
      h('p', { class: 'lab-result' }, `${cur.positions.length} positions in ${cur.positions.length} pairs, but the biggest exposure is ${top.usd < 0 ? 'SHORT' : 'LONG'} ${top.ccy}, about ${money(Math.abs(top.usd))} in dollar terms. ${guess === top.ccy ? 'You found it.' : `You chose ${guess}.`}`),
      h('p', { class: 'lab-teach', html: mdInline('Positions in different pairs can be **one bet** on a single currency. Exposure is counted **by currency**, across every position. Relationships between currencies are not fixed, so use this as a count of what you hold, not a forecast.') }));
    seen.add(cur.id);
    emit('sim.run', { sim: 'exposure', set: cur.id, guess });
    if (seen.size >= 2) onInteract();
  } });
  const pick = (v) => { guess = v; reveal.disabled = false; };
  const row = h('div', { class: 'choices' }, ...SCENARIOS.map((sc) => chip(sc.label, sc.id, group, (id) => { cur = SCENARIOS.find((x) => x.id === id); show(); })));
  const guessRow = h('div', { class: 'choices' }, ...['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CHF'].map((c) => chip(c, c, guessGroup, pick)));
  show();
  mark(group, 'A');
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A few open positions in different pairs. Look for the exposure they share.'),
    row, list, h('p', { class: 'lab-q' }, 'Which currency is the largest net exposure across all of them?'), guessRow, h('div', { class: 'lab-actions' }, reveal), out, note());
}
