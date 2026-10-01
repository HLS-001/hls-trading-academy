/**
 * Module M2 and the Capstone: the mentor sets an assignment ("Analyze This Market" on hidden-future charts), the student answers
 * chart by chart, the app grades what it can exactly, and the mentor reviews the rest. Passing the Capstone promotes to Apprentice.
 */

import { app, emit } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { button, card, chip, screenTitle, toast } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { candlesSvg } from '../ui/minichart.js';
import { px, windows } from '../sim/backtest.js';
import { makeAssignment, gradeChart, capstoneMarks, STRUCTURES, REGIMES, CAPSTONE_COUNT } from '../learn/assignment.js';
import { outcomeOf } from '../learn/planexercise.js';
import { mentorUnlocked } from './mentor.js';

const cap = () => app.state.settings.riskCapPct ?? 1;
const items = (a) => makeAssignment({ seed: a.seed, count: a.count, noSetupShare: a.noSetupShare });
const pctOf = (x) => Math.round(x * 100) + '%';
const R2 = (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'R');
const field = (label, control, hint) => h('label', { class: 'jf' }, h('span', { class: 'jf-l' }, label), control, hint ? h('em', null, hint) : null);
const tin = (placeholder) => h('input', { type: 'text', inputmode: 'decimal', class: 'jf-in', placeholder: placeholder || '' });

export const capstoneOpen = (st) => !!st.settings.testOut || (Array.from({ length: 13 }, (_, i) => i + 1).every((n) => st.levelsPassed[n]) && !!(st.exams['bp-trackp-final'] && st.exams['bp-trackp-final'].passed));
export const assignmentStatus = (a) => (a.finalizedAt ? (a.result && a.result.pass ? 'passed' : 'reviewed') : Object.keys(a.answers).length >= a.count ? 'with-mentor' : Object.keys(a.answers).length ? 'in-progress' : 'new');
const STATUS_LABEL = { new: 'Not Started', 'in-progress': 'In Progress', 'with-mentor': 'With Your Mentor', reviewed: 'Reviewed', passed: 'Passed' };

/* ---------------------------------------------------------------------------------- the student's run */

