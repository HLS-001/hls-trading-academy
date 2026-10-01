/**
 * The Randomness Lab and the Noise Mine. Both show what chance alone produces.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { makeRng } from '../learn/rng.js';
import { gauss } from './paths.js';
import { mean, sd, bootstrapInterval } from '../learn/stats.js';

/**
 * Many traders with the SAME fair rules: each trade wins with the given probability and pays winR or loses lossR. Nobody has an edge
 * when winRate × winR = (1 − winRate) × lossR. Returns each trader's result, and how many look profitable or "significant".
 */
export function randomTraders({ seed = 1, traders = 100, trades = 50, winRate = 0.5, winR = 1, lossR = 1 } = {}) {
  const rng = makeRng(seed);
  const list = [];
  for (let t = 0; t < traders; t++) {
    const rs = [];
    for (let i = 0; i < trades; i++) rs.push(rng.next() < winRate ? winR : -lossR);
    const total = rs.reduce((a, b) => a + b, 0);
    const iv = bootstrapInterval(rs, { seed: seed * 1000 + t, resamples: 400 });
    list.push({ id: t + 1, total, avg: total / trades, lo: iv.lo, hi: iv.hi, looksGood: iv.lo > 0, rs });
  }
  list.sort((a, b) => b.total - a.total);
  const edge = winRate * winR - (1 - winRate) * lossR;
  return {
    traders: list,
    edge,
    profitable: list.filter((x) => x.total > 0).length,
    significant: list.filter((x) => x.looksGood).length,
    best: list[0],
    worst: list[list.length - 1]
  };
}

/** A random-walk series of closes. No edge in it by construction. */
export function randomCloses(seed, n, vol = 1) {
  const rng = makeRng(seed);
  const out = [100];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + gauss(rng) * vol);
  return out;
}

/**
 * The trades a simple rule takes on a series: when a close breaks the highest close of the last `look` bars, go with it (mode 'trend')
 * or against it ('fade'), and hold for `hold` bars. R is the move divided by the series' typical hold-period move, so every rule
 * is on the same scale.
 */
export function ruleTrades(closes, { look, hold, mode }, from = 0, to = closes.length - 1, unit = 1) {
  const rs = [];
  let i = Math.max(look, from);
  while (i + hold <= to) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = i - look; k < i; k++) {
      hi = Math.max(hi, closes[k]);
      lo = Math.min(lo, closes[k]);
    }
    const up = closes[i] > hi;
    const down = closes[i] < lo;
    if (up || down) {
      const dir = (up ? 1 : -1) * (mode === 'fade' ? -1 : 1);
      rs.push((dir * (closes[i + hold] - closes[i])) / unit);
      i += hold;
    } else i += 1;
  }
  return rs;
}

/** The family of rules the mine searches: every combination of lookback, hold and mode. */
export function ruleFamily(k, seed) {
  const all = [];
  for (const look of [3, 5, 8, 10, 15, 20, 30, 40]) for (const hold of [2, 3, 5, 8, 12, 20]) for (const mode of ['trend', 'fade']) all.push({ look, hold, mode });
  const rng = makeRng(seed);
  return rng.shuffle(all).slice(0, Math.min(k, all.length));
}

/**
 * Search random data for the best rule in-sample, then run that one rule on new random data. The in-sample winner is chosen FROM the
 * noise, so it looks good there and has no reason to look good afterwards.
 */
export function noiseMine({ seed = 1, rules = 30, bars = 400, minTrades = 12 } = {}) {
  const data = randomCloses(seed, bars * 2, 1);
  const isData = data.slice(0, bars);
  const oosData = data.slice(bars);
  const unit = (n) => Math.sqrt(n);
  const family = ruleFamily(rules, seed + 7);
  const scored = family.map((r) => {
    const a = ruleTrades(isData, r, 0, isData.length - 1, unit(r.hold));
    const b = ruleTrades(oosData, r, 0, oosData.length - 1, unit(r.hold));
    return { rule: r, isTrades: a.length, isAvg: a.length ? mean(a) : -Infinity, oosTrades: b.length, oosAvg: b.length ? mean(b) : 0, isR: a, oosR: b };
  }).filter((x) => x.isTrades >= minTrades);
  scored.sort((x, y) => y.isAvg - x.isAvg);
  return { tested: scored.length, best: scored[0] || null, all: scored };
}

/** How often the best of K rules on pure noise looks good in-sample, and what it does out-of-sample, over many runs. */
export function noiseMineRepeat({ seed = 1, rules = 30, runs = 40, bars = 400, good = 0.2 } = {}) {
  let looksGood = 0;
  let oosGood = 0;
  const isAvgs = [];
  const oosAvgs = [];
  for (let k = 0; k < runs; k++) {
    const r = noiseMine({ seed: seed * 100 + k, rules, bars });
    if (!r.best) continue;
    isAvgs.push(r.best.isAvg);
    oosAvgs.push(r.best.oosAvg);
    if (r.best.isAvg >= good) looksGood += 1;
    if (r.best.oosAvg >= good) oosGood += 1;
  }
  return { runs: isAvgs.length, looksGood, oosGood, meanIs: mean(isAvgs), meanOos: mean(oosAvgs), sdOos: sd(oosAvgs) };
}
