/**
 * The Backtest Lab. A full cycle on the Training Rule Pack: write the hypothesis, fix the window and the split, step through the
 * in-sample bars logging every valid setup, lock a conclusion, unlock the out-of-sample bars, run them once, and state a final
 * conclusion with its interval. The protocol checks say HOW it was done. The lab is graded on honesty, not on the result.
 * Synthetic bars with no edge. The Training Rule Pack is exercise text, not a recommendation.
 */

import { app, emit } from '../core/app.js';
import { h } from '../ui/dom.js';
import { button, chip } from '../ui/kit.js';
import { candlesSvg } from '../ui/minichart.js';
import { BT, BT_RULES, btSeries, levelAt, px, windows } from '../sim/backtest.js';
import { RUN_SEEDS, MIN_IS, MIN_OOS, protocolChecks, runEvents, runStage, partOf, finalInterval, recordedR } from '../learn/protocol.js';
import { tradeStats, bootstrapInterval } from '../learn/stats.js';

const R2 = (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'R');
const latestRun = () => {
  const runs = Object.values(app.state.backtests || {}).sort((a, b) => a.startedAt - b.startedAt);
  return runs[runs.length - 1] || null;
};
const field = (label, control, hint) => h('label', { class: 'jf' }, h('span', { class: 'jf-l' }, label), control, hint ? h('em', null, hint) : null);
const tin = (placeholder, inputmode = 'decimal') => h('input', { type: 'text', inputmode, class: 'jf-in', placeholder });

