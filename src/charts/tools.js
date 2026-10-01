/**
 * The chart tools registry. Exactly one tool is registered and enabled at launch: Session Levels.
 * A tool is added by dropping in one module and registering it, never by editing the chart engine. A rule in the validator
 * keeps indicator-type tools out of core content.
 *
 *   ChartTool { id, name, epistemicStatus, unlockedBy, compute(ctx) -> { lines, bands } }
 *
 * Session Levels draws (a) the high and low of each configured session window, (b) the previous day's high and low, as
 * labelled horizontal reference lines. A session still in progress draws a DEVELOPING high and low, drawn dashed. The tool
 * computes no signals and never labels anything "buy" or "sell". Every level is computed as of the last visible bar.
 */

import { CONVENTIONAL_SET, resolveWindow } from '../time/sessions.js';
import { instantFromWall, parseDate, addDays, dateInZone } from '../time/zones.js';

/* ------------------------------------------------------------------ windows and days */

/** Extremes of the bars whose open time falls in [startMs, endMs), using only bars up to `upto`. */
export function windowExtremes(candles, times, startMs, endMs, tfMin, upto = candles.length - 1) {
  let from = -1;
  let to = -1;
  let hi = -Infinity;
  let lo = Infinity;
  let hiI = -1;
  let loI = -1;
  for (let i = 0; i <= upto; i++) {
    if (times[i] < startMs || times[i] >= endMs) continue;
    if (from < 0) from = i;
    to = i;
    if (candles[i][1] > hi) { hi = candles[i][1]; hiI = i; }
    if (candles[i][2] < lo) { lo = candles[i][2]; loI = i; }
  }
  if (from < 0) return null;
  const complete = times[upto] + tfMin * 60000 >= endMs && times[0] <= startMs;
  return { from, to, hi, lo, hiI, loI, complete };
}

/**
 * The trading days under a day anchor, e.g. { tz: 'America/New_York', time: '17:00' }: each day runs from the anchor time
 * to the same time next day, and is named after the local date on which it starts.
 * Returns segments { key, startMs, endMs, from, to } for the bars that fall in each.
 */
export function daySegments(times, tfMin, anchor) {
  const [hh, mm] = anchor.time.split(':').map(Number);
  const firstLocal = dateInZone(times[0], anchor.tz);
  const lastLocal = dateInZone(times[times.length - 1], anchor.tz);
  const segs = [];
  for (let d = addDays(firstLocal, -1); d <= addDays(lastLocal, 1); d = addDays(d, 1)) {
    const { year, month, day } = parseDate(d);
    const startMs = instantFromWall(anchor.tz, year, month, day, hh, mm);
    const nx = parseDate(addDays(d, 1));
    const endMs = instantFromWall(anchor.tz, nx.year, nx.month, nx.day, hh, mm);
    let from = -1;
    let to = -1;
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= startMs && times[i] < endMs) {
        if (from < 0) from = i;
        to = i;
      }
    }
    if (from >= 0) segs.push({ key: d, startMs, endMs, from, to, complete: times[0] <= startMs && times[times.length - 1] + tfMin * 60000 >= endMs });
  }
  return segs;
}

/** The completed day before the day that contains bar `at`: its high and low, and the bars that made them. */
export function previousDay(candles, times, tfMin, anchor, at) {
  const segs = daySegments(times.slice(0, at + 1), tfMin, anchor);
  if (segs.length < 2) return null;
  const cur = segs[segs.length - 1];
  const prev = segs[segs.length - 2];
  // the previous day is complete when the data reaches the start of the current one
  if (times[0] > prev.startMs) return null;
  let hi = -Infinity;
  let lo = Infinity;
  let hiI = -1;
  let loI = -1;
  for (let i = prev.from; i <= prev.to; i++) {
    if (candles[i][1] > hi) { hi = candles[i][1]; hiI = i; }
    if (candles[i][2] < lo) { lo = candles[i][2]; loI = i; }
  }
  return { key: prev.key, from: prev.from, to: prev.to, hi, lo, hiI, loI, currentFrom: cur.from };
}

/* ------------------------------------------------------------------ the tool */

export const NY_17 = { tz: 'America/New_York', time: '17:00' };
export const UTC_MIDNIGHT = { tz: 'UTC', time: '00:00' };

export const SHORT = { tokyo: 'Asian', frankfurt: 'Frankfurt', london: 'London', newyork: 'New York' };
const TONES = { tokyo: 'violet', frankfurt: 'sky', london: 'teal', newyork: 'gold' };

/**
 * ctx: { candles, times, tfMin, upto, set, sessions (ids, default all), dates (iso dates to draw), prevDay (bool), anchor }
 * Returns { lines: [{ price, label, tone, dashed, from, to }], bands: [] }
 */
function computeSessionLevels(ctx) {
  const { candles, times, tfMin, upto = candles.length - 1, set = CONVENTIONAL_SET, prevDay = true, anchor = NY_17 } = ctx;
  const ids = ctx.sessions || set.sessions.map((s) => s.id);
  const lines = [];
  const dates = ctx.dates || [...new Set(times.slice(0, upto + 1).map((t) => new Date(t).toISOString().slice(0, 10)))];
  for (const def of set.sessions) {
    if (!ids.includes(def.id)) continue;
    for (const d of dates) {
      const w = resolveWindow(def, d);
      if (w.startMs > times[upto]) continue;
      const ex = windowExtremes(candles, times, w.startMs, w.endMs, tfMin, upto);
      if (!ex) continue;
      const short = SHORT[def.id] || def.label;
      const dashed = !ex.complete;
      const tail = ex.complete ? ex.to : upto;
      lines.push({ price: ex.hi, label: `${short} high${dashed ? ' (developing)' : ''}`, tone: TONES[def.id] || 'gold', dashed, from: ex.from, to: tail });
      lines.push({ price: ex.lo, label: `${short} low${dashed ? ' (developing)' : ''}`, tone: TONES[def.id] || 'gold', dashed, from: ex.from, to: tail });
    }
  }
  if (prevDay) {
    const pd = previousDay(candles, times, tfMin, anchor, upto);
    if (pd) {
      lines.push({ price: pd.hi, label: 'Previous day high', tone: 'rose', dashed: false, from: pd.currentFrom, to: upto });
      lines.push({ price: pd.lo, label: 'Previous day low', tone: 'rose', dashed: false, from: pd.currentFrom, to: upto });
    }
  }
  return { lines, bands: [] };
}

export const CHART_TOOLS = new Map();

export function registerTool(tool) {
  if (tool.kind === 'indicator') throw new Error('Indicator tools are not allowed in core content: ' + tool.id);
  CHART_TOOLS.set(tool.id, tool);
}

registerTool({
  id: 'session-levels',
  name: 'Session Levels',
  epistemicStatus: 'reference',
  unlockedBy: 'l08-session-highs-lows',
  note: 'A reference line, never a signal.',
  compute: computeSessionLevels
});
