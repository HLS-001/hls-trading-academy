/**
 * The interactive chart: candles drawn as SVG, tapped to place a cursor, with layers for marks, shaded stretches,
 * horizontal lines and labelled points. Built for a phone: the plot scrolls sideways, the price axis stays put, and a
 * cursor with step buttons (◀ ▶) gives a precise pick that a fingertip cannot.
 *
 * Purpose-built SVG rather than a canvas: exercises show at most a few hundred candles, and SVG keeps every mark a real,
 * testable, keyboard-reachable element. All colours come from the theme tokens or the fixed candle palette.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { h, s } from './dom.js';
import { partsInZone, formatDateTime } from '../time/zones.js';

const F = 'Manrope, sans-serif';
const UP = '#2DD4BF';
const DOWN = '#FF5C8A';
const AMBER = '#F5A524';
const GOLD = '#FFC83D';

const TONE = {
  sel: { fill: 'rgba(255,200,61,.24)', stroke: GOLD },
  right: { fill: 'rgba(45,212,191,.24)', stroke: UP },
  wrong: { fill: 'rgba(245,165,36,.26)', stroke: AMBER },
  missed: { fill: 'rgba(45,212,191,.08)', stroke: UP, dash: '3 3' },
  hint: { fill: 'rgba(167,139,250,.16)', stroke: '#A78BFA', dash: '4 3' },
  prov: { fill: 'rgba(56,189,248,.14)', stroke: '#38BDF8', dash: '2 3' }
};
const BAND_TONE = { teal: 'rgba(45,212,191,.10)', gold: 'rgba(255,200,61,.10)', violet: 'rgba(167,139,250,.12)', rose: 'rgba(255,92,138,.10)' };

const PAD_L = 14;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 22;

/** A tidy step for axis labels: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(span, ticks) {
  const raw = span / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

let hollowDefault = false;

/**
 * opts: candles, dp, relTo (the bar labelled 0; default the last), bands, lines, points, marks, height, pitch, hollow,
 *       tappable (taps place the cursor), onTap(i)
 */
