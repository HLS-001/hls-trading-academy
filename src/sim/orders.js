/**
 * Order rules on a tick path (points that each have a bid and an ask). Pure functions, no browser.
 *
 *   order: { type, level, limit?, sl?, tp? }
 *     type   'market' | 'buy-limit' | 'buy-stop' | 'sell-limit' | 'sell-stop' | 'buy-stop-limit' | 'sell-stop-limit'
 *     level  the price of a pending order (the trigger price for a stop-limit); ignored for a market order
 *     limit  for a stop-limit: the worst price you accept once triggered
 *     sl, tp stop-loss and take-profit prices for the position the order opens
 *
 * A buy uses the ask. A sell uses the bid. A stop-loss is a stop order and a take-profit is a limit order:
 * you get the level or WORSE for a stop, and the level or BETTER for a limit.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

export const isMarket = (type) => type === 'market' || type.startsWith('market-');
/** +1 for a buy, -1 for a sell. A plain 'market' order is a buy. */
export const dirOf = (type) => (type === 'market' || type.startsWith('buy') || type === 'market-buy' ? 1 : -1);

/** Is a pending order on a valid side of the market right now? Returns { ok, message }. */
export function validate(order, m) {
  const { type, level } = order;
  const bad = (message) => ({ ok: false, message });
  if (type === 'buy-limit' && !(level < m.ask)) return bad('A buy limit must be BELOW the current price. It waits for the price to fall to you.');
  if (type === 'sell-limit' && !(level > m.bid)) return bad('A sell limit must be ABOVE the current price. It waits for the price to rise to you.');
  if (type === 'buy-stop' && !(level > m.ask)) return bad('A buy stop must be ABOVE the current price. It waits for the price to rise through it.');
  if (type === 'sell-stop' && !(level < m.bid)) return bad('A sell stop must be BELOW the current price. It waits for the price to fall through it.');
  if (type === 'buy-stop-limit' && !(level > m.ask && order.limit >= level)) return bad('A buy stop-limit needs a trigger ABOVE the price and a limit at or above the trigger.');
  if (type === 'sell-stop-limit' && !(level < m.bid && order.limit <= level)) return bad('A sell stop-limit needs a trigger BELOW the price and a limit at or below the trigger.');
  const dir = dirOf(type);
  if (order.sl !== undefined && order.sl !== null) {
    const ref = isMarket(type) ? (dir > 0 ? m.ask : m.bid) : level;
    if (dir > 0 && !(order.sl < ref)) return bad('For a long trade the stop-loss must be BELOW the entry.');
    if (dir < 0 && !(order.sl > ref)) return bad('For a short trade the stop-loss must be ABOVE the entry.');
  }
  if (order.tp !== undefined && order.tp !== null) {
    const ref = isMarket(type) ? (dir > 0 ? m.ask : m.bid) : level;
    if (dir > 0 && !(order.tp > ref)) return bad('For a long trade the take-profit must be ABOVE the entry.');
    if (dir < 0 && !(order.tp < ref)) return bad('For a short trade the take-profit must be BELOW the entry.');
  }
  return { ok: true, message: '' };
}

/**
 * Run an order over a path. `start` is the index where the order is placed (a market order fills `latency` points later).
 * Returns { filled, fillIndex, fillPrice, slipped, exit: { index, price, reason } | null, r }.
 */
export function runOrder(path, order, { start = 0, latency = 0 } = {}) {
  const { type } = order;
  const dir = dirOf(type);
  let fillIndex = -1;
  let fillPrice = null;
  let triggered = false;

  for (let i = start + (isMarket(type) ? latency : 1); i < path.length; i++) {
    const p = path[i];
    const ask = p.ask;
    const bid = p.bid;
    if (isMarket(type)) {
      fillIndex = i;
      fillPrice = dir > 0 ? ask : bid;
    } else if (type === 'buy-limit' && ask <= order.level) {
      fillIndex = i;
      fillPrice = Math.min(order.level, ask);
    } else if (type === 'buy-stop' && ask >= order.level) {
      fillIndex = i;
      fillPrice = Math.max(order.level, ask);
    } else if (type === 'sell-limit' && bid >= order.level) {
      fillIndex = i;
      fillPrice = Math.max(order.level, bid);
    } else if (type === 'sell-stop' && bid <= order.level) {
      fillIndex = i;
      fillPrice = Math.min(order.level, bid);
    } else if (type === 'buy-stop-limit') {
      if (!triggered && ask >= order.level) triggered = true;
      if (triggered && ask <= order.limit) {
        fillIndex = i;
        fillPrice = ask;
      }
    } else if (type === 'sell-stop-limit') {
      if (!triggered && bid <= order.level) triggered = true;
      if (triggered && bid >= order.limit) {
        fillIndex = i;
        fillPrice = bid;
      }
    }
    if (fillIndex >= 0) break;
  }
  if (fillIndex < 0) return { filled: false, triggered, fillIndex, fillPrice: null, slipped: 0, exit: null, r: 0 };

  const reference = isMarket(type) ? (start < path.length ? (dir > 0 ? path[start].ask : path[start].bid) : fillPrice) : order.level;
  const slipped = dir * (fillPrice - reference); // positive = a worse price than expected
  let exit = null;
  for (let i = fillIndex + 1; i < path.length && !exit; i++) {
    const p = path[i];
    if (dir > 0) {
      if (order.sl != null && p.bid <= order.sl) exit = { index: i, price: Math.min(order.sl, p.bid), reason: 'stop-loss' };
      else if (order.tp != null && p.bid >= order.tp) exit = { index: i, price: Math.max(order.tp, p.bid), reason: 'take-profit' };
    } else if (order.sl != null && p.ask >= order.sl) exit = { index: i, price: Math.max(order.sl, p.ask), reason: 'stop-loss' };
    else if (order.tp != null && p.ask <= order.tp) exit = { index: i, price: Math.min(order.tp, p.ask), reason: 'take-profit' };
  }
  const risk = order.sl != null ? Math.abs(reference - order.sl) : null;
  const closePrice = exit ? exit.price : dir > 0 ? path[path.length - 1].bid : path[path.length - 1].ask;
  const r = risk ? (dir * (closePrice - fillPrice)) / risk : null;
  return { filled: true, triggered: true, fillIndex, fillPrice, slipped, exit, closePrice, r };
}
