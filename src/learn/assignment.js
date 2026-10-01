/**
 * Module M2, Practical Assessment Mode, and the Capstone. An assignment is a set of charts whose future is hidden. For each chart the
 * student answers the eleven questions of "Analyze This Market" (structure, swings, trending or ranging, invalidation, the setup call,
 * entry, stop, target, R, risk, and why there is no setup). The app grades what it can, exactly; the mentor reviews the rest.
 *
 * The charts are synthetic, and the Rule Pack is the Training Rule Pack from the Backtest Lab. The mentor may accept an alternative
 * answer on any chart. Every reference answer is an opinion of the detector, not the truth.
 */

import { BT, btSeries, scanSetups, levelAt, windows } from '../sim/backtest.js';
import { swings, structural, classify, lastOfType } from '../charts/detect.js';
import { makeRng } from './rng.js';
import { ruleStop, lotsFor, BALANCE, PIP_VALUE } from './planexercise.js';

export const CAPSTONE_COUNT = 12;
export const STRUCTURES = [['bullish', 'Bullish'], ['bearish', 'Bearish'], ['range', 'Range'], ['unclear', 'Unclear']];
export const REGIMES = [['trending', 'Trending'], ['ranging', 'Ranging'], ['transitioning', 'Transitioning']];

const r1 = (x) => Math.round(x * 10) / 10;

/** The charts of an assignment, the same every time for the same seed. The share of no-setup charts is hidden from the student. */
export function makeAssignment({ seed = 1, count = CAPSTONE_COUNT, noSetupShare = null } = {}) {
  const rng = makeRng(seed * 7919 + count);
  const share = noSetupShare === null ? 0.35 + rng.next() * 0.3 : noSetupShare;
  const want = Array.from({ length: count }, () => (rng.next() < share ? 'none' : 'setup'));
  // a genuine mix: never all one kind, and at least a quarter of each
  const floor = Math.max(1, Math.floor(count / 4));
  const need = (kind) => want.filter((k) => k === kind).length;
  for (const kind of ['setup', 'none']) {
    const other = kind === 'setup' ? 'none' : 'setup';
    let i = 0;
    while (need(kind) < floor && i < count) {
      if (want[i] === other && need(other) > floor) want[i] = kind;
      i += 1;
    }
  }
  const w = windows();
  return want.map((kind, k) => {
    const s = seed * 1009 + k * 131 + 17;
    const bars = btSeries(s);
    const evs = scanSetups(bars, w.is[0], w.is[1]);
    const valid = evs.filter((e) => e.status === 'valid');
    let cut;
    let ev = null;
    if (kind === 'setup' && valid.length) {
      ev = valid[Math.floor(rng.next() * valid.length)];
      cut = ev.bar;
    } else {
      const busy = (b) => evs.some((e) => e.status === 'valid' && b >= e.bar && b <= e.exitBar);
      const known = (b) => evs.some((e) => e.bar === b);
      cut = 70 + Math.floor(rng.next() * 160);
      while (cut < w.is[1] - 40 && (bars[cut].c > levelAt(bars, cut) || busy(cut) || busy(cut + 1) || known(cut))) cut += 1;
    }
    const candles = bars.slice(0, cut + 1).map((b) => [b.o, b.h, b.l, b.c]);
    const list = structural(swings(candles, 2, cut));
    const cls = classify(list);
    const hi = lastOfType(list, 'high');
    const lo = lastOfType(list, 'low');
    return { k, seed: s, bars, cut, ev, hasSetup: !!ev, showFrom: Math.max(0, cut - 59), ref: { structure: cls.structure, high: hi ? hi.i : null, low: lo ? lo.i : null, regime: cls.structure === 'range' ? 'ranging' : cls.structure === 'unclear' ? 'transitioning' : 'trending' } };
  });
}

const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/**
 * Grade one chart. ans: { structure, high, low (bar numbers, from 1), regime, regimeNote, invalid, call: 'setup'|'none',
 *   orderType, entry, stop, target, r, pips, lots, money, pct, why }.
 * Each component is { id, label, score: 0..1 | null, note, group: 'analysis' | 'arithmetic' | 'writing' }. null = not applicable.
 */
