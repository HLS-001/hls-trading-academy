/**
 * Level 9 widgets: the rate-differential toy, a relationship that shifts between eras, reactions to made-up releases, and
 * a news event study on made-up data. Every data set here is SIMULATED, and the release timestamps are UNVERIFIED.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { multiLine } from '../ui/charts.js';
import { makeRng, freshSeed } from '../learn/rng.js';
import { gauss } from '../sim/paths.js';
import { pairSeries, rollingCorr } from '../sim/regimes.js';
import { timedSeries, weekdays } from '../charts/timed.js';

const note = (text = 'Simulated. Illustrates a mechanism; predicts nothing.') => h('p', { class: 'sim-note' }, text);
const mark = (group, v) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
const chip = (label, v, group, onPick) => {
  const b = h('button', { type: 'button', class: 'opt small', 'data-v': String(v), onclick: () => { mark(group, v); onPick(v); } }, label);
  group.push(b);
  return b;
};
const UNVERIFIED = () => h('p', { class: 'notice warn' }, 'Unverified data: the release times and figures in this lab are made up. A real event study needs a verified list of release timestamps.');
const sgn = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);

/* ------------------------------------------------------------------ 9.02 the rate-differential toy */

export function ratediff({ onInteract }) {
  const v = { ra: 4, rb: 1, da: 0, db: 0 };
  const seen = new Set();
  const out = h('div', { class: 'lab-out' });
  const slider = (label, key, min, max, step) => {
    const val = h('b', null, '');
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(v[key]), 'aria-label': label });
    input.addEventListener('input', () => { v[key] = +input.value; seen.add(key); draw(); });
    const upd = () => (val.textContent = key.startsWith('d') ? sgn(v[key], 2) + ' pts' : v[key].toFixed(2) + '%');
    input.addEventListener('input', upd);
    upd();
    return h('label', { class: 'slider' }, h('span', null, label + ' ', val), input);
  };
  const draw = () => {
    const now = v.ra - v.rb;
    const exp = v.ra + v.da - (v.rb + v.db);
    const shift = exp - now;
    out.replaceChildren(
      h('div', { class: 'mm-read' },
        h('div', null, h('span', null, 'Differential Now'), h('b', null, sgn(now) + ' pts')),
        h('div', null, h('span', null, 'Expected In Six Months'), h('b', null, sgn(exp) + ' pts')),
        h('div', null, h('span', null, 'Change In Expectation'), h('b', null, sgn(shift) + ' pts'))),
      h('p', { class: 'lab-teach', html: mdInline(`In this toy, **pressure** on economy A\'s currency follows the **expected** differential. If the differential is unchanged but the market expects it to widen, the toy leans the same way as a rise in the rate itself. ${shift === 0 ? 'Nothing is expected to change here.' : shift > 0 ? 'The expected differential is WIDER than today\'s: the toy leans towards A.' : 'The expected differential is NARROWER than today\'s: the toy leans away from A.'}`) }),
      h('p', { class: 'lab-teach', html: mdInline('**This is a toy.** It adds up ONE driver. Real exchange rates respond to many drivers at once, and a differential can rise while the currency falls. Treat it as an expectation, never a certainty.') }));
    if (seen.size >= 3) onInteract();
  };
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Two made-up economies. Set their policy rates, then set what the market expects each to do over six months.'),
    slider('Rate In A', 'ra', 0, 8, 0.25), slider('Rate In B', 'rb', 0, 8, 0.25), slider('Expected Change In A', 'da', -1, 1, 0.25), slider('Expected Change In B', 'db', -1, 1, 0.25), out,
    note('Illustrative toy. Predicts nothing.'));
}

/* ------------------------------------------------------------------ 9.07 a relationship that shifts */

