/**
 * Probability simulations for the Level 1 labs. Everything is seeded so a result can be replayed.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { makeRng } from '../learn/rng.js';

/** One run of n trades that each win with probability p. */
export function simulateRun(rng, p, n) {
  let wins = 0;
  let lossRun = 0;
  let winRun = 0;
  let longestLoss = 0;
  let longestWin = 0;
  const seq = new Array(n);
  for (let i = 0; i < n; i++) {
    const win = rng.next() < p;
    seq[i] = win ? 1 : 0;
    if (win) {
      wins += 1;
      winRun += 1;
      lossRun = 0;
      if (winRun > longestWin) longestWin = winRun;
    } else {
      lossRun += 1;
      winRun = 0;
      if (lossRun > longestLoss) longestLoss = lossRun;
    }
  }
  return { wins, losses: n - wins, longestLoss, longestWin, seq, total: wins - (n - wins) };
}

/** Many identical traders: the same win rate and the same rules, different luck. */
export function simulateTraders({ seed, winRate, trades, traders }) {
  const rng = makeRng('traders#' + seed);
  return Array.from({ length: traders }, () => {
    const r = simulateRun(rng, winRate, trades);
    return { longestLoss: r.longestLoss, wins: r.wins, total: r.total };
  });
}

/** Histogram of the number of wins across many runs of n trades. */
export function winsHistogram({ seed, p, n, runs = 1000 }) {
  const rng = makeRng('hist#' + seed);
  const counts = new Array(n + 1).fill(0);
  let sum = 0;
  for (let i = 0; i < runs; i++) {
    const w = simulateRun(rng, p, n).wins;
    counts[w] += 1;
    sum += w;
  }
  return { counts, mean: sum / runs, runs };
}

/** Share of runs whose win count lies in [lo, hi]. */
export function shareWithin(counts, lo, hi) {
  const total = counts.reduce((a, b) => a + b, 0);
  let inside = 0;
  for (let w = Math.max(0, lo); w <= Math.min(counts.length - 1, hi); w++) inside += counts[w];
  return total ? inside / total : 0;
}

/** Average longest losing streak over many runs, for the prediction step. */
export function meanLongestLoss({ seed, p, n, runs = 1500 }) {
  const rng = makeRng('mll#' + seed);
  let sum = 0;
  for (let i = 0; i < runs; i++) sum += simulateRun(rng, p, n).longestLoss;
  return sum / runs;
}

/** Flip a coin that lands heads with probability p, k times. */
export function flips(rng, p, k) {
  let heads = 0;
  for (let i = 0; i < k; i++) if (rng.next() < p) heads += 1;
  return heads;
}

/** A toy order-flow price walk: net pressure pushes the price, with noise. Illustrative only. */
export function orderFlowPath({ seed, buy, sell, steps = 40, start = 100 }) {
  const rng = makeRng('flow#' + seed);
  const net = (buy - sell) / Math.max(1, buy + sell); // -1 .. 1
  const path = [start];
  let price = start;
  for (let i = 0; i < steps; i++) {
    price += net * 0.9 + (rng.next() - 0.5) * 1.6;
    path.push(price);
  }
  return { path, net };
}
