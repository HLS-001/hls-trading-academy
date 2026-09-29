/**
 * The Pip Value calculator: Tool, Guided and Drill modes. All arithmetic is the calculator engine's.
 * (Level 3, lesson 3.05 preview.)
 */

import { app, emit } from '../core/app.js';
import { h, mount } from '../ui/dom.js';
import { button, card } from '../ui/kit.js';
import * as C from '../calc/index.js';
import { MARKETS, TEACHING_RATES, pretty } from '../calc/markets.js';
import { renderQuestion } from '../exercises/render.js';
import { resolveItem, answerPayload } from '../exercises/resolve.js';
import { makeRng, freshSeed } from '../learn/rng.js';

const ACCOUNTS = ['USD', 'EUR', 'GBP'];
const RATE_PAIRS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF'];
const GUIDED = ['t-pv-usdcad', 't-pv-jpy'];
const DRILL = ['t-pv-usdquote', 't-pv-usdcad', 't-pv-jpy', 't-pv-jpycross', 't-pv-gbpcross'];

const money = (n, ccy = 'USD', d = 2) => {
  const sym = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', CHF: 'CHF ' }[ccy] || ccy + ' ';
  return sym + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

export function pipcalc({ onInteract = () => {}, embedded = false } = {}) {
  const root = h('div', { class: 'pipcalc' });
  let mode = 'tool';
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const body = h('div', { class: 'seg-body' });
  const setMode = (m) => {
    mode = m;
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.m === m);
      b.setAttribute('aria-selected', b.dataset.m === m ? 'true' : 'false');
    });
    if (m === 'tool') toolView();
    else if (m === 'guided') guidedView();
    else drillView();
  };
  for (const [m, label] of [['tool', 'Tool'], ['guided', 'Guided'], ['drill', 'Drill']]) tabs.append(h('button', { type: 'button', role: 'tab', 'data-m': m, class: 'seg-btn', onclick: () => setMode(m) }, label));
  root.append(tabs, body);

  /* -------------------------------------------------- tool */
  function toolView() {
    const s = { symbol: 'USDJPY', lots: '1', acct: 'USD', rates: { ...TEACHING_RATES } };
    const out = h('div', { class: 'pc-out' });
    let logged = false;

    const compute = () => {
      const lots = parseFloat(s.lots);
      out.replaceChildren();
      if (!(lots > 0)) {
        out.append(h('p', { class: 'hint-line' }, 'Enter a lot size above zero.'));
        return;
      }
      let perLot;
      let perLotQuote;
      let conv;
      try {
        perLotQuote = C.pipValuePerLotQuote(s.symbol);
        const market = MARKETS.find((x) => x.symbol === s.symbol);
        conv = C.convRate(market.quote, s.acct, s.rates);
        perLot = perLotQuote * conv;
      } catch (e) {
        out.append(h('p', { class: 'hint-line' }, 'A conversion rate is missing for this pair and account currency.'));
        return;
      }
      const market = MARKETS.find((x) => x.symbol === s.symbol);
      const total = perLot * lots;
      if (!logged) {
        logged = true;
        emit('calc.use', { calc: 'pip-value', mode: 'tool' });
      }
      const working = h('div', { class: 'working hidden' },
        h('ol', null,
          h('li', null, 'Pip size on ' + pretty(s.symbol) + ': ', h('strong', null, String(market.pipSize))),
          h('li', null, 'One standard lot is ', h('strong', null, '100,000'), ' units.'),
          h('li', null, `Pip value for one lot, in ${market.quote}: ${market.pipSize} × 100,000 = `, h('strong', null, money(perLotQuote, market.quote, market.quote === 'JPY' ? 0 : 2))),
          market.quote === s.acct
            ? h('li', null, `${market.quote} is your account currency, so nothing to convert.`)
            : h('li', null, `Convert to ${s.acct}: one ${market.quote} is worth ${conv.toPrecision(5)} ${s.acct}, so ${money(perLotQuote, market.quote, market.quote === 'JPY' ? 0 : 2)} becomes `, h('strong', null, money(perLot, s.acct, 4))),
          h('li', null, `Times your ${s.lots} lot${lots === 1 ? '' : 's'}: `, h('strong', null, money(total, s.acct)))));
      const toggle = button('Show Working', { variant: 'ghost', onClick: (e, b) => { working.classList.toggle('hidden'); b.textContent = working.classList.contains('hidden') ? 'Show Working' : 'Hide Working'; } });
      out.append(
        h('div', { class: 'pc-big' }, h('span', null, 'One pip is worth'), h('b', null, money(total, s.acct)), h('em', null, `for ${s.lots} lot${lots === 1 ? '' : 's'} of ${pretty(s.symbol)}`)),
        h('div', { class: 'pc-sub' }, `One standard lot: ${money(perLot, s.acct, 4)} per pip`),
        toggle, working);
      onInteract();
    };

    const pairSel = h('select', { 'aria-label': 'Currency pair', onchange: (e) => { s.symbol = e.target.value; compute(); } }, ...MARKETS.map((m) => h('option', { value: m.symbol, selected: m.symbol === s.symbol }, pretty(m.symbol))));
    const acctSel = h('select', { 'aria-label': 'Account currency', onchange: (e) => { s.acct = e.target.value; compute(); } }, ...ACCOUNTS.map((a) => h('option', { value: a }, a)));
    const lotsIn = h('input', { type: 'text', inputmode: 'decimal', value: s.lots, 'aria-label': 'Lots', oninput: (e) => { s.lots = e.target.value.replace(',', '.'); compute(); } });
    const rates = h('details', { class: 'rates' }, h('summary', null, 'Example Prices Used For Conversion'),
      h('p', { class: 'hint-line' }, 'These are teaching values, not live prices. Change them to see the effect.'),
      h('div', { class: 'rate-grid' }, ...RATE_PAIRS.map((p) => h('label', { class: 'field' }, h('span', null, pretty(p)), h('input', { type: 'text', inputmode: 'decimal', value: String(s.rates[p]), 'aria-label': pretty(p) + ' price', oninput: (e) => { const v = parseFloat(e.target.value); if (v > 0) { s.rates[p] = v; compute(); } } })))));

    mount(body,
      h('div', { class: 'pc-form' },
        h('label', { class: 'field' }, h('span', null, 'Currency Pair'), pairSel),
        h('label', { class: 'field' }, h('span', null, 'Lots'), lotsIn),
        h('label', { class: 'field' }, h('span', null, 'Account Currency'), acctSel)),
      rates, out);
    compute();
  }

  /* -------------------------------------------------- guided */
  function guidedView() {
    const run = () => {
      const id = makeRng(freshSeed()).pick(GUIDED);
      const item = resolveItem({ kind: 't', id, mode: 'steps' });
      const holder = h('div');
      const q = renderQuestion(item, {
        mode: 'practice',
        shuffleSeed: 1,
        onAnswer: (result) => {
          emit('question.answer', answerPayload(item, result, { kind: 'drill', ref: 'pipcalc-guided' }));
          emit('calc.use', { calc: 'pip-value', mode: 'guided' });
          holder.append(h('div', { class: 'qactions' }, button('Another Problem', { onClick: run })));
          onInteract();
        }
      });
      mount(body, h('p', { class: 'hint-line' }, 'Fill in each step. A step that is right for your own earlier number still earns its credit.'), q.el, holder);
    };
    run();
  }

  /* -------------------------------------------------- drill */
  function drillView() {
    let asked = 0;
    let right = 0;
    const tally = h('span', { class: 'qtally' });
    const showTally = () => { tally.textContent = `${right} of ${asked} right`; };
    const run = () => {
      const id = makeRng(freshSeed()).pick(DRILL);
      const item = resolveItem({ kind: 't', id });
      const holder = h('div');
      showTally();
      const q = renderQuestion(item, {
        mode: 'practice',
        shuffleSeed: 1,
        labelExtra: tally,
        onAnswer: (result) => {
          asked += 1;
          if (result.correct) right += 1;
          showTally();
          emit('question.answer', answerPayload(item, result, { kind: 'drill', ref: 'pipcalc-drill' }));
          holder.append(h('div', { class: 'qactions' }, button('Next Problem', { onClick: run })));
          onInteract();
        }
      });
      mount(body, q.el, holder);
    };
    run();
  }

  setMode('tool');
  return root;
}
