/**
 * The question card. One component renders every question type and shows feedback that names the mistake.
 *
 *   const card = renderQuestion(item, { mode: 'practice' | 'exam', shuffleSeed, onAnswer })
 *   card.el is the element. onAnswer(result, response) fires once when the student commits an answer.
 *   In exam mode no result is shown (onAnswer receives only the response).
 */

import { app } from '../core/app.js';
import { h, mdInline, rich } from '../ui/dom.js';
import { button, chip } from '../ui/kit.js';
import { numberEntry, NumberField, keypad, displayText } from '../ui/keypad.js';
import { makeRng } from '../learn/rng.js';
import { gradeItem } from './resolve.js';
import { stimulusNode } from './stimulus.js';
import { formatUnit, parseNumber } from '../learn/templates.js';

const LETTERS = 'ABCDEFGH';
const TYPE_LABEL = { mcq: 'Multiple Choice', multi: 'Choose All That Apply', tfr: 'True Or False', sort: 'Sort', sequence: 'Put In Order', match: 'Match', num: 'Calculation', numeric: 'Calculation', steps: 'Step By Step', written: 'In Your Own Words' };

export function renderQuestion(item, { mode = 'practice', shuffleSeed = 1, onAnswer, labelExtra } = {}) {
  const q = item.kind === 'q' ? item.q : null;
  const type = item.kind === 't' ? (item.mode === 'steps' ? 'steps' : 'numeric') : q.type;
  const rng = makeRng(String(item.id) + '#' + shuffleSeed);
  const exam = mode === 'exam';

  const el = h('div', { class: 'qcard', 'data-type': type, 'data-qid': item.id });
  if (typeof window !== 'undefined' && window.__HLS_TEST) window.__HLS_TEST.current = { item, mode };
  const head = h('div', { class: 'qhead' }, h('span', { class: 'qtype' }, TYPE_LABEL[type] || 'Question'), labelExtra || null);
  el.append(head);

  const stim = q && q.stimulus ? stimulusNode(q.stimulus) : null;
  if (stim) el.append(stim);

  const promptText = item.kind === 't' ? item.problem.prompt : q.type === 'tfr' ? q.statement : q.prompt;
  el.append(rich(promptText, 'p', { class: q && q.type === 'tfr' ? 'q-statement' : 'q-prompt' }));
  if (q && q.type === 'tfr') el.append(h('p', { class: 'q-sub' }, q.prompt));

  let ui;
  switch (type) {
    case 'mcq': ui = mcqUI(q, rng, false); break;
    case 'multi': ui = mcqUI(q, rng, true); break;
    case 'tfr': ui = tfrUI(q, rng); break;
    case 'sort': ui = sortUI(q, rng); break;
    case 'sequence': ui = sequenceUI(q, rng); break;
    case 'match': ui = matchUI(q, rng); break;
    case 'written': ui = writtenUI(q, { exam }); break;
    case 'steps': ui = stepsUI(item); break;
    default: ui = numericUI(item, () => submit()); break; // num and numeric templates
  }
  el.append(ui.node);

  let answered = false;
  const feedbackHost = h('div', { class: 'feedback-host', 'aria-live': 'polite' });
  el.append(feedbackHost);

  const submitBtn = ui.ownSubmit
    ? null
    : button(exam ? (type === 'written' ? 'Save Answer' : 'Save And Continue') : 'Check', { onClick: () => submit(), id: 'check-btn' });
  if (submitBtn) {
    submitBtn.disabled = !ui.isComplete();
    el.append(h('div', { class: 'qactions' }, submitBtn));
    ui.onChange(() => (submitBtn.disabled = answered || !ui.isComplete()));
  }

  function submit() {
    if (answered || !ui.isComplete()) return;
    answered = true;
    const response = ui.getResponse();
    if (submitBtn) submitBtn.remove();
    if (exam) {
      ui.lock(null);
      el.classList.add('locked');
      onAnswer && onAnswer(null, response);
      return;
    }
    if (type === 'written') {
      ui.lock(null);
      el.classList.add('locked');
      onAnswer && onAnswer({ pending: true, score: 0, correct: false, errorTags: [] }, response);
      return;
    }
    const result = gradeItem(item, response);
    if (result.invalid) {
      answered = false;
      feedbackHost.replaceChildren(h('div', { class: 'feedback no' }, h('p', null, result.feedback)));
      return;
    }
    ui.lock(result);
    el.classList.add('locked', result.correct ? 'ok' : 'no');
    feedbackHost.replaceChildren(feedbackNode(result, item, type));
    if (result.correct) el.classList.add('pulse-ok');
    onAnswer && onAnswer(result, response);
  }

  return { el, submit, get answered() { return answered; }, type };
}

