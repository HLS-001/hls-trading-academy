/**
 * Ranks are DERIVED from what the student has passed, never awarded by hand. A rank needs every rule before it as well.
 * Levels are read from state.levelsPassed. Checks and other assessments are read from state.exams[blueprintId].passed.
 */

export const RANK_RULES = [
  { id: 'market-student', levels: [1, 2, 3, 4, 5], exams: ['bp-rc1'] },
  { id: 'chart-student', levels: [6] },
  { id: 'structure-student', levels: [7, 8], exams: ['bp-rc2'] },
  { id: 'risk-student', levels: [9, 10, 11], exams: ['bp-rc3'] },
  { id: 'strategy-student', levels: [12] },
  { id: 'backtesting-student', levels: [13], exams: ['bp-rc4'] },
  { id: 'apprentice', exams: ['bp-trackp-final', 'bp-capstone'] }
];

const met = (rule, state) => (rule.levels || []).every((n) => state.levelsPassed[n]) && (rule.exams || []).every((id) => state.exams[id] && state.exams[id].passed);

/** The rank id for this state. */
export function rankFor(state) {
  let current = 'beginner';
  for (const rule of RANK_RULES) {
    if (!met(rule, state)) break;
    current = rule.id;
  }
  return current;
}

/** What the next rank needs that the student does not have yet: { rank, levels, exams } or null at the top. */
export function nextRankNeeds(state) {
  for (const rule of RANK_RULES) {
    if (met(rule, state)) continue;
    return {
      rank: rule.id,
      levels: (rule.levels || []).filter((n) => !state.levelsPassed[n]),
      exams: (rule.exams || []).filter((id) => !(state.exams[id] && state.exams[id].passed))
    };
  }
  return null;
}
