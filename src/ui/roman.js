/** Roman numerals mark levels (Level IV); ordinary numbers mark lessons (4.02) and all data. */
/** "Level IV", or "Track P" for the practical track. */
export const levelLabel = (l) => (l && l.track ? 'Track ' + l.track : 'Level ' + roman(l ? l.number : 0));

export function roman(n) {
  if (!Number.isInteger(n) || n <= 0) return n === 0 ? '0' : String(n);
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of map) while (n >= v) {
    out += r;
    n -= v;
  }
  return out;
}