/* ------------------------------------------------------------------ feedback */

function feedbackNode(result, item, type) {
  const ok = result.correct;
  const partial = !ok && (result.score || 0) > 0;
  const tags = app.content.errorTags;
  const wrap = h('div', { class: 'feedback ' + (ok ? 'ok' : partial ? 'part' : 'no') });
  wrap.append(h('div', { class: 'fb-head' }, ok ? 'Correct.' : partial ? 'Partly right.' : 'Not quite.'));
  const tag = (result.errorTags || [])[0];
  if (!ok && tag && tags[tag]) {
    wrap.append(h('div', { class: 'fb-mistake' }, chip('Common Mistake', 'gold'), h('span', null, ' ' + capitalize(tags[tag].label)), h('p', { class: 'fb-fix' }, tags[tag].fix)));
  }
  if (result.feedback) wrap.append(rich(result.feedback, 'p', { class: 'fb-text' }));
  if (!ok && item.kind === 't' && item.mode !== 'steps' && !result.matchedMistake) wrap.append(h('p', { class: 'fb-answer' }, 'Answer: ', h('strong', null, item.problem.answerText)));
  if (!ok && item.kind === 'q' && item.q.type === 'num') wrap.append(h('p', { class: 'fb-answer' }, 'Answer: ', h('strong', null, formatUnit(item.q.answer, item.q.unit || {}))));
  if (type === 'steps') {
    const list = h('ol', { class: 'fb-steps' });
    result.steps.forEach((r, i) => {
      const st = item.problem.steps[i];
      list.append(h('li', { class: r.correct ? 'ok' : r.carried ? 'carried' : 'no' }, h('span', null, st.label), h('em', null, r.correct ? 'Correct' : r.carried ? 'Right method on your earlier number' : 'Should be ' + formatUnit(r.expected, st.unit))));
    });
    wrap.append(list);
  }
  return wrap;
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ mcq and multi */

function mcqUI(q, rng, multiple) {
  const options = rng.shuffle(q.options);
  const picked = new Set();
  const listeners = [];
  const changed = () => listeners.forEach((f) => f());
  const list = h('div', { class: 'opts', role: multiple ? 'group' : 'radiogroup' });
  const buttons = options.map((o, i) =>
    h('button', {
      type: 'button',
      class: 'opt',
      role: multiple ? 'checkbox' : 'radio',
      'aria-checked': 'false',
      'data-id': o.id,
      onclick: () => {
        if (list.classList.contains('done')) return;
        if (multiple) picked.has(o.id) ? picked.delete(o.id) : picked.add(o.id);
        else {
          picked.clear();
          picked.add(o.id);
        }
        buttons.forEach((b) => {
          const on = picked.has(b.dataset.id);
          b.classList.toggle('sel', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        changed();
      }
    }, h('span', { class: multiple ? 'box' : 'letter' }, multiple ? '' : LETTERS[i]), h('span', { class: 'txt', html: mdInline(o.text) })));
  list.append(...buttons);
  return {
    node: list,
    getResponse: () => (multiple ? [...picked] : [...picked][0]),
    isComplete: () => picked.size > 0,
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      list.classList.add('done');
      buttons.forEach((b) => (b.disabled = true));
      if (!result) return;
      const answer = multiple ? q.answer : [q.answer];
      buttons.forEach((b) => {
        const id = b.dataset.id;
        if (answer.includes(id)) b.classList.add(picked.has(id) ? 'right' : 'missed');
        else if (picked.has(id)) b.classList.add('wrong');
      });
    }
  };
}

/* ------------------------------------------------------------------ true or false with a reason */

function tfrUI(q, rng) {
  let value = null;
  let reason = null;
  const listeners = [];
  const changed = () => listeners.forEach((f) => f());
  const tf = h('div', { class: 'tf' },
    h('button', { type: 'button', class: 'opt tf-btn', 'data-v': 'true', onclick: () => pick(true) }, 'True'),
    h('button', { type: 'button', class: 'opt tf-btn', 'data-v': 'false', onclick: () => pick(false) }, 'False'));
  const reasons = rng.shuffle(q.reasons);
  const reasonList = h('div', { class: 'opts reasons hidden', role: 'radiogroup', 'aria-label': 'Choose the reason' });
  const rbuttons = reasons.map((r, i) => h('button', { type: 'button', class: 'opt', role: 'radio', 'aria-checked': 'false', 'data-id': r.id, onclick: () => pickReason(r.id) }, h('span', { class: 'letter' }, LETTERS[i]), h('span', { class: 'txt', html: mdInline(r.text) })));
  reasonList.append(...rbuttons);
  const node = h('div', null, tf, h('p', { class: 'q-sub reason-label hidden' }, 'Which reason fits?'), reasonList);
  const pick = (v) => {
    if (node.classList.contains('done')) return;
    value = v;
    tf.querySelectorAll('.tf-btn').forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
    reasonList.classList.remove('hidden');
    node.querySelector('.reason-label').classList.remove('hidden');
    changed();
  };
  const pickReason = (id) => {
    if (node.classList.contains('done')) return;
    reason = id;
    rbuttons.forEach((b) => {
      b.classList.toggle('sel', b.dataset.id === id);
      b.setAttribute('aria-checked', b.dataset.id === id ? 'true' : 'false');
    });
    changed();
  };
  return {
    node,
    getResponse: () => ({ value, reason }),
    isComplete: () => value !== null && reason !== null,
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      node.classList.add('done');
      node.querySelectorAll('button').forEach((b) => (b.disabled = true));
      if (!result) return;
      tf.querySelectorAll('.tf-btn').forEach((b) => {
        const isAnswer = b.dataset.v === String(q.answer);
        if (isAnswer) b.classList.add(value === q.answer ? 'right' : 'missed');
        else if (b.classList.contains('sel')) b.classList.add('wrong');
      });
      rbuttons.forEach((b) => {
        if (b.dataset.id === q.reasonAnswer) b.classList.add(reason === q.reasonAnswer ? 'right' : 'missed');
        else if (b.dataset.id === reason) b.classList.add('wrong');
      });
    }
  };
}

/* ------------------------------------------------------------------ sort into bins */

function sortUI(q, rng) {
  const placed = {}; // itemId -> binId
  let selected = null;
  const listeners = [];
  const changed = () => listeners.forEach((f) => f());
  const items = rng.shuffle(q.items);
  const tray = h('div', { class: 'tray', 'aria-label': 'Items to sort' });
  const bins = q.bins.map((b) => ({ ...b, zone: h('div', { class: 'bin-items' }) }));
  const binEls = bins.map((b) => h('div', { class: 'bin', 'data-bin': b.id, role: 'button', tabindex: 0, 'aria-label': 'Place in ' + b.label, onclick: () => place(b.id), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && place(b.id) }, h('div', { class: 'bin-label' }, b.label), b.zone));
  const chipFor = new Map();
  for (const it of items) {
    const c = h('button', { type: 'button', class: 'sort-item', 'data-id': it.id, onclick: (e) => { e.stopPropagation(); choose(it.id); } }, it.text);
    chipFor.set(it.id, c);
  }
  const node = h('div', { class: 'sortui' }, h('p', { class: 'hint-line' }, 'Tap an item, then tap the box where it belongs. Tap a placed item to take it back.'), tray, h('div', { class: 'bins' }, ...binEls));
  const render = () => {
    tray.replaceChildren();
    bins.forEach((b) => b.zone.replaceChildren());
    for (const it of items) {
      const c = chipFor.get(it.id);
      c.classList.toggle('picked', selected === it.id);
      if (placed[it.id]) bins.find((b) => b.id === placed[it.id]).zone.append(c);
      else tray.append(c);
    }
    tray.classList.toggle('empty', !tray.children.length);
  };
  const choose = (id) => {
    if (node.classList.contains('done')) return;
    if (placed[id]) {
      delete placed[id];
      selected = id;
    } else selected = selected === id ? null : id;
    render();
    changed();
  };
  const place = (binId) => {
    if (node.classList.contains('done') || !selected) return;
    placed[selected] = binId;
    selected = null;
    render();
    changed();
  };
  render();
  return {
    node,
    getResponse: () => ({ ...placed }),
    isComplete: () => items.every((it) => placed[it.id]),
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      node.classList.add('done');
      chipFor.forEach((c) => (c.disabled = true));
      if (!result) return;
      items.forEach((it) => chipFor.get(it.id).classList.add(placed[it.id] === q.answer[it.id] ? 'right' : 'wrong'));
      if (!result.correct) {
        const fix = h('div', { class: 'fix-list' }, h('div', { class: 'fix-head' }, 'Where the wrong ones belong'));
        items.filter((it) => placed[it.id] !== q.answer[it.id]).forEach((it) => fix.append(h('p', null, h('strong', null, it.text), ' → ', q.bins.find((b) => b.id === q.answer[it.id]).label)));
        node.append(fix);
      }
    }
  };
}

/* ------------------------------------------------------------------ sequence */

function sequenceUI(q, rng) {
  let order = [];
  const listeners = [];
  const changed = () => listeners.forEach((f) => f());
  const items = rng.shuffle(q.items);
  const tray = h('div', { class: 'tray' });
  const lineup = h('ol', { class: 'lineup', 'aria-label': 'Your order' });
  const node = h('div', { class: 'sequi' }, h('p', { class: 'hint-line' }, 'Tap the steps in order. Tap a step in your list to take it back.'), tray, lineup);
  const render = () => {
    tray.replaceChildren(...items.filter((it) => !order.includes(it.id)).map((it) => h('button', { type: 'button', class: 'sort-item', onclick: () => add(it.id) }, it.text)));
    lineup.replaceChildren(...order.map((id, i) => h('li', null, h('button', { type: 'button', class: 'sort-item placed', 'data-id': id, onclick: () => remove(id) }, h('span', { class: 'num' }, String(i + 1)), q.items.find((x) => x.id === id).text))));
    tray.classList.toggle('empty', !tray.children.length);
  };
  const add = (id) => {
    if (node.classList.contains('done')) return;
    order.push(id);
    render();
    changed();
  };
  const remove = (id) => {
    if (node.classList.contains('done')) return;
    order = order.filter((x) => x !== id);
    render();
    changed();
  };
  render();
  return {
    node,
    getResponse: () => [...order],
    isComplete: () => order.length === items.length,
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      node.classList.add('done');
      node.querySelectorAll('button').forEach((b) => (b.disabled = true));
      if (!result) return;
      lineup.querySelectorAll('li').forEach((li, i) => li.querySelector('button').classList.add(order[i] === q.answer[i] ? 'right' : 'wrong'));
      if (!result.correct) {
        const fix = h('div', { class: 'fix-list' }, h('div', { class: 'fix-head' }, 'The correct order'));
        const ol = h('ol', null);
        q.answer.forEach((id) => ol.append(h('li', null, q.items.find((x) => x.id === id).text)));
        fix.append(ol);
        node.append(fix);
      }
    }
  };
}

