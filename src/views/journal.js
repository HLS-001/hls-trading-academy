/**
 * The Journal. Trades entered by hand, trades from Backtest Lab runs, the accuracy audit on every save, the behavior flags,
 * and the analytics with their uncertainty. Appears in the bottom bar once lesson 13.09 is done.
 */

import { app, emit } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { button, card, chip, screenTitle, toast } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { deliverFile } from '../core/platform.js';
import { MARKETS, pretty } from '../calc/markets.js';
import { SOURCES, SESSION_IDS, SESSION_LABEL, MANAGEMENT, FLAGS, auditTrade, auditPassed, behaviorFlags, journalAccuracy, rFromTrade, suggestSession } from '../learn/journal.js';
import { analyticsPanel } from '../interactives/analytics.js';
import { runEvents, partOf } from '../learn/protocol.js';
import { lessonDone } from '../learn/progress.js';
import { journalRules, releasedPack } from '../learn/methodology.js';

export const journalOpen = (st) => lessonDone(st, 'l13-journal') || !!st.settings.testOut || Object.keys(st.journal || {}).length > 0;

const plan = () => (app.state.docs.riskplan && app.state.docs.riskplan.data) || {};
const cap = () => app.state.settings.riskCapPct ?? 1;

/** Backtest Lab trades, read from the runs as journal entries. */
export function backtestTrades(st) {
  const out = [];
  for (const run of Object.values(st.backtests || {})) {
    const evs = runEvents(run);
    const all = [...evs.is, ...evs.oos];
    for (const l of run.log) {
      if (l.kind !== 'trade') continue;
      const e = all.find((x) => x.bar === l.bar);
      out.push({ id: `bt-${run.id}-${l.bar}`, source: 'backtest', runId: run.id, part: partOf(l.bar), date: '2026-01-01', time: '00:00', market: 'EURUSD', direction: 'long', session: 'none', setup: 'Training Rule', resultR: l.recordedR, r: l.recordedR, entry: e && e.entry, bar: l.bar, readOnly: true });
    }
  }
  return out.filter((t) => typeof t.r === 'number');
}

export const allTrades = (st) => [...Object.values(st.journal || {}), ...backtestTrades(st)];

const toRow = (t) => ({ ...t, r: typeof t.resultR === 'number' ? t.resultR : 0 });

/* ---------------------------------------------------------------------------------- the list */

