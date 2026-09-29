/**
 * A test driver, loaded ONLY when the page is opened with ?test. It plays the student through the real UI
 * (clicks and keypad presses, not shortcuts) so the smoke test exercises what a person would.
 * Inert in normal use.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => {
  if (!el) throw new Error('drive: nothing to click');
  el.click();
};
const byText = (sel, text, root = document) => $$(sel, root).find((e) => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));

async function waitFor(fn, { timeout = 4000, label = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('drive: timed out waiting for ' + label);
    await sleep(25);
  }
}

function typeNumber(value, decimals) {
  const neg = value < 0;
  let s = Math.abs(value).toFixed(decimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (neg) click($('.key[data-k="sign"]'));
  for (const ch of s) click($(`.key[data-k="${ch}"]`));
}

export const drive = {
  /** Answer whatever question card is on screen. correct=false gives a deliberately wrong answer. */
  async answer(correct = true) {
    const cur = window.__HLS_TEST.current;
    if (!cur) throw new Error('drive: no question on screen');
    const { item } = cur;
    const card = $('.qcard');
    if (item.kind === 't') {
      const unit = item.problem.unit || {};
      if (item.mode === 'steps') {
        item.problem.steps.forEach((st) => {
          typeNumber(correct ? st.value : st.value + 1, st.unit?.decimals ?? 2);
          click($('.key.go'));
        });
        click($('#check-btn'));
      } else {
        typeNumber(correct ? item.problem.answer : item.problem.answer + 7, unit.decimals ?? 2);
        click($('.key.go'));
      }
      return;
    }
    const q = item.q;
    switch (q.type) {
      case 'mcq': {
        const id = correct ? q.answer : q.options.find((o) => o.id !== q.answer).id;
        click($(`.opt[data-id="${id}"]`, card));
        click($('#check-btn'));
        break;
      }
      case 'multi': {
        const ids = correct ? q.answer : [q.options.find((o) => !q.answer.includes(o.id)).id];
        ids.forEach((id) => click($(`.opt[data-id="${id}"]`, card)));
        click($('#check-btn'));
        break;
      }
      case 'tfr': {
        click($(`.tf-btn[data-v="${correct ? q.answer : !q.answer}"]`, card));
        click($(`.reasons .opt[data-id="${correct ? q.reasonAnswer : q.reasons.find((r) => r.id !== q.reasonAnswer).id}"]`, card));
        click($('#check-btn'));
        break;
      }
      case 'sort': {
        q.items.forEach((it, i) => {
          const wrongBin = q.bins.find((b) => b.id !== q.answer[it.id]).id;
          click($(`.sort-item[data-id="${it.id}"]`, card));
          click($(`.bin[data-bin="${correct || i > 0 ? q.answer[it.id] : wrongBin}"]`, card));
        });
        click($('#check-btn'));
        break;
      }
      case 'sequence': {
        const order = correct ? q.answer : [...q.answer].reverse();
        order.forEach((id) => {
          const text = q.items.find((x) => x.id === id).text;
          click($$('.tray .sort-item', card).find((b) => b.textContent === text));
        });
        click($('#check-btn'));
        break;
      }
      case 'match': {
        q.left.forEach((l, i) => {
          const target = correct ? q.answer[l.id] : q.right[(q.right.findIndex((r) => r.id === q.answer[l.id]) + 1) % q.right.length].id;
          click($(`.mcol:first-child .mitem[data-id="${l.id}"]`, card));
          click($(`.mcol:last-child .mitem[data-id="${target}"]`, card));
        });
        click($('#check-btn'));
        break;
      }
      case 'num': {
        typeNumber(correct ? q.answer : q.answer + 7, q.unit?.decimals ?? 2);
        click($('.key.go'));
        break;
      }
      case 'written': {
        const ta = $('textarea.written', card);
        ta.value = 'A trade is one draw from many possible outcomes. My method might win 40% with a 3 to 1 payoff, so it averages a profit, but any single trade is more likely to lose. One loss does not show the method is broken, and one win does not show it is good. I judge the plan over many trades, and each decision by whether it followed the plan.';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        click($('#check-btn'));
        break;
      }
      default: throw new Error('drive: cannot answer ' + q.type);
    }
  },

  /** Answer every question in the current set, then leave it on the results screen. */
  async runSet(correctFn = () => true) {
    let n = 0;
    for (let guard = 0; guard < 60; guard++) {
      if (!$('.qcard')) break;
      await sleep(30);
      await drive.answer(correctFn(n++));
      await sleep(30);
      const next = $('#next-btn');
      if (next) click(next);
      else await sleep(200); // exam mode advances by itself
    }
    return n;
  },

  /** Play one lesson from the start to the completion screen. */
  async lesson(id, { checkCorrect = () => true } = {}) {
    location.hash = '#/lesson/' + id;
    await waitFor(() => $('.lesson'), { label: 'lesson ' + id });
    for (let guard = 0; guard < 40; guard++) {
      await sleep(40);
      if ($('.done-screen')) return 'done';
      const body = $('.step-body');
      if (!body) throw new Error('drive: no step body');
      const kind = body.dataset.kind;
      const widget = body.dataset.widget;
      if (kind === 'ack') click($('.qactions .btn'));
      else if (kind === 'check') {
        await drive.runSet(checkCorrect);
        await waitFor(() => $('.check-summary'), { label: 'check summary' });
        const summary = $('.check-summary');
        if (summary.classList.contains('fail')) throw new Error('drive: check failed in ' + id);
      } else if (kind === 'try' || kind === 'apply') await drive.tryStep(widget);
      else if (kind === 'reflect') {
        const ta = $('textarea.written');
        ta.value = 'Each trade is one draw from a range of outcomes. A method that wins on average still loses trades, so one loss does not show it is broken. Judge the process over many trades.';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        click(byText('.btn', 'Show The Model Answer'));
        await waitFor(() => byText('.btn', 'Done'), { label: 'reflect done' });
        click(byText('.btn', 'Done'));
      }
      const cont = $('#continue-btn');
      await waitFor(() => !cont.disabled, { label: `continue enabled (${kind} ${widget || ''})` });
      click(cont);
    }
    throw new Error('drive: lesson did not finish: ' + id);
  },

  async tryStep(widget) {
    if (widget === 'orderflow') {
      click($('.choices .opt[data-v="up"]'));
      click(byText('.btn', 'Run It'));
    } else if (widget === 'twocoins') {
      click(byText('.btn', 'Flip Each 30 Times'));
      click(byText('.opt', 'Coin A'));
      click(byText('.btn', 'Reveal'));
    } else if (widget === 'problab') {
      click($('.opt[data-v="spread"]'));
      click(byText('.btn', 'Run 1,000'));
    } else if (widget === 'streaksim') {
      click($('.opt[data-v="c"]'));
      click(byText('.btn', 'Run Twenty'));
    } else if (widget === 'clockpick') {
      click($('.zone-grid .opt'));
    } else if (widget === 'clockquiz') {
      await drive.runSet();
    } else if (widget === 'frame') {
      $$('.frame-input').forEach((ta) => {
        ta.value = 'my honest answer here';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(byText('.btn', 'Finish'));
    } else if (widget === 'pipcalc') {
      await sleep(50);
    } else {
      // an exercise or a template: answer it correctly
      await drive.answer(true);
      await sleep(60);
    }
  }
};

window.__drive = drive;
