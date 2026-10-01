/**
 * The Hidden-Future Plan Series. Six charts with the future hidden. For each: call the setup (or say there is none and why), choose the
 * stop and target, work out the size, and submit. The process is scored first. Then the future is shown and the plan simulated.
 * Process and outcome are tracked apart. Synthetic bars. Simulated. Predicts nothing.
 */

import { app, emit } from '../core/app.js';
import { h } from '../ui/dom.js';
import { button, chip } from '../ui/kit.js';
import { candlesSvg } from '../ui/minichart.js';
import { BT, px } from '../sim/backtest.js';
import { planItems, gradePlan, outcomeOf, lotsFor, NO_SETUP_REASONS, BALANCE, ruleStop } from '../learn/planexercise.js';

const R2 = (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'R');
const tin = (placeholder) => h('input', { type: 'text', inputmode: 'decimal', class: 'jf-in', placeholder });
const field = (label, control, hint) => h('label', { class: 'jf' }, h('span', { class: 'jf-l' }, label), control, hint ? h('em', null, hint) : null);

export function planlab({ onInteract } = {}) {
  const items = planItems();
  const cap = app.state.settings.riskCapPct ?? 1;
  let k = 0;
  let done = 0;
  const host = h('div', { class: 'lab planlab' });
  const plan = () => ({ call: null, stop: NaN, rr: BT.rr, distPips: NaN, lots: NaN, reason: null });

  const show = () => {
    const item = items[k];
    const p = plan();
    const chartHost = h('div');
    const form = h('div', { class: 'hf-plan' });
    const result = h('div');
    let locked = false;
    const drawChart = (upto, extra = {}) => chartHost.replaceChildren(candlesSvg({ bars: item.bars, from: item.showFrom, upto, lines: extra.lines || [], marks: extra.marks || [], fmt: (v) => px(v), label: 'Synthetic price bars. The future is hidden.' }));
    drawChart(item.cut);

    const callChips = h('div', { class: 'choices' }, ...[['setup', 'There Is A Setup'], ['none', 'There Is No Setup']].map(([v, l]) => h('button', { type: 'button', class: 'opt', 'data-v': v, onclick: (e) => { if (locked) return; p.call = v; callChips.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); drawForm(); } }, l)));
    const stopIn = tin('Stop price');
    const distIn = tin('Pips from the last close');
    const lotsIn = tin('Lots');
    const rrChips = h('div', { class: 'choices' }, ...[1.5, 2, 3].map((v) => h('button', { type: 'button', class: 'opt small' + (v === p.rr ? ' sel' : ''), 'data-v': String(v), onclick: (e) => { p.rr = v; rrChips.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, v + 'R')));
    const reasonChips = h('div', { class: 'choices wrap' }, ...NO_SETUP_REASONS.map(([v, l]) => h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: (e) => { p.reason = v; reasonChips.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, l)));
    const num = (inp, key) => inp.addEventListener('input', () => { const v = parseFloat(inp.value.replace(',', '.')); p[key] = Number.isNaN(v) ? NaN : v; });
    num(stopIn, 'stop'); num(distIn, 'distPips'); num(lotsIn, 'lots');
    const drawForm = () => {
      if (p.call === 'setup') form.replaceChildren(h('p', { class: 'hint-line' }, `Entry is at the open of the next bar, plus the spread. Risk ${cap}% of $${BALANCE.toLocaleString('en-US')}; one pip of one lot is $10. Round the size down to 0.01 lot.`), field('Stop Price', stopIn, 'Where the rule puts it.'), field('Target', rrChips), field('Stop Distance In Pips', distIn, 'From the last close shown.'), field('Lots', lotsIn));
      else if (p.call === 'none') form.replaceChildren(h('p', null, 'Why is there no setup?'), reasonChips);
      else form.replaceChildren();
    };
    const submit = button('Submit The Plan', { onClick: () => {
      if (locked || !p.call) return;
      locked = true;
      const g = gradePlan(item, p, { capPct: cap });
      const out = outcomeOf(item, p);
      result.replaceChildren(
        h('div', { class: 'card' }, h('div', { class: 'card-title' }, `Process Score: ${g.pct}%`), h('div', null, ...g.comps.map((c) => h('div', { class: 'part-score' }, h('span', null, c.label), h('b', null, `${c.got} of ${c.max}`)), ))), h('div', { class: 'card rp-checks' }, ...g.comps.map((c) => h('div', { class: 'rp-check ' + (c.got === c.max ? 'ok' : 'todo') }, h('span', null, c.got === c.max ? '✓' : '○'), h('span', null, c.note)))),
        button('Reveal The Future', { onClick: () => reveal(g, out) }));
      submit.disabled = true;
    } });
    const reveal = (g, out) => {
      const lines = [];
      if (out.mine && out.mine.filled) lines.push({ y: out.mine.stop ?? p.stop, label: 'Your Stop', color: '#FF5C8A' }, { y: out.mine.target, label: 'Your Target', color: '#2DD4BF' }, { y: out.mine.entry, label: 'Entry', color: '#FFC83D', dash: '2 3' });
      drawChart(out.shownTo, { lines });
      const parts = [];
      if (out.mine && out.mine.filled) parts.push(h('p', null, `Your plan: entry ${px(out.mine.entry)} (next open plus the spread). ${({ stop: 'The stop was hit', target: 'The target was hit', 'gap-stop': 'Price gapped through the stop and filled at the open', 'gap-target': 'Price gapped through the target and filled at the open', end: 'Still open at the end of the window, closed at the last bar' })[out.mine.how]}: ${R2(out.mine.r)}.`));
      else if (out.mine) parts.push(h('p', null, 'Your plan could not be simulated: ' + out.mine.reason));
      else parts.push(h('p', null, 'You planned no trade.'));
      if (item.hasSetup && p.call !== 'setup') parts.push(h('p', null, `The rule's trade would have made ${R2(out.rule.r)}. It was a valid setup.`));
      parts.push(h('p', { class: 'hint-line' }, 'Assumptions: candles are bid, you buy at the ask, a candle that reaches both stop and target takes the stop first, a gap fills at the open, no slippage. The outcome is one trade. It says almost nothing about the plan.'));
      emit('plan.submit', { series: 'hf1', idx: k, process: g.pct, outcomeR: out.mine && out.mine.filled ? out.mine.r : null, call: p.call, hasSetup: item.hasSetup });
      done += 1;
      result.append(h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Outcome'), ...parts), k < items.length - 1 ? button('Next Plan', { onClick: () => { k += 1; show(); } }) : summaryCard());
      if (done >= items.length && onInteract) onInteract();
    };
    const summaryCard = () => {
      const mine = app.state.plans.filter((x) => x.series === 'hf1').slice(-items.length);
      const avgP = mine.reduce((a, x) => a + x.process, 0) / Math.max(1, mine.length);
      const rs = mine.map((x) => x.outcomeR).filter((x) => x !== null);
      return h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Series'), h('p', null, `Average process score: ${Math.round(avgP)}%. Outcomes: ${rs.length ? rs.map(R2).join(', ') : 'no trades'}.`), h('p', { class: 'hint-line' }, 'Your process score measures what you control. Six outcomes measure almost nothing. Both are kept, apart.'));
    };
    host.__plan = p;
    host.__solve = () => {
      if (item.hasSetup) {
        p.call = 'setup';
        p.stop = ruleStop(item.bars, item.cut);
        p.rr = BT.rr;
        p.distPips = Math.round((item.bars[item.cut].c - p.stop) * 10) / 10;
        p.lots = lotsFor(item.bars[item.cut].c - p.stop, cap);
      } else {
        p.call = 'none';
        p.reason = 'not-breakout';
      }
      submit.click();
      const rv = host.querySelector('.card + .card + .btn, .qactions .btn');
      [...host.querySelectorAll('button')].find((b) => /Reveal The Future/.test(b.textContent)).click();
    };
    host.replaceChildren(h('div', { class: 'rp-status' }, chip(`Plan ${k + 1} Of ${items.length}`, 'sky'), chip(`${done} Done`, 'gold')), h('p', { class: 'lab-intro' }, 'The rule: a setup is a bar that closes above the highest high of the 4 bars before it. Entry at the next open. Stop one pip below the lowest low of the last 3 bars. Fixed 2R target. Decide the process first. The future is hidden.'), chartHost, h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Your Plan'), callChips, form), h('div', { class: 'qactions' }, submit), result);
    drawForm();
  };
  show();
  host.__next = () => { if (k < items.length - 1) { k += 1; show(); } };
  host.__count = () => items.length;
  return host;
}
