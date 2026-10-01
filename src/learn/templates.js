/**
 * Numeric problem templates.
 *
 * A template describes a problem; a seed turns it into one concrete problem with new numbers.
 * The answer is computed by the SAME calculator engine the app uses everywhere, and every wrong
 * answer that a specific mistake would produce is precomputed so feedback can name the mistake.
 *
 *   instantiate(template, seed)  ->  { prompt, answer, unit, tolerance, wrong[], steps[], explanation, ... }
 *   gradeNumeric(problem, text)  ->  { correct, score, errorTags, feedback }
 *   gradeSteps(problem, texts[]) ->  per-step grading with error-carried-forward credit
 */

import * as C from '../calc/index.js';
import { pretty } from '../calc/markets.js';
import { evaluate } from './expr.js';
import { makeRng } from './rng.js';
import { buildChartQuestion } from '../charts/tasks.js';
import { resolveWindow, CONVENTIONAL_SET, clockGap, sessionsOpenAt } from '../time/sessions.js';
import { partsInZone, instantFromWall } from '../time/zones.js';

/* ------------------------------------------------ function registry (templates call the real engine) */

export const FN = {
  pipSize: (a) => C.pipSize(a.symbol),
  toPips: (a) => C.toPips(a.symbol, a.diff),
  stopDistancePips: (a) => C.stopDistancePips(a.symbol, a.entry, a.stop),
  pipValuePerLotQuote: (a) => C.pipValuePerLotQuote(a.symbol),
  pipValuePerLot: (a) => C.pipValuePerLot(a.symbol, a.acct || 'USD', a.rates || {}),
  pipValueTrade: (a) => C.pipValueTrade(a.symbol, a.lots, a.acct || 'USD', a.rates || {}),
  dollarRisk: (a) => C.dollarRisk(a.balance, a.riskPct),
  positionSize: (a) => C.positionSize(a),
  rMultiple: (a) => C.rMultiple(a),
  expectancyR: (a) => C.expectancyR(a),
  // time: the hour (0 to 23) on a zone's clock at which a session opens on a date, and the gap between two markets' clocks
  sessionOpenHour: (a) => partsInZone(resolveWindow(CONVENTIONAL_SET.sessions.find((x) => x.id === a.session), a.date).startMs, a.tz).hour,
  sessionCloseHour: (a) => partsInZone(resolveWindow(CONVENTIONAL_SET.sessions.find((x) => x.id === a.session), a.date).endMs, a.tz).hour,
  clockGapHours: (a) => clockGap(a.date, a.a, a.b),
  // a release at a wall time on some clock, as the hour (0 to 23) on another clock; and the hours between two wall times
  eventHour: (a) => {
    const [y, m, d] = a.date.split('-').map(Number);
    return partsInZone(instantFromWall(a.tz, y, m, d, a.hour, a.minute || 0), a.to).hour;
  },
  hoursBetween: (a) => {
    const [y, m, d] = a.date.split('-').map(Number);
    return (instantFromWall(a.tzB, y, m, d, a.hourB, a.minuteB || 0) - instantFromWall(a.tzA, y, m, d, a.hourA, a.minuteA || 0)) / 3600000;
  },
  // how many sessions are open at a wall time on a zone's clock
  sessionsOpenCount: (a) => {
    const [y, m, d] = a.date.split('-').map(Number);
    return sessionsOpenAt(CONVENTIONAL_SET, instantFromWall(a.tz, y, m, d, a.hour, 0)).length;
  },
  breakevenWinRate: (a) => C.breakevenWinRate(a.rr),
  recoveryRequired: (a) => C.recoveryRequired(a.d),
  marginRequired: (a) => C.marginRequired(a),
  inverseQuote: (a) => C.inverseQuote(a.rate),
  crossRate: (a) => C.crossRate(a.aPerB, a.cPerB),
  pnlMoney: (a) => C.pnlMoney(a),
  spreadPips: (a) => C.spreadPips(a.symbol, a.bid, a.ask),
  unitsFromLots: (a) => C.unitsFromLots(a.lots),
  notionalValue: (a) => C.notionalValue(a),
  pipsToMarginLevel: (a) => C.pipsToMarginLevel(a),
  swapMoney: (a) => C.swapMoney(a),
  commissionMoney: (a) => C.commissionMoney(a),
  pipsResult: (a) => C.pipsResult(a),
  rewardPips: (a) => C.rewardPips(a.symbol, a.entry, a.target),
  rewardMoney: (a) => C.rewardMoney(a),
  percentRisk: (a) => C.percentRisk(a),
  rFromPrices: (a) => C.rFromPrices(a),
  floorToStep: (a) => C.floorToStep(a.x, a.step)
};

