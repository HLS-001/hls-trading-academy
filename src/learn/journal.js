/**
 * The journal: what a trade record holds, the accuracy audit run on every save, and the behavior flags read from the record
 * against the student's own Risk Plan. Pure functions. Flags are descriptions, not verdicts.
 */

import * as C from '../calc/index.js';
import { CONVENTIONAL_SET, sessionsOpenAt } from '../time/sessions.js';
import { instantFromWall, parseDate } from '../time/zones.js';

export const SOURCES = [
  { id: 'exercise', label: 'Exercise' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'replay', label: 'Replay' },
  { id: 'demo', label: 'Demo' },
  { id: 'live', label: 'Live' }
];
export const SESSION_IDS = ['tokyo', 'frankfurt', 'london', 'newyork'];
export const SESSION_LABEL = { tokyo: 'Asian', frankfurt: 'Frankfurt', london: 'London', newyork: 'New York', none: 'Between Sessions' };
export const MANAGEMENT = [
  { id: 'none', label: 'No Changes After Entry' },
  { id: 'partial', label: 'Took A Partial' },
  { id: 'stop-moved-be', label: 'Stop To Breakeven' },
  { id: 'stop-widened', label: 'Stop Widened' },
  { id: 'stop-removed', label: 'Stop Removed' },
  { id: 'early-exit', label: 'Exited Before Target' }
];

export const instantOf = (date, time) => {
  const { year, month, day } = parseDate(date);
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return instantFromWall('UTC', year, month, day, h || 0, m || 0);
};

/** The session a UTC entry time falls in, with the conventional hours and the daylight-saving rules of each market. Several may be open. */
export function sessionsAt(date, time) {
  const open = sessionsOpenAt(CONVENTIONAL_SET, instantOf(date, time)).map((w) => w.id);
  return open;
}
/** The session to suggest: the latest to open among those open, which is where activity is concentrated. */
export function suggestSession(date, time) {
  const open = sessionsAt(date, time);
  if (!open.length) return 'none';
  for (const id of ['newyork', 'london', 'frankfurt', 'tokyo']) if (open.includes(id)) return id;
  return 'none';
}

const REQUIRED = ['date', 'time', 'market', 'direction', 'session', 'setup', 'entry', 'stop', 'reason'];
const num = (x) => typeof x === 'number' && Number.isFinite(x);

/** R recomputed from the prices, or null when something is missing. */
export function rFromTrade(t) {
  if (!num(t.entry) || !num(t.stop) || !num(t.exit) || t.entry === t.stop) return null;
  return C.rFromPrices({ dir: t.direction === 'long' ? 1 : -1, entry: t.entry, stop: t.stop, exit: t.exit });
}

/**
 * The accuracy audit. Each check is { id, ok, text }, or null when it cannot be run yet (data missing).
 * Failures are notes to fix, not penalties for trading.
 */
export function auditTrade(t, { riskCap = 1, plan = null, sameDay = 1 } = {}) {
  const out = [];
  const add = (id, ok, text) => out.push({ id, ok, text });
  const rc = rFromTrade(t);
  if (rc === null) add('price-r', null, 'Price to R: enter the entry, stop and exit to check the result.');
  else if (!num(t.resultR)) add('price-r', false, `Price to R: the prices give ${rc.toFixed(2)}R. Record the result.`);
  else add('price-r', Math.abs(rc - t.resultR) <= 0.05, Math.abs(rc - t.resultR) <= 0.05 ? 'Price to R: the recorded result matches the prices.' : `Price to R: the prices give ${rc.toFixed(2)}R, but you recorded ${t.resultR}R.`);

  if (num(t.entry) && num(t.stop) && t.direction) {
    const long = t.direction === 'long';
    const sideOk = long ? t.stop < t.entry : t.stop > t.entry;
    const tgtOk = !num(t.target) || (long ? t.target > t.entry : t.target < t.entry);
    add('stop-side', sideOk && tgtOk, sideOk && tgtOk ? 'Stop side: the stop and target are on the correct sides.' : !sideOk ? `Stop side: a ${t.direction} needs its stop ${long ? 'below' : 'above'} the entry.` : `Stop side: the target of a ${t.direction} belongs ${long ? 'above' : 'below'} the entry.`);
  } else add('stop-side', null, 'Stop side: enter the direction, entry and stop to check.');

  if (num(t.lots) && num(t.riskMoney) && num(t.entry) && num(t.stop) && t.market) {
    let ok = false;
    let money = 0;
    try {
      money = C.stopDistancePips(t.market, t.entry, t.stop) * C.pipValueTrade(t.market, t.lots);
      ok = Math.abs(money - t.riskMoney) <= 0.05 * Math.max(1, money);
    } catch (e) {
      ok = false;
    }
    add('sizing', ok, ok ? 'Sizing: the lots, the stop distance and the money at risk agree.' : `Sizing: ${t.lots} lots with that stop risks about $${Math.round(money)}, not $${t.riskMoney}.`);
  } else add('sizing', null, 'Sizing: enter the lots and the money at risk to check them against the stop.');

  if (t.date && t.time && t.session) {
    const open = sessionsAt(t.date, t.time);
    const ok = t.session === 'none' ? open.length === 0 : open.includes(t.session);
    add('session', ok, ok ? 'Session tag: the entry time falls inside that session, with the clocks of the day.' : `Session tag: at ${t.time} UTC on that date, ${open.length ? open.map((x) => SESSION_LABEL[x]).join(' and ') + ' is open' : 'no session is open'}.`);
  } else add('session', null, 'Session tag: enter the date, time and session to check.');

  const missing = REQUIRED.filter((k) => t[k] === undefined || t[k] === '' || t[k] === null);
  if (typeof t.violations !== 'string' || !t.violations.trim()) missing.push('violations');
  if (typeof t.disconfirming !== 'string' || !t.disconfirming.trim()) missing.push('disconfirming');
  if ((t.source === 'demo' || t.source === 'live') && !t.screenshot) missing.push('screenshot');
  add('complete', missing.length === 0, missing.length ? `Completeness: missing ${missing.join(', ')}.` : 'Completeness: every required field is present.');

  const breaches = [];
  if (num(t.riskPct) && t.riskPct > riskCap + 1e-9) breaches.push(`risk ${t.riskPct}% is above your cap of ${riskCap}%`);
  if (plan && num(plan.maxTrades) && sameDay > plan.maxTrades) breaches.push(`trade ${sameDay} of the day is above your maximum of ${plan.maxTrades}`);
  add('violations', breaches.length === 0, breaches.length ? `Rule breaches to record: ${breaches.join('; ')}.` : 'Rule breaches: none that can be measured.');
  return out;
}

