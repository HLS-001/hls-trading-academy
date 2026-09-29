/**
 * The assessment engine: blueprints, exam forms, scoring, pass rules and diagnostics.
 *
 * An exam is assembled from a BLUEPRINT (slots, not a fixed paper), so a retake is a new form.
 *
 *   PASS = overall >= passMark
 *      AND every part >= partMin
 *      AND every critical gate is met
 *      AND every written item is rated "meets" (by the mentor, unless the mentor allows self-assessment)
 */

import { makeRng } from './rng.js';

/* ------------------------------------------------ building a form */

export function buildForm(bp, { questions, templates = [], seen = {}, seed }) {
  const rng = makeRng(String(bp.id) + '#' + seed);
  const items = [];
  const used = new Set();
  const shortfall = [];
  const qById = new Map(questions.map((q) => [q.id, q]));
  const tById = new Map(templates.map((t) => [t.id, t]));

  bp.slots.forEach((slot, si) => {
    if (slot.question) {
      if (!qById.has(slot.question)) throw new Error(`Blueprint ${bp.id} refers to unknown question ${slot.question}`);
      items.push({ part: slot.part, slot: si, kind: 'q', id: slot.question });
      used.add(slot.question);
      return;
    }
    if (slot.templates) {
      const ids = rng.shuffle(slot.templates);
      for (let k = 0; k < slot.count; k++) {
        const tid = ids[k % ids.length];
        if (!tById.has(tid)) throw new Error(`Blueprint ${bp.id} refers to unknown template ${tid}`);
        items.push({ part: slot.part, slot: si, kind: 't', id: tid, seed: rng.int(1, 2 ** 31 - 1) });
      }
      return;
    }
    const pool = slot.pool || {};
    let candidates = questions.filter(
      (q) =>
        q.examEligible !== false &&
        !used.has(q.id) &&
        q.type !== 'written' &&
        (!pool.concepts || q.concepts.some((c) => pool.concepts.includes(c))) &&
        (!pool.tags || pool.tags.every((t) => (q.tags || []).includes(t))) &&
        (!pool.notTags || !pool.notTags.some((t) => (q.tags || []).includes(t))) &&
        (!slot.types || slot.types.includes(q.type))
    );
    // unseen items first, otherwise least-seen; ties broken by the seeded shuffle
    candidates = rng.shuffle(candidates).sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0));
    const perConcept = {};
    const max = slot.maxPerConcept || Infinity;
    const picked = [];
    for (const q of candidates) {
      if (picked.length >= slot.count) break;
      const key = q.concepts[0];
      if ((perConcept[key] || 0) >= max) continue;
      perConcept[key] = (perConcept[key] || 0) + 1;
      picked.push(q);
    }
    // if the concept cap left the slot short, fill from what remains
    for (const q of candidates) {
      if (picked.length >= slot.count) break;
      if (!picked.includes(q)) picked.push(q);
    }
    if (picked.length < slot.count) shortfall.push({ slot: si, part: slot.part, wanted: slot.count, got: picked.length });
    for (const q of rng.shuffle(picked)) {
      items.push({ part: slot.part, slot: si, kind: 'q', id: q.id });
      used.add(q.id);
    }
  });

  return { id: `${bp.id}@${seed}`, blueprintId: bp.id, seed, items, shortfall };
}

/* ------------------------------------------------ scoring */

/**
 * results[i] corresponds to form.items[i]: { score, correct, errorTags, concepts, critical, tags, pending? }
 * writtenStatus: { [questionId]: 'pending' | 'meets' | 'partly' | 'notyet' }
 */
export function scoreExam(bp, form, results, writtenStatus = {}) {
  const parts = (bp.parts || []).map((p) => ({ id: p.id, title: p.title, n: 0, sum: 0, score: null }));
  const partById = Object.fromEntries(parts.map((p) => [p.id, p]));
  let n = 0;
  let sum = 0;
  const conceptStats = {};
  const errorTags = {};
  const graded = [];

  form.items.forEach((it, i) => {
    const r = results[i];
    if (!r || r.pending) return;
    n += 1;
    sum += r.score;
    graded.push({ ...r, part: it.part });
    const p = partById[it.part];
    if (p) {
      p.n += 1;
      p.sum += r.score;
    }
    for (const c of r.concepts || []) {
      const cs = (conceptStats[c] = conceptStats[c] || { n: 0, sum: 0 });
      cs.n += 1;
      cs.sum += r.score;
    }
    for (const t of r.errorTags || []) errorTags[t] = (errorTags[t] || 0) + 1;
  });
  parts.forEach((p) => (p.score = p.n ? p.sum / p.n : null));

  const overall = n ? sum / n : 0;
  const partMin = bp.partMin ?? 0.6;
  const failedParts = parts.filter((p) => p.n > 0 && p.score < partMin).map((p) => p.id);

  const gates = (bp.criticalGates || []).map((g) => {
    const items = graded.filter((r) => (g.parts && g.parts.includes(r.part) && (!g.tag || (r.tags || []).includes(g.tag))) || (!g.parts && g.tag && (r.tags || []).includes(g.tag)));
    const acc = items.length ? items.reduce((a, r) => a + r.score, 0) / items.length : null;
    return { id: g.id, description: g.description, min: g.min, n: items.length, score: acc, met: acc !== null && acc >= g.min };
  });
  const failedGates = gates.filter((g) => !g.met).map((g) => g.id);

  const autoPass = overall >= bp.passMark && failedParts.length === 0 && failedGates.length === 0;

  const written = (bp.written || []).map((w) => ({ questionId: w.questionId, requireMentor: w.requireMentor !== false, status: writtenStatus[w.questionId] || 'unsubmitted' }));
  const writtenPending = written.some((w) => w.status === 'pending' || w.status === 'unsubmitted');
  const writtenMeets = written.every((w) => w.status === 'meets');

  let status;
  if (!autoPass) status = 'failed';
  else if (writtenPending) status = 'awaiting-mentor';
  else if (writtenMeets) status = 'passed';
  else status = 'failed-written';

  const weakConcepts = Object.entries(conceptStats)
    .map(([concept, s]) => ({ concept, n: s.n, accuracy: s.sum / s.n }))
    .filter((c) => c.accuracy < 0.7)
    .sort((a, b) => a.accuracy - b.accuracy);

  return {
    n,
    overall,
    parts: parts.map(({ id, title, n: pn, score }) => ({ id, title, n: pn, score })),
    failedParts,
    gates,
    failedGates,
    autoPass,
    written,
    status,
    diagnostic: { weakConcepts, errorTags, failedGates, failedParts }
  };
}

/** A retake is allowed when there is no outstanding targeted review. */
export const canRetake = (reviewPending) => !reviewPending || reviewPending.length === 0;