/* ------------------------------------------------ parameters */

function genParam(spec, rng, ctx) {
  if ('pick' in spec) return rng.pick(spec.pick);
  if ('int' in spec) return rng.int(spec.int[0], spec.int[1]);
  if ('float' in spec) return rng.float(spec.float[0], spec.float[1], spec.float[2]);
  if ('const' in spec) return spec.const;
  if ('expr' in spec) return evaluate(spec.expr, numericVars(ctx));
  if ('list' in spec) {
    // a list of trade results: { list: { n: [6, 8], pick: [-1, -1, 0.5, 2], mixed: true } }
    const L = spec.list;
    for (let attempt = 0; attempt < 60; attempt++) {
      const n = L.nPick ? rng.pick(L.nPick) : Array.isArray(L.n) ? rng.int(L.n[0], L.n[1]) : L.n;
      const out = Array.from({ length: n }, () => rng.pick(L.pick));
      if (!L.mixed || (out.some((x) => x > 0) && out.some((x) => x < 0))) return out;
    }
    throw new Error('could not build a mixed list');
  }
  if ('fixed' in spec) return Number(ctx[spec.fixed]).toFixed(typeof spec.dp === 'number' ? spec.dp : ctx[spec.dp]);
  if ('map' in spec) {
    // a word that depends on another value: { map: 'dir', values: { '1': 'rose', '-1': 'fell' } }
    const v = ctx[spec.map];
    if (!(String(v) in spec.values)) throw new Error('map has no entry for ' + v);
    const word = spec.values[String(v)];
    return typeof word === 'string' && word.includes('{{') ? fillText(word, ctx) : word;
  }
  throw new Error('Unknown parameter spec: ' + JSON.stringify(spec));
}

const numericVars = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' || (Array.isArray(v) && v.every((x) => typeof x === 'number'))));

/** Replace "$name" references (also inside objects) with parameter values. */
function resolveArgs(v, ctx) {
  if (typeof v === 'string' && v.startsWith('$')) {
    const key = v.slice(1);
    if (!(key in ctx)) throw new Error('Template refers to unknown value: ' + v);
    return ctx[key];
  }
  if (Array.isArray(v)) return v.map((x) => resolveArgs(x, ctx));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveArgs(x, ctx)]));
  return v;
}

function compute(spec, ctx) {
  let value;
  if ('expr' in spec) value = evaluate(spec.expr, numericVars(ctx));
  else if ('fn' in spec) {
    const f = FN[spec.fn];
    if (!f) throw new Error('Unknown template function: ' + spec.fn);
    value = f(resolveArgs(spec.args || {}, ctx));
    if (spec.pick) value = value[spec.pick];
  } else throw new Error('Answer needs an expr or a fn');
  return value;
}

/* ------------------------------------------------ formatting */

const trim = (n, d = 4) => String(+Number(n).toFixed(d));
export function money(n, decimals) {
  const neg = n < 0;
  const a = Math.abs(n);
  const d = decimals ?? (Math.abs(a - Math.round(a)) < 1e-9 ? 0 : 2);
  const s = a.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (neg ? '−' : '') + '$' + s;
}

