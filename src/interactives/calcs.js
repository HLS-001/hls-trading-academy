/**
 * The calculator suite (Part 7): one framework, one spec per calculator, all arithmetic from calc/.
 * Every calculator has a Tool (inputs to answer, with Show Working), and where a lesson provides them,
 * a Guided mode (fill in each step) and a Drill (new numbers every time, mistakes named).
 * Fields open the in-app keypad, so negative numbers are always possible and the system keyboard never appears.
 */

import { app, emit } from '../core/app.js';
import { h, mount } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import * as C from '../calc/index.js';
import { MARKETS, TEACHING_RATES, getMarket, pretty } from '../calc/markets.js';
import { numInput } from '../ui/numinput.js';
import { renderQuestion } from '../exercises/render.js';
import { resolveItem, answerPayload } from '../exercises/resolve.js';
import { makeRng, freshSeed } from '../learn/rng.js';

const SYM = { USD: '$', EUR: '€', GBP: '£' };
const money = (n, ccy = 'USD', d = 2) => (n < 0 ? '−' : '') + (SYM[ccy] || ccy + ' ') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const px = (symbol, v) => v.toFixed(getMarket(symbol).digits);
const trimN = (n, d = 4) => String(+Number(n).toFixed(d));

const num = (id, label, def, opts = {}) => ({ type: 'num', id, label, def, ...opts });
const sel = (id, label, def, options) => ({ type: 'select', id, label, def, options });
const PAIR = sel('pair', 'Currency Pair', 'EURUSD', MARKETS.map((m) => [m.symbol, pretty(m.symbol)]));
const DIR = sel('dir', 'Direction', '1', [['1', 'Long (Buy)'], ['-1', 'Short (Sell)']]);
const ACCT = sel('acct', 'Account Currency', 'USD', [['USD', 'USD'], ['EUR', 'EUR'], ['GBP', 'GBP']]);
const priceField = (id, label, offsetPips) => ({ type: 'num', id, label, price: true, offsetPips, allowDecimal: true, max: 9 });

/** Default prices follow the pair: entry at the teaching price, others an offset in pips from it. */
const defaultPrice = (symbol, offsetPips, dir = 1) => {
  const m = getMarket(symbol);
  return +(TEACHING_RATES[symbol] + dir * offsetPips * m.pipSize).toFixed(m.digits);
};

const need = (v, ...ids) => ids.every((k) => v[k] !== null && v[k] !== undefined && !Number.isNaN(v[k]));

/* ------------------------------------------------------------------ the specs */

