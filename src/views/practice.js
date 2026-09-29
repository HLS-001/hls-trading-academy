/** Practice: calculators and simulations, unlocked as their lessons are completed. */

import { app } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { card, chip, screenTitle, icon } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { lessonDone } from '../learn/progress.js';
import { pipcalc } from '../interactives/pipcalc.js';
import { WIDGETS, PRACTICE_LABS } from '../interactives/index.js';

export function practiceView() {
  const st = app.state;
  const c = app.content;
  const screen = begin({ title: 'Practice', tab: 'practice' });

  const tile = ({ title, blurb, unlocked, route, lockedText }) =>
    h('a', { class: 'card practice-tile' + (unlocked ? '' : ' locked'), href: unlocked ? route : null, 'aria-disabled': unlocked ? null : 'true', onclick: (e) => { if (!unlocked) e.preventDefault(); } },
      h('div', null, h('b', null, title), h('span', null, unlocked ? blurb : lockedText)), unlocked ? chip('Open', 'gold') : icon('lock', 20));

  const pipDone = lessonDone(st, 'l03-pip-value');
  const calculators = [
    tile({ title: 'Pip Value', blurb: 'Tool, guided steps and drills.', unlocked: pipDone, route: '#/practice/pip-value', lockedText: 'Unlocks after lesson 3.05 (a preview lesson you can try now).' })
  ];
  const labs = PRACTICE_LABS.map((l) => tile({ title: l.title, blurb: l.blurb, unlocked: lessonDone(st, l.lesson), route: `#/practice/lab/${l.id}`, lockedText: `Unlocks after lesson ${c.lessons.get(l.lesson).number}.` }));

  mount(screen,
    screenTitle('Practice', 'Tools and simulations open as you learn.'),
    h('h2', { class: 'section' }, 'Calculators'), ...calculators,
    h('h2', { class: 'section' }, 'Simulations'), ...labs,
    h('p', { class: 'sim-note' }, 'Simulated. Illustrates a mechanism; predicts nothing.'));
}

export function pipValuePage() {
  const screen = begin({ title: 'Pip Value', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Pip Value', 'What one pip is worth, in your account currency.'), pipcalc({ embedded: false }));
}

export function labPage({ id }) {
  const lab = PRACTICE_LABS.find((l) => l.id === id);
  const screen = begin({ title: lab ? lab.title : 'Simulation', back: '#/practice', tab: 'practice' });
  if (!lab) return mount(screen, card(h('p', null, 'That simulation does not exist.')));
  mount(screen, screenTitle(lab.title, lab.blurb), WIDGETS[id]({ onInteract: () => {}, lessonId: lab.lesson }));
}
