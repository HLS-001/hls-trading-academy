/**
 * The synthetic chart generator. Simulated. Illustrates a mechanism; predicts nothing.
 *
 * A recipe lays out waypoints (a plan of legs, each made of smaller sub-legs), then a seeded walk with wicks is drawn along
 * them. The recipe only says what shape was INTENDED. Every reference answer is computed by the detectors, and for clean
 * recipes the generator tries further seeds until the detector agrees with the intent, so a "bullish" chart really is
 * bullish under the exercise's stated definition. Same seed, same chart, on every device.
 */

import { makeRng } from '../learn/rng.js';
import { gauss } from '../sim/paths.js';
import { swings, structural, classify, rangeState } from './detect.js';

const PIP = 0.0001;
const DP = 5;

/* ------------------------------------------------------------------ drawing candles along waypoints */

/**
 * waypoints: [{ t, p }] with t increasing bar indexes and p the price the close passes through at that bar.
 * vol(t) scales the noise and the wicks at bar t (1 = normal).
 */
export function drawCandles({ seed, waypoints, noise = 2.0, wick = 2.4, vol = () => 1, pip = PIP, dp = DP }) {
  const rng = makeRng('draw#' + seed);
  const total = waypoints[waypoints.length - 1].t;
  const round = (x) => +x.toFixed(dp);
  const at = (k) => {
    let a = 0;
    while (a < waypoints.length - 2 && waypoints[a + 1].t < k) a += 1;
    const w0 = waypoints[a];
    const w1 = waypoints[a + 1];
    const f = w1.t === w0.t ? 1 : Math.min(1, Math.max(0, (k - w0.t) / (w1.t - w0.t)));
    return w0.p + (w1.p - w0.p) * f;
  };
  const out = [];
  let prev = waypoints[0].p;
  let e = 0;
  for (let k = 1; k <= total; k++) {
    const v = vol(k);
    e = 0.45 * e + noise * v * gauss(rng) * pip * 0.55;
    const close = k === total || waypoints.some((w) => w.t === k) ? at(k) + e * 0.35 : at(k) + e;
    const open = prev;
    const top = Math.max(open, close) + Math.abs(gauss(rng)) * wick * v * pip * 0.55;
    const bot = Math.min(open, close) - Math.abs(gauss(rng)) * wick * v * pip * 0.55;
    out.push([round(open), round(top), round(bot), round(close)]);
    prev = close;
  }
  return out;
}

/* ------------------------------------------------------------------ legs */

/** Points after (t0, p0) for one major leg of `size` pips in direction dir, built of `subs` sub-legs with small pullbacks. */
function leg(rng, t0, p0, dir, size, bars, subs, pull) {
  const pts = [];
  let t = t0;
  const d = size / subs;
  const up = Math.max(3, Math.round((bars * 0.7) / subs));
  const dn = Math.max(3, Math.round((bars * 0.3) / subs));
  for (let s = 1; s <= subs; s++) {
    const top = p0 + dir * d * s * PIP + gauss(rng) * 1.2 * PIP;
    t += up + (rng.chance(0.35) ? 1 : 0);
    pts.push({ t, p: top });
    if (s < subs) {
      t += dn;
      pts.push({ t, p: top - dir * pull * d * PIP });
    }
  }
  return pts;
}

const between = (rng, a, b) => a + (b - a) * rng.next();
const start = (rng) => ({ t: 0, p: +(1.05 + rng.next() * 0.25).toFixed(4) });

/** Impulses and counter-moves alternate; dir 1 gives higher highs and higher lows, dir −1 the mirror. */
function planTrend(rng, dir, majors) {
  const wps = [start(rng)];
  let cur = wps[0];
  let last = 0;
  for (let k = 0; k < majors; k++) {
    const impulse = k % 2 === 0;
    const size = impulse ? (k === 0 ? between(rng, 55, 85) : last * between(rng, 0.35, 0.55) + between(rng, 30, 60)) : last * between(rng, 0.36, 0.52);
    const d = impulse ? dir : -dir;
    const pts = leg(rng, cur.t, cur.p, d, size, impulse ? 13 : 8, impulse ? (rng.chance(0.6) ? 3 : 2) : rng.chance(0.4) ? 2 : 1, between(rng, 0.3, 0.45));
    wps.push(...pts);
    cur = pts[pts.length - 1];
    last = size;
  }
  return wps;
}

/** Oscillate between a floor and a ceiling (in pips above the start). ceilShift and floorShift move them on each visit. */
function planBand(rng, legs, { top, bottom, jitter = 0.05, ceilShift = 0, floorShift = 0 }) {
  const first = start(rng);
  const wps = [first];
  const base = first.p;
  let cur = first;
  let up = true;
  let ku = 0;
  let kl = 0;
  for (let k = 0; k < legs; k++) {
    const tgt = up ? top + ceilShift * ku++ : bottom + floorShift * kl++;
    const targetP = base + (tgt + gauss(rng) * jitter * (top - bottom)) * PIP;
    const size = Math.abs(targetP - cur.p) / PIP;
    const pts = leg(rng, cur.t, cur.p, up ? 1 : -1, Math.max(20, size), 11, rng.chance(0.5) ? 2 : 1, 0.35);
    wps.push(...pts);
    cur = pts[pts.length - 1];
    up = !up;
  }
  return wps;
}

/* ------------------------------------------------------------------ recipes */

