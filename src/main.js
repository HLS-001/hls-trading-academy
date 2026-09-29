/** HLS Trading Academy: start-up. */

import { boot, app, kv, subscribe, emit } from './core/app.js';
import { route, start, onNotFound, beforeNavigate, go } from './core/router.js';
import { installDefs, launchScreen } from './ui/mark.js';
import { initShell, begin, showUpdateBanner } from './ui/shell.js';
import { closeSheet, card, button } from './ui/kit.js';
import { h, mount } from './ui/dom.js';
import { runCleanup } from './views/cleanup.js';
import { todayView } from './views/today.js';
import { curriculumView, levelView } from './views/curriculum.js';
import { lessonView } from './views/lesson.js';
import { examView, examResultView, reviewView } from './views/exam.js';
import { warmupView, focusView } from './views/session.js';
import { practiceView, pipValuePage, labPage } from './views/practice.js';
import { progressView } from './views/progress.js';
import { settingsView } from './views/settings.js';
import { mentorView, mentorReviewView } from './views/mentor.js';
import { welcomeView } from './views/welcome.js';

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || new URLSearchParams(location.search).has('nosw')) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const announce = (worker) => showUpdateBanner(() => worker.postMessage({ type: 'SKIP_WAITING' }));
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
      });
    });
    // check for a new version whenever the app comes back to the front
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  }).catch((e) => console.warn('Service worker not registered', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // the first install also takes control of the page; only an UPDATE should reload it
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

function fatal(err) {
  console.error(err);
  document.body.append(h('div', { class: 'fatal' }, h('h1', null, 'Something Went Wrong'), h('p', null, err.message || String(err)), h('p', { class: 'hint-line' }, 'Close the app and open it again. Your progress is stored on this device.')));
}

async function main() {
  installDefs();
  initShell();
  registerServiceWorker();

  // the launch screen plays while the lessons load
  const params = new URLSearchParams(location.search);
  const skipLaunch = params.has('nolaunch');
  if (params.has('test')) {
    // the smoke test plays the student through the real UI
    window.__HLS_TEST = { app, emit };
    await import('./dev/drive.js');
  }
  let seenLaunch = false;
  const bootPromise = boot();
  try {
    await bootPromise;
  } catch (e) {
    return fatal(e);
  }
  seenLaunch = !!(await kv.get('launchSeen'));
  if (!skipLaunch) await launchScreen({ short: seenLaunch });
  kv.set('launchSeen', true);

  route('/today', () => todayView());
  route('/welcome', () => welcomeView());
  route('/curriculum', (p, q) => curriculumView(p, q));
  route('/level/:n', (p) => levelView(p));
  route('/lesson/:id', (p) => lessonView(p));
  route('/exam/:bp', (p) => examView(p));
  route('/exam-result/:bp/:attempt', (p) => examResultView(p));
  route('/review/:bp', (p) => reviewView(p));
  route('/warmup', () => warmupView());
  route('/focus/:concept', (p, q) => focusView(p, q));
  route('/practice', () => practiceView());
  route('/practice/pip-value', () => pipValuePage());
  route('/practice/lab/:id', (p) => labPage(p));
  route('/progress', () => progressView());
  route('/settings', () => settingsView());
  route('/mentor', () => mentorView());
  route('/mentor/review/:wid', (p) => mentorReviewView(p));
  onNotFound(() => {
    const el = begin({ title: 'Not Found', tab: null });
    mount(el, card({ class: 'center' }, h('p', null, 'That page does not exist.'), h('div', { class: 'qactions' }, button('Back To Today', { onClick: () => go('#/today') }))));
  });

  beforeNavigate((_from, to) => {
    runCleanup();
    closeSheet();
    // a celebration belongs to the screen that earned it; do not let its leaves drift over the next title
    document.querySelectorAll('.burst').forEach((n) => n.remove());
    if (!app.state.profile.createdAt && !['/welcome', '/settings'].includes(to.path)) {
      go('#/welcome', { replace: true });
      return false;
    }
    return true;
  });

  subscribe((e) => {
    if (e.type === '__store-error') console.warn('Storage problem: progress may not be saved.');
  });

  start();
}

main().catch(fatal);
