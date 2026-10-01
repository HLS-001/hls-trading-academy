/**
 * Candles as plain arrays [open, high, low, close]. Pure functions, no browser code.
 * Measurements follow the definitions taught in Level 6: body = |C − O|, range = H − L, and the wicks are the parts of
 * the range outside the body.
 */

export const O = 0;
export const H = 1;
export const L = 2;
export const C = 3;

export const body = (c) => Math.abs(c[C] - c[O]);
export const range = (c) => c[H] - c[L];
export const upperWick = (c) => c[H] - Math.max(c[O], c[C]);
export const lowerWick = (c) => Math.min(c[O], c[C]) - c[L];
export const bodyRatio = (c) => (range(c) > 0 ? body(c) / range(c) : 0);

/** 'bull' when the close is above the open, 'bear' when below, 'flat' when equal. Colours are only a convention. */
export const direction = (c) => (c[C] > c[O] ? 'bull' : c[C] < c[O] ? 'bear' : 'flat');

/** One candle from a list of prices (ticks) in order: open = first, close = last. */
export function fromTicks(ticks) {
  return [ticks[0], Math.max(...ticks), Math.min(...ticks), ticks[ticks.length - 1]];
}

/** Combine consecutive candles into one: first open, highest high, lowest low, last close. */
export function combine(list) {
  return [list[0][O], Math.max(...list.map((c) => c[H])), Math.min(...list.map((c) => c[L])), list[list.length - 1][C]];
}

/** Aggregate every `k` candles into one. A trailing partial group is dropped (it is not a finished candle). */
export function aggregate(candles, k) {
  const out = [];
  for (let i = 0; i + k <= candles.length; i += k) out.push(combine(candles.slice(i, i + k)));
  return out;
}

export const meanRange = (candles, from = 0, to = candles.length - 1) => {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, from); i <= Math.min(candles.length - 1, to); i++) {
    s += range(candles[i]);
    n += 1;
  }
  return n ? s / n : 0;
};

/** Highest high and lowest low over an index window. */
export function extremes(candles, from = 0, to = candles.length - 1) {
  let hi = -Infinity;
  let lo = Infinity;
  let hiI = from;
  let loI = from;
  for (let i = Math.max(0, from); i <= Math.min(candles.length - 1, to); i++) {
    if (candles[i][H] > hi) {
      hi = candles[i][H];
      hiI = i;
    }
    if (candles[i][L] < lo) {
      lo = candles[i][L];
      loI = i;
    }
  }
  return { hi, lo, hiI, loI };
}
