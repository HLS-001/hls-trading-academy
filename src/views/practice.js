/** Practice: calculators and simulations, unlocked as their lessons are completed. */

import { app } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { card, chip, screenTitle, icon } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { lessonDone } from '../learn/progress.js';
import { pipcalc } from '../interactives/pipcalc.js';
import { CALCS, CALC_LIST, calcTool } from '../interactives/calcs.js';
import { masterylab } from '../interactives/masterylab.js';
import { WIDGETS, PRACTICE_LABS } from '../interactives/index.js';
import { docStatus, DOC_STATUS_LABEL } from '../learn/docs.js';

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
  const calcTiles = CALC_LIST.map((cl) => tile({ title: cl.title, blurb: cl.blurb, unlocked: lessonDone(st, cl.unlock), route: `#/practice/calc/${cl.id}`, lockedText: `Unlocks after lesson ${c.lessons.get(cl.unlock).number}.` }));
  const masteryTile = tile({ title: 'Calculator Mastery Lab', blurb: 'Twenty adaptive problems at a time. Reach mastery in every family.', unlocked: lessonDone(st, 'l03-reward-r'), route: '#/practice/mastery', lockedText: 'Unlocks after lesson 3.13.' });
  const labs = PRACTICE_LABS.map((l) => tile({ title: l.title, blurb: l.blurb, unlocked: lessonDone(st, l.lesson), route: `#/practice/lab/${l.id}`, lockedText: `Unlocks after lesson ${c.lessons.get(l.lesson).number}.` }));

  // planning tools open with the lesson that introduces them and stay open after
  const toolTile = (title, blurb, unlockLesson, route, kind) => {
    const open = lessonDone(st, unlockLesson) || st.settings.testOut || !!(st.docs && st.docs[kind]);
    const status = docStatus(st, kind);
    return tile({ title, blurb: `${blurb} ${DOC_STATUS_LABEL[status]}.`, unlocked: open, route, lockedText: `Unlocks with lesson ${c.lessons.get(unlockLesson).number}.` });
  };
  const tools = [
    toolTile('Risk Plan Builder', 'Write your own limits.', 'l10-planned-realized', '#/tools/risk-plan', 'riskplan'),
    toolTile('Strategy Builder', 'Ten parts, written so two people agree.', 'l12-rules-testable', '#/tools/strategy', 'strategy'),
    toolTile('Backtest Lab', 'Hypothesis, locked split, in-sample, out-of-sample.', 'l13-backtest-lab', '#/tools/backtest', 'backtest'),
    toolTile('Hidden-Future Plans', 'Plan first. The future is shown after you submit.', 'l13-hidden-future', '#/tools/plan-series', 'plans'),
    toolTile('Platform Checklist', 'Tasks on your own demo. Track P.', 'p-tradingview', '#/tools/platforms', 'platforms'),
    toolTile('Broker Worksheet', 'A blank grid with sources. Track P.', 'p-brokers-regulation', '#/tools/broker-worksheet', 'brokerws'),
    toolTile('Path-To-Live Plan', 'Your own plan, approved by your mentor. Track P.', 'p-path-to-live', '#/tools/path-to-live', 'pathlive')
  ];

  const assigned = Object.values(st.assignments || {}).sort((a, b) => b.createdAt - a.createdAt).map((a) => tile({ title: a.kind === 'capstone' ? 'The Capstone' : `Assignment · ${a.count} Charts`, blurb: `${Object.keys(a.answers).length} of ${a.count} answered${a.finalizedAt ? ' · Reviewed' : ''}.`, unlocked: true, route: `#/assignment/${a.id}`, lockedText: '' }));

  mount(screen,
    screenTitle('Practice', 'Tools and simulations open as you learn.'),
    ...(assigned.length ? [h('h2', { class: 'section' }, 'Assignments From Your Mentor'), ...assigned] : []),
    ...(st.methodology && st.methodology.released ? [h('h2', { class: 'section' }, 'Your Mentor\'s Methodology'), tile({ title: 'Methodology', blurb: 'Your mentor\'s own approach, presented as hypotheses under test.', unlocked: true, route: '#/methodology', lockedText: '' })] : []),
    h('h2', { class: 'section' }, 'Calculators'), ...calculators, ...calcTiles, masteryTile,
    h('h2', { class: 'section' }, 'Planning Tools'), ...tools,
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

export function calcPage({ id }) {
  const spec = CALCS[id];
  const screen = begin({ title: spec ? spec.title : 'Calculator', back: '#/practice', tab: 'practice' });
  if (!spec) return mount(screen, card(h('p', null, 'That calculator does not exist.')));
  mount(screen, screenTitle(spec.title, spec.blurb), calcTool({ id }));
}

export function masteryPage() {
  const screen = begin({ title: 'Mastery Lab', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Calculator Mastery Lab', 'Twenty adaptive problems at a time.'), masterylab({ level: 3 }));
}
