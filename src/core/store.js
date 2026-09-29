/**
 * Storage. IndexedDB when the browser allows it, in-memory otherwise (a private window may refuse).
 * The app treats the device copy as a WORKING COPY: Backup Now exports it (see backup.js), because
 * iOS can evict web storage under pressure.
 *
 * Two stores: "events" (the immutable log, keyed by id) and "kv" (settings-like values).
 */

const DB_NAME = 'hls-academy';
const DB_VERSION = 1;

function memoryStore() {
  const events = new Map();
  const kv = new Map();
  return {
    mode: 'memory',
    async allEvents() { return [...events.values()]; },
    async putEvent(e) { events.set(e.id, e); },
    async putEvents(list) { for (const e of list) events.set(e.id, e); },
    async getKV(k) { return kv.get(k); },
    async setKV(k, v) { kv.set(k, v); },
    async delKV(k) { kv.delete(k); },
    async clearAll() { events.clear(); kv.clear(); }
  };
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function openStore() {
  if (typeof indexedDB === 'undefined') return memoryStore();
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('events')) d.createObjectStore('events', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is blocked'));
    });
    // prove it works (some private modes open but refuse writes)
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: '__probe', v: 1 });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB unavailable, using memory:', e);
    return memoryStore();
  }

  const tx = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
  return {
    mode: 'idb',
    allEvents: () => wrap(tx('events').getAll()),
    putEvent: (e) => wrap(tx('events', 'readwrite').put(e)),
    putEvents: (list) => new Promise((resolve, reject) => {
      const t = db.transaction('events', 'readwrite');
      const s = t.objectStore('events');
      for (const e of list) s.put(e);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }),
    getKV: async (k) => (await wrap(tx('kv').get(k)))?.v,
    setKV: (k, v) => wrap(tx('kv', 'readwrite').put({ k, v })),
    delKV: (k) => wrap(tx('kv', 'readwrite').delete(k)),
    clearAll: () => new Promise((resolve, reject) => {
      const t = db.transaction(['events', 'kv'], 'readwrite');
      t.objectStore('events').clear();
      t.objectStore('kv').clear();
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    })
  };
}

/** Ask the browser to keep our storage. Best effort; iOS may or may not grant it. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) {
    /* ignore */
  }
  return false;
}
