/**
 * Module M1: the Custom Methodology editor (Mentor Mode) and the student's read-only view once it is released.
 * The module ships empty. Nothing is pre-filled except the thirteen section titles, which are the mentor's own brief.
 */

import { app, emit } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount, mdInline } from '../ui/dom.js';
import { button, card, chip, screenTitle, toast } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { DEFINITION_STATUS, RULE_KINDS, SEVERITY, APPLIES, SECTION_STATUS, emptyPack, packIsEmpty, validatePack, foundationComplete, releasedPack, evidenceLabel } from '../learn/methodology.js';
import { mentorUnlocked } from './mentor.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const field = (label, control, hint) => h('label', { class: 'jf' }, h('span', { class: 'jf-l' }, label), control, hint ? h('em', null, hint) : null);
const tin = (value, placeholder) => { const i = h('input', { type: 'text', class: 'jf-in', placeholder: placeholder || '' }); i.value = value || ''; return i; };
const area = (value, placeholder, rows = 3) => { const t = h('textarea', { class: 'written', rows, placeholder: placeholder || '' }); t.value = value || ''; return t; };
const choice = (list, cur, set) => h('div', { class: 'choices wrap' }, ...list.map(([v, l]) => h('button', { type: 'button', class: 'opt small' + (cur === v ? ' sel' : ''), 'data-v': v, onclick: (e) => { set(v); e.currentTarget.parentNode.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === e.currentTarget)); } }, l)));
const save = (pack) => emit('method.save', { pack: clone(pack) });

/* ---------------------------------------------------------------------------------- the mentor tab */

export function methodTab(body) {
  const m = app.state.methodology;
  const pack = m.pack;
  mount(body,
    card({}, h('div', { class: 'card-title' }, 'Module M1: Your Methodology'),
      h('p', null, pack && !packIsEmpty(pack) ? `Pack "${pack.name || 'Untitled'}" · ${pack.sections.filter((s) => s.status !== 'empty').length} of ${pack.sections.length} sections started. ${m.released ? 'Released to the student.' : 'Not released.'}` : 'The module is empty. It has a schema and an editor, and it contains no methodology: not one rule, definition or lesson. You write it.'),
      h('div', { class: 'qactions' }, button(pack ? 'Open The Editor' : 'Start An Empty Pack', { onClick: () => { if (!pack) save(emptyPack()); go('#/mentor/methodology'); } }))));
}

/* ---------------------------------------------------------------------------------- the editor */