export function rollingcorr({ onInteract }) {
  let w = 40;
  let guess = null;
  let revealed = false;
  const seed = freshSeed();
  const eras = [{ len: 120, rho: 0.8 }, { len: 120, rho: 0.15 }, { len: 120, rho: -0.4 }];
  const { x, y } = pairSeries({ seed, eras });
  const stage = h('div');
  const out = h('div', { class: 'lab-out' });
  const guesses = [];
  const windows = [];
  const reveal = button('Show The Correlation', { disabled: true, onClick: () => { revealed = true; draw(); onInteract(); reveal.disabled = true; } });
  const draw = () => {
    const rc = rollingCorr(x, y, w);
    const vals = rc.map((v) => (v === null ? 0 : v));
    stage.replaceChildren(multiLine([{ label: `Rolling correlation, ${w} steps`, values: vals, color: '#2DD4BF' }], { baseline: 0, fmt: (v) => v.toFixed(2), hgt: 170 }));
    const avg = (from, to) => {
      const s = rc.slice(from, to).filter((v) => v !== null);
      return s.reduce((a, b) => a + b, 0) / s.length;
    };
    out.replaceChildren(
      ...(revealed ? [
        h('div', { class: 'mm-read' },
          h('div', null, h('span', null, 'First Third'), h('b', null, sgn(avg(w, 120)))),
          h('div', null, h('span', null, 'Middle Third'), h('b', null, sgn(avg(120 + w, 240)))),
          h('div', null, h('span', null, 'Last Third'), h('b', null, sgn(avg(240 + w, 360))))),
        h('p', { class: 'lab-teach', html: mdInline('The two made-up series were built with **three eras**. A relationship measured in one window describes THAT window. It can look strong in one era, weak in the next and reversed after that. This is an **interpretation**: it says how the two moved together, not that they will again.') })
      ] : []));
  };
  draw();
  const pick = (v) => { guess = v; reveal.disabled = false; };
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Two made-up currencies, 360 steps. How they move together is measured over a sliding window. The line will be shown after your prediction.'),
    h('p', { class: 'lab-q' }, 'Will the relationship between the two stay about the same across all 360 steps?'),
    h('div', { class: 'choices' }, chip('Yes, about the same', 'same', guesses, pick), chip('No, it will change', 'change', guesses, pick)),
    h('div', { class: 'lab-actions' }, reveal),
    h('div', { class: 'choices' }, ...[20, 40, 80].map((v) => chip(`${v}-step window`, v, windows, (val) => { w = +val; draw(); }))),
    stage, out, note('Simulated data with eras built in. Real relationships also change; this says nothing about how.'));
}

/* ------------------------------------------------------------------ 9.11 reactions to made-up releases */

export function newsreaction({ onInteract }) {
  const rng = makeRng('news#' + freshSeed());
  const rows = Array.from({ length: 8 }, (_, i) => {
    const forecast = +(2 + rng.next() * 2).toFixed(1);
    const delta = (rng.chance(0.5) ? 1 : -1) * (0.2 + rng.next() * 0.3);
    const actual = +(forecast + delta).toFixed(1);
    const surprise = +(actual - forecast).toFixed(1);
    const sign = surprise > 0 ? 1 : -1;
    // built in: the first 5-minute move follows the surprise about 60% of the time, and the hour after follows nothing in particular
    const first = (rng.chance(0.6) ? sign : -sign) * (8 + Math.abs(gauss(rng)) * 10);
    const hour = (rng.chance(0.5) ? 1 : -1) * (10 + Math.abs(gauss(rng)) * 25);
    return { i, forecast, actual, surprise, first: Math.round(first), hour: Math.round(hour), guess: null };
  });
  const list = h('div');
  const out = h('div', { class: 'lab-out' });
  let shown = false;
  const draw = () => {
    list.replaceChildren(...rows.map((r) => {
      const chips = ['up', 'down'].map((d) => h('button', { type: 'button', class: 'opt small' + (r.guess === d ? ' sel' : ''), disabled: shown, onclick: () => { r.guess = d; draw(); } }, d === 'up' ? 'Rises' : 'Falls'));
      return h('div', { class: 'flaw-claim' }, h('p', { class: 'flaw-text' }, h('em', null, String(r.i + 1)), `Forecast ${r.forecast.toFixed(1)}%. Actual ${r.actual.toFixed(1)}%. Surprise ${sgn(r.surprise, 1)} pts.`),
        h('div', { class: 'flaw-chips' }, ...chips), shown ? h('p', { class: 'flaw-fix' }, `First 5 minutes: ${sgn(r.first, 0)} pips. One hour later: ${sgn(r.hour, 0)} pips.`) : null);
    }));
    reveal.disabled = shown || rows.some((r) => !r.guess);
  };
  const reveal = button('Show What Happened', { disabled: true, onClick: () => {
    shown = true;
    draw();
    const first = rows.filter((r) => (r.first > 0 ? 'up' : 'down') === (r.surprise > 0 ? 'up' : 'down')).length;
    const mine = rows.filter((r) => (r.first > 0 ? 'up' : 'down') === r.guess).length;
    const hourMatch = rows.filter((r) => (r.hour > 0) === (r.first > 0)).length;
    out.replaceChildren(
      h('div', { class: 'mm-read' },
        h('div', null, h('span', null, 'First Move Followed The Surprise'), h('b', null, `${first} of 8`)),
        h('div', null, h('span', null, 'Your Guesses Right'), h('b', null, `${mine} of 8`)),
        h('div', null, h('span', null, 'Hour Later Same As First'), h('b', null, `${hourMatch} of 8`))),
      h('p', { class: 'lab-teach', html: mdInline('Price reacts to the **surprise**, not the number. Even so, the direction of the first move is only loosely tied to it, and the hour after can go the other way. **The direction cannot be read from the number alone.** These releases are made up, with a weak link built in.') }));
    emit('sim.run', { sim: 'newsreaction', mine });
    onInteract();
  } });
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Eight made-up releases. For each, decide whether the currency will rise or fall in the first five minutes after it. Higher-than-forecast is the surprise in each case.'),
    list, h('div', { class: 'lab-actions' }, reveal), out, UNVERIFIED(), note());
}

