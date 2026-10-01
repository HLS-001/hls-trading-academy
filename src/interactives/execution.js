/**
 * Level 4 widgets: the order simulator, the fill simulator, market depth, the news spread replay and the feed comparison,
 * plus a generic runner for a set of template problems (used by labs).
 * Each one asks you to commit before it shows a result. Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, s, mdInline, mount } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { candleChart } from '../ui/charts.js';
import { getMarket, pretty } from '../calc/markets.js';
import { pricePath, pathCandles } from '../sim/paths.js';
import { validate, runOrder, dirOf } from '../sim/orders.js';
import { simulatePlan, ASSUMPTIONS, assume } from '../sim/fills.js';
import { BOOKS, walkBook } from '../sim/depth.js';
import { makeRng, freshSeed } from '../learn/rng.js';
import { registerCleanup } from '../views/cleanup.js';
import { runSet, gradeAll } from '../exercises/runner.js';
import { answerPayload } from '../exercises/resolve.js';

const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');
const P = 0.0001;
const px = (v, dq = 5) => Number(v).toFixed(dq);
const trimN = (n, d = 2) => String(+Number(n).toFixed(d));
const rTxt = (r) => (r === null || r === undefined ? '—' : (r < 0 ? '−' : r > 0 ? '+' : '') + trimN(Math.abs(r), 2) + 'R');
const mark = (group, v) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
const chip = (label, v, group, onPick) => {
  const b = h('button', { type: 'button', class: 'opt small', 'data-v': String(v), onclick: () => { mark(group, v); onPick(v); } }, label);
  group.push(b);
  return b;
};

/** A bid and ask line chart with optional level lines and fill and exit markers. */
function pathChart(path, upto, { lines = [], fill = null, exit = null, w = 340, hgt = 170 } = {}) {
  const all = [...path.flatMap((p) => [p.bid, p.ask]), ...lines.map((l) => l.price)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1e-4;
  const padR = 44;
  const x = (i) => 6 + ((w - 6 - padR) * i) / (path.length - 1);
  const y = (v) => 10 + (hgt - 20) * (1 - (v - min) / span);
  const pts = path.slice(0, upto + 1);
  const line = (key, colour) => s('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' '), fill: 'none', stroke: colour, 'stroke-width': 1.7, 'stroke-linejoin': 'round' });
  const tone = { stop: '#FFC83D', target: '#2DD4BF', entry: '#A78BFA', level: '#38BDF8' };
  const lineEls = lines.map((l) => s('g', null,
    s('line', { x1: 6, x2: w - padR, y1: y(l.price), y2: y(l.price), stroke: tone[l.tone] || '#FFE8A0', 'stroke-dasharray': '4 4', 'stroke-width': 1.1 }),
    s('text', { x: w - padR + 3, y: y(l.price) + 3, fill: tone[l.tone] || '#FFE8A0', 'font-size': 8.5, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, l.label)));
  const dot = (m, colour, label) => (m && m.index <= upto ? s('g', null, s('circle', { cx: x(m.index), cy: y(m.price), r: 4.5, fill: colour }), s('text', { x: x(m.index), y: y(m.price) - 8, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 8.5, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, label)) : null);
  return h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'fig', role: 'img', 'aria-label': 'Bid and ask prices over time' }, ...lineEls, line('ask', '#FFC83D'), line('bid', '#2DD4BF'), dot(fill, '#FFE8A0', 'Filled'), dot(exit, '#A78BFA', 'Out')),
    h('div', { class: 'chart-key' }, h('span', { class: 'k-ask' }, 'Ask'), h('span', { class: 'k-bid' }, 'Bid')));
}

/** Play a path forward a few points at a time. Returns a stopper. */
function playPath(total, upto, draw, done) {
  let i = upto;
  const t = setInterval(() => {
    i = Math.min(total, i + 2);
    draw(i);
    if (i >= total) {
      clearInterval(t);
      done();
    }
  }, 90);
  registerCleanup(() => clearInterval(t));
  return () => clearInterval(t);
}

/* ------------------------------------------------------------------ the order simulator */

const TYPE_NAMES = { 'buy-limit': 'Buy Limit', 'buy-stop': 'Buy Stop', 'sell-limit': 'Sell Limit', 'sell-stop': 'Sell Stop' };

export function ordersim({ spec = {}, onInteract, lessonId = '' }) {
  const mode = spec.mode || 'pending';
  const pair = 'EURUSD';
  const START = 6;
  const root = h('div', { class: 'lab' });
  const out = h('div', { class: 'lab-out' });
  let path;
  let now;
  let runs = 0;
  let fastRuns = 0;
  let quietRuns = 0;
  let speed = 'quiet';
  const state = { type: null, level: null, sl: null, tp: null, limit: null };

  const newPath = () => {
    const vol = mode === 'market' ? (speed === 'fast' ? 5 : 0.8) : 2.2;
    path = pricePath({ seed: freshSeed(), start: 1.175, pipSize: P, steps: 50, volPips: vol, spreadPips: 1.2, driftPips: mode === 'market' ? 0 : (Math.random() - 0.5) * 0.4 });
    if (mode === 'stoplimit') for (let i = 24; i < path.length; i++) ['mid', 'bid', 'ask'].forEach((k) => (path[i][k] += 0.0018));
    now = START;
  };
  const cur = () => path[START];
  const lvl = (pips) => +(cur().mid + pips * P).toFixed(5);
  const chart = h('div');
  const draw = (upto = now, extra = {}) => chart.replaceChildren(pathChart(path, upto, extra));

  const showLines = () => {
    const lines = [];
    if (state.level !== null) lines.push({ price: state.level, label: TYPE_NAMES[state.type] || 'Trigger', tone: 'entry' });
    if (state.limit !== null) lines.push({ price: state.limit, label: 'Limit', tone: 'level' });
    if (state.sl !== null) lines.push({ price: state.sl, label: 'Stop', tone: 'stop' });
    if (state.tp !== null) lines.push({ price: state.tp, label: 'Target', tone: 'target' });
    return lines;
  };

  const result = (r, order) => {
    const kids = [];
    if (!r.filled) kids.push(h('b', null, 'Not Filled'), h('span', null, order.type.includes('stop-limit') && r.triggered ? 'The stop was triggered, but the price jumped past your limit, so no order was filled. A stop-limit gives up certainty of a fill for control of the price.' : 'Price never reached your level, so the order stayed pending. A pending order is not a promise of a trade.'));
    else {
      const dir = dirOf(order.type);
      kids.push(h('b', null, `Filled At ${px(r.fillPrice)}`), h('span', null, r.slipped > 0.000005 ? `That is ${trimN(r.slipped / P, 1)} pips worse than your level. A stop order fills at the next available price.` : r.slipped < -0.000005 ? `That is ${trimN(-r.slipped / P, 1)} pips better than your level. A limit order fills at your price or better.` : 'Filled right at your level.'));
      if (r.exit) kids.push(h('span', null, `Then the ${r.exit.reason} closed it at ${px(r.exit.price)}${r.r !== null ? `, a result of ${rTxt(r.r)}` : ''}.`));
      else kids.push(h('span', null, `The trade was still open at the end (${dir > 0 ? 'bid' : 'ask'} ${px(r.closePrice)}).`));
    }
    return h('div', { class: 'os-result' }, ...kids);
  };

  const runIt = (order) => {
    const v = validate(order, { bid: cur().bid, ask: cur().ask });
    if (!v.ok) {
      out.replaceChildren(h('div', { class: 'notice warn' }, 'Rejected: ' + v.message), h('p', { class: 'os-note' }, 'Change the order and try again.'));
      return;
    }
    const r = runOrder(path, order, { start: START });
    out.replaceChildren(h('p', { class: 'os-note' }, 'Running…'));
    playPath(path.length - 1, START, (i) => draw(i, { lines: showLines(), fill: r.filled && r.fillIndex <= i ? { index: r.fillIndex, price: r.fillPrice } : null, exit: r.exit && r.exit.index <= i ? r.exit : null }), () => {
      out.replaceChildren(result(r, order), h('div', { class: 'qactions' }, button('New Prices', { variant: 'ghost', onClick: reset })));
      runs += 1;
      emit('sim.run', { sim: 'ordersim', mode, type: order.type, filled: r.filled });
      if (runs >= (spec.minRuns || 1)) onInteract();
    });
  };

  /* -------- pending and bracket */
  const buildPending = () => {
    const types = [];
    const levels = [];
    const sls = [];
    const tps = [];
    const dirTypes = [['buy-limit', 'Buy Limit'], ['buy-stop', 'Buy Stop'], ['sell-limit', 'Sell Limit'], ['sell-stop', 'Sell Stop']].filter(([t]) => !spec.types || spec.types.includes(t));
    const place = button('Place The Order', { disabled: true, onClick: () => {
      const order = { type: state.type, level: state.level };
      if (mode === 'bracket') {
        const dir = dirOf(state.type);
        order.sl = +(state.level - dir * state.slPips * P).toFixed(5);
        order.tp = +(state.level + dir * state.tpPips * P).toFixed(5);
      }
      showState(order);
      runIt(order);
    } });
    const showState = (order) => {
      state.sl = order.sl ?? null;
      state.tp = order.tp ?? null;
    };
    const ready = () => (place.disabled = !(state.type && state.level !== null && (mode !== 'bracket' || (state.slPips && state.tpPips))));
    const lvlBtns = [-20, -10, -5, 5, 10, 20].map((p) => chip(`${p > 0 ? '+' : '−'}${Math.abs(p)} pips · ${px(lvl(p))}`, p, levels, (v) => {
      state.level = lvl(v);
      draw(now, { lines: [{ price: state.level, label: TYPE_NAMES[state.type] || 'Level', tone: 'entry' }] });
      ready();
    }));
    const rows = [
      h('p', { class: 'lab-q' }, spec.question || 'Choose the order that fits, and a price for it.'),
      h('div', { class: 'choices' }, ...dirTypes.map(([t, l]) => chip(l, t, types, (v) => { state.type = v; ready(); }))),
      h('div', { class: 'choices wrap' }, ...lvlBtns)
    ];
    if (mode === 'bracket') {
      rows.push(h('p', { class: 'lab-q' }, 'Attach a stop-loss and a take-profit (pips from your entry).'),
        h('div', { class: 'choices' }, ...[10, 20, 30].map((p) => chip(`Stop ${p}`, p, sls, (v) => { state.slPips = v; ready(); }))),
        h('div', { class: 'choices' }, ...[20, 40, 60].map((p) => chip(`Target ${p}`, p, tps, (v) => { state.tpPips = v; ready(); }))));
    }
    rows.push(h('div', { class: 'lab-actions' }, place));
    return rows;
  };

  /* -------- market orders */
  const buildMarket = () => {
    const speeds = [];
    const log = h('div', { class: 'os-log' });
    const rows = [];
    const buy = button('Buy At Market', { onClick: () => {
      const displayed = path[START].ask;
      const r = runOrder(path, { type: 'market-buy' }, { start: START, latency: 3 });
      const slip = r.fillPrice - displayed;
      playPath(START + 4, START, (i) => draw(i, { lines: [{ price: displayed, label: 'Shown', tone: 'entry' }], fill: i >= START + 3 ? { index: START + 3, price: r.fillPrice } : null }), () => {
        rows.push([speed, displayed, r.fillPrice, slip]);
        if (speed === 'fast') fastRuns += 1;
        else quietRuns += 1;
        log.replaceChildren(...rows.slice(-4).map((row) => h('div', { class: 'pc-row' }, h('span', null, `${row[0] === 'fast' ? 'Fast market' : 'Quiet market'}: shown ${px(row[1])}`), h('b', null, `filled ${px(row[2])} · ${row[3] >= 0 ? '' : '−'}${trimN(Math.abs(row[3]) / P, 1)} pips ${row[3] >= 0 ? 'worse' : 'better'}`))));
        emit('sim.run', { sim: 'ordersim', mode: 'market', speed });
        if (fastRuns >= 1 && quietRuns >= 1) {
          out.replaceChildren(h('p', { class: 'lab-teach', html: mdInline('A market order fills at the **next available price**, not at the price you saw. In a fast market that price can be several pips away. In a quiet one it is usually close.') }));
          onInteract();
        }
        reset('path');
      });
    } });
    const speedBtns = [chip('Quiet Market', 'quiet', speeds, (v) => { speed = v; reset('path'); }), chip('Fast Market', 'fast', speeds, (v) => { speed = v; reset('path'); })];
    mark(speeds, speed);
    return [h('p', { class: 'lab-q' }, 'Buy at the price you see. Try a quiet market and a fast one. Compare the price you see with the price you get.'), h('div', { class: 'choices' }, ...speedBtns), h('div', { class: 'lab-actions' }, buy), log];
  };

  /* -------- stop against stop-limit on the same jump */
  const buildStopLimit = () => {
    const trig = [];
    const lim = [];
    const go = button('Run Both Orders', { disabled: true, onClick: () => {
      const trigger = lvl(state.trigPips);
      const limit = +(trigger + state.limPips * P).toFixed(5);
      state.level = trigger;
      state.limit = limit;
      const a = runOrder(path, { type: 'buy-stop', level: trigger }, { start: START });
      const b = runOrder(path, { type: 'buy-stop-limit', level: trigger, limit }, { start: START });
      out.replaceChildren(h('p', { class: 'os-note' }, 'Running…'));
      playPath(path.length - 1, START, (i) => draw(i, { lines: [{ price: trigger, label: 'Trigger', tone: 'entry' }, { price: limit, label: 'Limit', tone: 'level' }], fill: a.filled && a.fillIndex <= i ? { index: a.fillIndex, price: a.fillPrice } : null }), () => {
        out.replaceChildren(
          h('div', { class: 'fs-grid' },
            h('div', { class: 'fs-card' }, h('b', null, 'Buy Stop'), h('strong', null, a.filled ? 'Filled' : 'Not filled'), h('span', null, a.filled ? `at ${px(a.fillPrice)} (${trimN(Math.max(0, a.slipped) / P, 1)} pips past the trigger)` : 'the price never reached the trigger')),
            h('div', { class: 'fs-card' }, h('b', null, 'Buy Stop-Limit'), h('strong', null, b.filled ? 'Filled' : 'Not filled'), h('span', null, b.filled ? `at ${px(b.fillPrice)}` : b.triggered ? 'triggered, but the price jumped beyond the limit' : 'the price never reached the trigger'))),
          h('p', { class: 'lab-teach', html: mdInline('A **stop** almost always fills, at whatever price is available. A **stop-limit** protects you from a bad price, but it can leave you with **no trade at all**.') }),
          h('div', { class: 'qactions' }, button('New Prices', { variant: 'ghost', onClick: reset })));
        emit('sim.run', { sim: 'ordersim', mode: 'stoplimit' });
        onInteract();
      });
    } });
    const ready = () => (go.disabled = !(state.trigPips && state.limPips));
    return [h('p', { class: 'lab-q' }, 'Set a trigger above the price and a limit above the trigger. Both orders will meet the same fast move.'), h('div', { class: 'choices' }, ...[5, 10, 15].map((p) => chip(`Trigger +${p} pips`, p, trig, (v) => { state.trigPips = v; ready(); }))), h('div', { class: 'choices' }, ...[2, 5, 10].map((p) => chip(`Limit +${p} pips`, p, lim, (v) => { state.limPips = v; ready(); }))), h('div', { class: 'lab-actions' }, go)];
  };

  function reset(only) {
    Object.assign(state, { type: null, level: null, sl: null, tp: null, limit: null, slPips: null, tpPips: null, trigPips: null, limPips: null });
    newPath();
    draw(now);
    if (only === 'path') return;
    out.replaceChildren();
    body.replaceChildren(...(mode === 'market' ? buildMarket() : mode === 'stoplimit' ? buildStopLimit() : buildPending()));
  }
  const body = h('div', { class: 'lab' });
  mount(root, h('p', { class: 'lab-intro' }, spec.introText || 'The chart shows the bid and the ask.'), chart, body, out, note());
  reset();
  return root;
}

/* ------------------------------------------------------------------ the fill simulator */

export function fillsim({ spec = {}, onInteract }) {
  let seed = freshSeed();
  const plan = { entryPips: 8, stopPips: 15, rr: 2 };
  let runs = 0;
  const out = h('div', { class: 'lab-out' });
  const chart = h('div');
  const groups = { e: [], s: [], r: [] };

  const compute = () => {
    const path = pricePath({ seed, start: 1.175, pipSize: P, steps: 80, volPips: 3, driftPips: 0.35, spreadPips: 1 });
    const candles = pathCandles(path, 4);
    const lead = candles.slice(0, 5);
    const ref = lead[lead.length - 1].c;
    const entry = +(ref + plan.entryPips * P).toFixed(5);
    const stop = +(entry - plan.stopPips * P).toFixed(5);
    const target = +(entry + plan.stopPips * plan.rr * P).toFixed(5);
    const rest = candles.slice(5);
    const p = { dir: 1, type: 'stop', entry, stop, target };
    const results = ['touch', 'spread', 'strict'].map((k) => ({ key: k, label: ASSUMPTIONS[k].label, r: simulatePlan({ candles: rest, plan: p, a: assume(ASSUMPTIONS[k], P) }) }));
    chart.replaceChildren(candleChart(candles, { lines: [{ price: entry, label: 'Entry', tone: 'entry' }, { price: stop, label: 'Stop', tone: 'stop' }, { price: target, label: 'Target', tone: 'target' }] }));
    out.replaceChildren(
      h('div', { class: 'fs-grid' }, ...results.map(({ label, r }) => h('div', { class: 'fs-card' }, h('b', null, label), h('strong', null, r.filled ? rTxt(r.r) : 'Not Filled'), h('span', null, r.filled ? `${r.exit.reason === 'open' ? 'still open at the end' : r.exit.reason}${r.ambiguous ? ' · both levels in one candle' : ''}` : 'never reached your entry')))),
      h('p', { class: 'lab-teach', html: mdInline('Same plan, same prices. The result changes with the **assumptions**. A backtest that uses touch fills is more generous than reality. Which line is closest to how a real broker behaves?') }));
    runs += 1;
    emit('sim.run', { sim: 'fillsim', results: results.map((x) => x.r.r) });
    if (runs >= 2) onInteract();
  };
  const setup = (key, list, label, opts, fmt) => h('div', { class: 'choices' }, ...opts.map((v) => chip(fmt(v), v, groups[list], (x) => { plan[key] = x; compute(); })));
  const eBtns = setup('entryPips', 'e', 'entry', [4, 8, 12], (v) => `Entry +${v}`);
  const sBtns = setup('stopPips', 's', 'stop', [10, 15, 25], (v) => `Stop ${v}`);
  const rBtns = setup('rr', 'r', 'rr', [1, 2, 3], (v) => `Target ${v}R`);
  mark(groups.e, plan.entryPips);
  mark(groups.s, plan.stopPips);
  mark(groups.r, plan.rr);
  const root = h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A buy-stop plan on a run of candles. The chart shows bid prices. Change the plan and see how three sets of fill assumptions treat it.'),
    chart, eBtns, sBtns, rBtns, out,
    h('div', { class: 'qactions' }, button('New Prices', { variant: 'ghost', onClick: () => { seed = freshSeed(); compute(); } })), note());
  compute();
  return root;
}

