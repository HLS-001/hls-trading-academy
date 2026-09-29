/**
 * Market specifications: the single source of truth for pip size and contract size.
 * Adding a pair is adding a row. Nothing in the calc engine assumes FX beyond these fields.
 */

const row = (symbol, base, quote, category) => ({
  symbol,
  base,
  quote,
  category,
  pipSize: quote === 'JPY' ? 0.01 : 0.0001,
  digits: quote === 'JPY' ? 3 : 5,
  contractSize: 100000
});

export const MARKETS = [
  row('EURUSD', 'EUR', 'USD', 'major'),
  row('GBPUSD', 'GBP', 'USD', 'major'),
  row('USDJPY', 'USD', 'JPY', 'major'),
  row('USDCHF', 'USD', 'CHF', 'major'),
  row('AUDUSD', 'AUD', 'USD', 'major'),
  row('USDCAD', 'USD', 'CAD', 'major'),
  row('NZDUSD', 'NZD', 'USD', 'major'),
  row('EURGBP', 'EUR', 'GBP', 'minor'),
  row('EURJPY', 'EUR', 'JPY', 'minor'),
  row('GBPJPY', 'GBP', 'JPY', 'minor'),
  row('CADJPY', 'CAD', 'JPY', 'minor')
];

const BY_SYMBOL = new Map(MARKETS.map((m) => [m.symbol, m]));

export function getMarket(symbol) {
  const m = BY_SYMBOL.get(String(symbol).replace('/', '').toUpperCase());
  if (!m) throw new Error('Unknown market: ' + symbol);
  return m;
}

export const hasMarket = (symbol) => BY_SYMBOL.has(String(symbol).replace('/', '').toUpperCase());

/** Example prices used only by teaching examples. Not market data. */
export const TEACHING_RATES = {
  EURUSD: 1.175,
  GBPUSD: 1.35,
  AUDUSD: 0.66,
  NZDUSD: 0.6,
  USDJPY: 150,
  USDCAD: 1.36,
  USDCHF: 0.88,
  EURGBP: 0.87,
  EURJPY: 176.25,
  GBPJPY: 202.5,
  CADJPY: 110.29
};

/** "EURUSD" -> "EUR/USD" */
export const pretty = (symbol) => symbol.slice(0, 3) + '/' + symbol.slice(3);
