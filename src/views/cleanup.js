/** Things a screen starts (timers) must be stopped when the next screen appears. */

let fns = [];

export function registerCleanup(fn) {
  fns.push(fn);
}

export function runCleanup() {
  const list = fns;
  fns = [];
  for (const f of list) {
    try {
      f();
    } catch (e) {
      console.warn('cleanup failed', e);
    }
  }
}