/** Each recipe returns waypoints and (optionally) segments. `want` says which structure the detector should find. */
export const RECIPES = {
  'trend-up': { want: 'bullish', plan: (rng, o) => ({ wps: planTrend(rng, 1, o.majors || 6) }) },
  'trend-down': { want: 'bearish', plan: (rng, o) => ({ wps: planTrend(rng, -1, o.majors || 6) }) },
  range: { want: 'range', plan: (rng, o) => ({ wps: planBand(rng, o.majors || 7, { top: 70, bottom: 0, jitter: 0.045 }) }) },
  broadening: { want: 'unclear', plan: (rng, o) => ({ wps: planBand(rng, o.majors || 7, { top: 60, bottom: 0, jitter: 0.03, ceilShift: 16, floorShift: -16 }) }) },
  contracting: { want: 'unclear', plan: (rng, o) => ({ wps: planBand(rng, o.majors || 7, { top: 110, bottom: 0, jitter: 0.03, ceilShift: -13, floorShift: 13 }) }) },
  'shift-down': {
    want: 'bearish',
    plan: (rng, o) => {
      const wps = planTrend(rng, 1, 5);
      let cur = wps[wps.length - 1];
      const a = leg(rng, cur.t, cur.p, -1, between(rng, 110, 150), 14, 3, 0.35);
      wps.push(...a);
      cur = a[a.length - 1];
      const b = leg(rng, cur.t, cur.p, 1, between(rng, 40, 60), 9, 2, 0.35);
      wps.push(...b);
      cur = b[b.length - 1];
      const c = leg(rng, cur.t, cur.p, -1, between(rng, 60, 90), 11, 2, 0.35);
      wps.push(...c);
      return { wps };
    }
  },
  'shift-up': {
    want: 'bullish',
    plan: (rng) => {
      const wps = planTrend(rng, -1, 5);
      let cur = wps[wps.length - 1];
      const a = leg(rng, cur.t, cur.p, 1, between(rng, 110, 150), 14, 3, 0.35);
      wps.push(...a);
      cur = a[a.length - 1];
      const b = leg(rng, cur.t, cur.p, -1, between(rng, 40, 60), 9, 2, 0.35);
      wps.push(...b);
      cur = b[b.length - 1];
      const c = leg(rng, cur.t, cur.p, 1, between(rng, 60, 90), 11, 2, 0.35);
      wps.push(...c);
      return { wps };
    }
  },
  /** A quiet stretch, an expansion, a quiet stretch. Segment labels come from the range test, not from the plan. */
  'quiet-expand': {
    want: null,
    plan: (rng) => {
      const s0 = start(rng);
      const wps = [s0];
      let t = 0;
      let p = s0.p;
      const push = (bars, pips) => {
        t += bars;
        p += pips * PIP;
        wps.push({ t, p });
      };
      push(6, 4);
      push(6, -5);
      push(6, 4);
      push(8, 52);
      push(6, 20);
      push(6, -30);
      push(6, 4);
      push(6, -5);
      const vol = (k) => (k <= 18 ? 0.42 : k <= 38 ? 1.7 : 0.42);
      return { wps, vol, segments: [{ from: 0, to: 17, label: 'contraction' }, { from: 18, to: 37, label: 'expansion' }, { from: 38, to: 49, label: 'contraction' }] };
    }
  },
  /** One impulse and one correction that retraces `retr` of it. */
  'impulse-correction': {
    want: null,
    plan: (rng, o) => {
      const s0 = start(rng);
      const dir = o.dir || 1;
      const size = Math.round(between(rng, 70, 110));
      const wps = [s0];
      const lead = leg(rng, 0, s0.p, -dir, between(rng, 18, 26), 6, 1, 0.3);
      wps.push(...lead);
      const a = lead[lead.length - 1];
      const imp = leg(rng, a.t, a.p, dir, size, 12, 1, 0.3);
      wps.push(...imp);
      const b = imp[imp.length - 1];
      const retr = o.retr || 0.5;
      const cor = leg(rng, b.t, b.p, -dir, size * retr, 8, 1, 0.3);
      wps.push(...cor);
      const c = cor[cor.length - 1];
      const tail = leg(rng, c.t, c.p, dir, size * 0.35, 6, 1, 0.3);
      wps.push(...tail);
      return { wps, points: { start: { t: a.t, p: a.p }, top: { t: b.t, p: b.p }, low: { t: c.t, p: c.p } }, retr };
    }
  }
};

/* ------------------------------------------------------------------ agreement between the intent and the detectors */

function structureAt(candles, upto, n, order) {
  const sw = swings(candles, n, upto);
  const list = order === 2 ? structural(sw) : sw;
  return classify(list);
}

/**
 * A finished chart: candles, the recipe and seed that made it, and what the detector says about it as of `visibleBars`.
 * opts: { n, order, majors, visibleBars, sealedBars, dir, retr, clean = true }
 */
export function makeChart(recipe, seed, opts = {}) {
  const def = RECIPES[recipe];
  if (!def) throw new Error('Unknown chart recipe ' + recipe);
  const n = opts.n || 3;
  const order = opts.order || 1;
  const clean = opts.clean !== false;
  const sealedBars = opts.sealedBars || 0;
  let last = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = `${recipe}#${seed}#${attempt}`;
    const rng = makeRng('plan#' + s);
    const plan = def.plan(rng, opts);
    const candles = drawCandles({ seed: s, waypoints: plan.wps, vol: plan.vol });
    const upto = candles.length - 1 - sealedBars;
    const cls = structureAt(candles, upto, n, order);
    const made = { recipe, seed, attempt, candles, upto, n, order, cls, segments: plan.segments || null, points: plan.points || null, retr: plan.retr };
    last = made;
    if (!clean) return made;
    if (def.want === null) {
      if (!plan.segments) return made;
      const ok = plan.segments.every((sg) => rangeState(candles, sg.from, sg.to, 0, candles.length - 1).state === sg.label);
      if (ok) return made;
      continue;
    }
    if (cls.structure === def.want && (def.want === 'unclear' || cls.confidence === 'clear')) return made;
  }
  return last;
}
