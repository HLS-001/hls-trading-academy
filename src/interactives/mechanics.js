/**
 * Level 3 widgets: the quote board, the trade ticket, the leverage lens, the account panel and the cost bar.
 * Each one asks you to predict or choose first. All numbers come from calc/. Prices are teaching examples.
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { emit } from '../core/app.js';
import { h, s, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import * as C from '../calc/index.js';
import { getMarket, pretty, TEACHING_RATES } from '../calc/markets.js';
import { pricePath } from '../sim/paths.js';
import { freshSeed } from '../learn/rng.js';

const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');
const money = (n, d = 2) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const trimN = (n, d = 4) => String(+Number(n).toFixed(d));
const pick = (group, v) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));

/* ------------------------------------------------------------------ 3.01 the quote board */

const BOARD = {
  EURUSD: { bid: 1.17494, ask: 1.17506 },
  GBPUSD: { bid: 1.34993, ask: 1.35007 },
  USDJPY: { bid: 149.992, ask: 150.008 }
};

export function quoteboard({ onInteract }) {
  let pair = 'EURUSD';
  let guess = null;
  let openAt = null;
  const out = h('div', { class: 'lab-out' });
  const guesses = [];
  const board = h('div', { class: 'qb' });
  const pairs = [];
  const digits = () => getMarket(pair).digits;

  const draw = () => {
    const q = BOARD[pair];
    const bidBtn = h('div', { class: 'qb-side' }, h('span', null, 'Sell Price · Bid'), h('b', null, q.bid.toFixed(digits())));
    const askBtn = h('div', { class: 'qb-side' }, h('span', null, 'Buy Price · Ask'), h('b', null, q.ask.toFixed(digits())));
    board.replaceChildren(h('div', { class: 'qb-row' }, bidBtn, askBtn), h('div', { class: 'qb-spread' }, `Spread: ${trimN(C.spreadPips(pair, q.bid, q.ask), 1)} pips`));
  };

  const buy = () => {
    const q = BOARD[pair];
    openAt = q.ask;
    out.replaceChildren(
      h('p', { class: 'lab-result' }, `You bought 1 lot at the ask: ${openAt.toFixed(digits())}.`),
      h('p', { class: 'hint-line' }, 'Now close it straight away. What price will it close at?'),
      button('Close At Once', { onClick: close }));
  };
  const close = () => {
    const q = BOARD[pair];
    const pips = C.pipsResult({ symbol: pair, dir: 1, entry: openAt, exit: q.bid });
    const cash = pips * C.pipValueTrade(pair, 1, 'USD', { USDJPY: 150 });
    out.replaceChildren(
      h('p', { class: 'lab-result' }, `Closed at the bid: ${q.bid.toFixed(digits())}. Result: ${trimN(pips, 1)} pips, ${money(cash)}.`),
      h('p', { class: 'lab-teach', html: mdInline(`You paid the **spread** the moment you entered. The market did not move at all, and you are already behind. Every trade starts by covering it.`) }),
      h('div', { class: 'qactions' }, button('Try Another Pair', { variant: 'ghost', onClick: () => { pair = pair === 'EURUSD' ? 'USDJPY' : pair === 'USDJPY' ? 'GBPUSD' : 'EURUSD'; pick(pairs, pair); draw(); out.replaceChildren(buyPrompt()); } })));
    emit('sim.run', { sim: 'quoteboard', guess });
    onInteract();
  };
  const buyPrompt = () => h('div', { class: 'qactions' }, button('Buy 1 Lot At The Ask', { onClick: buy }));

  const choose = (v, b) => {
    guess = v;
    pick(guesses, v);
    out.replaceChildren(buyPrompt());
  };
  const guessBtn = (label, v) => {
    const b = h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: () => choose(v, b) }, label);
    guesses.push(b);
    return b;
  };
  const pairBtn = (p) => {
    const b = h('button', { type: 'button', class: 'opt small' + (p === pair ? ' sel' : ''), 'data-v': p, onclick: () => { pair = p; pick(pairs, p); draw(); if (openAt === null) out.replaceChildren(); } }, pretty(p));
    pairs.push(b);
    return b;
  };
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'A quote has two prices. You SELL at the lower one (the bid) and BUY at the higher one (the ask).'),
    h('div', { class: 'choices' }, ...['EURUSD', 'GBPUSD', 'USDJPY'].map(pairBtn)),
    board,
    h('p', { class: 'lab-q' }, 'You buy 1 lot and close it at once, with the market perfectly still. What is the result?'),
    h('div', { class: 'choices' }, guessBtn('A Small Gain', 'gain'), guessBtn('Exactly Zero', 'zero'), guessBtn('A Small Loss', 'loss')),
    out, note());
}