export function methodologyEditorView({ tab = 'overview', section = null } = {}) {
  const screen = begin({ title: 'Methodology', back: '#/mentor' });
  if (!mentorUnlocked()) return mount(screen, card({}, h('p', null, 'Open Mentor Mode first.'), button('Mentor Mode', { onClick: () => go('#/mentor') })));
  let pack = app.state.methodology.pack;
  if (!pack) {
    save(emptyPack());
    pack = app.state.methodology.pack;
  }
  pack = clone(pack);
  const draw = (t = tab, sec = section) => {
    const tabs = h('div', { class: 'seg' }, ...[['overview', 'Overview'], ['sections', 'Sections'], ['parameters', 'Parameters'], ['preview', 'Preview'], ['release', 'Release']].map(([id, label]) => h('button', { type: 'button', class: 'seg-btn' + (id === t ? ' on' : ''), onclick: () => draw(id, null) }, label)));
    const body = h('div', { class: 'seg-body' });
    if (t === 'overview') overview(body);
    else if (t === 'sections') sec ? sectionEditor(body, sec) : sectionList(body);
    else if (t === 'parameters') parameters(body);
    else if (t === 'preview') body.append(packView(pack, true));
    else release(body);
    mount(screen, screenTitle('Your Methodology', 'Yours alone. Nothing here is pre-filled.'), tabs, body);
  };

  const overview = (body) => {
    const name = tin(pack.name, 'A name for the pack');
    const banner = area(pack.banner, '', 3);
    body.append(card({}, field('Name', name), field('Banner Shown To The Student', banner, 'Keeps your material labelled as yours.'), button('Save', { onClick: () => { pack.name = name.value.trim(); pack.banner = banner.value.trim() || pack.banner; save(pack); toast('Saved'); } })));
  };

  const sectionList = (body) => {
    body.append(...pack.sections.map((s) => h('button', { type: 'button', class: 'card review-item', onclick: () => draw('sections', s.id) }, h('div', null, h('b', null, s.title), h('span', null, `${s.definitions.length} definitions · ${s.rules.length} rules`)), chip(SECTION_STATUS.find(([v]) => v === s.status)[1], s.status === 'ready' ? 'emerald' : s.status === 'draft' ? 'gold' : 'sky'))));
  };

  const sectionEditor = (body, id) => {
    const s = pack.sections.find((x) => x.id === id);
    const title = tin(s.title);
    const overviewIn = area(s.overview, 'Your overview, in your words.', 4);
    body.append(button('Back To Sections', { variant: 'ghost', onClick: () => draw('sections', null) }),
      card({}, field('Section Title', title, 'Sections can be renamed.'), h('div', { class: 'jf-l' }, 'Status'), choice(SECTION_STATUS, s.status, (v) => { s.status = v; }), field('Overview', overviewIn),
        button('Save Section', { onClick: () => { s.title = title.value.trim() || s.title; s.overview = overviewIn.value; if (s.status === 'empty' && (s.overview.trim() || s.definitions.length || s.rules.length)) s.status = 'draft'; save(pack); toast('Saved'); draw('sections', id); } })));

    // definitions
    const dTerm = tin('', 'Term');
    const dText = area('', 'Definition', 3);
    let dStatus = null;
    body.append(card({}, h('div', { class: 'card-title' }, 'Definitions'),
      ...s.definitions.map((d, i) => h('div', { class: 'bt-row' }, h('span', null, `${d.term}: ${d.definition}`), chip(DEFINITION_STATUS.find(([v]) => v === d.status)?.[1] || 'No Status', d.status ? 'sky' : 'gold'), button('Remove', { variant: 'ghost', onClick: () => { s.definitions.splice(i, 1); save(pack); draw('sections', id); } }))),
      dTerm, dText, h('div', { class: 'jf-l' }, 'Status (Required)'), choice(DEFINITION_STATUS, null, (v) => { dStatus = v; }),
      button('Add The Definition', { variant: 'ghost', onClick: () => { if (!dTerm.value.trim() || !dText.value.trim()) return toast('Write the term and the definition.'); if (!dStatus) return toast('Choose a status first.'); s.definitions.push({ term: dTerm.value.trim(), definition: dText.value.trim(), status: dStatus }); if (s.status === 'empty') s.status = 'draft'; save(pack); draw('sections', id); } })));

    // rules
    const rText = area('', 'The rule', 3);
    const rLabel = tin('', 'Checklist label for the journal');
    let rKind = 'condition';
    let rSev = 'soft';
    let rApplies = 'both';
    body.append(card({}, h('div', { class: 'card-title' }, 'Rules'),
      ...s.rules.map((r, i) => h('div', { class: 'bt-row' }, h('span', null, `${r.text}`), chip(`${r.severity === 'hard' ? 'Hard' : 'Soft'} · ${r.kind}`, r.severity === 'hard' ? 'gold' : 'sky'), button('Remove', { variant: 'ghost', onClick: () => { s.rules.splice(i, 1); save(pack); draw('sections', id); } }))),
      rText, h('div', { class: 'jf-l' }, 'Kind'), choice(RULE_KINDS, rKind, (v) => { rKind = v; }), h('div', { class: 'jf-l' }, 'Severity (A Hard Rule Is Flagged In The Journal)'), choice(SEVERITY, rSev, (v) => { rSev = v; }), h('div', { class: 'jf-l' }, 'Applies To'), choice(APPLIES, rApplies, (v) => { rApplies = v; }), rLabel,
      button('Add The Rule', { variant: 'ghost', onClick: () => { if (!rText.value.trim()) return toast('Write the rule.'); s.rules.push({ id: 'r' + Date.now().toString(36), text: rText.value.trim(), kind: rKind, severity: rSev, appliesTo: rApplies, check: { mode: 'manual', checklistLabel: rLabel.value.trim() }, journalLabel: rLabel.value.trim() }); if (s.status === 'empty') s.status = 'draft'; save(pack); draw('sections', id); } }),
      h('p', { class: 'hint-line' }, 'Until a detector exists, a rule is a manual checklist item: the student attests and you spot-check.')));
  };

  const parameters = (body) => {
    const n = tin('', 'Name');
    const v = tin('', 'Value');
    body.append(card({}, h('div', { class: 'card-title' }, 'Parameters'), h('p', { class: 'hint-line' }, 'Named values that rules can refer to as {{name}}.'),
      ...pack.parameters.map((p, i) => h('div', { class: 'bt-row' }, h('span', null, `${p.name} = ${p.value}`), button('Remove', { variant: 'ghost', onClick: () => { pack.parameters.splice(i, 1); save(pack); draw('parameters'); } }))),
      n, v, button('Add', { variant: 'ghost', onClick: () => { if (!n.value.trim()) return; pack.parameters.push({ name: n.value.trim(), value: v.value.trim() }); save(pack); draw('parameters'); } })));
  };

  const release = (body) => {
    const r = validatePack(pack);
    const gate = foundationComplete(app.state);
    const m = app.state.methodology;
    body.append(card({}, h('div', { class: 'card-title' }, 'Before You Release'),
      h('div', { class: 'rp-check ' + (gate ? 'ok' : 'todo') }, h('span', null, gate ? '✓' : '○'), h('span', null, 'The foundation is complete: Levels 1 to 13 and Track P are passed.')),
      ...(r.ok ? [h('div', { class: 'rp-check ok' }, h('span', null, '✓'), h('span', null, 'Every definition has a status, every hard rule has a check, and nothing refers to a missing parameter.'))] : r.errors.map((e) => h('div', { class: 'rp-check todo' }, h('span', null, '○'), h('span', null, e)))),
      h('div', { class: 'qactions' }, m.released ? button('Withdraw From The Student', { variant: 'ghost', onClick: () => { emit('method.release', { on: false }); toast('Withdrawn'); draw('release'); } }) : button('Release To The Student', { disabled: !(gate && r.ok), onClick: () => { emit('method.release', { on: true }); toast('Released'); draw('release'); } })),
      h('p', { class: 'hint-line' }, m.released ? 'The student can see this pack under Practice.' : 'Until you release it, the student sees nothing of it.')));
  };
  draw(tab, section);
}

