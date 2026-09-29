/** The registry of lesson widgets. A widget is ({ spec, onInteract, lessonId }) => HTMLElement. */

import { orderflow, twocoins, problab, streaksim } from './labs.js';
import { clockpick, clockquiz } from './clock.js';
import { frame } from './frame.js';
import { pipcalc } from './pipcalc.js';

export const WIDGETS = {
  orderflow: (o) => orderflow(o),
  twocoins: (o) => twocoins(o),
  problab: (o) => problab(o),
  streaksim: (o) => streaksim(o),
  clockpick: (o) => clockpick(o),
  clockquiz: (o) => clockquiz(o),
  frame: (o) => frame(o),
  pipcalc: (o) => pipcalc({ ...o, embedded: true })
};

/** Widgets that stand alone in Practice once their lesson is done. */
export const PRACTICE_LABS = [
  { id: 'orderflow', title: 'Buying Against Selling', lesson: 'l01-why-prices-move', blurb: 'Set the order flow and see what the price does.' },
  { id: 'twocoins', title: 'Two Coins', lesson: 'l01-what-is-an-edge', blurb: 'Can you tell a small edge from luck?' },
  { id: 'problab', title: 'The Probability Lab', lesson: 'l01-probability-uncertainty', blurb: 'One run versus a thousand runs.' },
  { id: 'streaksim', title: 'The Streak Simulator', lesson: 'l01-losing-streaks', blurb: 'Twenty identical traders, very different streaks.' }
];
