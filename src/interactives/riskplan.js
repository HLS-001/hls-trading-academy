/**
 * The Risk Plan Builder. The course does not prescribe a risk percentage: it shows the consequences of each choice and makes
 * the student write their own limits. The builder checks the plan for consistency against the student's own numbers and
 * against the risk cap in Settings (an editable default), then sends it to the mentor, who approves it or asks for changes.
 * The journal later enforces what is written here.
 */

import { app, emit } from '../core/app.js';
import { h, mdInline } from '../ui/dom.js';
import { button, chip } from '../ui/kit.js';
import { numInput } from '../ui/numinput.js';
import * as C from '../calc/index.js';
import { docStatus, DOC_STATUS_LABEL } from '../learn/docs.js';

export const RISK_FIELDS = [
  { id: 'balance', label: 'Account Size', prefix: '$', hint: 'Used only to show what your limits mean in dollars.' },
  { id: 'riskPct', label: 'Risk Per Trade', suffix: '%', hint: 'Of your current balance, at the stop.' },
  { id: 'dailyLoss', label: 'Maximum Daily Loss', suffix: '%', hint: 'You stop for the day when you reach it.' },
  { id: 'weeklyLoss', label: 'Maximum Weekly Loss', suffix: '%', hint: 'You stop for the week when you reach it.' },
  { id: 'drawdownStop', label: 'Drawdown That Stops Trading', suffix: '%', hint: 'From your highest balance. You stop and review.' },
  { id: 'cutAt', label: 'Drawdown That Cuts Your Risk', suffix: '%', hint: 'You trade smaller from here on.' },
  { id: 'cutTo', label: 'Risk After The Cut', suffix: '%', hint: 'As a percent of your normal risk per trade.' },
  { id: 'maxOpen', label: 'Maximum Open Risk', suffix: '%', hint: 'Total at risk across all open trades.' },
  { id: 'maxCurrency', label: 'Maximum Risk In One Currency', suffix: '%', hint: 'Counted across all pairs that share a currency.' }
];

/** Added in Level 11. Optional: the plan can be approved without them, and they show as an open item until written. */
export const BEHAVIOR_FIELDS = [
  { id: 'maxTrades', label: 'Maximum Trades Per Day', suffix: ' Trades', hint: 'You are done for the day when you reach it.' },
  { id: 'pauseMin', label: 'Pause After A Loss', suffix: ' Minutes', hint: 'No new order until it has passed.' }
];

/** The consistency checks, each with a plain sentence. cap is the risk cap from Settings, in percent. */
export function checkRiskPlan(d, cap) {
  const n = (k) => (typeof d[k] === 'number' ? d[k] : null);
  const has = (...ks) => ks.every((k) => n(k) !== null && n(k) > 0);
  const checks = [];
  const add = (id, ok, text, optional = false) => checks.push({ id, ok: !!ok, text, optional });
  add('risk', has('riskPct') && d.riskPct <= cap, `Risk per trade is set and is within your cap of ${cap}%.`);
  add('daily', has('riskPct', 'dailyLoss') && d.dailyLoss >= d.riskPct, 'The daily loss limit is at least one full-risk trade.');
  add('weekly', has('dailyLoss', 'weeklyLoss') && d.weeklyLoss >= d.dailyLoss, 'The weekly loss limit is at least the daily limit.');
  add('drawdown', has('weeklyLoss', 'drawdownStop') && d.drawdownStop >= d.weeklyLoss, 'The drawdown that stops trading is at least the weekly limit.');
  add('cut', has('cutAt', 'cutTo', 'drawdownStop') && d.cutAt < d.drawdownStop && d.cutTo < 100, 'The risk cut starts before the stop, and cuts risk below its normal level.');
  add('open', has('riskPct', 'maxOpen', 'dailyLoss') && d.maxOpen >= d.riskPct && d.maxOpen <= d.dailyLoss, 'Maximum open risk covers at least one trade and is no more than the daily limit.');
  add('currency', has('riskPct', 'maxCurrency', 'maxOpen') && d.maxCurrency >= d.riskPct && d.maxCurrency <= d.maxOpen, 'Risk in one currency covers at least one trade and is no more than the open-risk limit.');
  add('measure', d.lossMeasure === 'closed' || d.lossMeasure === 'open', 'You said how a loss limit is measured: closed trades only, or open losses too.');
  add('sizing', d.sizing === true, 'You size every trade from the stop and round lots down.');
  add('noraise', d.noRaise === true, 'Risk never goes up after a loss or inside a drawdown.');
  add('news', typeof d.news === 'string' && d.news.trim().length >= 40, 'You wrote a news rule (at least a sentence or two).');
  add('behavior', has('maxTrades', 'pauseMin') && typeof d.behavior === 'string' && d.behavior.trim().length >= 40, 'Optional, from Level 11: a maximum trades per day, a pause after a loss, and your behavior rules in writing.', true);
  return checks;
}

