/**
 * Two made-up return series whose relationship CHANGES between eras, and the rolling correlation that shows it.
 * Simulated. Illustrates a mechanism; predicts nothing. The eras are built in so the student can see a relationship shift.
 * Real currency relationships change across eras too, but nothing here says how, when or by how much.
 */

import { makeRng } from '../learn/rng.js';
import { gauss } from './paths.js';

/** eras: [{ len, rho }]. Returns { x, y, era: [era index per step] }. */
export function pairSeries({ seed, eras }) {
  const rng = makeRng('regime#' + seed);
  const x = [];
  const y = [];
  const era = [];
  eras.forEach((e, k) => {
    for (let i = 0; i < e.len; i++) {
      const a = gauss(rng);
      const b = gauss(rng);
      x.push(a);
      y.push(e.rho * a + Math.sqrt(Math.max(0, 1 - e.rho * e.rho)) * b);
      era.push(k);
    }
  });
  return { x, y, era };
}

export function correlation(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

/** Correlation over a sliding window of w steps. The first w − 1 entries are null. */
export function rollingCorr(x, y, w) {
  return x.map((_, i) => (i + 1 < w ? null : correlation(x.slice(i + 1 - w, i + 1), y.slice(i + 1 - w, i + 1))));
}
