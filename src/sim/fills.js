/**
 * Fill simulation: how one trade plan plays out on a run of candles, under different fill assumptions.
 * Pure functions, no browser. Used by the Fill Simulator (lessons 4.12 and 13.07), the order simulator (Level 4)
 * and the chart-plan outcome simulation (Part 6, section 6.7).
 *
 * Candles are BID prices (as on a chart): { o, h, l, c }.
 *   A buy uses the ask (bid + spread). A sell uses the bid.
 *   A long stop-loss is a sell, so it triggers on the bid. A short stop-loss is a buy, so it triggers on the ask.
 *
 * plan: { dir: 1 | -1, type: 'market' | 'limit' | 'stop', entry, stop, target }
 * assumptions:
 *   spread      spread in price units
 *   slip        slippage in price units, always against you on market and stop orders
 *   through     a limit or stop order fills only if price goes this far past the level (price units)
 *   ambiguity   'stop-first' | 'target-first': which happens when both are inside one candle
 *
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

export const ASSUMPTIONS = {
  touch: { label: 'Touch Fills', spread: 0, slip: 0, through: 0, ambiguity: 'target-first' },
  spread: { label: 'Spread Included', spread: 1, slip: 0, through: 0, ambiguity: 'stop-first' },
  strict: { label: 'Conservative', spread: 1, slip: 0.5, through: 0.5, ambiguity: 'stop-first' }
};

/** Turn a preset of pips into price units. */
export const assume = (preset, pipSize) => ({
  spread: preset.spread * pipSize,
  slip: preset.slip * pipSize,
  through: preset.through * pipSize,
  ambiguity: preset.ambiguity
});

export function simulatePlan({ candles, plan, a }) {
  const { dir, type, entry, stop, target } = plan;
  const risk = Math.abs(entry - stop);
  let filled = false;
  let fillIndex = -1;
  let entryPrice = null;
  let ambiguous = 0;

  const done = (i, price, reason) => {
    const r = risk > 0 ? (dir * (price - entryPrice)) / risk : 0;
    return { filled: true, fillIndex, entryPrice, exit: { index: i, price, reason }, r, ambiguous };
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!filled) {
      if (type === 'market') {
        filled = true;
        fillIndex = i;
        entryPrice = dir > 0 ? c.o + a.spread + a.slip : c.o - a.slip;
        // a market order fills at the open, so the rest of this candle can still hit the stop or the target
      } else if (dir > 0 && type === 'limit') {
        if (c.l + a.spread <= entry - a.through) {
          filled = true;
          fillIndex = i;
          entryPrice = c.o + a.spread <= entry ? c.o + a.spread : entry;
        }
      } else if (dir > 0 && type === 'stop') {
        if (c.h + a.spread >= entry + a.through) {
          filled = true;
          fillIndex = i;
          entryPrice = c.o + a.spread >= entry ? c.o + a.spread : entry + a.slip;
        }
      } else if (dir < 0 && type === 'limit') {
        if (c.h >= entry + a.through) {
          filled = true;
          fillIndex = i;
          entryPrice = c.o >= entry ? c.o : entry;
        }
      } else if (dir < 0 && type === 'stop') {
        if (c.l <= entry - a.through) {
          filled = true;
          fillIndex = i;
          entryPrice = c.o <= entry ? c.o : entry - a.slip;
        }
      }
      if (!filled) continue;
    }

    // exits: the stop first if the candle opens through it (a gap), then the rules for one candle
    let stopHit;
    let targetHit;
    let stopPrice;
    let targetPrice;
    if (dir > 0) {
      stopHit = c.l <= stop;
      targetHit = c.h >= target;
      stopPrice = c.o <= stop ? c.o - a.slip : stop - a.slip;
      targetPrice = c.o >= target ? c.o : target;
    } else {
      stopHit = c.h + a.spread >= stop;
      targetHit = c.l + a.spread <= target;
      stopPrice = c.o + a.spread >= stop ? c.o + a.spread + a.slip : stop + a.slip;
      targetPrice = c.o + a.spread <= target ? c.o + a.spread : target;
    }
    const gappedStop = dir > 0 ? c.o <= stop : c.o + a.spread >= stop;
    if (stopHit && targetHit) {
      ambiguous += 1;
      if (gappedStop || a.ambiguity === 'stop-first') return done(i, stopPrice, 'stop');
      return done(i, targetPrice, 'target');
    }
    if (stopHit) return done(i, stopPrice, 'stop');
    if (targetHit) return done(i, targetPrice, 'target');
  }

  if (!filled) return { filled: false, fillIndex: -1, entryPrice: null, exit: null, r: 0, ambiguous };
  const last = candles[candles.length - 1];
  const mark = dir > 0 ? last.c : last.c + a.spread;
  return done(candles.length - 1, mark, 'open');
}
