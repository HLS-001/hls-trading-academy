/**
 * The lesson player. One card at a time, a slim step rail, and a check at the end that must reach 70%.
 * Step kinds: card, try, check, apply, reflect, ack, summary.
 */

import { app, emit } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount, rich, mdInline } from '../ui/dom.js';
import { button, card, chip, stepRail, openSheet, leafBurst, bar, ornament } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { figure } from '../ui/figures.js';
import { columnSvg } from '../ui/mark.js';
import { renderQuestion } from '../exercises/render.js';
import { runSet } from '../exercises/runner.js';
import { resolveItem, answerPayload } from '../exercises/resolve.js';
import { WIDGETS } from '../interactives/index.js';
import { lessonStatus, examStatus, debtGateActive, reviewDebt } from '../learn/progress.js';

const PASS = 0.7;

/* ------------------------------------------------------------------ content blocks */

function termsRow(ids) {
  return h('div', { class: 'terms' }, ...ids.map((id) => {
    const t = app.content.glossary.get(id);
    return h('button', { type: 'button', class: 'term', onclick: () => openSheet(h('div', null, h('p', { class: 'term-def' }, t.definition), h('div', { class: 'term-status' }, chip(t.status === 'definition' ? 'Definition' : t.status, 'sky'))), { title: t.term }) }, t.term);
  }));
}

const STATUS_CHIP = { definition: ['Definition', 'sky'], observable: ['Observable', 'emerald'], interpretation: ['Interpretation', 'gold'], hypothesis: ['Hypothesis', 'violet'], evidence: ['Evidence', 'teal'] };

export function blockNode(b) {
  switch (b.type) {
    case 'text': return rich(b.text, 'p', { class: 'l-text' });
    case 'claim': {
      const [label, tone] = STATUS_CHIP[b.status];
      return h('div', { class: 'claim' }, chip(label, tone), rich(b.text, 'p'));
    }
    case 'callout':
      return h('div', { class: 'callout ' + (b.variant || 'key') }, b.title ? h('div', { class: 'callout-title' }, b.title) : null, rich(b.text, 'p'));
    case 'list': {
      const list = h(b.ordered ? 'ol' : 'ul', { class: 'l-list' }, ...b.items.map((it) => h('li', { html: mdInline(it) })));
      return list;
    }
    case 'example':
      return h('div', { class: 'example' }, h('div', { class: 'example-title' }, b.title), h('ol', null, ...b.steps.map((st) => h('li', { html: mdInline(st) }))));
    case 'terms': return termsRow(b.ids);
    case 'figure': return figure(b.name);
    default: return h('div');
  }
}

/* ------------------------------------------------------------------ the view */

