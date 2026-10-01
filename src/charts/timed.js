/**
 * Timed synthetic series for Level 8: candles with real UTC timestamps, so sessions, previous-day levels and time-zone traps
 * can be drawn and tested. Simulated. Illustrates a mechanism; predicts nothing.
 *
 * The generator gives each hour of the UTC day a size of move. That pattern is BUILT IN, on purpose, so the student has
 * something to practise measuring. A real market may or may not show any such pattern, and this app does not claim that
 * it does. Real measurement is the job of a later level, with the student's own data.
 */

import { makeRng } from '../learn/rng.js';
import { gauss } from '../sim/paths.js';
import { addDays } from '../time/zones.js';

const PIP = 0.0001;

/** Size of a typical move (in pips per 30 minutes) for each UTC hour of the built-in pattern. */
export const HOUR_SIZE = [3.2, 3.0, 2.8, 2.6, 2.6, 2.8, 3.4, 5.2, 6.4, 6.0, 5.0, 4.6, 5.4, 6.6, 7.0, 6.4, 5.2, 4.2, 3.4, 2.8, 2.6, 2.6, 2.8, 3.0];

const weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();

/** The next `days` weekdays on or after startISO. */
export function weekdays(startISO, days) {
  const out = [];
  let d = startISO;
  while (out.length < days) {
    const w = weekday(d);
    if (w !== 0 && w !== 6) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/**
 * opts: { seed, startISO, days, tfMin (15, 30 or 60), base, pattern (false gives an equal size for every hour),
 *         spikes (bar-start times in ms that get a burst of volatility, for the news event study), spikeMult }
 * Returns { candles: [[o,h,l,c]], times: [ms], dates: [iso], tfMin, dp }.
 */
export function timedSeries({ seed, startISO, days = 3, tfMin = 30, base = 1.1, pattern = true, spikes = [], spikeMult = 4 }) {
  const spikeSet = new Set(spikes);
  const rng = makeRng('timed#' + seed);
  const candles = [];
  const times = [];
  const dates = weekdays(startISO, days);
  let price = base;
  const round = (x) => +x.toFixed(5);
  for (const d of dates) {
    const [y, m, dd] = d.split('-').map(Number);
    const t0 = Date.UTC(y, m - 1, dd);
    for (let k = 0; k < 1440 / tfMin; k++) {
      const ms = t0 + k * tfMin * 60000;
      const hour = Math.floor((k * tfMin) / 60);
      const hit = spikeSet.has(ms) ? spikeMult : spikeSet.has(ms - tfMin * 60000) ? spikeMult / 2 : 1;
      const size = (pattern ? HOUR_SIZE[hour] : 4.2) * Math.sqrt(tfMin / 30) * hit;
      const o = price;
      const c = o + gauss(rng) * size * PIP * 0.55;
      const up = Math.abs(gauss(rng)) * size * PIP * 0.45;
      const dn = Math.abs(gauss(rng)) * size * PIP * 0.45;
      candles.push([round(o), round(Math.max(o, c) + up), round(Math.min(o, c) - dn), round(c)]);
      times.push(ms);
      price = c;
    }
  }
  return { candles, times, dates, tfMin, dp: 5 };
}
