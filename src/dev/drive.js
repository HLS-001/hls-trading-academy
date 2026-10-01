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
    const choiceQ = item.kind === 't' && item.problem.question ? item.problem.question : null;
    if (item.kind === 't' && !choiceQ) {
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
    const q = choiceQ || item.q;
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
      case 'flaws': {
        q.claims.forEach((c, i) => {
          const right = q.answer[c.id];
          const wrong = ['ok', ...q.flawTypes.map((t) => t.id)].find((x) => x !== right);
          click($(`.flaw-claim[data-claim="${c.id}"] .opt[data-v="${correct || i > 0 ? right : wrong}"]`, card));
        });
        click($('#check-btn'));
        break;
      }
      case 'place': {
        const good = q.answer[0];
        const bad = q.candidates.find((c) => !q.answer.includes(c));
        click($(`.ladder-row.cand[data-p="${correct ? good : bad}"]`, card));
        click($('#check-btn'));
        break;
      }
      case 'branch': {
        let id = q.start;
        for (let guard = 0; id && guard < 30; guard++) {
          const nd = q.nodes[id];
          const best = [...nd.options].sort((a, b) => (correct ? b.score - a.score : a.score - b.score))[0];
          click($(`.branch-step:last-of-type .opt[data-id="${best.id}"]`, card));
          id = best.next;
        }
        click($('#check-btn'));
        break;
      }
      case 'audit': {
        q.rules.forEach((r) => click($(`.opt[data-r="${r.id}"][data-v="${correct ? r.answer : r.answer === 'yes' ? 'no' : 'yes'}"]`, card)));
        click($(`.auditui .flaw-chips:last-of-type .opt[data-v="${correct ? q.processAnswer : q.processAnswer === 'followed' ? 'broke' : 'followed'}"]`, card));
        click($('#check-btn'));
        break;
      }
      case 'chart': {
        const chartEl = $('.chartui', card);
        const resp = {};
        for (const part of q.parts) {
          if (correct) resp[part.id] = part.kind === 'number' ? String(part.answer) : part.answer;
          else if (part.kind === 'options') resp[part.id] = part.options.find((o) => o.id !== part.answer && !(part.accept || []).includes(o.id)).id;
          else if (part.kind === 'label') resp[part.id] = Object.fromEntries(part.items.map((it) => [it.id, (part.options[it.type] || part.options.seg).find((o) => o !== part.answer[it.id])]));
          else if (part.kind === 'number') resp[part.id] = String(part.answer + 50);
          else resp[part.id] = [0];
        }
        chartEl.__setResponse(resp);
        click($('#check-btn'));
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
    } else if (widget === 'ticklab') {
      const mode = $('.step-body').dataset.mode;
      if (mode === 'build') {
        for (let i = 0; i < 8; i++) click(byText('.btn', 'Next Tick'));
      } else if (mode === 'same') {
        click($('.opt[data-v="many"]'));
        click(byText('.btn', 'Show Three Paths'));
      } else {
        click($('.opt[data-v="bar"]'));
        click($('.opt[data-v="candle"]'));
      }
    } else if (widget === 'timeframelab') {
      click($('.opt[data-v="1"]'));
      click($('.opt[data-v="15"]'));
      click($('.opt[data-v="60"]'));
    } else if (widget === 'streakladder') {
      const b = $('.step-body');
      click($('.lab-q + .choices .opt[data-v="5"]', b));
      for (const r of ['1', '2', '5']) {
        const chips = $$('.lab-row .opt', b).filter((c) => c.dataset.v === r);
        if (chips.length) click(chips[0]);
        click(byText('.btn', 'Run The Ladder'));
        await sleep(60);
      }
    } else if (widget === 'montecarlolab') {
      const b = $('.step-body');
      $$('.lab-row', b).forEach((row) => click($$('.opt', row)[1]));
      click($$('.lab-row', b)[2].querySelectorAll('.opt')[2]);
    } else if (widget === 'exposurelab') {
      const b = $('.step-body');
      click($('.opt[data-v="USD"]', b));
      click(byText('.btn', 'Show The Exposure'));
      click($('.opt[data-v="B"]', b));
      click($('.opt[data-v="JPY"]', b));
      click(byText('.btn', 'Show The Exposure'));
    } else if (widget === 'riskplan') {
      // the plan is completed by the test through the saved document, not by typing into the keypad sheets
      $('.riskplan').__setPlan({ balance: 10000, riskPct: 1, dailyLoss: 3, weeklyLoss: 6, drawdownStop: 15, cutAt: 8, cutTo: 50, maxOpen: 2, maxCurrency: 1.5, lossMeasure: 'open', sizing: true, noRaise: true, news: 'I stand aside from 15 minutes before to 30 minutes after high-impact releases for my pair.', maxTrades: 2, pauseMin: 30, behavior: 'FOMO: entry far from my plan level, so no plan level means no order. Revenge: a 30 minute pause after any loss.' });
    } else if (widget === 'strategybuilder') {
      $('.strategybuilder').__setStrategy({ market: 'EUR/USD, because its spread is among the lowest I can trade and its hours match the window I can watch.', timeframe: 'Analyse on the 1-hour chart. Execute on the 5-minute chart.', session: '08:00 to 11:00 New York time. Nothing outside it.', setup: 'The 1-hour close is above the previous day high.\nPrice returns to within 3 pips of that high inside the session.', entry: 'Buy limit at the previous day high, placed when price touches within 3 pips of it and both setup conditions are true.', stop: 'Stop 5 pips below the lowest low of the pullback.', target: 'A fixed 2R target.', sizing: 'Risk is the percent in my Risk Plan. Lots are computed from the stop distance and rounded down.', management: 'If price reaches 1R, move the stop to breakeven. No other changes after entry.', notrade: 'A high-impact release for USD or EUR within 30 minutes.\nSpread wider than 1.5 pips at the time of entry.\nI have already taken my maximum trades for the day.' });
    } else if (widget === 'randomlab') {
      const lab = $('.randomlab');
      lab.__run();
      lab.__run();
    } else if (widget === 'noisemine') {
      const lab = $('.noisemine');
      lab.__mine();
      lab.__stage(1);
      lab.__stage(2);
    } else if (widget === 'costslab') {
      $('.costslab').__run();
    } else if (widget === 'statslab13') {
      for (const v of ['long', 'short', 'win', 'loss']) click($$('.statslab13 .an-filter .opt').find((o) => o.dataset.v === v));
    } else if (widget === 'journalaudit') {
      $('.journalaudit').__fixAll();
    } else if (widget === 'backtestlab') {
      const lab = $('.backtestlab');
      lab.__hyp({ winLo: 35, winHi: 50, expR: 0.2, minSample: 8, fail: 'An average R at or below zero after the in-sample run.' });
      await sleep(8);
      lab.__split(0.5);
      await sleep(8);
      $('.backtestlab').__logAll();
      await sleep(8);
      $('.backtestlab').__concludeIS('In-sample I logged every setup. The average is small and the sample is too small to conclude anything about an edge.');
      await sleep(8);
      $('.backtestlab').__logAll();
      await sleep(8);
      $('.backtestlab').__final('The interval includes zero, so the result is consistent with no edge. With this few trades I cannot say more, and I cannot rule out a small edge either.');
      await sleep(40);
    } else if (widget === 'planlab') {
      const lab = $('.planlab');
      for (let i = 0; i < lab.__count(); i++) {
        $('.planlab').__solve();
        await sleep(20);
        if (i < lab.__count() - 1) click(byText('.btn', 'Next Plan'));
        await sleep(20);
      }
    } else if (widget === 'platformchecklist') {
      $('.platformchecklist').__fill({ 'tv-zone': { zone: 'Guyana', clock: '14:35' }, 'server-time': { offset: 2, how: 'From the Market Watch clock compared with UTC' }, 'demo-open': { platform: 'MetaTrader 5 build 5000', currency: 'USD', leverage: 100, balance: 10000 }, 'symbol-spec': { symbol: 'EURUSD', contract: 100000, minLot: 0.01, lotStep: 0.01, spread: 1.1 }, ticket: { dir: 'long', entry: 1.1, stop: 1.095, target: 1.11, lots: 0.2, plannedR: 2 }, modify: { note: 'Moved the stop to breakeven at 1R to reduce risk' }, partial: { closed: 0.1, price: 1.105 }, account: { balance: 10000, floating: 50, equity: 10050, margin: 220, free: 9830 }, export: { format: 'HTML statement, ReportHistory.html', count: 3 } });
    } else if (widget === 'brokerworksheet') {
      $('.brokerworksheet').__fill();
    } else if (widget === 'pathlive') {
      $('.pathlive').__fill({ readiness: 'Backtest audit passed, 100 demo forward-test trades with an interval I have read, and 20 consecutive trading days following my Risk Plan.', capital: 'An amount I can lose completely and still pay my bills, written down as a number before I open any account.', liveRules: 'Size at 0.25% risk per trade for 30 trades. Stop the test after a 5% fall from the start and review.', goBack: 'Back to demo after two breaches of my Risk Plan in one week or after the stop of the test.', scaling: 'Only after 100 small live trades whose interval I have read, and then by no more than one step at a time.', ack: true });
    } else if (widget === 'ratediff') {
      $$('.step-body input[type=range]').slice(0, 3).forEach((el, i) => {
        el.value = String([6, 2, 0.5][i]);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } else if (widget === 'rollingcorr') {
      click($('.opt[data-v="change"]'));
      click(byText('.btn', 'Show The Correlation'));
    } else if (widget === 'newsreaction') {
      $$('.step-body .flaw-claim').forEach((row) => click($('.opt', row)));
      click(byText('.btn', 'Show What Happened'));
    } else if (widget === 'eventstudy') {
      click($('.opt[data-v="10"]'));
      click($('.opt[data-v="20"]'));
    } else if (widget === 'levelreact') {
      if ($('.step-body').dataset.mode === 'compare') {
        click($('.opt[data-v="same"]'));
        click(byText('.btn', 'Test The Level'));
        await sleep(200);
        click(byText('.btn', 'Test Another Chart'));
      }
    } else if (widget === 'activityhour') {
      click($('.opt[data-v="20"]'));
      click($('.opt[data-v="60"]'));
      click($('.opt[data-v="n"]'));
    } else if (widget === 'sessiontable') {
      ['2026-03-09', '2026-03-24', '2026-07-14'].forEach((d) => click($(`.opt[data-v="${d}"]`)));
    } else if (widget === 'sessionlab') {
      click($('.opt[data-v="2026-03-09"]'));
      click($('.opt[data-v="America/New_York"]'));
      click($('.opt[data-v="utc"]'));
    } else if (widget === 'mtflab') {
      click($('.opt[data-v="1"]'));
      click($('.opt[data-v="2"]'));
    } else if (widget === 'liveedgelab') {
      const q = window.__HLS_TEST.liveQ;
      const resp = {};
      for (const part of q.parts) resp[part.id] = part.answer;
      $('.chartui').__setResponse(resp);
      const ta = $('textarea.written');
      ta.value = 'A close below the marked level would end the structure I described.';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      click(byText('.btn', 'Commit My Analysis'));
      await sleep(100);
      click(byText('.btn', 'Reveal The Next 6 Bars'));
    } else if (widget === 'structurelab') {
      const b = $('.step-body');
      $$('.lab-row .opt', b).slice(0, 6).forEach((o) => click(o));
      for (let i = 0; i < 5; i++) {
        const st = byText('.btn', 'Step Forward');
        if (st && !st.disabled) click(st);
      }
    } else if (widget === 'meanmedian') {
      click($('.choices .opt'));
      const sl = $('.lab input[type=range]');
      sl.value = '15';
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (widget === 'samplesize') {
      click($('.opt[data-v="few"]'));
      for (const label of ['30 trades', '1000 trades']) {
        click(byText('.opt', label));
        click(byText('.btn', 'Run Ten Traders'));
      }
    } else if (widget === 'expectancysurface') {
      $$('.es-cell').slice(0, 8).forEach((b) => click(b));
    } else if (widget === 'equitybuilder') {
      for (const label of ['+3R', '+3R', '+3R', '+3R', '−1R', '−1R', '−1R', '−1R', '−1R', '+3R', '+3R']) click(byText('.opt', label));
    } else if (widget === 'compounding') {
      click(byText('.opt', '5% risk'));
      click(byText('.btn', 'New Sequence'));
    } else if (widget === 'ruinexplorer') {
      click($('.opt[data-v="high"]'));
      click(byText('.btn', 'Run The Simulation'));
      await waitFor(() => $('.lab-teach'), { timeout: 20000, label: 'ruin simulation' });
    } else if (widget === 'statslab') {
      click(byText('.btn', 'Check My Answers'));
    } else if (widget === 'ordersim') {
      const mode = $('.step-body').dataset.mode;
      if (mode === 'market') {
        for (const speed of ['quiet', 'fast']) {
          click($(`.opt[data-v="${speed}"]`));
          click(byText('.btn', 'Buy At Market'));
          const n = $$('.pc-row').length;
          await waitFor(() => $$('.pc-row').length > n || $('.lab-teach'), { timeout: 8000, label: 'market fill' });
        }
      } else if (mode === 'stoplimit') {
        click($('.opt[data-v="5"]'));
        click($('.choices:nth-of-type(4) .opt[data-v="2"]') || byText('.opt', 'Limit +2'));
        click(byText('.btn', 'Run Both Orders'));
        await waitFor(() => $('.fs-grid'), { timeout: 8000, label: 'stop-limit result' });
      } else {
        click($('.opt[data-v="' + ((($('.step-body').dataset.types || 'buy-limit').split(',')[0])) + '"]'));
        click($('.opt[data-v="' + ((($('.step-body').dataset.types || 'buy-limit').split(',')[0]).includes('limit') ? '-10' : '10') + '"]'));
        if (mode === 'bracket') {
          click(byText('.opt', 'Stop 20'));
          click(byText('.opt', 'Target 40'));
        }
        click(byText('.btn', 'Place The Order'));
        await waitFor(() => $('.os-result'), { timeout: 8000, label: 'order result' });
      }
    } else if (widget === 'fillsim') {
      click(byText('.opt', 'Stop 25'));
      await sleep(50);
    } else if (widget === 'thindeep') {
      for (const label of ['Thin Market', '20 lots', 'Deep Market', '50 lots']) click(byText('.opt', label));
    } else if (widget === 'newsspread') {
      for (const p of ['5 pips', '40 pips']) {
        click(byText('.opt', p));
        click(byText('.btn', 'Replay The News'));
        await waitFor(() => $('.os-result'), { timeout: 12000, label: 'news replay' });
      }
    } else if (widget === 'feedcompare') {
      const sl = $('.lab input[type=range]');
      sl.value = '0.5';
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (widget === 'templateset') {
      await drive.runSet();
      await sleep(80);
    } else if (widget === 'quoteboard') {
      click($('.opt[data-v="loss"]'));
      click(byText('.btn', 'Buy 1 Lot At The Ask'));
      click(byText('.btn', 'Close At Once'));
    } else if (widget === 'tradeticket') {
      click(byText('.opt', 'Long (Buy)'));
      click(byText('.btn', 'Open The Trade'));
      click(byText('.btn', 'Move Time Forward'));
      click(byText('.btn', 'Close The Trade'));
    } else if (widget === 'leveragelens') {
      click($('.opt[data-v="bigger"]'));
      const sl = $('.lab input[type=range]');
      sl.value = '30';
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (widget === 'accountpanel') {
      click($('.lab .choices .opt'));
      const sl = $('.lab input[type=range]');
      sl.value = '-100';
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (widget === 'costbar') {
      const sl = $('.lab input[type=range]');
      for (const v of [10, 30]) {
        sl.value = String(v);
        sl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (widget === 'calc') {
      await sleep(80);
    } else if (widget === 'masterylab') {
      click(byText('.btn', 'Start 20 Problems'));
      await sleep(60);
      await drive.runSet();
      await sleep(80);
    } else if (widget === 'bondslider') {
      click($('.choices .opt[data-v="rise"]'));
      const sl = $('.lab input[type=range]');
      for (const v of [90, 110]) {
        sl.value = String(v);
        sl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (widget === 'instrumentmatrix') {
      const { ROWS } = await import('../interactives/instruments.js');
      for (const row of ROWS) row.cells.forEach((c, fi) => click($(`.mx-line[data-cell="${row.id}:${fi}"] .opt[data-v="${c[0]}"]`)));
      click(byText('.btn', 'Check My Matrix'));
    } else {
      // an exercise or a template: answer it correctly
      await drive.answer(true);
      await sleep(60);
    }
  }
};

window.__drive = drive;
