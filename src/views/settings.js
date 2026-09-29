/** Settings: name, time zone, backup and restore, install help, and the way into Mentor Mode. */

import { app, emit, reloadState, resetEverything } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { button, card, toast, confirmSheet, screenTitle } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { COMMON_ZONES, tzAbbr } from '../time/zones.js';
import { deliverFile, readFile, isStandalone, isIOS } from '../core/platform.js';

export function makePackage(kind = 'all') {
  const events = app.store ? null : null;
  return app.store.allEvents().then((all) => {
    const list = kind === 'mentor' ? all.filter((e) => e.type.startsWith('mentor.') || e.type === 'settings.set') : all;
    return JSON.stringify({ app: 'hls-trading-academy', schema: 1, kind, exportedAt: new Date().toISOString(), profile: { name: app.state.profile.name }, events: list });
  });
}

export async function importPackage(file) {
  const text = await readFile(file);
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not a valid backup.');
  }
  if (pkg.app !== 'hls-trading-academy' || !Array.isArray(pkg.events)) throw new Error('That file is not an HLS Trading Academy backup.');
  const ok = pkg.events.filter((e) => e && typeof e.id === 'string' && typeof e.t === 'number' && typeof e.type === 'string');
  await app.store.putEvents(ok);
  await reloadState();
  return ok.length;
}

export function settingsView() {
  const st = app.state;
  const screen = begin({ title: 'Settings', back: '#/today' });

  const nameIn = h('input', { type: 'text', value: st.profile.name, maxlength: 30, autocomplete: 'off', 'aria-label': 'Your name', onchange: (e) => { emit('profile.set', { name: e.target.value.trim() }); toast('Saved'); } });
  const zones = COMMON_ZONES.some((z) => z.tz === st.settings.tz) ? COMMON_ZONES : [{ tz: st.settings.tz, label: st.settings.tz }, ...COMMON_ZONES];
  const tzSel = h('select', { 'aria-label': 'Time zone', onchange: (e) => { emit('settings.set', { key: 'tz', value: e.target.value }); toast('Time zone saved'); } }, ...zones.map((z) => h('option', { value: z.tz, selected: z.tz === st.settings.tz }, `${z.label} (${tzAbbr(Date.now(), z.tz)})`)));

  const last = st.backups.lastMs;
  const backup = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Backup'),
    h('p', null, 'Your progress lives on this device. A backup is a file you can keep in Files, iCloud Drive, or send to yourself. Restoring it on a fresh install brings everything back.'),
    h('p', { class: 'hint-line' }, last ? 'Last backup: ' + new Date(last).toLocaleString() : 'No backup yet.'),
    h('div', { class: 'qactions col' },
      button('Back Up Now', { onClick: async () => {
        const stamp = new Date().toISOString().slice(0, 10);
        const how = await deliverFile(`hls-academy-backup-${stamp}.json`, await makePackage('all'));
        if (how !== 'cancelled') {
          emit('backup.done');
          toast(how === 'shared' ? 'Backup shared' : 'Backup saved');
          settingsView();
        }
      } }),
      restoreControl('Restore From A Backup')));

  const install = !isStandalone() && isIOS()
    ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Install On Your iPhone'), h('ol', { class: 'l-list' }, h('li', null, 'Open this page in Safari.'), h('li', null, 'Tap the Share button.'), h('li', null, 'Choose Add to Home Screen.')), h('p', { class: 'hint-line' }, 'It then opens full screen and works without a connection.'))
    : null;

  const mentor = h('a', { class: 'card practice-tile', href: '#/mentor' }, h('div', null, h('b', null, 'Mentor Mode'), h('span', null, 'Review written answers and see the student record.')), h('span', { class: 'chev' }, '›'));

  const about = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'About'),
    h('p', null, `HLS Trading Academy · lessons version ${app.content.version || ''}`),
    h('p', { class: 'hint-line' }, `Storage: ${app.store.mode === 'idb' ? 'on this device' : 'temporary (private window)'}${app.persistent ? ', kept by the browser' : ''}.`),
    h('p', { class: 'hint-line' }, 'Education only. Not financial advice. Finishing the program does not mean you have a profitable strategy.'));

  const danger = h('div', { class: 'card danger-zone' }, h('div', { class: 'card-title' }, 'Start Over'),
    h('p', { class: 'hint-line' }, 'Removes all progress from this device. Back up first.'),
    button('Erase Everything', { variant: 'danger', onClick: async () => {
      const yes = await confirmSheet({ title: 'Erase Everything?', body: 'All progress on this device will be deleted. This cannot be undone unless you have a backup.', confirm: 'Erase', danger: true });
      if (yes) {
        await resetEverything();
        go('#/welcome');
      }
    } }));

  mount(screen,
    screenTitle('Settings'),
    h('div', { class: 'card' }, h('label', { class: 'field' }, h('span', null, 'Your Name'), nameIn), h('label', { class: 'field' }, h('span', null, 'Time Zone'), tzSel), h('p', { class: 'hint-line' }, 'Markets keep their own clocks. Yours is used to show market times in your time.')),
    backup, install, mentor, about, danger);
}

export function restoreControl(label) {
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'file-input', 'aria-label': label, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const n = await importPackage(f);
      toast(`Restored ${n} records`);
      go('#/today');
    } catch (err) {
      toast(err.message, { ms: 4000 });
    }
    input.value = '';
  } });
  return h('label', { class: 'btn ghost file-btn' }, label, input);
}