export const CALCS = {
  'dollar-risk': {
    title: 'Dollar Risk',
    blurb: 'How much money a risk percentage is.',
    unlock: 'l03-dollar-risk',
    fields: [num('balance', 'Account Balance', 10000, { prefix: '$' }), num('riskPct', 'Risk Per Trade', 1, { suffix: '%' })],
    drill: ['t-l3-dollar-risk', 't-l3-pct-decimal'],
    compute: (v) => {
      if (!need(v, 'balance', 'riskPct')) return null;
      const risk = C.dollarRisk(v.balance, v.riskPct);
      return { main: ['You Risk', money(risk)], rows: [['As A Decimal', trimN(v.riskPct / 100, 6)]], working: [`Risk percent as a decimal: ${trimN(v.riskPct)} ÷ 100 = ${trimN(v.riskPct / 100, 6)}`, `Dollar risk: ${money(v.balance)} × ${trimN(v.riskPct / 100, 6)} = ${money(risk)}`] };
    }
  },
  'percent-risk': {
    title: 'Percentage Risk',
    blurb: 'How much of the account a position puts at risk.',
    unlock: 'l03-dollar-risk',
    fields: [PAIR, num('lots', 'Lots', 0.2, { decimals: undefined }), num('stopPips', 'Stop Distance (Pips)', 25), num('balance', 'Account Balance', 10000, { prefix: '$' }), ACCT],
    drill: ['t-l3-risk-pct'],
    compute: (v) => {
      if (!need(v, 'lots', 'stopPips', 'balance') || v.lots <= 0) return null;
      const pv = C.pipValuePerLot(v.pair, v.acct, TEACHING_RATES);
      const risk = v.lots * v.stopPips * pv;
      const pct = (risk / v.balance) * 100;
      return { main: ['You Risk', trimN(pct, 2) + '%'], rows: [['In Money', money(risk, v.acct)], ['Pip Value Per Lot', money(pv, v.acct, 4)]], working: [`Pip value for one lot: ${money(pv, v.acct, 4)}`, `Money at risk: ${trimN(v.lots)} lots × ${trimN(v.stopPips)} pips × ${money(pv, v.acct, 4)} = ${money(risk, v.acct)}`, `As a percent of the account: ${money(risk, v.acct)} ÷ ${money(v.balance, v.acct)} × 100 = ${trimN(pct, 3)}%`] };
    }
  },
  'stop-distance': {
    title: 'Stop-Loss Distance',
    blurb: 'How many pips lie between your entry and your stop.',
    unlock: 'l03-position-size',
    fields: [PAIR, DIR, priceField('entry', 'Entry Price', 0), priceField('stop', 'Stop Price', -25), num('spread', 'Spread (Pips)', 0.8), sel('incl', 'Add The Spread To The Risk', '1', [['1', 'Yes'], ['0', 'No']])],
    drill: ['t-l3-stop-pips'],
    compute: (v) => {
      if (!need(v, 'entry', 'stop', 'spread')) return null;
      const ok = C.validateStop({ dir: +v.dir, entry: v.entry, stop: v.stop });
      if (!ok.ok) return { warn: [ok.message] };
      const pips = C.stopDistancePips(v.pair, v.entry, v.stop);
      const total = pips + (v.incl === '1' ? v.spread : 0);
      return { main: ['Risk Distance', trimN(total, 2) + ' pips'], rows: [['Price Distance', trimN(pips, 2) + ' pips'], ['Spread Added', v.incl === '1' ? trimN(v.spread) + ' pips' : 'None']], working: [`Price difference: |${px(v.pair, v.entry)} − ${px(v.pair, v.stop)}| = ${trimN(Math.abs(v.entry - v.stop), 6)}`, `Pip size on ${pretty(v.pair)}: ${getMarket(v.pair).pipSize}`, `Distance in pips: ${trimN(Math.abs(v.entry - v.stop), 6)} ÷ ${getMarket(v.pair).pipSize} = ${trimN(pips, 2)}`, v.incl === '1' ? `Add the spread: ${trimN(pips, 2)} + ${trimN(v.spread)} = ${trimN(total, 2)} pips` : 'The spread is not added.'] };
    }
  },
  'position-size': {
    title: 'Position Size',
    blurb: 'How many lots fit a risk budget and a stop.',
    unlock: 'l03-position-size',
    fields: [num('balance', 'Account Balance', 10000, { prefix: '$' }), num('riskPct', 'Risk Per Trade', 0.5, { suffix: '%' }), PAIR, DIR, priceField('entry', 'Entry Price', 0), priceField('stop', 'Stop Price', -25), num('spread', 'Spread (Pips)', 0.8), sel('incl', 'Add The Spread To The Risk', '1', [['1', 'Yes'], ['0', 'No']]), sel('step', 'Lot Step', '0.01', [['0.01', '0.01'], ['0.1', '0.1'], ['1', '1']]), sel('minlot', 'Smallest Lot', '0.01', [['0.01', '0.01'], ['0.1', '0.1'], ['1', '1']]), ACCT],
    drill: ['t-l3-size', 't-l3-size-jpy', 't-l3-realized-risk'],
    guided: ['t-l3-chain'],
    compute: (v) => {
      if (!need(v, 'balance', 'riskPct', 'entry', 'stop', 'spread') || v.riskPct <= 0) return null;
      const ok = C.validateStop({ dir: +v.dir, entry: v.entry, stop: v.stop });
      if (!ok.ok) return { warn: [ok.message] };
      const r = C.positionSize({ balance: v.balance, riskPct: v.riskPct, symbol: v.pair, entry: v.entry, stop: v.stop, spreadPips: v.incl === '1' ? v.spread : 0, acct: v.acct, rates: TEACHING_RATES, lotStep: +v.step, minLot: +v.minlot });
      const cap = app.state.settings.riskCapPct;
      const warn = [];
      if (r.belowMin) warn.push(`The smallest lot (${v.minlot}) would risk ${trimN(r.riskAtMinLotPct, 2)}% of the account, more than the ${trimN(v.riskPct)}% you chose. This position cannot be sized safely.`);
      else if (r.realizedPct > cap + 1e-9) warn.push(`Risk is ${trimN(r.realizedPct, 2)}%, above your cap of ${trimN(cap)}%.`);
      else warn.push(`Risk is within your cap of ${trimN(cap)}%.`);
      return {
        main: ['Position Size', r.belowMin ? '0 lots' : trimN(r.lots, 2) + ' lots'],
        rows: [['Stop Distance', trimN(r.stopPips, 2) + ' pips'], ['Risk Distance', trimN(r.riskPips, 2) + ' pips'], ['Pip Value Per Lot', money(r.pipValue, v.acct, 4)], ['Risk Budget', money(r.riskMoney, v.acct)], ['Realized Risk', money(r.realizedRisk, v.acct) + ' · ' + trimN(r.realizedPct, 2) + '%']],
        warn,
        working: [`Risk budget: ${money(v.balance, v.acct)} × ${trimN(v.riskPct)}% = ${money(r.riskMoney, v.acct)}`, `Stop distance: ${trimN(r.stopPips, 2)} pips${v.incl === '1' ? ` + ${trimN(v.spread)} spread = ${trimN(r.riskPips, 2)} pips` : ''}`, `Pip value for one lot: ${money(r.pipValue, v.acct, 4)}`, `Lots before rounding: ${money(r.riskMoney, v.acct)} ÷ (${trimN(r.riskPips, 2)} × ${money(r.pipValue, v.acct, 4)}) = ${trimN(r.rawLots, 4)}`, `Round DOWN to the lot step ${v.step}: ${trimN(r.lots, 2)} lots`, `Realized risk: ${trimN(r.lots, 2)} × ${trimN(r.riskPips, 2)} × ${money(r.pipValue, v.acct, 4)} = ${money(r.realizedRisk, v.acct)}`]
      };
    }
  },
  reward: {
    title: 'Reward And Risk-Reward',
    blurb: 'What a target is worth in pips and money, and the reward-to-risk ratio.',
    unlock: 'l03-reward-r',
    fields: [PAIR, DIR, priceField('entry', 'Entry Price', 0), priceField('stop', 'Stop Price', -25), priceField('target', 'Target Price', 50), num('lots', 'Lots', 0.2)],
    drill: ['t-l3-reward-pips', 't-l3-rr'],
    compute: (v) => {
      if (!need(v, 'entry', 'stop', 'target', 'lots')) return null;
      const ok = C.validateStop({ dir: +v.dir, entry: v.entry, stop: v.stop, target: v.target });
      if (!ok.ok) return { warn: [ok.message] };
      const rp = C.rewardPips(v.pair, v.entry, v.target);
      const risk = C.stopDistancePips(v.pair, v.entry, v.stop);
      const pv = C.pipValueTrade(v.pair, v.lots, 'USD', TEACHING_RATES);
      return { main: ['Reward-To-Risk', trimN(rp / risk, 2) + ' : 1'], rows: [['Reward', trimN(rp, 2) + ' pips · ' + money(rp * pv)], ['Risk', trimN(risk, 2) + ' pips · ' + money(risk * pv)]], working: [`Reward in pips: |${px(v.pair, v.target)} − ${px(v.pair, v.entry)}| ÷ ${getMarket(v.pair).pipSize} = ${trimN(rp, 2)}`, `Risk in pips: |${px(v.pair, v.entry)} − ${px(v.pair, v.stop)}| ÷ ${getMarket(v.pair).pipSize} = ${trimN(risk, 2)}`, `Reward-to-risk: ${trimN(rp, 2)} ÷ ${trimN(risk, 2)} = ${trimN(rp / risk, 2)}`, `Money: ${trimN(v.lots)} lots × ${money(pv / v.lots, 'USD', 4)} per pip per lot × ${trimN(rp, 2)} pips = ${money(rp * pv)}`] };
    }
  },
  'r-multiple': {
    title: 'R-Multiple',
    blurb: 'A result measured in units of the risk you took.',
    unlock: 'l03-reward-r',
    fields: [PAIR, DIR, priceField('entry', 'Entry Price', 0), priceField('stop', 'Stop Price', -25), priceField('exit', 'Exit Price', 50), num('lots', 'Lots', 0.2), num('costs', 'Costs In Money', 0, { prefix: '$' })],
    drill: ['t-l3-r-prices', 't-l3-r-money'],
    compute: (v) => {
      if (!need(v, 'entry', 'stop', 'exit', 'lots', 'costs')) return null;
      const ok = C.validateStop({ dir: +v.dir, entry: v.entry, stop: v.stop });
      if (!ok.ok) return { warn: [ok.message] };
      const riskPips = C.stopDistancePips(v.pair, v.entry, v.stop);
      const pv = C.pipValueTrade(v.pair, v.lots, 'USD', TEACHING_RATES);
      const riskMoney = riskPips * pv;
      const resPips = C.pipsResult({ symbol: v.pair, dir: +v.dir, entry: v.entry, exit: v.exit });
      const pnl = resPips * pv;
      const r = C.rMultiple({ pnl, riskMoney, costs: v.costs });
      return { main: ['Result', (r < 0 ? '−' : r > 0 ? '+' : '') + trimN(Math.abs(r), 2) + 'R'], rows: [['Result In Pips', trimN(resPips, 2)], ['Result In Money', money(pnl)], ['Risked', money(riskMoney) + ' (1R)'], ['Costs', money(v.costs)]], working: [`Risk in pips: ${trimN(riskPips, 2)}. Risk in money: ${trimN(riskPips, 2)} × ${money(pv / v.lots, 'USD', 4)} × ${trimN(v.lots)} = ${money(riskMoney)}. That is 1R.`, `Result in pips: ${v.dir === '1' ? 'exit − entry' : 'entry − exit'} = ${trimN(resPips, 2)}`, `Result in money: ${trimN(resPips, 2)} × ${money(pv, 'USD', 2)} per pip = ${money(pnl)}`, `After costs: (${money(pnl)} − ${money(v.costs)}) ÷ ${money(riskMoney)} = ${trimN(r, 3)}R`] };
    }
  },
  margin: {
    title: 'Margin And Leverage',
    blurb: 'The deposit a position needs, and how big it is against the account.',
    unlock: 'l03-account-panel',
    fields: [PAIR, num('lots', 'Lots', 1), priceField('price', 'Price', 0), num('lev', 'Leverage (For Example 100)', 100, { suffix: ' : 1' }), num('equity', 'Account Equity', 10000, { prefix: '$' })],
    drill: ['t-l3-margin', 't-l3-margin-level'],
    compute: (v) => {
      if (!need(v, 'lots', 'price', 'lev', 'equity') || v.lev <= 0) return null;
      const notional = C.notionalValue({ lots: v.lots, symbol: v.pair, price: v.price, acct: 'USD', rates: TEACHING_RATES });
      const margin = notional / v.lev;
      const pv = C.pipValueTrade(v.pair, v.lots, 'USD', TEACHING_RATES);
      const free = v.equity - margin;
      const level = (v.equity / margin) * 100;
      return { main: ['Margin Needed', money(margin)], rows: [['Position Value', money(notional)], ['Larger Than The Account By', trimN(notional / v.equity, 2) + ' ×'], ['Free Margin', money(free)], ['Margin Level', trimN(level, 1) + '%'], ['One Pip Is Worth', money(pv)]], warn: free < 0 ? ['This position needs more margin than the account has.'] : [], working: [`Position value: ${trimN(v.lots)} lots × 100,000 × ${px(v.pair, v.price)} = ${money(notional)}`, `Margin: ${money(notional)} ÷ ${trimN(v.lev)} = ${money(margin)}`, `Free margin: ${money(v.equity)} − ${money(margin)} = ${money(free)}`, `Margin level: ${money(v.equity)} ÷ ${money(margin)} × 100 = ${trimN(level, 1)}%`, 'Leverage does not change what a pip is worth. It changes how big a position the account can hold.'] };
    }
  },
  'trade-cost': {
    title: 'Trade Cost',
    blurb: 'Every cost of a trade added up, and how much of 1R it eats.',
    unlock: 'l03-costs',
    fields: [PAIR, num('lots', 'Lots', 0.5), num('spread', 'Spread (Pips)', 1.2), num('comm', 'Commission Per Lot (Round Trip)', 6, { prefix: '$' }), num('nights', 'Nights Held', 3), num('swap', 'Swap Per Lot Per Night (Negative Is A Charge)', -4.5, { prefix: '$', allowNegative: true }), num('slip', 'Slippage (Pips)', 0.3), num('risk', 'Money At Risk (1R)', 50, { prefix: '$' })],
    drill: ['t-l3-total-cost', 't-l3-cost-r', 't-l3-swap'],
    compute: (v) => {
      if (!need(v, 'lots', 'spread', 'comm', 'nights', 'swap', 'slip', 'risk')) return null;
      const pv = C.pipValueTrade(v.pair, v.lots, 'USD', TEACHING_RATES);
      const spreadCost = v.spread * pv;
      const comm = C.commissionMoney({ lots: v.lots, perLotRoundTrip: v.comm });
      const swap = C.swapMoney({ lots: v.lots, perLotPerNight: v.swap, nights: v.nights });
      const slip = v.slip * pv;
      const total = C.totalCostMoney({ spreadCost, commission: comm, swapCharge: -swap, slippageCost: slip });
      const costR = v.risk > 0 ? total / v.risk : null;
      return { main: ['Total Cost', money(total)], rows: [['Spread', money(spreadCost)], ['Commission', money(comm)], ['Swap', money(-swap) + (swap >= 0 ? ' (a credit)' : ' (a charge)')], ['Slippage', money(slip)], ['Share Of 1R', costR === null ? '—' : trimN(costR * 100, 1) + '% of 1R']], working: [`One pip is worth ${money(pv / v.lots, 'USD', 4)} per lot, ${money(pv)} for ${trimN(v.lots)} lots.`, `Spread: ${trimN(v.spread)} pips × ${money(pv)} = ${money(spreadCost)}`, `Commission: ${trimN(v.lots)} lots × ${money(v.comm)} = ${money(comm)}`, `Swap: ${trimN(v.lots)} lots × ${money(v.swap)} × ${trimN(v.nights)} nights = ${money(swap)}`, `Slippage: ${trimN(v.slip)} pips × ${money(pv)} = ${money(slip)}`, `Total: ${money(total)}. Against ${money(v.risk)} of risk, that is ${costR === null ? '—' : trimN(costR, 3) + 'R'}.`] };
    }
  }
};

