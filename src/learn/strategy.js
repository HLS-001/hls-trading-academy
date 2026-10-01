/**
 * The strategy document: ten components, the Completeness Check and the ambiguity scan. Pure functions, no DOM, so the tests
 * can run them. The checks look at the WRITING: is every part present, is it specific, and does it avoid the words that two people
 * would read differently. Whether the rules are really applicable is the mentor's Two-Person Test.
 */

export const STRATEGY_FIELDS = [
  { id: 'market', n: 1, label: 'Market', must: 'Which instrument or instruments, and why.', hint: 'Name the market and give a reason, for example costs, liquidity or the hours you can watch.' },
  { id: 'timeframe', n: 2, label: 'Timeframe', must: 'The analysis timeframe and the execution timeframe.', hint: 'State both, for example 1-hour to analyse and 5-minute to execute.' },
  { id: 'session', n: 3, label: 'Trading Session', must: 'A time window in a named time zone.', hint: 'Name the zone and the window, for example 08:00 to 11:00 New York time.' },
  { id: 'setup', n: 4, label: 'Setup', must: 'The context conditions that make a trade possible. Every one testable.', hint: 'One condition per line. Each must be something a second person could check on the chart.' },
  { id: 'entry', n: 5, label: 'Entry Condition', must: 'The exact trigger and the order type.', hint: 'The price rule that triggers the trade, and whether it is a market, limit or stop order.' },
  { id: 'stop', n: 6, label: 'Stop Condition', must: 'Where the hypothesis is invalid, tied to a defined level.', hint: 'The stop is a rule tied to a level, for example 2 pips beyond the swing low of the setup.' },
  { id: 'target', n: 7, label: 'Target Condition', must: 'A fixed R, a structure or a time, tied to a defined level or R.', hint: 'For example a fixed 2R, or the previous day high.' },
  { id: 'sizing', n: 8, label: 'Position Sizing', must: 'The risk per trade and how the size is computed. Links to the Risk Plan.', hint: 'Say the risk comes from your Risk Plan and the size is computed from the stop distance.' },
  { id: 'management', n: 9, label: 'Trade Management', must: 'Every partial exit, stop move or trail has a rule.', hint: 'Each action written as if this then that. If you do nothing after entry, say so.' },
  { id: 'notrade', n: 10, label: 'No-Trade Conditions', must: 'At least three, each testable.', hint: 'One per line: news, spread, session, loss limits, missing data.' }
];

/** Words two people would read differently. A rule containing one is not yet a rule. */
export const VAGUE = ['strong', 'strongly', 'clear', 'clearly', 'good', 'nice', 'obvious', 'obviously', 'significant', 'significantly', 'decent', 'big', 'small', 'large', 'enough', 'feels', 'feel', 'looks', 'roughly', 'approximately', 'around', 'maybe', 'probably', 'usually', 'often', 'sometimes', 'nearby'];

const ZONES = /\b(new york|london|tokyo|sydney|frankfurt|utc|gmt|guyana|et|est|edt|cet|cest|jst|broker server time|server time)\b/i;
const TIMEFRAME = /\b(\d{1,2}\s?-?\s?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)|daily|weekly|d1|w1|m\d{1,2}|h\d{1,2})\b/gi;
const CLOCK = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(am|pm)\b/i;
const ORDER = /\b(limit|market order|stop order|stop-limit|buy stop|sell stop|buy limit|sell limit|market)\b/i;
const PRICE_RULE = /\d|\b(break|breaks|retest|retests|close|closes|above|below|touch|touches|reaches|crosses|sweeps|reclaims)\b/i;
const LEVEL = /\b(above|below|beyond|behind|swing|level|high|low|pips|atr|zone|structure)\b/i;
const TARGET = /\b\d+(\.\d+)?\s?r\b|\b(level|high|low|structure|hours?|minutes?|close of|end of)\b/i;