/* ------------------------------------------------------------------ market depth */

export function thindeep({ onInteract }) {
  let book = 'deep';
  let lots = 5;
  let moved = 0;
  const books = [];
  const sizes = [];
  const out = h('div', { class: 'lab-out' });
  const list = h('div', { class: 'ladder-rows' });
  const draw = () => {
    const b = BOOKS[book];
    const w = walkBook(b, lots);
    list.replaceChildren(...b.map((lv) => {
      const took = w.takes.find((t) => t.off === lv.off);
      return h('div', { class: 'ladder-row ' + (took ? 'level' : 'bid') }, h('b', null, `+${trimN(lv.off, 1)} pips`), h('span', null, `${lv.lots} lots offered${took ? ` · you take ${took.lots}` : ''}`));
    }));
    const cost = w.avgPips * 10 * w.filled;
    out.replaceChildren(
      h('div', { class: 'pc-big' }, h('span', null, 'Your Average Fill Is'), h('b', null, `${trimN(w.avgPips, 2)} pips`), h('em', null, `worse than the best price · costs about $${trimN(cost, 0)}${w.unfilled ? ` · ${trimN(w.unfilled, 0)} lots could not be filled` : ''}`)),
      h('p', { class: 'lab-teach', html: mdInline(book === 'thin' ? 'In a **thin** market the first few lots are cheap, then the price moves quickly against a bigger order.' : 'In a **deep** market the same order barely moves the price.') }));
    moved += 1;
    if (moved >= 4) onInteract();
  };
  const root = h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A teaching model of the sell orders waiting above the best price. A market buy uses them up from the best price upward. Real retail platforms often hide this, but the effect is real: liquidity varies.'),
    h('div', { class: 'choices' }, chip('Deep Market', 'deep', books, (v) => { book = v; draw(); }), chip('Thin Market', 'thin', books, (v) => { book = v; draw(); })),
    h('div', { class: 'choices' }, ...[1, 5, 20, 50].map((n) => chip(`${n} lot${n === 1 ? '' : 's'}`, n, sizes, (v) => { lots = v; draw(); }))),
    list, out, note());
  mark(books, book);
  mark(sizes, lots);
  draw();
  moved = 0;
  return root;
}

