/**
 * Level 8 chart tasks: session highs and lows across daylight saving, previous-day levels under two day anchors, and
 * classifying an event under a stated rule. Same shape as the tasks in tasks.js: (rng, made, spec) -> { prompt, explanation, chart, parts }.
 *
 * Timed tasks run on a timed synthetic series (charts/timed.js). The chart's clock is stated and the axis prints it.
 */

import { timedSeries } from './timed.js';
import { windowExtremes, previousDay, daySegments, NY_17, UTC_MIDNIGHT, SHORT } from './tools.js';
import { CONVENTIONAL_SET, resolveWindow } from '../time/sessions.js';
import { offsetMinutes, formatTime, instantFromWall } from '../time/zones.js';
import { swings, firstBreach } from './detect.js';

const pickFrom = (rng, list) => (Array.isArray(list) ? rng.pick(list) : list);

/** Dates that include the weeks when the US and the UK clocks were out of step, and ordinary weeks. */
export const TRAP_DATES = ['2026-01-19', '2026-02-09', '2026-03-09', '2026-03-23', '2026-04-06', '2026-07-13', '2026-10-26', '2026-11-02', '2026-11-09'];

const ZONE_LABEL = { 'America/Guyana': 'Guyana', 'America/New_York': 'New York', 'Europe/London': 'London', 'UTC': 'UTC' };

export const TIMED = new Set(['session-extreme', 'prev-day-level']);

/** The series for a timed task, and the chart fields that go with it. */
export function timedMade(rng, tpl) {
  const startISO = pickFrom(rng, tpl.dates || TRAP_DATES);
  const tfMin = pickFrom(rng, tpl.tfMin || 30);
  const s = timedSeries({ seed: rng.int(1, 2 ** 30), startISO, days: tpl.days || 3, tfMin, base: +(1.05 + rng.next() * 0.2).toFixed(4) });
  const tz = pickFrom(rng, tpl.tz || 'America/Guyana');
  return { ...s, upto: s.candles.length - 1, n: 0, order: 1, tz, startISO };
}

function timedChart(made, extra = {}) {
  return {
    candles: made.candles.slice(0, made.upto + 1),
    times: made.times.slice(0, made.upto + 1),
    tz: made.tz,
    tfMin: made.tfMin,
    upto: made.upto,
    dp: 5,
    n: 0,
    order: 1,
    bands: [],
    lines: [],
    points: [],
    note: '',
    ...extra
  };
}

const fmtWindow = (w) => `${formatTime(w.startMs, w.anchorTz)}–${formatTime(w.endMs, w.anchorTz)}`;

