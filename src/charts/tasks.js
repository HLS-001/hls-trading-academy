/**
 * Chart tasks: turn a synthetic chart and a task name into a `chart` question, and grade the student's marks.
 *
 * A chart question shows ONE chart and a list of parts. A part is one of
 *   options   choose one word            (structure: bullish / bearish / range / unclear)
 *   pick      tap k candles              (the most recent confirmed swing high)
 *   many      tap every candle that fits (all swing lows, all breaks)
 *   label     name each marked swing     (HH, LH, HL, LL)
 *   number    type a measurement         (how much of the impulse did the correction give back?)
 * Every reference answer comes from the detectors as of the decision bar. The question object holds plain data only, so it
 * can be stored, re-created from a seed and graded without any code being saved with it.
 *
 * Simulated. Illustrates a mechanism; predicts nothing.
 */

import { makeRng } from '../learn/rng.js';
import { makeChart, RECIPES } from './synth.js';
import { swings, structural, provisional, classify, lastOfType, structureEvents, firstBreach, labelSwings, rangeState } from './detect.js';
import { extremes } from './candles.js';
import { TASKS8, TIMED, timedMade } from './tasks-l8.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DEF_STRUCT = (n) => `Structural swings: find the order-1 swings (size ${n}) first. Keep a high only if it is above the order-1 highs on either side of it, and a low only if it is below the order-1 lows on either side.`;
const DEF_SWING = (n) => `A swing high has ${n} lower highs on each side; a swing low has ${n} higher lows on each side. It is confirmed once ${n} more bars have closed after it.`;

const setScore = (picks, truth) => {
  const t = new Set(truth);
  const p = new Set(picks);
  const tp = [...p].filter((i) => t.has(i)).length;
  const fp = p.size - tp;
  return { tp, fp, score: t.size ? Math.max(0, (tp - fp) / t.size) : 0, exact: tp === t.size && fp === 0 };
};

/* ------------------------------------------------------------------ grading */

/** Grade every part. response is { [partId]: value }. Returns the overall result plus a result for each part. */
export function gradeChart(q, response = {}) {
  const parts = q.parts.map((part) => gradePart(part, response[part.id]));
  const wsum = q.parts.reduce((a, p) => a + (p.weight || 1), 0);
  const score = q.parts.reduce((a, p, k) => a + (p.weight || 1) * parts[k].score, 0) / wsum;
  const correct = parts.every((r) => r.ok);
  const errorTags = [...new Set(parts.flatMap((r) => r.tags))];
  const wrong = parts.filter((r) => !r.ok);
  return {
    correct,
    score: correct ? 1 : score,
    errorTags,
    feedback: correct ? q.explanation || '' : (wrong.map((r) => r.message).filter(Boolean).join(' ') + ' ' + (q.explanation || '')).trim(),
    parts,
    expected: Object.fromEntries(q.parts.map((p) => [p.id, p.answer]))
  };
}

