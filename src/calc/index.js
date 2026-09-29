/**
 * The calculator engine. Pure functions, no UI, no storage.
 *
 * Lessons, calculators, drills, exams, chart-plan grading and the journal audit all call
 * these functions, so there is exactly one copy of every formula.
 *
 * Conventions
 *   - "rates" is an object of pair prices, e.g. { USDJPY: 150, GBPUSD: 1.35 }, used only to
 *     convert a quote currency into the account currency.
 *   - dir is +1 for long, -1 for short.
 *   - Money is in the account currency. Prices are chart prices (treated as bid).
 */

import { getMarket } from './markets.js';

/* ---------------------------------------------------------------- helpers */

/** Round half away from zero, tolerant of binary floating point (0.495 -> 0.50). */
export function round(x, d = 2) {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** d;
  return (Math.sign(x) * Math.round((Math.abs(x) + 1e-12) * f)) / f;
}

/** Number of decimal places in a step such as 0.01 or 0.1. */
function decimalsOf(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** Round DOWN to a whole number of steps. Never rounds up. */
export function floorToStep(x, step) {
  const d = decimalsOf(step);
  return round(Math.floor(x / step + 1e-9) * step, d);
}

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Sample variance (n - 1). */
export function variance(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1);
}
export const sd = (a) => Math.sqrt(variance(a));

/* ---------------------------------------------------------------- currency */

/** Price of one unit of `from` in `to`. Uses a direct pair, its inverse, or triangulates through USD. */
export function convRate(from, to, rates = {}) {
  if (from === to) return 1;
  if (rates[from + to]) return rates[from + to];
  if (rates[to + from]) return 1 / rates[to + from];
  if (from !== 'USD' && to !== 'USD') return convRate(from, 'USD', rates) * convRate('USD', to, rates);
  throw new Error(`No rate available to convert ${from} to ${to}`);
}

/* ---------------------------------------------------------------- pips */

export const pipSize = (symbol) => getMarket(symbol).pipSize;

/** Convert a price difference into pips (rounded to 6 places to remove float noise). */
export const toPips = (symbol, priceDiff) => round(priceDiff / pipSize(symbol), 6);

/** Value of one pip for one standard lot, in the QUOTE currency. */
export function pipValuePerLotQuote(symbol) {
  const m = getMarket(symbol);
  return round(m.pipSize * m.contractSize, 6);
}

/** Value of one pip for one standard lot, in the ACCOUNT currency. */
export function pipValuePerLot(symbol, acct = 'USD', rates = {}) {
  const m = getMarket(symbol);
  return pipValuePerLotQuote(symbol) * convRate(m.quote, acct, rates);
}

/** Value of one pip for a position of `lots`, in the account currency. */
export const pipValueTrade = (symbol, lots, acct = 'USD', rates = {}) => pipValuePerLot(symbol, acct, rates) * lots;

/** Distance between two prices in pips (always positive). */
export const stopDistancePips = (symbol, entry, stop) => Math.abs(toPips(symbol, entry - stop));

/** Is the stop on the correct side of the entry? */
export function validateStop({ dir, entry, stop, target }) {
  if (entry === stop) return { ok: false, message: 'The stop is at the entry price, so there is no risk distance.' };
  if (dir > 0 && stop > entry) return { ok: false, message: 'For a long trade the stop must be below the entry.' };
  if (dir < 0 && stop < entry) return { ok: false, message: 'For a short trade the stop must be above the entry.' };
  if (target !== undefined && ((dir > 0 && target <= entry) || (dir < 0 && target >= entry))) {
    return { ok: false, message: 'The target must be on the profit side of the entry.' };
  }
  return { ok: true, message: '' };
}

/* ---------------------------------------------------------------- risk and size */

export const dollarRisk = (balance, riskPct) => (balance * riskPct) / 100;
export const riskPercent = (riskMoney, balance) => (riskMoney / balance) * 100;

/**
 * Position size from a risk budget and a stop.
 * Always rounds the lot size DOWN to the lot step, then reports the risk actually taken.
 */
