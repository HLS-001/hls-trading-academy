/**
 * The Warm-Up composer and focused practice sets.
 *
 * A Warm-Up is 8 to 12 items at the start of a session: 60% due concepts, 25% weak concepts,
 * 15% older concepts, interleaved across topics (not blocked by topic). Every item is fresh:
 * unseen questions first, and numeric templates regenerate with new numbers.
 */

import { isDue, overdueDays } from './scheduler.js';
import { masteryOf, weakReasons } from './mastery.js';
import { makeRng } from './rng.js';

/** All reviewable items for a concept. */
export function itemsForConcept(content, concept) {
  const questions = (content.questionsByConcept.get(concept) || []).filter((q) => q.type !== 'written' && q.reviewEligible !== false);
  const templates = content.templatesByConcept.get(concept) || [];
  return { questions, templates };
}

/** Pick one item for a concept, preferring what the student has seen least. */
export function pickItem(content, concept, state, rng) {
  const { questions, templates } = itemsForConcept(content, concept);
  if (!questions.length && !templates.length) return null;
  // Templates are always fresh (new numbers), so they count as unseen.
  const pool = [];
  for (const q of questions) pool.push({ kind: 'q', id: q.id, seen: state.seen[q.id] || 0 });
  for (const t of templates) pool.push({ kind: 't', id: t.id, seen: 0, seed: rng.int(1, 2 ** 31 - 1) });
  const min = Math.min(...pool.map((p) => p.seen));
  const best = pool.filter((p) => p.seen === min);
  const chosen = rng.pick(best);
  return { kind: chosen.kind, id: chosen.id, seed: chosen.seed ?? undefined, concept };
}

export function composeWarmup(state, content, { nowMs, size = 10, seed = 1 }) {
  const rng = makeRng('warmup#' + seed);
  const all = Object.values(state.concepts).filter((c) => c.hist.length);
  const info = (cs) => ({ cs, mastery: masteryOf(cs), weak: weakReasons(cs, masteryOf(cs), nowMs).length > 0 });

  const due = all.filter((c) => isDue(c, nowMs)).sort((a, b) => overdueDays(b, nowMs) - overdueDays(a, nowMs)).map((c) => c.concept);
  const weak = all.map(info).filter((x) => x.weak).sort((a, b) => a.mastery - b.mastery).map((x) => x.cs.concept);
  const older = rng.shuffle(all.map((c) => c.concept));

  const quotas = { due: Math.ceil(size * 0.6), weak: Math.round(size * 0.25), older: size };
  const chosen = [];
  const take = (list, quota) => {
    for (const concept of list) {
      if (quota <= 0 || chosen.length >= size) break;
      if (chosen.includes(concept)) continue;
      if (!itemsForConcept(content, concept).questions.length && !itemsForConcept(content, concept).templates.length) continue;
      chosen.push(concept);
      quota -= 1;
    }
  };
  take(due, quotas.due);
  take(weak, quotas.weak);
  take(older, size - chosen.length);
  // top up from anything left, still unique
  take(due, size - chosen.length);
  take(weak, size - chosen.length);

  const items = chosen.map((concept) => pickItem(content, concept, state, rng)).filter(Boolean);
  return rng.shuffle(items);
}

/** A focused set on one concept: up to `size` different items, mixing question types. */
export function composeFocus(state, content, concept, { size = 10, seed = 1 }) {
  const rng = makeRng('focus#' + concept + '#' + seed);
  const { questions, templates } = itemsForConcept(content, concept);
  const items = [];
  // about 40% fresh-number problems when the concept has templates, so the numbers never repeat
  const generated = templates.length ? Math.min(size, Math.max(1, Math.ceil(size * 0.4))) : 0;
  const qs = rng.shuffle(questions).sort((a, b) => (state.seen[a.id] || 0) - (state.seen[b.id] || 0));
  for (const q of qs) {
    if (items.length >= size - generated) break;
    items.push({ kind: 'q', id: q.id, concept });
  }
  let n = 0;
  while (items.length < size && templates.length && n < size * 2) {
    const t = templates[n % templates.length];
    items.push({ kind: 't', id: t.id, seed: rng.int(1, 2 ** 31 - 1), concept });
    n += 1;
  }
  return rng.shuffle(items);
}
