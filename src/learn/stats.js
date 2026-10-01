/**
 * Performance statistics and their uncertainty, all in R. Pure functions with seeded randomness, so the same list gives the same
 * interval on every device and in the tests. The intervals are approximate and exist to build the habit of asking how sure you are.
 */

import { makeRng } from './rng.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : 0);
export const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
};
const pct = (sorted, p) => {
  if (!sorted.length) return 0;
  const k = (sorted.length - 1) * p;
  const f = Math.floor(k);
  const c = Math.min(sorted.length - 1, f + 1);
  return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
};

/** Cumulative R, starting at 0 before the first trade. */
export function cumulative(rs) {
  const out = [0];
  for (const r of rs) out.push(out[out.length - 1] + r);
  return out;
}

/** The largest peak-to-trough fall of cumulative R, with where it began, bottomed and recovered (null when it has not). */
export function drawdown(rs) {
  const c = cumulative(rs);
  let peak = 0;
  let peakI = 0;
  let best = { depth: 0, peakI: 0, troughI: 0, recoveredI: null };
  for (let i = 1; i < c.length; i++) {
    if (c[i] > peak) {
      peak = c[i];
      peakI = i;
    }
    const d = peak - c[i];
    if (d > best.depth) best = { depth: d, peakI, troughI: i, recoveredI: null };
  }
  if (best.depth > 0) {
    const level = c[best.peakI];
    for (let i = best.troughI + 1; i < c.length; i++) {
      if (c[i] >= level) {
        best.recoveredI = i;
        break;
      }
    }
  }
  return best;
}

export function streaks(rs, be = 0.1) {
  let win = 0;
  let loss = 0;
  let cw = 0;
  let cl = 0;
  for (const r of rs) {
    if (r > be) {
      cw += 1;
      cl = 0;
    } else if (r < -be) {
      cl += 1;
      cw = 0;
    } else {
      cw = 0;
      cl = 0;
    }
    win = Math.max(win, cw);
    loss = Math.max(loss, cl);
  }
  return { win, loss };
}

/** A histogram of R in bins of the given width. */
export function histogram(rs, width = 0.5) {
  if (!rs.length) return [];
  const lo = Math.floor(Math.min(...rs) / width) * width;
  const hi = Math.ceil((Math.max(...rs) + 1e-9) / width) * width;
  const bins = [];
  for (let b = lo; b < hi - 1e-9; b += width) bins.push({ from: +b.toFixed(6), to: +(b + width).toFixed(6), n: 0 });
  for (const r of rs) {
    const k = Math.min(bins.length - 1, Math.floor((r - lo) / width + 1e-9));
    bins[k].n += 1;
  }
  return bins;
}

/**
 * The basic statistics. Breakeven trades (|R| at or under the threshold) are counted and reported apart from wins and losses.
 */
export function tradeStats(rs, { be = 0.1 } = {}) {
  const n = rs.length;
  const wins = rs.filter((r) => r > be);
  const losses = rs.filter((r) => r < -be);
  const gross = sum(wins.length ? rs.filter((r) => r > 0) : []);
  const grossLoss = Math.abs(sum(rs.filter((r) => r < 0)));
  const dd = drawdown(rs);
  return {
    n,
    wins: wins.length,
    losses: losses.length,
    breakeven: n - wins.length - losses.length,
    winRate: n ? wins.length / n : null,
    avgR: n ? mean(rs) : null,
    medianR: n ? median(rs) : null,
    expectancy: n ? mean(rs) : null,
    profitFactor: grossLoss > 0 ? sum(rs.filter((r) => r > 0)) / grossLoss : null,
    avgWin: wins.length ? mean(wins) : null,
    avgLoss: losses.length ? mean(losses) : null,
    maxDrawdown: dd,
    streaks: streaks(rs, be),
    sd: sd(rs),
    total: sum(rs),
    gross
  };
}