CALCS.expectancy = {
  title: 'Expectancy Suite',
  blurb: 'Expectancy, break-even win rate and profit factor from a win rate and a payoff.',
  unlock: 'l05-expectancy',
  fields: [num('w', 'Win Rate', 40, { suffix: '%' }), num('wr', 'Average Win (R)', 3), num('lr', 'Average Loss (R)', 1)],
  drill: ['t-l5-expectancy', 't-l5-be-winrate', 't-l5-pf-from-stats'],
  compute: (v) => {
    if (!need(v, 'w', 'wr', 'lr') || v.w < 0 || v.w > 100 || v.lr <= 0) return null;
    const w = v.w / 100;
    const e = C.expectancyR({ winRate: w, avgWinR: v.wr, avgLossR: v.lr });
    const be = (v.lr / (v.wr + v.lr)) * 100;
    const pf = (w * v.wr) / ((1 - w) * v.lr);
    return {
      main: ['Expectancy Per Trade', (e < 0 ? '−' : e > 0 ? '+' : '') + trimN(Math.abs(e), 2) + 'R'],
      rows: [['Break-Even Win Rate', trimN(be, 1) + '%'], ['Profit Factor', Number.isFinite(pf) ? trimN(pf, 2) : 'not defined'], ['Your Win Rate Against Break-Even', v.w > be ? 'above' : v.w < be ? 'below' : 'equal']],
      warn: e > 0 ? [] : ['Expectancy is not positive. On average this method loses money per trade.'],
      working: [`Winners: ${trimN(v.w)}% × ${trimN(v.wr)}R = ${trimN(w * v.wr, 3)}R`, `Losers: ${trimN(100 - v.w)}% × ${trimN(v.lr)}R = ${trimN((1 - w) * v.lr, 3)}R`, `Expectancy: ${trimN(w * v.wr, 3)} − ${trimN((1 - w) * v.lr, 3)} = ${trimN(e, 3)}R`, `Break-even win rate: ${trimN(v.lr)} ÷ (${trimN(v.wr)} + ${trimN(v.lr)}) = ${trimN(be, 2)}%`, `Profit factor: (${trimN(w * v.wr, 3)}) ÷ (${trimN((1 - w) * v.lr, 3)}) = ${trimN(pf, 2)}`]
    };
  }
};

