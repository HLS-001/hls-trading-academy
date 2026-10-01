/**
 * The Hidden-Future Plan Series (E24). A chart with its future hidden: decide whether the rule gives a setup, choose the stop and
 * target, work out the size, and submit. The PROCESS is graded first, from the plan and the rule. Only then is the future shown and
 * the plan simulated. Process and outcome are kept apart on purpose: six outcomes say almost nothing.
 */

import { BT, btSeries, scanSetups, levelAt, simulateEntry, windows } from '../sim/backtest.js';

export const PLAN_SEEDS = [2, 13, 26, 39, 25, 4];
export const PLAN_TYPES = ['setup', 'none', 'setup', 'none', 'setup', 'none'];
export const BALANCE = 10000;
export const PIP_VALUE = 10;

export const NO_SETUP_REASONS = [
  ['not-breakout', 'The last bar did not close above the highest high of the 4 bars before it'],
  ['spread', 'The spread is too wide'],
  ['busy', 'A trade is already open'],
  ['small-stop', 'The stop would be under 4 pips']
];

const r1 = (x) => Math.round(x * 10) / 10;

/** The six plans. Each has the bars, the last visible bar `cut`, and the evaluator's truth about it. */
export function planItems() {
  const w = windows();
  return PLAN_SEEDS.map((seed, k) => {
    const bars = btSeries(seed);
    const evs = scanSetups(bars, w.is[0], w.is[1]);
    const valid = evs.filter((e) => e.status === 'valid');
    let cut;
    let ev = null;
    if (PLAN_TYPES[k] === 'setup') {
      ev = valid[Math.min(valid.length - 1, 1 + Math.floor(k / 2))];
      cut = ev.bar;
    } else {
      const busy = (b) => evs.some((e) => e.status === 'valid' && b >= e.bar && b <= e.exitBar);
      const other = (b) => evs.some((e) => e.bar === b);
      cut = 70 + k * 23;
      while (cut < w.is[1] - 40 && (bars[cut].c > levelAt(bars, cut) || busy(cut) || other(cut) || busy(cut + 1))) cut += 1;
    }
    return { k, seed, bars, cut, ev, hasSetup: !!ev, showFrom: Math.max(0, cut - 59) };
  });
}

export const ruleStop = (bars, cut) => {
  let low = Infinity;
  for (let i = cut - BT.stopLook + 1; i <= cut; i++) low = Math.min(low, bars[i].l);
  return r1(low - BT.stopBuffer);
};

/** The position size for the risk cap, rounded DOWN to 0.01 lot, from a distance in pips. */
export function lotsFor(distPips, capPct = 1, balance = BALANCE) {
  if (!(distPips > 0)) return null;
  return Math.floor(((balance * capPct) / 100 / (distPips * PIP_VALUE)) * 100 + 1e-9) / 100;
}

/**
 * Grade the process before the outcome. plan: { call: 'setup' | 'none', stop, rr, distPips, lots, reason }.
 * Returns { comps: [{ id, label, got, max, note }], pct }.
 */
export function gradePlan(item, plan, { capPct = 1 } = {}) {
  const comps = [];
  const add = (id, label, got, max, note) => comps.push({ id, label, got, max, note });
  const truth = item.hasSetup ? 'setup' : 'none';
  const callOk = plan.call === truth;
  add('call', 'Setup Call', callOk ? 30 : 0, 30, callOk ? 'The rule and your call agree.' : item.hasSetup ? 'The last bar closed above the highest high of the 4 bars before it. The rule gives a setup.' : 'The last bar did not close above the highest high of the 4 bars before it. The rule gives no setup.');
  const tags = [];
  if (!item.hasSetup) {
    const right = plan.call === 'none' && plan.reason === 'not-breakout';
    add('reason', 'Why There Is No Setup', right ? 70 : 0, 70, right ? 'Stated correctly.' : plan.call === 'none' ? 'The reason given is not the one that applies here.' : 'No reason to state: a trade was planned where the rule gives none.');
  } else if (plan.call !== 'setup') {
    add('rest', 'Stop, Target And Size', 0, 70, 'The plan has no stop, target or size, because it says there is no setup.');
  } else {
    const close = item.bars[item.cut].c;
    const rs = ruleStop(item.bars, item.cut);
    const below = Number.isFinite(plan.stop) && plan.stop < close;
    const stopOk = below && Math.abs(plan.stop - rs) <= 0.5;
    add('stop', 'Stop Logic', stopOk ? 25 : below ? 10 : 0, 25, stopOk ? 'At the rule\'s level: one pip below the lowest low of the last 3 bars.' : below ? 'On the correct side, but not at the rule\'s level.' : 'A long stop must be below the price.');
    add('target', 'Target Logic', plan.rr === BT.rr ? 10 : 0, 10, plan.rr === BT.rr ? 'A fixed 2R, as the rule says.' : 'The rule says a fixed 2R.');
    const dist = Number.isFinite(plan.stop) ? close - plan.stop : null;
    const distOk = Number.isFinite(plan.distPips) && dist !== null && Math.abs(plan.distPips - dist) <= 0.15;
    add('pips', 'Stop Distance In Pips', distOk ? 10 : 0, 10, distOk ? 'Correct, measured from the last close.' : `Measured from the last close, the stop is ${dist === null ? '—' : dist.toFixed(1)} pips away.`);
    const want = dist > 0 ? lotsFor(dist, capPct) : null;
    const lotsOk = want !== null && Number.isFinite(plan.lots) && Math.abs(plan.lots - want) <= 0.005;
    if (!lotsOk && want !== null && Number.isFinite(plan.lots) && plan.lots > want) tags.push('lots-rounded-up');
    add('lots', 'Position Size', lotsOk ? 20 : 0, 20, lotsOk ? 'Correct, rounded down.' : `For ${capPct}% of $${BALANCE.toLocaleString('en-US')} at ${dist === null ? '—' : dist.toFixed(1)} pips the size is ${want === null ? '—' : want.toFixed(2)} lots.`);
    const money = Number.isFinite(plan.lots) && dist !== null ? plan.lots * dist * PIP_VALUE : null;
    const capOk = money !== null && money <= (BALANCE * capPct) / 100 + 0.5;
    add('cap', 'Risk Cap', capOk ? 5 : 0, 5, capOk ? `About $${Math.round(money)} at risk, within your cap.` : 'The money at risk is above your cap.');
  }
  const got = comps.reduce((a, c) => a + c.got, 0);
  const max = comps.reduce((a, c) => a + c.max, 0);
  return { comps, got, max, pct: Math.round((got / max) * 100), tags };
}

/** The outcome, after the process is locked: simulate the student's plan from the entry bar, and what the rule's trade would have done. */
export function outcomeOf(item, plan) {
  const to = windows().is[1];
  const eb = item.cut + 1;
  const mine = plan.call === 'setup' && Number.isFinite(plan.stop) ? simulateEntry(item.bars, eb, { stop: plan.stop, rr: plan.rr || BT.rr }, to) : null;
  const rule = item.ev ? { r: item.ev.r, how: item.ev.how, exitBar: item.ev.exitBar, entry: item.ev.entry, stop: item.ev.stop, target: item.ev.target } : null;
  const shownTo = Math.min(to, Math.max(mine && mine.filled ? mine.exitBar : eb, rule ? rule.exitBar : eb) + 4);
  return { mine, rule, shownTo };
}
