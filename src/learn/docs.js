/**
 * The student's documents: the Risk Plan, the strategy, the path-to-live plan, the broker worksheets and so on. Each is saved
 * with `doc.save`, sent to the mentor with `doc.submit`, and reviewed with `doc.review`. When the mentor approves a document
 * that stands for a practical requirement, `practical.done` is emitted with the practical's id, and the exam that was waiting
 * for it settles (see core/derive.js).
 *
 * The status of a document is derived, never stored:
 *   none        nothing saved yet
 *   draft       saved, not sent to the mentor
 *   submitted   waiting for the mentor
 *   changes     the mentor asked for changes
 *   approved    approved by the mentor
 */

export const DOC_KINDS = {
  riskplan: { title: 'Risk Plan', practical: 'risk-plan-approved', route: '#/tools/risk-plan', level: 10 },
  strategy: { title: 'Strategy', practical: 'strategy-approved', route: '#/tools/strategy', level: 12 },
  backtest: { title: 'Backtest Lab Audit', practical: 'backtest-audit', route: '#/tools/backtest', level: 13 },
  pathlive: { title: 'Path-To-Live Plan', practical: 'path-to-live-approved', route: '#/tools/path-to-live', level: null },
  platforms: { title: 'Platform Practice Checklist', practical: 'platform-checklist', route: '#/tools/platforms', level: null }
};

export function docStatus(state, kind) {
  const d = state.docs && state.docs[kind];
  if (!d) return 'none';
  const def = DOC_KINDS[kind];
  if (def && state.practicals[def.practical]) return 'approved';
  if (d.review && d.review.verdict === 'changes' && (!d.submittedAt || d.review.at >= d.submittedAt)) return 'changes';
  if (d.submittedAt && (!d.review || d.submittedAt > d.review.at)) return 'submitted';
  return 'draft';
}

export const DOC_STATUS_LABEL = { none: 'Not Started', draft: 'Draft', submitted: 'With Your Mentor', changes: 'Changes Requested', approved: 'Approved' };

/** Documents waiting for the mentor, newest first. */
export function pendingDocs(state) {
  return Object.keys(state.docs || {})
    .filter((k) => DOC_KINDS[k] && docStatus(state, k) === 'submitted')
    .sort((a, b) => state.docs[b].submittedAt - state.docs[a].submittedAt);
}

/** Which practical requirements an exam blueprint waits for, and whether each is done: [{ id, label, done, route }]. */
export function practicalStatus(bp, state) {
  return (bp.practicals || []).map((p) => {
    const kind = Object.keys(DOC_KINDS).find((k) => DOC_KINDS[k].practical === p.id);
    return { id: p.id, label: p.label || p.description || p.id, done: !!state.practicals[p.id], route: kind ? DOC_KINDS[kind].route : null, kind };
  });
}
