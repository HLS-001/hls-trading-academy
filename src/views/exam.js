/**
 * The level assessment: intro, the paper (no feedback as you go), the result, and the targeted review
 * that follows a failed attempt.
 */

import { app, emit, kv, newId } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount, rich } from '../ui/dom.js';
import { button, card, chip, bar, ornament, leafBurst, confirmSheet } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { markAnimated } from '../ui/mark.js';
import { roman } from '../ui/roman.js';
import { runSet, gradeAll } from '../exercises/runner.js';
import { resolveItem, examResultOf } from '../exercises/resolve.js';
import { buildForm, scoreExam } from '../learn/assess.js';
import { examStatus } from '../learn/progress.js';
import { freshSeed } from '../learn/rng.js';
import { statusText } from './curriculum.js';

const levelOf = (bp) => app.content.levelByNumber.get(bp.level);

/* ------------------------------------------------------------------ taking the exam */

export async function examView({ bp: bpId }) {
  const c = app.content;
  const bp = c.blueprints.get(bpId);
  const level = bp && levelOf(bp);
  const screen = begin({ title: bp ? bp.title : 'Assessment', back: level ? `#/level/${level.number}` : '#/curriculum', focus: true });
  if (!bp) return mount(screen, card(h('p', null, 'That assessment does not exist.')));

  const es = examStatus(level, app.state, c);
  const draft = await kv.get('examDraft:' + bpId);
  if (!es.available && !draft) {
    return mount(screen, card({ class: 'gate' }, h('h2', null, 'Not Available Yet'), h('p', null, es.reason), button('Back To The Level', { onClick: () => go(`#/level/${level.number}`) })));
  }

  const start = (form, prefill, startAt) => {
    const refs = form.items.map((it) => ({ kind: it.kind, id: it.id, seed: it.seed }));
    const partTitle = (p) => bp.parts.find((x) => x.id === p)?.title || p;
    const resolved = refs.map((r) => resolveItem(r));
    const total = resolved.length;
    runSet({
      container: screen,
      refs,
      resolved,
      ctx: { kind: 'exam', ref: form.id },
      mode: 'exam',
      startAt,
      prefill,
      labelFor: (i) => `Part ${form.items[i].part} · ${partTitle(form.items[i].part)}`,
      onProgress: (i, _r, response) => {
        const responses = prefill ? [...prefill] : new Array(total).fill(undefined);
        // persist the draft so a refresh or a closed app does not lose the paper
        kv.get('examDraft:' + bpId).then((d) => {
          const cur = d && d.responses ? d.responses : responses;
          cur[i] = response;
          kv.set('examDraft:' + bpId, { form, responses: cur, next: i + 1 });
        });
      },
      onDone: (res) => submit(bp, form, res)
    });
  };

  if (draft) {
    mount(screen, h('div', { class: 'exam-intro' },
      h('div', { class: 'eyebrow' }, 'Assessment In Progress'),
      h('h1', null, bp.title),
      ornament(),
      h('p', null, `You answered ${draft.next} of ${draft.form.items.length}. Pick up where you left off.`),
      h('div', { class: 'qactions' }, button('Continue', { onClick: () => start(draft.form, draft.responses, Math.min(draft.next, draft.form.items.length - 1)) }), button('Start A New Paper', { variant: 'ghost', onClick: async () => { await kv.del('examDraft:' + bpId); examView({ bp: bpId }); } }))));
    return;
  }

  mount(screen, h('div', { class: 'exam-intro' },
    h('div', { class: 'eyebrow' }, `Level ${roman(level.number)}`),
    h('h1', null, bp.title),
    ornament(),
    rich(bp.intro, 'p'),
    h('div', { class: 'parts' }, ...bp.parts.map((p) => h('div', { class: 'part-row' }, h('b', null, `Part ${p.id} · ${p.title}`), h('span', null, p.note)))),
    h('div', { class: 'callout keypoint' }, h('div', { class: 'callout-title' }, 'How It Is Marked'), h('p', null, `You need ${Math.round(bp.passMark * 100)}% overall, at least ${Math.round(bp.partMin * 100)}% in every part, and your mentor must mark your written answer as meeting the standard. You will not see answers as you go. You will see everything at the end.`)),
    button('Begin', { block: true, onClick: () => {
      const form = buildForm(bp, { questions: [...c.questions.values()], templates: [...c.templates.values()], seen: app.state.seen, seed: freshSeed() });
      kv.set('examDraft:' + bpId, { form, responses: new Array(form.items.length).fill(undefined), next: 0 });
      start(form, null, 0);
    } })));
}

