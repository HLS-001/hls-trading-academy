/**
 * The Analyst's Frame: eight questions that turn a hunch into a reasoned decision.
 * Guided version (Level 0): hints shown, an example answer afterwards. The hints fade in later levels.
 */

import { emit } from '../core/app.js';
import { h, mount, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';

const UMBRELLA_SAMPLE = {
  info: 'It is cloudy. The forecast says a 60% chance of rain this afternoon.',
  outcomes: 'It rains and I am dry with an umbrella. It rains and I am wet without one. It stays dry and the umbrella is a nuisance.',
  invalid: 'If the sky clears and the forecast drops to a low chance, I would leave it at home.',
  risk: 'Getting soaked on the way home, or carrying a bulky umbrella all day. Both are small.',
  evidence: 'On days the forecast said 60%, it rained about half the time, but I have not kept count.',
  edge: 'There is no edge here. I am reasoning from a forecast, not from a measured record.',
  sample: 'Only the few days I remember. That is a small sample.',
  random: 'Yes. A 60% forecast means dry days are common, so a dry day does not show the forecast was wrong.'
};

export function frame({ spec, onInteract, lessonId = 'l00-analyst-frame' }) {
  const fields = spec.fields;
  const values = {};
  const listeners = [];
  const done = h('div', { class: 'lab-out' });
  const finish = button('Finish', { onClick: () => complete(), disabled: true });

  const rows = fields.map((f, i) => {
    const ta = h('textarea', { class: 'frame-input', rows: 2, placeholder: f.hint, 'aria-label': f.q, oninput: () => { values[f.id] = ta.value.trim(); finish.disabled = !fields.every((x) => (values[x.id] || '').length >= 8); } });
    return h('label', { class: 'frame-row' }, h('span', { class: 'frame-q' }, h('em', null, String(i + 1)), f.q), ta);
  });

  const complete = () => {
    finish.disabled = true;
    emit('question.answer', {
      qid: 'try-l00-04-frame',
      type: 'frame',
      kind: 'concept',
      concepts: ['analyst-frame'],
      score: 1,
      correct: true,
      errorTags: [],
      hinted: false,
      revealed: false,
      ctx: { kind: 'lesson', ref: lessonId },
      homeFor: ['analyst-frame']
    });
    const sample = spec.sample || UMBRELLA_SAMPLE;
    done.replaceChildren(
      h('div', { class: 'feedback ok' }, h('div', { class: 'fb-head' }, 'Done.'), h('p', { class: 'fb-text' }, 'Here is one possible set of answers to compare with yours. There is no single right answer. The point is that each question forces you to think.')),
      h('ol', { class: 'sample-list' }, ...fields.map((f) => h('li', null, h('strong', null, f.q), h('p', null, sample[f.id] || '')))));
    onInteract();
  };

  return h('div', { class: 'lab frame' },
    h('div', { class: 'stim scenario' }, h('div', { class: 'stim-tag' }, 'Situation'), h('p', { html: mdInline(spec.scenario) })),
    h('div', { class: 'frame-form' }, ...rows),
    h('div', { class: 'lab-actions' }, finish),
    done);
}
