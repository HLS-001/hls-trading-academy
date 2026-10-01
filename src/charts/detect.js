/**
 * Deterministic detectors for swings, structure, invalidation and breaks. Definitions, not truth: every exercise states the
 * parameters it used. Each function is run AS OF a decision bar (`upto`) and never reads a later candle, so a reference
 * answer can never contain hindsight.
 *
 * Swing high at bar i with size n:  high[i] > high[i−j]  and  high[i] ≥ high[i+j]  for j = 1..n
 *   (strict on the left, non-strict on the right, so the first of equal highs wins). A swing low is the mirror.
 * A swing is CONFIRMED at the close of bar i + n. Until then the newest extreme is PROVISIONAL.
 * Two swings of the same kind in a row: keep the more extreme one.
 * A structural (order-2) swing applies the same rule to the sequence of order-1 swings of that kind.
 */

import { H, L, C } from './candles.js';

const isSwingHigh = (cs, i, n, upto) => {
  if (i - n < 0 || i + n > upto) return false;
  for (let j = 1; j <= n; j++) if (!(cs[i][H] > cs[i - j][H]) || !(cs[i][H] >= cs[i + j][H])) return false;
  return true;
};
const isSwingLow = (cs, i, n, upto) => {
  if (i - n < 0 || i + n > upto) return false;
  for (let j = 1; j <= n; j++) if (!(cs[i][L] < cs[i - j][L]) || !(cs[i][L] <= cs[i + j][L])) return false;
  return true;
};

/** Every order-1 swing that is confirmed by bar `upto`, before alternation. */
export function rawSwings(candles, n, upto = candles.length - 1) {
  const out = [];
  for (let i = n; i + n <= upto; i++) {
    if (isSwingHigh(candles, i, n, upto)) out.push({ i, type: 'high', price: candles[i][H], confirmedAt: i + n });
    if (isSwingLow(candles, i, n, upto)) out.push({ i, type: 'low', price: candles[i][L], confirmedAt: i + n });
  }
  return out;
}

/** Confirmed order-1 swings as of bar `upto`, alternating high and low. */
export function swings(candles, n, upto = candles.length - 1) {
  const seq = [];
  for (const s of rawSwings(candles, n, upto)) {
    const last = seq[seq.length - 1];
    if (last && last.i === s.i) continue; // an outside bar cannot be both ends of a swing pair
    if (last && last.type === s.type) {
      if (s.type === 'high' ? s.price > last.price : s.price < last.price) seq[seq.length - 1] = s;
    } else seq.push(s);
  }
  return seq;
}

/**
 * The newest extremes that a swing of size n would still need bars to confirm. A bar qualifies when it beats the n bars
 * before it and nothing since has beaten it, but fewer than n bars have closed after it.
 */
export function provisional(candles, n, upto = candles.length - 1) {
  const out = [];
  for (let i = Math.max(n, upto - n + 1); i <= upto; i++) {
    let hi = true;
    let lo = true;
    for (let j = 1; j <= n; j++) {
      if (!(candles[i][H] > candles[i - j][H])) hi = false;
      if (!(candles[i][L] < candles[i - j][L])) lo = false;
    }
    for (let k = i + 1; k <= upto; k++) {
      if (candles[k][H] > candles[i][H]) hi = false;
      if (candles[k][L] < candles[i][L]) lo = false;
    }
    if (hi) out.push({ i, type: 'high', price: candles[i][H], confirmedAt: i + n });
    if (lo) out.push({ i, type: 'low', price: candles[i][L], confirmedAt: i + n });
  }
  return out;
}

/** Structural (order-2) swings: an order-1 high higher than the order-1 highs on either side of it, and the mirror for lows. */
export function structural(list) {
  const pickOut = (arr, high) => {
    const out = [];
    for (let k = 1; k < arr.length - 1; k++) {
      const s = arr[k];
      const ok = high ? s.price > arr[k - 1].price && s.price >= arr[k + 1].price : s.price < arr[k - 1].price && s.price <= arr[k + 1].price;
      if (ok) out.push({ ...s, confirmedAt: arr[k + 1].confirmedAt, order: 2 });
    }
    return out;
  };
  const merged = [...pickOut(list.filter((s) => s.type === 'high'), true), ...pickOut(list.filter((s) => s.type === 'low'), false)].sort((a, b) => a.i - b.i || (a.type === 'high' ? -1 : 1));
  const seq = [];
  for (const s of merged) {
    const last = seq[seq.length - 1];
    if (last && last.type === s.type) {
      if (s.type === 'high' ? s.price > last.price : s.price < last.price) seq[seq.length - 1] = s;
    } else seq.push(s);
  }
  return seq;
}

export const lastOfType = (list, type) => {
  for (let k = list.length - 1; k >= 0; k--) if (list[k].type === type) return list[k];
  return null;
};

const lastTwo = (list, type) => list.filter((s) => s.type === type).slice(-2);

/**
 * Structure from the last two swing highs (H1 older, H2 newer) and the last two swing lows (L1, L2).
 *   range     both differences within a tolerance of the current swing range
 *   bullish   H2 > H1 and L2 > L1
 *   bearish   H2 < H1 and L2 < L1
 *   unclear   anything else, or too few swings
 * confidence is 'borderline' when a comparison sits within 25% of the tolerance.
 */