/* ------------------------------------------------------------------ the news spread replay */

export function newsspread({ onInteract }) {
  const START = 4;
  let stopPips = 12;
  let plays = 0;
  let sawTight = false;
  let sawWide = false;
  const stops = [];
  const chart = h('div');
  const bars = h('div', { class: 'spread-bars' });
  const out = h('div', { class: 'lab-out' });
  const spreadAt = (i) => (i >= 22 && i <= 28 ? 14 : 1);
  const path = pricePath({ seed: 424242, start: 1.175, pipSize: P, steps: 44, volPips: 0.15, spreadPips: 1, spreadAt });
  const entry = path[START].bid;

  const drawBars = (upto) => bars.replaceChildren(...path.slice(0, upto + 1).map((p) => h('i', { class: spreadAt(p.i) > 3 ? 'hot' : '', style: { height: Math.min(100, (spreadAt(p.i) / 14) * 100) + '%' } })));
  const start = () => {
    const sl = +(entry + stopPips * P).toFixed(5);
    const r = runOrder(path, { type: 'market-sell', sl }, { start: START, latency: 0 });
    const stoppedAt = r.exit ? r.exit.index : null;
    out.replaceChildren(h('p', { class: 'os-note' }, 'Replaying the news event…'));
    playPath(path.length - 1, START, (i) => { chart.replaceChildren(pathChart(path, i, { lines: [{ price: sl, label: 'Your stop', tone: 'stop' }], fill: { index: START, price: entry }, exit: stoppedAt !== null && stoppedAt <= i ? r.exit : null })); drawBars(i); }, () => {
      const maxBid = Math.max(...path.map((p) => p.bid));
      const stopped = stoppedAt !== null;
      if (stopped) sawTight = true;
      else sawWide = true;
      out.replaceChildren(h('div', { class: 'os-result' }, h('b', null, stopped ? 'Stopped Out' : 'Not Stopped Out'), h('span', null, stopped ? `Your stop was a BUY order, so it triggered on the ASK. The spread jumped to 14 pips, the ask reached your stop, and the bid only reached ${px(maxBid)}. The chart price alone would not have stopped you out.` : `The ask rose during the spike but never reached your stop ${stopPips} pips above the entry.`)),
        h('p', { class: 'lab-teach', html: mdInline(`A wider spread costs more, and it can trigger stops. A spike of 13 extra pips on a **${stopPips}-pip** stop is **${trimN(13 / stopPips, 2)}R** of extra cost.`) }));
      plays += 1;
      emit('sim.run', { sim: 'newsspread', stopPips, stopped });
      if (sawTight && sawWide) onInteract();
    });
  };
  chart.replaceChildren(pathChart(path, START, { lines: [] }));
  drawBars(START);
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'You are SHORT EUR/USD. Your stop-loss is above your entry. A news release is coming. The bars show the spread.'),
    chart, bars,
    h('p', { class: 'lab-q' }, 'How far above your entry will you put the stop?'),
    h('div', { class: 'choices' }, ...[5, 12, 25, 40].map((p) => chip(`${p} pips`, p, stops, (v) => { stopPips = v; }))),
    h('div', { class: 'lab-actions' }, button('Replay The News', { onClick: start })),
    out, note());
}