function fmt(value, filter) {
  const [name, arg] = String(filter || '').split(':');
  switch (name) {
    case 'pair': return pretty(String(value));
    case 'lots': return trim(value) + (Number(value) === 1 ? ' lot' : ' lots');
    case 'money': return money(Number(value), arg === undefined ? undefined : +arg);
    case 'pct': return trim(value, 4) + '%';
    case 'fixed': return Number(value).toFixed(+arg);
    case 'sign': return (value < 0 ? '−' : '+') + trim(Math.abs(value));
    case 'abs': return trim(Math.abs(value));
    case 'r': return (value < 0 ? '−' : value > 0 ? '+' : '') + trim(Math.abs(value)) + 'R';
    case 'rlist': return (value || []).map((x) => (x < 0 ? '−' : x > 0 ? '+' : '') + trim(Math.abs(x)) + 'R').join(', ');
    case 'nlist': return (value || []).map((x) => trim(x)).join(', ');
    case 'base': return String(value).slice(0, 3);
    case 'quote': return String(value).slice(3, 6);
    case 'comma': return Number(value).toLocaleString('en-US', { maximumFractionDigits: arg === undefined ? 4 : +arg, minimumFractionDigits: arg === undefined ? 0 : +arg });
    case 'dec': return trim(value, +arg);
    case 'up': return String(value).toUpperCase();
    case 'cap': return String(value).charAt(0).toUpperCase() + String(value).slice(1);
    case 'hm': { const m = Math.round(Number(value)); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
    case 'ord': { const n = Number(value); const t = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); return n + t; }
    default: return typeof value === 'number' ? trim(value) : String(value);
  }
}

export function fillText(text, ctx) {
  return String(text).replace(/\{\{\s*([\w.]+)\s*(?:\|\s*([\w:.-]+))?\s*\}\}/g, (m, key, filter) => {
    if (!(key in ctx)) throw new Error(`Template text refers to unknown value: ${key}`);
    return fmt(ctx[key], filter);
  });
}

export function formatUnit(value, unit = {}) {
  const d = unit.decimals ?? 2;
  const body = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (value < 0 ? '−' : '') + (unit.prefix || '') + body + (unit.suffix || '');
}

/* ------------------------------------------------ instantiate */

const LETTERS = 'abcdefgh';

/**
 * A choice template: the wording and the options are filled from seeded numbers, and the FIRST option is the right
 * one. A distractor may carry a mistake tag and a reason; `when` (an expression, non-zero = include) drops a distractor
 * that would not make sense for these numbers. Distractors that repeat another option's text are dropped.
 */
function instantiateChoice(tpl, seed, ctx, params) {
  for (const c of tpl.calc || []) ctx[c.id] = compute(c, ctx);
  const options = [];
  const seen = new Set();
  tpl.options.forEach((o, i) => {
    if (o.when !== undefined && !evaluate(o.when, numericVars(ctx))) return;
    const text = fillText(o.text, ctx);
    if (seen.has(text)) return;
    seen.add(text);
    options.push({ id: LETTERS[options.length], text, why: o.why ? fillText(o.why, ctx) : '', tag: o.tag, correct: i === 0 });
  });
  if (options.length < 3) throw new Error('a choice template needs at least 3 distinct options for every seed');
  if (!options[0].correct) throw new Error('the first option (the right one) was dropped');
  const optionFeedback = {};
  const optionTags = {};
  for (const o of options) {
    if (o.why) optionFeedback[o.id] = o.why;
    if (o.tag) optionTags[o.id] = o.tag;
  }
  const prompt = fillText(tpl.prompt, ctx);
  const explanation = tpl.explain ? fillText(tpl.explain, ctx) : '';
  const id = `${tpl.id}#${seed}`;
  const stimulus = tpl.stimulus ? resolveArgs(tpl.stimulus, ctx) : undefined;
  const question = { id, type: 'mcq', stimulus, concepts: tpl.concepts || [], prompt, options: options.map(({ id: oid, text }) => ({ id: oid, text })), answer: 'a', optionFeedback, optionTags, explanation, tags: tpl.tags || [], critical: !!tpl.critical };
  return {
    kind: 'choice',
    id,
    tid: tpl.id,
    seed,
    type: 'choice',
    concepts: tpl.concepts || [],
    cluster: tpl.cluster,
    difficulty: tpl.difficulty || 1,
    critical: !!tpl.critical,
    tags: tpl.tags || [],
    prompt,
    params,
    explanation,
    answerText: options[0].text,
    question
  };
}

