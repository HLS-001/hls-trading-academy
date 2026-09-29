/**
 * Turns the raw content bundle into the indexes the app and the engines use.
 * Pure (no fetching), so tests and the validator use exactly the same code.
 */

export function indexContent(bundle) {
  const levels = [...bundle.levels].sort((a, b) => a.number - b.number);
  const levelByNumber = new Map(levels.map((l) => [l.number, l]));
  const lessons = new Map(bundle.lessons.map((l) => [l.id, l]));
  const concepts = new Map(bundle.concepts.map((c) => [c.id, c]));
  const questions = new Map(bundle.questions.map((q) => [q.id, q]));
  const templates = new Map(bundle.templates.map((t) => [t.id, t]));
  const blueprints = new Map((bundle.blueprints || []).map((b) => [b.id, b]));
  const glossary = new Map((bundle.glossary || []).map((g) => [g.id, g]));

  const questionsByConcept = new Map();
  for (const q of bundle.questions) {
    for (const c of q.concepts || []) {
      if (!questionsByConcept.has(c)) questionsByConcept.set(c, []);
      questionsByConcept.get(c).push(q);
    }
  }
  const templatesByConcept = new Map();
  for (const t of bundle.templates) {
    for (const c of t.concepts || []) {
      if (!templatesByConcept.has(c)) templatesByConcept.set(c, []);
      templatesByConcept.get(c).push(t);
    }
  }

  for (const level of levels) {
    const ids = new Set();
    for (const lid of level.lessonIds || []) {
      const l = lessons.get(lid);
      if (l && l.concepts) for (const c of l.concepts.introduces || []) ids.add(c);
    }
    level.conceptIds = [...ids];
  }
  for (const l of lessons.values()) {
    for (const c of (l.concepts && l.concepts.introduces) || []) {
      const meta = concepts.get(c);
      if (meta && !meta.introducedIn) meta.introducedIn = l.id;
    }
  }

  return {
    version: bundle.version,
    levels,
    levelByNumber,
    lessons,
    concepts,
    questions,
    templates,
    blueprints,
    glossary,
    questionsByConcept,
    templatesByConcept,
    errorTags: bundle.errorTags || {},
    ranks: bundle.ranks || [],
    meta: bundle.meta || {}
  };
}
