/**
 * Mentor Mode: behind a PIN (a convenience lock to keep a curious student out of the answer keys, not
 * security). Review written answers, see the student record, change settings, override, and exchange
 * files with the student's device.
 */

import { app, emit } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount, rich } from '../ui/dom.js';
import { button, card, chip, toast, confirmSheet, screenTitle, bar } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { hashPin, deliverFile } from '../core/platform.js';
import { roman } from '../ui/roman.js';
import { masteryOf, statusOf, STATUS_LABEL } from '../learn/mastery.js';
import { weakAreas } from '../learn/weak.js';
import { makePackage, restoreControl } from './settings.js';
import { stimulusNode } from '../exercises/stimulus.js';
import { DOC_KINDS, docStatus, pendingDocs, DOC_STATUS_LABEL } from '../learn/docs.js';
import { RISK_FIELDS, BEHAVIOR_FIELDS, checkRiskPlan, riskConsequences } from '../interactives/riskplan.js';
import { STRATEGY_FIELDS, checkStrategy, vagueFlags } from '../learn/strategy.js';
import { assignTab } from './assignments.js';
import { methodTab } from './methodology.js';
import { PLATFORM_TASKS, checkPlatforms, PATH_FIELDS, checkPath } from '../learn/trackp.js';
import { chartStim } from '../exercises/stimulus.js';

let unlocked = false;
export const mentorUnlocked = () => unlocked;

export const lockMentor = () => (unlocked = false);

/* ------------------------------------------------------------------ the gate */

function gate(screen) {
  const st = app.state;
  const hasPin = !!st.settings.mentorPinHash;
  const pinIn = h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 8, class: 'pin-input', autocomplete: 'off', 'aria-label': hasPin ? 'Mentor PIN' : 'Choose a PIN', placeholder: hasPin ? 'PIN' : 'Choose 4 to 8 digits' });
  const confirmIn = hasPin ? null : h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 8, class: 'pin-input', autocomplete: 'off', 'aria-label': 'Repeat the PIN', placeholder: 'Repeat the PIN' });
  const msg = h('p', { class: 'hint-line', role: 'alert' });
  const submit = async () => {
    const pin = pinIn.value.trim();
    if (!/^\d{4,8}$/.test(pin)) return (msg.textContent = 'Use 4 to 8 digits.');
    if (hasPin) {
      if ((await hashPin(pin)) === st.settings.mentorPinHash) {
        unlocked = true;
        mentorHome();
      } else msg.textContent = 'That PIN is not right.';
    } else {
      if (pin !== confirmIn.value.trim()) return (msg.textContent = 'The two PINs do not match.');
      emit('settings.set', { key: 'mentorPinHash', value: await hashPin(pin) });
      unlocked = true;
      mentorHome();
    }
  };
  mount(screen,
    screenTitle('Mentor Mode', hasPin ? 'Enter your PIN.' : 'Choose a PIN to protect the answer keys.'),
    card({ class: 'pin-card' }, pinIn, confirmIn, msg, button(hasPin ? 'Unlock' : 'Set PIN And Unlock', { block: true, onClick: submit })),
    h('p', { class: 'hint-line center' }, 'The PIN keeps a curious student out of the answer keys. It is a convenience lock, not security. Anyone with the device could reset the app.'));
}

/* ------------------------------------------------------------------ home */

export function mentorView() {
  const screen = begin({ title: 'Mentor Mode', back: '#/settings' });
  if (!unlocked) return gate(screen);
  mentorHome();
}

function pendingWritten() {
  return Object.values(app.state.written).filter((w) => w.status === 'pending').sort((a, b) => a.at - b.at);
}

function mentorHome(tab = 'queue') {
  const screen = begin({ title: 'Mentor Mode', back: '#/settings' });
  const queue = pendingWritten();
  const approvals = pendingDocs(app.state);
  const tabs = h('div', { class: 'seg' }, ...[['queue', `Review (${queue.length + approvals.length})`], ['assign', 'Assign'], ['method', 'Method'], ['record', 'Student'], ['settings', 'Settings'], ['files', 'Files']].map(([id, label]) => h('button', { type: 'button', class: 'seg-btn' + (id === tab ? ' on' : ''), onclick: () => mentorHome(id) }, label)));
  const body = h('div', { class: 'seg-body' });
  ({ queue: queueTab, assign: assignTab, method: methodTab, record: recordTab, settings: settingsTab, files: filesTab })[tab](body);
  mount(screen, tabs, body, h('div', { class: 'qactions' }, button('Lock Mentor Mode', { variant: 'ghost', onClick: () => { lockMentor(); go('#/today'); } })));
}