/** The valid side of the market for each pending order type, from the bid and the ask. */
export const VALID_SIDE = {
  'buy-limit': (p, m) => p < m.ask,
  'buy-stop': (p, m) => p > m.ask,
  'sell-limit': (p, m) => p > m.bid,
  'sell-stop': (p, m) => p < m.bid
};

/** A "place the order" template: tap a level on the ladder where the order would be accepted. */
function instantiatePlace(tpl, seed, ctx, params) {
  const spec = resolveArgs(tpl.place, ctx);
  const m = spec.market;
  const candidates = spec.offsets.map((o) => +(m.bid + o * m.pipSize).toFixed(m.dq));
  const valid = candidates.filter((p) => VALID_SIDE[spec.order](p, m));
  if (!valid.length || valid.length === candidates.length) throw new Error('a place template needs both valid and invalid levels');
  const prompt = fillText(tpl.prompt, ctx);
  const explanation = tpl.explain ? fillText(tpl.explain, ctx) : '';
  const id = `${tpl.id}#${seed}`;
  const question = { id, type: 'place', concepts: tpl.concepts || [], prompt, market: m, order: spec.order, candidates, answer: valid, explanation, tags: tpl.tags || [], critical: !!tpl.critical };
  return { kind: 'choice', id, tid: tpl.id, seed, type: 'place', concepts: tpl.concepts || [], cluster: tpl.cluster, difficulty: tpl.difficulty || 1, critical: !!tpl.critical, tags: tpl.tags || [], prompt, params, explanation, answerText: valid.join(', '), question };
}

/** A chart template: a synthetic chart, marks to make on it, and a reference answer from the detectors. */
function instantiateChart(tpl, seed, params) {
  const { question, prompt, explanation } = buildChartQuestion(tpl, seed);
  const id = `${tpl.id}#${seed}`;
  return { kind: 'choice', id, tid: tpl.id, seed, type: 'chart', concepts: tpl.concepts || [], cluster: tpl.cluster, difficulty: tpl.difficulty || 1, critical: !!tpl.critical, tags: tpl.tags || [], prompt, params, explanation, answerText: '', question };
}

export function instantiate(tpl, seed) {
  const rng = makeRng(String(tpl.id) + '#' + seed);
  const params = {};
  for (const [name, spec] of Object.entries(tpl.params || {})) params[name] = genParam(spec, rng, params);

  const ctx = { ...params };
  if (tpl.type === 'choice') return instantiateChoice(tpl, seed, ctx, params);
  if (tpl.type === 'place') return instantiatePlace(tpl, seed, ctx, params);
  if (tpl.type === 'chart') return instantiateChart(tpl, seed, params);
  const steps = (tpl.steps || []).map((s) => {
    const value = compute(s, ctx);
    ctx[s.id] = value;
    return { id: s.id, label: s.label, hint: s.hint || '', unit: s.unit || {}, tolerance: s.tolerance, value };
  });

  const answer = compute(tpl.answer, ctx);
  ctx.answer = answer;
  const unit = tpl.unit || {};
  const decimals = unit.decimals ?? 2;
  const tol = tpl.tolerance || {};
  const tolerance = { abs: tol.abs ?? 10 ** -decimals, rel: tol.rel ?? 0 };

  const wrong = [];
  for (const d of tpl.errorDetectors || []) {
    let value;
    try {
      value = compute(d, ctx);
    } catch (e) {
      continue; // a detector that cannot be computed for these numbers is skipped
    }
    if (!Number.isFinite(value) || withinTol(value, answer, tolerance)) continue;
    wrong.push({ tag: d.tag, value, message: fillText(d.message, { ...ctx, wrongValue: value }) });
  }

  return {
    kind: 'numeric',
    id: `${tpl.id}#${seed}`,
    tid: tpl.id,
    seed,
    type: tpl.type || 'numeric',
    concepts: tpl.concepts || [],
    cluster: tpl.cluster,
    difficulty: tpl.difficulty || 1,
    critical: !!tpl.critical,
    tags: tpl.tags || [],
    prompt: fillText(tpl.prompt, ctx),
    params,
    answer,
    unit,
    tolerance,
    wrong,
    steps,
    explanation: tpl.explain ? fillText(tpl.explain, ctx) : '',
    answerText: formatUnit(answer, unit)
  };
}

