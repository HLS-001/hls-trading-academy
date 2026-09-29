/** Tiny SVG charts for the labs. All colors come from the theme tokens. */

import { h, s } from './dom.js';

const F = 'Manrope, sans-serif';

/** A histogram of counts[0..n]. Bars inside [lo, hi] are gold; a marker shows the mean. */
export function histogram(counts, { lo = null, hi = null, mean = null, w = 340, hgt = 170, xLabel = 'Wins in one run' } = {}) {
  const n = counts.length - 1;
  const padL = 8;
  const padB = 28;
  const top = 14;
  const max = Math.max(...counts, 1);
  const bw = (w - padL - 8) / (n + 1);
  const bars = counts.map((c, i) => {
    const x = padL + i * bw;
    const bh = (hgt - padB - top) * (c / max);
    const inside = lo !== null && i >= lo && i <= hi;
    return s('rect', { class: 'hist-bar', style: `--k:${i}`, x: x + 0.5, y: hgt - padB - bh, width: Math.max(1, bw - 1), height: bh, rx: Math.min(2, bw / 3), fill: inside ? '#FFC83D' : '#2DD4BF', 'fill-opacity': inside ? 0.95 : 0.75 });
  });
  const step = n <= 12 ? 1 : n <= 40 ? 5 : n <= 120 ? 10 : 20;
  const labels = [];
  for (let i = 0; i <= n; i += step) labels.push(s('text', { x: padL + i * bw + bw / 2, y: hgt - 12, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9, 'font-family': F }, String(i)));
  const meanLine = mean === null ? null : s('g', null,
    s('line', { x1: padL + (mean + 0.5) * bw, x2: padL + (mean + 0.5) * bw, y1: top - 4, y2: hgt - padB, stroke: '#FFE8A0', 'stroke-dasharray': '3 3', 'stroke-width': 1.4 }),
    s('text', { x: padL + (mean + 0.5) * bw, y: top - 6, 'text-anchor': 'middle', fill: '#FFE8A0', 'font-size': 9, 'font-weight': 700, 'font-family': F }, 'average'));
  return h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'fig', role: 'img', 'aria-label': 'Histogram of the number of wins in each run' },
    s('line', { x1: padL, x2: w - 8, y1: hgt - padB, y2: hgt - padB, stroke: 'rgba(165,173,214,.35)' }), ...bars, ...labels, meanLine,
    s('text', { x: w / 2, y: hgt - 1, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9, 'font-family': F }, xLabel)));
}

/** A price line that draws itself. path is an array of numbers. */
export function priceLine(path, { w = 340, hgt = 150, animate = true } = {}) {
  const padL = 8;
  const padT = 12;
  const padB = 14;
  const min = Math.min(...path);
  const max = Math.max(...path);
  const span = Math.max(max - min, 2);
  const x = (i) => padL + ((w - padL - 10) * i) / (path.length - 1);
  const y = (v) => padT + (hgt - padT - padB) * (1 - (v - min) / span);
  const d = path.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const up = path[path.length - 1] >= path[0];
  const line = s('path', { d, fill: 'none', stroke: up ? '#2DD4BF' : '#FF5C8A', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: animate ? 'draw-line' : '' });
  const start = s('line', { x1: padL, x2: w - 10, y1: y(path[0]), y2: y(path[0]), stroke: 'rgba(165,173,214,.35)', 'stroke-dasharray': '3 4' });
  const end = s('circle', { cx: x(path.length - 1), cy: y(path[path.length - 1]), r: 3.5, fill: up ? '#2DD4BF' : '#FF5C8A' });
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'fig', role: 'img', 'aria-label': 'Price over time' }, start, line, end);
  if (animate) {
    requestAnimationFrame(() => {
      const len = line.getTotalLength ? line.getTotalLength() : 600;
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      line.getBoundingClientRect();
      line.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)';
      line.style.strokeDashoffset = 0;
    });
  }
  return h('div', { class: 'figure' }, svg);
}

/** Horizontal bars, one per label. rows: [{label, value, note, tone}] */
export function hbars(rows, { max, w = 340 } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return h('div', { class: 'hbars' }, ...rows.map((r) => h('div', { class: 'hbar' }, h('span', { class: 'hb-l' }, r.label), h('i', null, h('u', { style: { width: (100 * r.value) / top + '%' }, class: r.tone || '' })), h('b', null, r.note ?? String(r.value)))));
}