/* ------------------------------------------------------------------ review queue */

function queueTab(body) {
  const queue = pendingWritten();
  const docs = pendingDocs(app.state).map((k) => h('a', { class: 'card review-item', href: `#/mentor/doc/${k}` }, h('div', null, h('b', null, DOC_KINDS[k].title), h('span', null, new Date(app.state.docs[k].submittedAt).toLocaleString()), h('em', null, 'Waiting for your approval')), chip('Review', 'gold')));
  if (!queue.length && !docs.length) return mount(body, card(h('p', null, 'Nothing is waiting for you.')), historyBlock());
  mount(body, ...docs, ...queue.map((w) => {
    const q = app.content.questions.get(w.questionId);
    return h('a', { class: 'card review-item', href: `#/mentor/review/${w.wid}` }, h('div', null, h('b', null, 'Level ' + roman(app.content.blueprints.get(blueprintOf(w))?.level ?? 1) + ' Written Answer'), h('span', null, new Date(w.at).toLocaleString()), h('em', null, q.prompt.slice(0, 90) + '…')), chip('Review', 'gold'));
  }), historyBlock());
}

const blueprintOf = (w) => {
  for (const [bpId, e] of Object.entries(app.state.exams)) if (e.attempts.some((a) => a.attemptId === w.ctx.ref)) return bpId;
  return null;
};

function historyBlock() {
  const done = Object.values(app.state.written).filter((w) => w.status !== 'pending').sort((a, b) => b.at - a.at).slice(0, 5);
  if (!done.length) return null;
  return h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Recently Reviewed'), ...done.map((w) => h('a', { class: 'lvl-row', href: `#/mentor/review/${w.wid}` }, h('span', null, new Date(w.reviewedAt || w.at).toLocaleDateString()), chip({ meets: 'Meets', partly: 'Partly There', notyet: 'Not Yet' }[w.status] || w.status, w.status === 'meets' ? 'emerald' : 'gold'), h('span', null, w.selfAssessed ? 'Self-assessed' : ''))));
}

export function mentorReviewView({ wid }) {
  const screen = begin({ title: 'Review', back: '#/mentor' });
  if (!unlocked) return gate(screen);
  const w = app.state.written[wid];
  if (!w) return mount(screen, card(h('p', null, 'That answer could not be found.')));
  const q = app.content.questions.get(w.questionId);
  const marks = w.marks ? { ...w.marks } : {};
  let verdict = ['meets', 'partly', 'notyet'].includes(w.status) ? w.status : null;
  const commentIn = h('textarea', { class: 'written', rows: 4, placeholder: 'A short comment for the student (optional).', 'aria-label': 'Comment' }, w.comment || '');
  const verdictBtns = [['meets', 'Meets'], ['partly', 'Partly There'], ['notyet', 'Not Yet']].map(([id, label]) => h('button', { type: 'button', class: 'opt small' + (verdict === id ? ' sel' : ''), 'data-v': id, onclick: () => { verdict = id; verdictBtns.forEach((b) => b.classList.toggle('sel', b.dataset.v === id)); save.disabled = false; } }, label));
  const save = button('Save Review', { onClick: () => {
    emit('mentor.review', { wid, verdict, marks, comment: commentIn.value.trim() });
    toast('Review saved');
    go('#/mentor');
  }, disabled: !verdict });

  const rubric = h('ul', { class: 'rubric-check' }, ...q.rubric.map((r) => h('li', null, h('label', null, h('input', { type: 'checkbox', checked: !!marks[r.id], onchange: (e) => (marks[r.id] = e.target.checked) }), h('span', null, r.text, r.required ? h('em', null, ' (required)') : null)))));

  mount(screen,
    h('div', { class: 'level-head' }, h('div', { class: 'eyebrow' }, 'Written Answer'), q.stimulus ? stimulusNode(q.stimulus) : null, rich(q.prompt, 'p', { class: 'q-prompt' })),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Student\'s Answer'), h('p', { class: 'student-text' }, w.text), w.selfAssessed ? chip('Self-assessed', 'sky') : null),
    h('details', { class: 'card' }, h('summary', null, 'Model Answer'), rich(q.modelAnswer, 'p')),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Rubric'), rubric, h('p', { class: 'hint-line' }, 'All required points must be met for "Meets". The rubric is a guide; the verdict is yours.')),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Verdict'), h('div', { class: 'choices' }, ...verdictBtns), commentIn),
    h('div', { class: 'qactions' }, save));
}