function gradePart(part, value) {
  const none = { ok: false, score: 0, tags: [], message: '', id: part.id };
  switch (part.kind) {
    case 'options': {
      if (!value) return none;
      const ok = value === part.answer || (part.accept || []).includes(value);
      const tag = part.tags && part.tags[value];
      return { id: part.id, ok, score: ok ? 1 : 0, tags: ok || !tag ? [] : [tag], message: ok ? '' : (part.messages && part.messages[value]) || '' };
    }
    case 'pick':
    case 'many': {
      const picks = Array.isArray(value) ? value : [];
      if (!picks.length) return none;
      const truth = part.answer;
      const s = setScore(picks, truth);
      const ok = s.exact || (part.accept && picks.length === truth.length && picks.every((i) => part.accept.includes(i)));
      const tags = [];
      let message = '';
      if (!ok) {
        for (const d of part.diag || []) {
          if (picks.some((i) => d.when.includes(i))) {
            tags.push(d.tag);
            message = message || d.feedback;
          }
        }
        if (!tags.length && part.fallbackTag) tags.push(part.fallbackTag);
        message = message || part.fallback || '';
      }
      return { id: part.id, ok: !!ok, score: ok ? 1 : s.score, tags: [...new Set(tags)], message };
    }
    case 'label': {
      const v = value || {};
      const ids = part.items.map((it) => it.id);
      const right = ids.filter((id) => v[id] === part.answer[id]);
      const ok = right.length === ids.length;
      return { id: part.id, ok, score: right.length / ids.length, tags: ok ? [] : [part.tag || 'compared-wrong-swing'], message: ok ? '' : part.fallback || '' };
    }
    case 'number': {
      const n = Number(String(value ?? '').replace(/[\s,%−]/g, (m) => (m === '−' ? '-' : '')));
      if (value === undefined || value === null || value === '' || !Number.isFinite(n)) return none;
      const ok = Math.abs(n - part.answer) <= part.tol;
      const tags = [];
      let message = '';
      if (!ok) {
        for (const d of part.diag || []) {
          if (Math.abs(n - d.value) <= part.tol) {
            tags.push(d.tag);
            message = d.feedback;
          }
        }
        message = message || part.fallback || '';
      }
      return { id: part.id, ok, score: ok ? 1 : 0, tags, message };
    }
    default:
      return none;
  }
}

/* ------------------------------------------------------------------ building the question */

const pickFrom = (rng, list) => (Array.isArray(list) ? rng.pick(list) : list);

function baseChart(made, extra = {}) {
  const cs = made.candles.slice(0, made.upto + 1);
  return { candles: cs, upto: made.upto, dp: 5, n: made.n, order: made.order, bands: [], lines: [], points: [], note: '', ...extra };
}

const swingList = (made) => {
  const sw = swings(made.candles, made.n, made.upto);
  return made.order === 2 ? structural(sw) : sw;
};

const STRUCT_OPTIONS = [
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
  { id: 'range', label: 'Range' },
  { id: 'unclear', label: 'Unclear' }
];

function structureOptionsPart(cls, id = 'structure', prompt = 'What is the structure?') {
  const s = cls.structure;
  const accept = cls.confidence === 'borderline' ? ['unclear', s] : [s];
  const trend = (x) => x === 'bullish' || x === 'bearish';
  const tags = {};
  const messages = {};
  for (const o of STRUCT_OPTIONS) {
    if (accept.includes(o.id)) continue;
    if (trend(o.id) && trend(s)) {
      tags[o.id] = 'direction-flip';
      messages[o.id] = 'You read the swings the wrong way round. Compare each swing with the one before it of the same kind.';
    } else if (trend(o.id) && s === 'range') {
      tags[o.id] = 'range-as-trend';
      messages[o.id] = 'The swings are level, not rising or falling. That is a range.';
    } else if (o.id === 'range') {
      tags[o.id] = 'trend-as-range';
      messages[o.id] = 'The highs and lows are moving, so the price is not held in a band.';
    } else if (o.id === 'unclear') {
      tags[o.id] = 'refused-clear';
      messages[o.id] = 'The swings agree with each other well enough to call it. Unclear is for charts that are genuinely mixed.';
    } else if (s === 'unclear') {
      tags[o.id] = 'forced-a-call';
      messages[o.id] = 'The highs and lows do not point the same way, so no structure can be called. Unclear is a valid answer.';
    }
  }
  return { id, kind: 'options', prompt, options: STRUCT_OPTIONS, answer: s, accept, tags, messages, hint: 'Take the last two swing highs and the last two swing lows. Are both rising, both falling, both level, or do they disagree?' };
}

const idxOf = (list) => list.map((s) => s.i);