/* ---------------------------------------------------------------------------------- what the student sees */

export function packView(pack, preview = false) {
  const secs = pack.sections.filter((s) => s.status !== 'empty' || s.definitions.length || s.rules.length || String(s.overview || '').trim());
  return h('div', { class: 'methodology' },
    preview ? h('p', { class: 'hint-line' }, 'This is exactly what the student will see.') : null,
    h('div', { class: 'mentor-note' }, h('b', null, pack.name || 'The Methodology'), h('p', null, pack.banner)),
    ...(secs.length ? secs.map((s) => card({}, h('div', { class: 'card-title' }, s.title),
      s.overview ? h('div', { html: mdInline(s.overview) }) : null,
      ...s.definitions.map((d) => h('div', { class: 'part-score' }, h('span', null, h('b', null, d.term), ' · ', d.definition), h('span', null, chip(DEFINITION_STATUS.find(([v]) => v === d.status)[1], 'sky'), evidenceLabel(d) ? chip(evidenceLabel(d), 'gold') : null))),
      ...s.rules.map((r) => h('div', { class: 'part-score' }, h('span', null, r.text), h('span', null, chip(r.severity === 'hard' ? 'Hard Rule' : 'Soft Rule', r.severity === 'hard' ? 'gold' : 'sky')))))) : [card({}, h('p', null, 'Nothing has been written yet.'))]));
}

export function methodologyView() {
  const screen = begin({ title: 'Methodology', back: '#/practice', tab: 'practice' });
  const pack = releasedPack(app.state);
  if (!pack) return mount(screen, screenTitle('Methodology', 'Your mentor\'s own approach.'), card({}, h('p', null, 'Your mentor has not released a methodology. There is nothing here yet, and nothing in this course is presented as one.')));
  mount(screen, screenTitle('Methodology', 'Your mentor\'s own approach, as hypotheses under test.'), packView(pack));
}
