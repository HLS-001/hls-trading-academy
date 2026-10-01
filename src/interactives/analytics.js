/**
 * The performance analytics panel: statistics in R with their uncertainty, an equity curve with the band that reordering alone
 * makes, the histogram of R, results by group, filters that count how many slices you have looked at, and the Evidence Card.
 * Used on the Journal page and, on a supplied sample journal, in lesson 13.10.
 */

import { h } from '../ui/dom.js';
import { chip } from '../ui/kit.js';
import { lineSvg, barsSvg } from '../ui/minichart.js';
import { tradeStats, bootstrapInterval, signFlip, sampleBand, tradesNeeded, cumulative, reshuffleBand, histogram, byGroup, snoopingNote, mean, median } from '../learn/stats.js';
import { SESSION_LABEL, FLAGS } from '../learn/journal.js';

const R2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'R');
const P0 = (v) => (v === null || v === undefined ? '—' : Math.round(v * 100) + '%');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dow = (t) => DAYS[new Date(t.date + 'T12:00:00Z').getUTCDay()];

const card = (title, ...kids) => h('div', { class: 'card an-card' }, title ? h('div', { class: 'card-title' }, title) : null, ...kids);
const stat = (label, value, sub) => h('div', { class: 'an-stat' }, h('span', { class: 'an-l' }, label), h('b', { class: 'an-v' }, value), sub ? h('em', null, sub) : null);

export const EVIDENCE_QUESTIONS = [
  ['What information do I have?', 'auto'],
  ['What are the possible outcomes?', 'auto'],
  ['What would invalidate my hypothesis?', 'write'],
  ['What is my risk?', 'auto'],
  ['What does the historical evidence say?', 'auto'],
  ['Is there actually an edge?', 'auto'],
  ['How large is my sample?', 'auto'],
  ['Could this be random?', 'auto']
];

/**
 * trades: [{ id, r, date, time, market, direction, session, setup, source, part?, flags? }]
 * options: { title, note, flagInfo }   flagInfo = { flags: Map, heldWinners, heldLosers }
 */