/** Every task returns { prompt, explanation, chart, parts } from a made chart. */
const TASKS = {
  /* ---- the most recent confirmed swing high or low ---- */
  'last-swing': (rng, made, spec) => {
    const side = pickFrom(rng, spec.side || ['high', 'low']);
    const base1 = swings(made.candles, made.n, made.upto);
    const sw = made.order === 2 ? structural(base1) : base1;
    const target = lastOfType(sw, side);
    if (!target) return null;
    const prov = provisional(made.candles, made.n, made.upto).filter((s) => s.type === side && s.i > target.i);
    const notYet = made.order === 2 ? base1.filter((s) => s.type === side && s.i > target.i) : [];
    const older = sw.filter((s) => s.type === side && s.i < target.i);
    const since = made.upto - target.i;
    const chart = baseChart(made, { note: made.order === 2 ? DEF_STRUCT(made.n) : DEF_SWING(made.n), highlightHint: { from: Math.max(0, target.i - made.n), to: made.upto } });
    return {
      prompt: made.order === 2 ? `Tap the most recent confirmed STRUCTURAL swing ${side} on this chart.` : `Tap the most recent CONFIRMED swing ${side} on this chart.`,
      explanation: made.order === 2 ? `The structural ${side} at bar ${target.i - made.upto} is the latest order-1 ${side} that is beyond its neighbours of the same kind. Later ${side}s are provisional, or have no later swing yet to compare with.` : `The swing ${side} at bar ${target.i - made.upto} is the latest one with ${made.n} bars on each side. Newer extremes are still provisional: they have not had ${made.n} bars close after them.`,
      chart,
      parts: [{
        id: 'p', kind: 'pick', prompt: `Tap the latest confirmed swing ${side}.`, count: 1, answer: [target.i],
        diag: [
          { when: [...prov, ...notYet].map((s) => s.i), tag: 'provisional-swing', feedback: made.order === 2 ? 'That swing is not structural yet: it needs a later swing of the same kind to show it is above (or below) its neighbours.' : `That is the newest extreme, but it is still PROVISIONAL: it needs ${made.n} bars after it, and it has fewer.` },
          { when: older.map((s) => s.i), tag: 'older-swing', feedback: 'That swing is confirmed, but a later one has formed since. You need the most recent.' }
        ],
        fallbackTag: 'not-a-swing', fallback: `That bar does not have ${made.n} ${side === 'high' ? 'lower highs' : 'higher lows'} on each side.`,
        hint: made.order === 2 ? 'First list the order-1 swings. Which of them is above (or below) the swings of the same kind on either side of it?' : `Which swings are confirmed at the last bar? A swing needs ${made.n} bars after it, so the last ${made.n} bars cannot have confirmed anything yet.`,
        highlight: { from: Math.max(0, target.i - made.n), to: made.upto, text: since >= made.n ? `After the swing there are ${since} bars, at least ${made.n}. It is confirmed.` : '' }
      }],
      meta: { side, since }
    };
  },

  /* ---- every confirmed swing of one kind ---- */
  'mark-swings': (rng, made, spec) => {
    const side = pickFrom(rng, spec.side || ['high', 'low']);
    const sw = swingList(made).filter((s) => s.type === side);
    if (sw.length < (made.order === 2 ? 2 : 3)) return null;
    const prov = provisional(made.candles, made.n, made.upto).filter((s) => s.type === side);
    return {
      prompt: made.order === 2 ? `Tap every confirmed STRUCTURAL swing ${side} on this chart.` : `Tap every CONFIRMED swing ${side} on this chart.`,
      explanation: made.order === 2 ? `${sw.length} structural ${side}s are confirmed. Each is an order-1 ${side} beyond its neighbours of the same kind.` : `${sw.length} swing ${side}s are confirmed. A swing ${side} beats the ${made.n} bars on each side of it.`,
      chart: baseChart(made, { note: made.order === 2 ? DEF_STRUCT(made.n) : DEF_SWING(made.n) }),
      parts: [{
        id: 'p', kind: 'many', prompt: `Tap every confirmed swing ${side}.`, answer: sw.map((s) => s.i),
        diag: [{ when: prov.map((s) => s.i), tag: 'provisional-swing', feedback: 'One of your marks is the newest extreme, which is not confirmed yet.' }],
        fallbackTag: 'missed-swing', fallback: 'Check each swing against the definition: it must beat the bars on both sides.',
        hint: `For each candidate, count ${made.n} bars to the left and ${made.n} to the right. Does its ${side} beat all of them?`
      }]
    };
  },

  /* ---- HH / LH / HL / LL (E19) ---- */
  'label-swings': (rng, made) => {
    const sw = swings(made.candles, made.n, made.upto);
    if (sw.length < 6) return null;
    const lab = labelSwings(sw.slice(-8), 0);
    const items = lab.filter((s) => s.label && s.label !== 'EQ').slice(-4);
    if (items.length < 4) return null;
    const letters = 'ABCD';
    const chart = baseChart(made, { note: DEF_SWING(made.n) + ' Compare each swing with the previous swing of the same kind.', points: items.map((s, k) => ({ i: s.i, price: s.price, label: letters[k], kind: s.type })) });
    return {
      prompt: 'Label each marked swing by comparing it with the previous swing of the SAME kind.',
      explanation: 'A high is HH when it is above the previous high and LH when below. A low is HL when above the previous low and LL when below.',
      chart,
      parts: [{
        id: 'p', kind: 'label', prompt: 'Label the four swings.', items: items.map((s, k) => ({ id: letters[k], i: s.i, type: s.type })),
        options: { high: ['HH', 'LH'], low: ['HL', 'LL'] }, answer: Object.fromEntries(items.map((s, k) => [letters[k], s.label])),
        tag: 'compared-wrong-swing', fallback: 'Compare each swing with the previous swing of the same kind, not with the swing just before it.',
        hint: 'For a high, look back to the previous HIGH. For a low, look back to the previous LOW.'
      }]
    };
  },

  /* ---- bullish / bearish / range / unclear (E20), with the swings that support it ---- */
  classify: (rng, made, spec) => {
    const list = swingList(made);
    const cls = classify(list);
    const parts = [structureOptionsPart(cls)];
    let note = made.order === 2 ? `Structural swings: order-1 swings of size ${made.n}, then the higher and lower ones among them. ` : `Swing size ${made.n}. `;
    if (spec.cite && cls.highs.length === 2 && cls.lows.length === 2) {
      const prov = provisional(made.candles, made.n, made.upto).map((s) => s.i);
      parts.push({ id: 'highs', kind: 'many', prompt: 'Tap the last two confirmed swing highs.', answer: idxOf(cls.highs), diag: [{ when: prov, tag: 'provisional-swing', feedback: 'You marked a provisional extreme.' }], fallbackTag: 'wrong-supporting-swing', fallback: 'Use the two most recent confirmed swing highs.', hint: 'Only confirmed swings count, and only the latest two of each kind.' });
      parts.push({ id: 'lows', kind: 'many', prompt: 'Tap the last two confirmed swing lows.', answer: idxOf(cls.lows), diag: [{ when: prov, tag: 'provisional-swing', feedback: 'You marked a provisional extreme.' }], fallbackTag: 'wrong-supporting-swing', fallback: 'Use the two most recent confirmed swing lows.', hint: 'Only confirmed swings count, and only the latest two of each kind.' });
    }
    const why = cls.structure === 'unclear' ? 'the last two highs and lows do not point the same way' : cls.structure === 'range' ? 'the last two highs are level and so are the last two lows' : cls.structure === 'bullish' ? 'both the last two highs and the last two lows are rising' : 'both the last two highs and the last two lows are falling';
    return {
      prompt: spec.cite ? 'What is the structure at the last bar? Then tap the four swings that support your answer.' : 'What is the structure at the last bar?',
      explanation: `${cap(cls.structure)}: ${why}.${cls.confidence === 'borderline' ? ' This chart is borderline, so Unclear is also accepted.' : ''}`,
      chart: baseChart(made, { note: note + 'Bullish: rising highs and lows. Bearish: falling. Range: level. Unclear: mixed.' }),
      parts,
      meta: { cls }
    };
  },

  /* ---- the Level 7 gate item: structure, the latest confirmed swings, and the invalidation ---- */
  'structure-set': (rng, made) => {
    const list = swingList(made);
    const cls = classify(list);
    if (cls.structure === 'unclear' && cls.confidence !== 'borderline') {
      // an unclear chart has no invalidation to name; the set still asks for the structure and the two latest swings
    }
    const prov = provisional(made.candles, made.n, made.upto).map((s) => s.i);
    const lh = lastOfType(list, 'high');
    const ll = lastOfType(list, 'low');
    if (!lh || !ll) return null;
    const parts = [structureOptionsPart(cls)];
    parts.push({ id: 'high', kind: 'pick', prompt: 'Tap the most recent confirmed swing high.', count: 1, answer: [lh.i], diag: [{ when: prov, tag: 'provisional-swing', feedback: 'That extreme is still provisional.' }], fallbackTag: 'wrong-swing', fallback: 'Use the latest confirmed swing high under the stated definition.', hint: 'Only confirmed swings count. The newest extreme is provisional.' });
    parts.push({ id: 'low', kind: 'pick', prompt: 'Tap the most recent confirmed swing low.', count: 1, answer: [ll.i], diag: [{ when: prov, tag: 'provisional-swing', feedback: 'That extreme is still provisional.' }], fallbackTag: 'wrong-swing', fallback: 'Use the latest confirmed swing low under the stated definition.', hint: 'Only confirmed swings count. The newest extreme is provisional.' });
    const inv = invalidationPart(cls, list);
    if (inv) parts.push(inv);
    return {
      prompt: 'Read this chart at its last bar: state the structure, mark the latest confirmed swing high and low, and mark what invalidates the structure.',
      explanation: `Structure: ${cls.structure}. Latest confirmed swing high and low are the ones marked as correct. ${inv ? 'The invalidation is the level whose break would end the structure.' : ''}`,
      chart: baseChart(made, { note: (made.order === 2 ? `Structural swings (order-1 size ${made.n}, then the higher and lower ones among them). ` : `Swing size ${made.n}. `) + 'A bullish structure is invalidated by a close below its latest structural low; a bearish one by a close above its latest structural high.' }),
      parts,
      meta: { cls }
    };
  },

  /* ---- the candle whose extreme invalidates the current structure ---- */
  invalidation: (rng, made) => {
    const list = swingList(made);
    const cls = classify(list);
    const inv = invalidationPart(cls, list);
    if (!inv || cls.confidence === 'borderline' || cls.structure === 'unclear') return null;
    return {
      prompt: `The structure is ${cls.structure}. Tap the candle that marks the level which would invalidate it.`,
      explanation: cls.structure === 'bullish' ? 'A bullish structure is invalidated by a close below its latest confirmed structural low.' : cls.structure === 'bearish' ? 'A bearish structure is invalidated by a close above its latest confirmed structural high.' : 'A range is invalidated by a close outside either boundary.',
      chart: baseChart(made, { note: 'Invalidation is a level, not a prediction: it is where the description stops being true.' }),
      parts: [inv]
    };
  },

  /* ---- breakouts by close or by wick ---- */
  'breakout-bar': (rng, made, spec) => {
    const by = pickFrom(rng, spec.by || ['close']);
    const sw = swings(made.candles, made.n, made.upto).filter((s) => s.type === 'high');
    // a level: a confirmed swing high that a later bar goes beyond
    let pick = null;
    for (let k = sw.length - 1; k >= 0; k--) {
      const closeAt = firstBreach(made.candles, sw[k].price, 'up', sw[k].i, made.upto, 'close');
      const wickAt = firstBreach(made.candles, sw[k].price, 'up', sw[k].i, made.upto, 'wick');
      if (closeAt > 0 && wickAt > 0) {
        pick = { level: sw[k], closeAt, wickAt };
        break;
      }
    }
    if (!pick) return null;
    const truth = by === 'close' ? pick.closeAt : pick.wickAt;
    const other = by === 'close' ? pick.wickAt : pick.closeAt;
    return {
      prompt: by === 'close' ? 'The dashed line is a resistance level. Tap the first candle that BREAKS OUT: the first CLOSE above the line.' : 'The dashed line is a resistance level. Tap the first candle that BREAKS OUT under the WICK convention: the first bar whose high trades above the line.',
      explanation: by === 'close' ? `Under the close convention, the breakout is the first bar that CLOSES above ${pick.level.price.toFixed(5)}.${other !== truth ? ' A bar with a wick above the line but a close back under it is not a breakout by this rule.' : ''}` : `Under the wick convention, the breakout is the first bar whose HIGH trades above ${pick.level.price.toFixed(5)}.`,
      chart: baseChart(made, { lines: [{ price: pick.level.price, label: 'Resistance', tone: 'gold', dashed: true }], note: `Convention: a breakout is the first ${by === 'close' ? 'close' : 'wick (high)'} beyond the level.` }),
      parts: [{
        id: 'p', kind: 'pick', prompt: 'Tap the breakout candle.', count: 1, answer: [truth],
        diag: [{ when: [other], tag: by === 'close' ? 'wick-not-close' : 'close-not-wick', feedback: by === 'close' ? 'That bar only poked above the line with a wick. Under the close convention it must CLOSE above.' : 'A bar can trade above the line before any bar closes above it. Under the wick convention the first touch counts.' }],
        fallbackTag: 'wrong-break-bar', fallback: 'Look for the first bar that meets the stated convention.',
        hint: by === 'close' ? 'Ignore the wicks. Find the first bar whose CLOSE is above the line.' : 'Find the first bar whose HIGH is above the line.'
      }],
      meta: { by }
    };
  },

  /* ---- breaks of structure under a stated convention ---- */
  'bos-events': (rng, made, spec) => {
    const by = pickFrom(rng, spec.by || ['close']);
    const dirSel = pickFrom(rng, spec.bosDir || ['up']);
    const evs = structureEvents(made.candles, { n: made.n, order: made.order, by, upto: made.upto });
    const other = structureEvents(made.candles, { n: made.n, order: made.order, by: by === 'close' ? 'wick' : 'close', upto: made.upto });
    const ups = evs.filter((e) => e.dir === dirSel);
    if (ups.length < 1 || ups.length > 5) return null;
    const dirWord = dirSel === 'down' ? 'below' : 'above';
    const extra = other.filter((e) => e.dir === dirSel && !ups.some((u) => u.bar === e.bar)).map((e) => e.bar);
    return {
      prompt: `Tap each candle that breaks the latest confirmed swing ${dirSel === 'down' ? 'low' : 'high'} for the first time. Convention: ${by === 'close' ? 'a close' : 'a wick'} ${dirWord} the level counts.`,
      explanation: `${ups.length} break${ups.length > 1 ? 's' : ''} under the ${by} convention. The other convention would mark ${other.filter((e) => e.dir === dirSel).length}: the two conventions do not always agree.`,
      chart: baseChart(made, { note: (made.order === 2 ? 'Structural swings. ' : `Swing size ${made.n}. `) + `A break is the first ${by} beyond the latest confirmed swing ${dirSel === 'down' ? 'low' : 'high'}.` }),
      parts: [{
        id: 'p', kind: 'many', prompt: 'Tap every break.', answer: ups.map((e) => e.bar),
        diag: [{ when: extra, tag: by === 'close' ? 'wick-not-close' : 'close-not-wick', feedback: 'That bar breaks the level under the other convention, not this one.' }],
        fallbackTag: 'wrong-break-bar', fallback: 'A break needs a bar that meets the stated convention beyond the LATEST confirmed swing.',
        hint: 'For each bar, name the latest confirmed swing at that moment. Then check the bar against it.'
      }],
      meta: { by }
    };
  },

  /* ---- consolidation and expansion segments ---- */
  'segment-labels': (rng, made) => {
    if (!made.segments) return null;
    const ids = 'ABC';
    const items = made.segments.map((sg, k) => ({ id: ids[k], from: sg.from, to: sg.to }));
    const state = (sg) => rangeState(made.candles, sg.from, sg.to, 0, made.candles.length - 1);
    const answer = Object.fromEntries(made.segments.map((sg, k) => [ids[k], sg.label]));
    return {
      prompt: 'Label each shaded stretch by comparing its average candle range with the average over the whole chart.',
      explanation: `Contraction: average range under 0.7 of the chart's average. Expansion: over 1.4 times it. Here A was ${state(made.segments[0]).ratio.toFixed(2)}, B ${state(made.segments[1]).ratio.toFixed(2)} and C ${state(made.segments[2]).ratio.toFixed(2)}.`,
      chart: baseChart(made, { bands: items.map((it, k) => ({ from: it.from, to: it.to, label: it.id, tone: ['teal', 'gold', 'teal'][k] })), note: 'Contraction: average range below 0.7 of the whole chart. Expansion: above 1.4 times it.' }),
      parts: [{
        id: 'p', kind: 'label', prompt: 'Label the three stretches.', items: items.map((it) => ({ id: it.id, type: 'seg' })),
        options: { seg: ['contraction', 'expansion', 'normal'] }, answer, tag: 'range-state-wrong',
        fallback: 'Compare the size of the candles in the stretch with the size of a typical candle on the whole chart.',
        hint: 'Judge by candle RANGE (high minus low), not by which way price moved.'
      }]
    };
  },

  /* ---- how much of the impulse the correction gave back ---- */
  retracement: (rng, made) => {
    if (!made.points) return null;
    const cs = made.candles;
    const a = extremes(cs, 0, made.points.top.t - 1);
    const b = extremes(cs, a.loI, Math.min(cs.length - 1, made.points.top.t + 2));
    const c = extremes(cs, b.hiI + 1, Math.min(cs.length - 1, made.points.low.t + 2));
    const A = cs[a.loI][2];
    const B = cs[b.hiI][1];
    const Cc = cs[c.loI][2];
    const pct = ((B - Cc) / (B - A)) * 100;
    const fmt = (x) => x.toFixed(5);
    return {
      prompt: `The impulse ran from A (${fmt(A)}) up to B (${fmt(B)}). The correction fell to C (${fmt(Cc)}). What percent of the impulse did the correction give back? (Nearest whole number.)`,
      explanation: `Impulse: ${fmt(B)} − ${fmt(A)} = ${(B - A).toFixed(5)}. Correction: ${fmt(B)} − ${fmt(Cc)} = ${(B - Cc).toFixed(5)}. ${(B - Cc).toFixed(5)} ÷ ${(B - A).toFixed(5)} = ${pct.toFixed(1)}%.`,
      chart: baseChart(made, { upto: made.upto, points: [{ i: a.loI, price: A, label: 'A', kind: 'low' }, { i: b.hiI, price: B, label: 'B', kind: 'high' }, { i: c.loI, price: Cc, label: 'C', kind: 'low' }], note: 'A is the low that starts the impulse, B its high, C the low of the correction.' }),
      parts: [{
        id: 'p', kind: 'number', prompt: 'Retracement, in percent.', answer: pct, tol: 2, unit: '%',
        diag: [{ value: (Cc - A) / (B - A) * 100, tag: 'retracement-from-wrong-end', feedback: 'That is how far C sits ABOVE the start of the impulse. Measure how much of the leg was given back from B.' }],
        fallback: 'Divide the size of the correction (B down to C) by the size of the impulse (A up to B).',
        hint: 'Correction size ÷ impulse size. Use B − C on top and B − A underneath.'
      }]
    };
  }
};

