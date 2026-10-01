/**
 * Track P worksheets as widgets: the Platform Task Checklist, the Broker Worksheet and the Path-To-Live Plan.
 * The course names no broker and recommends none. Nothing here is pre-filled.
 */

import { app, emit } from '../core/app.js';
import { h } from '../ui/dom.js';
import { button, chip } from '../ui/kit.js';
import { docStatus, DOC_STATUS_LABEL } from '../learn/docs.js';
import { PLATFORM_TASKS, checkTask, checkPlatforms, platformsReady, BROKER_CRITERIA, checkBroker, cellOk, PATH_FIELDS, checkPath, pathReady } from '../learn/trackp.js';

const statusChip = (status) => chip(DOC_STATUS_LABEL[status], status === 'approved' ? 'emerald' : status === 'submitted' ? 'sky' : 'gold');
const inp = (value, placeholder, numeric) => {
  const i = h('input', { type: 'text', inputmode: numeric ? 'decimal' : 'text', class: 'jf-in', placeholder: placeholder || '' });
  i.value = value === undefined || value === null ? '' : String(value);
  return i;
};
const field = (label, control, hint) => h('label', { class: 'jf' }, h('span', { class: 'jf-l' }, label), control, hint ? h('em', null, hint) : null);
const makeSaver = (kind, data, getData) => {
  let last = JSON.stringify(data);
  let timer = null;
  const save = () => {
    const json = JSON.stringify(getData());
    if (json !== last) {
      emit('doc.save', { kind, data: JSON.parse(json) });
      last = json;
    }
  };
  return { save, soon: () => { clearTimeout(timer); timer = setTimeout(save, 700); } };
};

/* ---------------------------------------------------------------------- Platform Task Checklist */

export function platformchecklist({ onInteract } = {}) {
  const saved = (app.state.docs.platforms && app.state.docs.platforms.data) || {};
  const data = { tasks: { ...(saved.tasks || {}) }, note: saved.note || '' };
  const saver = makeSaver('platforms', saved, () => data);
  const statusHost = h('div', { class: 'rp-status' });
  const taskHosts = {};
  const actions = h('div', { class: 'qactions' });
  const boxes = {};

  const drawTask = (t) => {
    const c = checkTask(t, data.tasks[t.id] || {});
    taskHosts[t.id].replaceChildren(h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.ok ? 'Done.' : c.issues[0] || '')));
  };
  const draw = () => {
    const all = checkPlatforms(data);
    const ready = all.every((c) => c.ok);
    const status = docStatus(app.state, 'platforms');
    statusHost.replaceChildren(statusChip(status), h('span', { class: 'hint-line' }, `${all.filter((c) => c.ok).length} of ${all.length} tasks complete.`));
    submit.disabled = !ready || status === 'submitted' || status === 'approved';
    submit.textContent = status === 'submitted' ? 'Waiting For Your Mentor' : status === 'approved' ? 'Verified' : 'Send To My Mentor';
    for (const t of PLATFORM_TASKS) drawTask(t);
    if (ready && onInteract) onInteract();
  };
  const cards = PLATFORM_TASKS.map((t) => {
    const fields = t.fields.map(([id, label, type]) => {
      const i = inp((data.tasks[t.id] || {})[id], '', type === 'number');
      boxes[t.id + '.' + id] = i;
      i.addEventListener('input', () => {
        const cur = (data.tasks[t.id] = data.tasks[t.id] || {});
        if (type === 'number') { const v = parseFloat(i.value.replace(',', '.')); if (i.value.trim() === '' || Number.isNaN(v)) delete cur[id]; else cur[id] = v; } else cur[id] = i.value;
        draw();
        saver.soon();
      });
      return field(label, i);
    });
    taskHosts[t.id] = h('div');
    return h('div', { class: 'card' }, h('div', { class: 'card-title' }, `${t.lesson} · ${t.label}`), h('p', { class: 'hint-line' }, t.must), ...fields, taskHosts[t.id]);
  });
  const submit = button('Send To My Mentor', { onClick: () => { saver.save(); emit('doc.submit', { kind: 'platforms' }); draw(); } });
  actions.append(button('Save Draft', { variant: 'ghost', onClick: () => { saver.save(); draw(); } }), submit);
  const root = h('div', { class: 'lab platformchecklist' },
    h('p', { class: 'lab-intro' }, 'Do each task on YOUR OWN demo account, then write what you saw. Your mentor looks at your demo account with you before approving. Screenshots are not stored in this app, so keep them on your device to show.'),
    statusHost, ...cards, actions);
  root.__fill = (tasks) => {
    for (const [tid, vals] of Object.entries(tasks)) {
      data.tasks[tid] = { ...vals };
      for (const [id, v] of Object.entries(vals)) if (boxes[tid + '.' + id]) boxes[tid + '.' + id].value = String(v);
    }
    saver.save();
    draw();
  };
  draw();
  return root;
}

