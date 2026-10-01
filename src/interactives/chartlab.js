/**
 * Chart widgets for Levels 6 to 8: turning ticks into bars and candles, the same market at different timeframes,
 * and the structure lab (swing size, structural order, provisional versus confirmed, stepping to the live edge).
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, s, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { chartView } from '../ui/chartview.js';
import { makeRng } from '../learn/rng.js';
import { gauss } from '../sim/paths.js';
import { fromTicks, aggregate } from '../charts/candles.js';
import { drawCandles, makeChart } from '../charts/synth.js';
import { swings, provisional, structural, classify } from '../charts/detect.js';

const F = 'Manrope, sans-serif';
const UP = '#2DD4BF';
const DOWN = '#FF5C8A';
const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');
const mark = (group, v) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
const chip = (label, v, group, onPick) => {
  const b = h('button', { type: 'button', class: 'opt small', 'data-v': String(v), onclick: () => { mark(group, v); onPick(v); } }, label);
  group.push(b);
  return b;
};

/** A tick walk in pips around a base price: { ticks: [price], dp }. */
function tickWalk(seed, count, { base = 1.1, vol = 2.2 } = {}) {
  const rng = makeRng('ticks#' + seed);
  let p = base;
  const out = [p];
  for (let i = 1; i < count; i++) {
    p += gauss(rng) * vol * 0.0001;
    out.push(+p.toFixed(5));
  }
  return out;
}

/* ------------------------------------------------------------------ 6.01, 6.03, 6.06 ticks to candles */

const seedFrom = (spec, d) => spec.seed || d;

export function ticklab({ spec, onInteract }) {
  const mode = spec.mode || 'rep';
  if (mode === 'build') return buildLab(spec, onInteract);
  if (mode === 'same') return sameLab(spec, onInteract);
  return repLab(spec, onInteract);
}