/** The invalidation part for a classified chart: the candle holding the level whose break ends the structure. */
function invalidationPart(cls, list) {
  const inv = cls.structure === 'bullish' ? lastOfType(list, 'low') : cls.structure === 'bearish' ? lastOfType(list, 'high') : null;
  if (cls.structure === 'range') {
    const hi = lastOfType(list, 'high');
    const lo = lastOfType(list, 'low');
    if (!hi || !lo) return null;
    return { id: 'inval', kind: 'many', prompt: 'Tap the two candles that hold the range boundaries (the latest confirmed swing high and swing low).', answer: [hi.i, lo.i], fallbackTag: 'wrong-invalidation', fallback: 'A range is invalidated by a break of either boundary.', hint: 'A range ends when price closes outside it. Which two swings form its boundaries?' };
  }
  if (!inv) return null;
  return {
    id: 'inval', kind: 'pick', prompt: `Tap the candle whose ${cls.structure === 'bullish' ? 'low' : 'high'} marks the invalidation level.`, count: 1, answer: [inv.i],
    diag: [],
    fallbackTag: 'wrong-invalidation', fallback: cls.structure === 'bullish' ? 'A bullish structure is held up by its latest confirmed structural LOW. A close below it ends the sequence of higher lows.' : 'A bearish structure is held down by its latest confirmed structural HIGH. A close above it ends the sequence of lower highs.',
    hint: cls.structure === 'bullish' ? 'Which swing low holds the rising sequence up?' : 'Which swing high holds the falling sequence down?'
  };
}

