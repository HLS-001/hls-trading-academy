/**
 * Track P worksheets, as data and pure checks: the Platform Task Checklist (E36), the Broker Worksheet (E35) and the Path-To-Live
 * Plan. No broker is named or recommended anywhere: the worksheets are blank and the student fills them from sources they check.
 * The checks look at the WRITING and the arithmetic. Whether the student really did a task on their own demo is verified by the
 * mentor, in person, before the checklist is approved.
 */

import { VAGUE } from './strategy.js';

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const txt = (x, n = 3) => typeof x === 'string' && x.trim().length >= n;

/* ------------------------------------------------------------------ Platform Task Checklist (E36) */

export const PLATFORM_TASKS = [
  { id: 'tv-zone', lesson: 'P.02', label: 'Set The Charting Time Zone', must: 'Set the time zone on your charting platform to the one you chose in Level 0, then read the time of the latest candle.', fields: [['zone', 'Time Zone You Set', 'text'], ['clock', 'Time Of The Latest Candle', 'text']] },
  { id: 'server-time', lesson: 'P.03', label: 'Find The Server Time', must: 'On your trading platform, find the server time, compare it with UTC, and write the difference in hours.', fields: [['offset', 'Server Time Minus UTC, In Hours', 'number'], ['how', 'How You Found It', 'text']] },
  { id: 'demo-open', lesson: 'P.05', label: 'Open A Demo Account', must: 'Open a demo account and record what it shows.', fields: [['platform', 'Platform And Version', 'text'], ['currency', 'Account Currency', 'text'], ['leverage', 'Leverage Setting (The Number After 1:)', 'number'], ['balance', 'Starting Balance', 'number']] },
  { id: 'symbol-spec', lesson: 'P.04', label: 'Read A Symbol Specification', must: 'Open the specification of one symbol and copy what it says.', fields: [['symbol', 'Symbol', 'text'], ['contract', 'Contract Size', 'number'], ['minLot', 'Smallest Lot', 'number'], ['lotStep', 'Lot Step', 'number'], ['spread', 'Spread Now, In Pips', 'number']] },
  { id: 'ticket', lesson: 'P.06', label: 'Place A Trade With A Stop And A Target', must: 'Place one demo trade with a stop and a target attached, then write down the ticket. The app recomputes your planned R from the prices.', fields: [['dir', 'Direction (Long Or Short)', 'text'], ['entry', 'Entry Price', 'number'], ['stop', 'Stop-Loss Price', 'number'], ['target', 'Take-Profit Price', 'number'], ['lots', 'Lots', 'number'], ['plannedR', 'Planned Reward To Risk (R), Worked Out By You', 'number']] },
  { id: 'modify', lesson: 'P.06', label: 'Modify The Trade', must: 'Move the stop to reduce risk, and say what you changed and why.', fields: [['note', 'What You Changed And Why', 'text']] },
  { id: 'partial', lesson: 'P.06', label: 'Close Part Of The Trade', must: 'Close part of the position and record how much was closed and at what price.', fields: [['closed', 'Lots Closed', 'number'], ['price', 'Closing Price', 'number']] },
  { id: 'account', lesson: 'P.07', label: 'Read The Account Panel', must: 'While the trade is open, copy the account panel. The app checks that equity is balance plus floating profit or loss, and free margin is equity minus margin.', fields: [['balance', 'Balance', 'number'], ['floating', 'Floating Profit Or Loss', 'number'], ['equity', 'Equity', 'number'], ['margin', 'Margin Used', 'number'], ['free', 'Free Margin', 'number']] },
  { id: 'export', lesson: 'P.08', label: 'Export The Trade History', must: 'Export the account history and say what you exported.', fields: [['format', 'File Type And Name', 'text'], ['count', 'Number Of Trades In It', 'number']] }
];

/** Check one task: { ok, issues: [text] }. */
export function checkTask(task, d = {}) {
  const issues = [];
  for (const [id, label, type] of task.fields) {
    const v = d[id];
    if (type === 'number' ? !num(v) : !txt(v, 2)) issues.push(`${label} is empty.`);
  }
  if (issues.length) return { ok: false, issues };
  if (task.id === 'ticket') {
    const dir = /^l/i.test(d.dir) ? 1 : /^s/i.test(d.dir) ? -1 : 0;
    if (!dir) issues.push('Direction must say long or short.');
    else {
      const risk = dir * (d.entry - d.stop);
      const reward = dir * (d.target - d.entry);
      if (!(risk > 0)) issues.push(`A ${dir > 0 ? 'long' : 'short'} needs its stop ${dir > 0 ? 'below' : 'above'} the entry.`);
      else if (!(reward > 0)) issues.push(`A ${dir > 0 ? 'long' : 'short'} needs its target ${dir > 0 ? 'above' : 'below'} the entry.`);
      else if (Math.abs(reward / risk - d.plannedR) > 0.05) issues.push(`The prices give ${(reward / risk).toFixed(2)}R, not ${d.plannedR}R.`);
    }
  }
  if (task.id === 'account') {
    if (Math.abs(d.balance + d.floating - d.equity) > 0.5) issues.push(`Balance plus floating is ${(d.balance + d.floating).toFixed(2)}, not ${d.equity}.`);
    if (Math.abs(d.equity - d.margin - d.free) > 0.5) issues.push(`Equity minus margin is ${(d.equity - d.margin).toFixed(2)}, not ${d.free}.`);
  }
  if (task.id === 'partial' && !(d.closed > 0)) issues.push('Lots closed must be more than zero.');
  if (task.id === 'symbol-spec' && !(d.minLot > 0 && d.lotStep > 0 && d.contract > 0)) issues.push('The contract size, smallest lot and lot step must each be more than zero.');
  return { ok: issues.length === 0, issues };
}