export function analyticsPanel({ trades, note = '', flagInfo = null, seed = 5 } = {}) {
  const f = { source: 'all', direction: 'all', session: 'all', result: 'all', part: 'all' };
  const seen = new Set();
  const host = h('div', { class: 'analytics' });
  const sources = [...new Set(trades.map((t) => t.source))];
  const hasParts = trades.some((t) => t.part);
  if (sources.length === 1) f.source = sources[0];

  const chips = (key, items) => h('div', { class: 'an-filter' }, h('span', { class: 'an-fl' }, key === 'part' ? 'Data Partition' : key[0].toUpperCase() + key.slice(1)), h('div', { class: 'choices wrap' }, ...items.map(([v, label]) => h('button', { type: 'button', class: 'opt small' + (f[key] === v ? ' sel' : ''), 'data-f': key, 'data-v': v, onclick: () => { f[key] = v; draw(); } }, label))));

  const filtered = () => trades.filter((t) => (f.source === 'all' || t.source === f.source) && (f.direction === 'all' || t.direction === f.direction) && (f.session === 'all' || t.session === f.session) && (f.result === 'all' || (f.result === 'win' ? t.r > 0.1 : f.result === 'loss' ? t.r < -0.1 : Math.abs(t.r) <= 0.1)) && (f.part === 'all' || t.part === f.part));

  const draw = () => {
    const key = JSON.stringify(f);
    seen.add(key);
    const list = filtered().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const rs = list.map((t) => t.r);
    const s = tradeStats(rs);
    const parts = [];

    const filters = card('Filters',
      ...(sources.length > 1 ? [chips('source', [['all', 'All'], ...sources.map((x) => [x, x[0].toUpperCase() + x.slice(1)])])] : []),
      chips('direction', [['all', 'All'], ['long', 'Long'], ['short', 'Short']]),
      chips('session', [['all', 'All'], ...Object.keys(SESSION_LABEL).filter((k) => k !== 'none').map((k) => [k, SESSION_LABEL[k]])]),
      chips('result', [['all', 'All'], ['win', 'Wins'], ['loss', 'Losses'], ['be', 'Breakeven']]),
      ...(hasParts ? [chips('part', [['all', 'All'], ['is', 'In-Sample'], ['oos', 'Out-Of-Sample']])] : []),
      h('p', { class: 'hint-line' }, `Slices examined so far: ${seen.size}.`));
    parts.push(filters);

    if (sources.length > 1 && f.source === 'all') parts.push(h('div', { class: 'mentor-note' }, h('b', null, 'Mixed Sources'), h('p', null, 'Backtest, demo and live results answer different questions. Look at one source at a time.')));

    const snoop = snoopingNote(seen.size);
    if (snoop) parts.push(h('div', { class: 'mentor-note' }, h('b', null, 'Snooping Warning'), h('p', null, snoop)));

    if (!rs.length) {
      parts.push(card('', h('p', null, 'No trades match these filters.')));
      host.replaceChildren(...parts);
      return;
    }

    const iv = bootstrapInterval(rs, { seed });
    const flip = signFlip(rs, { seed: seed + 1, runs: 4000 });
    const need = tradesNeeded(rs);
    const dd = s.maxDrawdown;
    parts.push(card('How Sure Are You?',
      h('p', { class: 'an-big' }, `${s.n} trades. ${sampleBand(s.n)}.`),
      iv.lo === null ? h('p', null, 'With fewer than two trades there is no interval to draw.') : h('p', { html: `The average could plausibly be anywhere from <b>${R2(iv.lo)}</b> to <b>${R2(iv.hi)}</b> (standard error ${iv.se.toFixed(2)}R).` }),
      iv.lo === null ? null : h('p', null, iv.includesZero ? 'Zero, meaning no edge, is still plausible.' : iv.lo > 0 ? 'The whole interval is above zero. That is some evidence, not proof.' : 'The whole interval is below zero.'),
      flip.p === null ? null : h('p', null, `Random outcomes with the same sizes did this well in ${Math.round(flip.p * 100)}% of runs.`),
      need ? h('p', null, `At this spread of results, roughly ${need} trades are needed to tell an average of +0.2R from zero.`) : null,
      h('p', { class: 'hint-line' }, 'The intervals are approximate. The size label is a teaching aid. The interval is the real answer.')));

    parts.push(card('The Numbers',
      h('div', { class: 'an-grid' },
        stat('Trades', String(s.n)),
        stat('Win Rate', P0(s.winRate), `${s.wins} wins, ${s.losses} losses, ${s.breakeven} breakeven`),
        stat('Expectancy', R2(s.expectancy), 'Average R'),
        stat('Median R', R2(s.medianR), Math.abs(s.medianR - s.avgR) > 0.3 ? 'Far from the mean: outliers matter' : ''),
        stat('Profit Factor', s.profitFactor === null ? 'Not defined' : s.profitFactor.toFixed(2), s.profitFactor === null ? 'No losses yet' : s.n < 30 ? 'Few trades: treat with care' : ''),
        stat('Average Winner', R2(s.avgWin)),
        stat('Average Loser', R2(s.avgLoss)),
        stat('Longest Streaks', `${s.streaks.win} W · ${s.streaks.loss} L`),
        stat('Max Drawdown', dd.depth ? R2(-dd.depth) : '0R', dd.depth ? (dd.recoveredI === null ? `Not yet recovered (trades ${dd.peakI}–${dd.troughI})` : `Trades ${dd.peakI}–${dd.troughI}, recovered at ${dd.recoveredI}`) : ''))));

    const cum = cumulative(rs);
    const band = reshuffleBand(rs, { seed: seed + 2, runs: 300 });
    parts.push(card('Equity Curve In R', lineSvg({ values: cum, band, label: 'Cumulative R with the band made by reordering the same trades' }), h('p', { class: 'hint-line' }, 'The shaded band is where curves land when the SAME trades come in a different order. A lot of the wiggle is order luck.')));

    const hist = histogram(rs, 0.5);
    const meanAt = (mean(rs) - hist[0].from) / 0.5;
    const medAt = (median(rs) - hist[0].from) / 0.5;
    parts.push(card('Distribution Of R', barsSvg({ bins: hist.map((b) => ({ label: b.from.toFixed(1), n: b.n, color: b.to <= 0 ? '#FF5C8A' : '#2DD4BF' })), marks: [{ at: Math.max(0, meanAt), label: 'mean', color: '#FFC83D' }, { at: Math.max(0, medAt), label: 'median', color: '#A78BFA' }], label: 'Histogram of R' })));

    const groupBy = { Session: (t) => SESSION_LABEL[t.session] || t.session, Direction: (t) => t.direction, 'Day Of Week': dow, Setup: (t) => t.setup || 'none' };
    let gsel = 'Session';
    const gHost = h('div');
    const drawG = () => {
      const g = byGroup(list.map((t) => ({ ...t, r: t.r })), groupBy[gsel]);
      gHost.replaceChildren(
        h('div', { class: 'choices wrap' }, ...Object.keys(groupBy).map((k) => h('button', { type: 'button', class: 'opt small' + (gsel === k ? ' sel' : ''), onclick: () => { gsel = k; drawG(); } }, k))),
        h('table', { class: 'stim-table' }, h('thead', null, h('tr', null, ...['Group', 'n', 'Average R', 'Interval'].map((x) => h('th', null, x)))),
          h('tbody', null, ...g.map((x) => h('tr', null, h('td', null, String(x.key)), h('td', null, String(x.n)), h('td', null, R2(x.mean)), h('td', null, x.lo === null ? 'Too few' : `${R2(x.lo)} to ${R2(x.hi)}`))))),
        h('p', { class: 'hint-line' }, 'Two groups differ only if their intervals clearly do not overlap. Most differences here are noise.'));
    };
    drawG();
    parts.push(card('Results By Group', gHost));

    if (flagInfo) {
      const counts = {};
      for (const t of list) for (const fl of flagInfo.flags.get(t.id) || []) counts[fl] = (counts[fl] || 0) + 1;
      parts.push(card('Behavior Flags',
        Object.keys(counts).length ? h('div', null, ...Object.entries(counts).map(([k, n]) => h('div', { class: 'part-score' }, h('span', null, FLAGS[k]), h('b', null, String(n))))) : h('p', null, 'No flags in this set.'),
        flagInfo.heldWinners !== null && flagInfo.heldLosers !== null ? h('p', null, `Average time held: winners ${Math.round(flagInfo.heldWinners)} minutes, losers ${Math.round(flagInfo.heldLosers)} minutes.`) : null,
        h('p', { class: 'hint-line' }, 'Flags describe. They do not judge. For each one, write what the rule would have been.')));
    }

    const answers = [
      `${f.source === 'all' ? 'All sources' : f.source}, ${s.n} trades${hasParts && f.part !== 'all' ? ', ' + f.part : ''}.`,
      iv.lo === null ? 'Too few trades to say.' : `The average could be anywhere from ${R2(iv.lo)} to ${R2(iv.hi)}.`,
      null,
      dd.depth ? `The deepest fall so far is ${R2(-dd.depth)}. Your Risk Plan sets what that means in money.` : 'No fall yet.',
      `${sampleBand(s.n)}. Results here are from: ${f.source === 'all' ? 'mixed sources' : f.source}.`,
      iv.lo === null ? 'Too few to say.' : iv.includesZero ? 'Not shown. The interval includes zero.' : iv.lo > 0 ? 'The interval is above zero. That is some evidence, not proof.' : 'The interval is below zero.',
      `${s.n} trades. ${need ? `About ${need} would be needed to tell +0.2R from zero.` : ''}`,
      flip.p === null ? '—' : `Random outcomes did this well in ${Math.round(flip.p * 100)}% of runs. You have looked at ${seen.size} slices.`
    ];
    parts.push(card('The Evidence Card', ...EVIDENCE_QUESTIONS.map(([q, kind], i) => h('div', { class: 'ev-q' }, h('b', null, q), kind === 'auto' ? h('p', null, answers[i]) : h('textarea', { class: 'written', rows: 2, 'aria-label': q, placeholder: 'You write this one.' })))));

    host.replaceChildren(...parts);
  };
  draw();
  if (note) host.prepend(h('p', { class: 'hint-line' }, note));
  host.__filters = f;
  return host;
}