export function positionSize({
  balance,
  riskPct,
  riskMoney,
  symbol,
  entry,
  stop,
  spreadPips = 0,
  acct = 'USD',
  rates = {},
  lotStep = 0.01,
  minLot = 0.01
}) {
  const budget = riskMoney ?? dollarRisk(balance, riskPct);
  const stopPips = stopDistancePips(symbol, entry, stop);
  const riskPips = stopPips + spreadPips;
  const pv = pipValuePerLot(symbol, acct, rates);
  const rawLots = budget / (riskPips * pv);
  const lots = floorToStep(rawLots, lotStep);
  const belowMin = lots < minLot;
  const realizedRisk = lots * riskPips * pv;
  const riskAtMinLot = minLot * riskPips * pv;
  return {
    riskMoney: budget,
    stopPips,
    riskPips,
    pipValue: pv,
    rawLots,
    lots,
    belowMin,
    realizedRisk,
    realizedPct: (realizedRisk / balance) * 100,
    riskAtMinLot,
    riskAtMinLotPct: (riskAtMinLot / balance) * 100
  };
}

/** Percentage of the balance risked by an existing position. */
export function percentRisk({ lots, stopPips, symbol, balance, acct = 'USD', rates = {} }) {
  return ((lots * stopPips * pipValuePerLot(symbol, acct, rates)) / balance) * 100;
}

/* ---------------------------------------------------------------- reward and R */

export const rewardPips = (symbol, entry, target) => Math.abs(toPips(symbol, target - entry));

export function rewardMoney({ symbol, entry, target, lots, acct = 'USD', rates = {} }) {
  return rewardPips(symbol, entry, target) * pipValueTrade(symbol, lots, acct, rates);
}

/** Reward-to-risk ratio from pips. */
export const rewardRisk = (rewardP, riskP) => rewardP / riskP;

/** Result in R from a money result and the amount risked. Costs reduce the result. */
export const rMultiple = ({ pnl, riskMoney, costs = 0 }) => (pnl - costs) / riskMoney;

/** Result in R from prices alone. */
export function rFromPrices({ dir, entry, stop, exit }) {
  return (dir * (exit - entry)) / Math.abs(entry - stop);
}

export function pnlPips({ symbol, dir, entry, exit }) {
  return dir * toPips(symbol, exit - entry);
}

export function pnlMoney({ symbol, dir, entry, exit, lots, acct = 'USD', rates = {} }) {
  return pnlPips({ symbol, dir, entry, exit }) * pipValueTrade(symbol, lots, acct, rates);
}

/* ---------------------------------------------------------------- margin and account */

/** Margin needed to hold a position, in the account currency. */
export function marginRequired({ lots, symbol, price, leverage, acct = 'USD', rates = {} }) {
  const m = getMarket(symbol);
  const notionalQuote = lots * m.contractSize * price;
  return (notionalQuote * convRate(m.quote, acct, rates)) / leverage;
}

export function accountState({ balance, floatingPnl = 0, usedMargin = 0 }) {
  const equity = balance + floatingPnl;
  return {
    balance,
    equity,
    usedMargin,
    freeMargin: equity - usedMargin,
    marginLevel: usedMargin > 0 ? (equity / usedMargin) * 100 : null
  };
}

/* ---------------------------------------------------------------- cost of a trade */

/** Total round-trip cost of a trade and how much of 1R it eats. */
export function tradeCost({
  symbol,
  lots,
  spreadPips = 0,
  commission = 0,
  swap = 0,
  slippagePips = 0,
  acct = 'USD',
  rates = {},
  riskMoney
}) {
  const pv = pipValueTrade(symbol, lots, acct, rates);
  const spreadCost = spreadPips * pv;
  const slippageCost = slippagePips * pv;
  const total = spreadCost + commission + swap + slippageCost;
  return { spreadCost, commission, swap, slippageCost, total, costR: riskMoney ? total / riskMoney : null };
}

/* ---------------------------------------------------------------- expectancy and statistics */

/** Expectancy in R. avgLossR is the size of an average loser as a positive number (1 = 1R). */
export const expectancyR = ({ winRate, avgWinR, avgLossR }) => winRate * avgWinR - (1 - winRate) * avgLossR;