/* ---------------------------------------------------------------------- Broker Worksheet */

export function brokerworksheet({ onInteract } = {}) {
  const saved = (app.state.docs.brokerws && app.state.docs.brokerws.data) || {};
  const data = { brokers: saved.brokers ? [...saved.brokers] : ['', ''], cells: JSON.parse(JSON.stringify(saved.cells || {})) };
  const saver = makeSaver('brokerws', saved, () => data);
  const checkHost = h('div', { class: 'card rp-checks' });
  const cellHosts = {};
  const draw = () => {
    const r = checkBroker(data);
    checkHost.replaceChildren(h('div', { class: 'card-title' }, 'Is The Worksheet Complete?'), ...r.checks.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.text))));
    for (const k of Object.keys(cellHosts)) {
      const [cid, b] = k.split('.');
      cellHosts[k].classList.toggle('done', cellOk((data.cells[cid] || [])[+b]));
    }
    if (r.done && onInteract) onInteract();
  };
  const names = [0, 1].map((b) => {
    const i = inp(data.brokers[b], `Provider ${b + 1}, named by you`);
    i.setAttribute('aria-label', `Provider ${b + 1} name`);
    i.addEventListener('input', () => { data.brokers[b] = i.value; draw(); saver.soon(); });
    return field(`Provider ${b + 1}`, i);
  });
  const boxes = {};
  const crit = BROKER_CRITERIA.map(([cid, label, hint]) => {
    const cols = [0, 1].map((b) => {
      const cell = ((data.cells[cid] = data.cells[cid] || [{}, {}])[b] = data.cells[cid][b] || {});
      const value = inp(cell.value, 'What you found');
      const source = inp(cell.source, 'Where you found it');
      value.setAttribute('aria-label', `${label}, provider ${b + 1}: what you found`);
      source.setAttribute('aria-label', `${label}, provider ${b + 1}: where you found it`);
      const status = h('div', { class: 'choices wrap' }, ...[['verified', 'Verified'], ['unverified', 'Unverified']].map(([v, l]) => h('button', { type: 'button', class: 'opt small' + (cell.status === v ? ' sel' : ''), 'data-v': v, onclick: (e) => { cell.status = v; status.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); draw(); saver.soon(); } }, l)));
      value.addEventListener('input', () => { cell.value = value.value; draw(); saver.soon(); });
      source.addEventListener('input', () => { cell.source = source.value; draw(); saver.soon(); });
      boxes[cid + '.' + b] = { value, source, status, cell };
      const box = h('div', { class: 'ws-cell' }, h('div', { class: 'jf-l' }, `Provider ${b + 1}`), value, source, status);
      cellHosts[cid + '.' + b] = box;
      return box;
    });
    return h('div', { class: 'card' }, h('div', { class: 'card-title' }, label), h('p', { class: 'hint-line' }, hint), ...cols);
  });
  const root = h('div', { class: 'lab brokerworksheet' },
    h('p', { class: 'lab-intro' }, 'A blank grid. You name two providers and fill every cell from a source you can point to. Mark a cell Verified only when you checked it at the source. Unverified is a fine answer. No provider is recommended here.'),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'The Providers You Are Comparing'), ...names),
    ...crit, checkHost,
    h('div', { class: 'qactions' }, button('Save', { onClick: () => { saver.save(); draw(); } })));
  root.__fill = () => {
    data.brokers = ['Provider One', 'Provider Two'];
    for (const [cid] of BROKER_CRITERIA) for (const b of [0, 1]) {
      Object.assign(data.cells[cid][b], { value: 'Noted from my own demo', source: b === 0 ? 'my demo account, measured today' : 'the provider\'s published fee page', status: b === 0 ? 'verified' : 'unverified' });
    }
    saver.save();
    draw();
  };
  draw();
  return root;
}

