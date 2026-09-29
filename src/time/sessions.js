/**
 * Session definitions and windows.
 *
 * A session is defined on ITS OWN clock (anchorTz), so it follows that market's daylight saving
 * automatically. A "reference clock" window (e.g. 20:00-02:00 New York time) uses the same shape.
 * Every window resolves to a UTC interval for a specific calendar date.
 *
 * The default set is a CONVENTION (typical FX-desk hours), editable, and labelled as such.
 * Custom sets (the mentor's own windows) are just more data.
 */

import { instantFromWall, parseDate, addDays, dateInZone, formatTime, hoursApart } from './zones.js';

export const CONVENTIONAL_SET = {
  id: 'conventional-v1',
  label: 'Conventional Market Hours',
  status: 'convention',
  note: 'Typical FX-desk hours on each market\'s own clock. A convention, not a rule: every value is editable.',
  sessions: [
    { id: 'tokyo', label: 'Asian (Tokyo)', anchorTz: 'Asia/Tokyo', startLocal: '09:00', endLocal: '18:00' },
    { id: 'frankfurt', label: 'Frankfurt', anchorTz: 'Europe/Berlin', startLocal: '08:00', endLocal: '17:00' },
    { id: 'london', label: 'London', anchorTz: 'Europe/London', startLocal: '08:00', endLocal: '17:00' },
    { id: 'newyork', label: 'New York', anchorTz: 'America/New_York', startLocal: '08:00', endLocal: '17:00' }
  ]
};

const hm = (s) => s.split(':').map(Number);

/**
 * The window of `def` that STARTS on local calendar date `dateISO` (in the session's own zone).
 * A window whose end is not after its start wraps past midnight and ends on the next local date.
 */
export function resolveWindow(def, dateISO) {
  const { year, month, day } = parseDate(dateISO);
  const [sh, sm] = hm(def.startLocal);
  const [eh, em] = hm(def.endLocal);
  const wraps = eh * 60 + em <= sh * 60 + sm;
  const startMs = instantFromWall(def.anchorTz, year, month, day, sh, sm);
  const endDate = wraps ? parseDate(addDays(dateISO, 1)) : { year, month, day };
  const endMs = instantFromWall(def.anchorTz, endDate.year, endDate.month, endDate.day, eh, em);
  return { id: def.id, label: def.label, anchorTz: def.anchorTz, startMs, endMs, wraps };
}

/** All windows of a set that start on the given local date of each session's own zone. */
export const windowsForDate = (set, dateISO) => set.sessions.map((s) => resolveWindow(s, dateISO));

/** Which sessions of a set are open at an instant. */
export function sessionsOpenAt(set, ms) {
  const open = [];
  for (const def of set.sessions) {
    const localDate = dateInZone(ms, def.anchorTz);
    for (const d of [addDays(localDate, -1), localDate]) {
      const w = resolveWindow(def, d);
      if (ms >= w.startMs && ms < w.endMs) {
        open.push(w);
        break;
      }
    }
  }
  return open;
}

/**
 * A table of when each session opens and closes on a date, in the student's own clock.
 * The date is the local date in each session's own zone.
 */
export function clockTable(set, dateISO, userTz) {
  return windowsForDate(set, dateISO).map((w) => ({
    id: w.id,
    label: w.label,
    open: formatTime(w.startMs, userTz),
    close: formatTime(w.endMs, userTz),
    openMarket: formatTime(w.startMs, w.anchorTz),
    closeMarket: formatTime(w.endMs, w.anchorTz),
    startMs: w.startMs,
    endMs: w.endMs
  }));
}

/** Overlap of two windows, or null. */
export function overlap(a, b) {
  const s = Math.max(a.startMs, b.startMs);
  const e = Math.min(a.endMs, b.endMs);
  return e > s ? { startMs: s, endMs: e } : null;
}

/** The gap in hours between two markets' clocks on a date (a minus b). */
export const clockGap = (dateISO, tzA, tzB) => hoursApart(instantFromWall('UTC', ...Object.values(parseDate(dateISO)), 12, 0), tzA, tzB);
