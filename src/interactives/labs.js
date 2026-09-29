/**
 * The Level 1 labs. Each is a small simulation that makes you predict first, then shows the result.
 * Every screen carries the line: Simulated. Illustrates a mechanism; predicts nothing.
 *
 * A widget is a function ({ onInteract }) => HTMLElement. onInteract() tells the lesson the student has
 * done the activity, which enables Continue.
 */

import { h, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { histogram, priceLine } from '../ui/charts.js';
import { streakChart } from '../exercises/stimulus.js';
import { makeRng, freshSeed } from '../learn/rng.js';
import { winsHistogram, shareWithin, simulateTraders, flips, orderFlowPath } from '../sim/prob.js';
import { emit } from '../core/app.js';

const note = () => h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.');

const choice = (label, value, group, onPick) => {
  const b = h('button', { type: 'button', class: 'opt small', 'data-v': value, onclick: () => onPick(value, b) }, label);
  group.push(b);
  return b;
};
const select = (group, value) => group.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(value)));

/* ------------------------------------------------------------------ 1.06 order flow */

export function orderflow({ onInteract }) {
  let buy = 70;
  let sell = 40;
  let prediction = null;
  const preds = [];
  const out = h('div', { class: 'lab-out' });
  const buyVal = h('b', null, String(buy));
  const sellVal = h('b', null, String(sell));
  const run = button('Run It', { onClick: () => go(), disabled: true });
  const slider = (label, valueEl, get, set) =>
    h('label', { class: 'slider' }, h('span', null, label, ' ', valueEl), h('input', { type: 'range', min: 10, max: 100, step: 5, value: get(), 'aria-label': label, oninput: (e) => { set(+e.target.value); valueEl.textContent = e.target.value; } }));
  const outcomeOf = (net) => (net > 0.08 ? 'up' : net < -0.08 ? 'down' : 'flat');

  const go = () => {
    const seed = freshSeed();
    const { path, net } = orderFlowPath({ seed, buy, sell });
    const actual = outcomeOf(net);
    const moved = path[path.length - 1] - path[0];
    out.replaceChildren(
      priceLine(path),
      h('p', { class: 'lab-result' }, `The price ${moved >= 0 ? 'rose' : 'fell'} by ${Math.abs(moved).toFixed(1)}.`),
      h('p', null, prediction === actual ? 'Your prediction matched.' : 'Your prediction did not match this run.'),
      h('p', { class: 'lab-teach', html: mdInline('When buying outweighs selling, the price tends to rise, and the reverse. But **noise** matters too: change the numbers or run it again and the path changes.') }));
    emit('sim.run', { sim: 'orderflow', buy, sell });
    onInteract();
  };

  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Set how many buy orders and sell orders arrive. Then predict what the price does.'),
    slider('Buy Orders', buyVal, () => buy, (v) => (buy = v)),
    slider('Sell Orders', sellVal, () => sell, (v) => (sell = v)),
    h('p', { class: 'lab-q' }, 'What will the price do?'),
    h('div', { class: 'choices' }, choice('Rise', 'up', preds, (v) => { prediction = v; select(preds, v); run.disabled = false; }), choice('Fall', 'down', preds, (v) => { prediction = v; select(preds, v); run.disabled = false; }), choice('Stay Flat', 'flat', preds, (v) => { prediction = v; select(preds, v); run.disabled = false; })),
    h('div', { class: 'lab-actions' }, run),
    out, note());
}

/* ------------------------------------------------------------------ 1.07 two coins */