export function classify(list, { rangeTolFrac = 0.15 } = {}) {
  const [H1, H2] = lastTwo(list, 'high');
  const [L1, L2] = lastTwo(list, 'low');
  if (!H1 || !H2 || !L1 || !L2) return { structure: 'unclear', confidence: 'clear', reason: 'too few swings', highs: [H1, H2].filter(Boolean), lows: [L1, L2].filter(Boolean) };
  const span = Math.max(H1.price, H2.price) - Math.min(L1.price, L2.price);
  const tol = rangeTolFrac * span;
  const dH = H2.price - H1.price;
  const dL = L2.price - L1.price;
  let structure = 'unclear';
  if (Math.abs(dH) <= tol && Math.abs(dL) <= tol) structure = 'range';
  else if (dH > 0 && dL > 0) structure = 'bullish';
  else if (dH < 0 && dL < 0) structure = 'bearish';
  const near = (d) => Math.abs(d) >= 0.75 * tol && Math.abs(d) <= 1.25 * tol;
  const confidence = near(dH) || near(dL) ? 'borderline' : 'clear';
  return { structure, confidence, reason: '', highs: [H1, H2], lows: [L1, L2], tol, dH, dL };
}

/** The level that would invalidate the current structure: the last structural low in a bullish one, and so on. */
export function invalidation(cls, list) {
  if (cls.structure === 'bullish') return { kind: 'low', swing: lastOfType(list, 'low') };
  if (cls.structure === 'bearish') return { kind: 'high', swing: lastOfType(list, 'high') };
  if (cls.structure === 'range') return { kind: 'both', high: lastOfType(list, 'high'), low: lastOfType(list, 'low') };
  return null;
}

/** First bar after `from` (up to `upto`) that breaks `level`. dir 'up' or 'down'; by 'close' or 'wick'. -1 when none. */
export function firstBreach(candles, level, dir, from, upto, by = 'close') {
  for (let t = from + 1; t <= upto; t++) {
    const c = candles[t];
    if (dir === 'up' ? (by === 'close' ? c[C] > level : c[H] > level) : by === 'close' ? c[C] < level : c[L] < level) return t;
  }
  return -1;
}

/**
 * Breaks of the most recent confirmed swing, bar by bar. At each bar only the swings confirmed by the PREVIOUS bar are used.
 *   kind 'bos'    a break in the direction of the existing structure
 *   kind 'shift'  a break against it
 *   kind 'break'  a break when the structure was a range or unclear
 * Each swing level is reported once.
 */
export function structureEvents(candles, { n = 2, order = 1, by = 'close', upto = candles.length - 1 } = {}) {
  const events = [];
  const broken = new Set();
  for (let t = 1; t <= upto; t++) {
    const base = swings(candles, n, t - 1);
    const st = order === 2 ? structural(base) : base;
    const hi = lastOfType(st, 'high');
    const lo = lastOfType(st, 'low');
    if (!hi && !lo) continue;
    const cls = classify(st);
    const c = candles[t];
    const test = (s, dir) => {
      if (!s) return;
      const key = `${s.type}${s.i}`;
      if (broken.has(key)) return;
      const hit = dir === 'up' ? (by === 'close' ? c[C] > s.price : c[H] > s.price) : by === 'close' ? c[C] < s.price : c[L] < s.price;
      if (!hit) return;
      broken.add(key);
      const kind = cls.structure === 'bullish' ? (dir === 'up' ? 'bos' : 'shift') : cls.structure === 'bearish' ? (dir === 'down' ? 'bos' : 'shift') : 'break';
      events.push({ bar: t, dir, level: s.price, levelI: s.i, kind, before: cls.structure });
    };
    test(hi, 'up');
    test(lo, 'down');
  }
  return events;
}

/** How much of a leg a counter-move gave back: 0.5 means half. */
export const retracement = (legStart, legEnd, extreme) => (legEnd === legStart ? 0 : (legEnd - extreme) / (legEnd - legStart));

/** Label each swing in a sequence against the previous swing of the same kind: HH, LH, HL, LL, or EQ when within `tol`. */
export function labelSwings(list, tol = 0) {
  const prev = { high: null, low: null };
  return list.map((s) => {
    const p = prev[s.type];
    prev[s.type] = s;
    if (!p) return { ...s, label: null };
    const d = s.price - p.price;
    if (Math.abs(d) <= tol) return { ...s, label: 'EQ' };
    if (s.type === 'high') return { ...s, label: d > 0 ? 'HH' : 'LH' };
    return { ...s, label: d > 0 ? 'HL' : 'LL' };
  });
}

/** Ranges of the bars in a window compared with the bars before it: 'contraction' below 0.7×, 'expansion' above 1.4×. */
export function rangeState(candles, from, to, refFrom, refTo) {
  const avg = (a, b) => {
    let s = 0;
    let k = 0;
    for (let i = a; i <= b; i++) {
      s += candles[i][H] - candles[i][L];
      k += 1;
    }
    return k ? s / k : 0;
  };
  const ratio = avg(from, to) / (avg(refFrom, refTo) || 1);
  return { ratio, state: ratio < 0.7 ? 'contraction' : ratio > 1.4 ? 'expansion' : 'normal' };
}