/* ------------------------------------------------------------------ TradingView against broker prices */

export function feedcompare({ onInteract }) {
  const path = pricePath({ seed: freshSeed(), start: 1.175, pipSize: P, steps: 60, volPips: 2, spreadPips: 1.2 });
  const rng = makeRng('feed#' + path[10].mid);
  const a = pathCandles(path, 6); // the chart feed: bid prices
  const b = a.map((c) => {
    const off = 1.2 * P + (rng.next() - 0.5) * 0.6 * P; // the broker feed: ask prices from a slightly different source
    return { o: c.o + off, h: c.h + off, l: c.l + off, c: c.c + off };
  });
  const topA = Math.max(...a.map((c) => c.h));
  let pips = 0;
  let seen = 0;
  const readout = h('div', { class: 'lab-out' });
  const chartA = h('div');
  const chartB = h('div');
  const draw = () => {
    const level = +(topA + pips * P).toFixed(5);
    const hitA = a.some((c) => c.h >= level);
    const hitB = b.some((c) => c.h >= level);
    chartA.replaceChildren(h('div', { class: 'stim-title' }, 'Chart Feed (Bid)'), candleChart(a, { lines: [{ price: level, label: 'Level', tone: 'level' }], hgt: 130 }));
    chartB.replaceChildren(h('div', { class: 'stim-title' }, 'Broker Feed (Ask)'), candleChart(b, { lines: [{ price: level, label: 'Level', tone: 'level' }], hgt: 130 }));
    readout.replaceChildren(
      h('div', { class: 'fs-grid' }, h('div', { class: 'fs-card' }, h('b', null, 'Chart'), h('strong', null, hitA ? 'Touched' : 'Not Touched')), h('div', { class: 'fs-card' }, h('b', null, 'Broker'), h('strong', null, hitB ? 'Touched' : 'Not Touched'))),
      hitA !== hitB ? h('p', { class: 'lab-result' }, 'The two feeds disagree about this level.') : h('p', { class: 'hint-line' }, 'Both feeds agree here. Move the level between the highest high on each chart.'));
    if (hitA !== hitB) {
      seen += 1;
      if (seen >= 1) onInteract();
    }
  };
  const slider = h('input', { type: 'range', min: -3, max: 4, step: 0.1, value: 0, 'aria-label': 'Level in pips above the highest high on the chart', oninput: (e) => { pips = +e.target.value; draw(); } });
  const root = h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'The same market, two feeds. The chart shows the bid. Your broker fills buys at the ask, from its own source. Slide a level near the highest high and compare.'),
    chartA, chartB,
    h('label', { class: 'slider' }, h('span', null, 'Level Above The Chart\'s Highest High'), slider),
    readout,
    h('p', { class: 'lab-teach', html: mdInline('Two honest feeds can disagree by a pip or two. A level that was **touched** on your chart may never have been touched at your broker, and the reverse.') }), note());
  draw();
  seen = 0;
  return root;
}

