/** The Colonnade (the curriculum map) and the level page. */

import { app } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount, rich, mdInline } from '../ui/dom.js';
import { button, card, chip, bar, icon, ornament } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { columnSvg } from '../ui/mark.js';
import { roman } from '../ui/roman.js';
import { levelStatus, levelProgress, lessonStatus, examStatus, rankName } from '../learn/progress.js';

const PHASE_COLOR = { A: 'teal', B: 'violet', C: 'rose', D: 'gold' };

const STATUS_LABEL = { locked: 'Locked', planned: 'Coming Soon', available: 'Ready', 'in-progress': 'In Progress', passed: 'Complete' };

export function curriculumView(_p, query = {}) {
  const c = app.content;
  const st = app.state;
  const screen = begin({ title: 'The Colonnade', tab: 'curriculum' });
  const levels = c.levels.filter((l) => l.number >= 1);
  const l0 = c.levelByNumber.get(0);

  // default selection: the first level that is not passed and not planned, else the last real level
  const firstOpen = levels.find((l) => !l.planned && levelStatus(l, st, c) !== 'passed' && levelStatus(l, st, c) !== 'locked');
  let selected = query.level ? +query.level : firstOpen ? firstOpen.number : 1;

  const detail = h('div', { class: 'level-detail' });
  const cols = h('div', { class: 'cols' });

  const draw = () => {
    cols.replaceChildren(...levels.map((l) => {
      const s = levelStatus(l, st, c);
      const state = s === 'locked' || s === 'planned' ? 'locked' : s === 'passed' ? 'done' : 'open';
      const progress = s === 'passed' ? 1 : l.planned ? 0 : Math.max(levelProgress(l, st, c), s === 'in-progress' ? 0.06 : 0);
      const b = h('button', { type: 'button', class: 'lv' + (l.number === selected ? ' sel' : ''), 'aria-label': `Level ${roman(l.number)}: ${l.title}. ${STATUS_LABEL[s]}`, onclick: () => { selected = l.number; draw(); } },
        columnSvg({ progress, phase: PHASE_COLOR[l.phase] || 'teal', state, index: l.number }), h('span', null, String(l.number)));
      return b;
    }));
    const l = c.levelByNumber.get(selected);
    detail.replaceChildren(levelCard(l));
  };

  const levelCard = (l) => {
    const s = levelStatus(l, st, c);
    const prog = levelProgress(l, st, c);
    const body = [
      h('div', { class: 'num' }, 'Level ' + roman(l.number)),
      h('div', { class: 'ttl' }, l.title),
      chip(STATUS_LABEL[s], s === 'passed' ? 'emerald' : s === 'locked' || s === 'planned' ? 'sky' : 'gold'),
      rich(l.purpose, 'p', { class: 'purpose' })
    ];
    if (!l.planned) {
      body.push(h('small', null, `${l.lessonIds.length} lessons`), bar(s === 'passed' ? 1 : prog, { label: 'Level progress' }));
      body.push(button(s === 'locked' ? 'See The Level' : 'Open The Level', { onClick: () => go(`#/level/${l.number}`) }));
    } else {
      body.push(h('p', { class: 'hint-line' }, s === 'locked' ? 'This level is being built and opens after the level before it.' : 'This level is being built.'));
      if (l.previewLessonIds && l.previewLessonIds.length) {
        body.push(h('p', { class: 'hint-line' }, 'A preview of one lesson is ready to try now.'), ...l.previewLessonIds.map((id) => button(`Try Lesson ${c.lessons.get(id).number}: ${c.lessons.get(id).title}`, { variant: 'ghost', onClick: () => go(`#/lesson/${id}`) })));
      }
    }
    return h('div', { class: 'lvcard' }, ...body);
  };

  const l0s = levelStatus(l0, st, c);
  const orient = h('a', { class: 'card orient', href: '#/level/0' }, h('div', null, h('b', null, 'Orientation'), h('span', null, `${l0.lessonIds.filter((id) => st.lessons[id]?.state === 'completed').length} of ${l0.lessonIds.length} done`)), chip(l0s === 'passed' ? 'Complete' : 'Start Here', l0s === 'passed' ? 'emerald' : 'gold'));

  mount(screen,
    h('div', { class: 'pedi' }, h('div', { class: 'pedi-svg', html: '<svg viewBox="0 0 361 62" preserveAspectRatio="none"><path d="M6 60 L180.5 6 L355 60 Z" fill="rgba(11,16,48,.7)" stroke="url(#hlsGold)" stroke-width="3" stroke-linejoin="round"/></svg>' }), h('b', null, `Rank · ${rankName(st.rank.current)}`)),
    cols,
    h('div', { class: 'legend2' }, h('span', null, h('i', { style: { background: 'var(--teal)' } }), 'Foundations'), h('span', null, h('i', { style: { background: 'var(--imperial-hi)' } }), 'Reading Price'), h('span', null, h('i', { style: { background: 'var(--rose)' } }), 'Risk'), h('span', null, h('i', { style: { background: 'var(--gold)' } }), 'Strategy')),
    detail,
    orient);
  draw();
}

