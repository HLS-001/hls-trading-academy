/**
 * Level 8 widgets: does a level "hold" more than a random level, activity by hour and why it needs a sample, the
 * session clock table across daylight saving, and the Session Levels overlay with its definitions.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, s, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { chartView } from '../ui/chartview.js';
import { freshSeed } from '../learn/rng.js';
import { timedSeries } from '../charts/timed.js';
import { reactions, randomLevelRates } from '../charts/reactions.js';
import { CHART_TOOLS, NY_17, UTC_MIDNIGHT, SHORT } from '../charts/tools.js';
import { CONVENTIONAL_SET, clockTable, clockGap } from '../time/sessions.js';
import { partsInZone } from '../time/zones.js';

const F = 'Manrope, sans-serif';
const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');
const mark = (group, v) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
const chip = (label, v, group, onPick) => {
  const b = h('button', { type: 'button', class: 'opt small', 'data-v': String(v), onclick: () => { mark(group, v); onPick(v); } }, label);
  group.push(b);
  return b;
};
const pct = (x) => (x === null || x === undefined ? '—' : Math.round(x * 100) + '%');

/* ------------------------------------------------------------------ 8.03 and 8.12 do levels hold? */

const PIP = 0.0001;

/**
 * spec.mode 'compare': one obvious prior high against 300 random levels on a chart with NO built-in levels.
 * spec.mode 'log': the previous day's high on each day of a longer chart, tallied.
 */
export function levelreact({ spec, onInteract }) {
  return spec.mode === 'log' ? logMode(spec, onInteract) : compareMode(spec, onInteract);
}

function compareMode(spec, onInteract) {
  let seed = spec.seed || freshSeed();
  let guess = null;
  let runs = 0;
  const guesses = [];
  const out = h('div', { class: 'lab-out' });
  const stage = h('div');
  const run = button('Test The Level', { disabled: true, onClick: () => go() });

  const go = () => {
    const series = timedSeries({ seed, startISO: '2026-03-02', days: 6, tfMin: 30, pattern: false });
    const cs = series.candles;
    const split = Math.floor(cs.length * 0.6);
    // the obvious level: the highest high before the split
    let level = -Infinity;
    let li = 0;
    for (let i = 0; i < split; i++) if (cs[i][1] > level) { level = cs[i][1]; li = i; }
    const opt = { tol: 2 * PIP, away: 10 * PIP, within: 12, from: split, to: cs.length - 1 };
    const side = level >= cs[split][0] ? 'resistance' : 'support';
    const mine = reactions(cs, level, { side, ...opt });
    const rand = randomLevelRates(cs, { seed, ...opt, minTouches: 2 });
    const view = chartView({ candles: cs, height: 210, pitch: 3, lines: [{ price: level, label: 'Prior high', tone: 'gold', dashed: true, from: li, to: cs.length - 1 }], bands: [{ from: split, to: cs.length - 1, tone: 'violet', label: 'Tested here' }], marks: mine.visits.map((v) => ({ i: v.i, tone: v.outcome === 'reacted' ? 'right' : v.outcome === 'broke' ? 'wrong' : 'prov' })), tappable: false });
    stage.replaceChildren(view.el);
    const beat = mine.rate !== null && rand.p90 !== null && mine.rate > rand.p90;
    out.replaceChildren(
      h('div', { class: 'mm-read' },
        h('div', null, h('span', null, 'Your Level'), h('b', null, mine.touches ? `${mine.reacted} of ${mine.reacted + mine.broke}` : 'no visits')),
        h('div', null, h('span', null, 'Rate'), h('b', null, pct(mine.rate))),
        h('div', null, h('span', null, 'Random Levels (Median)'), h('b', null, pct(rand.median))),
        h('div', null, h('span', null, 'Random Levels (Top 10%)'), h('b', null, pct(rand.p90)))),
      h('p', { class: 'lab-result' }, mine.rate === null ? 'The level was not visited often enough to say anything.' : beat ? 'This time the level did better than nine in ten random levels. With one chart that can happen by chance.' : 'This level did no better than a typical random level.'),
      h('p', { class: 'lab-teach', html: mdInline(`Visits: **${mine.reacted}** reacted, **${mine.broke}** broke, **${mine.neither}** did neither. ${rand.n} random levels had enough visits to score. This chart was made with **no levels built in**, so anything that looks like a level here is chance. A level only means something if it beats random levels over a **large sample**.`) }));
    runs += 1;
    emit('sim.run', { sim: 'levelreact', guess, beat });
    if (runs >= 2) onInteract();
    run.textContent = 'Test Another Chart';
    seed = freshSeed();
  };
  const pick = (v) => { guess = v; run.disabled = false; };
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A chart of random price moves. The highest high from the first part is drawn as a level. Then price is watched at that level in the later part, and at 300 random levels for comparison.'),
    h('p', { class: 'lab-q' }, 'Will the prior high hold (make price react) more often than a randomly chosen level?'),
    h('div', { class: 'choices' }, chip('More often', 'more', guesses, pick), chip('About the same', 'same', guesses, pick), chip('Less often', 'less', guesses, pick)),
    h('div', { class: 'lab-actions' }, run), stage, out, note());
}