export function checkPlatforms(data = {}) {
  const tasks = data.tasks || {};
  return PLATFORM_TASKS.map((t) => ({ id: t.id, label: t.label, ...checkTask(t, tasks[t.id]) }));
}
export const platformsReady = (data) => checkPlatforms(data).every((c) => c.ok);

/* ------------------------------------------------------------------ Broker Worksheet (E35) */

export const BROKER_CRITERIA = [
  ['regulation', 'Regulation', 'Who regulates the firm, the exact legal name and the license number on the regulator\'s OWN register.'],
  ['spread', 'Spread On The Pairs I Trade', 'Measured on a demo at the hours I trade, not quoted on a web page.'],
  ['commission', 'Commission', 'Per lot, per side, and how it is charged.'],
  ['swap', 'Swap', 'The overnight charge or credit on the pairs I trade.'],
  ['execution', 'Execution And Slippage', 'Fill speed and slippage measured on a demo.'],
  ['liquidity', 'Liquidity', 'Depth in the hours I trade, and what happens around news.'],
  ['funds', 'Deposits And Withdrawals', 'Methods, fees, limits and the time a withdrawal takes.'],
  ['restrictions', 'Restrictions', 'Limits on styles, news trading, leverage, or inactivity fees.']
];

/** A cell is complete when it has a value, a source and a status. Unverified is a valid status. */
export const cellOk = (c) => !!c && txt(c.value, 2) && txt(c.source, 3) && (c.status === 'verified' || c.status === 'unverified');

export function checkBroker(data = {}) {
  const brokers = data.brokers || ['', ''];
  const cells = data.cells || {};
  const checks = [];
  checks.push({ id: 'names', ok: txt(brokers[0], 2) && txt(brokers[1], 2) && brokers[0].trim().toLowerCase() !== brokers[1].trim().toLowerCase(), text: 'Two different providers are named, by you.' });
  let filled = 0;
  let total = 0;
  for (const [cid] of BROKER_CRITERIA) for (const b of [0, 1]) {
    total += 1;
    if (cellOk((cells[cid] || [])[b])) filled += 1;
  }
  checks.push({ id: 'cells', ok: filled === total, text: `Every cell has a value, a source and a status (${filled} of ${total}).` });
  const verified = BROKER_CRITERIA.flatMap(([cid]) => [0, 1].map((b) => (cells[cid] || [])[b])).filter((c) => c && c.status === 'verified' && txt(c.source, 6));
  checks.push({ id: 'verify', ok: filled === total && verified.length >= 1, text: 'At least one cell is verified, with a source you can point to. Unverified cells are fine, and honest.' });
  return { checks, done: checks.every((c) => c.ok) };
}

/* ------------------------------------------------------------------ Path-To-Live Plan */

export const PATH_FIELDS = [
  { id: 'readiness', label: 'My Readiness Criteria', hint: 'What must be true, in numbers and completed steps, before any live trade. For example, how many forward-test trades on a demo and what the interval must show.' },
  { id: 'capital', label: 'The Capital Rule', hint: 'Only money you can lose completely without changing how you live. Say how you decide the amount, and write the amount.' },
  { id: 'liveRules', label: 'Small Live Testing Rules', hint: 'Size, the loss that stops the test, and how long it runs.' },
  { id: 'goBack', label: 'When I Go Back To Demo', hint: 'The exact conditions that send you back down the ladder.' },
  { id: 'scaling', label: 'Scaling Comes Last', hint: 'What evidence, after small live, must exist before size ever rises, and by how much.' }
];

export function checkPath(d = {}) {
  const checks = [];
  const add = (id, ok, text) => checks.push({ id, ok: !!ok, text });
  for (const f of PATH_FIELDS) add(f.id, txt(d[f.id], 50), `${f.label}: written in at least a couple of sentences.`);
  add('numbers', /\d/.test(d.readiness || '') && /\d/.test(d.liveRules || ''), 'The readiness criteria and the live rules contain numbers, not feelings.');
  const words = (s) => String(s || '').toLowerCase().match(/[a-z']+/g) || [];
  const vague = [...new Set(PATH_FIELDS.flatMap((f) => words(d[f.id]).filter((w) => VAGUE.includes(w) && !['small', 'large', 'big'].includes(w))))];
  add('vague', vague.length === 0, vague.length ? `Replace these words with numbers or rules: ${vague.join(', ')}.` : 'No vague words found.');
  add('order', /\b(after|only when|only after|once|until)\b/i.test(d.scaling || ''), 'The scaling rule says what must happen first.');
  add('ladder', d.ack === true, 'I understand that finishing this course is not a profitable strategy, and that no funded account or large capital is part of this plan.');
  return checks;
}
export const pathReady = (d) => checkPath(d).every((c) => c.ok);