/* ------------------------------------------------------------------ submitting */

async function submit(bp, form, res) {
  const c = app.content;
  const graded = gradeAll(res.items, res.responses);
  const results = res.items.map((item, i) => (graded[i].pending ? { pending: true } : examResultOf(item, graded[i])));
  const result = scoreExam(bp, form, results, {});
  const attemptId = newId();

  // every graded item still feeds mastery, tagged as an exam attempt
  res.items.forEach((item, i) => {
    const r = graded[i];
    if (r.pending) return;
    emit('question.answer', {
      qid: item.kind === 'q' ? item.q.id : undefined,
      tid: item.kind === 't' ? item.tpl.id : undefined,
      seed: item.kind === 't' ? item.seed : undefined,
      type: item.kind === 't' ? 'numeric' : item.q.type,
      kind: item.kind === 't' || item.q.type === 'num' ? 'numeric' : 'concept',
      concepts: item.concepts,
      score: r.score ?? 0,
      correct: !!r.correct,
      errorTags: r.errorTags || [],
      ctx: { kind: 'exam', ref: attemptId },
      homeFor: []
    });
  });

  const examAcc = {};
  results.forEach((r) => {
    if (r.pending) return;
    for (const conc of r.concepts) {
      const a = (examAcc[conc] = examAcc[conc] || { n: 0, sum: 0 });
      a.n += 1;
      a.sum += r.score;
    }
  });
  emit('exam.submit', { attemptId, blueprintId: bp.id, level: bp.level, seed: form.seed, form: { id: form.id, items: form.items }, result, examAcc });

  // the written answer goes to the mentor only when the marked parts are good enough to make it worth reading
  const wIdx = res.items.findIndex((it) => it.kind === 'q' && it.q.type === 'written');
  if (wIdx >= 0 && result.autoPass && res.responses[wIdx]) {
    emit('written.submit', { wid: newId(), questionId: res.items[wIdx].q.id, text: res.responses[wIdx], ctx: { kind: 'exam', ref: attemptId } });
  }
  await kv.del('examDraft:' + bp.id);
  go(`#/exam-result/${bp.id}/${attemptId}`, { replace: true });
}

/* ------------------------------------------------------------------ the result */

