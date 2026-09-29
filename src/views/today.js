/** Today: one clear next action, the Warm-Up, and where you stand. */

import { app } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { button, pill, ring, ornament } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { markStatic } from '../ui/mark.js';
import { dualClock } from '../interactives/clock.js';
import { formatTime, partsInZone } from '../time/zones.js';
import { studyStreak } from '../core/derive.js';
import { nextLesson, examStatus, dueConcepts, programProgress, rankName, levelStatus } from '../learn/progress.js';
import { weakAreas } from '../learn/weak.js';
import { registerCleanup } from './cleanup.js';
import { roman } from '../ui/roman.js';

const greeting = (tz) => {
  const hr = partsInZone(Date.now(), tz).hour;
  return hr < 12 ? 'Good Morning' : hr < 18 ? 'Good Afternoon' : 'Good Evening';
};

export function todayView() {
  const st = app.state;
  const c = app.content;
  const now = Date.now();
  const screen = begin({ title: 'Today', tab: 'today' });

  const streak = studyStreak(st, now);
  const due = dueConcepts(st, now);
  const weak = weakAreas(st, c, now);
  const next = nextLesson(st, c);
  const progress = programProgress(st, c);

  /* the single next action */
  const level1 = c.levelByNumber.get(1);
  let action;
  const pendingReview = Object.values(st.written).filter((w) => w.status === 'pending').length;
  const examReady = c.levels.filter((l) => !l.planned && l.finalBlueprint).map((l) => ({ l, s: examStatus(l, st, c) })).find((x) => x.s.available);
  const targeted = c.levels.filter((l) => l.finalBlueprint).map((l) => ({ l, s: examStatus(l, st, c) })).find((x) => x.s.reviewPending);
  if (targeted) {
    action = { title: 'Targeted Review', text: `${targeted.s.reviewPending.length} concept${targeted.s.reviewPending.length === 1 ? '' : 's'} to practice before your retake.`, label: 'Start The Review', route: `#/review/${targeted.l.finalBlueprint}` };
  } else if (next && (!examReady || next.level === 0)) {
    action = { title: `Continue · ${next.number}`, text: `${next.title} · ${next.estMinutes} min`, label: st.lessons[next.id] ? 'Continue The Lesson' : 'Start The Lesson', route: `#/lesson/${next.id}` };
  } else if (examReady) {
    action = { title: `Level ${roman(examReady.l.number)} Assessment Ready`, text: 'You have finished every lesson in this level.', label: 'Begin The Assessment', route: `#/exam/${examReady.l.finalBlueprint}` };
  } else if (levelStatus(level1, st, c) === 'passed') {
    action = { title: 'Level I Complete', text: 'The next levels are being built. Keep your Warm-Up going.', label: 'Open The Curriculum', route: '#/curriculum' };
  } else {
    action = { title: 'Begin', text: 'Start with the Orientation.', label: 'Start Orientation', route: '#/lesson/l00-how-it-works' };
  }

  const hello = h('div', { class: 'hello' },
    h('div', { class: 'phead' }, markStatic(38), h('b', null, 'HLS Trading Academy')),
    h('h1', null, st.profile.name ? `${greeting(st.settings.tz)}, ${st.profile.name}` : greeting(st.settings.tz)),
    ornament(),
    h('div', { class: 'pills' }, streak > 0 ? pill(`Study Streak ${streak}`) : pill('Study Streak 0'), progress.total ? pill(`Levels Passed ${progress.passed} Of ${progress.total}`, 't') : null));

  const clocksHost = h('div', { class: 'clocks-host' }, dualClock('America/New_York', 'New York'));
  const tick = setInterval(() => mount(clocksHost, dualClock('America/New_York', 'New York')), 20000);
  registerCleanup(() => clearInterval(tick));

  const warmupCard = h('a', { class: 'card tile gold', href: due.length ? '#/warmup' : '#/warmup', 'aria-label': 'Warm-Up' },
    ring(due.length ? Math.min(1, due.length / 10) : 0, { size: 68, text: String(due.length) }),
    h('b', null, 'Warm-Up'),
    h('span', null, Object.keys(st.concepts).length ? `${due.length} due · ${weak.length} weak` : 'Unlocks after lesson 1'));
  const continueCard = h('a', { class: 'card tile', href: action.route }, h('b', null, action.title.split(' · ')[0]), h('span', null, action.text));
  const rankCard = h('a', { class: 'card tile', href: '#/progress' }, h('b', null, 'Rank'), h('span', null, rankName(st.rank.current)), h('span', null, `${progress.passed} of ${progress.total} levels`));
  const weakCard = h('a', { class: 'card tile', href: '#/progress' }, h('b', null, 'Weak Areas'), weak.length ? weak.slice(0, 2).map((w) => h('span', { key: w.concept }, w.name)) : h('span', null, 'None yet'));

  const notices = [];
  if (pendingReview) notices.push(h('div', { class: 'notice' }, `${pendingReview} written answer${pendingReview === 1 ? ' is' : 's are'} waiting for your mentor.`));
  const lastBackup = st.backups.lastMs;
  if (st.eventCount > 25 && (!lastBackup || now - lastBackup > 7 * 86400000)) notices.push(h('a', { class: 'notice warn', href: '#/settings' }, 'Your progress is only on this phone. Tap to back it up.'));

  mount(screen, hello, clocksHost, ...notices,
    h('div', { class: 'grid2' }, warmupCard, continueCard, rankCard, weakCard),
    button(action.label, { block: true, onClick: () => go(action.route), id: 'primary-action' }));
}