const ALL_TASKS = { ...TASKS, ...TASKS8 };
export const TASK_NAMES = Object.keys(ALL_TASKS);

/**
 * Build a chart problem from a template.
 *   tpl.task     one of TASK_NAMES
 *   tpl.recipes  a list of chart recipes to choose from
 *   tpl.n, tpl.order, tpl.side, tpl.by, tpl.cite, tpl.trim  task settings (lists are chosen from by the seed)
 * Returns { question, prompt, explanation, meta } or throws when no chart fits after several tries.
 */
export function buildChartQuestion(tpl, seed) {
  const fn = ALL_TASKS[tpl.task];
  if (!fn) throw new Error('Unknown chart task ' + tpl.task);
  const rng = makeRng(`${tpl.id}#${seed}`);
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = pickFrom(rng, tpl.n || 3);
    const order = pickFrom(rng, tpl.order || 1);
    const recipe = pickFrom(rng, tpl.recipes || ['trend-up']);
    const opts = { n, order, clean: tpl.clean !== false, dir: pickFrom(rng, tpl.dir || 1), retr: pickFrom(rng, tpl.retr || 0.5), sealedBars: 0 };
    const made = TIMED.has(tpl.task) ? timedMade(rng, tpl) : makeChart(recipe, rng.int(1, 2 ** 30), opts);
    // show the chart up to a bar chosen so that the decision is not always at the end of a leg
    const trim = tpl.trim ? rng.int(tpl.trim[0], tpl.trim[1]) : 0;
    made.upto = made.candles.length - 1 - trim;
    const spec = { side: tpl.side, by: tpl.by, cite: tpl.cite, bosDir: tpl.bosDir, sessions: tpl.sessions, anchors: tpl.anchors, showBand: tpl.showBand, requireDiff: tpl.requireDiff, k: tpl.k };
    const out = fn(rng, made, spec);
    if (!out) continue;
    const id = `${tpl.id}#${seed}`;
    const question = {
      id,
      type: 'chart',
      concepts: tpl.concepts || [],
      prompt: out.prompt,
      explanation: out.explanation,
      chart: out.chart,
      parts: out.parts,
      tags: tpl.tags || [],
      critical: !!tpl.critical,
      recipe,
      ambiguous: !!(out.meta && out.meta.cls && out.meta.cls.confidence === 'borderline'),
      sealed: tpl.keepSealed ? made.candles.slice(made.upto + 1) : undefined
    };
    return { question, prompt: out.prompt, explanation: out.explanation, meta: out.meta || {} };
  }
  throw new Error(`No chart fits template ${tpl.id} for seed ${seed}`);
}

/** The response that answers every part of a chart question correctly. */
export function referenceResponse(q) {
  return Object.fromEntries(q.parts.map((p) => [p.id, p.kind === 'number' ? String(p.answer) : p.answer]));
}

export { RECIPES };
