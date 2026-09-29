/** What is shown above a question: a scenario in words, or a simulation result to read. */

import { h, s, mdInline } from '../ui/dom.js';
import { simulateTraders } from '../sim/prob.js';

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

export function stimulusNode(stim) {
  if (!stim) return null;
  if (stim.kind === 'text') return h('div', { class: 'stim scenario' }, h('div', { class: 'stim-tag' }, 'Scenario'), h('p', { html: mdInline(stim.text) }));
  if (stim.kind === 'streaksim') return streakChart(stim);
  return null;
}