/* ------------------------------------------------------------------ student record */

function recordTab(body) {
  const st = app.state;
  const c = app.content;
  const now = Date.now();
  const weak = weakAreas(st, c, now);
  const concepts = Object.values(st.concepts).filter((cs) => cs.hist.length).map((cs) => ({ cs, meta: c.concepts.get(cs.concept), m: masteryOf(cs) })).sort((a, b) => a.m - b.m);
  const exams = Object.entries(st.exams).flatMap(([bp, e]) => e.attempts.map((a) => ({ bp, a }))).sort((x, y) => y.a.t - x.a.t);
  const reflections = Object.entries(st.reflections);
  mount(body,
    card(h('div', { class: 'card-title' }, st.profile.name || 'Student'), h('p', { class: 'hint-line' }, `${st.eventCount} recorded actions · ${st.study.days.length} study days · ${Object.keys(st.lessons).filter((id) => st.lessons[id].state === 'completed').length} lessons complete`)),
    exams.length ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Assessments'), ...exams.map(({ bp, a }) => h('div', { class: 'lvl-row static' }, h('span', null, new Date(a.t).toLocaleDateString()), h('span', null, Math.round(a.overall * 100) + '%'), chip(a.status, a.status === 'passed' ? 'emerald' : 'gold')))) : null,
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Weak Areas'), weak.length ? weak.map((w) => h('div', { class: 'weak-card' }, h('b', null, w.name), h('p', null, w.summary))) : h('p', { class: 'hint-line' }, 'None flagged.')),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Mastery By Topic'), concepts.length ? concepts.map((x) => h('div', { class: 'topic-row static' }, h('span', null, x.meta?.name || x.cs.concept), bar(x.m / 100), chip(STATUS_LABEL[statusOf(x.cs, x.m)], x.m >= 65 ? 'emerald' : 'gold'))) : h('p', { class: 'hint-line' }, 'No topics started.')),
    reflections.length ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Reflections'), ...reflections.map(([lid, r]) => h('div', { class: 'reflection' }, h('b', null, c.lessons.get(lid)?.title || lid), h('p', { class: 'student-text' }, r.text)))) : null);
}

/* ------------------------------------------------------------------ settings and overrides */

function settingsTab(body) {
  const st = app.state;
  const set = (key, value) => {
    emit('settings.set', { key, value });
    toast('Saved');
  };
  const toggle = (label, key, note) => h('label', { class: 'switch-row' }, h('span', null, h('b', null, label), note ? h('em', null, note) : null), h('input', { type: 'checkbox', checked: !!st.settings[key], onchange: (e) => set(key, e.target.checked), 'aria-label': label }));
  const grading = h('div', { class: 'choices' }, ...[['mentor', 'You Mark It'], ['self', 'Self-Assessed']].map(([v, label]) => h('button', { type: 'button', class: 'opt small' + (st.settings.writtenGrading === v ? ' sel' : ''), onclick: (e) => { set('writtenGrading', v); mentorHome('settings'); } }, label)));
  const risk = h('input', { type: 'text', inputmode: 'decimal', value: String(st.settings.riskCapPct), 'aria-label': 'Risk cap percent', onchange: (e) => { const v = parseFloat(e.target.value); if (v > 0 && v <= 10) set('riskCapPct', v); } });

  const levelSel = h('select', { 'aria-label': 'Level to pass' }, ...app.content.levels.filter((l) => l.number >= 1 && !l.planned).map((l) => h('option', { value: l.number }, `Level ${roman(l.number)} · ${l.title}`)));
  const reason = h('input', { type: 'text', placeholder: 'Reason (required)', 'aria-label': 'Reason' });
  const overrides = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Overrides'),
    h('p', { class: 'hint-line' }, 'Every override is logged with your reason.'),
    levelSel, reason,
    button('Mark Level As Passed', { variant: 'ghost', onClick: async () => {
      if (!reason.value.trim()) return toast('Write a reason first.');
      const yes = await confirmSheet({ title: 'Pass This Level?', body: 'This unlocks the next level without an assessment. It will be logged.', confirm: 'Pass It' });
      if (yes) {
        emit('mentor.override', { type: 'pass-level', target: +levelSel.value, reason: reason.value.trim() });
        toast('Logged');
        mentorHome('settings');
      }
    } }),
    ...st.overrides.slice(-5).reverse().map((o) => h('p', { class: 'hint-line' }, `${new Date(o.t).toLocaleDateString()} · ${o.type} · ${o.target}: ${o.reason}`)));

  mount(body,
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Written Answers'), grading, h('p', { class: 'hint-line' }, 'You Mark It is the default: a level with a written answer opens only after you mark it "Meets". Self-Assessed lets the student pass on their own marking. It is always flagged.')),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Rules'),
      toggle('Warm-Up Before New Lessons', 'reviewDebtGate', 'When many reviews are overdue, new lessons wait.'),
      toggle('Free Lesson Order', 'freeOrder', 'Lessons in a level can be done in any order.'),
      toggle('Test-Out', 'testOut', 'Lets a level assessment be taken without the lessons. The assessment stays the judge.'),
      h('label', { class: 'field' }, h('span', null, 'Risk Cap Per Trade (Percent)'), risk), h('p', { class: 'hint-line' }, 'Used from Level 10. Default 1%. Editable.')),
    overrides);
}