/* ------------------------------------------------------------------ 3.04 the trade ticket */

function dualLineChart(path, upto, { entryI = null, exitI = null, w = 340, hgt = 160 } = {}) {
  const pts = path.slice(0, upto + 1);
  const all = path.flatMap((p) => [p.bid, p.ask]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1e-4;
  const x = (i) => 8 + ((w - 16) * i) / (path.length - 1);
  const y = (v) => 10 + (hgt - 20) * (1 - (v - min) / span);
  const line = (key, colour) => s('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' '), fill: 'none', stroke: colour, 'stroke-width': 1.8, 'stroke-linejoin': 'round' });
  const mark = (i, key, colour, label) => (i === null ? null : s('g', null, s('circle', { cx: x(i), cy: y(path[i][key]), r: 4.5, fill: colour }), s('text', { x: x(i), y: y(path[i][key]) - 9, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 9, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, label)));
  return h('div', { class: 'figure' }, s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'fig', role: 'img', 'aria-label': 'Bid and ask prices over time' }, line('ask', '#FFC83D'), line('bid', '#2DD4BF'), mark(entryI, entryI === null ? 'bid' : (path.dir > 0 ? 'ask' : 'bid'), '#FFE8A0', 'In'), mark(exitI, exitI === null ? 'bid' : (path.dir > 0 ? 'bid' : 'ask'), '#A78BFA', 'Out')),
    h('div', { class: 'chart-key' }, h('span', { class: 'k-ask' }, 'Ask (buy price)'), h('span', { class: 'k-bid' }, 'Bid (sell price)')));
}

export function tradeticket({ onInteract }) {
  const symbol = 'EURUSD';
  const pip = getMarket(symbol).pipSize;
  const path = pricePath({ seed: freshSeed(), start: 1.175, pipSize: pip, steps: 40, volPips: 2.2, spreadPips: 1.2 });
  let dir = null;
  let lots = 1;
  let now = 6;
  let entryI = null;
  let closed = false;
  const dirs = [];
  const lotBtns = [];
  const chart = h('div');
  const panel = h('div', { class: 'ticket-panel' });
  const actions = h('div', { class: 'qactions' });
  const out = h('div', { class: 'lab-out' });

  const entryPrice = () => (dir > 0 ? path[entryI].ask : path[entryI].bid);
  const exitPriceAt = (i) => (dir > 0 ? path[i].bid : path[i].ask);
  const floating = (i) => C.pipsResult({ symbol, dir, entry: entryPrice(), exit: exitPriceAt(i) }) * C.pipValueTrade(symbol, lots, 'USD', {});

  const redraw = () => {
    path.dir = dir || 1;
    chart.replaceChildren(dualLineChart(path, now, { entryI, exitI: closed ? now : null }));
    if (entryI === null) {
      panel.replaceChildren(h('div', { class: 'tk-row' }, h('span', null, 'Bid'), h('b', null, path[now].bid.toFixed(5))), h('div', { class: 'tk-row' }, h('span', null, 'Ask'), h('b', null, path[now].ask.toFixed(5))));
    } else {
      const pips = C.pipsResult({ symbol, dir, entry: entryPrice(), exit: exitPriceAt(now) });
      panel.replaceChildren(
        h('div', { class: 'tk-row' }, h('span', null, dir > 0 ? 'Opened Long At The Ask' : 'Opened Short At The Bid'), h('b', null, entryPrice().toFixed(5))),
        h('div', { class: 'tk-row' }, h('span', null, dir > 0 ? 'Closes At The Bid' : 'Closes At The Ask'), h('b', null, exitPriceAt(now).toFixed(5))),
        h('div', { class: 'tk-row big' }, h('span', null, closed ? 'Final Result' : 'Open Result'), h('b', null, `${trimN(pips, 1)} pips · ${money(floating(now))}`)));
    }
  };

  const setActions = () => {
    actions.replaceChildren();
    if (dir === null) return;
    if (entryI === null) actions.append(button('Open The Trade', { onClick: () => { entryI = now; setActions(); redraw(); } }));
    else if (!closed) {
      actions.append(button('Move Time Forward', { variant: 'ghost', disabled: now >= path.length - 1, onClick: () => { now = Math.min(path.length - 1, now + 5); redraw(); setActions(); } }), button('Close The Trade', { onClick: () => { closed = true; redraw(); setActions(); finish(); } }));
    }
  };

  const finish = () => {
    const pips = C.pipsResult({ symbol, dir, entry: entryPrice(), exit: exitPriceAt(now) });
    out.replaceChildren(
      h('p', { class: 'lab-teach', html: mdInline(`A **${dir > 0 ? 'long' : 'short'}** trade opens at the **${dir > 0 ? 'ask' : 'bid'}** and closes at the **${dir > 0 ? 'bid' : 'ask'}**. The gap between them is the spread. Here it cost you ${trimN(C.spreadPips(symbol, path[entryI].bid, path[entryI].ask), 1)} pips before the market moved at all.`) }));
    emit('sim.run', { sim: 'tradeticket', dir, lots, pips });
    onInteract();
  };

  const chooseDir = (v) => {
    if (entryI !== null) return;
    dir = v;
    pick(dirs, v);
    setActions();
    redraw();
  };
  const dirBtn = (label, v) => {
    const b = h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: () => chooseDir(v) }, label);
    dirs.push(b);
    return b;
  };
  const lotBtn = (v) => {
    const b = h('button', { type: 'button', class: 'opt small' + (v === lots ? ' sel' : ''), 'data-v': v, onclick: () => { if (entryI !== null) return; lots = v; pick(lotBtns, v); redraw(); } }, v + ' lot' + (v === 1 ? '' : 's'));
    lotBtns.push(b);
    return b;
  };
  redraw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Open a long or short trade on EUR/USD, let time pass, then close it. Watch which price each step uses.'),
    h('div', { class: 'choices' }, dirBtn('Long (Buy)', 1), dirBtn('Short (Sell)', -1)),
    h('div', { class: 'choices' }, lotBtn(0.1), lotBtn(0.5), lotBtn(1)),
    chart, panel, actions, out, note());
}