/** A bootstrap percentile interval on the average R, with the standard error. */
export function bootstrapInterval(rs, { seed = 1, resamples = 5000, conf = 0.95 } = {}) {
  const n = rs.length;
  if (n < 2) return { lo: null, hi: null, se: null, mean: n ? rs[0] : null, includesZero: null };
  const rng = makeRng(seed);
  const means = new Array(resamples);
  for (let k = 0; k < resamples; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rs[Math.floor(rng.next() * n)];
    means[k] = s / n;
  }
  means.sort((a, b) => a - b);
  const a = (1 - conf) / 2;
  const lo = pct(means, a);
  const hi = pct(means, 1 - a);
  return { lo, hi, se: sd(rs) / Math.sqrt(n), mean: mean(rs), includesZero: lo <= 0 && hi >= 0 };
}

/**
 * The sign-flip test. Under "no edge" each trade could as easily have been +|R| as -|R|. Flip the signs at random many times and
 * count how often the average is at least as good as the real one. The answer is a share of runs, not a verdict.
 */
export function signFlip(rs, { seed = 2, runs = 5000 } = {}) {
  const n = rs.length;
  if (!n) return { p: null, runs };
  const obs = mean(rs);
  const abs = rs.map(Math.abs);
  const rng = makeRng(seed);
  let hit = 0;
  for (let k = 0; k < runs; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rng.next() < 0.5 ? abs[i] : -abs[i];
    if (s / n >= obs - 1e-12) hit += 1;
  }
  return { p: hit / runs, runs };
}

/** A teaching label for the sample size. The interval is the real answer. */
export function sampleBand(n) {
  if (n < 30) return 'Too few to say anything';
  if (n < 100) return 'Weak';
  if (n < 300) return 'Moderate';
  return 'Reasonable for a first look';
}

/** How many trades it takes to tell an average of the given size from zero at this spread of R (about 80% power, 95% level). */
export function tradesNeeded(rs, effect = 0.2) {
  const s = sd(rs);
  if (!s) return null;
  return Math.ceil(((1.96 + 0.84) * s / effect) ** 2);
}

/** The band of equity curves made by reordering the SAME trades: the 5th and 95th percentile of cumulative R at each trade. */
export function reshuffleBand(rs, { seed = 3, runs = 400 } = {}) {
  const n = rs.length;
  if (!n) return { lo: [0], hi: [0] };
  const rng = makeRng(seed);
  const cols = Array.from({ length: n + 1 }, () => []);
  for (let k = 0; k < runs; k++) {
    const order = rng.shuffle(rs);
    let c = 0;
    cols[0].push(0);
    for (let i = 0; i < n; i++) {
      c += order[i];
      cols[i + 1].push(c);
    }
  }
  const lo = cols.map((col) => pct(col.sort((a, b) => a - b), 0.05));
  const hi = cols.map((col) => pct(col, 0.95));
  return { lo, hi };
}

/**
 * Whether a stated conclusion is calibrated to the interval. "edge" is not allowed when the interval includes zero, "no-edge" is not
 * allowed when the whole interval is above zero, and a verdict needs an interval to be stated at all.
 */
export function calibrated(verdict, interval) {
  if (!interval || interval.lo === null || interval.hi === null) return { ok: false, why: 'The conclusion has no interval.' };
  if (verdict === 'edge' && interval.lo <= 0) return { ok: false, why: 'An edge cannot be claimed when the interval includes zero.' };
  if (verdict === 'no-edge' && interval.lo > 0) return { ok: false, why: 'The whole interval is above zero, so "no edge" is not what it shows.' };
  if (verdict === 'no-edge' && interval.hi < 0) return { ok: true, why: '' };
  return { ok: true, why: '' };
}

/** How many distinct slices the student has looked at, and what that means for the best one. */
export function snoopingNote(k) {
  if (k < 3) return null;
  return `You have examined ${k} slices. Among ${k} random slices, one that looks good is expected. Treat a good one as a hypothesis to test on new data, not a finding.`;
}

/** Mean, count and interval (normal approximation) for each group: [{ key, n, mean, lo, hi }]. */
export function byGroup(trades, keyFn) {
  const groups = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t.r);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const m = mean(rs);
    const half = rs.length > 1 ? 1.96 * sd(rs) / Math.sqrt(rs.length) : null;
    return { key, n: rs.length, mean: m, lo: half === null ? null : m - half, hi: half === null ? null : m + half };
  }).sort((a, b) => String(a.key).localeCompare(String(b.key)));
}
