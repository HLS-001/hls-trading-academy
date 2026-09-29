/** Seeded random numbers, so any problem, exam paper or simulation can be replayed from its seed. */

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max, step) => {
      const v = min + next() * (max - min);
      if (!step) return v;
      const n = Math.round((v - min) / step);
      const decimals = (String(step).split('.')[1] || '').length;
      return +(min + n * step).toFixed(decimals);
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Returns a shuffled copy. */
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** True with probability p. */
    chance: (p) => next() < p,
    /** Derive an independent generator. */
    fork: (label) => makeRng((Math.floor(next() * 4294967296) ^ hashSeed(String(label))) >>> 0)
  };
  return rng;
}

/** A fresh seed for user-facing randomness (not for anything that must be replayed). */
export const freshSeed = () => (Math.floor(Math.random() * 4294967296) ^ Date.now()) >>> 0;