export function gradeChart(item, ans = {}, { capPct = 1 } = {}) {
  const comps = [];
  const add = (id, label, score, note, group = 'analysis') => comps.push({ id, label, score, note, group });
  const close = item.bars[item.cut].c;
  add('q1', 'Structure', ans.structure === item.ref.structure ? 1 : 0, `Reference: ${item.ref.structure}.`);
  const hiOk = item.ref.high === null ? ans.high === undefined || !Number.isFinite(ans.high) : near(ans.high - 1, item.ref.high, 2);
  const loOk = item.ref.low === null ? ans.low === undefined || !Number.isFinite(ans.low) : near(ans.low - 1, item.ref.low, 2);
  add('q2', 'Latest Swing High And Low', (hiOk ? 0.5 : 0) + (loOk ? 0.5 : 0), `Reference: bars ${item.ref.high === null ? '—' : item.ref.high + 1} and ${item.ref.low === null ? '—' : item.ref.low + 1} (within 2 bars).`);
  const consistent = (ans.structure === 'range' && ans.regime === 'ranging') || ((ans.structure === 'bullish' || ans.structure === 'bearish') && ans.regime === 'trending') || (ans.structure === 'unclear' && ans.regime === 'transitioning');
  add('q3', 'Trending Or Ranging', consistent && typeof ans.regimeNote === 'string' && ans.regimeNote.trim().length >= 10 ? 1 : 0, 'Consistent with the structure you gave, with a sentence.');
  const truth = item.hasSetup ? 'setup' : 'none';
  add('q10', 'Is There A Setup?', ans.call === truth ? 1 : 0, `The rule says: ${item.hasSetup ? 'setup' : 'no setup'}.`);
  const isTrade = ans.call === 'setup';
  const rs = item.hasSetup ? ruleStop(item.bars, item.cut) : null;
  add('q4', 'Invalidation', item.hasSetup ? (near(ans.invalid, rs, 1) ? 1 : 0) : null, item.hasSetup ? `Reference: ${rs}.` : 'Reviewed by the mentor.');
  if (isTrade) {
    add('q5', 'Entry', ans.orderType === 'market' && near(ans.entry, close, 2) ? 1 : ans.orderType && near(ans.entry, close, 6) ? 0.5 : 0, 'The rule enters at the next open, at market.');
    const below = Number.isFinite(ans.stop) && ans.stop < ans.entry;
    add('q6', 'Stop', below ? (item.hasSetup && near(ans.stop, rs, 0.5) ? 1 : 0.5) : 0, item.hasSetup ? `Reference: ${rs}.` : 'A long stop belongs below the entry.');
    const okSide = Number.isFinite(ans.target) && ans.target > ans.entry;
    const rSelf = below && okSide ? (ans.target - ans.entry) / (ans.entry - ans.stop) : null;
    add('q7', 'Target', okSide ? (rSelf !== null && rSelf >= BT.rr - 0.05 ? 1 : 0.5) : 0, `The rule asks for at least ${BT.rr}R.`);
    add('q8', 'R From Your Own Prices', rSelf !== null && near(ans.r, rSelf, 0.05) ? 1 : 0, rSelf !== null ? `Your prices give ${rSelf.toFixed(2)}R.` : 'The stop and target must be on the right sides.', 'arithmetic');
    const dist = below ? r1(ans.entry - ans.stop) : null;
    const pipsOk = dist !== null && near(ans.pips, dist, 0.15);
    const wantLots = dist ? lotsFor(dist, capPct) : null;
    const lotsOk = wantLots !== null && near(ans.lots, wantLots, 0.005);
    const moneyOk = Number.isFinite(ans.lots) && dist !== null && near(ans.money, ans.lots * dist * PIP_VALUE, 0.5);
    const pctOk = Number.isFinite(ans.money) && near(ans.pct, (ans.money / BALANCE) * 100, 0.01);
    add('q9', 'Risk: Pips, Lots, Dollars, Percent', pipsOk && lotsOk && moneyOk && pctOk ? 1 : 0, dist !== null ? `Pips ${dist.toFixed(1)}; lots ${wantLots === null ? '—' : wantLots.toFixed(2)}; dollars ${(wantLots * dist * PIP_VALUE || 0).toFixed(2)}; percent ${(((wantLots * dist * PIP_VALUE) || 0) / BALANCE * 100).toFixed(2)}.` : 'The stop must be below the entry.', 'arithmetic');
  } else {
    add('q11', 'Why There Is No Setup', typeof ans.why === 'string' && ans.why.trim().length >= 30 ? null : 0, 'Written. The mentor reviews it against a rubric.', 'writing');
  }
  const analysis = comps.filter((c) => c.group === 'analysis' && c.score !== null);
  const arith = comps.filter((c) => c.group === 'arithmetic');
  return {
    comps,
    analysis: analysis.length ? analysis.reduce((a, c) => a + c.score, 0) / analysis.length : 0,
    arithErrors: arith.filter((c) => c.score === 0).length,
    callOk: ans.call === truth,
    truth
  };
}