function logMode(spec, onInteract) {
  const series = timedSeries({ seed: spec.seed || 88, startISO: '2026-03-02', days: 10, tfMin: 30, pattern: false });
  const cs = series.candles;
  const rows = [];
  let tReact = 0;
  let tBroke = 0;
  let tNone = 0;
  const perDay = 48;
  for (let d = 1; d < 10; d++) {
    const from = (d - 1) * perDay;
    let hi = -Infinity;
    for (let i = from; i < from + perDay; i++) hi = Math.max(hi, cs[i][1]);
    const r = reactions(cs, hi, { side: 'resistance', tol: 2 * PIP, away: 10 * PIP, within: 12, from: d * perDay, to: (d + 1) * perDay - 1 });
    tReact += r.reacted;
    tBroke += r.broke;
    tNone += r.neither;
    rows.push({ day: d + 1, hi, ...r });
  }
  const rand = randomLevelRates(cs, { seed: 'log', tol: 2 * PIP, away: 10 * PIP, within: 12, from: perDay, to: cs.length - 1, minTouches: 2 });
  const table = h('div', { class: 'tbl-wrap' }, h('table', { class: 'stim-table' },
    h('thead', null, h('tr', null, ...['Day', 'Prior Day High', 'Visits', 'Reacted', 'Broke', 'Neither'].map((c) => h('th', null, c)))),
    h('tbody', null, ...rows.map((r) => h('tr', null, h('td', null, `Day ${r.day}`), h('td', null, r.hi.toFixed(5)), h('td', null, String(r.touches)), h('td', null, String(r.reacted)), h('td', null, String(r.broke)), h('td', null, String(r.neither)))))));
  const visits = tReact + tBroke + tNone;
  onInteract();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Ten days of random price moves. For each day, the previous day\'s high is tracked through the day. A visit is a bar that reaches within 2 pips of it. A visit reacts if price moves 10 pips away within 12 bars, and breaks if a bar closes beyond it first.'),
    table,
    h('div', { class: 'mm-read' },
      h('div', null, h('span', null, 'Visits In Total'), h('b', null, String(visits))),
      h('div', null, h('span', null, 'Reacted'), h('b', null, String(tReact))),
      h('div', null, h('span', null, 'Broke'), h('b', null, String(tBroke))),
      h('div', null, h('span', null, 'Random Levels (Median Rate)'), h('b', null, pct(rand.median)))),
    h('p', { class: 'lab-teach', html: mdInline(`Rate for the previous-day high: **${pct(tReact / Math.max(1, tReact + tBroke))}** over **${visits}** visits in nine days. A random level scored a median of **${pct(rand.median)}**. Write down what you **observe** here, and what you would need to see before calling it a **result**. This chart has no built-in levels.`) }),
    note());
}

/* ------------------------------------------------------------------ 8.09 activity by hour */

