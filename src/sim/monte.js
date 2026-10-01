/**
 * Simulations of trade results: equity curves, drawdown, risk of ruin and Monte Carlo runs.
 * Every run is seeded, so any result can be replayed. Results are DISTRIBUTIONS, never a single path presented as
 * "what will happen". Simulated. Illustrates a mechanism; predicts nothing.
 */

import { makeRng } from '../learn/rng.js';
import { recoveryRequired } from '../calc/index.js';

/** A random series of results in R: each trade wins winR with probability winRate, otherwise loses lossR. */
export function tradeSeries({ seed, n, winRate, winR = 1, lossR = 1 }) {
  const rng = makeRng('series#' + seed);
  return Array.from({ length: n }, () => (rng.next() < winRate ? winR : -lossR));
}

/**
 * The equity curve of a list of results in R, starting at `start`.
 *   mode 'percent' risks riskPct of the CURRENT equity on every trade (compounding)
 *   mode 'fixed'   risks riskPct of the STARTING equity on every trade (a fixed dollar amount)
 * Returns the equity after each trade, with the starting value first.
 */
export function equityCurve(rs, { mode = 'percent', riskPct = 1, start = 10000 } = {}) {
  let eq = start;
  const out = [start];
  for (const r of rs) {
    const risk = mode === 'percent' ? (eq * riskPct) / 100 : (start * riskPct) / 100;
    eq += r * risk;
    out.push(eq);
  }
  return out;
}

/** Largest peak-to-trough fall of a curve, as a fraction of the peak. */
export function maxDrawdown(curve) {
  let peak = curve[0];
  let dd = 0;
  let where = { peakI: 0, troughI: 0 };
  let peakI = 0;
  curve.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakI = i;
    }
    const d = peak > 0 ? (peak - v) / peak : 0;
    if (d > dd) {
      dd = d;
      where = { peakI, troughI: i };
    }
  });
  return { dd, ...where, recovery: dd >= 1 ? Infinity : recoveryRequired(dd) };
}

/** The longest run of losing trades. */
export const longestLosingRun = (rs) => {
  let cur = 0;
  let best = 0;
  for (const r of rs) {
    cur = r < 0 ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
};

/** Percentile of a list (0 to 1), by nearest rank. */
export function percentile(list, p) {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

/**
 * Risk of ruin by simulation. "Ruin" is defined FIRST: the account suffers a drawdown of at least ruinDD (a fraction).
 * Returns the share of runs, out of `runs`, that reached it within `trades` trades.
 */
export function ruinProbability({ seed, winRate, winR = 1, lossR = 1, riskPct, trades = 200, ruinDD = 0.5, runs = 1000, mode = 'percent' }) {
  const rng = makeRng('ruin#' + seed);
  let ruined = 0;
  for (let k = 0; k < runs; k++) {
    let eq = 1;
    let peak = 1;
    let hit = false;
    for (let i = 0; i < trades && !hit; i++) {
      const risk = mode === 'percent' ? (eq * riskPct) / 100 : (riskPct / 100);
      eq += (rng.next() < winRate ? winR : -lossR) * risk;
      if (eq > peak) peak = eq;
      if (eq <= 0 || (peak - eq) / peak >= ruinDD) hit = true;
    }
    if (hit) ruined += 1;
  }
  return ruined / runs;
}

/** Many runs of the same rules. Returns the distribution of ending equity, maximum drawdown and the longest losing run. */
export function monteCarlo({ seed, winRate, winR = 1, lossR = 1, riskPct = 1, trades = 100, runs = 2000, mode = 'percent', start = 10000 }) {
  const rng = makeRng('mc#' + seed);
  const ending = [];
  const dds = [];
  const streaks = [];
  for (let k = 0; k < runs; k++) {
    let eq = start;
    let peak = start;
    let dd = 0;
    let cur = 0;
    let best = 0;
    for (let i = 0; i < trades; i++) {
      const risk = mode === 'percent' ? (eq * riskPct) / 100 : (start * riskPct) / 100;
      const win = rng.next() < winRate;
      eq += (win ? winR : -lossR) * risk;
      if (eq > peak) peak = eq;
      if (peak > 0 && (peak - eq) / peak > dd) dd = (peak - eq) / peak;
      cur = win ? 0 : cur + 1;
      if (cur > best) best = cur;
    }
    ending.push(eq);
    dds.push(dd);
    streaks.push(best);
  }
  const pick = (list) => ({ p5: percentile(list, 0.05), p25: percentile(list, 0.25), p50: percentile(list, 0.5), p75: percentile(list, 0.75), p95: percentile(list, 0.95) });
  return { ending: pick(ending), drawdown: pick(dds), streak: pick(streaks), runs, trades };
}

/**
 * A fan of equity paths from the same rules, for drawing. Returns `paths` curves, each `trades + 1` long.
 */
export function pathFan({ seed, winRate, winR = 1, lossR = 1, riskPct = 1, trades = 100, paths = 30, mode = 'percent', start = 10000 }) {
  return Array.from({ length: paths }, (_, k) => equityCurve(tradeSeries({ seed: seed + '#' + k, n: trades, winRate, winR, lossR }), { mode, riskPct, start }));
}