CALCS.drawdown = {
  title: 'Drawdown And Recovery',
  blurb: 'How far an account fell from its peak, and the gain needed to get back.',
  unlock: 'l05-drawdown',
  fields: [num('peak', 'Peak Balance', 10000, { prefix: '$' }), num('low', 'Lowest Balance', 8000, { prefix: '$' })],
  drill: ['t-l5-recovery', 't-l5-dd-pct'],
  compute: (v) => {
    if (!need(v, 'peak', 'low') || v.peak <= 0 || v.low < 0 || v.low > v.peak) return { warn: ['Enter a peak, then a lowest balance at or below it.'] };
    const d = (v.peak - v.low) / v.peak;
    const rec = d >= 1 ? Infinity : C.recoveryRequired(d) * 100;
    return {
      main: ['Drawdown', trimN(d * 100, 1) + '%'],
      rows: [['Gain Needed To Recover', Number.isFinite(rec) ? trimN(rec, 1) + '%' : 'impossible'], ['Lost', money(v.peak - v.low)]],
      working: [`Drawdown: (${money(v.peak)} − ${money(v.low)}) ÷ ${money(v.peak)} × 100 = ${trimN(d * 100, 2)}%`, `Recovery: 1 ÷ (1 − ${trimN(d, 4)}) − 1 = ${Number.isFinite(rec) ? trimN(rec, 2) + '%' : 'infinite'}`, 'The gain is bigger than the fall, because it is earned on a smaller balance.']
    };
  }
};