/* ------------------------------------------------------------------ 9.13 a news event study */

export function eventstudy({ onInteract }) {
  const days = weekdays('2026-01-05', 60);
  const releaseDays = days.filter((_, i) => i % 3 === 1).slice(0, 20);
  const spikes = releaseDays.map((d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd, 13, 30); });
  const series = timedSeries({ seed: 'study', startISO: '2026-01-05', days: 60, tfMin: 30, spikes, spikeMult: 3.2 });
  const rel = new Set(releaseDays);
  const at = (ms) => new Date(ms).toISOString();
  const byDay = new Map();
  series.times.forEach((ms, i) => {
    const d = at(ms).slice(0, 10);
    if (new Date(ms).getUTCHours() === 13 && new Date(ms).getUTCMinutes() === 30) byDay.set(d, (series.candles[i][1] - series.candles[i][2]) / 0.0001);
  });
  const rReleases = releaseDays.map((d) => byDay.get(d));
  const rOrdinary = days.filter((d) => !rel.has(d)).map((d) => byDay.get(d));
  const stat = (xs) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
    return { n: xs.length, m, se: sd / Math.sqrt(xs.length) };
  };
  const out = h('div', { class: 'lab-out' });
  const group = [];
  const seen = new Set();
  const show = (k) => {
    seen.add(k);
    const a = stat(rReleases.slice(0, k));
    const b = stat(rOrdinary);
    out.replaceChildren(
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'stim-table' },
        h('thead', null, h('tr', null, ...['Group', 'Days', 'Average Range (Pips)', 'Standard Error'].map((c) => h('th', null, c)))),
        h('tbody', null, h('tr', null, h('td', null, 'Release days'), h('td', null, String(a.n)), h('td', null, a.m.toFixed(1)), h('td', null, '±' + a.se.toFixed(1))), h('tr', null, h('td', null, 'Ordinary days, same 30 minutes'), h('td', null, String(b.n)), h('td', null, b.m.toFixed(1)), h('td', null, '±' + b.se.toFixed(1)))))),
      h('p', { class: 'lab-result' }, `In the 30 minutes at the release time, the average range on release days was ${a.m.toFixed(1)} pips against ${b.m.toFixed(1)} on ordinary days (${a.n} and ${b.n} days).`),
      h('p', { class: 'lab-teach', html: mdInline('This is an **observation** about made-up data. With few release days the average is noisy. With more, the standard error shrinks. Note what is **not** measured here: direction. Only the size of the range is compared.') }));
    if (seen.size >= 2) onInteract();
  };
  const row = h('div', { class: 'choices' }, ...[5, 10, 20].map((k) => chip(`${k} releases`, k, group, (v) => show(+v))));
  show(5);
  mark(group, 5);
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Sixty made-up trading days. On 20 of them a made-up release happens at 13:30 UTC. Compare the range of that half-hour on release days with the same half-hour on ordinary days.'),
    row, out, UNVERIFIED(), note());
}