/* ------------------------------------------------ grading */

export function parseNumber(input) {
  if (typeof input === 'number') return input;
  if (input === null || input === undefined) return NaN;
  const s = String(input)
    .replace(/[\s,$£€%R]/g, '')
    .replace(/−/g, '-')
    .replace(/^\+/, '');
  if (s === '' || s === '-' || s === '.' || s === '-.') return NaN;
  return /^-?\d*\.?\d+$|^-?\d+\.$/.test(s) ? parseFloat(s) : NaN;
}

function withinTol(a, b, tol) {
  const diff = Math.abs(a - b);
  return diff <= tol.abs + 1e-9 || (tol.rel > 0 && diff <= Math.abs(b) * tol.rel);
}

export function gradeNumeric(problem, response) {
  const v = parseNumber(response);
  if (Number.isNaN(v)) return { correct: false, score: 0, errorTags: [], feedback: 'Enter a number.', invalid: true, expected: problem.answer };
  if (withinTol(v, problem.answer, problem.tolerance)) {
    return { correct: true, score: 1, errorTags: [], feedback: problem.explanation, expected: problem.answer };
  }
  for (const w of problem.wrong) {
    if (withinTol(v, w.value, problem.tolerance)) {
      return { correct: false, score: 0, errorTags: [w.tag], feedback: w.message, expected: problem.answer, matchedMistake: w.tag };
    }
  }
  if (withinTol(-v, problem.answer, problem.tolerance)) {
    return { correct: false, score: 0, errorTags: ['sign-error'], feedback: 'Right size, wrong sign. Check whether this is a gain or a loss.', expected: problem.answer };
  }
  return { correct: false, score: 0, errorTags: [], feedback: '', expected: problem.answer };
}

/**
 * Multi-step grading with error-carried-forward: a step that is correct given the student's
 * OWN previous answers keeps its credit, so one early slip does not zero the whole problem.
 * Each step needs a template step with an expression that refers to earlier steps by id.
 */
export function gradeSteps(problem, responses, tpl) {
  const results = [];
  const studentVals = {};
  for (let i = 0; i < problem.steps.length; i++) {
    const s = problem.steps[i];
    const v = parseNumber(responses[i]);
    studentVals[s.id] = v;
    const tol = { abs: s.tolerance?.abs ?? 10 ** -(s.unit?.decimals ?? 2), rel: s.tolerance?.rel ?? 0 };
    if (Number.isNaN(v)) {
      results.push({ id: s.id, correct: false, carried: false, score: 0, expected: s.value });
      continue;
    }
    if (withinTol(v, s.value, tol)) {
      results.push({ id: s.id, correct: true, carried: false, score: 1, expected: s.value });
      continue;
    }
    let carried = false;
    const spec = tpl && tpl.steps && tpl.steps[i];
    if (spec) {
      try {
        const alt = compute(spec, { ...problem.params, ...studentVals, [s.id]: undefined });
        if (Number.isFinite(alt) && withinTol(v, alt, tol)) carried = true;
      } catch (e) {
        carried = false;
      }
    }
    results.push({ id: s.id, correct: false, carried, score: carried ? 1 : 0, expected: s.value });
  }
  const score = results.length ? results.reduce((a, r) => a + r.score, 0) / results.length : 0;
  const allExact = results.every((r) => r.correct);
  return { steps: results, score, correct: allExact, carriedAny: results.some((r) => r.carried) };
}
