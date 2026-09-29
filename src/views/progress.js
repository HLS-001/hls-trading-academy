/** Progress: rank, levels, skill meters, mastery by topic, and the Weak Areas recommendations. */

import { app } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { button, card, bar, chip, screenTitle } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { roman } from '../ui/roman.js';
import { studyStreak } from '../core/derive.js';
import { levelProgress, levelStatus, programProgress, rankName, RANKS } from '../learn/progress.js';
import { masteryOf, statusOf, STATUS_LABEL } from '../learn/mastery.js';
import { weakAreas, examAccuracy } from '../learn/weak.js';

export function progressView() {
  const st = app.state;
  const c = app.content;
  const now = Date.now();
  const screen = begin({ title: 'Progress', tab: 'progress' });

  const prog = programProgress(st, c);
  const nextRank = RANKS[Math.min(RANKS.length - 1, RANKS.findIndex((r) => r.id === st.rank.current) + 1)];

  const rank = h('div', { class: 'card rank-card' },
    h('div', { class: 'eyebrow' }, 'Your Rank'),
    h('div', { class: 'rank-name' }, rankName(st.rank.current)),
    h('p', { class: 'hint-line' }, `Next: ${nextRank.name}. ${nextRank.requires}.`),
    h('p', { class: 'honest' }, 'A rank shows what you have learned. It does not show that you have a profitable strategy.'));

  const levels = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Levels'),
    ...c.levels.filter((l) => !l.planned).map((l) => {
      const s = levelStatus(l, st, c);
      return h('a', { class: 'lvl-row', href: `#/level/${l.number}` }, h('span', null, l.number === 0 ? 'Orientation' : `Level ${roman(l.number)} · ${l.title}`), bar(s === 'passed' ? 1 : levelProgress(l, st, c)), h('b', null, s === 'passed' ? 'Done' : Math.round(levelProgress(l, st, c) * 100) + '%'));
    }),
    h('p', { class: 'hint-line' }, `${prog.passed} of ${prog.total} levels passed. More levels are being built.`));

  // skill meters: only those whose feature exists
  const num = st.counters.kinds.numeric;
  const meters = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Skill Meters'),
    meter('Calculation Accuracy', num && num.n ? num.sum / num.n : null, num ? num.n : 0),
    h('p', { class: 'hint-line' }, 'More meters appear as you unlock chart work, risk and journaling. Each shows how many items it is based on.'));

  // mastery by cluster
  const byCluster = {};
  for (const cs of Object.values(st.concepts)) {
    if (!cs.hist.length) continue;
    const meta = c.concepts.get(cs.concept);
    if (!meta || meta.cluster === 'number-skills' || meta.cluster === 'orientation') continue;
    (byCluster[meta.cluster] = byCluster[meta.cluster] || []).push({ meta, cs, mastery: masteryOf(cs, examAccuracy(st, cs.concept)) });
  }
  const topics = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'What You Know'),
    Object.keys(byCluster).length
      ? Object.entries(byCluster).flatMap(([cluster, list]) => list.map((x) => h('a', { class: 'topic-row', href: `#/focus/${x.meta.id}` }, h('span', null, x.meta.name), bar(x.mastery / 100), chip(STATUS_LABEL[statusOf(x.cs, x.mastery)], x.mastery >= 65 ? 'emerald' : x.mastery >= 40 ? 'gold' : 'sky'))))
      : h('p', { class: 'hint-line' }, 'Finish a lesson and your topics appear here.'));

  const weak = weakAreas(st, c, now);
  const weakBlock = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Review Weak Areas'),
    weak.length
      ? weak.slice(0, 4).map((w) => h('div', { class: 'weak-card' }, h('b', null, w.name), h('p', null, w.summary), h('div', { class: 'qactions col' }, ...w.actions.map((a, i) => button(a.label, { variant: i === 0 ? 'primary' : 'ghost', onClick: () => go(a.route) })))))
      : h('p', { class: 'hint-line' }, 'Nothing is slipping. If a topic keeps going wrong, it appears here with a plan.'));

  const exams = Object.entries(st.exams).flatMap(([bp, e]) => e.attempts.map((a) => ({ bp, a }))).sort((x, y) => y.a.t - x.a.t);
  const examBlock = exams.length
    ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Assessments'), ...exams.slice(0, 5).map(({ bp, a }) => h('a', { class: 'lvl-row', href: `#/exam-result/${bp}/${a.attemptId}` }, h('span', null, new Date(a.t).toLocaleDateString()), h('span', null, Math.round(a.overall * 100) + '%'), chip(a.status === 'passed' ? 'Passed' : a.status === 'awaiting-mentor' ? 'With Mentor' : 'Not Yet', a.status === 'passed' ? 'emerald' : 'gold'))))
    : null;

  mount(screen,
    screenTitle('Progress'),
    rank,
    h('div', { class: 'pills center' }, chip(`Study Streak ${studyStreak(st, now)}`, 'gold'), chip(`${Object.keys(st.concepts).length} Topics Started`, 'teal')),
    weakBlock, topics, levels, meters, examBlock);
}

function meter(label, value, n) {
  return h('div', { class: 'meter' }, h('div', { class: 'meter-top' }, h('span', null, label), h('b', null, value === null ? '—' : Math.round(value * 100) + '%')), bar(value || 0), h('small', null, n ? `Based on ${n} item${n === 1 ? '' : 's'}` : 'No items yet'));
}