/** What the plan means, in the student's own numbers. */
export function riskConsequences(d) {
  if (!(d.riskPct > 0) || !(d.balance > 0)) return null;
  const perTrade = (d.balance * d.riskPct) / 100;
  const ladder = C.streakLadder({ balance: d.balance, riskPct: d.riskPct, losses: [5, 10] });
  return {
    perTrade,
    dailyLosses: d.dailyLoss > 0 ? Math.ceil(d.dailyLoss / d.riskPct - 1e-6) : null,
    openTrades: d.maxOpen > 0 ? Math.floor(d.maxOpen / d.riskPct + 1e-6) : null,
    after5: ladder[0],
    after10: ladder[1]
  };
}

const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const pct1 = (v) => (Math.round(v * 10) / 10).toFixed(1) + '%';

export function riskplan({ onInteract, standalone = false, requireBehavior = false } = {}) {
  const st = app.state;
  const cap = st.settings.riskCapPct ?? 1;
  const saved = (st.docs.riskplan && st.docs.riskplan.data) || {};
  const data = { balance: 10000, lossMeasure: null, sizing: false, noRaise: false, news: '', ...saved };
  let lastSaved = JSON.stringify(saved);
  const statusHost = h('div', { class: 'rp-status' });
  const checkHost = h('div', { class: 'card rp-checks' });
  const consHost = h('div', { class: 'card rp-cons' });
  const actions = h('div', { class: 'qactions' });
  const inputs = {};
  let timer = null;

  const save = () => {
    const json = JSON.stringify(data);
    if (json !== lastSaved) {
      emit('doc.save', { kind: 'riskplan', data: { ...data } });
      lastSaved = json;
    }
  };
  const changed = () => {
    draw();
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  };

  const fields = RISK_FIELDS.map((f) => {
    inputs[f.id] = numInput({ label: f.label, value: data[f.id] ?? null, prefix: f.prefix || '', suffix: f.suffix || '', hint: f.hint, max: 7, onChange: (v) => { data[f.id] = v === null ? undefined : v; changed(); } });
    return inputs[f.id].el;
  });

  const behaviorFields = BEHAVIOR_FIELDS.map((f) => {
    inputs[f.id] = numInput({ label: f.label, value: data[f.id] ?? null, prefix: '', suffix: f.suffix || '', hint: f.hint, max: 4, onChange: (v) => { data[f.id] = v === null ? undefined : v; changed(); } });
    return inputs[f.id].el;
  });
  const behavior = h('textarea', { class: 'written', rows: 4, 'aria-label': 'Behavior rules', placeholder: 'For the behaviors that catch you out: the signature you will watch for, and the if-then rule you follow.' });
  behavior.value = data.behavior || '';
  behavior.addEventListener('input', () => { data.behavior = behavior.value; changed(); });

  const measureChips = [['closed', 'Closed Trades Only'], ['open', 'Open Losses Too']].map(([v, label]) => {
    const b = h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: () => { data.lossMeasure = v; measureChips.forEach((x) => x.classList.toggle('sel', x.dataset.v === v)); changed(); } }, label);
    return b;
  });
  measureChips.forEach((b) => b.classList.toggle('sel', b.dataset.v === data.lossMeasure));
  const toggle = (key, text) => {
    const cb = h('input', { type: 'checkbox', checked: !!data[key], onchange: (e) => { data[key] = e.target.checked; changed(); } });
    return h('label', { class: 'rp-toggle' }, cb, h('span', null, text));
  };
  const news = h('textarea', { class: 'written', rows: 4, 'aria-label': 'News rule', placeholder: 'Which releases, how long before and after, what you do (stand aside, reduce or trade), and what happens to open trades.' });
  news.value = data.news || '';
  news.addEventListener('input', () => { data.news = news.value; changed(); });

  const draw = () => {
    const checks = checkRiskPlan(data, cap);
    const all = checks.filter((c) => !c.optional).every((c) => c.ok);
    const status = docStatus(app.state, 'riskplan');
    const d = app.state.docs.riskplan;
    statusHost.replaceChildren(...[
      chip(DOC_STATUS_LABEL[status], status === 'approved' ? 'emerald' : status === 'changes' ? 'gold' : status === 'submitted' ? 'sky' : 'gold'),
      d && d.review && d.review.comment && status === 'changes' ? h('div', { class: 'mentor-note' }, h('b', null, 'Your Mentor Says'), h('p', null, d.review.comment)) : null,
      status === 'approved' ? h('p', { class: 'hint-line' }, 'Your mentor approved this plan. Change it and it goes back to your mentor.') : null].filter(Boolean));
    checkHost.replaceChildren(h('div', { class: 'card-title' }, 'Does The Plan Hold Together?'), ...checks.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : c.optional ? '·' : '○'), h('span', null, c.text))));
    const cons = riskConsequences(data);
    consHost.replaceChildren(h('div', { class: 'card-title' }, 'What Your Plan Means'), cons
      ? h('div', null,
        h('p', { html: mdInline(`Each trade risks **${money(cons.perTrade)}** (${data.riskPct}% of ${money(data.balance)}).`) }),
        ...(cons.dailyLosses ? [h('p', { html: mdInline(`**${cons.dailyLosses}** full losses in a row reach your daily limit.`) })] : []),
        ...(cons.openTrades ? [h('p', { html: mdInline(`Your open-risk limit allows about **${cons.openTrades}** trades at full risk at once.`) })] : []),
        h('p', { html: mdInline(`After **5** losses in a row: ${money(cons.after5.equity)} (down ${pct1(cons.after5.drawdownPct)}). After **10**: ${money(cons.after10.equity)} (down ${pct1(cons.after10.drawdownPct)}), which needs a gain of **${pct1(cons.after10.recoveryPct)}** to get back.`) }),
        h('p', { class: 'hint-line' }, 'Ask yourself: could you keep following this plan through that? If not, the numbers are too big for you.'))
      : h('p', { class: 'hint-line' }, 'Set your account size and risk per trade to see what they mean.'));
    submit.disabled = !all || status === 'submitted';
    submit.textContent = status === 'submitted' ? 'Waiting For Your Mentor' : status === 'changes' || status === 'approved' ? 'Send Again To My Mentor' : 'Send To My Mentor';
    const behaviorOk = checks.find((c) => c.id === 'behavior').ok;
    if (all && (!requireBehavior || behaviorOk) && onInteract) onInteract();
  };

  const submit = button('Send To My Mentor', { onClick: () => { save(); emit('doc.submit', { kind: 'riskplan' }); draw(); } });
  actions.append(button('Save Draft', { variant: 'ghost', onClick: () => { save(); draw(); } }), submit);
  draw();

  const root = h('div', { class: 'lab riskplan' },
    h('p', { class: 'lab-intro' }, standalone ? 'Write your own limits. This course does not choose them for you.' : 'Write your own limits. The course shows you what each number means, but it does not choose them for you.'),
    statusHost,
    h('div', { class: 'pc-form' }, ...fields),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'How A Loss Limit Is Measured'), h('div', { class: 'choices' }, ...measureChips)),
    h('div', { class: 'card' }, toggle('sizing', 'I size every trade from my stop, and round lots down.'), toggle('noRaise', 'My risk never goes up after a loss or inside a drawdown.')),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'My News Rule'), news),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'My Behavior Rules'), h('p', { class: 'hint-line' }, 'Optional until Level 11. The rules that stop the habits you learn there.'), h('div', { class: 'pc-form' }, ...behaviorFields), behavior),
    consHost, checkHost, actions);
  // a hook for the test driver: fill the whole plan without typing into the keypad sheets
  root.__setPlan = (obj) => {
    Object.assign(data, obj);
    for (const f of RISK_FIELDS) if (obj[f.id] !== undefined) inputs[f.id].set(obj[f.id], { silent: true });
    news.value = data.news || '';
    behavior.value = data.behavior || '';
    for (const f of BEHAVIOR_FIELDS) if (obj[f.id] !== undefined) inputs[f.id].set(obj[f.id], { silent: true });
    root.querySelectorAll('input[type=checkbox]').forEach((cb, i) => { cb.checked = i === 0 ? !!data.sizing : !!data.noRaise; });
    measureChips.forEach((b) => b.classList.toggle('sel', b.dataset.v === data.lossMeasure));
    changed();
  };
  return root;
}
