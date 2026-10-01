/** Planning tools as pages of their own: the Risk Plan Builder now, the Strategy Builder and others later. */

import { h, mount } from '../ui/dom.js';
import { screenTitle } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { riskplan } from '../interactives/riskplan.js';
import { strategybuilder } from '../interactives/strategy.js';
import { backtestlab } from '../interactives/backtestlab.js';
import { planlab } from '../interactives/planlab.js';
import { platformchecklist, brokerworksheet, pathlive } from '../interactives/trackp.js';
import { trackBanner } from '../ui/kit.js';

export function riskPlanPage() {
  const screen = begin({ title: 'Risk Plan', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Risk Plan Builder', 'Your own limits, checked against each other, and approved by your mentor.'), riskplan({ standalone: true }));
}

export function strategyPage() {
  const screen = begin({ title: 'Strategy', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Strategy Builder', 'A hypothetical strategy in ten parts, checked for completeness and applied by your mentor.'), strategybuilder({ standalone: true }));
}

export function backtestPage() {
  const screen = begin({ title: 'Backtest Lab', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Backtest Lab', 'A full cycle on the Training Rule Pack: hypothesis, locked split, in-sample, out-of-sample, conclusion.'), backtestlab({ standalone: true }));
}

export function planSeriesPage() {
  const screen = begin({ title: 'Plan Series', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Hidden-Future Plans', 'Plan first. The future is shown only after you submit.'), planlab({}));
}

export function platformsPage() {
  const screen = begin({ title: 'Platform Checklist', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Platform Task Checklist', 'Tasks done on your own demo account, checked by your mentor.'), trackBanner(), platformchecklist({}));
}

export function brokerPage() {
  const screen = begin({ title: 'Broker Worksheet', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Broker Worksheet', 'A blank grid. Every cell needs a source and a status.'), trackBanner(), brokerworksheet({}));
}

export function pathPage() {
  const screen = begin({ title: 'Path To Live', back: '#/practice', tab: 'practice' });
  mount(screen, screenTitle('Path-To-Live Plan', 'Your own plan, written before you are tempted, and approved by your mentor.'), trackBanner(), pathlive({}));
}
