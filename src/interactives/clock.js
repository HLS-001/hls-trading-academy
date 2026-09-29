/**
 * Lesson 0.3: choose your time zone, then convert market times into your own clock.
 * All conversions come from the time engine (UTC storage, the tz database, never a fixed offset).
 */

import { app, emit } from '../core/app.js';
import { h, mount } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { COMMON_ZONES, formatTime, tzAbbr, dateInZone, hoursApart } from '../time/zones.js';
import { CONVENTIONAL_SET, resolveWindow } from '../time/sessions.js';
import { runSet } from '../exercises/runner.js';
import { makeRng, freshSeed } from '../learn/rng.js';

export function dualClock(tzMarket = 'America/New_York', marketLabel = 'New York') {
  const tz = app.state.settings.tz;
  const now = Date.now();
  return h('div', { class: 'clocks' },
    h('div', null, h('span', null, marketLabel + ' (market time)'), h('b', null, formatTime(now, tzMarket))),
    h('div', null, h('span', null, 'Your clock'), h('b', null, formatTime(now, tz))));
}

export function clockpick({ onInteract }) {
  const view = h('div', { class: 'lab' });
  const draw = () => {
    const current = app.state.settings.tz;
    const grid = h('div', { class: 'zone-grid' }, ...COMMON_ZONES.map((z) => h('button', { type: 'button', class: 'opt small' + (z.tz === current ? ' sel' : ''), onclick: () => choose(z.tz) }, z.label, h('em', null, tzAbbr(Date.now(), z.tz)))));
    let all = [];
    try {
      all = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
    } catch (e) {
      all = [];
    }
    const more = all.length
      ? h('label', { class: 'field' }, h('span', null, 'Another zone'), h('select', { onchange: (e) => e.target.value && choose(e.target.value), 'aria-label': 'Choose another time zone' }, h('option', { value: '' }, 'Choose…'), ...all.map((z) => h('option', { value: z, selected: z === current }, z.replace(/_/g, ' ')))))
      : null;
    mount(view,
      h('p', { class: 'lab-intro' }, 'Choose the zone your clock follows. Guyana is set for you.'),
      grid, more,
      h('div', { class: 'clock-preview' }, dualClock('America/New_York', 'New York'), dualClock('Europe/London', 'London')),
      h('p', { class: 'lab-teach' }, 'You can change this any time in Settings.'));
  };
  const choose = (tz) => {
    emit('settings.set', { key: 'tz', value: tz });
    draw();
    onInteract();
  };
  draw();
  return view;
}

/** Three generated conversions for today's date. */
export function clockquiz({ onInteract, lessonId = 'l00-set-your-clocks' }) {
  const host = h('div', { class: 'lab' });
  const userTz = app.state.settings.tz;
  const rng = makeRng(freshSeed());
  const usable = CONVENTIONAL_SET.sessions.filter((sd) => sd.anchorTz !== userTz);
  const chosen = rng.shuffle(usable).slice(0, 3);

  const questions = chosen.map((def) => {
    const date = dateInZone(Date.now(), def.anchorTz);
    const w = resolveWindow(def, date);
    const correct = formatTime(w.startMs, userTz);
    const wrong = new Set();
    for (const dh of rng.shuffle([-2, -1, 1, 2, 3, -3])) {
      if (wrong.size >= 3) break;
      const t = formatTime(w.startMs + dh * 3600000, userTz);
      if (t !== correct) wrong.add(t);
    }
    const gap = hoursApart(w.startMs, def.anchorTz, userTz);
    const gapText = gap === 0 ? 'the same as' : `${Math.abs(gap)} hour${Math.abs(gap) === 1 ? '' : 's'} ${gap > 0 ? 'ahead of' : 'behind'}`;
    return {
      id: `clock:${def.id}:${date}`,
      type: 'mcq',
      concepts: ['market-vs-local-time'],
      prompt: `The ${def.label.replace(/ \(.*\)/, '')} session opens at ${def.startLocal} ${tzAbbr(w.startMs, def.anchorTz)} today (${def.anchorTz.replace(/_/g, ' ')} time). What time is that on your clock?`,
      options: [correct, ...wrong].map((t, i) => ({ id: 'abcd'[i], text: t })),
      answer: 'a',
      optionFeedback: {},
      optionTags: {},
      explanation: `On the date shown, that market's clock is ${gapText} yours, so ${def.startLocal} there is ${correct} on your clock.`
    };
  });

  runSet({
    container: host,
    refs: questions.map((q) => ({ kind: 'inline', q })),
    ctx: { kind: 'lesson', ref: lessonId, lessonId },
    onDone: (res) => {
      mount(host, h('div', { class: 'lab-done' }, h('p', { class: 'lab-result' }, `You got ${res.correct} of ${res.n} right.`), h('p', { class: 'lab-teach' }, 'Clock conversions come back later, especially in the weeks when the US and UK clocks are out of step.')));
      onInteract();
    }
  });
  return host;
}