/** Win rate needed to break even at a given reward-to-risk ratio. */
export const breakevenWinRate = (rr) => 1 / (1 + rr);

export function profitFactor(rs) {
  const gain = sum(rs.filter((r) => r > 0));
  const loss = Math.abs(sum(rs.filter((r) => r < 0)));
  return loss === 0 ? (gain > 0 ? Infinity : NaN) : gain / loss;
}

/** Gain needed to recover after losing fraction d of an account (0.2 -> 0.25). */
export const recoveryRequired = (d) => 1 / (1 - d) - 1;

export function equityCurveR(rs) {
  let c = 0;
  return rs.map((r) => (c += r));
}

/** Largest peak-to-trough fall of the cumulative R curve, starting from zero. */
export function maxDrawdownR(rs) {
  let peak = 0;
  let cur = 0;
  let dd = 0;
  for (const r of rs) {
    cur += r;
    if (cur > peak) peak = cur;
    if (peak - cur > dd) dd = peak - cur;
  }
  return dd;
}

export function longestStreaks(rs, beThreshold = 0.1) {
  let w = 0;
  let l = 0;
  let bw = 0;
  let bl = 0;
  for (const r of rs) {
    if (r > beThreshold) {
      w += 1;
      l = 0;
    } else if (r < -beThreshold) {
      l += 1;
      w = 0;
    } else {
      w = 0;
      l = 0;
    }
    if (w > bw) bw = w;
    if (l > bl) bl = l;
  }
  return { win: bw, loss: bl };
}

export function tradeStats(rs, { beThreshold = 0.1 } = {}) {
  const wins = rs.filter((r) => r > beThreshold);
  const losses = rs.filter((r) => r < -beThreshold);
  const be = rs.length - wins.length - losses.length;
  const n = rs.length;
  return {
    n,
    wins: wins.length,
    losses: losses.length,
    breakeven: be,
    winRate: n ? wins.length / n : NaN,
    avgR: mean(rs),
    expectancy: mean(rs),
    medianR: median(rs),
    sd: sd(rs),
    standardError: n > 1 ? sd(rs) / Math.sqrt(n) : NaN,
    profitFactor: profitFactor(rs),
    avgWin: wins.length ? mean(wins) : NaN,
    avgLoss: losses.length ? mean(losses) : NaN,
    maxDrawdownR: maxDrawdownR(rs),
    streaks: longestStreaks(rs, beThreshold)
  };
}

/**
 * The streak ladder: an account after n consecutive losses.
 *   mode 'current' - each loss is riskPct of the CURRENT balance (compounding)
 *   mode 'fixed'   - each loss is riskPct of the STARTING balance
 */
export function streakLadder({ balance = 10000, riskPct, losses = [1, 3, 5, 8, 10], mode = 'current' }) {
  const r = riskPct / 100;
  return losses.map((n) => {
    const equity = mode === 'current' ? balance * (1 - r) ** n : balance - balance * r * n;
    const drawdown = 1 - equity / balance;
    return {
      losses: n,
      equity,
      drawdownPct: drawdown * 100,
      recoveryPct: drawdown >= 1 ? Infinity : recoveryRequired(drawdown) * 100
    };
  });
}

/* ---------------------------------------------------------------- exposure */

/** Net exposure per currency, in units of that currency, for a list of positions. */
export function currencyExposure(positions) {
  const out = {};
  for (const p of positions) {
    const m = getMarket(p.symbol);
    const units = p.lots * m.contractSize;
    out[m.base] = (out[m.base] || 0) + p.dir * units;
    out[m.quote] = (out[m.quote] || 0) - p.dir * units * (p.price ?? 1);
  }
  return out;
}

/* ---------------------------------------------------------------- exchange-rate reading */

/** Inverse quote: USD/EUR from EUR/USD. */
export const inverseQuote = (rate) => 1 / rate;

/** Cross rate of A/C from A/B and C/B (both quoted against B). e.g. EUR/GBP = EUR/USD ÷ GBP/USD. */
export const crossRate = (aPerB, cPerB) => aPerB / cPerB;