export function twocoins({ onInteract }) {
  let seed = freshSeed();
  let truth;
  let counts;
  let guess;
  let revealed;
  const view = h('div', { class: 'lab' });

  const reset = () => {
    seed = freshSeed();
    truth = makeRng(seed).chance(0.5) ? { A: 0.52, B: 0.5 } : { A: 0.5, B: 0.52 };
    counts = { A: { h: 0, n: 0 }, B: { h: 0, n: 0 } };
    guess = null;
    revealed = false;
    draw();
  };
  const flip = (k) => {
    for (const c of ['A', 'B']) {
      const rng = makeRng(`coin#${seed}#${c}#${counts[c].n}`);
      counts[c].h += flips(rng, truth[c], k);
      counts[c].n += k;
    }
    draw();
  };
  const row = (c) => h('div', { class: 'coin' }, h('div', { class: 'coin-name' }, 'Coin ' + c), h('div', { class: 'coin-stat' }, h('b', null, String(counts[c].h)), ' heads in ', String(counts[c].n), ' flips'), h('div', { class: 'coin-bar' }, h('i', { style: { width: counts[c].n ? (100 * counts[c].h) / counts[c].n + '%' : '0%' } }), h('u', { style: { left: '50%' } })), h('div', { class: 'coin-pct' }, counts[c].n ? ((100 * counts[c].h) / counts[c].n).toFixed(1) + '% heads' : '—'));
  function draw() {
    const n = counts.A.n;
    const diff = Math.abs(counts.A.h - counts.B.h);
    const rows = [
      h('p', { class: 'lab-intro' }, 'One coin lands heads 50% of the time. The other, 52%. Flip both, then decide which coin has the edge.'),
      h('div', { class: 'coins' }, row('A'), row('B')),
      h('div', { class: 'choices wrap' }, button('Flip Each 30 Times', { variant: 'ghost', onClick: () => flip(30), disabled: revealed }), button('Flip Each 300 More', { variant: 'ghost', onClick: () => flip(300), disabled: revealed }), button('Flip Each 3,000 More', { variant: 'ghost', onClick: () => flip(3000), disabled: revealed }))
    ];
    if (n > 0) rows.push(h('p', { class: 'lab-result' }, `After ${n} flips each, the coins differ by ${diff} heads.`));
    if (n >= 30 && !revealed) {
      const g = [];
      rows.push(h('p', { class: 'lab-q' }, 'Which coin has the edge?'), h('div', { class: 'choices' }, choice('Coin A', 'A', g, (v) => { guess = v; draw(); }), choice('Coin B', 'B', g, (v) => { guess = v; draw(); })));
      select(g, guess);
      rows.push(h('div', { class: 'lab-actions' }, button('Reveal', { onClick: reveal, disabled: !guess })));
    }
    if (revealed) {
      const better = truth.A > truth.B ? 'A' : 'B';
      rows.push(
        h('div', { class: 'reveal-box' }, `Coin ${better} is the 52% coin. ${guess === better ? 'You picked it' : 'You picked the other one'}, after ${n} flips each.`),
        h('p', { class: 'lab-teach', html: mdInline('With a small sample, luck can hide a real edge or invent one that is not there. **More results** are what separate a real edge from noise.') }),
        h('div', { class: 'lab-actions' }, button('New Coins', { variant: 'ghost', onClick: reset })));
    }
    rows.push(note());
    view.replaceChildren(...rows);
  }
  const reveal = () => {
    revealed = true;
    emit('sim.run', { sim: 'twocoins', flips: counts.A.n });
    onInteract();
    draw();
  };
  reset();
  return view;
}

/* ------------------------------------------------------------------ 1.08 probability lab */

export function problab({ onInteract }) {
  let p = 0.6;
  let n = 30;
  let prediction = null;
  const preds = [];
  const out = h('div', { class: 'lab-out' });
  const winVal = h('b', null, '60%');
  const nBtns = [];
  const runBtn = button('Run 1,000 Tries', { onClick: () => go(), disabled: true });

  const go = () => {
    const seed = freshSeed();
    const { counts, mean, runs } = winsHistogram({ seed, p, n, runs: 1000 });
    // middle 80% of runs
    const cum = [];
    counts.reduce((a, c, i) => (cum[i] = a + c), 0);
    const at = (q) => cum.findIndex((c) => c >= q * runs);
    const lo = at(0.1);
    const hi = at(0.9);
    const inside = shareWithin(counts, lo, hi);
    const spread = hi - lo;
    const label = { exact: 'Every run lands on exactly the average', spread: 'Most runs land near the average, with a clear spread', wild: 'The runs are wildly different, with no pattern' };
    out.replaceChildren(
      histogram(counts, { lo, hi, mean }),
      h('p', { class: 'lab-result' }, `Average wins: ${mean.toFixed(1)} of ${n}. The middle 80% of runs won between ${lo} and ${hi}.`),
      h('p', null, prediction === 'spread' ? 'Right: ' + label.spread + '.' : 'Not quite. Most runs land near the average, with a clear spread.'),
      h('p', { class: 'lab-teach', html: mdInline(`One run of ${n} trades could land anywhere in that spread. But the **shape of many runs** is steady. Try ${n === 100 ? 'a smaller' : 'a larger'} number of trades to see how the spread changes.`) }));
    emit('sim.run', { sim: 'problab', p, n });
    onInteract();
  };
  const setN = (v) => {
    n = v;
    nBtns.forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
  };
  const nChoices = [10, 30, 100].map((v) => {
    const b = h('button', { type: 'button', class: 'opt small' + (v === n ? ' sel' : ''), 'data-v': String(v), onclick: () => setN(v) }, v + ' trades');
    nBtns.push(b);
    return b;
  });

  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Pick a win rate and a number of trades. A method with that win rate will be run 1,000 times, and we will count the wins in each run.'),
    h('label', { class: 'slider' }, h('span', null, 'Win Rate ', winVal), h('input', { type: 'range', min: 30, max: 70, step: 5, value: 60, 'aria-label': 'Win rate', oninput: (e) => { p = +e.target.value / 100; winVal.textContent = e.target.value + '%'; } })),
    h('div', { class: 'choices' }, ...nChoices),
    h('p', { class: 'lab-q' }, 'Predict what 1,000 runs will look like.'),
    h('div', { class: 'choices col' },
      choice('Every run lands on exactly the average', 'exact', preds, (v) => { prediction = v; select(preds, v); runBtn.disabled = false; }),
      choice('Most runs land near the average, with a clear spread', 'spread', preds, (v) => { prediction = v; select(preds, v); runBtn.disabled = false; }),
      choice('The runs are wildly different, with no pattern', 'wild', preds, (v) => { prediction = v; select(preds, v); runBtn.disabled = false; })),
    h('div', { class: 'lab-actions' }, runBtn),
    out, note());
}

