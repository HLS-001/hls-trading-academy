/** The HLS mark: the temple of candlesticks in a laurel wreath, with its launch animation. */

import { h, s } from './dom.js';
import { MARK_DEFS, MARK_BODY, SMALL_BODY, WORDMARK_BODY } from './mark-data.js';

const EXTRA_DEFS = `
<linearGradient id="hlsRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2DD4BF"/><stop offset="1" stop-color="#FFC83D"/></linearGradient>
<linearGradient id="phT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8CF7E8"/><stop offset="1" stop-color="#0B8F84"/></linearGradient>
<linearGradient id="phV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C4B5FD"/><stop offset="1" stop-color="#6D28D9"/></linearGradient>
<linearGradient id="phR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA6BF"/><stop offset="1" stop-color="#C92A58"/></linearGradient>
<linearGradient id="phG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE38F"/><stop offset="1" stop-color="#E08A0A"/></linearGradient>`;

/** Put the shared gradients and symbols into the document once. */
export function installDefs() {
  if (document.getElementById('hls-defs')) return;
  const host = document.createElement('div');
  host.id = 'hls-defs';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  host.innerHTML = `<svg width="0" height="0"><defs>${MARK_DEFS}${EXTRA_DEFS}</defs>
    <symbol id="markSym" viewBox="0 0 512 512">${MARK_BODY}</symbol>
    <symbol id="markSmall" viewBox="0 0 64 64">${SMALL_BODY}</symbol></svg>`;
  document.body.prepend(host);
}

/** A static mark that reuses the shared symbol (cheap). */
export function markStatic(size = 32, cls = '') {
  return h('span', { class: 'mk-static ' + cls, style: { width: size + 'px', height: size + 'px' }, html: `<svg viewBox="0 0 512 512" width="${size}" height="${size}" role="img" aria-label="HLS Trading Academy"><use href="#markSym"/></svg>` });
}

/** An animated mark: its own copy so its parts can be animated. Call .play() to run the sequence. */
export function markAnimated({ size = 240, halo = true } = {}) {
  const wrap = h('div', { class: 'mk', style: { width: size + 'px' } });
  if (halo) wrap.append(h('div', { class: 'halo' }));
  wrap.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 512 512" role="img" aria-label="HLS Trading Academy">${MARK_BODY}</svg>`);
  wrap.play = (twinkleAfter = 3700) => {
    wrap.classList.remove('play', 'tw');
    void wrap.getBoundingClientRect();
    wrap.classList.add('play');
    clearTimeout(wrap._tw);
    wrap._tw = setTimeout(() => wrap.classList.add('tw'), twinkleAfter);
  };
  return wrap;
}

export function wordmark(width = 260) {
  const el = h('div', { class: 'wm-wrap', style: { width: width + 'px' } });
  el.innerHTML = `<svg class="wm" viewBox="0 468 720 262" role="img" aria-label="HLS Trading Academy">${WORDMARK_BODY}</svg>`;
  return el;
}

/** The full launch screen: mark, wordmark, tagline. Resolves when it has finished (or was tapped). */
export function launchScreen({ short = false } = {}) {
  const overlay = h('div', { id: 'launch', class: short ? 'launch short' : 'launch' });
  const m = markAnimated({ size: Math.min(300, Math.floor(window.innerWidth * 0.72)) });
  const w = wordmark(Math.min(340, Math.floor(window.innerWidth * 0.8)));
  const tag = h('div', { class: 'launch-tag' }, 'Education First · Trading Second');
  overlay.append(m, w, tag);
  document.body.append(overlay);
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.classList.add('leaving');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 450);
    };
    overlay.addEventListener('click', finish);
    requestAnimationFrame(() => {
      m.play();
      w.classList.add('play');
      tag.classList.add('play');
    });
    setTimeout(finish, short ? 1100 : 3900);
  });
}

/** A small level-column icon for The Colonnade. progress 0..1, phase color token, state 'locked'|'open'|'done'. */
export function columnSvg({ progress = 0, phase = 'teal', state = 'open', index = 0 }) {
  const grad = { teal: 'phT', violet: 'phV', rose: 'phR', gold: 'phG' }[phase] || 'phT';
  const locked = state === 'locked';
  const done = state === 'done';
  const top = 12;
  const bottom = 104;
  const fillH = Math.max(0, (bottom - top) * progress);
  const svg = s(
    'svg',
    { viewBox: '0 0 24 112', class: 'col-svg' },
    s('rect', { x: 2, y: top, width: 20, height: bottom - top, rx: 4, fill: 'none', stroke: locked ? 'rgba(165,173,214,.35)' : 'rgba(255,200,61,.55)', 'stroke-width': 1.6, 'stroke-dasharray': locked ? '3 3' : null }),
    progress > 0 ? s('rect', { class: 'sh', style: `--n:${index}`, x: 3.5, y: bottom - 1.5 - Math.max(0, fillH - 1.5), width: 17, height: Math.max(0, fillH - 1.5), rx: 3, fill: `url(#${grad})` }) : null,
    s('rect', { x: 0, y: 6, width: 24, height: 7, rx: 2.5, fill: done ? 'url(#hlsGold)' : 'rgba(255,200,61,.35)' }),
    s('rect', { x: 0, y: 103, width: 24, height: 7, rx: 2.5, fill: done ? 'url(#hlsGold)' : 'rgba(255,200,61,.35)' }),
    locked ? s('path', { d: 'M9 54v-4a3 3 0 016 0v4M8 54h8v8H8z', fill: 'none', stroke: 'rgba(165,173,214,.65)', 'stroke-width': 1.3 }) : null
  );
  return svg;
}
