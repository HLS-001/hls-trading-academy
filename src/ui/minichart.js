/**
 * Small SVG charts for the evidence labs: candles that reveal up to a bar, an equity curve with a band, and a bar chart.
 * Colours follow the app palette. A loss is pink, never an alarm red.
 */

const UP = '#2DD4BF';
const DOWN = '#FF5C8A';
const GOLD = '#FFC83D';
const SKY = '#38BDF8';
const F = 'Manrope, system-ui, sans-serif';
const NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  for (const k of kids) if (k != null) n.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return n;
};
const svgRoot = (w, h, label) => el('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img', 'aria-label': label, class: 'mini-svg' });

/**
 * Candles from bar `from` to bar `upto` (inclusive). Bars are { o, h, l, c } in any unit.
 *   lines  [{ y, label, color, dash }]   horizontal lines (a level, a stop, a target)
 *   marks  [{ i, label, color }]          a small flag above a bar
 *   shade  [{ from, to }]                 bar ranges to tint (for example a trade that is open)
 */
export function candlesSvg({ bars, from = 0, upto, lines = [], marks = [], shade = [], height = 230, fmt = (v) => v.toFixed(1), label = 'Price chart', labelMark = true }) {
  const W = 360;
  const PADL = 46;
  const PADR = 8;
  const PADT = 14;
  const PADB = 18;
  const vis = bars.slice(from, upto + 1);
  const svg = svgRoot(W, height, label);
  if (!vis.length) return svg;
  let lo = Math.min(...vis.map((b) => b.l), ...lines.map((l) => l.y));
  let hi = Math.max(...vis.map((b) => b.h), ...lines.map((l) => l.y));
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad;
  hi += pad;
  const n = vis.length;
  const pitch = (W - PADL - PADR) / 60;
  const x = (i) => PADL + (i - from + 0.5) * pitch;
  const y = (v) => PADT + ((hi - v) / (hi - lo)) * (height - PADT - PADB);
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = lo + ((hi - lo) * t) / ticks;
    svg.append(el('line', { x1: PADL, x2: W - PADR, y1: y(v), y2: y(v), stroke: 'rgba(165,173,214,.12)', 'stroke-width': 1 }), el('text', { x: PADL - 4, y: y(v) + 3, 'text-anchor': 'end', fill: 'var(--muted, #9aa3c7)', 'font-size': 9, 'font-family': F }, fmt(v)));
  }
  for (const s of shade) {
    const a = Math.max(s.from, from);
    const b = Math.min(s.to, upto);
    if (b >= a) svg.append(el('rect', { x: x(a) - pitch / 2, y: PADT, width: (b - a + 1) * pitch, height: height - PADT - PADB, fill: 'rgba(56,189,248,.08)' }));
  }
  vis.forEach((b, k) => {
    const i = from + k;
    const up = b.c >= b.o;
    const col = up ? UP : DOWN;
    const top = y(Math.max(b.o, b.c));
    const bot = y(Math.min(b.o, b.c));
    svg.append(el('line', { x1: x(i), x2: x(i), y1: y(b.h), y2: y(b.l), stroke: col, 'stroke-width': 1 }), el('rect', { x: x(i) - pitch * 0.32, y: top, width: pitch * 0.64, height: Math.max(1.2, bot - top), fill: col }));
  });
  for (const l of lines) {
    if (l.y < lo || l.y > hi) continue;
    svg.append(el('line', { x1: PADL, x2: W - PADR, y1: y(l.y), y2: y(l.y), stroke: l.color || GOLD, 'stroke-width': 1.2, 'stroke-dasharray': l.dash || '5 3' }));
    if (l.label) svg.append(el('text', { x: W - PADR - 2, y: y(l.y) - 3, 'text-anchor': 'end', fill: l.color || GOLD, 'font-size': 9.5, 'font-weight': 800, 'font-family': F }, l.label));
  }
  for (const m of marks) {
    if (m.i < from || m.i > upto) continue;
    const b = bars[m.i];
    svg.append(el('path', { d: `M${x(m.i)} ${y(b.h) - 4} l-4 -7 h8 z`, fill: m.color || GOLD }));
    if (labelMark && m.label) svg.append(el('text', { x: x(m.i), y: y(b.h) - 14, 'text-anchor': 'middle', fill: m.color || GOLD, 'font-size': 8.5, 'font-weight': 800, 'font-family': F }, m.label));
  }
  const step = Math.max(10, Math.ceil(n / 6 / 10) * 10);
  for (let i = from; i <= upto; i++) if ((i + 1) % step === 0) svg.append(el('text', { x: x(i), y: height - 5, 'text-anchor': 'middle', fill: 'var(--muted, #9aa3c7)', 'font-size': 9, 'font-family': F }, String(i + 1)));
  return svg;
}