export const auditPassed = (audit) => audit.every((c) => c.ok !== false && c.ok !== null);

/** Journal accuracy: the share of the last 30 entries that pass every check. */
export function journalAccuracy(trades, ctxFor) {
  const last = [...trades].sort((a, b) => instantOf(a.date, a.time) - instantOf(b.date, b.time)).slice(-30);
  if (!last.length) return { n: 0, pass: 0, share: null };
  const pass = last.filter((t) => auditPassed(auditTrade(t, ctxFor ? ctxFor(t) : {}))).length;
  return { n: last.length, pass, share: pass / last.length };
}

const minutes = (date, time) => instantOf(date, time) / 60000;
const held = (t) => (t.exitTime && t.date ? Math.max(0, minutes(t.exitDate || t.date, t.exitTime) - minutes(t.date, t.time)) : null);
const plannedR = (t) => (num(t.target) && num(t.entry) && num(t.stop) && t.entry !== t.stop ? Math.abs(t.target - t.entry) / Math.abs(t.entry - t.stop) : null);

export const FLAGS = {
  chased: 'Chased Entry',
  'fast-reentry': 'Fast Re-Entry After Loss',
  'risk-raised': 'Risk Raised After Loss',
  overtrading: 'Overtrading',
  'stop-widened': 'Stop Widened',
  'cut-winner': 'Cut Winner',
  'held-loser': 'Held Loser',
  'size-after-streak': 'Size After Streak',
  'no-counter': 'No Counter-Argument'
};

/**
 * Behavior flags for each trade, in time order. The thresholds come from the student's Risk Plan where it has them.
 * Returns a Map from trade id to a list of flag ids, plus the average time in winners and in losers.
 */
export function behaviorFlags(trades, plan = {}, { chasePips = 5 } = {}) {
  const ordered = [...trades].sort((a, b) => instantOf(a.date, a.time) - instantOf(b.date, b.time));
  const pause = num(plan.pauseMin) ? plan.pauseMin : 30;
  const flags = new Map();
  const perDay = new Map();
  let prev = null;
  let lossRun = 0;
  for (const t of ordered) {
    const f = [];
    const cnt = (perDay.get(t.date) || 0) + 1;
    perDay.set(t.date, cnt);
    if (t.plannedEntry === undefined || t.plannedEntry === null || !num(t.plannedEntry)) f.push('chased');
    else if (t.market) {
      try {
        if (C.stopDistancePips(t.market, t.entry, t.plannedEntry) > chasePips) f.push('chased');
      } catch (e) { /* unknown market: no flag */ }
    }
    if (prev && prev.resultR < -0.1) {
      const gap = minutes(t.date, t.time) - (prev.exitTime ? minutes(prev.exitDate || prev.date, prev.exitTime) : minutes(prev.date, prev.time));
      if (gap >= 0 && gap < pause) f.push('fast-reentry');
      if (num(t.riskPct) && num(prev.riskPct) && t.riskPct > prev.riskPct + 1e-9) f.push('risk-raised');
    }
    if ((num(plan.maxTrades) && cnt > plan.maxTrades) || /^none$/i.test(String(t.setup || '').trim())) f.push('overtrading');
    if ((t.management || []).includes('stop-widened')) f.push('stop-widened');
    const pr = plannedR(t);
    if (pr !== null && t.resultR > 0 && t.resultR < 0.6 * pr && (t.management || []).includes('early-exit')) f.push('cut-winner');
    if (t.resultR < -1.15 || (t.management || []).includes('stop-removed')) f.push('held-loser');
    if (lossRun >= 2 && prev && num(t.lots) && num(prev.lots) && t.lots > prev.lots + 1e-9) f.push('size-after-streak');
    if (typeof t.disconfirming !== 'string' || !t.disconfirming.trim()) f.push('no-counter');
    flags.set(t.id, f);
    lossRun = t.resultR < -0.1 ? lossRun + 1 : t.resultR > 0.1 ? 0 : lossRun;
    prev = t;
  }
  const hw = ordered.filter((t) => t.resultR > 0.1).map(held).filter((x) => x !== null);
  const hl = ordered.filter((t) => t.resultR < -0.1).map(held).filter((x) => x !== null);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { flags, heldWinners: avg(hw), heldLosers: avg(hl) };
}