export function lessonView({ id }) {
  const c = app.content;
  const lesson = c.lessons.get(id);
  const level = lesson && c.levelByNumber.get(lesson.level);
  const backTo = lesson && level && !lesson.preview ? `#/level/${level.number}` : '#/curriculum';
  const screen = begin({ title: lesson ? `Lesson ${lesson.number}` : 'Lesson', back: backTo, focus: true });
  if (!lesson) return mount(screen, card(h('p', null, 'That lesson does not exist.')));

  const status = lessonStatus(lesson, app.state, c);
  const completed = status === 'completed';
  if (status === 'locked') {
    return mount(screen, card({ class: 'gate' }, h('h2', null, 'This Lesson Is Locked'), h('p', null, 'Finish the lessons before it first. Each one builds on the last.'), button('Back To The Level', { onClick: () => go(backTo) })));
  }
  if (!completed && !app.state.lessons[id] && debtGateActive(app.state, Date.now())) {
    return mount(screen, card({ class: 'gate' }, h('h2', null, 'Warm-Up First'), h('p', null, `You have ${reviewDebt(app.state, Date.now())} reviews waiting. Do the Warm-Up, then come back.`), button('Start The Warm-Up', { onClick: () => go('#/warmup') })));
  }

  const steps = lesson.steps;
  const saved = app.state.lessons[id];
  let idx = !completed && saved ? Math.min(saved.step, steps.length - 1) : 0;
  let checkScore = saved ? saved.checkpointBest : 0;
  const ready = new Set(); // steps the student has finished interacting with
  if (!saved) emit('lesson.open', { lessonId: id });

  const host = h('div', { class: 'lesson' });
  mount(screen, host);

  const ctx = { kind: 'lesson', ref: id, lessonId: id };

  function show(i, direction = 1) {
    idx = i;
    const step = steps[i];
    emit('lesson.step', { lessonId: id, step: i });
    const nav = h('div', { class: 'lesson-nav' });
    const cont = button(step.kind === 'summary' ? 'Complete Lesson' : 'Continue', { onClick: () => (step.kind === 'summary' ? finish() : show(i + 1, 1)), id: 'continue-btn' });
    const isReady = () => completed || ready.has(i) || ['card', 'summary'].includes(step.kind);
    cont.disabled = !isReady();
    const setReady = () => {
      ready.add(i);
      cont.disabled = false;
      cont.classList.add('ready');
    };
    if (i > 0) nav.append(button('Back', { variant: 'ghost', onClick: () => show(i - 1, -1) }));
    nav.append(cont);

    const body = h('div', { class: 'step-body ' + (direction > 0 ? 'in-right' : 'in-left'), dataset: { kind: step.kind, widget: step.widget || '' } });
    const title = stepTitle(step);
    const built = buildStep(step, { lesson, ctx, setReady, i, completed, rerender: () => show(i, 1), gotoStep: show, setCheckScore: (s) => (checkScore = Math.max(checkScore, s)) });
    body.append(h('h2', { class: 'step-title' }, title), built);

    mount(host,
      h('div', { class: 'lesson-head' }, h('div', { class: 'lesson-num' }, `${lesson.number} · ${lesson.estMinutes} min`), h('h1', null, lesson.title), stepRail(steps.length, i)),
      body,
      nav);
    window.scrollTo(0, 0);
  }

  function stepTitle(step) {
    if (step.title) return step.title;
    return { check: 'Check Your Understanding', summary: 'What You Learned', reflect: 'In Your Own Words', ack: 'One Thing To Confirm', try: 'Try It', apply: 'Apply It' }[step.kind] || '';
  }

  function finish() {
    const gated = steps.filter((s) => s.kind === 'check' && s.gating !== false).length > 0;
    if (gated && checkScore < PASS && !completed) {
      openSheet(h('p', null, 'Pass the check at the end of the lesson first.'), { title: 'Not Yet' });
      const at = steps.findIndex((s) => s.kind === 'check');
      return show(at, -1);
    }
    emit('lesson.complete', { lessonId: id, checkpointScore: checkScore, introduces: lesson.concepts?.introduces || [] });
    completeScreen();
  }

  function completeScreen() {
    const l = lesson;
    const lv = level;
    const idxInLevel = lv ? lv.lessonIds.indexOf(l.id) : -1;
    const nextId = lv && idxInLevel >= 0 ? lv.lessonIds[idxInLevel + 1] : null;
    const examReady = lv && idxInLevel === lv.lessonIds.length - 1 && lv.finalBlueprint ? examStatus(lv, app.state, c) : null;
    const col = columnSvg({ progress: 1, phase: 'teal', state: 'done' });
    const anim = h('div', { class: 'done-col' }, col);
    mount(host,
      h('div', { class: 'done-screen' },
        anim,
        h('div', { class: 'eyebrow' }, 'Lesson Complete'),
        h('h1', null, l.title),
        ornament(),
        h('p', { class: 'done-sub' }, checkScore ? `Check score: ${Math.round(checkScore * 100)}%` : 'Well done.'),
        h('div', { class: 'done-actions' },
          nextId ? button('Next Lesson', { onClick: () => go(`#/lesson/${nextId}`) }) : null,
          examReady && examReady.available ? button('Take The Level Assessment', { onClick: () => go(`#/exam/${lv.finalBlueprint}`) }) : null,
          !nextId && lv && !lv.finalBlueprint && lv.number === 0 ? button('Back To The Curriculum', { onClick: () => go('#/curriculum') }) : null,
          lv && !l.preview ? button('Back To The Level', { variant: 'ghost', onClick: () => go(`#/level/${lv.number}`) }) : button('Back To The Curriculum', { variant: 'ghost', onClick: () => go('#/curriculum') }))));
    leafBurst(anim);
    window.scrollTo(0, 0);
  }

  show(idx);
}

/* ------------------------------------------------------------------ building one step */

function buildStep(step, env) {
  switch (step.kind) {
    case 'card': return h('div', { class: 'card-body' }, ...step.blocks.map(blockNode));
    case 'summary': return h('div', { class: 'card-body' }, h('ul', { class: 'l-list summary-list' }, ...step.points.map((p) => h('li', { html: mdInline(p) }))));
    case 'ack': return ackStep(step, env);
    case 'check': return checkStep(step, env);
    case 'reflect': return reflectStep(step, env);
    case 'try':
    case 'apply': return tryStep(step, env);
    default: return h('div');
  }
}

function ackStep(step, env) {
  const done = !!app.state.ack.honesty;
  const wrap = h('div', { class: 'card-body' });
  const btn = button(step.button || 'I Understand', { onClick: () => { emit('ack.honesty'); btn.disabled = true; btn.textContent = 'Confirmed'; env.setReady(); } });
  if (done) {
    btn.disabled = true;
    btn.textContent = 'Confirmed';
    env.setReady();
  }
  wrap.append(h('div', { class: 'callout keypoint' }, rich(step.text, 'p')), h('div', { class: 'qactions' }, btn));
  return wrap;
}