/* ---------------------------------------------------------------------- Path-To-Live Plan */

export function pathlive({ onInteract } = {}) {
  const saved = (app.state.docs.pathlive && app.state.docs.pathlive.data) || {};
  const data = { ...saved };
  const saver = makeSaver('pathlive', saved, () => data);
  const statusHost = h('div', { class: 'rp-status' });
  const checkHost = h('div', { class: 'card rp-checks' });
  const actions = h('div', { class: 'qactions' });
  const areas = {};
  const draw = () => {
    const checks = checkPath(data);
    const ready = checks.every((c) => c.ok);
    const status = docStatus(app.state, 'pathlive');
    const d = app.state.docs.pathlive;
    statusHost.replaceChildren(...[statusChip(status), d && d.review && d.review.comment && status === 'changes' ? h('div', { class: 'mentor-note' }, h('b', null, 'Your Mentor Says'), h('p', null, d.review.comment)) : null].filter(Boolean));
    checkHost.replaceChildren(h('div', { class: 'card-title' }, 'Does The Plan Hold Together?'), ...checks.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.text))));
    submit.disabled = !ready || status === 'submitted';
    submit.textContent = status === 'submitted' ? 'Waiting For Your Mentor' : status === 'approved' || status === 'changes' ? 'Send Again To My Mentor' : 'Send To My Mentor';
    if (ready && onInteract) onInteract();
  };
  const cards = PATH_FIELDS.map((f) => {
    const ta = h('textarea', { class: 'written', rows: 4, 'aria-label': f.label, placeholder: f.hint });
    ta.value = data[f.id] || '';
    ta.addEventListener('input', () => { data[f.id] = ta.value; draw(); saver.soon(); });
    areas[f.id] = ta;
    return h('div', { class: 'card' }, h('div', { class: 'card-title' }, f.label), ta);
  });
  const ack = h('input', { type: 'checkbox', 'aria-label': 'I understand' });
  ack.checked = !!data.ack;
  ack.addEventListener('change', () => { data.ack = ack.checked; draw(); saver.soon(); });
  const submit = button('Send To My Mentor', { onClick: () => { saver.save(); emit('doc.submit', { kind: 'pathlive' }); draw(); } });
  actions.append(button('Save Draft', { variant: 'ghost', onClick: () => { saver.save(); draw(); } }), submit);
  const root = h('div', { class: 'lab pathlive' },
    h('p', { class: 'lab-intro' }, 'Your own plan for how you would ever go live, written before you are tempted. The course does not choose the numbers or the amount, and it does not encourage funded accounts.'),
    statusHost, ...cards,
    h('div', { class: 'card' }, h('label', { class: 'rp-toggle' }, ack, h('span', null, 'I understand that finishing this course is not a profitable strategy, and that no funded account or large capital is part of this plan.'))),
    checkHost, actions);
  root.__fill = (o) => {
    Object.assign(data, o);
    for (const [k, ta] of Object.entries(areas)) ta.value = data[k] || '';
    ack.checked = !!data.ack;
    saver.save();
    draw();
  };
  draw();
  return root;
}
