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

/**
 * A static candlestick chart for lessons and simulations. (The interactive chart engine is separate.)
 *   candles: [{ o, h, l, c }]   lines: [{ price, label, tone }]   marks: [{ i, price, label }]
 */
export function candleChart(candles, { lines = [], marks = [], w = 340, hgt = 190, dq = 5, showAxis = true } = {}) {
  const padL = 6;
  const padR = showAxis ? 46 : 8;
  const padT = 12;
  const padB = 12;
  const prices = [...candles.flatMap((c) => [c.h, c.l]), ...lines.map((l) => l.price)];
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const span = max - min || 1e-4;
  const y = (v) => padT + (hgt - padT - padB) * (1 - (v - min) / span);
  const step = (w - padL - padR) / Math.max(1, candles.length);
  const bw = Math.max(2, Math.min(14, step * 0.62));
  const x = (i) => padL + step * (i + 0.5);
  const tone = { stop: '#FFC83D', target: '#2DD4BF', entry: '#A78BFA', level: '#38BDF8' };
  const body = candles.map((c, i) => {
    const up = c.c >= c.o;
    const col = up ? '#2DD4BF' : '#FF5C8A';
    const top = y(Math.max(c.o, c.c));
    const bot = y(Math.min(c.o, c.c));
    return s('g', null,
      s('line', { x1: x(i), x2: x(i), y1: y(c.h), y2: y(c.l), stroke: col, 'stroke-width': 1.4 }),
      s('rect', { x: x(i) - bw / 2, y: top, width: bw, height: Math.max(1.5, bot - top), rx: 1.2, fill: col, 'fill-opacity': up ? 0.95 : 0.9 }));
  });
  const lineEls = lines.map((l) => s('g', null,
    s('line', { x1: padL, x2: w - padR, y1: y(l.price), y2: y(l.price), stroke: tone[l.tone] || '#FFE8A0', 'stroke-dasharray': '4 4', 'stroke-width': 1.2 }),
    s('text', { x: w - padR + 3, y: y(l.price) + 3, fill: tone[l.tone] || '#FFE8A0', 'font-size': 8.5, 'font-weight': 700, 'font-family': F }, l.label)));
  const markEls = marks.map((m) => s('g', null,
    s('circle', { cx: x(m.i), cy: y(m.price), r: 4, fill: '#FFE8A0', stroke: '#070B1C', 'stroke-width': 1 }),
    s('text', { x: x(m.i), y: y(m.price) - 8, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 8.5, 'font-weight': 700, 'font-family': F }, m.label)));
  const axis = showAxis ? [min, (min + max) / 2, max].filter((v) => lines.every((l) => Math.abs(y(l.price) - y(v)) > 11)).map((v) => s('text', { x: w - padR + 3, y: y(v) + 3, fill: 'var(--muted)', 'font-size': 8, 'font-family': F }, v.toFixed(dq))) : [];
  return h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'fig', role: 'img', 'aria-label': 'Candlestick chart' }, ...body, ...lineEls, ...markEls, ...axis));
}

/**
 * Several lines on one set of axes. series: [{ label, values, color }]. Values share one scale.
 * A baseline can be drawn (for example the starting balance). Colours default to the theme's jewel colours.
 */
export function multiLine(series, { w = 340, hgt = 170, baseline = null, fmt = (v) => String(Math.round(v)), padR = 44 } = {}) {
  const padL = 6;
  const padT = 12;
  const padB = 16;
  const all = series.flatMap((x) => x.values).concat(baseline === null ? [] : [baseline]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = Math.max(...series.map((x) => x.values.length));
  const x = (i) => padL + ((w - padL - padR) * i) / Math.max(1, n - 1);
  const y = (v) => padT + (hgt - padT - padB) * (1 - (v - min) / span);
  const colors = ['#2DD4BF', '#FFC83D', '#A78BFA', '#38BDF8'];
  const paths = series.map((sr, k) => s('path', { d: sr.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' '), fill: 'none', stroke: sr.color || colors[k % colors.length], 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
  const base = baseline === null ? null : s('line', { x1: padL, x2: w - padR, y1: y(baseline), y2: y(baseline), stroke: 'rgba(165,173,214,.4)', 'stroke-dasharray': '3 4' });
  const ends = series.map((sr, k) => s('text', { x: w - padR + 3, y: y(sr.values[sr.values.length - 1]) + 3, fill: sr.color || colors[k % colors.length], 'font-size': 8.5, 'font-weight': 700, 'font-family': F }, fmt(sr.values[sr.values.length - 1])));
  return h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'fig', role: 'img', 'aria-label': 'Lines over time' }, base, ...paths, ...ends),
    h('div', { class: 'chart-key' }, ...series.map((sr, k) => h('span', { style: { '--c': sr.color || colors[k % colors.length] }, class: 'k-line' }, sr.label))));
}

/** Bars up and down from zero, one per result. values: numbers. */
export function resultBars(values, { w = 340, hgt = 130, highlight = -1, label = (v) => (v > 0 ? '+' : '') + v } = {}) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const mid = hgt / 2;
  const bw = (w - 12) / values.length;
  const bars = values.map((v, i) => {
    const hh = (Math.abs(v) / max) * (mid - 16);
    return s('g', null,
      s('rect', { x: 6 + i * bw + 2, y: v >= 0 ? mid - hh : mid, width: Math.max(3, bw - 4), height: Math.max(1.5, hh), rx: 2, fill: i === highlight ? '#FFC83D' : v >= 0 ? '#2DD4BF' : '#FF5C8A', 'fill-opacity': i === highlight ? 1 : 0.85 }),
      values.length <= 14 ? s('text', { x: 6 + i * bw + bw / 2, y: v >= 0 ? mid - hh - 3 : mid + hh + 10, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 8, 'font-family': F }, label(v)) : null);
  });
  return h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'fig', role: 'img', 'aria-label': 'Trade results in R' }, s('line', { x1: 4, x2: w - 4, y1: mid, y2: mid, stroke: 'rgba(165,173,214,.4)' }), ...bars));
}

/** Horizontal bars, one per label. rows: [{label, value, note, tone}] */
export function hbars(rows, { max, w = 340 } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return h('div', { class: 'hbars' }, ...rows.map((r) => h('div', { class: 'hbar' }, h('span', { class: 'hb-l' }, r.label), h('i', null, h('u', { style: { width: (100 * r.value) / top + '%' }, class: r.tone || '' })), h('b', null, r.note ?? String(r.value)))));
}