export const CALC_LIST = Object.entries(CALCS).map(([id, c]) => ({ id, title: c.title, blurb: c.blurb, unlock: c.unlock }));

/* ------------------------------------------------------------------ the view */

export function calcTool({ id, onInteract = () => {}, mode = 'tool' }) {
  const spec = CALCS[id];
  const root = h('div', { class: 'pipcalc calc' });
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const body = h('div', { class: 'seg-body' });
  const modes = [['tool', 'Tool'], ...(spec.guided ? [['guided', 'Guided']] : []), ['drill', 'Drill']];
  const setMode = (m) => {
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.m === m);
      b.setAttribute('aria-selected', b.dataset.m === m ? 'true' : 'false');
    });
    if (m === 'tool') toolView();
    else if (m === 'guided') practiceView(spec.guided, 'steps', 'guided');
    else practiceView(spec.drill, 'single', 'drill');
  };
  for (const [m, label] of modes) tabs.append(h('button', { type: 'button', role: 'tab', 'data-m': m, class: 'seg-btn', onclick: () => setMode(m) }, label));
  root.append(tabs, body);

  function toolView() {
    const state = {};
    const inputs = {};
    const out = h('div', { class: 'pc-out' });
    let logged = false;
    const recompute = () => {
      const v = { ...state };
      for (const f of spec.fields) if (f.type === 'num') v[f.id] = inputs[f.id].value;
      const r = spec.compute(v);
      out.replaceChildren();
      if (!r) return out.append(h('p', { class: 'hint-line' }, 'Fill in every field to see the answer.'));
      if (!logged) {
        logged = true;
        emit('calc.use', { calc: id, mode: 'tool' });
      }
      for (const w of r.warn || []) out.append(h('div', { class: 'notice' + (/within/.test(w) ? '' : ' warn') }, w));
      if (r.main) {
        out.append(h('div', { class: 'pc-big' }, h('span', null, r.main[0]), h('b', null, r.main[1])));
        if (r.rows && r.rows.length) out.append(h('div', { class: 'pc-rows' }, ...r.rows.map(([k, val]) => h('div', { class: 'pc-row' }, h('span', null, k), h('b', null, val)))));
        const working = h('div', { class: 'working hidden' }, h('ol', null, ...r.working.map((w) => h('li', null, w))));
        out.append(button('Show Working', { variant: 'ghost', onClick: (e, b) => { working.classList.toggle('hidden'); b.textContent = working.classList.contains('hidden') ? 'Show Working' : 'Hide Working'; } }), working);
        onInteract();
      }
    };
    const grid = h('div', { class: 'pc-form' });
    // prices are set relative to the entry: a stop sits on the losing side, a target on the winning side
    const setPrices = () => {
      const dir = state.dir === '-1' ? -1 : 1;
      for (const f of spec.fields) {
        if (!f.price) continue;
        const m = getMarket(state.pair);
        const off = f.offsetPips; // negative = the losing side, positive = the winning side
        inputs[f.id].setDecimals(m.digits);
        inputs[f.id].set(+(TEACHING_RATES[state.pair] + dir * off * m.pipSize).toFixed(m.digits), { silent: true });
      }
    };
    for (const f of spec.fields) {
      if (f.type === 'select') {
        state[f.id] = f.def;
        const s = h('select', { 'aria-label': f.label, onchange: (e) => { state[f.id] = e.target.value; if (f.id === 'pair' || f.id === 'dir') setPrices(); recompute(); } }, ...f.options.map(([val, label]) => h('option', { value: val, selected: val === f.def }, label)));
        grid.append(h('label', { class: 'field' }, h('span', null, f.label), s));
      } else {
        const digits = f.price ? getMarket(state.pair || 'EURUSD').digits : f.decimals;
        inputs[f.id] = numInput({ label: f.label, value: f.price ? null : f.def, prefix: f.prefix || '', suffix: f.suffix || '', decimals: f.price ? undefined : f.decimals, allowNegative: !!f.allowNegative || (f.price ? false : false), max: f.max || 9, onChange: recompute });
        grid.append(inputs[f.id].el);
      }
    }
    if (spec.fields.some((f) => f.price)) {
      state.pair = state.pair || 'EURUSD';
      state.dir = state.dir || '1';
      setPrices();
    }
    mount(body, grid, out);
    recompute();
  }

  function practiceView(ids, itemMode, ref) {
    const run = () => {
      const tid = makeRng(freshSeed()).pick(ids);
      const item = resolveItem({ kind: 't', id: tid, mode: itemMode });
      const holder = h('div');
      const q = renderQuestion(item, {
        mode: 'practice',
        shuffleSeed: 1,
        onAnswer: (result) => {
          emit('question.answer', answerPayload(item, result, { kind: 'drill', ref: `calc-${id}-${ref}` }));
          emit('calc.use', { calc: id, mode: ref });
          holder.append(h('div', { class: 'qactions' }, button('Next Problem', { onClick: run })));
          onInteract();
        }
      });
      mount(body, itemMode === 'steps' ? h('p', { class: 'hint-line' }, 'Fill in each step. A step that is right for your own earlier number still earns its credit.') : null, q.el, holder);
    };
    run();
  }

  setMode(mode);
  return root;
}
