/**
 * The application singleton: content, derived state, store, and the event bus.
 *
 *   emit(type, payload)  appends an event to the log, updates the derived state, and tells subscribers.
 *
 * Views never change state directly. They emit events.
 */

import { openStore, requestPersistence } from './store.js';
import { replay, applyEvent, initialState } from './derive.js';
import { indexContent } from './content.js';

export const app = {
  content: null,
  state: initialState(),
  store: null,
  listeners: new Set(),
  storeError: null,
  persistent: false
};

let counter = 0;
export function newId() {
  const t = Date.now().toString(36).padStart(9, '0');
  const r = crypto.getRandomValues(new Uint32Array(2));
  counter = (counter + 1) % 1296;
  return `${t}${counter.toString(36).padStart(2, '0')}${r[0].toString(36).padStart(7, '0')}${r[1].toString(36).padStart(7, '0')}`;
}

export async function boot({ bundleUrl = './content/bundle.json' } = {}) {
  app.store = await openStore();
  const res = await fetch(bundleUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load the lessons (' + res.status + ').');
  app.content = indexContent(await res.json());
  app.state = replay(await app.store.allEvents());
  requestPersistence().then((p) => (app.persistent = p));
  return app;
}

export function subscribe(fn) {
  app.listeners.add(fn);
  return () => app.listeners.delete(fn);
}

export function emit(type, payload = {}, at = Date.now()) {
  const event = { id: newId(), t: at, type, payload };
  applyEvent(app.state, event);
  app.store.putEvent(event).catch((e) => {
    app.storeError = e;
    console.error('Could not save an event', e);
    for (const fn of app.listeners) fn({ type: '__store-error', event });
  });
  for (const fn of app.listeners) fn(event);
  return event;
}

/** Rebuild the derived state from the stored log (after an import, for example). */
export async function reloadState() {
  app.state = replay(await app.store.allEvents());
  for (const fn of app.listeners) fn({ type: '__reload' });
}

export async function resetEverything() {
  await app.store.clearAll();
  app.state = initialState();
  for (const fn of app.listeners) fn({ type: '__reload' });
}

export const kv = {
  get: (k) => app.store.getKV(k),
  set: (k, v) => app.store.setKV(k, v),
  del: (k) => app.store.delKV(k)
};
