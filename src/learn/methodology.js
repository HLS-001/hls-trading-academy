/**
 * Module M1, the Custom Methodology container. It ships EMPTY: a schema, an editor and integration points, and not one rule,
 * definition or lesson. The course never invents the mentor's strategy. The thirteen section titles are the mentor's own brief, and
 * every section starts with status "empty" and nothing in it.
 */

export const SECTION_TITLES = ['Markets', 'Trading Sessions', 'HTF Structure Rules', 'Confirmed High/Low Definitions', 'Discount/Premium Rules', 'Entry Model(s)', 'Liquidity Concepts', 'Stop-Loss Rules', 'Target Rules', 'Position Management', 'Partial Profit Rules', 'Runner Rules', 'No-Trade Conditions'];

/** Every definition carries one of these. The student sees it as a chip, so a subjective idea is never presented as a fact. */
export const DEFINITION_STATUS = [['definition', 'Definition'], ['observable', 'Observable'], ['interpretation', 'Interpretation'], ['hypothesis', 'Hypothesis'], ['evidence', 'Evidence']];
export const RULE_KINDS = [['condition', 'Condition'], ['filter', 'Filter'], ['constraint', 'Constraint'], ['management', 'Management'], ['exit', 'Exit']];
export const SEVERITY = [['hard', 'Hard'], ['soft', 'Soft']];
export const APPLIES = [['both', 'Both'], ['long', 'Long'], ['short', 'Short']];
export const SECTION_STATUS = [['empty', 'Empty'], ['draft', 'Draft'], ['ready', 'Ready']];
export const DEFAULT_BANNER = 'The mentor\'s methodology. Presented as hypotheses under test unless evidence is attached.';

export function emptyPack() {
  return {
    id: 'm1',
    name: '',
    version: 1,
    status: 'draft',
    banner: DEFAULT_BANNER,
    parameters: [],
    sections: SECTION_TITLES.map((title, i) => ({ id: 's' + (i + 1), title, status: 'empty', overview: '', definitions: [], rules: [] }))
  };
}

/** True when nothing has been written anywhere: the state the module ships in. */
export function packIsEmpty(pack) {
  if (!pack) return true;
  return !String(pack.name || '').trim() && (pack.parameters || []).length === 0 && (pack.sections || []).every((s) => s.status === 'empty' && !String(s.overview || '').trim() && s.definitions.length === 0 && s.rules.length === 0);
}

const words = (s) => String(s || '').match(/\{\{\s*([\w-]+)\s*\}\}/g) || [];

/**
 * The checks run before Release: every definition has a status, every hard rule has a check, and no rule refers to a parameter that
 * does not exist. Returns { errors: [text], ok }.
 */
export function validatePack(pack) {
  const errors = [];
  if (!pack) return { errors: ['There is no pack yet.'], ok: false };
  if (!String(pack.name || '').trim()) errors.push('The pack needs a name.');
  const params = new Set((pack.parameters || []).map((p) => p.name));
  let content = 0;
  for (const s of pack.sections || []) {
    if (s.status !== 'empty' || s.definitions.length || s.rules.length || String(s.overview || '').trim()) content += 1;
    for (const d of s.definitions) {
      if (!String(d.term || '').trim() || !String(d.definition || '').trim()) errors.push(`${s.title}: a definition is missing its term or its text.`);
      if (!DEFINITION_STATUS.some(([v]) => v === d.status)) errors.push(`${s.title}: "${d.term || 'a definition'}" has no status (definition, observable, interpretation, hypothesis or evidence).`);
    }
    for (const r of s.rules) {
      if (!String(r.text || '').trim()) errors.push(`${s.title}: a rule has no text.`);
      if (r.severity === 'hard' && !(r.check && ((r.check.mode === 'manual' && String(r.check.checklistLabel || '').trim()) || (r.check.mode === 'auto' && r.check.expr)))) errors.push(`${s.title}: the hard rule "${String(r.text || '').slice(0, 40)}" has no check. Give it a checklist label.`);
      for (const w of words(r.text)) {
        const name = w.replace(/[{}\s]/g, '');
        if (!params.has(name)) errors.push(`${s.title}: a rule refers to the parameter "${name}", which does not exist.`);
      }
    }
  }
  if (content === 0) errors.push('Every section is still empty. There is nothing to release.');
  return { errors, ok: errors.length === 0 };
}

/** Whether the foundation is complete, which the design requires before any release: Levels 1 to 13 and Track P. */
export const foundationComplete = (st) => !!st.settings.testOut || (Array.from({ length: 13 }, (_, i) => i + 1).every((n) => st.levelsPassed[n]) && !!(st.exams['bp-trackp-final'] && st.exams['bp-trackp-final'].passed));

/** The pack the student sees, or null while it is not released. */
export const releasedPack = (st) => (st.methodology && st.methodology.released && st.methodology.pack ? st.methodology.pack : null);

/** The rules that appear as a violation checklist in the journal once the pack is released. */
export function journalRules(pack) {
  if (!pack) return [];
  return pack.sections.flatMap((s) => s.rules.map((r) => ({ id: r.id, section: s.title, severity: r.severity, label: String(r.journalLabel || (r.check && r.check.checklistLabel) || r.text || '').trim() }))).filter((r) => r.label);
}

/** "No evidence attached yet" until a backtest run is attached to a claim. Evidence attachment is not built yet, so this is honest. */
export const evidenceLabel = (d) => (d.status === 'evidence' ? 'Evidence' : d.status === 'definition' || d.status === 'observable' ? null : 'No evidence attached yet');