/** The same 20 ticks drawn as a line, as bars and as candles. */
function repLab(spec, onInteract) {
  const ticks = tickWalk(seedFrom(spec, 'rep1'), 20);
  const groups = [0, 1, 2, 3].map((k) => ticks.slice(k * 5, k * 5 + 5));
  const W = 340;
  const Hh = 190;
  const lo = Math.min(...ticks);
  const hi = Math.max(...ticks);
  const y = (p) => 14 + (Hh - 36) * (1 - (p - lo) / (hi - lo || 1));
  const seen = new Set();
  const stage = h('div', { class: 'figure' });
  const caption = h('p', { class: 'lab-teach' });
  const draw = (kind) => {
    seen.add(kind);
    const layers = [];
    const gx = (k) => 20 + k * 78;
    if (kind === 'line') {
      layers.push(s('path', { d: ticks.map((p, i) => `${i ? 'L' : 'M'}${(14 + (i * (W - 28)) / 19).toFixed(1)} ${y(p).toFixed(1)}`).join(' '), fill: 'none', stroke: UP, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      ticks.forEach((p, i) => layers.push(s('circle', { cx: 14 + (i * (W - 28)) / 19, cy: y(p), r: 2.2, fill: '#FFE8A0' })));
      caption.textContent = 'Twenty prices, one after another. A line joins them. Nothing is summarised yet.';
    } else {
      groups.forEach((g, k) => {
        const [o, hh, l, c] = fromTicks(g);
        const cx = gx(k) + 30;
        const col = c >= o ? UP : DOWN;
        layers.push(s('line', { x1: cx, x2: cx, y1: y(hh), y2: y(l), stroke: col, 'stroke-width': 2 }));
        if (kind === 'bar') {
          layers.push(s('line', { x1: cx - 9, x2: cx, y1: y(o), y2: y(o), stroke: col, 'stroke-width': 2 }), s('line', { x1: cx, x2: cx + 9, y1: y(c), y2: y(c), stroke: col, 'stroke-width': 2 }));
        } else {
          layers.push(s('rect', { x: cx - 10, y: Math.min(y(o), y(c)), width: 20, height: Math.max(2, Math.abs(y(o) - y(c))), fill: col, rx: 2 }));
        }
        layers.push(s('text', { x: cx, y: Hh - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10, 'font-family': F }, `Ticks ${k * 5 + 1}–${k * 5 + 5}`));
      });
      caption.textContent = kind === 'bar' ? 'Each group of five ticks becomes one bar. The left tick is the open, the right tick the close, and the line runs from the low to the high.' : 'The same bars, drawn as candles. The body runs from the open to the close. The thin lines (wicks) reach the high and the low.';
    }
    stage.replaceChildren(s('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'fig', role: 'img', 'aria-label': `Twenty ticks drawn as a ${kind}` }, ...layers));
    if (seen.size === 3) onInteract();
  };
  const group = [];
  const row = h('div', { class: 'choices' }, chip('Line', 'line', group, draw), chip('Bars', 'bar', group, draw), chip('Candles', 'candle', group, draw));
  draw('line');
  mark(group, 'line');
  return h('div', { class: 'lab' }, h('p', { class: 'lab-intro' }, 'One market, twenty ticks. Switch between three ways to draw it.'), row, stage, caption, note());
}

/** Step through ticks and watch the open, high, low and close form. */
function buildLab(spec, onInteract) {
  const ticks = tickWalk(seedFrom(spec, 'build1'), 9, { vol: 3 });
  let k = 1;
  const read = h('div', { class: 'mm-read' });
  const stage = h('div', { class: 'figure' });
  const next = button('Next Tick', { onClick: () => go() });
  const W = 340;
  const Hh = 170;
  const lo = Math.min(...ticks);
  const hi = Math.max(...ticks);
  const y = (p) => 12 + (Hh - 26) * (1 - (p - lo) / (hi - lo || 1));
  const x = (i) => 16 + (i * (W - 110)) / 8;
  const draw = () => {
    const seen = ticks.slice(0, k);
    const [o, hh, l, c] = fromTicks(seen);
    const layers = [
      s('path', { d: seen.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' '), fill: 'none', stroke: 'rgba(165,173,214,.6)', 'stroke-width': 1.5 }),
      ...seen.map((p, i) => s('circle', { cx: x(i), cy: y(p), r: 3, fill: p === hh ? '#FFC83D' : p === l ? '#38BDF8' : '#F2F0FF' })),
      s('line', { x1: W - 60, x2: W - 60, y1: y(hh), y2: y(l), stroke: c >= o ? UP : DOWN, 'stroke-width': 2 }),
      s('rect', { x: W - 72, y: Math.min(y(o), y(c)), width: 24, height: Math.max(2, Math.abs(y(o) - y(c))), fill: c >= o ? UP : DOWN, rx: 2 })
    ];
    stage.replaceChildren(s('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'fig', role: 'img', 'aria-label': 'A candle forming from ticks' }, ...layers));
    const f = (v) => v.toFixed(5);
    read.replaceChildren(
      ...[['Open', o], ['High', hh], ['Low', l], ['Close', c]].map(([name, v]) => h('div', null, h('span', null, name), h('b', null, f(v)))));
  };
  const go = () => {
    if (k < ticks.length) k += 1;
    draw();
    if (k === ticks.length) {
      next.disabled = true;
      onInteract();
    }
  };
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Nine ticks arrive one at a time. The candle on the right is built from them. Watch what each tick changes.'),
    stage, read, h('div', { class: 'lab-actions' }, next),
    h('p', { class: 'lab-teach' }, 'The open is the FIRST tick. The close is the LAST one so far. The high and low can change every time a new tick arrives.'), note());
}

/** Three different tick paths that make exactly the same candle. */
function sameLab(spec, onInteract) {
  const o = 1.1;
  const hh = 1.1024;
  const l = 1.0982;
  const c = 1.1011;
  const paths = [
    { name: 'Up first, then down', pts: [o, 1.1008, hh, 1.1003, 1.0995, l, 1.0996, 1.1004, c] },
    { name: 'Down first, then up', pts: [o, 1.0994, l, 1.0999, 1.1009, hh, 1.1017, 1.1014, c] },
    { name: 'Quiet, then a spike each way', pts: [o, 1.1002, 1.0999, 1.1003, hh, 1.1001, l, 1.1005, c] }
  ];
  const W = 340;
  const Hh = 190;
  const y = (p) => 14 + (Hh - 30) * (1 - (p - l) / (hh - l));
  const x = (i) => 12 + (i * (W - 110)) / 8;
  const cols = [UP, '#FFC83D', '#A78BFA'];
  const guesses = [];
  let guess = null;
  const out = h('div', { class: 'lab-out' });
  const stage = h('div', { class: 'figure' });
  const drawCandle = (extra = []) => stage.replaceChildren(s('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'fig', role: 'img', 'aria-label': 'One candle, and three paths that could have made it' },
    ...extra,
    s('line', { x1: W - 50, x2: W - 50, y1: y(hh), y2: y(l), stroke: UP, 'stroke-width': 2 }),
    s('rect', { x: W - 64, y: y(c), width: 28, height: y(o) - y(c), fill: UP, rx: 2 }),
    s('text', { x: W - 50, y: Hh - 4, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10, 'font-family': F }, 'The candle')));
  const reveal = button('Show Three Paths', { disabled: true, onClick: () => {
    drawCandle(paths.map((p, k) => s('path', { d: p.pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' '), fill: 'none', stroke: cols[k], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-opacity': 0.9 })));
    out.replaceChildren(
      h('div', { class: 'chart-key' }, ...paths.map((p, k) => h('span', { style: { '--c': cols[k] }, class: 'k-line' }, p.name))),
      h('p', { class: 'lab-result' }, 'All three paths open at 1.10000, reach a high of 1.10240, a low of 1.09820 and close at 1.10110.'),
      h('p', { class: 'lab-teach', html: mdInline('A candle keeps **four numbers** and throws the path away. Whether price went up first or down first, and how many times it turned, cannot be read from the candle. Any story about what happened INSIDE it is a guess.') }));
    emit('sim.run', { sim: 'samecandle', guess });
    onInteract();
    reveal.disabled = true;
  } });
  drawCandle();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'This candle opened at 1.10000, reached 1.10240, dipped to 1.09820 and closed at 1.10110.'),
    h('p', { class: 'lab-q' }, 'How many different tick paths could have produced exactly this candle?'),
    h('div', { class: 'choices' }, chip('Just one', 'one', guesses, (v) => { guess = v; reveal.disabled = false; }), chip('A few', 'few', guesses, (v) => { guess = v; reveal.disabled = false; }), chip('Endlessly many', 'many', guesses, (v) => { guess = v; reveal.disabled = false; })),
    stage, h('div', { class: 'lab-actions' }, reveal), out, note());
}

/* ------------------------------------------------------------------ 6.02 timeframes */

export function timeframelab({ spec, onInteract }) {
  const rng = makeRng('tf#' + seedFrom(spec, 'tf1'));
  const wps = [{ t: 0, p: 1.1 }];
  for (let k = 1; k <= 24; k++) wps.push({ t: k * 20, p: +(wps[k - 1].p + gauss(rng) * 0.0012).toFixed(5) });
  const base = drawCandles({ seed: 'tf-' + seedFrom(spec, 'tf1'), waypoints: wps, noise: 1.2, wick: 1.4 });
  const sets = { 1: base.slice(-60), 5: aggregate(base, 5).slice(-60), 15: aggregate(base, 15).slice(-32), 60: aggregate(base, 60) };
  const names = { 1: '1 Minute', 5: '5 Minute', 15: '15 Minute', 60: '1 Hour' };
  const seen = new Set();
  const view = chartView({ candles: sets[5], height: 200 });
  const info = h('p', { class: 'lab-teach' });
  const group = [];
  const pick = (v) => {
    seen.add(v);
    view.update({ candles: sets[v], relTo: sets[v].length - 1, pitch: sets[v].length > 50 ? 8 : sets[v].length > 20 ? 12 : 18, marks: [] });
    view.setCursor(null, { silent: true });
    info.textContent = `${sets[v].length} candles on screen. Each one covers ${v === 60 ? 'one hour' : v + (v === 1 ? ' minute' : ' minutes')} of the same market.`;
    if (seen.size >= 3) onInteract();
  };
  const row = h('div', { class: 'choices' }, ...[1, 5, 15, 60].map((v) => chip(names[v], v, group, pick)));
  pick(5);
  mark(group, 5);
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Eight hours of the same market, drawn four ways. Only the size of each candle changes. Tap a candle to read its prices.'),
    row, view.el, info,
    h('p', { class: 'lab-teach', html: mdInline('Where a **day** starts depends on the time zone your platform uses to cut the days. The same market can show a different daily candle on two platforms.') }), note());
}

/* ------------------------------------------------------------------ 6.09, 7.02, 7.03 the structure lab */

/**
 * spec: { recipe, seed, n (swing size), order, showOrder (offer order 1 or 2), showN (offer sizes), step (offer stepping forward), start (bars hidden at the start) }
 */
export function structurelab({ spec, onInteract }) {
  const recipe = spec.recipe || 'trend-up';
  const made = makeChart(recipe, spec.seed || 21, { n: spec.n || 2, order: spec.order || 1, clean: true });
  const all = made.candles;
  let n = spec.n || 2;
  let order = spec.order || 1;
  let upto = Math.max(20, all.length - 1 - (spec.start ?? 0));
  const startUpto = upto;
  let showProv = spec.provisional !== false;
  const explored = new Set();
  let stepped = 0;
  let changes = 0;
  let lastConfirmed = '';

  const view = chartView({ candles: all.slice(0, upto + 1), height: 226 });
  const readout = h('div', { class: 'lab-out' });
  const controls = h('div', { class: 'lab-controls' });

  const compute = () => {
    const cs = all.slice(0, upto + 1);
    let list = swings(cs, n, upto);
    if (order === 2) list = structural(list);
    const prov = showProv ? provisional(cs, n, upto).filter((p) => !list.some((q) => q.i === p.i)) : [];
    return { cs, list, prov };
  };

  const draw = () => {
    const { cs, list, prov } = compute();
    const sig = list.map((x) => x.i + x.type).join(',');
    if (lastConfirmed && sig !== lastConfirmed) changes += 1;
    lastConfirmed = sig;
    view.update({
      candles: cs,
      relTo: upto,
      marks: [...list.map((x) => ({ i: x.i, tone: 'right' })), ...prov.map((p) => ({ i: p.i, tone: 'prov' }))],
      points: list.map((x) => ({ i: x.i, kind: x.type, label: x.type === 'high' ? 'H' : 'L' }))
    });
    const cls = classify(list);
    readout.replaceChildren(
      h('div', { class: 'mm-read' },
        h('div', null, h('span', null, 'Confirmed Swings'), h('b', null, String(list.length))),
        h('div', null, h('span', null, 'Provisional'), h('b', null, showProv ? String(prov.length) : '—')),
        h('div', null, h('span', null, 'Structure'), h('b', null, cls.structure.charAt(0).toUpperCase() + cls.structure.slice(1)))),
      h('p', { class: 'lab-teach', html: mdInline(`Teal columns are **confirmed**: each has ${n} bars on each side${order === 2 ? ', and is also higher or lower than its neighbours of the same kind (structural)' : ''}. Blue dotted columns are **provisional**: the newest extreme, with fewer than ${n} bars after it. ${stepped ? `You have stepped forward ${stepped} bar${stepped === 1 ? '' : 's'} and the confirmed swings changed ${changes} time${changes === 1 ? '' : 's'}.` : ''}`) }));
    if (explored.size >= (spec.need || 2) || stepped >= (spec.needSteps || 4)) onInteract();
  };

  const rows = [];
  if (spec.showN) {
    const g = [];
    rows.push(h('div', { class: 'lab-row' }, h('span', null, 'Swing size'), h('div', { class: 'choices' }, ...[1, 2, 3].map((v) => chip(`n = ${v}`, v, g, (x) => { n = x; explored.add('n' + x); draw(); })))));
    mark(g, n);
  }
  if (spec.showOrder) {
    const g = [];
    rows.push(h('div', { class: 'lab-row' }, h('span', null, 'Order'), h('div', { class: 'choices' }, chip('Order 1 (all swings)', 1, g, (x) => { order = x; explored.add('o' + x); draw(); }), chip('Order 2 (structural)', 2, g, (x) => { order = x; explored.add('o' + x); draw(); }))));
    mark(g, order);
  }
  if (spec.step) {
    const stepBtn = button('Step Forward One Bar', { onClick: () => {
      if (upto < all.length - 1) {
        upto += 1;
        stepped += 1;
        draw();
      }
      if (upto >= all.length - 1) stepBtn.disabled = true;
    } });
    const back = button('Start Again', { variant: 'ghost', onClick: () => { upto = startUpto; stepped = 0; changes = 0; lastConfirmed = ''; stepBtn.disabled = false; draw(); } });
    rows.push(h('div', { class: 'qactions' }, stepBtn, back));
  }
  controls.append(...rows);
  draw();
  return h('div', { class: 'lab' }, h('p', { class: 'lab-intro' }, spec.labIntro || 'Change the settings and watch which swings are confirmed.'), controls, view.el, readout, note());
}

/* ------------------------------------------------------------------ 7.09 the same market at two timeframes */

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

export function mtflab({ onInteract }) {
  const cases = [
    { recipe: 'trend-up', seed: 31, label: 'Chart A' },
    { recipe: 'shift-down', seed: 32, label: 'Chart B' },
    { recipe: 'range', seed: 33, label: 'Chart C' }
  ];
  const seen = new Set();
  const stage = h('div', { class: 'mtf' });
  const out = h('div', { class: 'lab-out' });
  const group = [];
  const show = (k) => {
    seen.add(k);
    const c = cases[k];
    const made = makeChart(c.recipe, c.seed, { n: 2, order: 2 });
    const ltf = made.candles.slice(-72);
    const htf = aggregate(ltf, 4);
    const lsw = structural(swings(ltf, 2, ltf.length - 1));
    const hsw = swings(htf, 1, htf.length - 1);
    const lc = classify(lsw);
    const hc = classify(hsw);
    const pts = (list) => list.map((x) => ({ i: x.i, kind: x.type, label: x.type === 'high' ? 'H' : 'L' }));
    const hv = chartView({ candles: htf, height: 170, pitch: 16, points: pts(hsw), tappable: false });
    const lv = chartView({ candles: ltf, height: 170, pitch: 8, points: pts(lsw), tappable: false });
    stage.replaceChildren(h('div', { class: 'mtf-panel' }, h('b', null, '1 Hour · swing size 1'), hv.el), h('div', { class: 'mtf-panel' }, h('b', null, '15 Minute · structural swings, size 2'), lv.el));
    const agree = hc.structure === lc.structure;
    out.replaceChildren(
      h('div', { class: 'mm-read' }, h('div', null, h('span', null, '1 Hour'), h('b', null, cap(hc.structure))), h('div', null, h('span', null, '15 Minute'), h('b', null, cap(lc.structure)))),
      h('p', { class: 'lab-result' }, agree ? `Both timeframes read ${lc.structure} here.` : `They read differently: ${hc.structure} on the 1-hour chart and ${lc.structure} on the 15-minute chart.`),
      h('p', { class: 'lab-teach', html: mdInline('State BOTH readings and the timeframe of each. Do not average them, and do not pick the one you like. A difference tells you the two time scales are doing different things right now. It is a description, not a signal.') }));
    if (seen.size >= 2) onInteract();
  };
  const row = h('div', { class: 'choices' }, ...cases.map((c, k) => chip(c.label, k, group, (v) => show(+v))));
  show(0);
  mark(group, 0);
  return h('div', { class: 'lab' }, h('p', { class: 'lab-intro' }, 'The same 72 fifteen-minute candles, and the 1-hour candles built from them. Swings are marked on each. Compare the readings.'), row, stage, out, note());
}