/* ------------------------------------------------------------------ 3.07 the leverage lens */

export function leveragelens({ onInteract }) {
  const balance = 10000;
  const symbol = 'EURUSD';
  const sizes = [0.1, 0.5, 1, 2];
  let move = -50;
  let guess = null;
  let moved = false;
  const guesses = [];
  const cards = h('div', { class: 'lens-grid' });
  const maxBox = h('div', { class: 'lens-max' });
  const moveVal = h('b', null, '−50 pips');
  const out = h('div', { class: 'lab-out' });
  const pv = C.pipValuePerLot(symbol, 'USD', {});
  const price = TEACHING_RATES[symbol];

  const draw = () => {
    cards.replaceChildren(...sizes.map((lots) => {
      const notional = C.notionalValue({ lots, symbol, price, acct: 'USD', rates: {} });
      const cash = move * pv * lots;
      const pct = (cash / balance) * 100;
      return h('div', { class: 'lens-card' + (cash < 0 ? ' loss' : ' gain') }, h('b', null, `${lots} lot${lots === 1 ? '' : 's'}`), h('span', null, `Position ${money(notional, 0)}`), h('span', null, `${trimN(notional / balance, 1)} × the account`), h('strong', null, `${money(cash, 0)}`), h('em', null, `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${trimN(Math.abs(pct), 2)}% of the account`));
    }));
    moveVal.textContent = (move < 0 ? '−' : move > 0 ? '+' : '') + Math.abs(move) + ' pips';
  };

  const drawMax = () => {
    maxBox.replaceChildren(h('p', { class: 'lab-q' }, 'What does the broker\'s leverage change?'), ...[30, 100, 500].map((lev) => {
      const marginPerLot = C.marginRequired({ lots: 1, symbol, price, leverage: lev, acct: 'USD', rates: {} });
      return h('div', { class: 'pc-row' }, h('span', null, `Leverage ${lev} : 1`), h('b', null, `Margin ${money(marginPerLot, 0)} per lot · up to ${trimN(balance / marginPerLot, 1)} lots`));
    }), h('p', { class: 'lab-teach', html: mdInline(`One pip is worth **${money(pv)} per lot** at every leverage setting. Leverage only changes **how large a position you are allowed to hold**. The size you choose decides how much the account swings.`) }));
  };

  const pickGuess = (v) => {
    guess = v;
    pick(guesses, v);
    slider.disabled = false;
    out.replaceChildren(h('p', { class: 'hint-line' }, 'Now move the market. Watch each size.'));
  };
  const gBtn = (label, v) => {
    const b = h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: () => pickGuess(v) }, label);
    guesses.push(b);
    return b;
  };
  const slider = h('input', { type: 'range', min: -100, max: 100, step: 10, value: -50, disabled: true, 'aria-label': 'Market move in pips', oninput: (e) => {
    move = +e.target.value;
    draw();
    if (!moved && move !== -50) {
      moved = true;
      out.replaceChildren(h('p', { class: 'lab-result' }, guess === 'bigger' ? 'Right: the biggest position swings the account the most.' : 'The biggest position swings the account the most. Look at the 2 lot card.'), h('p', { class: 'lab-teach' }, 'The market did the same thing to all four. The only difference was the size you chose.'));
      drawMax();
      emit('sim.run', { sim: 'leveragelens', guess });
      onInteract();
    }
  } });
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, `An account of ${money(balance, 0)} holds EUR/USD. The same market move hits four different position sizes.`),
    h('p', { class: 'lab-q' }, 'When the market moves the same distance, which position changes the account the most?'),
    h('div', { class: 'choices' }, gBtn('The Biggest One', 'bigger'), gBtn('The Smallest One', 'smaller'), gBtn('All The Same', 'same')),
    h('label', { class: 'slider' }, h('span', null, 'Market Move ', moveVal), slider),
    cards, out, maxBox, note());
}

