/**
 * Weak-area detection and the plain-language recommendation for each.
 * The recommendation is built from the DOMINANT ERROR TAG, so "you keep getting position sizing wrong"
 * becomes "you keep using 0.0001 as the pip size on USD/JPY, so practice the JPY set".
 */

import { masteryOf, weakReasons, statusOf, recentMisses } from './mastery.js';

export function weakAreas(state, content, nowMs) {
  const out = [];
  for (const cs of Object.values(state.concepts)) {
    if (!cs.hist.length) continue;
    const mastery = masteryOf(cs, examAccuracy(state, cs.concept));
    const reasons = weakReasons(cs, mastery, nowMs);
    if (!reasons.length) continue;

    const tags = {};
    for (const h of cs.hist.slice(-8)) for (const e of h.e || []) tags[e] = (tags[e] || 0) + 1;
    const dominant = Object.entries(tags).sort((a, b) => b[1] - a[1])[0] || null;
    const recent = cs.hist.slice(-6);
    const missed = recentMisses(cs);

    const meta = content.concepts.get(cs.concept) || { id: cs.concept, name: cs.concept };
    const tagInfo = dominant ? content.errorTags[dominant[0]] : null;
    // say the reason that actually put it on the list, never "missed 0 of 6"
    const lapses = reasons.find((r) => r.kind === 'lapses');
    let summary = missed > 0
      ? `You missed ${missed} of your last ${recent.length} on ${meta.name}.`
      : lapses
        ? `You let ${meta.name} slip ${lapses.count} times in the last 30 days. Your latest answers are right, so a quick refresher will keep it.`
        : `${meta.name} needs another look.`;
    if (dominant && tagInfo) summary += ` ${dominant[1] >= 2 ? dominant[1] + ' were' : 'One was'} this mistake: ${tagInfo.label}.`;

    const actions = [];
    if (meta.introducedIn) actions.push({ label: 'Refresh The Lesson', route: `#/lesson/${meta.introducedIn}` });
    actions.push({ label: 'Practice This Concept', route: `#/focus/${cs.concept}` });
    if (meta.practiceRoute) actions.push({ label: meta.practiceLabel || 'Open The Calculator', route: meta.practiceRoute });

    const severity = Math.max(0, 60 - mastery) + (lapses ? lapses.count * 10 : 0) + (dominant ? dominant[1] * 5 : 0);
    out.push({
      concept: cs.concept,
      name: meta.name,
      mastery,
      status: statusOf(cs, mastery),
      reasons,
      dominantTag: dominant ? dominant[0] : null,
      dominantTagLabel: tagInfo ? tagInfo.label : null,
      summary,
      actions,
      severity
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

export function examAccuracy(state, concept) {
  const a = state.examAcc[concept];
  return a && a.n ? a.sum / a.n : null;
}