/* ------------------------------------------------------------------ a set of template problems inside a lesson */

export function templateset({ spec, onInteract, lessonId }) {
  const root = h('div', { class: 'lab' });
  const rng = makeRng('set#' + freshSeed());
  const ids = spec.templates;
  const refs = Array.from({ length: spec.count || 8 }, (_, i) => ({ kind: 't', id: ids[i % ids.length], seed: rng.int(1, 2 ** 31 - 1) }));
  const shuffled = rng.shuffle(refs);
  if (spec.unguided) {
    // no hints and no feedback until the set is finished, then a score and the explanations
    runSet({
      container: root,
      refs: shuffled,
      ctx: { kind: 'lab', ref: lessonId, lessonId },
      mode: 'exam',
      onDone: (res) => {
        const graded = gradeAll(res.items, res.responses);
        graded.forEach((g, i) => emit('question.answer', answerPayload(res.items[i], g, { kind: 'lab', ref: lessonId, lessonId })));
        const right = graded.filter((g) => g.correct).length;
        const score = graded.reduce((a, g) => a + (g.score || 0), 0) / graded.length;
        mount(root, h('div', { class: 'check-summary ' + (score >= 0.75 ? 'pass' : 'fail') }, h('div', { class: 'eyebrow' }, 'Unguided Set Finished'), h('div', { class: 'big-score' }, Math.round(score * 100) + '%'), h('p', null, `${right} of ${graded.length} fully right.`)),
          h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Each Chart'), ...graded.map((g, i) => h('div', { class: 'weak-row' }, h('span', null, `${i + 1}. ${res.items[i].problem.prompt}`), h('b', { class: g.correct ? '' : 'low' }, g.correct ? '✓' : Math.round((g.score || 0) * 100) + '%')))),
          h('div', { class: 'qactions' }, button('Run Another Set', { variant: 'ghost', onClick: () => root.replaceWith(templateset({ spec, onInteract, lessonId })) })));
        onInteract();
      }
    });
    return root;
  }
  runSet({
    container: root,
    refs: shuffled,
    ctx: { kind: 'lab', ref: lessonId, lessonId },
    mode: 'practice',
    onDone: (res) => {
      mount(root, h('div', { class: 'check-summary pass' }, h('div', { class: 'eyebrow' }, 'Set Finished'), h('div', { class: 'big-score' }, Math.round(res.score * 100) + '%'), h('p', null, `${res.correct} of ${res.n} right.`), h('div', { class: 'qactions' }, button('Run Another Set', { variant: 'ghost', onClick: () => root.replaceWith(templateset({ spec, onInteract, lessonId })) }))));
      onInteract();
    }
  });
  return root;
}