/* ------------------------------------------------------------------ 1.09 streak simulator */

export function streaksim({ onInteract }) {
  let rate = 0.5;
  let prediction = null;
  const rates = [];
  const preds = [];
  const out = h('div', { class: 'lab-out' });
  const runBtn = button('Run Twenty Traders', { onClick: () => go(), disabled: true });
  const buckets = { a: [0, 2], b: [3, 5], c: [6, 8], d: [9, 99] };
  const bucketOf = (v) => Object.keys(buckets).find((k) => v >= buckets[k][0] && v <= buckets[k][1]);

  const go = () => {
    const seed = freshSeed();
    const data = simulateTraders({ seed, winRate: rate, trades: 100, traders: 20 });
    const streaks = data.map((d) => d.longestLoss).sort((a, b) => a - b);
    const median = streaks[Math.floor(streaks.length / 2)];
    const longest = streaks[streaks.length - 1];
    const hit = bucketOf(median) === prediction;
    out.replaceChildren(
      streakChart({ seed, winRate: rate, trades: 100, traders: 20 }),
      h('p', { class: 'lab-result' }, `A typical trader's longest losing streak was ${median}. The longest of all twenty was ${longest}.`),
      h('p', null, hit ? 'Your prediction was in the right range.' : 'Your prediction was in a different range from the typical result.'),
      h('p', { class: 'lab-teach', html: mdInline(`All twenty traders used the **same rules and the same odds**. The differences are luck. Change the win rate to see how it changes the typical streak.`) }));
    emit('sim.run', { sim: 'streaksim', winRate: rate });
    onInteract();
  };
  const rateButtons = [0.4, 0.5, 0.6].map((v) => {
    const b = h('button', { type: 'button', class: 'opt small' + (v === rate ? ' sel' : ''), 'data-v': String(v), onclick: () => { rate = v; rates.forEach((x) => x.classList.toggle('sel', x.dataset.v === String(v))); } }, Math.round(v * 100) + '% win rate');
    rates.push(b);
    return b;
  });

  return h('div', { class: 'lab' },
    h('p', { class: 'lab-intro' }, 'Twenty traders follow identical rules with the same win rate, for 100 trades each. How long will their longest run of losses be?'),
    h('div', { class: 'choices' }, ...rateButtons),
    h('p', { class: 'lab-q' }, 'A typical trader\'s longest losing streak will be about…'),
    h('div', { class: 'choices' },
      choice('2 or fewer', 'a', preds, (v) => { prediction = v; select(preds, v); runBtn.disabled = false; }),
      choice('3 to 5', 'b', preds, (v) => { prediction = v; select(preds, v); runBtn.disabled = false; }),
      choice('6 to 8', 'c', preds, (v) => { prediction = v; select(preds, v); runBtn.disabled = false; }),
      choice('9 or more', 'd', preds, (v) => { prediction = v; select(preds, v); runBtn.disabled = false; })),
    h('div', { class: 'lab-actions' }, runBtn),
    out, note());
}