/* ------------------------------------------------------------------ 3.08 the account panel */

export function accountpanel({ onInteract }) {
  const balance = 2000;
  const symbol = 'EURUSD';
  const lots = 1;
  const entry = 1.175;
  const lev = 100;
  const margin = C.marginRequired({ lots, symbol, price: entry, leverage: lev, acct: 'USD', rates: {} });
  const pv = C.pipValueTrade(symbol, lots, 'USD', {});
  const toCall = C.pipsToMarginLevel({ balance, usedMargin: margin, pipValue: pv, level: 100 });
  const toStop = C.pipsToMarginLevel({ balance, usedMargin: margin, pipValue: pv, level: 50 });
  let guess = null;
  let moved = false;
  const guesses = [];
  const panel = h('div', { class: 'acct' });
  const status = h('div', { class: 'acct-status' });
  const out = h('div', { class: 'lab-out' });
  const val = h('b', null, '0 pips');
  let pips = 0;

  const draw = () => {
    const price = entry + (pips * getMarket(symbol).pipSize);
    const floatingPnl = pips * pv;
    const st = C.accountState({ balance, floatingPnl, usedMargin: margin });
    const rows = [['Balance', money(st.balance)], ['Equity', money(st.equity)], ['Used Margin', money(st.usedMargin)], ['Free Margin', money(st.freeMargin)], ['Margin Level', st.marginLevel === null ? '—' : trimN(st.marginLevel, 1) + '%']];
    panel.replaceChildren(h('div', { class: 'acct-price' }, `EUR/USD ${price.toFixed(5)} · ${lots} lot long from ${entry.toFixed(5)}`), ...rows.map(([k, v]) => h('div', { class: 'pc-row' }, h('span', null, k), h('b', null, v))));
    const level = st.marginLevel;
    status.className = 'acct-status ' + (level <= 50 ? 'stop' : level <= 100 ? 'call' : 'ok');
    status.textContent = level <= 50 ? 'Stop-out level reached: the broker closes positions' : level <= 100 ? 'Margin call level: the broker warns you' : 'Account is healthy';
    val.textContent = (pips > 0 ? '+' : pips < 0 ? '−' : '') + Math.abs(pips) + ' pips';
  };

  const opts = [trimN(toCall, 1), trimN(toCall * 2, 1), trimN(toCall / 2, 1), '200'];
  const pickGuess = (v, b) => {
    guess = v;
    pick(guesses, v);
    slider.disabled = false;
    out.replaceChildren(h('p', { class: 'hint-line' }, 'Now slide the price down and watch the panel.'));
  };
  const gBtn = (label, v) => {
    const b = h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: () => pickGuess(v, b) }, label + ' pips');
    guesses.push(b);
    return b;
  };
  const slider = h('input', { type: 'range', min: -200, max: 50, step: 5, value: 0, disabled: true, 'aria-label': 'Price move in pips', oninput: (e) => {
    pips = +e.target.value;
    draw();
    if (!moved && pips <= -toCall) {
      moved = true;
      out.replaceChildren(
        h('p', { class: 'lab-result' }, `The margin level fell to 100% after ${trimN(toCall, 1)} pips. Your guess: ${guess} pips.`),
        h('p', { class: 'lab-teach', html: mdInline(`Equity fell from ${money(balance)} to the margin of ${money(margin)}, so the level reached 100%. At **${trimN(toStop, 1)} pips** against you it reaches 50%, a level where many brokers close positions automatically. Each broker sets its own levels. Check yours.`) }));
      emit('sim.run', { sim: 'accountpanel', guess });
      onInteract();
    }
  } });
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, `An account of ${money(balance, 0)} buys 1 lot of EUR/USD at ${entry}, with leverage of ${lev} : 1. The margin held is ${money(margin)}. One pip is worth ${money(pv)}.`),
    h('p', { class: 'lab-q' }, 'How many pips against you before the margin level falls to 100%? (Equity equal to the margin.)'),
    h('div', { class: 'choices' }, ...[opts[2], opts[0], opts[1], opts[3]].map((o) => gBtn(o, o))),
    h('label', { class: 'slider' }, h('span', null, 'Price Move ', val), slider),
    panel, status, out,
    h('p', { class: 'sim-note' }, 'Margin call and stop-out levels vary by broker. The arithmetic below is the same everywhere.'), note());
}

