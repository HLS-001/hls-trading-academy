/** The registry of lesson widgets. A widget is ({ spec, onInteract, lessonId }) => HTMLElement. */

import { orderflow, twocoins, problab, streaksim } from './labs.js';
import { clockpick, clockquiz } from './clock.js';
import { frame } from './frame.js';
import { pipcalc } from './pipcalc.js';
import { bondslider, instrumentmatrix } from './instruments.js';
import { quoteboard, tradeticket, leveragelens, accountpanel, costbar } from './mechanics.js';
import { calcTool } from './calcs.js';
import { masterylab } from './masterylab.js';
import { ordersim, fillsim, thindeep, newsspread, feedcompare, templateset } from './execution.js';
import { ticklab, timeframelab, structurelab, mtflab } from './chartlab.js';
import { liveedgelab } from './liveedge.js';
import { levelreact, activityhour, sessiontable, sessionlab } from './levels.js';
import { ratediff, rollingcorr, newsreaction, eventstudy } from './news.js';
import { riskplan } from './riskplan.js';
import { strategybuilder } from './strategy.js';
import { randomlab, noisemine, costslab, statslab13, journalaudit } from './evidence.js';
import { backtestlab } from './backtestlab.js';
import { planlab } from './planlab.js';
import { platformchecklist, brokerworksheet, pathlive } from './trackp.js';
import { streakladder, montecarlolab, exposurelab } from './risk.js';
import { meanmedian, samplesize, expectancysurface, equitybuilder, compounding, ruinexplorer, statslab } from './maths.js';

export const WIDGETS = {
  bondslider: (o) => bondslider(o),
  ticklab: (o) => ticklab(o),
  timeframelab: (o) => timeframelab(o),
  structurelab: (o) => structurelab(o),
  mtflab: (o) => mtflab(o),
  liveedgelab: (o) => liveedgelab(o),
  levelreact: (o) => levelreact(o),
  ratediff: (o) => ratediff(o),
  riskplan: (o) => riskplan(o),
  strategybuilder: (o) => strategybuilder(o),
  randomlab: (o) => randomlab(o),
  noisemine: (o) => noisemine(o),
  costslab: (o) => costslab(o),
  statslab13: (o) => statslab13(o),
  journalaudit: (o) => journalaudit(o),
  backtestlab: (o) => backtestlab(o),
  planlab: (o) => planlab(o),
  platformchecklist: (o) => platformchecklist(o),
  brokerworksheet: (o) => brokerworksheet(o),
  pathlive: (o) => pathlive(o),
  streakladder: (o) => streakladder(o),
  montecarlolab: (o) => montecarlolab(o),
  exposurelab: (o) => exposurelab(o),
  rollingcorr: (o) => rollingcorr(o),
  newsreaction: (o) => newsreaction(o),
  eventstudy: (o) => eventstudy(o),
  activityhour: (o) => activityhour(o),
  sessiontable: (o) => sessiontable(o),
  sessionlab: (o) => sessionlab(o),
  meanmedian: (o) => meanmedian(o),
  samplesize: (o) => samplesize(o),
  expectancysurface: (o) => expectancysurface(o),
  equitybuilder: (o) => equitybuilder(o),
  compounding: (o) => compounding(o),
  ruinexplorer: (o) => ruinexplorer(o),
  statslab: (o) => statslab(o),
  ordersim: (o) => ordersim(o),
  fillsim: (o) => fillsim(o),
  thindeep: (o) => thindeep(o),
  newsspread: (o) => newsspread(o),
  feedcompare: (o) => feedcompare(o),
  templateset: (o) => templateset(o),
  quoteboard: (o) => quoteboard(o),
  tradeticket: (o) => tradeticket(o),
  leveragelens: (o) => leveragelens(o),
  accountpanel: (o) => accountpanel(o),
  costbar: (o) => costbar(o),
  calc: (o) => calcTool({ id: o.spec.calc, onInteract: o.onInteract }),
  masterylab: (o) => masterylab({ level: o.spec.level || 3, onInteract: o.onInteract }),
  instrumentmatrix: (o) => instrumentmatrix(o),
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