export const TASKS8 = {
  /* ---- the high or low of a session window ---- */
  'session-extreme': (rng, made, spec) => {
    const ids = spec.sessions || ['london', 'newyork', 'frankfurt', 'tokyo'];
    const sid = pickFrom(rng, ids);
    const def = CONVENTIONAL_SET.sessions.find((s) => s.id === sid);
    const side = pickFrom(rng, spec.side || ['high', 'low']);
    const date = made.dates[1];
    const w = resolveWindow(def, date);
    const ex = windowExtremes(made.candles, made.times, w.startMs, w.endMs, made.tfMin);
    if (!ex || !ex.complete) return null;
    const truth = side === 'high' ? ex.hiI : ex.loI;
    // the window a person would use if they forgot the clocks changed
    const std = offsetMinutes(instantFromWall(def.anchorTz, 2026, 1, 15, 12, 0), def.anchorTz);
    const shift = offsetMinutes(w.startMs, def.anchorTz) - std;
    const wrongEx = shift ? windowExtremes(made.candles, made.times, w.startMs + shift * 60000, w.endMs + shift * 60000, made.tfMin) : null;
    const wrong = wrongEx ? (side === 'high' ? wrongEx.hiI : wrongEx.loI) : -1;
    // the extreme of the whole calendar day, if it sits outside the window
    const dayStart = instantFromWall('UTC', ...date.split('-').map(Number), 0, 0);
    const dayEx = windowExtremes(made.candles, made.times, dayStart, dayStart + 86400000, made.tfMin);
    const outside = side === 'high' ? dayEx.hiI : dayEx.loI;
    const show = spec.showBand !== false;
    const label = ZONE_LABEL[made.tz] || made.tz;
    return {
      prompt: `Tap the candle that made the ${SHORT[def.id]} session ${side}. The session runs ${fmtWindow(w)} on its own clock. The chart's clock is ${label} time.`,
      explanation: `The ${SHORT[def.id]} window on ${date} is ${fmtWindow(w)}, which is ${formatTime(w.startMs, made.tz)}–${formatTime(w.endMs, made.tz)} on the chart's clock. The ${side} of the candles inside it is the session ${side}.`,
      chart: timedChart(made, {
        bands: show ? [{ from: ex.from, to: ex.to, tone: 'teal', label: SHORT[def.id] }] : [],
        note: `${def.label} runs ${fmtWindow(w)} on its own clock. That is ${formatTime(w.startMs, made.tz)}–${formatTime(w.endMs, made.tz)} on the chart's clock. The session follows its own market's daylight saving.`
      }),
      parts: [{
        id: 'p', kind: 'pick', prompt: `Tap the ${side === 'high' ? 'highest' : 'lowest'} candle inside the ${SHORT[def.id]} session.`, count: 1, answer: [truth],
        diag: [
          { when: wrong >= 0 && wrong !== truth ? [wrong] : [], tag: 'ignored-dst', feedback: 'You placed the window as if the clocks had not changed. The session follows its own market\'s daylight saving.' },
          { when: outside !== truth ? [outside] : [], tag: 'outside-window', feedback: 'That candle is the extreme of the whole day, but it happened outside the session window.' }
        ],
        fallbackTag: 'wrong-session-window', fallback: 'Find where the window sits on the chart\'s clock first. Then take the extreme of the candles inside it.',
        hint: 'What are the start and end of the window on THIS chart\'s clock? Only candles that open inside it count.'
      }],
      meta: { session: def.id, side, date }
    };
  },

  /* ---- the previous day's high or low, under a stated day anchor ---- */
  'prev-day-level': (rng, made, spec) => {
    const anchors = { ny17: NY_17, utc: UTC_MIDNIGHT };
    const which = pickFrom(rng, spec.anchors || ['ny17', 'utc']);
    const anchor = anchors[which];
    const other = anchors[which === 'ny17' ? 'utc' : 'ny17'];
    const side = pickFrom(rng, spec.side || ['high', 'low']);
    const at = made.upto;
    const pd = previousDay(made.candles, made.times, made.tfMin, anchor, at);
    const pdOther = previousDay(made.candles, made.times, made.tfMin, other, at);
    if (!pd || !pdOther) return null;
    const truth = side === 'high' ? pd.hiI : pd.loI;
    const wrong = side === 'high' ? pdOther.hiI : pdOther.loI;
    if (spec.requireDiff !== false && truth === wrong) return null;
    const show = spec.showBand !== false;
    const dayWord = which === 'ny17' ? '5:00 p.m. New York time' : '00:00 UTC';
    const seg = daySegments(made.times, made.tfMin, anchor).find((sg) => sg.key === pd.key);
    return {
      prompt: `A trading day starts at ${dayWord} in this exercise. Tap the candle that made the previous day's ${side}.`,
      explanation: `With days starting at ${dayWord}, the previous day ran from ${formatTime(seg.startMs, made.tz)} to ${formatTime(seg.endMs, made.tz)} on the chart's clock. Its ${side} is the ${side === 'high' ? 'highest' : 'lowest'} candle inside. With the other day start, the answer would be ${wrong === truth ? 'the same' : 'a different candle'}.`,
      chart: timedChart(made, {
        bands: show ? [{ from: pd.from, to: pd.to, tone: 'gold', label: 'Previous day' }] : [],
        note: `The day anchor is ${dayWord}. The previous day's high and low depend on where the day starts.`
      }),
      parts: [{
        id: 'p', kind: 'pick', prompt: `Tap the candle that made the previous day's ${side}.`, count: 1, answer: [truth],
        diag: [{ when: wrong !== truth ? [wrong] : [], tag: 'wrong-day-anchor', feedback: 'That is the extreme under the other day start. Use the day start stated in this exercise.' }],
        fallbackTag: 'wrong-day-window', fallback: 'Find the start and end of the previous day under the stated anchor, then take its extreme.',
        hint: 'Where does the previous day start and end on this chart\'s clock, with the day start stated here?'
      }],
      meta: { anchor: which, side }
    };
  },

  /* ---- classify an event under a stated rule ---- */
  'event-type': (rng, made, spec) => {
    const k = spec.k || 6;
    const upto = made.upto;
    const sw = swings(made.candles, made.n, upto).filter((s) => s.type === 'high').slice(-4);
    const events = [];
    for (const s of sw) {
      const closeAt = firstBreach(made.candles, s.price, 'up', s.i, upto, 'close');
      if (closeAt > 0 && closeAt + k <= upto) {
        const back = firstBreach(made.candles, s.price, 'down', closeAt, closeAt + k, 'close');
        events.push({ level: s, bar: closeAt, type: back > 0 ? 'failed' : 'held' });
      } else if (closeAt < 0) {
        const wickAt = firstBreach(made.candles, s.price, 'up', s.i, upto, 'wick');
        if (wickAt > 0) events.push({ level: s, bar: wickAt, type: 'none' });
      }
    }
    if (!events.length) return null;
    const ev = pickFrom(rng, events);
    const options = [
      { id: 'held', label: 'A breakout that held' },
      { id: 'failed', label: 'A failed breakout' },
      { id: 'none', label: 'Not a breakout under this rule' }
    ];
    const tags = {};
    const messages = {};
    for (const o of options) {
      if (o.id === ev.type) continue;
      tags[o.id] = 'event-rule-misapplied';
      messages[o.id] = ev.type === 'none' ? 'The bar traded above the level but never closed above it, so under the close rule it is not a breakout.' : ev.type === 'failed' ? 'A bar closed above the level, then a bar closed back below it within ' + k + ' bars. That is a failed breakout.' : 'After the first close above the level, no bar closed back below it within ' + k + ' bars. The breakout held.';
    }
    return {
      prompt: `The dashed line is a resistance level. What is the event marked E, under the stated rule?`,
      explanation: ev.type === 'none' ? 'The bar reached above the level but no bar closed above it: not a breakout under the close rule.' : ev.type === 'failed' ? `The first close above the level was followed by a close back below it within ${k} bars: a failed breakout.` : `The first close above the level was NOT followed by a close back below it within ${k} bars: the breakout held.`,
      chart: {
        candles: made.candles.slice(0, upto + 1), upto, dp: 5, n: made.n, order: made.order, bands: [], times: undefined,
        lines: [{ price: ev.level.price, label: 'Level', tone: 'gold', dashed: true }],
        points: [{ i: ev.bar, kind: 'high', label: 'E' }],
        note: `Rule: a breakout is the first bar that CLOSES above the level. It has FAILED if a later bar closes back below the level within ${k} bars. A bar that only trades above the level is not a breakout.`
      },
      parts: [{
        id: 'p', kind: 'options', prompt: 'What is event E?', options, answer: ev.type, accept: [], tags, messages,
        hint: 'Check the marked bar against the rule: did it CLOSE above the level? Then look at the next bars: did one close back below within the limit?'
      }],
      meta: { type: ev.type }
    };
  }
};