export function assignmentView({ id }) {
  const screen = begin({ title: 'Assignment', back: '#/practice', tab: 'practice' });
  const a = app.state.assignments[id];
  if (!a) return mount(screen, card({}, h('p', null, 'That assignment could not be found.')));
  const its = items(a);
  const host = h('div', { class: 'lab assignment' });
  mount(screen, screenTitle(a.kind === 'capstone' ? 'The Capstone' : 'Assignment', 'Analyze each market. The future is shown only after you submit.'), host);
  const nextIdx = () => { for (let i = 0; i < its.length; i++) if (!app.state.assignments[id].answers[i]) return i; return its.length; };

  const summary = () => {
    const cur = app.state.assignments[id];
    const s = assignmentStatus(cur);
    host.replaceChildren(card({}, h('div', { class: 'card-title' }, 'All Charts Submitted'), chip(STATUS_LABEL[s], s === 'passed' ? 'emerald' : 'gold'),
      h('p', null, cur.finalizedAt ? (cur.result && cur.result.pass ? 'Your mentor passed this assignment.' : 'Your mentor has reviewed this assignment.') : 'Your mentor will review your answers, chart by chart.'),
      cur.result && cur.result.note ? h('div', { class: 'mentor-note' }, h('b', null, 'Your Mentor Says'), h('p', null, cur.result.note)) : null,
      h('div', { class: 'qactions' }, button('Back To Practice', { onClick: () => go('#/practice') }))));
  };

  const chart = (i) => {
    const item = its[i];
    const ans = {};
    let locked = false;
    const chartHost = h('div');
    const drawChart = (upto, lines = []) => chartHost.replaceChildren(candlesSvg({ bars: item.bars, from: item.showFrom, upto, lines, fmt: (v) => px(v), label: 'Synthetic price bars. The future is hidden.' }));
    drawChart(item.cut);
    const chips = (key, list, after) => h('div', { class: 'choices wrap' }, ...list.map(([v, l]) => h('button', { type: 'button', class: 'opt small', 'data-k': key, 'data-v': v, onclick: (e) => { if (locked) return; ans[key] = v; e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); if (after) after(); } }, l)));
    const num = (key) => { const inp = tin(); inp.addEventListener('input', () => { const v = parseFloat(inp.value.replace(',', '.')); if (Number.isNaN(v)) delete ans[key]; else ans[key] = v; }); inp.dataset.key = key; return inp; };
    const area = (key, ph) => { const ta = h('textarea', { class: 'written', rows: 3, placeholder: ph || '', 'aria-label': key }); ta.addEventListener('input', () => { ans[key] = ta.value; }); return ta; };
    const branch = h('div', { class: 'hf-plan' });
    const drawBranch = () => {
      if (ans.call === 'setup') {
        branch.replaceChildren(
          field('Order Type', chips('orderType', [['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']])),
          field('Entry Price', num('entry')), field('Stop Price', num('stop')), field('Target Price', num('target')),
          field('R, From Your Own Entry, Stop And Target', num('r')),
          h('div', { class: 'card-title' }, `Risk: ${cap()}% Of $10,000. One pip of one lot is $10.`),
          field('Stop Distance In Pips', num('pips')), field('Lots (Rounded Down)', num('lots')), field('Money At Risk ($)', num('money')), field('Percent Of The Account', num('pct')));
      } else if (ans.call === 'none') branch.replaceChildren(field('Why Is There No Setup?', area('why', 'Say which condition of the rule is not met.')));
      else branch.replaceChildren();
    };
    const result = h('div');
    const submit = button('Submit This Chart', { onClick: () => {
      if (locked) return;
      const need = ans.structure && ans.regime && ans.call && (ans.regimeNote || '').trim().length >= 10;
      const plan = ans.call === 'setup' ? [ans.orderType, ans.entry, ans.stop, ans.target, ans.r, ans.pips, ans.lots, ans.money, ans.pct].every((x) => x !== undefined) : ans.call === 'none' ? (ans.why || '').trim().length >= 30 : false;
      if (!need || !plan) return toast('Answer every question for this chart. A no-setup call needs a written reason.');
      locked = true;
      emit('assignment.answer', { id, idx: i, answers: { ...ans } });
      const g = gradeChart(item, ans, { capPct: cap() });
      const out = outcomeOf(item, { call: ans.call, stop: ans.stop, rr: Number.isFinite(ans.r) && ans.r > 0 ? ans.r : undefined });
      result.replaceChildren(
        card({}, h('div', { class: 'card-title' }, `Process First: Analysis ${pctOf(g.analysis)}`), ...g.comps.filter((c) => c.score !== null).map((c) => h('div', { class: 'rp-check ' + (c.score >= 1 ? 'ok' : 'todo') }, h('span', null, c.score >= 1 ? '✓' : '○'), h('span', null, `${c.label}: ${c.note}`)))),
        button('Reveal The Future', { onClick: () => {
          const lines = out.mine && out.mine.filled ? [{ y: out.mine.stop ?? ans.stop, label: 'Your Stop', color: '#FF5C8A' }, { y: out.mine.target, label: 'Your Target', color: '#2DD4BF' }] : [];
          drawChart(out.shownTo, lines);
          result.append(card({}, h('div', { class: 'card-title' }, 'The Outcome'), h('p', null, out.mine && out.mine.filled ? `Your plan: ${R2(out.mine.r)}. One trade says almost nothing about the plan.` : ans.call === 'none' ? (item.hasSetup ? `You planned no trade. The rule's trade would have made ${R2(item.ev.r)}.` : 'You planned no trade, and the rule gave none.') : 'Your plan could not be simulated.'), i + 1 < its.length ? button('Next Chart', { onClick: () => next() }) : button('Finish', { onClick: () => summary() })));
        } }));
      submit.disabled = true;
    } });
    host.replaceChildren(
      h('div', { class: 'rp-status' }, chip(`Chart ${i + 1} Of ${its.length}`, 'sky')),
      h('p', { class: 'lab-intro' }, 'The rule: a setup is a bar that closes above the highest high of the 4 bars before it. Entry at the next open. Stop one pip below the lowest low of the last 3 bars. Fixed 2R target. Answer in order.'),
      chartHost,
      card({}, h('div', { class: 'card-title' }, '1. What Is The Current Structure?'), chips('structure', STRUCTURES)),
      card({}, h('div', { class: 'card-title' }, '2. Where Are The Latest Swing High And Low?'), field('Bar Number Of The Latest Confirmed Swing High', num('high'), 'Bar numbers are on the chart axis.'), field('Bar Number Of The Latest Confirmed Swing Low', num('low'))),
      card({}, h('div', { class: 'card-title' }, '3. Trending Or Ranging?'), chips('regime', REGIMES), area('regimeNote', 'One sentence that fits your answer to 1.')),
      card({}, h('div', { class: 'card-title' }, '4. What Would Invalidate Your Idea?'), field('Level', num('invalid'), 'The price where the idea is wrong. Leave it blank if there is no setup.')),
      card({}, h('div', { class: 'card-title' }, '5. Is There Actually A Setup?'), chips('call', [['setup', 'Yes'], ['none', 'No']], drawBranch), branch),
      h('div', { class: 'qactions' }, submit), result);
    drawBranch();
    host.__ans = ans;
    host.__submit = () => submit.click();
  };
  const next = () => { const i = nextIdx(); if (i >= its.length) summary(); else chart(i); };
  next();
  host.__items = its;
  host.__fill = (i, answers) => {
    // a test driver: answer the chart in the open form without typing
    Object.assign(host.__ans, answers);
  };
  return host;
}