export function activityhour({ onInteract }) {
  let built = true;
  let days = 5;
  const seen = new Set();
  const stage = h('div');
  const out = h('div', { class: 'lab-out' });
  const dayChips = [];
  const modeChips = [];

  const draw = () => {
    const series = timedSeries({ seed: 'act#' + days + (built ? 'b' : 'n'), startISO: '2026-03-02', days, tfMin: 60, pattern: built });
    const perHour = Array.from({ length: 24 }, () => []);
    series.candles.forEach((c, i) => perHour[new Date(series.times[i]).getUTCHours()].push((c[1] - c[2]) / PIP));
    // shown on the Guyana clock: UTC minus four hours
    const rows = Array.from({ length: 24 }, (_, gy) => {
      const utc = (gy + 4) % 24;
      const xs = perHour[utc];
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
      return { gy, m, se: sd / Math.sqrt(xs.length) };
    });
    const max = Math.max(...rows.map((r) => r.m + r.se), 1);
    const W = 340;
    const Hh = 170;
    const bw = (W - 30) / 24;
    const bars = rows.map((r) => {
      const x = 24 + r.gy * bw;
      const hgt = ((Hh - 40) * r.m) / max;
      const err = ((Hh - 40) * r.se) / max;
      return s('g', null,
        s('rect', { x: x + 1, y: Hh - 22 - hgt, width: bw - 2, height: hgt, fill: '#2DD4BF', 'fill-opacity': 0.8, rx: 1.5 }),
        s('line', { x1: x + bw / 2, x2: x + bw / 2, y1: Hh - 22 - hgt - err, y2: Hh - 22 - hgt + err, stroke: '#FFE8A0', 'stroke-width': 1.2 }));
    });
    const labels = [0, 4, 8, 12, 16, 20].map((gy) => s('text', { x: 24 + gy * bw + bw / 2, y: Hh - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9, 'font-family': F }, String(gy).padStart(2, '0') + ':00'));
    stage.replaceChildren(h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'fig', role: 'img', 'aria-label': 'Average candle range by hour of the day' },
      s('line', { x1: 22, x2: W - 4, y1: Hh - 22, y2: Hh - 22, stroke: 'rgba(165,173,214,.35)' }), ...bars, ...labels,
      s('text', { x: 24, y: 12, fill: 'var(--muted)', 'font-size': 9, 'font-family': F }, 'Average range per hour, in pips (whiskers: standard error)'))));
    const peak = rows.reduce((a, b) => (b.m > a.m ? b : a));
    out.replaceChildren(
      h('p', { class: 'lab-result' }, `${days} day${days === 1 ? '' : 's'} of data. The biggest average is at ${String(peak.gy).padStart(2, '0')}:00 Guyana time, at ${peak.m.toFixed(1)} pips.`),
      h('p', { class: 'lab-teach', html: mdInline(built ? 'This series was made with a **session pattern built in**, so you have something to measure. With few days the whiskers are wide and the picture is noisy. With more days it settles. **A real market may or may not show any pattern.** Measure your own data to find out.' : 'This series was made with **no pattern at all**: every hour has the same typical size. With few days the chart still shows peaks and valleys. That is what chance looks like. Do not read a pattern into a small sample.') }));
    seen.add(days + (built ? 'b' : 'n'));
    emit('sim.run', { sim: 'activityhour', days, built });
    if (seen.size >= 3) onInteract();
  };
  const dChips = [5, 20, 60].map((d) => chip(`${d} days`, d, dayChips, (v) => { days = +v; draw(); }));
  const mChips = [chip('Pattern built in', 'b', modeChips, () => { built = true; draw(); }), chip('No pattern at all', 'n', modeChips, () => { built = false; draw(); })];
  draw();
  mark(dayChips, days);
  mark(modeChips, 'b');
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Average candle range for each hour of the day, on made-up data. Choose how many days you measure.'),
    h('div', { class: 'choices' }, ...dChips), h('div', { class: 'choices' }, ...mChips), stage, out, note());
}

/* ------------------------------------------------------------------ 8.10 the session clock */

const CLOCK_DATES = [
  ['2026-01-19', '19 Jan'], ['2026-03-09', '9 Mar'], ['2026-03-24', '24 Mar'], ['2026-03-31', '31 Mar'], ['2026-07-14', '14 Jul'], ['2026-10-27', '27 Oct'], ['2026-11-10', '10 Nov']
];

export function sessiontable({ onInteract }) {
  const seen = new Set();
  const stage = h('div');
  const group = [];
  const show = (iso) => {
    seen.add(iso);
    const t = clockTable(CONVENTIONAL_SET, iso, 'America/Guyana');
    const winter = clockTable(CONVENTIONAL_SET, '2026-01-19', 'America/Guyana');
    const gap = clockGap(iso, 'Europe/London', 'America/New_York');
    stage.replaceChildren(
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'stim-table' },
        h('thead', null, h('tr', null, ...['Session', 'Own Clock', 'Guyana', 'Change'].map((c) => h('th', null, c)))),
        h('tbody', null, ...t.map((r, k) => {
          const gyOpen = partsInZone(r.startMs, 'America/Guyana').hour;
          const gyWinter = partsInZone(winter[k].startMs, 'America/Guyana').hour;
          const diff = ((gyOpen - gyWinter + 36) % 24) - 12;
          return h('tr', null, h('td', null, r.label), h('td', null, `${r.openMarket.slice(0, 5)}–${r.closeMarket.slice(0, 5)} ${r.openMarket.slice(6)}`), h('td', null, `${r.open.slice(0, 5)}–${r.close.slice(0, 5)}`), h('td', { class: diff ? 'weak' : '' }, diff ? `${diff > 0 ? '+' : '−'}${Math.abs(diff)} h vs 19 Jan` : 'same as 19 Jan') );
        })))),
      h('p', { class: 'lab-result' }, `London is ${gap} hours ahead of New York on this date.`),
      h('p', { class: 'lab-teach', html: mdInline('Each session is defined on **its own market\'s clock**, so it moves against Guyana\'s clock (UTC−4, all year) when its market changes its clocks. In the weeks when the US and the UK/EU are out of step, the London–New York gap is 4 hours, not 5.') }));
    if (seen.size >= 4) onInteract();
  };
  const row = h('div', { class: 'choices' }, ...CLOCK_DATES.map(([iso, label]) => chip(label, iso, group, show)));
  show('2026-01-19');
  mark(group, '2026-01-19');
  return h('div', { class: 'lab' }, h('p', { class: 'lab-intro' }, 'The four sessions in Guyana time, on seven dates. Look at what moves and what does not.'), row, stage, note());
}