/* ------------------------------------------------------------------ match */

function matchUI(q, rng) {
  const pairs = {}; // leftId -> rightId
  let leftSel = null;
  const listeners = [];
  const changed = () => listeners.forEach((f) => f());
  const lefts = q.left;
  const rights = rng.shuffle(q.right);
  const colorOf = (leftId) => 'p' + (lefts.findIndex((l) => l.id === leftId) % 6);
  const lcol = h('div', { class: 'mcol' });
  const rcol = h('div', { class: 'mcol' });
  const node = h('div', { class: 'matchui' }, h('p', { class: 'hint-line' }, 'Tap an item on the left, then its match on the right.'), h('div', { class: 'mcols' }, lcol, rcol));
  const render = () => {
    lcol.replaceChildren(...lefts.map((l) => h('button', { type: 'button', class: `mitem ${pairs[l.id] ? 'paired ' + colorOf(l.id) : ''} ${leftSel === l.id ? 'picked' : ''}`, 'data-id': l.id, onclick: () => pickLeft(l.id) }, l.text)));
    rcol.replaceChildren(...rights.map((r) => {
      const owner = Object.keys(pairs).find((k) => pairs[k] === r.id);
      return h('button', { type: 'button', class: `mitem ${owner ? 'paired ' + colorOf(owner) : ''}`, 'data-id': r.id, onclick: () => pickRight(r.id) }, r.text);
    }));
  };
  const pickLeft = (id) => {
    if (node.classList.contains('done')) return;
    if (pairs[id]) {
      delete pairs[id];
      leftSel = id;
    } else leftSel = leftSel === id ? null : id;
    render();
    changed();
  };
  const pickRight = (id) => {
    if (node.classList.contains('done')) return;
    const owner = Object.keys(pairs).find((k) => pairs[k] === id);
    if (owner) {
      delete pairs[owner];
      render();
      changed();
      return;
    }
    if (!leftSel) return;
    pairs[leftSel] = id;
    leftSel = null;
    render();
    changed();
  };
  render();
  return {
    node,
    getResponse: () => ({ ...pairs }),
    isComplete: () => lefts.every((l) => pairs[l.id]),
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      node.classList.add('done');
      node.querySelectorAll('button').forEach((b) => (b.disabled = true));
      if (!result) return;
      lcol.querySelectorAll('button').forEach((b) => b.classList.add(pairs[b.dataset.id] === q.answer[b.dataset.id] ? 'right' : 'wrong'));
      if (!result.correct) {
        const fix = h('div', { class: 'fix-list' }, h('div', { class: 'fix-head' }, 'The correct matches'));
        lefts.forEach((l) => fix.append(h('p', null, h('strong', null, l.text), ' → ', q.right.find((r) => r.id === q.answer[l.id]).text)));
        node.append(fix);
      }
    }
  };
}