/* ------------------------------------------------------------------ files */

function filesTab(body) {
  mount(body,
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Exchange Files'),
      h('p', null, 'The student\'s progress and your reviews travel as small files, by AirDrop, Messages, Files or email. Importing the same file twice changes nothing.'),
      h('div', { class: 'qactions col' },
        button('Export Everything', { onClick: async () => { await deliverFile(`hls-academy-${new Date().toISOString().slice(0, 10)}.json`, await makePackage('all')); } }),
        button('Export My Reviews Only', { variant: 'ghost', onClick: async () => { await deliverFile(`hls-academy-mentor-reviews-${new Date().toISOString().slice(0, 10)}.json`, await makePackage('mentor')); } }),
        restoreControl('Import A File'))));
}


/* ------------------------------------------------------------------ approving a document */

/** The five charts of the Two-Person Test. Fixed seeds, so the student and the mentor always see the same five. */
const TEST_KIT = [
  { recipe: 'trend-up', seed: 4101 },
  { recipe: 'range', seed: 4102 },
  { recipe: 'trend-down', seed: 4103 },
  { recipe: 'broadening', seed: 4104 },
  { recipe: 'quiet-expand', seed: 4105 }
];

const DOC_ROWS = {
  platforms: (d) => PLATFORM_TASKS.flatMap((t) => [[`${t.lesson} · ${t.label}`, t.fields.map(([id, label]) => `${label}: ${((d.tasks || {})[t.id] || {})[id] ?? '—'}`).join('\n')]]),
  pathlive: (d) => [...PATH_FIELDS.map((f) => [f.label, d[f.id] || 'Not written']), ['Understands It Is Not A Strategy', d.ack ? 'Yes' : 'No']],
  strategy: (d) => [
    ...STRATEGY_FIELDS.map((f) => [`${f.n}. ${f.label}`, d[f.id] || 'Not written']),
    ['Expectations Before Testing', d.hypothesis || 'Not written (optional now)']
  ],
  riskplan: (d) => [
    ...RISK_FIELDS.map((f) => [f.label, typeof d[f.id] === 'number' ? (f.prefix || '') + d[f.id].toLocaleString('en-US') + (f.suffix || '') : 'Not set']),
    ['Loss Limit Measured On', d.lossMeasure === 'closed' ? 'Closed trades only' : d.lossMeasure === 'open' ? 'Open losses too' : 'Not set'],
    ['Sizes From The Stop, Rounds Down', d.sizing ? 'Yes' : 'No'],
    ['Risk Never Rises After A Loss', d.noRaise ? 'Yes' : 'No'],
    ['News Rule', d.news || 'Not written'],
    ...BEHAVIOR_FIELDS.map((f) => [f.label, typeof d[f.id] === 'number' ? d[f.id] + (f.suffix || '') : 'Not set (optional)']),
    ['Behavior Rules', d.behavior || 'Not written (optional)']
  ]
};