/* ------------------------------------------------------------------ 8.11 the Session Levels overlay */

export function sessionlab({ spec, onInteract }) {
  const tool = CHART_TOOLS.get('session-levels');
  let start = '2026-03-02';
  let tz = 'America/Guyana';
  let anchorKey = 'ny17';
  const on = new Set(['london', 'newyork']);
  let prevDay = true;
  const touched = new Set();
  const readout = h('div', { class: 'lab-out' });
  const view = chartView({ candles: [[1, 1, 1, 1]], height: 236, pitch: 4, tappable: false });
  let series = null;

  const draw = () => {
    series = timedSeries({ seed: 41, startISO: start, days: 3, tfMin: 30 });
    const anchor = anchorKey === 'ny17' ? NY_17 : UTC_MIDNIGHT;
    const lvl = tool.compute({ candles: series.candles, times: series.times, tfMin: 30, sessions: [...on], prevDay, anchor });
    view.update({ candles: series.candles, times: series.times, tz, lines: lvl.lines, relTo: series.candles.length - 1, pitch: 4 });
    readout.replaceChildren(
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'What Is Drawn'),
        ...lvl.lines.map((l) => h('div', { class: 'weak-row' }, h('span', null, l.label), h('b', null, l.price.toFixed(5)))),
        !lvl.lines.length ? h('p', { class: 'hint-line' }, 'No lines: choose at least one session or the previous day.') : null),
      h('p', { class: 'lab-teach', html: mdInline('These lines are **references**. The tool computes no signal, and a line is never a "buy" or a "sell". A session that is still open draws a **developing** (dashed) high and low, because its final level is not known yet.') }));
    if (touched.size >= 3) onInteract();
  };
  const g1 = [];
  const g2 = [];
  const g3 = [];
  const g4 = [];
  const mkSess = (id, label) => {
    const b = h('button', { type: 'button', class: 'opt small' + (on.has(id) ? ' sel' : ''), 'data-v': id, onclick: () => { if (on.has(id)) on.delete(id); else on.add(id); b.classList.toggle('sel', on.has(id)); touched.add('s' + id); draw(); } }, label);
    return b;
  };
  const sessRow = h('div', { class: 'choices' }, ...CONVENTIONAL_SET.sessions.map((d) => mkSess(d.id, SHORT[d.id])));
  const controls = h('div', { class: 'lab-controls' },
    h('div', { class: 'lab-row' }, h('span', null, 'Week'), h('div', { class: 'choices' }, chip('Ordinary week', '2026-03-02', g1, (v) => { start = v; touched.add('w' + v); draw(); }), chip('US/UK out of step', '2026-03-09', g1, (v) => { start = v; touched.add('w' + v); draw(); }))),
    h('div', { class: 'lab-row' }, h('span', null, 'Chart Clock'), h('div', { class: 'choices' }, chip('Guyana', 'America/Guyana', g2, (v) => { tz = v; touched.add('z' + v); draw(); }), chip('New York', 'America/New_York', g2, (v) => { tz = v; touched.add('z' + v); draw(); }), chip('UTC', 'UTC', g2, (v) => { tz = v; touched.add('z' + v); draw(); }))),
    h('div', { class: 'lab-row' }, h('span', null, 'Day Starts At'), h('div', { class: 'choices' }, chip('5 p.m. New York', 'ny17', g3, (v) => { anchorKey = v; touched.add('a' + v); draw(); }), chip('Midnight UTC', 'utc', g3, (v) => { anchorKey = v; touched.add('a' + v); draw(); }))),
    h('div', { class: 'lab-row' }, h('span', null, 'Sessions'), sessRow),
    h('div', { class: 'lab-row' }, h('span', null, 'Previous Day'), h('div', { class: 'choices' }, chip('Show', 'on', g4, () => { prevDay = true; touched.add('pd1'); draw(); }), chip('Hide', 'off', g4, () => { prevDay = false; touched.add('pd0'); draw(); }))));
  draw();
  mark(g1, start);
  mark(g2, tz);
  mark(g3, anchorKey);
  mark(g4, 'on');
  return h('div', { class: 'lab' }, h('p', { class: 'lab-intro' }, 'Change the definitions and watch the lines move. Three days of made-up 30-minute candles.'), controls, view.el, readout, note());
}
