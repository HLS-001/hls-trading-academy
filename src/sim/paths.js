/**
 * Seeded price paths for the order, fill and trade-ticket simulations, and for teaching charts made of plain lines.
 * Uses only + - * / so the same seed gives the same path on every device.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { makeRng } from '../learn/rng.js';

/** An approximately normal number (Irwin-Hall: the sum of 12 uniforms minus 6). Exact on every device. */
export function gauss(rng) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += rng.next();
  return s - 6;
}

/**
 * A mid-price random walk with a bid and an ask around it.
 *   start, pipSize, steps        where it starts, the size of one pip, how many points
 *   volPips                      typical move per step, in pips
 *   driftPips                    average push per step, in pips (0 = none)
 *   spreadPips                   the gap between bid and ask, in pips
 *   spreadAt(i)                  optional: the spread at step i (for news and rollover examples)
 * Returns [{ i, mid, bid, ask }]. Prices are rounded to a tenth of a pip.
 */
export function pricePath({ seed, start, pipSize, steps = 60, volPips = 2, driftPips = 0, spreadPips = 1, spreadAt }) {
  const rng = makeRng('path#' + seed);
  const tenth = pipSize / 10;
  const round = (x) => Math.round(x / tenth) * tenth;
  let mid = start;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    if (i > 0) mid += (driftPips + volPips * gauss(rng)) * pipSize;
    const sp = (spreadAt ? spreadAt(i) : spreadPips) * pipSize;
    out.push({ i, mid: round(mid), bid: round(mid - sp / 2), ask: round(mid + sp / 2) });
  }
  return out;
}

/** Group a path into candles of `per` points each: [{ o, h, l, c }] on the mid price. */
export function pathCandles(path, per = 5) {
  const out = [];
  for (let i = 0; i + per <= path.length; i += per) {
    const seg = path.slice(i, i + per).map((p) => p.mid);
    out.push({ o: seg[0], h: Math.max(...seg), l: Math.min(...seg), c: seg[seg.length - 1] });
  }
  return out;
}