export function mentorDocView({ kind }) {
  const screen = begin({ title: DOC_KINDS[kind] ? DOC_KINDS[kind].title : 'Document', back: '#/mentor' });
  if (!unlocked) return gate(screen);
  const def = DOC_KINDS[kind];
  const doc = app.state.docs[kind];
  if (!def || !doc) return mount(screen, card(h('p', null, 'That document could not be found.')));
  const d = doc.data;
  const rows = (DOC_ROWS[kind] || (() => [['Content', JSON.stringify(d)]]))(d);
  const checks = kind === 'riskplan' ? checkRiskPlan(d, app.state.settings.riskCapPct ?? 1) : kind === 'strategy' ? checkStrategy(d) : kind === 'platforms' ? checkPlatforms(d).map((c) => ({ ok: c.ok, text: c.label + (c.ok ? '' : ': ' + c.issues[0]) })) : kind === 'pathlive' ? checkPath(d) : [];
  const flags = kind === 'strategy' ? vagueFlags(d) : [];
  const kitBoxes = kind === 'strategy' ? TEST_KIT.map((_, i) => h('input', { type: 'checkbox', 'aria-label': `Chart ${i + 1} decided`, onchange: () => { approveBtn.disabled = !kitBoxes.every((b) => b.checked); } })) : [];
  const cons = kind === 'riskplan' ? riskConsequences(d) : null;
  const status = docStatus(app.state, kind);
  const commentIn = h('textarea', { class: 'written', rows: 4, 'aria-label': 'Comment', placeholder: 'A short comment for the student. Required if you ask for changes.' });
  const approveBtn = button('Approve', { onClick: () => finish('approved') });
  if (kind === 'strategy') approveBtn.disabled = true;
  const finish = (verdict) => {
    if (verdict === 'changes' && !commentIn.value.trim()) return toast('Write what needs to change.');
    emit('mentor.doc-review', { kind, verdict, comment: commentIn.value.trim() });
    if (verdict === 'approved' && kind === 'strategy' && !kitBoxes.every((b) => b.checked)) return toast('Tick all five charts first.');
    if (verdict === 'approved') emit('practical.done', { id: def.practical, by: 'mentor', note: def.title + ' approved' });
    toast(verdict === 'approved' ? 'Approved' : 'Sent back');
    go('#/mentor');
  };
  mount(screen,
    h('div', { class: 'level-head' }, h('div', { class: 'eyebrow' }, def.title), h('h1', null, app.state.profile.name || 'Student'), chip(DOC_STATUS_LABEL[status], status === 'approved' ? 'emerald' : 'gold')),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'What Was Written'), ...rows.map(([k, v]) => h('div', { class: 'part-score' }, h('span', null, k), h('b', null, String(v))))),
    checks.length ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The App\'s Consistency Checks'), ...checks.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.text)))) : null,
    cons ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'What The Numbers Mean'), h('p', null, `Each trade risks $${Math.round(cons.perTrade).toLocaleString('en-US')}. ${cons.dailyLosses} full losses reach the daily limit. After 10 losses in a row the account is down ${cons.after10.drawdownPct.toFixed(1)}%, which needs a gain of ${cons.after10.recoveryPct.toFixed(1)}% to recover.`), h('p', { class: 'hint-line' }, 'You approve the plan as a plan a student could follow. The course does not choose the numbers.')) : null,
    flags.length ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Vague Words Found'), ...flags.map((f) => h('p', null, `${f.label}: ${f.found.join(', ')}`))) : null,
    kind === 'strategy' ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Two-Person Test'),
      h('p', null, 'Apply the written rules to each of the five charts below. For each, decide: trade (and where) or no trade. Tick a chart only if you reached a decision without having to ask the student what a rule meant.'),
      ...TEST_KIT.map((k, i) => h('div', { class: 'kit-chart' }, h('label', { class: 'rp-toggle' }, kitBoxes[i], h('span', null, `Chart ${i + 1}: I reached a decision from the rules alone.`)), chartStim({ ...k, marks: 'none', caption: `Chart ${i + 1} of 5. Synthetic.` })))) : null,
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Your Decision'), commentIn),
    h('div', { class: 'qactions' }, approveBtn, button('Ask For Changes', { variant: 'ghost', onClick: () => finish('changes') })));
}