/* ------------------------------------------------------------------ 3.10 the cost bar */

export function costbar({ onInteract }) {
  const symbol = 'EURUSD';
  const lots = 1;
  const pv = C.pipValueTrade(symbol, lots, 'USD', {});
  const s0 = { stop: 20, spread: 1.2, comm: 6, nights: 3, swap: -4.5, slip: 0.3 };
  const v = { ...s0 };
  const out = h('div', { class: 'lab-out' });
  const bar = h('div', { class: 'costbar' });
  const readouts = {};
  let touched = 0;

  const slider = (id, label, min, max, step, fmtv) => {
    const val = h('b', null, fmtv(v[id]));
    readouts[id] = val;
    return h('label', { class: 'slider' }, h('span', null, label, ' ', val), h('input', { type: 'range', min, max, step, value: v[id], 'aria-label': label, oninput: (e) => { v[id] = +e.target.value; val.textContent = fmtv(v[id]); draw(); if (id === 'stop') { touched += 1; if (touched >= 2) onInteract(); } } }));
  };

  const draw = () => {
    const risk = v.stop * pv;
    const parts = [
      ['Spread', v.spread * pv, 'sp'],
      ['Commission', v.comm * lots, 'cm'],
      ['Swap', -v.swap * v.nights * lots, 'sw'],
      ['Slippage', v.slip * pv, 'sl']
    ];
    const total = parts.reduce((a, p) => a + p[1], 0);
    const share = total / risk;
    bar.replaceChildren(
      h('div', { class: 'cb-track' }, ...parts.map(([, amt, cls]) => h('i', { class: cls, style: { width: Math.min(100, (amt / risk) * 100) + '%' } }))),
      h('div', { class: 'cb-legend' }, ...parts.map(([name, amt, cls]) => h('span', null, h('i', { class: cls }), `${name} ${money(amt)}`))));
    out.replaceChildren(
      h('div', { class: 'pc-big' }, h('span', null, `Costs Eat`), h('b', null, `${trimN(share * 100, 0)}% of 1R`), h('em', null, `${money(total)} of a ${money(risk)} risk`)),
      h('p', { class: 'lab-teach', html: mdInline(`A trade that wins **2R** before costs nets **${trimN(2 - share, 2)}R** after them. A trade that loses 1R loses **${trimN(1 + share, 2)}R**.`) }));
  };
  draw();
  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'One lot of EUR/USD. Costs stay the same while the size of your stop changes. Slide the stop and watch how much of your risk the costs take.'),
    slider('stop', 'Stop Distance', 5, 60, 5, (x) => x + ' pips'),
    slider('spread', 'Spread', 0, 3, 0.1, (x) => trimN(x, 1) + ' pips'),
    slider('nights', 'Nights Held', 0, 10, 1, (x) => x + ''),
    bar, out, note());
}