const lines = (s) => String(s || '').split(/\n|;/).map((x) => x.trim()).filter((x) => x.length >= 8);
const words = (s) => String(s || '').toLowerCase().match(/[a-z']+/g) || [];

/** The Completeness Check: one entry per component, ok when the writing meets the test in the table. */
export function checkStrategy(d) {
  const t = (k) => String(d[k] || '').trim();
  const tf = new Set((t('timeframe').match(TIMEFRAME) || []).map((x) => x.toLowerCase().replace(/\s|-/g, '')));
  const out = [];
  const add = (id, ok, text) => out.push({ id, ok: !!ok, text });
  add('market', t('market').length >= 20 && /\b(because|since|so that|due to|as it|as the|reason)\b/i.test(t('market')), 'Market: named, and a reason given (use the word because).');
  add('timeframe', tf.size >= 2, 'Timeframe: both the analysis and the execution timeframe are stated.');
  add('session', ZONES.test(t('session')) && CLOCK.test(t('session')), 'Trading Session: a time zone is named and a start and end time are given.');
  add('setup', lines(d.setup).length >= 2, 'Setup: at least two conditions, one per line.');
  add('entry', ORDER.test(t('entry')) && PRICE_RULE.test(t('entry')), 'Entry Condition: a price rule and an order type (market, limit or stop).');
  add('stop', /\bstop\b/i.test(t('stop')) && LEVEL.test(t('stop')) && t('stop').length >= 15, 'Stop Condition: a rule tied to a defined level.');
  add('target', TARGET.test(t('target')) && t('target').length >= 6, 'Target Condition: a fixed R, or a level or time.');
  add('sizing', /(risk plan|\d(\.\d+)?\s?%)/i.test(t('sizing')) && /\b(stop|distance|lots?|size)\b/i.test(t('sizing')), 'Position Sizing: the risk comes from your Risk Plan and the size from the stop distance.');
  add('management', t('management').length >= 12 && (/\b(if|when|once|after|no management|none|no changes)\b/i.test(t('management'))), 'Trade Management: every action written as a rule, or an honest "no management".');
  add('notrade', lines(d.notrade).length >= 3, 'No-Trade Conditions: at least three, one per line.');
  return out;
}

/** The vague words found in each component: [{ id, label, found: ['strong'] }]. */
export function vagueFlags(d) {
  const out = [];
  for (const f of STRATEGY_FIELDS) {
    const found = [...new Set(words(d[f.id]).filter((w) => VAGUE.includes(w)))];
    if (found.length) out.push({ id: f.id, label: f.label, found });
  }
  return out;
}

export function strategyReady(d) {
  return checkStrategy(d).every((c) => c.ok) && vagueFlags(d).length === 0;
}

/**
 * The Training Rule Pack: exercise rules for practising the builder, never presented as a recommendation and never tested.
 * It is here so a student who has no idea yet can still complete the lab; the student is told to change it.
 */
export const TRAINING_PACK = {
  market: 'EUR/USD, because its spread is among the lowest I can trade and its hours match the window I can watch.',
  timeframe: 'Analyse on the 1-hour chart. Execute on the 5-minute chart.',
  session: '08:00 to 11:00 New York time. Nothing outside it.',
  setup: 'The 1-hour close is above the previous day high.\nPrice returns to within 3 pips of that high inside the session.',
  entry: 'Buy limit at the previous day high, placed when price touches within 3 pips of it and both setup conditions are true.',
  stop: 'Stop 5 pips below the lowest low of the pullback.',
  target: 'A fixed 2R target.',
  sizing: 'Risk is the percent in my Risk Plan. Lots are computed from the stop distance and rounded down.',
  management: 'If price reaches 1R, move the stop to breakeven. No other changes after entry.',
  notrade: 'A high-impact release for USD or EUR within 30 minutes.\nSpread wider than 1.5 pips at the time of entry.\nI have already taken my maximum trades for the day.',
  hypothesis: ''
};
