/** What is shown above a question: a scenario in words, or a simulation result to read. */

import { h, s, mdInline } from '../ui/dom.js';
import { simulateTraders } from '../sim/prob.js';
import { chartView } from '../ui/chartview.js';
import { makeChart } from '../charts/synth.js';
import { swings, structural } from '../charts/detect.js';

export function streakChart({ seed, winRate, trades, traders }) {
  const data = simulateTraders({ seed, winRate, trades, traders });
  const maxStreak = Math.max(...data.map((d) => d.longestLoss));
  const maxTotal = Math.max(...data.map((d) => Math.abs(d.total)), 1);
  const W = 340;
  const H = 168;
  const padL = 26;
  const padB = 22;
  const top = 16;
  const bw = (W - padL - 6) / data.length;
  const scaleY = (v) => (H - padB - top) * (v / Math.max(maxStreak, 10));
  const bars = data.map((d, i) => {
    const x = padL + i * bw + 2;
    const hgt = scaleY(d.longestLoss);
    const isMax = d.longestLoss === maxStreak;
    return s('g', null,
      s('rect', { x, y: H - padB - hgt, width: bw - 4, height: hgt, rx: 2.5, fill: isMax ? '#FFC83D' : '#2DD4BF', 'fill-opacity': isMax ? 1 : 0.85 }),
      s('text', { x: x + (bw - 4) / 2, y: H - 7, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 7.5, 'font-family': 'Manrope, sans-serif' }, String(i + 1)),
      isMax ? s('text', { x: x + (bw - 4) / 2, y: H - padB - hgt - 4, 'text-anchor': 'middle', fill: '#FFE8A0', 'font-size': 9, 'font-weight': 800, 'font-family': 'Manrope, sans-serif' }, String(d.longestLoss)) : null);
  });
  const ticks = [0, 5, 10, 15].filter((t) => t <= Math.max(maxStreak, 10)).map((t) => s('g', null,
    s('line', { x1: padL, x2: W - 4, y1: H - padB - scaleY(t), y2: H - padB - scaleY(t), stroke: 'rgba(165,173,214,.18)' }),
    s('text', { x: padL - 4, y: H - padB - scaleY(t) + 3, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 8, 'font-family': 'Manrope, sans-serif' }, String(t))));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig', role: 'img', 'aria-label': `Longest losing streak for each of ${traders} traders` }, ...ticks, ...bars);
  const best = data.reduce((a, d) => (d.total > a.total ? d : a), data[0]);
  const worst = data.reduce((a, d) => (d.total < a.total ? d : a), data[0]);
  return h('div', { class: 'stim sim' },
    h('div', { class: 'stim-title' }, `${traders} traders. Same rules. ${Math.round(winRate * 100)}% win rate. ${trades} trades each.`),
    h('div', { class: 'stim-sub' }, 'Bars show each trader\'s longest run of losses in a row.'),
    svg,
    h('div', { class: 'stim-foot' }, `Ending totals (wins minus losses) range from ${worst.total} to +${best.total}.`));
}

/** A small table shown above a question: quotes, a trade log, a calendar, a supplied result. */
export function tableStim({ title, sub, head = [], rows = [], foot, tag = 'Data', note, text = false }) {
  return h('div', { class: 'stim tablestim' },
    h('div', { class: 'stim-tag' }, tag),
    title ? h('div', { class: 'stim-title' }, title) : null,
    sub ? h('div', { class: 'stim-sub' }, sub) : null,
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'stim-table' + (text ? ' text' : '') },
      head.length ? h('thead', null, h('tr', null, ...head.map((c) => h('th', null, String(c))))) : null,
      h('tbody', null, ...rows.map((r) => h('tr', null, ...r.map((c) => h('td', { html: mdInline(String(c)) }))))))),
    foot ? h('div', { class: 'stim-foot' }, foot) : null,
    note ? h('div', { class: 'stim-foot' }, note) : null);
}

/** A vertical price ladder: the market (bid and ask) and any marked levels, highest price at the top. */
export function ladderStim({ pair, bid, ask, dq = 5, levels = [], title }) {
  const rows = [
    { price: ask, label: 'Ask · buy price', tone: 'ask' },
    { price: bid, label: 'Bid · sell price', tone: 'bid' },
    ...levels.map((l) => ({ price: l.price, label: l.label, tone: l.tone || 'level' }))
  ].sort((a, b) => b.price - a.price);
  return h('div', { class: 'stim ladder' },
    h('div', { class: 'stim-tag' }, 'The Market'),
    title ? h('div', { class: 'stim-title' }, title) : null,
    h('div', { class: 'ladder-rows' }, ...rows.map((r) => h('div', { class: 'ladder-row ' + r.tone }, h('b', null, Number(r.price).toFixed(dq)), h('span', null, r.label)))));
}

/**
 * A supplied chart to read: { kind: 'chart', recipe, seed, n, order, trim, marks: 'swings' | 'none', caption }.
 * The chart is made from the seed, so a written answer about it can be read against the same chart by the mentor.
 */
export function chartStim({ recipe, seed, n = 2, order = 1, trim = 0, marks = 'swings', caption }) {
  const made = makeChart(recipe, seed, { n, order });
  const upto = made.candles.length - 1 - trim;
  const cs = made.candles.slice(0, upto + 1);
  let list = swings(made.candles, n, upto);
  if (order === 2) list = structural(list);
  const view = chartView({ candles: cs, height: 220, points: marks === 'swings' ? list.map((x) => ({ i: x.i, kind: x.type, label: x.type === 'high' ? 'H' : 'L' })) : [] });
  return h('div', { class: 'stim chartstim' },
    h('div', { class: 'stim-tag' }, 'The Chart'),
    caption ? h('div', { class: 'stim-sub' }, caption) : null,
    view.el,
    h('div', { class: 'stim-foot' }, marks === 'swings' ? `H and L mark the confirmed ${order === 2 ? 'structural ' : ''}swing highs and lows (size ${n}). The latest bars are not confirmed.` : 'No swings are marked.'));
}

export function stimulusNode(stim) {
  if (!stim) return null;
  if (stim.kind === 'table') return tableStim(stim);
  if (stim.kind === 'ladder') return ladderStim(stim);
  if (stim.kind === 'text') return h('div', { class: 'stim scenario' }, h('div', { class: 'stim-tag' }, 'Scenario'), h('p', { html: mdInline(stim.text) }));
  if (stim.kind === 'streaksim') return streakChart(stim);
  if (stim.kind === 'chart') return chartStim(stim);
  return null;
}
