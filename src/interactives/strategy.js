/**
 * The Strategy Builder. Ten components, each a box of writing. The Completeness Check tests that every component is present and
 * specific, and the ambiguity scan points at words two people would read differently. When the strategy passes ten out of ten
 * it can be sent to the mentor, who applies it to five charts (the Two-Person Test) and approves it or asks for changes.
 *
 * The strategy is hypothetical. The course never says which strategy to use. The Training Rule Pack is exercise text for practising
 * the builder, and is labelled as such.
 */

import { app, emit } from '../core/app.js';
import { h } from '../ui/dom.js';
import { button, chip } from '../ui/kit.js';
import { docStatus, DOC_STATUS_LABEL } from '../learn/docs.js';
import { STRATEGY_FIELDS, TRAINING_PACK, checkStrategy, vagueFlags, strategyReady } from '../learn/strategy.js';

export function strategybuilder({ onInteract, standalone = false } = {}) {
  const st = app.state;
  const saved = (st.docs.strategy && st.docs.strategy.data) || {};
  const data = { ...saved };
  let lastSaved = JSON.stringify(saved);
  const statusHost = h('div', { class: 'rp-status' });
  const checkHost = h('div', { class: 'card rp-checks' });
  const flagHost = h('div', { class: 'card rp-checks' });
  const actions = h('div', { class: 'qactions' });
  const boxes = {};
  let timer = null;

  const save = () => {
    const json = JSON.stringify(data);
    if (json !== lastSaved) {
      emit('doc.save', { kind: 'strategy', data: { ...data } });
      lastSaved = json;
    }
  };
  const changed = () => {
    draw();
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  };

  const field = (f) => {
    const box = h('textarea', { class: 'written', rows: f.id === 'setup' || f.id === 'notrade' ? 4 : 3, 'aria-label': f.label, placeholder: f.hint });
    box.value = data[f.id] || '';
    box.addEventListener('input', () => { data[f.id] = box.value; changed(); });
    boxes[f.id] = box;
    return h('div', { class: 'card sb-field', 'data-field': f.id }, h('div', { class: 'card-title' }, `${f.n}. ${f.label}`), h('p', { class: 'hint-line' }, f.must), box);
  };
  const hypo = h('textarea', { class: 'written', rows: 4, 'aria-label': 'Expectations', placeholder: 'Before any test: the win rate range you expect, the average R, the smallest sample you will accept, and what result would count as failure.' });
  hypo.value = data.hypothesis || '';
  hypo.addEventListener('input', () => { data.hypothesis = hypo.value; changed(); });
  boxes.hypothesis = hypo;

  const draw = () => {
    const checks = checkStrategy(data);
    const flags = vagueFlags(data);
    const ready = strategyReady(data);
    const status = docStatus(app.state, 'strategy');
    const d = app.state.docs.strategy;
    const done = checks.filter((c) => c.ok).length;
    statusHost.replaceChildren(...[
      chip(DOC_STATUS_LABEL[status], status === 'approved' ? 'emerald' : status === 'changes' ? 'gold' : status === 'submitted' ? 'sky' : 'gold'),
      d && d.review && d.review.comment && status === 'changes' ? h('div', { class: 'mentor-note' }, h('b', null, 'Your Mentor Says'), h('p', null, d.review.comment)) : null,
      status === 'approved' ? h('p', { class: 'hint-line' }, 'Your mentor approved this strategy. Change it and it goes back to your mentor.') : null].filter(Boolean));
    checkHost.replaceChildren(
      h('div', { class: 'card-title' }, `Completeness Check: ${done} Of 10`),
      ...checks.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : '○'), h('span', null, c.text))));
    flagHost.replaceChildren(
      h('div', { class: 'card-title' }, 'Words Two People Would Read Differently'),
      flags.length
        ? h('div', null, ...flags.map((f) => h('div', { class: 'rp-check todo' }, h('span', null, '○'), h('span', null, `${f.label}: ${f.found.join(', ')}. Replace each with a number or a rule.`))))
        : h('div', { class: 'rp-check ok' }, h('span', null, '✓'), h('span', null, 'No vague words found. The mentor still applies the rules to five charts.')));
    submit.disabled = !ready || status === 'submitted';
    submit.textContent = status === 'submitted' ? 'Waiting For Your Mentor' : status === 'changes' || status === 'approved' ? 'Send Again To My Mentor' : 'Send To My Mentor';
    if (ready && onInteract) onInteract();
  };

  const submit = button('Send To My Mentor', { onClick: () => { save(); emit('doc.submit', { kind: 'strategy' }); draw(); } });
  const fill = (obj) => {
    Object.assign(data, obj);
    for (const k of Object.keys(boxes)) boxes[k].value = data[k] || '';
    changed();
  };
  actions.append(
    button('Save Draft', { variant: 'ghost', onClick: () => { save(); draw(); } }),
    button('Start From The Training Rule Pack', { variant: 'ghost', onClick: () => fill(TRAINING_PACK) }),
    submit);
  draw();

  const root = h('div', { class: 'lab riskplan strategybuilder' },
    h('p', { class: 'lab-intro' }, standalone ? 'Write a hypothetical strategy in ten parts. The course does not choose one for you.' : 'Write a hypothetical strategy in ten parts. The Training Rule Pack is exercise text to practise with. It is not a recommendation and it has not been tested. Change it, or write your own.'),
    statusHost,
    ...STRATEGY_FIELDS.map(field),
    h('div', { class: 'card sb-field', 'data-field': 'hypothesis' }, h('div', { class: 'card-title' }, 'Expectations Before Testing (Optional Now)'), h('p', { class: 'hint-line' }, 'Level 13 asks you to write this before any test. You can start now.'), hypo),
    checkHost, flagHost, actions);
  // a hook for the test driver
  root.__setStrategy = (obj) => fill(obj);
  return root;
}
