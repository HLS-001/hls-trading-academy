/**
 * The Backtest Lab's data and its Training Rule Pack, evaluated exactly. Synthetic bars with no edge in them. The rules are
 * mechanical so the evaluator can find every valid setup, and the student's log can be checked against it.
 *
 *   Setup    the close of a bar is above the highest high of the previous 10 bars
 *   Entry    buy at the open of the next bar, paying the spread (and any slippage the student declared)
 *   Stop     1 pip below the lowest low of the last 10 bars, including the setup bar
 *   Target   a fixed 2R
 *   Skip     the spread at the entry bar is above 2.0 pips, or the stop distance is under 5 pips
 *   Busy     no new entry while a trade is open
 *   Fills    candles are bid; stop and target in one candle: stop first; a gap through either fills at the open
 *
 * Prices are kept in pips from a base, so nothing drifts in floating point. Simulated. Predicts nothing.
 */

import { makeRng } from '../learn/rng.js';
import { gauss } from './paths.js';

export const BT = { look: 4, stopLook: 3, rr: 2, maxSpread: 2.0, minStop: 4, stopBuffer: 1, isBars: 300, oosBars: 200, base: 1.1, pip: 0.0001 };
export const BT_RULES = [
  'Setup: the close of a bar is above the highest high of the previous 4 bars.',
  'Entry: buy at the open of the next bar. You pay the spread, and any slippage you declared.',
  'Stop: 1 pip below the lowest low of the last 3 bars, including the setup bar.',
  'Target: a fixed 2R.',
  'No trade: the spread at the entry bar is above 2.0 pips, or the stop would be under 4 pips.',
  'One trade at a time: no new entry while a trade is open.',
  'Stop and target in one candle: the stop is taken first. A gap through either fills at the open.'
];

const r1 = (x) => Math.round(x * 10) / 10;

/** Bars as { o, h, l, c, spread } in pips from the base. The in-sample bars come first, the out-of-sample bars after. */
export function btSeries(seed) {
  const rng = makeRng(seed);
  const n = BT.isBars + BT.oosBars;
  const bars = [];
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const vol = 3.4 + 1.4 * Math.sin(i / 23) + Math.abs(gauss(rng)) * 0.4;
    const o = r1(prev + gauss(rng) * 0.6);
    const c = r1(o + gauss(rng) * vol);
    const h = r1(Math.max(o, c) + Math.abs(gauss(rng)) * 1.0);
    const l = r1(Math.min(o, c) - Math.abs(gauss(rng)) * 1.0);
    const spike = rng.next() < 0.07;
    const spread = r1(spike ? 2.3 + rng.next() * 1.4 : 0.8 + rng.next() * 0.6);
    bars.push({ o, h, l, c, spread });
    prev = c;
  }
  return bars;
}

export const px = (pips) => (BT.base + pips * BT.pip).toFixed(4);

/** The highest high of the previous `look` bars before bar i. */
export const levelAt = (bars, i) => {
  let m = -Infinity;
  for (let k = Math.max(0, i - BT.look); k < i; k++) m = Math.max(m, bars[k].h);
  return m;
};

/**
 * Every setup the rule finds between two bars (inclusive), in order, each with its status and, when a trade is taken, its exit and R.
 * status: 'valid', 'skip-spread' or 'skip-stop'. A setup that arrives while a trade is open is not an event at all.
 */
export function scanSetups(bars, from, to, { slip = 0, noSpread = false, sameCandle = 'stop' } = {}) {
  const events = [];
  let busyUntil = -1;
  for (let i = Math.max(BT.look, from); i < to; i++) {
    if (i < busyUntil) continue;
    if (!(bars[i].c > levelAt(bars, i))) continue;
    const eb = i + 1;
    const spread = bars[eb].spread;
    if (spread > BT.maxSpread) {
      events.push({ bar: i, entryBar: eb, status: 'skip-spread', spread });
      continue;
    }
    let low = Infinity;
    for (let k = i - BT.stopLook + 1; k <= i; k++) low = Math.min(low, bars[k].l);
    const stop = r1(low - BT.stopBuffer);
    const entry = r1(bars[eb].o + (noSpread ? 0 : spread) + slip);
    const dist = entry - stop;
    if (dist < BT.minStop) {
      events.push({ bar: i, entryBar: eb, status: 'skip-stop', spread, stop, entry });
      continue;
    }
    const target = r1(entry + BT.rr * dist);
    let exitBar = null;
    let exit = null;
    let how = null;
    for (let j = eb; j <= to; j++) {
      const b = bars[j];
      const stopHit = b.l <= stop;
      const targetHit = b.h >= target;
      if (j > eb && b.o <= stop) { exit = b.o; how = 'gap-stop'; exitBar = j; break; }
      if (j > eb && b.o >= target) { exit = b.o; how = 'gap-target'; exitBar = j; break; }
      if (stopHit && targetHit) { exit = sameCandle === 'target' ? target : stop; how = sameCandle === 'target' ? 'target' : 'stop'; exitBar = j; break; }
      if (stopHit) { exit = stop; how = 'stop'; exitBar = j; break; }
      if (targetHit) { exit = target; how = 'target'; exitBar = j; break; }
    }
    let forced = false;
    if (exitBar === null) { exitBar = to; exit = bars[to].c; how = 'end'; forced = true; }
    const r = (exit - entry) / dist;
    events.push({ bar: i, entryBar: eb, status: 'valid', spread, entry, stop, target, dist, exitBar, exit, how, forced, r: Math.round(r * 100) / 100 });
    busyUntil = exitBar;
  }
  return events;
}

/** The two windows of a run. */
export const windows = () => ({ is: [0, BT.isBars - 1], oos: [BT.isBars, BT.isBars + BT.oosBars - 1] });

/**
 * A plan simulated from the entry bar: buy at the next open plus the spread, the student's stop, a target of rr times the distance.
 * Same fill rules as the scan: the stop is taken first when one candle reaches both, and a gap fills at the open.
 */
export function simulateEntry(bars, eb, { stop, rr, slip = 0 }, to) {
  const entry = r1(bars[eb].o + bars[eb].spread + slip);
  const dist = entry - stop;
  if (!(dist > 0)) return { entry, dist, filled: false, reason: 'The stop is not below the entry.' };
  const target = r1(entry + rr * dist);
  for (let j = eb; j <= to; j++) {
    const b = bars[j];
    if (j > eb && b.o <= stop) return { entry, dist, target, exitBar: j, exit: b.o, how: 'gap-stop', r: Math.round(((b.o - entry) / dist) * 100) / 100, filled: true };
    if (j > eb && b.o >= target) return { entry, dist, target, exitBar: j, exit: b.o, how: 'gap-target', r: Math.round(((b.o - entry) / dist) * 100) / 100, filled: true };
    if (b.l <= stop) return { entry, dist, target, exitBar: j, exit: stop, how: 'stop', r: -1, filled: true };
    if (b.h >= target) return { entry, dist, target, exitBar: j, exit: target, how: 'target', r: rr, filled: true };
  }
  return { entry, dist, target, exitBar: to, exit: bars[to].c, how: 'end', r: Math.round(((bars[to].c - entry) / dist) * 100) / 100, filled: true, forced: true };
}