/* ------------------------------------------------------------------ numbers */

function numericUI(item, onSubmit) {
  const unit = item.kind === 't' ? item.problem.unit : item.q.unit || {};
  const listeners = [];
  const entry = numberEntry({ prefix: unit.prefix || '', suffix: unit.suffix || '', placeholder: unit.prefix ? unit.prefix + '0' : '0', onSubmit: () => onSubmit(), max: 9 });
  entry.field.onChange = ((orig) => (v) => {
    orig(v);
    listeners.forEach((f) => f());
  })(entry.field.onChange);
  return {
    node: entry.el,
    ownSubmit: true,
    getResponse: () => entry.field.value,
    isComplete: () => !Number.isNaN(parseNumber(entry.field.value)),
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      entry.keypad.remove();
      entry.display.classList.add(result ? (result.correct ? 'right' : 'wrong') : 'saved');
    }
  };
}

/* ------------------------------------------------------------------ guided steps */

function stepsUI(item) {
  const steps = item.problem.steps;
  const fields = steps.map(() => new NumberField({ max: 10 }));
  let active = 0;
  const listeners = [];
  const rows = steps.map((st, i) => {
    const val = h('span', { class: 'step-val' }, '');
    fields[i].onChange = (v) => {
      val.textContent = v === '' ? '' : displayText(v, { prefix: st.unit.prefix || '', suffix: st.unit.suffix || '' });
      listeners.forEach((f) => f());
    };
    const row = h('button', { type: 'button', class: 'step-row', onclick: () => activate(i) }, h('span', { class: 'step-n' }, String(i + 1)), h('span', { class: 'step-txt' }, h('strong', null, st.label), st.hint ? h('em', null, st.hint) : null), val);
    return { row, val };
  });
  const node = h('div', { class: 'stepsui' });
  const list = h('div', { class: 'step-list' }, ...rows.map((r) => r.row));
  const pad = keypad({
    onKey: (k) => fields[active].press(k),
    onSubmit: () => {
      if (active < steps.length - 1) activate(active + 1);
    },
    submitLabel: 'Next Step'
  });
  node.append(list, pad);
  const activate = (i) => {
    active = i;
    rows.forEach((r, k) => r.row.classList.toggle('active', k === i));
    pad.setSubmitLabel(i < steps.length - 1 ? 'Next Step' : 'Last Step');
  };
  activate(0);
  const api = {
    node,
    getResponse: () => fields.map((f) => f.value),
    isComplete: () => fields.every((f) => f.value !== '' && f.value !== '-'),
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      pad.remove();
      if (!result) return;
      result.steps.forEach((r, i) => rows[i].row.classList.add(r.correct ? 'right' : r.carried ? 'carried' : 'wrong'));
    }
  };
  return api;
}

/* ------------------------------------------------------------------ written */

function writtenUI(q, { exam }) {
  const listeners = [];
  const ta = h('textarea', { class: 'written', rows: 8, placeholder: 'Write in your own words…', 'aria-label': 'Your answer', oninput: () => { count.textContent = wordCount() + ' words'; listeners.forEach((f) => f()); } });
  const wordCount = () => ta.value.trim().split(/\s+/).filter(Boolean).length;
  const count = h('div', { class: 'wcount' }, '0 words');
  const rubricHint = h('p', { class: 'hint-line' }, 'Use your own words. Include one numeric example. Your mentor will read this.');
  return {
    node: h('div', { class: 'writtenui' }, rubricHint, ta, count),
    getResponse: () => ta.value.trim(),
    isComplete: () => wordCount() >= 25,
    onChange: (f) => listeners.push(f),
    lock: () => {
      ta.readOnly = true;
      ta.classList.add('saved');
    }
  };
}
