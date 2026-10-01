/**
 * Two scenario question types, graded here.
 *
 * branch  (E28)  A scenario that unfolds. At each step the student chooses; each choice has a score, a reason and a next
 *                step (or the end). The score is for the DECISION and its reasoning, never for how the story turned out.
 *   { type: 'branch', start: 'n1', nodes: { n1: { text, options: [{ id, label, next, score, why, tag }] }, ... } }
 *   response: the chosen option ids, in order, until an option ends the story.
 *
 * audit   (E29)  A supplied trade, with the result hidden. The student judges each rule (followed, not followed, cannot
 *                tell from the record) and rates the process. The result is shown only after they commit.
 *   { type: 'audit', trade: { title, rows }, rules: [{ id, text, answer, why }], processAnswer, reveal: { text, rows } }
 *   response: { rules: { [ruleId]: 'yes' | 'no' | 'unknown' }, process: 'followed' | 'partly' | 'broke' }
 */

/** The path of option ids that scores best (the first best option at each step). */
export function bestPath(q, pick = 'best') {
  const path = [];
  let id = q.start;
  for (let guard = 0; guard < 30 && id; guard++) {
    const node = q.nodes[id];
    const sorted = [...node.options].sort((a, b) => (pick === 'best' ? b.score - a.score : a.score - b.score));
    const opt = sorted[0];
    path.push(opt.id);
    id = opt.next;
  }
  return path;
}

export function gradeBranch(q, response) {
  const r = Array.isArray(response) ? response : [];
  let id = q.start;
  let total = 0;
  let n = 0;
  let done = false;
  const tags = [];
  const notes = [];
  for (const choice of r) {
    const node = q.nodes[id];
    const opt = node && node.options.find((o) => o.id === choice);
    if (!opt) break;
    n += 1;
    total += opt.score;
    if (opt.score < 1 && opt.tag) tags.push(opt.tag);
    if (opt.score < 1 && opt.why) notes.push(opt.why);
    if (opt.next === null || opt.next === undefined) {
      done = true;
      break;
    }
    id = opt.next;
  }
  if (!done || !n) return { correct: false, score: 0, errorTags: [], feedback: 'Work through the scenario to its end first.', invalid: true };
  const score = total / n;
  const correct = score === 1;
  return {
    correct,
    score,
    errorTags: [...new Set(tags)],
    feedback: (correct ? q.explanation || '' : notes.join(' ') + ' ' + (q.explanation || '')).trim(),
    expected: bestPath(q)
  };
}

export function gradeAudit(q, response) {
  const r = response || {};
  const rules = r.rules || {};
  const right = q.rules.filter((rule) => rules[rule.id] === rule.answer);
  const wrong = q.rules.filter((rule) => rules[rule.id] !== rule.answer);
  const processOk = r.process === q.processAnswer;
  const score = 0.7 * (right.length / q.rules.length) + 0.3 * (processOk ? 1 : 0);
  const correct = wrong.length === 0 && processOk;
  const tags = [];
  if (!processOk && r.process) tags.push('outcome-bias');
  if (wrong.some((rule) => rules[rule.id] === 'yes' && rule.answer !== 'yes')) tags.push('assumed-rule-followed');
  const notes = wrong.map((rule) => rule.why).filter(Boolean);
  return {
    correct,
    score: correct ? 1 : score,
    errorTags: tags,
    feedback: correct ? q.explanation || '' : (notes.join(' ') + (processOk ? '' : ' The process rating does not match the rules that were and were not followed.') + ' ' + (q.explanation || '')).trim(),
    expected: { rules: Object.fromEntries(q.rules.map((rule) => [rule.id, rule.answer])), process: q.processAnswer },
    wrongRules: wrong.map((rule) => rule.id),
    processOk
  };
}

export const auditReference = (q) => ({ rules: Object.fromEntries(q.rules.map((rule) => [rule.id, rule.answer])), process: q.processAnswer });