export function examResultView({ bp: bpId, attempt: attemptId }) {
  const c = app.content;
  const bp = c.blueprints.get(bpId);
  const level = bp && levelOf(bp);
  const screen = begin({ title: 'Result', back: level ? `#/level/${level.number}` : '#/curriculum', tab: 'curriculum' });
  const record = app.state.exams[bpId];
  const a = record && record.attempts.find((x) => x.attemptId === attemptId);
  if (!bp || !a) return mount(screen, card(h('p', null, 'That result could not be found.')));

  const status = a.status;
  const pass = status === 'passed';
  const head = h('div', { class: 'result-head ' + (pass ? 'pass' : status === 'awaiting-mentor' ? 'wait' : 'fail') },
    h('div', { class: 'eyebrow' }, bp.title),
    h('div', { class: 'big-score' }, Math.round(a.overall * 100) + '%'),
    chip(statusText(status), pass ? 'emerald' : status === 'awaiting-mentor' ? 'sky' : 'gold'));

  const parts = h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'By Part'),
    ...a.parts.filter((p) => p.n > 0).map((p) => h('div', { class: 'part-score' }, h('span', null, `${p.id} · ${p.title}`), bar(p.score), h('b', { class: p.score < bp.partMin ? 'low' : '' }, Math.round(p.score * 100) + '%'))));

  const writtenBlock = (a.written || []).map((w) => {
    const rec = w.wid ? app.state.written[w.wid] : null;
    const q = c.questions.get(w.questionId);
    const label = { unsubmitted: a.autoPass ? 'Not sent' : 'Held back until the marked parts pass', pending: 'Waiting for your mentor', meets: 'Meets the standard', partly: 'Partly there', notyet: 'Not yet' }[w.status] || w.status;
    return h('div', { class: 'card written-result' }, h('div', { class: 'card-title' }, 'Written Answer'), rich(q.prompt, 'p', { class: 'q-sub' }), chip(label, w.status === 'meets' ? 'emerald' : w.status === 'pending' ? 'sky' : 'gold'),
      rec && rec.comment ? h('div', { class: 'mentor-note' }, h('b', null, 'Your Mentor Says'), h('p', null, rec.comment)) : null);
  });

  const weak = (a.diagnostic && a.diagnostic.weakConcepts) || [];
  const tags = Object.entries((a.diagnostic && a.diagnostic.errorTags) || {}).sort((x, y) => y[1] - x[1]);
  const diag = weak.length || tags.length
    ? h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'What To Work On'),
        ...weak.slice(0, 6).map((w) => h('div', { class: 'weak-row' }, h('span', null, c.concepts.get(w.concept)?.name || w.concept), h('b', null, Math.round(w.accuracy * 100) + '%'))),
        tags.slice(0, 3).length ? h('p', { class: 'hint-line' }, 'Mistakes that repeated: ' + tags.slice(0, 3).map(([t]) => c.errorTags[t]?.label || t).join('; ') + '.') : null)
    : null;

  const actions = h('div', { class: 'qactions col' });
  if (status === 'failed' || status === 'failed-written') {
    const es = examStatus(level, app.state, c);
    if (record.reviewPending && record.reviewPending.length) actions.append(button('Start The Targeted Review', { onClick: () => go(`#/review/${bpId}`) }));
    else if (es.available) actions.append(button('Retake The Assessment', { onClick: () => go(`#/exam/${bpId}`) }));
    actions.append(button('Back To The Level', { variant: 'ghost', onClick: () => go(`#/level/${level.number}`) }));
  } else {
    actions.append(button(pass ? 'Back To The Curriculum' : 'Back To Today', { onClick: () => go(pass ? '#/curriculum' : '#/today') }));
  }

  const celebrate = pass ? h('div', { class: 'celebrate' }, markAnimated({ size: 160 })) : null;
  mount(screen, head, celebrate, h('div', { class: 'rule-line' }, `Pass rule: ${Math.round(bp.passMark * 100)}% overall, ${Math.round(bp.partMin * 100)}% in every part, and a written answer marked "Meets".`), parts, ...writtenBlock, diag,
    pass ? card({ class: 'next-level' }, h('b', null, `Level ${roman(level.number)} Complete`), h('p', null, level.number < 13 ? 'The next level is being built. Your Warm-Up will keep this level fresh in the meantime.' : '')) : null, actions);
  if (celebrate) {
    const m = celebrate.querySelector('.mk');
    requestAnimationFrame(() => m && m.play());
    leafBurst(celebrate);
  }
}

/* ------------------------------------------------------------------ targeted review */

export function reviewView({ bp: bpId }) {
  const c = app.content;
  const bp = c.blueprints.get(bpId);
  const level = bp && levelOf(bp);
  const screen = begin({ title: 'Targeted Review', back: level ? `#/level/${level.number}` : '#/curriculum', tab: 'curriculum' });
  const record = app.state.exams[bpId];
  if (!bp || !record) return mount(screen, card(h('p', null, 'Nothing to review.')));
  const pending = record.reviewPending || [];
  const last = record.attempts[record.attempts.length - 1];
  const weak = (last?.diagnostic?.weakConcepts || []).map((w) => w.concept);
  const rows = weak.map((conc) => {
    const cleared = !pending.includes(conc);
    const best = app.state.reviewChecks[conc]?.best;
    return h('div', { class: 'card review-row' }, h('div', null, h('b', null, c.concepts.get(conc)?.name || conc), h('span', null, cleared ? 'Cleared' : best ? `Best so far ${Math.round(best * 100)}%. You need 80%.` : 'A short practice set, then a check.')),
      cleared ? chip('Cleared', 'emerald') : button('Practice', { onClick: () => go(`#/focus/${conc}?review=${bpId}`) }));
  });
  mount(screen,
    h('div', { class: 'level-head' }, h('div', { class: 'eyebrow' }, bp.title), h('h1', null, 'Targeted Review'), ornament(), h('p', null, 'These are the ideas your last attempt showed need work. Clear each one with a practice set (80% or more), then the assessment reopens with a fresh paper.')),
    ...rows,
    pending.length === 0 ? button('Retake The Assessment', { block: true, onClick: () => go(`#/exam/${bpId}`) }) : null);
}