/** A line (cumulative R) with an optional band. */
export function lineSvg({ values, band = null, height = 170, label = 'Equity curve', fmt = (v) => v.toFixed(1), color = SKY, extra = [] }) {
  const W = 360;
  const PADL = 40;
  const PADR = 8;
  const PADT = 10;
  const PADB = 18;
  const svg = svgRoot(W, height, label);
  const all = [...values, ...(band ? [...band.lo, ...band.hi] : []), 0];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const n = values.length;
  const x = (i) => PADL + (i / Math.max(1, n - 1)) * (W - PADL - PADR);
  const y = (v) => PADT + ((hi - v) / (hi - lo)) * (height - PADT - PADB);
  for (let t = 0; t <= 3; t++) {
    const v = lo + ((hi - lo) * t) / 3;
    svg.append(el('line', { x1: PADL, x2: W - PADR, y1: y(v), y2: y(v), stroke: 'rgba(165,173,214,.12)' }), el('text', { x: PADL - 4, y: y(v) + 3, 'text-anchor': 'end', fill: 'var(--muted, #9aa3c7)', 'font-size': 9, 'font-family': F }, fmt(v)));
  }
  svg.append(el('line', { x1: PADL, x2: W - PADR, y1: y(0), y2: y(0), stroke: 'rgba(242,240,255,.4)', 'stroke-dasharray': '3 3' }));
  if (band) {
    const top = band.hi.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
    const bottom = band.lo.map((v, i) => `L${x(band.lo.length - 1 - i)} ${y(band.lo[band.lo.length - 1 - i])}`).join(' ');
    svg.append(el('path', { d: `${top} ${bottom} Z`, fill: 'rgba(167,139,250,.18)', stroke: 'none' }));
  }
  for (const e of extra) svg.append(e({ x, y, W, PADL, PADR, PADT, PADB, height }));
  svg.append(el('path', { d: values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2 }));
  svg.append(el('text', { x: W - PADR, y: height - 4, 'text-anchor': 'end', fill: 'var(--muted, #9aa3c7)', 'font-size': 9, 'font-family': F }, `${n - 1} trades`));
  return svg;
}

/** Bars. bins: [{ label, n, color? }]. */
export function barsSvg({ bins, height = 140, label = 'Histogram', marks = [] }) {
  const W = 360;
  const PADL = 26;
  const PADR = 8;
  const PADT = 8;
  const PADB = 26;
  const svg = svgRoot(W, height, label);
  const max = Math.max(1, ...bins.map((b) => b.n));
  const pitch = (W - PADL - PADR) / bins.length;
  const y = (v) => PADT + (1 - v / max) * (height - PADT - PADB);
  svg.append(el('line', { x1: PADL, x2: W - PADR, y1: height - PADB, y2: height - PADB, stroke: 'rgba(165,173,214,.3)' }), el('text', { x: PADL - 4, y: PADT + 8, 'text-anchor': 'end', fill: 'var(--muted, #9aa3c7)', 'font-size': 9, 'font-family': F }, String(max)));
  bins.forEach((b, i) => {
    const h = height - PADB - y(b.n);
    svg.append(el('rect', { x: PADL + i * pitch + 1.5, y: y(b.n), width: Math.max(2, pitch - 3), height: Math.max(0, h), rx: 2, fill: b.color || SKY, opacity: b.n ? 1 : 0.2 }));
    if (bins.length <= 14 || i % 2 === 0) svg.append(el('text', { x: PADL + i * pitch + pitch / 2, y: height - 10, 'text-anchor': 'middle', fill: 'var(--muted, #9aa3c7)', 'font-size': 8.5, 'font-family': F }, b.label));
  });
  for (const m of marks) svg.append(el('line', { x1: PADL + m.at * pitch, x2: PADL + m.at * pitch, y1: PADT, y2: height - PADB, stroke: m.color || GOLD, 'stroke-width': 1.3, 'stroke-dasharray': '4 3' }), el('text', { x: PADL + m.at * pitch + 3, y: PADT + 9, fill: m.color || GOLD, 'font-size': 9, 'font-weight': 800, 'font-family': F }, m.label));
  return svg;
}
