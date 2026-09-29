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
  breakevenWinRate: (a) => C.breakevenWinRate(a.rr),
  recoveryRequired: (a) => C.recoveryRequired(a.d),
  marginRequired: (a) => C.marginRequired(a),
  inverseQuote: (a) => C.inverseQuote(a.rate),
  crossRate: (a) => C.crossRate(a.aPerB, a.cPerB),
  pnlMoney: (a) => C.pnlMoney(a)
};

/* ------------------------------------------------ parameters */

function genParam(spec, rng, ctx) {
  if ('pick' in spec) return rng.pick(spec.pick);
  if ('int' in spec) return rng.int(spec.int[0], spec.int[1]);
  if ('float' in spec) return rng.float(spec.float[0], spec.float[1], spec.float[2]);
  if ('const' in spec) return spec.const;
  if ('expr' in spec) return evaluate(spec.expr, numericVars(ctx));
  throw new Error('Unknown parameter spec: ' + JSON.stringify(spec));
}

const numericVars = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number'));

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

export function instantiate(tpl, seed) {
  const rng = makeRng(String(tpl.id) + '#' + seed);
  const params = {};
  for (const [name, spec] of Object.entries(tpl.params || {})) params[name] = genParam(spec, rng, params);

  const ctx = { ...params };
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
