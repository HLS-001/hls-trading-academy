/**
 * Time zones without fixed offsets.
 *
 * Every instant is a UTC epoch in milliseconds. A zone (an IANA name such as "America/Guyana")
 * is only ever used to DISPLAY an instant or to turn a wall-clock time into an instant, always
 * through the engine's tz database (Intl), so a session that is defined on London's clock stays
 * correct when the UK changes its clocks and Guyana does not.
 */

const cache = new Map();

function formatter(tz) {
  if (!cache.has(tz)) {
    cache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short'
      })
    );
  }
  return cache.get(tz);
}

/** Wall-clock parts of an instant in a zone, plus the zone's UTC offset in minutes at that instant. */
export function partsInZone(ms, tz) {
  const p = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
  const year = +p.year;
  const month = +p.month;
  const day = +p.day;
  const hour = +p.hour === 24 ? 0 : +p.hour;
  const minute = +p.minute;
  const second = +p.second;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMin = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  return { year, month, day, hour, minute, second, weekday: p.weekday, offsetMin };
}

export const offsetMinutes = (ms, tz) => partsInZone(ms, tz).offsetMin;

/**
 * The instant at which a zone's clock shows a given wall time.
 *   gap       'forward' (default): a time skipped by spring-forward moves to the first real time after it.
 *             'error': throw instead.
 *   ambiguous 'first' (default): a time repeated by fall-back means its first occurrence. 'second' the later.
 */
export function instantFromWall(tz, year, month, day, hour = 0, minute = 0, { gap = 'forward', ambiguous = 'first' } = {}) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const oBefore = offsetMinutes(wall - 86400000, tz);
  const oAfter = offsetMinutes(wall + 86400000, tz);
  const cBefore = wall - oBefore * 60000;
  const cAfter = wall - oAfter * 60000;
  const okBefore = offsetMinutes(cBefore, tz) === oBefore;
  const okAfter = offsetMinutes(cAfter, tz) === oAfter;
  if (okBefore && okAfter) {
    if (cBefore === cAfter) return cBefore;
    const early = Math.min(cBefore, cAfter);
    const late = Math.max(cBefore, cAfter);
    return ambiguous === 'second' ? late : early;
  }
  if (okBefore) return cBefore;
  if (okAfter) return cAfter;
  if (gap === 'error') throw new Error(`${year}-${month}-${day} ${hour}:${minute} does not exist in ${tz}`);
  return cBefore; // spring-forward gap: interpret with the offset that applied before the change
}

/** Local calendar date of an instant in a zone, as YYYY-MM-DD. */
export function dateInZone(ms, tz) {
  const p = partsInZone(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export const parseDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
};

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zone involved). */
export function addDays(iso, n) {
  const { year, month, day } = parseDate(iso);
  const t = new Date(Date.UTC(year, month - 1, day + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- display */

const ABBR = {
  'America/Guyana': 'GYT',
  'Asia/Tokyo': 'JST',
  'UTC': 'UTC',
  'Etc/UTC': 'UTC'
};

const ABBR_LOCALE = (tz) => (tz.startsWith('Europe/') ? 'en-GB' : tz.startsWith('Australia/') ? 'en-AU' : 'en-US');

/** Short zone label at an instant: EDT, BST, GYT, JST, or UTC+5:30 when no common abbreviation exists. */
export function tzAbbr(ms, tz) {
  if (ABBR[tz]) return ABBR[tz];
  try {
    const name = new Intl.DateTimeFormat(ABBR_LOCALE(tz), { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date(ms))
      .find((x) => x.type === 'timeZoneName').value;
    if (!/^GMT[+-]/.test(name)) return name;
  } catch (e) {
    /* fall through to the numeric label */
  }
  const off = offsetMinutes(ms, tz);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return 'UTC' + sign + h + (m ? ':' + String(m).padStart(2, '0') : '');
}

/** "08:30 EDT" style label for an instant in a zone. */
export function formatTime(ms, tz, { abbr = true, seconds = false } = {}) {
  const p = partsInZone(ms, tz);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  const ss = seconds ? ':' + String(p.second).padStart(2, '0') : '';
  return `${hh}:${mm}${ss}` + (abbr ? ' ' + tzAbbr(ms, tz) : '');
}

/** "Tue 10 Mar, 08:30 EDT" */
export function formatDateTime(ms, tz) {
  const p = partsInZone(ms, tz);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.month - 1];
  return `${p.weekday} ${p.day} ${mon}, ${formatTime(ms, tz)}`;
}

/** Hours difference of two zones at an instant (a minus b). */
export const hoursApart = (ms, tzA, tzB) => (offsetMinutes(ms, tzA) - offsetMinutes(ms, tzB)) / 60;

/** The first Sunday on or after a date, or the nth Sunday of a month, for DST reference tables. */
export function nthSunday(year, month, n) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const t = new Date(Date.UTC(year, month - 1, d));
    if (t.getUTCMonth() !== month - 1) break;
    if (t.getUTCDay() === 0 && ++count === n) return d;
  }
  return null;
}
export function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = last; d > last - 7; d--) if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 0) return d;
  return null;
}

/** The weeks in a year when the US and the UK are on different clock offsets from each other. */
export function usUkMismatchWindows(year) {
  return [
    { from: `${year}-03-${String(nthSunday(year, 3, 2)).padStart(2, '0')}`, to: `${year}-03-${String(lastSunday(year, 3)).padStart(2, '0')}` },
    { from: `${year}-10-${String(lastSunday(year, 10)).padStart(2, '0')}`, to: `${year}-11-${String(nthSunday(year, 11, 1)).padStart(2, '0')}` }
  ];
}

/** A short list of zones for the picker. Any IANA name is accepted elsewhere. */
export const COMMON_ZONES = [
  { tz: 'America/Guyana', label: 'Guyana' },
  { tz: 'America/New_York', label: 'New York' },
  { tz: 'Europe/London', label: 'London' },
  { tz: 'Europe/Berlin', label: 'Frankfurt' },
  { tz: 'Asia/Tokyo', label: 'Tokyo' },
  { tz: 'Australia/Sydney', label: 'Sydney' },
  { tz: 'America/Chicago', label: 'Chicago' },
  { tz: 'America/Los_Angeles', label: 'Los Angeles' },
  { tz: 'America/Toronto', label: 'Toronto' },
  { tz: 'America/Barbados', label: 'Barbados' },
  { tz: 'America/Port_of_Spain', label: 'Trinidad' },
  { tz: 'America/Jamaica', label: 'Jamaica' },
  { tz: 'America/Sao_Paulo', label: 'Brazil' },
  { tz: 'Asia/Dubai', label: 'Dubai' },
  { tz: 'Asia/Kolkata', label: 'India' },
  { tz: 'UTC', label: 'UTC' }
];
