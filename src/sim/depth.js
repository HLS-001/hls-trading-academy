/**
 * A teaching model of market depth: how the price you get changes with the size of a market order.
 * Retail Forex platforms usually show no order book, so these books are illustrative. The point is that
 * liquidity varies, and that a large order in a thin market moves the price it fills at.
 */

/** Each level: how many pips above the best price, and how many lots are offered there. */
export const BOOKS = {
  deep: [
    { off: 0, lots: 40 },
    { off: 0.1, lots: 40 },
    { off: 0.2, lots: 60 },
    { off: 0.4, lots: 80 },
    { off: 0.8, lots: 120 },
    { off: 1.5, lots: 200 }
  ],
  thin: [
    { off: 0, lots: 3 },
    { off: 0.4, lots: 3 },
    { off: 1, lots: 4 },
    { off: 2, lots: 6 },
    { off: 3.5, lots: 10 },
    { off: 6, lots: 20 }
  ]
};

/**
 * Walk up the book, taking what each level offers, until the order is filled.
 * Returns the average fill in pips above the best price, and the lots that could not be filled.
 */
export function walkBook(book, lots) {
  let left = lots;
  let cost = 0;
  const takes = [];
  for (const lv of book) {
    if (left <= 0) break;
    const take = Math.min(left, lv.lots);
    cost += take * lv.off;
    takes.push({ off: lv.off, lots: take });
    left -= take;
  }
  const filled = lots - left;
  return { avgPips: filled ? cost / filled : 0, filled, unfilled: left, takes };
}
