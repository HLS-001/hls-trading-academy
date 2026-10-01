/**
 * The interface for a chart question: the chart, then one card per part (choose a word, mark candles, label swings,
 * type a measurement). In practice it runs the feedback ladder:
 *
 *   1  first check          full credit
 *   2  a Socratic hint      the part that is wrong is marked, nothing is revealed; full credit on the retry, flagged hinted
 *   3  the region is shown  the definition is quoted, the region highlighted; half credit
 *   4  the answer           shown with the explanation; no credit, and the question comes back later
 *
 * In an exam there is one attempt and no feedback until the end.
 */

import { h, mdInline } from '../ui/dom.js';
import { button } from '../ui/kit.js';
import { chartView } from '../ui/chartview.js';
import { numberEntry } from '../ui/keypad.js';
import { gradeChart } from '../charts/tasks.js';
import { formatDateTime } from '../time/zones.js';

const setKinds = new Set(['pick', 'many']);

export function chartUI(q, { exam, commit }) {
  const chart = q.chart;
  const resp = {};
  const listeners = [];
  const changed = () => listeners.forEach((f) => f());
  let attempt = 0;
  let locked = false;
  let active = (q.parts.find((p) => setKinds.has(p.kind)) || {}).id || null;
  const refreshers = [];

  const view = chartView({ candles: chart.candles, dp: chart.dp, bands: chart.bands, lines: chart.lines, points: chart.points, times: chart.times, tz: chart.tz, onCursor: () => refreshers.forEach((f) => f()) });

  /* ---- marks on the chart come from every mark part ---- */
  const drawMarks = (extra = []) => {
    const marks = [];
    for (const p of q.parts) if (setKinds.has(p.kind)) (resp[p.id] || []).forEach((i) => marks.push({ i, tone: 'sel' }));
    view.update({ marks: [...marks, ...extra] });
  };

  const isDone = (p) => {
    const v = resp[p.id];
    switch (p.kind) {
      case 'options': return !!v;
      case 'pick': return Array.isArray(v) && v.length === (p.count || 1);
      case 'many': return Array.isArray(v) && v.length > 0;
      case 'label': return p.items.every((it) => v && v[it.id]);
      case 'number': return v !== undefined && v !== '' && !Number.isNaN(Number(String(v).replace('−', '-')));
      default: return false;
    }
  };

  /* ---- one card per part ---- */
  const cards = q.parts.map((p) => {
    const card = h('div', { class: 'cv-part' + (p.id === active ? ' active' : ''), 'data-part': p.id });
    const title = h('p', { class: 'cv-part-title' }, p.prompt);
    const body = h('div', { class: 'cv-part-body' });
    const msg = h('p', { class: 'cv-part-msg', hidden: true });
    card.append(title, body, msg);
    const view$ = { p, card, msg, refresh: () => {}, disable: () => {}, showResult: () => {} };

    if (p.kind === 'options') {
      const chips = p.options.map((o) => h('button', { type: 'button', class: 'opt small', 'data-v': o.id, onclick: () => { if (locked) return; resp[p.id] = o.id; view$.refresh(); changed(); } }, o.label));
      body.append(h('div', { class: 'flaw-chips' }, ...chips));
      view$.refresh = () => chips.forEach((c) => c.classList.toggle('sel', c.dataset.v === resp[p.id]));
      view$.disable = () => chips.forEach((c) => (c.disabled = true));
      view$.showResult = (r) => chips.forEach((c) => {
        const right = c.dataset.v === p.answer || (p.accept || []).includes(c.dataset.v);
        if (right && (r.revealed || c.dataset.v === resp[p.id])) c.classList.add('right');
        else if (c.dataset.v === resp[p.id]) c.classList.add('wrong');
      });
    } else if (setKinds.has(p.kind)) {
      const status = h('span', { class: 'cv-picked' }, 'Nothing marked yet');
      const markBtn = button('Mark This Candle', { variant: 'ghost', onClick: () => mark(p) });
      markBtn.classList.add('small');
      const clear = button('Clear', { variant: 'ghost', onClick: () => { if (locked) return; resp[p.id] = []; view$.refresh(); drawMarks(); changed(); } });
      clear.classList.add('small');
      body.append(status, h('div', { class: 'cv-part-actions' }, markBtn, clear));
      view$.refresh = () => {
        const picks = resp[p.id] || [];
        const rel = (i) => i - (chart.candles.length - 1);
        status.textContent = picks.length ? 'Marked: ' + picks.map((i) => (chart.times ? formatDateTime(chart.times[i], chart.tz) : rel(i) === 0 ? 'latest bar' : 'bar ' + String(rel(i)).replace('-', '−'))).join(', ') : p.kind === 'pick' ? 'Nothing marked yet' : 'Nothing marked yet. You can mark several.';
        markBtn.textContent = view.cursor === null ? 'Tap A Candle First' : picks.includes(view.cursor) ? 'Unmark This Candle' : 'Mark This Candle';
        markBtn.disabled = locked || view.cursor === null;
        card.classList.toggle('active', p.id === active);
      };
      view$.disable = () => { markBtn.disabled = true; clear.disabled = true; };
      card.addEventListener('click', () => { if (!locked) { active = p.id; refreshers.forEach((f) => f()); } });
    } else if (p.kind === 'label') {
      const rows = p.items.map((it) => {
        const opts = p.options[it.type] || p.options.seg;
        const chips = opts.map((o) => h('button', { type: 'button', class: 'opt small', 'data-v': o, onclick: () => { if (locked) return; resp[p.id] = { ...(resp[p.id] || {}), [it.id]: o }; view$.refresh(); changed(); } }, o.toUpperCase() === o ? o : o.charAt(0).toUpperCase() + o.slice(1)));
        const badge = h('button', { type: 'button', class: 'cv-badge', 'aria-label': `Show ${it.id} on the chart`, onclick: () => { if (it.i !== undefined) view.setCursor(it.i); } }, it.id);
        return { it, chips, el: h('div', { class: 'cv-label-row' }, badge, h('div', { class: 'flaw-chips' }, ...chips)) };
      });
      body.append(...rows.map((r) => r.el));
      view$.refresh = () => rows.forEach((r) => r.chips.forEach((c) => c.classList.toggle('sel', (resp[p.id] || {})[r.it.id] === c.dataset.v)));
      view$.disable = () => rows.forEach((r) => r.chips.forEach((c) => (c.disabled = true)));
      view$.showResult = (r) => rows.forEach((row) => {
        const mine = (resp[p.id] || {})[row.it.id];
        const right = p.answer[row.it.id];
        row.chips.forEach((c) => {
          if (c.dataset.v === right && (r.revealed || mine === right)) c.classList.add('right');
          else if (c.dataset.v === mine) c.classList.add('wrong');
        });
      });
    } else if (p.kind === 'number') {
      const entry = numberEntry({ suffix: p.unit === '%' ? '%' : '', placeholder: '0', submitLabel: 'Done', onSubmit: () => {}, max: 7 });
      entry.field.onChange = ((orig) => (v) => { orig(v); resp[p.id] = v; changed(); })(entry.field.onChange);
      body.append(entry.el);
      view$.disable = () => entry.keypad.remove();
      view$.showResult = (r) => entry.display.classList.add(r.ok ? 'right' : 'wrong');
    }
    refreshers.push(() => view$.refresh());
    return view$;
  });

  function mark(p) {
    if (locked || view.cursor === null) return;
    const i = view.cursor;
    const picks = [...(resp[p.id] || [])];
    const at = picks.indexOf(i);
    if (at >= 0) picks.splice(at, 1);
    else if (p.kind === 'pick') {
      picks.push(i);
      while (picks.length > (p.count || 1)) picks.shift();
    } else picks.push(i);
    resp[p.id] = picks;
    active = p.id;
    drawMarks();
    refreshers.forEach((f) => f());
    changed();
  }

  const note = chart.note ? h('p', { class: 'cv-note', html: mdInline(chart.note) }) : null;
  const ladder = h('div', { class: 'cv-ladder', 'aria-live': 'polite' });
  const actions = h('div', { class: 'qactions' });
  const node = h('div', { class: 'chartui' }, note, view.el, ...cards.map((c) => c.card), ladder);
  refreshers.forEach((f) => f());

  /* ---- the ladder (practice only) ---- */
  const showParts = (res, level) => {
    res.parts.forEach((r, k) => {
      const c = cards[k];
      c.card.classList.toggle('needs', !r.ok);
      c.msg.hidden = r.ok || level < 1;
      if (!r.ok && level === 1) c.msg.textContent = q.parts[k].hint || 'Look again at the definition.';
      if (!r.ok && level >= 2) c.msg.textContent = [r.message, q.parts[k].hint].filter(Boolean).join(' ');
    });
  };

  const practiceCheck = () => {
    if (locked || !q.parts.every(isDone)) return;
    attempt += 1;
    const res = gradeChart(q, resp);
    if (res.correct) return commit({ ...resp }, { mult: attempt >= 3 ? 0.5 : 1, hinted: attempt > 1 });
    if (attempt === 1) {
      showParts(res, 1);
      ladder.replaceChildren(h('p', { class: 'hint-line' }, 'Not quite. Read the hint under the part that needs work, change your answer and check again.'));
      checkBtn.textContent = 'Check Again';
    } else if (attempt === 2) {
      showParts(res, 2);
      const bands = q.parts.flatMap((p, k) => (!res.parts[k].ok && p.highlight ? [{ from: p.highlight.from, to: p.highlight.to, tone: 'violet', label: '' }] : []));
      view.update({ bands: [...chart.bands, ...bands] });
      const quote = chart.note ? [h('p', { class: 'hint-line', html: mdInline(chart.note) })] : [];
      ladder.replaceChildren(h('p', { class: 'hint-line' }, 'The shaded region is where to look.'), ...quote);
      checkBtn.textContent = 'Check Once More';
    } else return commit({ ...resp }, { revealed: true });
  };

  const checkBtn = button('Check', { onClick: practiceCheck, id: 'check-btn' });
  const showBtn = button('Show Me', { variant: 'ghost', onClick: () => { if (!locked) commit({ ...resp }, { revealed: true }); } });
  const syncButtons = () => { checkBtn.disabled = locked || !q.parts.every(isDone); };
  listeners.push(syncButtons);
  syncButtons();
  if (!exam) {
    actions.append(checkBtn, showBtn);
    node.append(actions);
  }

  const api = {
    node,
    ownSubmit: !exam,
    getResponse: () => ({ ...resp }),
    isComplete: () => q.parts.every(isDone),
    onChange: (f) => listeners.push(f),
    lock: (result) => {
      locked = true;
      view.setTappable(false);
      cards.forEach((c) => c.disable());
      actions.remove();
      node.querySelectorAll('.cv-part-msg').forEach((m) => (m.hidden = true));
      if (!result) return;
      const revealed = !!result.revealed;
      const extra = [];
      q.parts.forEach((p, k) => {
        const r = result.parts[k];
        cards[k].showResult({ ok: r.ok, revealed });
        cards[k].card.classList.toggle('needs', !r.ok);
        if (!setKinds.has(p.kind)) return;
        const picks = resp[p.id] || [];
        picks.forEach((i) => extra.push({ i, tone: p.answer.includes(i) ? 'right' : 'wrong' }));
        p.answer.forEach((i) => { if (!picks.includes(i) && (revealed || !r.ok)) extra.push({ i, tone: 'missed' }); });
      });
      const marks = extra.filter((m, k) => extra.findIndex((x) => x.i === m.i) === k);
      view.update({ marks });
    }
  };

  // a hook for the test driver: set every part's answer without tapping
  node.__setResponse = (r) => {
    Object.assign(resp, r);
    cards.forEach((c) => c.refresh());
    drawMarks();
    changed();
  };
  return api;
}