export function journalView(_p, q = {}) {
  const screen = begin({ title: 'Journal', tab: 'journal' });
  const st = app.state;
  const tab = q.tab === 'stats' ? 'stats' : 'trades';
  const manual = Object.values(st.journal).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const bt = backtestTrades(st);
  const acc = journalAccuracy(manual, (t) => ({ riskCap: cap(), plan: plan(), sameDay: manual.filter((x) => x.date === t.date && x.time <= t.time).length }));
  const flagInfo = behaviorFlags(manual, plan());

  const seg = h('div', { class: 'choices wrap' },
    h('button', { type: 'button', class: 'opt small' + (tab === 'trades' ? ' sel' : ''), onclick: () => go('#/journal') }, 'Trades'),
    h('button', { type: 'button', class: 'opt small' + (tab === 'stats' ? ' sel' : ''), onclick: () => go('#/journal?tab=stats') }, 'Analytics'));

  let body;
  if (tab === 'stats') {
    const rows = [...manual.map(toRow), ...bt];
    body = rows.length ? analyticsPanel({ trades: rows, flagInfo, note: 'Every figure shows how many trades it rests on.' }) : card({}, h('p', null, 'Nothing to analyse yet. Add a trade, or run the Backtest Lab.'));
  } else {
    body = h('div', null,
      card({}, h('div', { class: 'card-title' }, 'Journal Accuracy'), acc.n ? h('p', null, `${acc.pass} of your last ${acc.n} entries pass every check.`) : h('p', null, 'Add a trade to see how accurate your records are.'), h('p', { class: 'hint-line' }, 'Failures are notes to fix. They are not penalties for trading.')),
      h('div', { class: 'qactions' }, button('Add A Trade', { onClick: () => go('#/journal/new') }),
        button('Export CSV', { variant: 'ghost', onClick: () => exportCsv() }), button('Export JSON', { variant: 'ghost', onClick: async () => { await deliverFile(`hls-journal-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ trades: manual, backtestTrades: bt }, null, 2)); } })),
      ...manual.map((t) => {
        const a = auditTrade(t, { riskCap: cap(), plan: plan(), sameDay: manual.filter((x) => x.date === t.date && x.time <= t.time).length });
        const fl = flagInfo.flags.get(t.id) || [];
        return h('a', { class: 'card review-item', href: `#/journal/${t.id}` },
          h('div', null, h('b', null, `${pretty(t.market || 'EURUSD')} ${t.direction || ''}`), h('span', null, `${t.date} ${t.time} UTC · ${t.source}`), h('em', null, fl.length ? fl.map((x) => FLAGS[x]).join(', ') : 'No flags')),
          h('div', { class: 'ri-side' }, h('b', null, typeof t.resultR === 'number' ? (t.resultR > 0 ? '+' : t.resultR < 0 ? '−' : '') + Math.abs(t.resultR).toFixed(2) + 'R' : '—'), chip(auditPassed(a) ? 'Checks Pass' : 'Notes To Fix', auditPassed(a) ? 'emerald' : 'gold')));
      }),
      ...(bt.length ? [card({}, h('div', { class: 'card-title' }, 'From The Backtest Lab'), h('p', null, `${bt.length} trades from your runs are included in Analytics, marked as backtest.`))] : []),
      ...(manual.length === 0 && bt.length === 0 ? [card({}, h('p', null, 'No trades yet.'))] : []));
  }
  mount(screen, screenTitle('Journal', 'Every trade, checked against its own prices.'), seg, body);

  function exportCsv() {
    const head = ['date', 'time_utc', 'source', 'market', 'direction', 'session', 'setup', 'entry', 'stop', 'target', 'exit', 'lots', 'risk_pct', 'result_r'];
    const lines = [head.join(',')].concat(manual.map((t) => head.map((k) => JSON.stringify(k === 'time_utc' ? t.time : k === 'risk_pct' ? t.riskPct : k === 'result_r' ? t.resultR : t[k] ?? '')).join(',')));
    deliverFile(`hls-journal-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'));
  }
}

/* ---------------------------------------------------------------------------------- the form */

const newId = () => 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export function journalFormView({ id } = {}) {
  const screen = begin({ title: id === 'new' ? 'New Trade' : 'Trade', back: '#/journal', tab: 'journal' });
  const existing = id && id !== 'new' ? app.state.journal[id] : null;
  const t = existing ? { ...existing } : { id: newId(), source: 'demo', direction: 'long', management: ['none'], date: new Date().toISOString().slice(0, 10), time: '13:00', market: 'EURUSD', session: 'newyork', violations: '' };
  const auditHost = h('div', { class: 'card rp-checks' });
  const numbers = {};
  const draw = () => {
    const sameDay = Object.values(app.state.journal).filter((x) => x.id !== t.id && x.date === t.date && x.time <= t.time).length + 1;
    const a = auditTrade(t, { riskCap: cap(), plan: plan(), sameDay });
    auditHost.replaceChildren(h('div', { class: 'card-title' }, 'Accuracy Audit'), ...a.map((c) => h('div', { class: 'rp-check ' + (c.ok ? 'ok' : 'todo') }, h('span', null, c.ok ? '✓' : c.ok === null ? '·' : '○'), h('span', null, c.text))));
  };
  const field = (label, control, hint) => h('label', { class: 'jf' }, h('span', { class: 'jf-l' }, label), control, hint ? h('em', null, hint) : null);
  const text = (key, { type = 'text', placeholder = '', rows = 0 } = {}) => {
    const c = rows ? h('textarea', { class: 'written', rows, placeholder, 'aria-label': key }) : h('input', { type, class: 'jf-in', placeholder, 'aria-label': key });
    c.value = t[key] ?? '';
    c.addEventListener('input', () => { t[key] = c.value; if (key === 'date' || key === 'time') suggest(); draw(); });
    return c;
  };
  const numeric = (key, placeholder = '') => {
    const c = h('input', { type: 'text', inputmode: 'decimal', class: 'jf-in', placeholder, 'aria-label': key });
    c.value = typeof t[key] === 'number' ? String(t[key]) : '';
    c.addEventListener('input', () => { const v = parseFloat(c.value.replace(',', '.')); if (c.value.trim() === '' || Number.isNaN(v)) delete t[key]; else t[key] = v; draw(); });
    numbers[key] = c;
    return c;
  };
  const chipsFor = (key, items, single = true) => h('div', { class: 'choices wrap' }, ...items.map(([v, label]) => {
    const b = h('button', { type: 'button', class: 'opt small', 'data-v': v, onclick: () => {
      if (single) { t[key] = v; b.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x.dataset.v === v)); } else {
        const cur = new Set(t[key] || []);
        if (v === 'none') { cur.clear(); cur.add('none'); } else { cur.delete('none'); cur.has(v) ? cur.delete(v) : cur.add(v); if (!cur.size) cur.add('none'); }
        t[key] = [...cur];
        b.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', cur.has(x.dataset.v)));
      }
      draw();
    } }, label);
    if (single ? t[key] === v : (t[key] || []).includes(v)) b.classList.add('sel');
    return b;
  }));
  const sessionChips = chipsFor('session', [...SESSION_IDS.map((k) => [k, SESSION_LABEL[k]]), ['none', 'Between Sessions']]);
  const suggest = () => {
    if (!t.date || !t.time) return;
    const s = suggestSession(t.date, t.time);
    t.session = s;
    sessionChips.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x.dataset.v === s));
  };
  const marketSel = h('select', { class: 'jf-in', 'aria-label': 'Market' }, ...MARKETS.map((m) => h('option', { value: m.symbol }, pretty(m.symbol))));
  marketSel.value = t.market;
  marketSel.addEventListener('change', () => { t.market = marketSel.value; draw(); });
  const useR = button('Use R From The Prices', { variant: 'ghost', onClick: () => { const r = rFromTrade(t); if (r === null) return toast('Enter the entry, stop and exit first.'); t.resultR = Math.round(r * 100) / 100; numbers.resultR.value = String(t.resultR); draw(); } });
  const shot = h('input', { type: 'checkbox', 'aria-label': 'Screenshot' });
  shot.checked = !!t.screenshot;
  shot.addEventListener('change', () => { t.screenshot = shot.checked; draw(); });

  const save = () => {
    const plannedSame = Object.values(app.state.journal).filter((x) => x.id !== t.id && x.date === t.date && x.time <= t.time).length + 1;
    const a = auditTrade(t, { riskCap: cap(), plan: plan(), sameDay: plannedSame });
    const breach = a.find((c) => c.id === 'violations' && c.ok === false);
    if (breach && (!t.violations || !t.violations.trim() || /^none$/i.test(t.violations.trim()))) t.violations = breach.text.replace('Rule breaches to record: ', '');
    emit('journal.save', { trade: t });
    toast('Saved');
    go('#/journal');
  };
  const violationsIn = text('violations', { rows: 2, placeholder: 'Write none if there were none.' });
  const packRules = journalRules(releasedPack(app.state));
  const ruleChips = packRules.length ? h('div', { class: 'choices wrap' }, ...packRules.map((r) => h('button', { type: 'button', class: 'opt small', onclick: (e) => {
    const cur = (t.violations || '').split('\n').map((x) => x.trim()).filter((x) => x && !/^none$/i.test(x));
    const at = cur.indexOf(r.label);
    if (at >= 0) cur.splice(at, 1); else cur.push(r.label);
    t.violations = cur.join('\n');
    violationsIn.value = t.violations;
    e.currentTarget.classList.toggle('sel', at < 0);
    draw();
  } }, r.label))) : null;
  draw();
  mount(screen,
    screenTitle(existing ? 'Edit Trade' : 'New Trade', 'The audit checks the record against itself as you type.'),
    card({}, h('div', { class: 'card-title' }, 'When And What'),
      field('Date', text('date', { type: 'date' })), field('Time (UTC)', text('time', { type: 'time' }), 'Stored in UTC. The session is suggested from it.'),
      field('Market', marketSel), field('Direction', chipsFor('direction', [['long', 'Long'], ['short', 'Short']])),
      field('Session', sessionChips), field('Source', chipsFor('source', SOURCES.filter((s) => s.id !== 'backtest').map((s) => [s.id, s.label]))),
      field('Setup', text('setup', { placeholder: 'The setup from your strategy, or none' })), field('Planned Entry Level', numeric('plannedEntry', 'Optional'), 'Used to flag chased entries.')),
    card({}, h('div', { class: 'card-title' }, 'Prices And Size'),
      field('Entry', numeric('entry')), field('Stop-Loss', numeric('stop')), field('Take-Profit', numeric('target', 'If planned')), field('Exit', numeric('exit')),
      field('Exit Time (UTC)', text('exitTime', { type: 'time' }), 'Optional. Used for time held.'),
      field('Lots', numeric('lots')), field('Risk (%)', numeric('riskPct')), field('Money At Risk', numeric('riskMoney')),
      field('Result In R', numeric('resultR')), useR),
    card({}, h('div', { class: 'card-title' }, 'What Happened'),
      field('Trade Management', chipsFor('management', MANAGEMENT.map((m) => [m.id, m.label]), false)),
      field('Reason For Entry', text('reason', { rows: 2 })), field('Strongest Case Against', text('disconfirming', { rows: 2 }), 'Empty is itself a signature.'),
      field('Rule Violations', violationsIn), ...(ruleChips ? [field('Your Mentor\'s Rules You Broke', ruleChips, 'From the released methodology.')] : []), field('Notes', text('notes', { rows: 2 })),
      h('label', { class: 'rp-toggle' }, shot, h('span', null, 'A screenshot of the chart is saved (required for demo and live).'))),
    auditHost,
    h('div', { class: 'qactions' }, button('Save', { onClick: save }), ...(existing ? [button('Delete', { variant: 'ghost', onClick: () => { emit('journal.delete', { id: t.id }); go('#/journal'); } })] : [])));
}