export function chartView(opts) {
  const st = {
    candles: opts.candles,
    dp: opts.dp ?? 5,
    relTo: opts.relTo ?? opts.candles.length - 1,
    bands: opts.bands || [],
    lines: opts.lines || [],
    times: opts.times || null,
    tz: opts.tz || 'America/Guyana',
    points: opts.points || [],
    marks: opts.marks || [],
    height: opts.height || 236,
    pitch: opts.pitch || (opts.candles.length > 70 ? 8 : opts.candles.length > 45 ? 10 : 13),
    hollow: opts.hollow ?? hollowDefault,
    cursor: null,
    tappable: opts.tappable !== false,
    onTap: opts.onTap || null,
    onCursor: opts.onCursor || null
  };
  const plotH = () => st.height - PAD_T - PAD_B;

  const scroller = h('div', { class: 'cv-scroll', tabindex: '0', role: 'group', 'aria-label': 'Price chart. Use the arrow keys to move the cursor.' });
  const axisHost = h('div', { class: 'cv-axis' });
  const readout = h('div', { class: 'cv-readout', 'aria-live': 'polite' });
  const zoomOut = h('button', { type: 'button', class: 'cv-btn', 'aria-label': 'Zoom out', onclick: () => zoom(-1) }, '−');
  const zoomIn = h('button', { type: 'button', class: 'cv-btn', 'aria-label': 'Zoom in', onclick: () => zoom(1) }, '+');
  const hollowBtn = h('button', { type: 'button', class: 'cv-btn wide', 'aria-pressed': String(st.hollow), onclick: () => { st.hollow = !st.hollow; hollowDefault = st.hollow; hollowBtn.setAttribute('aria-pressed', String(st.hollow)); render(); } }, 'Hollow Candles');
  const prev = h('button', { type: 'button', class: 'cv-btn nav', 'aria-label': 'Previous candle', onclick: () => step(-1) }, '◀');
  const next = h('button', { type: 'button', class: 'cv-btn nav', 'aria-label': 'Next candle', onclick: () => step(1) }, '▶');
  const tools = h('div', { class: 'cv-tools' }, zoomOut, zoomIn, hollowBtn, h('span', { class: 'cv-spacer' }), prev, next);
  const el = h('div', { class: 'cv' + (st.tappable ? '' : ' cv-static') }, h('div', { class: 'cv-frame' }, scroller, axisHost), tools, readout);

  const bounds = () => {
    let lo = Infinity;
    let hi = -Infinity;
    st.candles.forEach((c) => {
      lo = Math.min(lo, c[2]);
      hi = Math.max(hi, c[1]);
    });
    for (const l of st.lines) {
      lo = Math.min(lo, l.price);
      hi = Math.max(hi, l.price);
    }
    const pad = (hi - lo) * 0.06 || 0.001;
    return { lo: lo - pad, hi: hi + pad };
  };

  function render() {
    const n = st.candles.length;
    const { lo, hi } = bounds();
    const w = PAD_L + n * st.pitch + PAD_R;
    const y = (p) => PAD_T + plotH() * (1 - (p - lo) / (hi - lo));
    const x = (i) => PAD_L + i * st.pitch + st.pitch / 2;
    const bodyW = Math.max(2, Math.round(st.pitch * 0.62));
    const step = niceStep(hi - lo, 5);
    const ticks = [];
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) ticks.push(p);
    const fmtAxis = (p) => p.toFixed(Math.min(st.dp, 4));

    const layers = [];
    // shaded stretches
    for (const b of st.bands) {
      const x0 = PAD_L + b.from * st.pitch;
      const x1 = PAD_L + (b.to + 1) * st.pitch;
      layers.push(s('rect', { class: 'cv-band', x: x0, y: PAD_T, width: x1 - x0, height: plotH(), fill: BAND_TONE[b.tone] || BAND_TONE.teal }));
      if (b.label) layers.push(s('text', { x: (x0 + x1) / 2, y: PAD_T + 11, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 11, 'font-weight': 800, 'font-family': F }, b.label));
    }
    // grid
    for (const p of ticks) layers.push(s('line', { x1: 0, x2: w, y1: y(p), y2: y(p), stroke: 'rgba(165,173,214,.13)', 'stroke-width': 1 }));
    // marks behind the candles
    for (const m of st.marks) {
      const t = TONE[m.tone || 'sel'];
      layers.push(s('rect', { class: 'cv-mark ' + (m.tone || 'sel'), 'data-i': m.i, x: x(m.i) - st.pitch / 2, y: PAD_T, width: st.pitch, height: plotH(), fill: t.fill, stroke: t.stroke, 'stroke-width': 1, 'stroke-dasharray': t.dash || null, rx: 2 }));
    }
    // candles
    st.candles.forEach((c, i) => {
      const up = c[3] >= c[0];
      const col = up ? UP : DOWN;
      const top = y(Math.max(c[0], c[3]));
      const bot = y(Math.min(c[0], c[3]));
      layers.push(s('g', { class: 'cv-candle', 'data-i': i },
        s('line', { x1: x(i), x2: x(i), y1: y(c[1]), y2: y(c[2]), stroke: col, 'stroke-width': 1.3 }),
        s('rect', { x: x(i) - bodyW / 2, y: top, width: bodyW, height: Math.max(1.2, bot - top), fill: up && st.hollow ? 'var(--ink-2, #0D1330)' : col, stroke: col, 'stroke-width': 1 })));
    });
    // lines
    for (const l of st.lines) {
      const col = l.tone === 'teal' ? UP : l.tone === 'rose' ? DOWN : l.tone === 'amber' ? AMBER : GOLD;
      const lx1 = l.from !== undefined ? x(l.from) - st.pitch / 2 : 0;
      const lx2 = l.to !== undefined ? x(l.to) + st.pitch / 2 : w;
      layers.push(s('line', { class: 'cv-line', x1: lx1, x2: lx2, y1: y(l.price), y2: y(l.price), stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': l.dashed ? '6 4' : null }));
      if (l.label) layers.push(s('text', { x: lx1 + 4, y: y(l.price) - 4, fill: col, 'font-size': 9.5, 'font-weight': 800, 'font-family': F }, l.label));
    }
    // labelled points
    for (const p of st.points) {
      const c = st.candles[p.i];
      if (!c) continue;
      const high = p.kind === 'high';
      const py = y(high ? c[1] : c[2]) + (high ? -7 : 7);
      layers.push(s('g', { class: 'cv-point', 'data-i': p.i },
        s('circle', { cx: x(p.i), cy: py, r: 7.5, fill: 'var(--ink-2, #0D1330)', stroke: GOLD, 'stroke-width': 1.5 }),
        s('text', { x: x(p.i), y: py + 3.6, 'text-anchor': 'middle', fill: '#FFE8A0', 'font-size': 9.5, 'font-weight': 800, 'font-family': F }, p.label)));
    }
    // cursor
    if (st.cursor !== null && st.candles[st.cursor]) {
      layers.push(s('line', { class: 'cv-cursor', x1: x(st.cursor), x2: x(st.cursor), y1: PAD_T - 4, y2: PAD_T + plotH(), stroke: '#F2F0FF', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
        s('path', { d: `M${x(st.cursor) - 4} ${PAD_T - 6} L${x(st.cursor) + 4} ${PAD_T - 6} L${x(st.cursor)} ${PAD_T} Z`, fill: '#F2F0FF' }));
    }
    if (st.times) {
      // clock times in the chart's own zone, a line where the local date changes
      let lastDay = null;
      for (let i = 0; i < n; i++) {
        const p = partsInZone(st.times[i], st.tz);
        const day = p.year * 10000 + p.month * 100 + p.day;
        if (lastDay !== null && day !== lastDay) {
          layers.push(s('line', { x1: x(i) - st.pitch / 2, x2: x(i) - st.pitch / 2, y1: PAD_T, y2: PAD_T + plotH(), stroke: 'rgba(165,173,214,.35)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }),
            s('text', { x: x(i) - st.pitch / 2 + 3, y: PAD_T + 9, fill: 'var(--muted)', 'font-size': 9, 'font-weight': 700, 'font-family': F }, p.weekday + ' ' + p.day));
        }
        lastDay = day;
        if (p.minute === 0 && p.hour % 4 === 0) layers.push(s('text', { x: x(i), y: st.height - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9, 'font-family': F }, String(p.hour).padStart(2, '0') + ':00'));
      }
    } else {
      // bar numbers, counted back from the last bar
      const every = st.pitch >= 12 ? 5 : 10;
      for (let i = 0; i < n; i++) {
        const rel = i - st.relTo;
        if (rel % every !== 0) continue;
        layers.push(s('text', { x: x(i), y: st.height - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9, 'font-family': F }, rel === 0 ? '0' : String(rel).replace('-', '−')));
      }
    }

    const svg = s('svg', { class: 'cv-svg', width: w, height: st.height, viewBox: `0 0 ${w} ${st.height}`, role: 'img', 'aria-label': `Candlestick chart of ${n} candles` }, ...layers);
    svg.addEventListener('click', (e) => {
      if (!st.tappable) return;
      const box = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - box.left - PAD_L) / st.pitch - 0.5)));
      st.cursor = i;
      render();
      readoutUpdate();
      st.onTap && st.onTap(i);
      st.onCursor && st.onCursor(i);
    });
    scroller.replaceChildren(svg);

    const axis = s('svg', { width: 50, height: st.height, viewBox: `0 0 50 ${st.height}`, 'aria-hidden': 'true' },
      ...ticks.map((p) => s('text', { x: 46, y: y(p) + 3, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 9.5, 'font-family': F }, fmtAxis(p))));
    axisHost.replaceChildren(axis);
  }

  function readoutUpdate() {
    if (st.cursor === null) {
      readout.replaceChildren(h('span', { class: 'cv-hint' }, 'Tap a candle to place the cursor, then use ◀ ▶ to move it one candle at a time.'));
      return;
    }
    const c = st.candles[st.cursor];
    const rel = st.cursor - st.relTo;
    const f = (v) => v.toFixed(st.dp);
    readout.replaceChildren(
      h('b', null, st.times ? formatDateTime(st.times[st.cursor], st.tz) : rel === 0 ? 'Latest bar' : `Bar ${String(rel).replace('-', '−')}`),
      h('span', null, `O ${f(c[0])}`), h('span', null, `H ${f(c[1])}`), h('span', null, `L ${f(c[2])}`), h('span', null, `C ${f(c[3])}`));
  }

  function scrollTo(i) {
    const cx = PAD_L + i * st.pitch + st.pitch / 2;
    const view = scroller.clientWidth;
    if (!view) return;
    if (cx < scroller.scrollLeft + 24 || cx > scroller.scrollLeft + view - 24) scroller.scrollLeft = Math.max(0, cx - view / 2);
  }

  function step(d) {
    const n = st.candles.length;
    st.cursor = st.cursor === null ? n - 1 : Math.max(0, Math.min(n - 1, st.cursor + d));
    render();
    readoutUpdate();
    scrollTo(st.cursor);
    st.onTap && st.onTap(st.cursor);
    st.onCursor && st.onCursor(st.cursor);
  }

  function zoom(d) {
    const sizes = [5, 8, 10, 13, 18, 24];
    let k = sizes.findIndex((v) => v >= st.pitch);
    if (k < 0) k = sizes.length - 1;
    k = Math.max(0, Math.min(sizes.length - 1, k + d));
    const keepCenter = (scroller.scrollLeft + scroller.clientWidth / 2) / st.pitch;
    st.pitch = sizes[k];
    render();
    scroller.scrollLeft = Math.max(0, keepCenter * st.pitch - scroller.clientWidth / 2);
  }

  scroller.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });

  render();
  readoutUpdate();
  requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });

  const api = {
    el,
    get cursor() { return st.cursor; },
    setCursor(i, { silent = false } = {}) {
      st.cursor = i;
      render();
      readoutUpdate();
      if (i !== null) scrollTo(i);
      if (!silent) st.onCursor && st.onCursor(i);
    },
    update(patch) {
      Object.assign(st, patch);
      render();
      readoutUpdate();
    },
    setTappable(v) { st.tappable = v; },
    onTap(fn) { st.onTap = fn; },
    onCursor(fn) { st.onCursor = fn; },
    scrollTo,
    get state() { return st; }
  };
  return api;
}