function tryStep(step, env) {
  const wrap = h('div', { class: 'card-body try' });
  if (step.intro) wrap.append(rich(step.intro, 'p', { class: 'try-intro' }));
  const ctx = env.ctx;
  const lessonId = env.lesson.id;

  if (step.widget) {
    const w = WIDGETS[step.widget];
    wrap.append(w({ spec: step, onInteract: env.setReady, lessonId }));
    return wrap;
  }

  const mountItem = (host) => {
    let item;
    if (step.exercise) item = resolveItem({ kind: 'inline', q: step.exercise });
    else item = resolveItem({ kind: 't', id: step.guided || step.template, mode: step.guided ? 'steps' : 'single' });
    const again = h('div', { class: 'qactions' });
    const card = renderQuestion(item, {
      mode: 'practice',
      shuffleSeed: item.seed || 1,
      onAnswer: (result) => {
        const concepts = item.concepts || [];
        if (concepts.length && !result.pending) emit('question.answer', answerPayload(item, result, ctx));
        env.setReady();
        if (item.kind === 't') again.append(button('Try Another', { variant: 'ghost', onClick: () => mountItem(host) }));
      }
    });
    mount(host, card.el, again);
  };
  const host = h('div');
  mountItem(host);
  wrap.append(host);
  return wrap;
}

function checkStep(step, env) {
  const host = h('div', { class: 'check-host' });
  const gating = step.gating !== false;

  const run = () => {
    runSet({
      container: host,
      refs: step.questionIds,
      ctx: env.ctx,
      mode: 'practice',
      onDone: (res) => {
        const score = res.score;
        env.setCheckScore(score);
        const passed = !gating || score >= PASS;
        const wrong = res.results.map((r, i) => (r && !r.correct && !r.pending ? res.items[i] : null)).filter(Boolean);
        const summary = h('div', { class: 'check-summary ' + (passed ? 'pass' : 'fail') },
          h('div', { class: 'eyebrow' }, gating ? (passed ? 'Check Passed' : 'Not Yet') : 'Finished'),
          h('div', { class: 'big-score' }, Math.round(score * 100) + '%'),
          h('p', null, `${res.correct} of ${res.n} right.`),
          gating && !passed ? h('p', null, `You need ${Math.round(PASS * 100)}% to complete the lesson. Look back over the cards, then try again.`) : null,
          step.selfCheck ? numberSkills(res) : null,
          gating && !passed ? h('div', { class: 'qactions' }, button('Review The Lesson', { variant: 'ghost', onClick: () => env.gotoStep(0, -1) }), button('Try Again', { onClick: run })) : null);
        mount(host, summary);
        if (passed) env.setReady();
      }
    });
  };
  run();
  return host;
}

function numberSkills(res) {
  const groups = {};
  res.items.forEach((item, i) => {
    for (const c of item.concepts) {
      const g = (groups[c] = groups[c] || { n: 0, ok: 0 });
      g.n += 1;
      if (res.results[i] && res.results[i].correct) g.ok += 1;
    }
  });
  const rows = Object.entries(groups).map(([c, g]) => h('div', { class: 'skill-row' }, h('span', null, app.content.concepts.get(c)?.name || c), h('b', { class: g.ok === g.n ? 'strong' : 'weak' }, g.ok === g.n ? 'Strong' : 'Needs Practice')));
  const weak = Object.values(groups).some((g) => g.ok < g.n);
  return h('div', { class: 'skills' }, ...rows, h('p', { class: 'hint-line' }, weak ? 'A short Number Skills track will help with the weak spots. It is planned for the next phase of the app. For now, the Weak Areas screen will keep bringing these back.' : 'Your number skills look solid.'));
}

function reflectStep(step, env) {
  const wrap = h('div', { class: 'card-body' });
  wrap.append(rich(step.prompt, 'p'));
  const ta = h('textarea', { class: 'written', rows: 7, placeholder: 'Write in your own words…', 'aria-label': 'Your answer' });
  const count = h('div', { class: 'wcount' }, '0 words');
  ta.addEventListener('input', () => {
    const n = ta.value.trim().split(/\s+/).filter(Boolean).length;
    count.textContent = n + ' words';
    submit.disabled = n < 15;
  });
  const out = h('div', { class: 'lab-out' });
  const submit = button('Show The Model Answer', { onClick: () => {
    submit.disabled = true;
    ta.readOnly = true;
    const marks = {};
    const list = h('ul', { class: 'rubric-check' }, ...step.rubric.map((r, i) => h('li', null, h('label', null, h('input', { type: 'checkbox', onchange: (e) => (marks[i] = e.target.checked) }), h('span', null, r)))));
    out.replaceChildren(
      h('div', { class: 'callout keypoint' }, h('div', { class: 'callout-title' }, 'A Model Answer'), rich(step.modelAnswer, 'p')),
      h('p', { class: 'hint-line' }, 'Compare honestly. Tick each point your own answer made. This is for you; the real assessment is marked by your mentor.'),
      list,
      h('div', { class: 'qactions' }, button('Done', { onClick: (e, b) => { emit('reflect.save', { lessonId: env.lesson.id, text: ta.value.trim(), marks }); b.disabled = true; env.setReady(); } })));
  }, disabled: true });
  wrap.append(ta, count, h('div', { class: 'qactions' }, submit), out);
  return wrap;
}