export function backtestlab({ onInteract, standalone = false } = {}) {
  const host = h('div', { class: 'lab backtestlab' });
  let cur = null;
  let donePaid = false;

  const current = () => latestRun();
  const newRun = () => {
    const n = Object.keys(app.state.backtests || {}).length;
    const id = 'bt' + (n + 1);
    emit('backtest.start', { runId: id, seed: RUN_SEEDS[n % RUN_SEEDS.length] });
    return id;
  };

  const rulesCard = () => h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Training Rule Pack'), h('p', { class: 'hint-line' }, 'Exercise rules for practising the protocol. Not a recommendation. The data is synthetic and has no edge in it.'), h('ul', { class: 'lab-list' }, ...BT_RULES.map((r) => h('li', null, r))));

  /* ---- stage 1: the hypothesis */
  const hypothesisStage = () => {
    const lo = tin('35');
    const hi = tin('50');
    const er = tin('0.2');
    const ms = tin('10', 'numeric');
    const fail = h('textarea', { class: 'written', rows: 3, 'aria-label': 'Failure condition', placeholder: 'For example: an average R at or below zero, or a win rate below 30%.' });
    const go = button('Write And Time-Stamp The Hypothesis', { onClick: () => {
      const hyp = { winLo: parseFloat(lo.value), winHi: parseFloat(hi.value), expR: parseFloat(er.value), minSample: parseInt(ms.value, 10), fail: fail.value.trim() };
      if (![hyp.winLo, hyp.winHi, hyp.expR, hyp.minSample].every(Number.isFinite) || hyp.fail.length < 10) return msg.textContent = 'Fill in every number and describe what would count as failure.';
      const id = current() && !current().hypothesis ? current().id : newRun();
      emit('backtest.hypothesis', { runId: id, hypothesis: hyp });
      draw();
    } });
    const msg = h('p', { class: 'hint-line', role: 'alert' });
    host.__hyp = (o) => { lo.value = o.winLo; hi.value = o.winHi; er.value = o.expR; ms.value = o.minSample; fail.value = o.fail; go.click(); };
    return [h('p', { class: 'lab-intro' }, 'Step 1 of 6. Before you look at any bar, write what you expect and what would count as failure. The time is recorded.'), rulesCard(),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Your Hypothesis'), field('Win Rate Expected, Lowest (%)', lo), field('Win Rate Expected, Highest (%)', hi), field('Expected Average R', er), field('Smallest Sample You Will Accept (Trades)', ms), field('What Result Would Count As Failure', fail), msg), h('div', { class: 'qactions' }, go)];
  };

  /* ---- stage 2: the window and split */
  const splitStage = (run) => {
    let slip = 0.5;
    const w = windows();
    const go = button('Lock The Window, The Split And The Costs', { onClick: () => { emit('backtest.split', { runId: run.id, slip }); draw(); } });
    host.__split = (s) => { slip = s; go.click(); };
    return [h('p', { class: 'lab-intro' }, 'Step 2 of 6. Fix the data window and the split before any trade is logged. The out-of-sample bars stay locked until you have written and locked your in-sample conclusion.'),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Window'), h('p', null, `Bars 1 to ${w.is[1] + 1} are in-sample. Bars ${w.oos[0] + 1} to ${w.oos[1] + 1} are out-of-sample, and locked.`), h('p', { class: 'hint-line' }, `Quotes: the spread is part of every entry. Stop and target in one candle: the stop is taken first. The lab minimum is ${MIN_IS} trades in-sample and ${MIN_OOS} out-of-sample. That is far too few to establish an edge, and the lab says so openly.`)),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Slippage On Each Entry'), h('div', { class: 'choices wrap' }, ...[[0, 'None'], [0.5, '0.5 Pip'], [1, '1 Pip']].map(([v, l]) => h('button', { type: 'button', class: 'opt small' + (v === slip ? ' sel' : ''), 'data-v': String(v), onclick: (e) => { slip = v; e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, l)))),
      h('div', { class: 'qactions' }, go)];
  };

  /* ---- stages 3 and 5: stepping and logging */
  const stepStage = (run, part) => {
    const bars = btSeries(run.seed);
    const w = windows();
    const [from, to] = part === 'is' ? w.is : w.oos;
    const evs = runEvents(run)[part];
    const partLog = () => run.log.filter((l) => partOf(l.bar) === part);
    if (cur === null || cur - 1 < from || cur - 1 > to) cur = Math.max(from + BT.look + 2, ...partLog().map((l) => l.cur));
    const chartHost = h('div');
    const candHost = h('div', { class: 'card' });
    const logHost = h('div', { class: 'card' });
    const checkHost = h('div', { class: 'card rp-checks' });
    const stepHost = h('div', { class: 'stepbar' });

    const logged = (bar) => partLog().find((l) => l.bar === bar);
    const evOf = (bar) => evs.find((e) => e.bar === bar);
    const doLog = (kind, reason) => {
      const bar = cur - 2;
      if (logged(bar)) return;
      emit('backtest.log', { runId: run.id, bar, kind, reason: reason || null, cur });
      draw();
    };
    const step = (n) => { cur = Math.min(to + 1, cur + n); redraw(); };
    const nextCand = () => { for (let c = cur + 1; c <= to + 1; c++) if (c - 2 >= BT.look && bars[c - 2].c > levelAt(bars, c - 2)) { cur = Math.min(c, to + 1); return redraw(); } cur = to + 1; redraw(); };

    const redraw = () => {
      const v = cur - 1;
      const sb = cur - 2;
      const lines = sb >= 0 ? [{ y: levelAt(bars, sb), label: 'Level', color: '#FFC83D' }] : [];
      const marks = partLog().map((l) => ({ i: l.bar, label: l.kind === 'trade' ? 'T' : 'S', color: l.kind === 'trade' ? '#2DD4BF' : '#A78BFA' }));
      const shade = [];
      for (const l of partLog()) {
        const e = evOf(l.bar);
        if (l.kind === 'trade' && e && e.status === 'valid' && v > e.entryBar - 1) shade.push({ from: e.entryBar, to: Math.min(e.exitBar, v) });
      }
      chartHost.replaceChildren(candlesSvg({ bars, from: Math.max(from, v - 59), upto: v, lines, marks, shade, fmt: (x) => px(x), label: 'Synthetic price bars up to the current bar' }));
      const setup = sb >= from && sb >= BT.look && bars[sb].c > levelAt(bars, sb);
      const already = logged(sb);
      candHost.replaceChildren(...[h('div', { class: 'card-title' }, `Bar ${cur} Of ${to + 1}`),
        h('p', null, setup ? `Bar ${sb + 1} closed at ${px(bars[sb].c)}, above the highest high of the 4 bars before it (${px(levelAt(bars, sb))}). This bar, ${cur}, is the entry bar: it opened at ${px(bars[v].o)} with a spread of ${bars[v].spread.toFixed(1)} pips.` : `Bar ${sb + 1} did not close above the highest high of the 4 bars before it, so it is not a setup.`),
        setup && !already ? h('div', { class: 'stepbar' }, button('Log Trade', { onClick: () => doLog('trade') }), button('Skip: Spread', { variant: 'ghost', onClick: () => doLog('skip', 'spread') }), button('Skip: Stop Too Small', { variant: 'ghost', onClick: () => doLog('skip', 'stop') })) : null,
        already ? h('p', { class: 'hint-line' }, `Logged: ${already.kind === 'trade' ? 'trade' : 'skip (' + already.reason + ')'}.`) : null,
        h('p', { class: 'hint-line' }, 'One trade at a time: a setup that arrives while a trade is open is not a setup.')].filter(Boolean));
      stepHost.replaceChildren(button('Next Bar', { variant: 'ghost', onClick: () => step(1) }), button('+10 Bars', { variant: 'ghost', onClick: () => step(10) }), button('Next Candidate', { variant: 'ghost', onClick: nextCand }));
      host.__cur = () => cur;

      // the log, with R entry once a trade has closed
      const rows = partLog().map((l) => {
        const e = evOf(l.bar);
        if (l.kind === 'skip') return h('div', { class: 'bt-row' }, h('span', null, `Bar ${l.bar + 1}: skipped (${l.reason})`), h('b', null, '—'));
        if (!e || e.status !== 'valid') return h('div', { class: 'bt-row' }, h('span', null, `Bar ${l.bar + 1}: trade`), h('b', null, 'Not a valid entry'));
        if (cur - 1 < e.exitBar) return h('div', { class: 'bt-row' }, h('span', null, `Bar ${l.bar + 1}: trade open. Entry ${px(e.entry)}, stop ${px(e.stop)}, target ${px(e.target)}.`), h('b', null, 'Open'));
        const inp = tin('R');
        if (typeof l.recordedR === 'number') inp.value = String(l.recordedR);
        const save = button('Record', { variant: 'ghost', onClick: () => { const v = parseFloat(inp.value.replace(',', '.')); if (!Number.isFinite(v)) return; emit('backtest.record', { runId: run.id, bar: l.bar, recordedR: v }); draw(); } });
        inp.dataset.bar = String(l.bar);
        return h('div', { class: 'bt-row' }, h('span', null, `Bar ${l.bar + 1}: entry ${px(e.entry)}, stop ${px(e.stop)}, exit ${px(e.exit)} (${e.how}). Result in R:`), inp, save, typeof l.recordedR === 'number' ? h('b', null, R2(l.recordedR)) : null);
      });
      logHost.replaceChildren(h('div', { class: 'card-title' }, 'Your Log'), rows.length ? h('div', { class: 'bt-log' }, ...rows) : h('p', null, 'Nothing logged yet.'), h('p', { class: 'hint-line' }, 'Work out each result in R from the entry, stop and exit prices. The audit checks it.'));
      const pc = protocolChecks(run);
      const flags = pc[part].flags;
      const a = pc[part];
      const open = evs.length - a.matched;
      checkHost.replaceChildren(h('div', { class: 'card-title' }, 'Checks So Far'),
        h('div', { class: 'rp-check ' + (cur - 1 >= to && flags.length === 0 ? 'ok' : 'todo') }, h('span', null, cur - 1 >= to && flags.length === 0 ? '✓' : '○'), h('span', null, cur - 1 >= to ? (flags.length ? flags.slice(0, 3).map((f) => f.text).join(' ') : 'Every setup in this window is accounted for.') : `Reach bar ${to + 1}, then every setup must be logged or skipped with a reason. ${flags.filter((f) => f.type !== 'silent-skip').slice(0, 2).map((f) => f.text).join(' ')}`)),
        h('div', { class: 'rp-check ' + (a.rTotal >= (part === 'is' ? MIN_IS : MIN_OOS) ? 'ok' : 'todo') }, h('span', null, a.rTotal >= (part === 'is' ? MIN_IS : MIN_OOS) ? '✓' : '○'), h('span', null, `Trades logged: ${a.rTotal}. The lab minimum is ${part === 'is' ? MIN_IS : MIN_OOS}.`)),
        h('div', { class: 'rp-check ' + (a.rTotal && a.rCorrect === a.rTotal ? 'ok' : 'todo') }, h('span', null, a.rTotal && a.rCorrect === a.rTotal ? '✓' : '○'), h('span', null, `Results in R recorded correctly: ${a.rCorrect} of ${a.rTotal}.`)));
    };
    redraw();
    host.__redraw = redraw;

    const atEnd = cur - 1 >= to;
    const concl = h('textarea', { class: 'written', rows: 4, 'aria-label': 'Conclusion', placeholder: part === 'is' ? 'What the in-sample trades show, with their count and what you cannot conclude. You cannot change the rules after this.' : 'What the out-of-sample trades show.' });
    const tail = [];
    if (part === 'is') {
      const rs = recordedR(partLog());
      const s = tradeStats(rs);
      tail.push(h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'In-Sample Conclusion'), h('p', null, atEnd ? `You logged ${rs.length} trades with an average of ${R2(s.avgR)}.` : `Reach the last in-sample bar (${to + 1}) to conclude.`), concl,
        button('Lock The In-Sample Conclusion', { onClick: () => {
          const t = concl.value.trim();
          if (!(cur - 1 >= to) || t.length < 40) return void (msg.textContent = 'Reach the end of the window and write at least a couple of sentences.');
          emit('backtest.concludeIS', { runId: run.id, text: t });
          cur = null;
          draw();
        } }), h('p', { class: 'hint-line', role: 'alert' })));
      var msg = tail[0].lastChild;
      host.__concludeIS = (t) => { step(to + 1 - cur); concl.value = t; tail[0].querySelector('.btn:last-of-type, button:last-of-type').click(); };
    } else {
      const iv = finalInterval(run);
      let verdict = 'inconclusive';
      let zero = iv.includesZero;
      const ftext = h('textarea', { class: 'written', rows: 4, 'aria-label': 'Final conclusion', placeholder: 'What can and cannot be concluded from these trades.' });
      const vch = h('div', { class: 'choices wrap' }, ...[['edge', 'There Is An Edge'], ['no-edge', 'There Is No Edge'], ['inconclusive', 'Cannot Say']].map(([v, l]) => h('button', { type: 'button', class: 'opt small' + (v === verdict ? ' sel' : ''), 'data-v': v, onclick: (e) => { verdict = v; e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, l)));
      const zch = h('div', { class: 'choices wrap' }, ...[[true, 'Yes, It Includes Zero'], [false, 'No, It Does Not']].map(([v, l]) => h('button', { type: 'button', class: 'opt small', 'data-v': String(v), onclick: (e) => { zero = v; e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, l)));
      const msg2 = h('p', { class: 'hint-line', role: 'alert' });
      tail.push(h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Final Conclusion'),
        iv.lo === null ? h('p', null, atEnd ? 'Log at least two out-of-sample trades to get an interval.' : `Reach the last bar (${to + 1}) to conclude.`) : h('p', { class: 'an-big' }, `Out-of-sample average: ${R2(iv.mean)}. Interval: ${R2(iv.lo)} to ${R2(iv.hi)}.`),
        h('p', null, 'Does the interval include zero?'), zch, h('p', null, 'What do you conclude?'), vch, ftext,
        button('Lock The Final Conclusion', { onClick: () => {
          if (!(cur - 1 >= to) || iv.lo === null) return void (msg2.textContent = 'Reach the end of the window with at least two trades logged.');
          if (ftext.value.trim().length < 80) return void (msg2.textContent = 'Write what can and cannot be concluded, in at least a few sentences.');
          emit('backtest.final', { runId: run.id, text: ftext.value.trim(), verdict, lo: iv.lo, hi: iv.hi, saysIncludesZero: zero });
          draw();
        } }), msg2));
      host.__final = (t) => { step(to + 1 - cur); const iv2 = finalInterval(run); emit('backtest.final', { runId: run.id, text: t, verdict: 'inconclusive', lo: iv2.lo, hi: iv2.hi, saysIncludesZero: iv2.includesZero }); draw(); };
    }
    host.__logAll = () => {
      // a test driver: log exactly what the rule finds, and record each result correctly, in order
      for (const e of evs) {
        cur = e.bar + 2;
        emit('backtest.log', { runId: run.id, bar: e.bar, kind: e.status === 'valid' ? 'trade' : 'skip', reason: e.status === 'skip-spread' ? 'spread' : e.status === 'skip-stop' ? 'stop' : null, cur });
        if (e.status === 'valid') emit('backtest.record', { runId: run.id, bar: e.bar, recordedR: e.r });
      }
      cur = to + 1;
    };
    return [h('p', { class: 'lab-intro' }, part === 'is' ? 'Step 3 of 6. Step through the in-sample bars. Log every valid setup, winners and losers alike, and explain every skip. The level on the chart is the highest high of the four bars before the setup bar.' : 'Step 5 of 6. The out-of-sample bars are open. Run them once, with the same rules and no changes.'), chartHost, stepHost, candHost, logHost, checkHost, ...tail];
  };

  /* ---- stage 4 is the lock between the two windows, shown as a note on the step stage. Stage 6: done. */
  const doneStage = (run) => {
    const pc = protocolChecks(run);
    if (pc.done && !donePaid && !app.state.practicals['backtest-audit']) {
      donePaid = true;
      emit('practical.done', { id: 'backtest-audit', by: 'app', note: 'Backtest Lab protocol checks all passed' });
    }
    if (pc.done && onInteract) onInteract();
    return [h('p', { class: 'lab-intro' }, 'Step 6 of 6. The protocol checks.'),
      h('div', { class: 'card rp-checks' }, h('div', { class: 'card-title' }, pc.done ? 'Every Check Passed' : 'Some Checks Did Not Pass'), ...pc.checks.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.text + (c.ok || !c.detail ? '' : ' ' + c.detail))))),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'What You Can Say'), h('p', null, run.final ? run.final.text : ''), h('p', { class: 'hint-line' }, 'The lab grades how you ran the test and how honestly you concluded, not whether the rule paid. With this few trades, no result could establish an edge.')),
      h('div', { class: 'qactions' }, button('Start A New Run', { variant: 'ghost', onClick: () => { cur = null; emit('backtest.start', { runId: 'bt' + (Object.keys(app.state.backtests).length + 1), seed: RUN_SEEDS[Object.keys(app.state.backtests).length % RUN_SEEDS.length] }); draw(); } }))];
  };

  const draw = () => {
    const run = current();
    const stage = run ? runStage(run) : 'hypothesis';
    const head = run && run.hypothesis ? h('div', { class: 'rp-status' }, chip(`Run ${run.id.replace('bt', '')}`, 'sky'), chip(stage === 'done' ? 'Finished' : `Stage: ${({ split: 'Split', is: 'In-Sample', oos: 'Out-Of-Sample' })[stage] || 'Hypothesis'}`, 'gold')) : null;
    const body = stage === 'hypothesis' ? hypothesisStage() : stage === 'split' ? splitStage(run) : stage === 'is' ? stepStage(run, 'is') : stage === 'oos' ? stepStage(run, 'oos') : doneStage(run);
    host.replaceChildren(...[head, ...body].filter(Boolean));
  };
  draw();
  host.__draw = draw;
  return host;
}
