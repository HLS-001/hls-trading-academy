/**
 * Reaction counting: how often price, on reaching a level, moved away from it, and how often it went through it.
 * Used to compare a chosen level with random levels on the same chart, which is the honest way to ask whether a level "holds".
 * Simulated. Illustrates a mechanism; predicts nothing.
 *
 * A visit starts when a bar's range overlaps the zone (level ± tol) and the bar before did not.
 *   reacted   within `within` bars, price moved `away` from the level without a close beyond the far side of the zone
 *   broke     a bar closed beyond the far side of the zone first
 *   neither   neither happened within the window
 * side 'resistance': the level is above the price; 'support': below.
 */

import { makeRng } from '../learn/rng.js';

export function reactions(candles, level, { side = 'resistance', tol, away, within = 12, from = 0, to = candles.length - 1 }) {
  let touches = 0;
  let reacted = 0;
  let broke = 0;
  let neither = 0;
  const visits = [];
  let prevTouch = false;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    const touch = c[1] >= level - tol && c[2] <= level + tol;
    if (touch && !prevTouch) {
      touches += 1;
      let outcome = 'neither';
      for (let j = i; j <= Math.min(to, i + within); j++) {
        const cj = candles[j];
        if (side === 'resistance' ? cj[3] > level + tol : cj[3] < level - tol) {
          outcome = 'broke';
          break;
        }
        if (j > i && (side === 'resistance' ? cj[2] <= level - away : cj[1] >= level + away)) {
          outcome = 'reacted';
          break;
        }
      }
      visits.push({ i, outcome });
      if (outcome === 'reacted') reacted += 1;
      else if (outcome === 'broke') broke += 1;
      else neither += 1;
      prevTouch = true;
      continue;
    }
    prevTouch = touch;
  }
  return { touches, reacted, broke, neither, visits, rate: reacted + broke ? reacted / (reacted + broke) : null };
}

/** The reaction rate of many random levels over the same window: the yardstick a chosen level must beat. */
export function randomLevelRates(candles, { seed, count = 300, tol, away, within = 12, from, to, minTouches = 3 }) {
  const rng = makeRng('rl#' + seed);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i <= to; i++) {
    lo = Math.min(lo, candles[i][2]);
    hi = Math.max(hi, candles[i][1]);
  }
  const start = candles[from][0];
  const rates = [];
  for (let k = 0; k < count; k++) {
    const level = lo + (hi - lo) * rng.next();
    const side = level >= start ? 'resistance' : 'support';
    const r = reactions(candles, level, { side, tol, away, within, from, to });
    if (r.touches >= minTouches && r.rate !== null) rates.push(r.rate);
  }
  rates.sort((a, b) => a - b);
  const q = (p) => (rates.length ? rates[Math.min(rates.length - 1, Math.floor(p * rates.length))] : null);
  return { n: rates.length, median: q(0.5), p10: q(0.1), p90: q(0.9), rates };
}