/** Sensitivity, specificity and their mean over the answered charts, so "no trade, always" cannot pass. */
export function balancedAccuracy(results) {
  const setups = results.filter((r) => r.truth === 'setup');
  const nones = results.filter((r) => r.truth === 'none');
  const sens = setups.length ? setups.filter((r) => r.callOk).length / setups.length : null;
  const spec = nones.length ? nones.filter((r) => r.callOk).length / nones.length : null;
  const parts = [sens, spec].filter((x) => x !== null);
  return { sens, spec, balanced: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null };
}

/**
 * Capstone marking (an editable proposal): analysis at least 80% over the charts, balanced accuracy at least 75%, zero arithmetic
 * errors, and written reasoning marked Meets by the mentor on at least 10 of 12. review.reasoning = 'meets' | 'partly' | 'notyet'.
 * When the mentor accepts an alternative answer, `accepted` lists the component ids to count as right for that chart.
 */
export function capstoneMarks(items, answers, reviews = {}, { capPct = 1 } = {}) {
  const results = items.map((it, i) => {
    const r = gradeChart(it, answers[i] || {}, { capPct });
    const accepted = (reviews[i] && reviews[i].accepted) || [];
    for (const c of r.comps) if (accepted.includes(c.id) && c.score !== null) c.score = 1;
    const an = r.comps.filter((c) => c.group === 'analysis' && c.score !== null);
    r.analysis = an.length ? an.reduce((a, c) => a + c.score, 0) / an.length : 0;
    r.arithErrors = r.comps.filter((c) => c.group === 'arithmetic' && c.score === 0).length;
    return r;
  });
  const answered = items.filter((_, i) => answers[i]).length;
  const analysis = results.length ? results.reduce((a, r) => a + r.analysis, 0) / results.length : 0;
  const bal = balancedAccuracy(results);
  const arithErrors = results.reduce((a, r) => a + r.arithErrors, 0);
  const meets = items.filter((_, i) => reviews[i] && reviews[i].reasoning === 'meets').length;
  const need = Math.ceil((items.length * 10) / 12);
  const checks = [
    { id: 'answered', ok: answered === items.length, text: `All ${items.length} charts answered (${answered}).` },
    { id: 'analysis', ok: analysis >= 0.8, text: `Analysis components: ${Math.round(analysis * 100)}% (at least 80%).` },
    { id: 'balanced', ok: bal.balanced !== null && bal.balanced >= 0.75, text: `Balanced accuracy on setup against no-setup: ${bal.balanced === null ? '—' : Math.round(bal.balanced * 100) + '%'} (at least 75%).` },
    { id: 'arith', ok: arithErrors === 0, text: `Arithmetic errors in R and risk: ${arithErrors} (none allowed).` },
    { id: 'reasoning', ok: meets >= need, text: `Written reasoning marked Meets on ${meets} of ${items.length} (at least ${need}).` }
  ];
  return { results, analysis, balanced: bal, arithErrors, meets, need, checks, pass: checks.every((c) => c.ok) };
}