/* ------------------------------------------------------------------ one level */

export function levelView({ n }) {
  const c = app.content;
  const st = app.state;
  const level = c.levelByNumber.get(+n);
  const screen = begin({ title: level ? `Level ${roman(level.number)}` : 'Level', back: '#/curriculum', tab: 'curriculum' });
  if (!level) return mount(screen, card(h('p', null, 'That level does not exist.')));

  const s = levelStatus(level, st, c);
  const head = h('div', { class: 'level-head' },
    h('div', { class: 'eyebrow' }, level.number === 0 ? 'Orientation' : 'Level ' + roman(level.number)),
    h('h1', null, level.title),
    ornament(),
    rich(level.purpose, 'p', { class: 'purpose' }),
    chip(STATUS_LABEL[s], s === 'passed' ? 'emerald' : s === 'locked' ? 'sky' : 'gold'));

  const objectives = level.objectives && level.objectives.length
    ? h('details', { class: 'objectives' }, h('summary', null, 'What You Will Be Able To Do'), h('ul', { class: 'l-list' }, ...level.objectives.map((o) => h('li', { html: mdInline(o) }))))
    : null;

  const ids = level.lessonIds.length ? level.lessonIds : level.previewLessonIds || [];
  const rows = ids.map((id) => {
    const l = c.lessons.get(id);
    const ls = lessonStatus(l, st, c);
    const done = ls === 'completed';
    const locked = ls === 'locked';
    return h('a', { class: `lrow ${ls}`, href: locked ? null : `#/lesson/${id}`, 'aria-disabled': locked ? 'true' : null, onclick: (e) => { if (locked) e.preventDefault(); } },
      h('span', { class: 'lnum' }, l.number),
      h('span', { class: 'ltxt' }, h('b', null, l.title), h('em', null, `${l.estMinutes} min${l.preview ? ' · Preview' : ''}`)),
      h('span', { class: 'lstate' }, done ? icon('check', 20) : locked ? icon('lock', 18) : ls === 'in-progress' ? chip('Continue', 'gold') : null));
  });

  const exam = level.finalBlueprint ? examCard(level) : null;
  mount(screen, head, objectives, h('div', { class: 'lessons' }, ...rows), exam);
}

function examCard(level) {
  const c = app.content;
  const st = app.state;
  const bp = c.blueprints.get(level.finalBlueprint);
  const es = examStatus(level, st, c);
  const record = st.exams[bp.id];
  const last = record && record.attempts[record.attempts.length - 1];
  const kids = [h('div', { class: 'exam-title' }, bp.title), h('p', null, bp.intro)];
  if (record && record.passed) kids.push(chip('Passed', 'emerald'));
  else if (last) kids.push(h('p', { class: 'hint-line' }, `Last attempt: ${Math.round(last.overall * 100)}% · ${statusText(last.status)}`));
  if (es.available) kids.push(button(last ? 'Retake The Assessment' : 'Begin The Assessment', { onClick: () => go(`#/exam/${bp.id}`) }));
  else if (es.reviewPending) kids.push(h('p', { class: 'hint-line' }, es.reason), button('Start The Targeted Review', { onClick: () => go(`#/review/${bp.id}`) }));
  else if (last && (last.status === 'awaiting-mentor' || es.passed)) kids.push(button('See The Result', { variant: 'ghost', onClick: () => go(`#/exam-result/${bp.id}/${last.attemptId}`) }));
  else kids.push(h('p', { class: 'hint-line' }, es.reason));
  return h('div', { class: 'card exam-card' }, ...kids);
}

export const statusText = (s) => ({ passed: 'Passed', failed: 'Not yet', 'failed-written': 'Written answer needs work', 'awaiting-mentor': 'Waiting for your mentor' })[s] || s;
