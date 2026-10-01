/**
 * The Backtest Lab's protocol checks. A run is a record of what the student did and when (derived from events, see core/derive.js).
 * Each check is about HOW the test was run, not about the result: the lab is graded on honesty, not on whether the rule paid.
 */

import { BT, btSeries, scanSetups, windows } from '../sim/backtest.js';
import { bootstrapInterval, calibrated } from './stats.js';

export const RUN_SEEDS = [2, 13, 26, 39, 25];
export const MIN_IS = 8;
export const MIN_OOS = 5;
export const R_TOLERANCE = 0.05;

export const partOf = (bar) => (bar <= windows().is[1] ? 'is' : 'oos');

/** The events the evaluator finds in each window under the run's declared costs. */
export function runEvents(run) {
  const bars = btSeries(run.seed);
  const w = windows();
  const slip = run.split && typeof run.split.slip === 'number' ? run.split.slip : 0;
  return { bars, is: scanSetups(bars, w.is[0], w.is[1], { slip }), oos: scanSetups(bars, w.oos[0], w.oos[1], { slip }) };
}

/** Compare a part of the log with the evaluator's events. flags: what the student did that the rule does not allow or missed. */
export function auditPart(log, events) {
  const flags = [];
  const byBar = new Map(log.map((l) => [l.bar, l]));
  let matched = 0;
  let rCorrect = 0;
  let rTotal = 0;
  for (const e of events) {
    const l = byBar.get(e.bar);
    if (!l) {
      flags.push({ type: 'silent-skip', bar: e.bar, text: `A setup at bar ${e.bar + 1} was neither logged nor skipped with a reason.` });
      continue;
    }
    if (e.status === 'valid') {
      if (l.kind !== 'trade') flags.push({ type: 'wrong-skip', bar: e.bar, text: `A valid setup at bar ${e.bar + 1} was skipped.` });
      else {
        matched += 1;
        rTotal += 1;
        if (typeof l.recordedR === 'number' && Math.abs(l.recordedR - e.r) <= R_TOLERANCE) rCorrect += 1;
      }
    } else if (l.kind === 'trade') flags.push({ type: 'wrong-trade', bar: e.bar, text: `The rule says no trade at bar ${e.bar + 1} (${e.status === 'skip-spread' ? 'spread above 2.0 pips' : 'stop under 4 pips'}), but it was logged as a trade.` });
    else if ((e.status === 'skip-spread' && l.reason !== 'spread') || (e.status === 'skip-stop' && l.reason !== 'stop')) flags.push({ type: 'wrong-reason', bar: e.bar, text: `The skip at bar ${e.bar + 1} gave the wrong reason.` });
    else matched += 1;
  }
  const known = new Set(events.map((e) => e.bar));
  for (const l of log) if (!known.has(l.bar)) flags.push({ type: 'not-a-setup', bar: l.bar, text: `Bar ${l.bar + 1} is not a setup under the rule (or a trade was already open).` });
  return { flags, matched, rCorrect, rTotal };
}

/** Recorded R of the logged trades in a part, for the statistics. */
export const recordedR = (log) => log.filter((l) => l.kind === 'trade' && typeof l.recordedR === 'number').map((l) => l.recordedR);

/** The interval the final conclusion must state: on the out-of-sample trades the student logged. */
export function finalInterval(run) {
  const rs = recordedR((run.log || []).filter((l) => partOf(l.bar) === 'oos'));
  return { rs, ...bootstrapInterval(rs, { seed: 11, resamples: 4000 }) };
}

/** The protocol checks: [{ id, ok, text, detail }]. */
export function protocolChecks(run) {
  const log = run.log || [];
  const first = log.length ? log[0].t : null;
  const h = run.hypothesis;
  const evs = runEvents(run);
  const isLog = log.filter((l) => partOf(l.bar) === 'is');
  const oosLog = log.filter((l) => partOf(l.bar) === 'oos');
  const a = auditPart(isLog, evs.is);
  const b = auditPart(oosLog, evs.oos);
  const checks = [];
  const add = (id, ok, text, detail = '') => checks.push({ id, ok: !!ok, text, detail });
  const hypoFull = h && Number.isFinite(h.winLo) && Number.isFinite(h.winHi) && Number.isFinite(h.expR) && h.minSample >= 1 && typeof h.fail === 'string' && h.fail.trim().length >= 10;
  add('prereg', hypoFull && (first === null || h.t < first), 'The hypothesis was written and time-stamped before the first trade was logged.', hypoFull ? '' : 'The hypothesis is missing a number or the failure condition.');
  add('split', !!(run.split && run.split.t && (first === null || run.split.t < first) && run.split.t >= (h ? h.t : Infinity)), 'The data window and the in-sample and out-of-sample split were fixed before any trade was logged.');
  add('oos-locked', !!run.concludeIS && oosLog.every((l) => l.t > run.concludeIS.t), 'No out-of-sample trade was logged before the in-sample conclusion was locked.');
  let chrono = true;
  for (let i = 1; i < log.length; i++) if (log[i].bar < log[i - 1].bar) chrono = false;
  add('chrono', chrono, 'Trades were logged in time order through the window.');
  add('nolook', log.every((l) => l.cur >= l.bar), 'Every entry was logged after its setup bar had closed (no look-ahead).');
  add('skips', a.flags.length + b.flags.length === 0 && isLog.length > 0 && oosLog.length > 0, 'Every valid setup was logged, and every skip has a correct reason. Nothing was missed or added.', [...a.flags, ...b.flags].map((f) => f.text).slice(0, 3).join(' '));
  const total = a.rTotal + b.rTotal;
  const correct = a.rCorrect + b.rCorrect;
  add('accuracy', total > 0 && correct / total >= 0.95, `Journal accuracy: the recorded R matches R recomputed from the prices on at least 95% of entries (${correct} of ${total}).`);
  add('costs', !!run.split && typeof run.split.slip === 'number', 'Costs were declared and applied: the spread and your slippage.');
  add('counts', a.rTotal >= MIN_IS && b.rTotal >= MIN_OOS, `The lab minimum was reached: ${MIN_IS} trades in-sample and ${MIN_OOS} out-of-sample. These are far too few to establish an edge.`);
  let cal = { ok: false, why: 'No final conclusion yet.' };
  if (run.final) {
    const iv = finalInterval(run);
    const stated = Math.abs((run.final.lo ?? 99) - (iv.lo ?? -99)) < 0.01 && Math.abs((run.final.hi ?? 99) - (iv.hi ?? -99)) < 0.01;
    cal = calibrated(run.final.verdict, run.final);
    const zero = iv.includesZero === !!run.final.saysIncludesZero;
    cal = { ok: cal.ok && stated && zero && typeof run.final.text === 'string' && run.final.text.trim().length >= 80, why: cal.ok ? (stated && zero ? 'The conclusion needs at least a few sentences on what can and cannot be concluded.' : 'The stated interval or the zero statement does not match the data.') : cal.why };
  }
  add('calibrated', cal.ok, 'The final conclusion states the interval, says whether it includes zero, and claims no more than the interval allows.', cal.ok ? '' : cal.why);
  return { checks, done: checks.every((c) => c.ok), is: a, oos: b };
}

/** Where the run is: which step the lab should show. */
export function runStage(run) {
  if (!run || !run.hypothesis) return 'hypothesis';
  if (!run.split) return 'split';
  if (!run.concludeIS) return 'is';
  if (!run.final) return 'oos';
  return 'done';
}

export { BT };