/* ---------------------------------------------------------------------------------- the mentor sets one */

export function assignTab(body) {
  const st = app.state;
  let count = 6;
  let mode = 'sitting';
  const chips = (list, cur, set) => h('div', { class: 'choices wrap' }, ...list.map(([v, l]) => h('button', { type: 'button', class: 'opt small' + (cur === v ? ' sel' : ''), onclick: (e) => { set(v); e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, l)));
  const newId = () => 'as' + Date.now().toString(36);
  const create = (kind) => {
    const id = newId();
    emit('assignment.create', { id, kind, seed: Date.now() % 90000 + 1, count: kind === 'capstone' ? CAPSTONE_COUNT : count, mode, noSetupShare: null });
    toast(kind === 'capstone' ? 'The Capstone is set' : 'Assignment set');
    assignTab(body);
  };
  const list = Object.values(st.assignments).sort((a, b) => b.createdAt - a.createdAt);
  mount(body,
    card({}, h('div', { class: 'card-title' }, 'New Assignment'), h('p', { class: 'hint-line' }, 'Charts are synthetic, with the Training Rule Pack as the Rule Pack. The share of no-setup charts is a genuine mix, hidden from the student. There is no time limit.'),
      h('div', { class: 'jf-l' }, 'Charts'), chips([[6, '6'], [12, '12']], count, (v) => { count = v; }),
      h('div', { class: 'jf-l' }, 'Mode'), chips([['sitting', 'Sitting'], ['take-home', 'Take-Home']], mode, (v) => { mode = v; }),
      h('div', { class: 'qactions' }, button('Set The Assignment', { onClick: () => create('general') }))),
    card({}, h('div', { class: 'card-title' }, 'The Capstone'), h('p', null, `Twelve charts. Passing it, with Track P, promotes to Apprentice. It opens when Levels 1 to 13 and Track P are passed. ${capstoneOpen(st) ? '' : 'Not open yet.'}`),
      h('div', { class: 'qactions' }, button('Set The Capstone', { disabled: !capstoneOpen(st) || list.some((a) => a.kind === 'capstone' && !a.finalizedAt), onClick: () => create('capstone') }))),
    ...list.map((a) => h('a', { class: 'card review-item', href: `#/mentor/assignment/${a.id}` }, h('div', null, h('b', null, a.kind === 'capstone' ? 'The Capstone' : `Assignment · ${a.count} Charts`), h('span', null, new Date(a.createdAt).toLocaleString()), h('em', null, `${Object.keys(a.answers).length} of ${a.count} answered · ${a.mode}`)), chip(STATUS_LABEL[assignmentStatus(a)], assignmentStatus(a) === 'passed' ? 'emerald' : 'gold'))));
}

/* ---------------------------------------------------------------------------------- the mentor reviews it */

export function mentorAssignmentView({ id }) {
  const screen = begin({ title: 'Review', back: '#/mentor' });
  if (!mentorUnlocked()) return mount(screen, card({}, h('p', null, 'Open Mentor Mode first.'), button('Mentor Mode', { onClick: () => go('#/mentor') })));
  const a = app.state.assignments[id];
  if (!a) return mount(screen, card({}, h('p', null, 'That assignment could not be found.')));
  const its = items(a);
  const marks = capstoneMarks(its, a.answers, a.reviews, { capPct: cap() });
  const w = windows();
  const head = h('div', { class: 'level-head' }, h('div', { class: 'eyebrow' }, a.kind === 'capstone' ? 'The Capstone' : 'Assignment'), h('h1', null, app.state.profile.name || 'Student'), chip(STATUS_LABEL[assignmentStatus(a)], assignmentStatus(a) === 'passed' ? 'emerald' : 'gold'));
  const cards = its.map((it, i) => {
    const ans = a.answers[i];
    if (!ans) return card({}, h('div', { class: 'card-title' }, `Chart ${i + 1}`), h('p', { class: 'hint-line' }, 'Not answered yet.'));
    const g = marks.results[i];
    const rev = a.reviews[i] || {};
    const accepted = new Set(rev.accepted || []);
    let reasoning = rev.reasoning || null;
    const comment = h('textarea', { class: 'written', rows: 2, placeholder: 'A comment for the student (optional).', 'aria-label': 'Comment' });
    comment.value = rev.comment || '';
    const out = outcomeOf(it, { call: ans.call, stop: ans.stop, rr: ans.r });
    const reasoningChips = h('div', { class: 'choices wrap' }, ...[['meets', 'Meets'], ['partly', 'Partly There'], ['notyet', 'Not Yet']].map(([v, l]) => h('button', { type: 'button', class: 'opt small' + (reasoning === v ? ' sel' : ''), 'data-v': v, onclick: (e) => { reasoning = v; e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, l)));
    const accepts = g.comps.filter((c) => c.group === 'analysis' && c.score !== null && c.score < 1 && !accepted.has(c.id));
    const save = () => { emit('assignment.review', { id, idx: i, reasoning, accepted: [...accepted], comment: comment.value.trim() }); toast('Saved'); mentorAssignmentView({ id }); };
    return card({}, h('div', { class: 'card-title' }, `Chart ${i + 1}: ${it.hasSetup ? 'The Rule Gives A Setup' : 'The Rule Gives No Setup'}`),
      candlesSvg({ bars: it.bars, from: it.showFrom, upto: out.shownTo, fmt: (v) => px(v), label: `Chart ${i + 1} with the future shown` }),
      h('p', { class: 'hint-line' }, `Student: ${ans.structure}, ${ans.regime}, call ${ans.call}. Reference: ${it.ref.structure}.`),
      ...g.comps.filter((c) => c.score !== null).map((c) => h('div', { class: 'rp-check ' + (c.score >= 1 || accepted.has(c.id) ? 'ok' : 'todo') }, h('span', null, c.score >= 1 || accepted.has(c.id) ? '✓' : '○'), h('span', null, `${c.label}${c.group === 'arithmetic' ? ' (exact)' : ''}: ${c.note}`))),
      ans.regimeNote ? h('p', null, `Regime note: "${ans.regimeNote}"`) : null, ans.why ? h('p', null, `Why no setup: "${ans.why}"`) : null,
      ...(accepts.length ? [h('div', { class: 'hint-line' }, 'Accept His Alternative For:'), h('div', { class: 'choices wrap' }, ...accepts.map((c) => h('button', { type: 'button', class: 'opt small', onclick: () => { accepted.add(c.id); save(); } }, c.label)))] : []),
      h('div', { class: 'jf-l' }, 'Written Reasoning'), reasoningChips, comment, button('Save This Chart', { variant: 'ghost', onClick: save }));
  });
  const finalize = (pass) => {
    emit('assignment.finalize', { id, pass, note: noteIn.value.trim() });
    if (pass && a.kind === 'capstone') emit('mentor.override', { type: 'pass-check', target: 'bp-capstone', reason: 'Capstone passed on the mentor\'s marking' });
    toast(pass ? 'Passed' : 'Saved');
    go('#/mentor');
  };
  const noteIn = h('textarea', { class: 'written', rows: 3, placeholder: 'A note for the student.', 'aria-label': 'Note' });
  const markCard = a.kind === 'capstone' ? card({}, h('div', { class: 'card-title' }, 'Capstone Marking'), ...marks.checks.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.text))), h('p', { class: 'hint-line' }, 'The marking is an editable proposal. You decide.')) : null;
  mount(screen, head, markCard, ...cards, card({}, h('div', { class: 'card-title' }, 'Your Decision'), noteIn,
    h('div', { class: 'qactions' }, ...(a.kind === 'capstone' ? [button('Pass The Capstone', { disabled: !marks.pass || !!a.finalizedAt, onClick: () => finalize(true) }), button('Not Yet', { variant: 'ghost', disabled: !!a.finalizedAt, onClick: () => finalize(false) })] : [button('Mark Reviewed', { disabled: !!a.finalizedAt, onClick: () => finalize(false) })]))));
}
