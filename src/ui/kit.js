/** UI kit: the small, consistent pieces every screen is built from. */

import { h, s, mdInline, sleep } from './dom.js';

export function button(label, { variant = 'primary', onClick, block = false, disabled = false, id, type = 'button', aria } = {}) {
  const b = h('button', { class: `btn ${variant === 'primary' ? '' : variant} ${block ? 'block' : ''}`.trim().replace(/\s+/g, ' '), type, id, disabled, 'aria-label': aria }, label);
  if (onClick) b.addEventListener('click', (e) => onClick(e, b));
  return b;
}

export const card = (attrs, ...kids) => {
  const a = typeof attrs === 'object' && attrs && !attrs.nodeType ? attrs : null;
  return a ? h('div', { ...a, class: ('card ' + (a.class || '')).trim() }, ...kids) : h('div', { class: 'card' }, attrs, ...kids);
};

/** The banner that keeps Track P from reading as part of the trading education. */
export const trackBanner = () => h('div', { class: 'trackp-banner', role: 'note' }, 'Practical Track — Not Part Of The Trading Education Ladder. No Broker Is Recommended.');

export const ornament = () => h('div', { class: 'orn', 'aria-hidden': 'true' }, h('i'), h('b'), h('i'));

export function screenTitle(title, sub) {
  return h('div', { class: 'screen-title' }, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null, ornament());
}

export const chip = (text, kind = 'gold') => h('span', { class: `chip c-${kind}` }, text);
export const pill = (text, kind = '') => h('span', { class: `pill ${kind}`.trim() }, text);

export function bar(fraction, { label } = {}) {
  const f = Math.max(0, Math.min(1, fraction || 0));
  const i = h('i', { style: { width: '0%' } });
  requestAnimationFrame(() => requestAnimationFrame(() => (i.style.width = (f * 100).toFixed(1) + '%')));
  setTimeout(() => (i.style.width = (f * 100).toFixed(1) + '%'), 60);
  return h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': Math.round(f * 100), 'aria-label': label || 'progress' }, i);
}

export function ring(fraction, { size = 76, text = '', stroke = 7 } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fg = s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round', stroke: 'url(#hlsRingG)', 'stroke-dasharray': c, 'stroke-dashoffset': c, class: 'ring-fg' });
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, style: 'transform:rotate(-90deg)' },
    s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, stroke: 'var(--ink-4)' }), fg);
  const el = h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } }, svg, h('em', null, text));
  const target = c * (1 - Math.max(0, Math.min(1, fraction)));
  setTimeout(() => (fg.style.strokeDashoffset = target), 80);
  return el;
}

export function stepRail(total, current) {
  const rail = h('div', { class: 'rail', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': total, 'aria-valuenow': current + 1, 'aria-label': `Step ${current + 1} of ${total}` });
  for (let i = 0; i < total; i++) rail.append(h('i', { class: i < current ? 'd' : i === current ? 'c' : '' }));
  return rail;
}

const ICONS = {
  today: '<circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  curriculum: '<path d="M5 20V8M10 20V8M14 20V8M19 20V8M3 8l9-5 9 5M3 20h18"/>',
  practice: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  journal: '<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM6 3v18M10 8h5M10 12h5"/>',
  progress: '<path d="M6 20c0-8 4-14 12-16-1 8-5 14-12 16zM6 20l6-8"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  mentor: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  lock: '<path d="M8 11V8a4 4 0 018 0v3"/><rect x="6" y="11" width="12" height="9" rx="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
export function icon(name, size = 22) {
  return h('span', { class: 'icon', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>` });
}

/* ---------------------------------------------------------------- bottom sheet, toast, confirm */

let sheetEl = null;

export function closeSheet() {
  if (!sheetEl) return;
  const el = sheetEl;
  sheetEl = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 260);
}

export function openSheet(content, { title } = {}) {
  closeSheet();
  const panel = h('div', { class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Details' },
    h('div', { class: 'sheet-grab' }),
    title ? h('h3', { class: 'sheet-title' }, title) : null,
    h('div', { class: 'sheet-body' }, content),
    h('div', { class: 'sheet-actions' }, button('Close', { variant: 'ghost', onClick: closeSheet })));
  const el = h('div', { class: 'sheet' }, h('div', { class: 'sheet-back', onclick: closeSheet }), panel);
  document.body.append(el);
  sheetEl = el;
  requestAnimationFrame(() => el.classList.add('open'));
  setTimeout(() => el.classList.add('open'), 30);
  return el;
}

/** An in-page confirm (the platform's confirm() is not available in every host). Resolves true or false. */
export function confirmSheet({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    closeSheet();
    const done = (v) => {
      closeSheet();
      resolve(v);
    };
    const panel = h('div', { class: 'sheet-panel', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-grab' }),
      h('h3', { class: 'sheet-title' }, title),
      h('div', { class: 'sheet-body' }, typeof body === 'string' ? h('p', { html: mdInline(body) }) : body),
      h('div', { class: 'sheet-actions two' },
        button(cancel, { variant: 'ghost', onClick: () => done(false) }),
        button(confirm, { variant: danger ? 'danger' : 'primary', onClick: () => done(true) })));
    const el = h('div', { class: 'sheet' }, h('div', { class: 'sheet-back', onclick: () => done(false) }), panel);
    document.body.append(el);
    sheetEl = el;
    requestAnimationFrame(() => el.classList.add('open'));
    setTimeout(() => el.classList.add('open'), 30);
  });
}

let toastTimer = null;
export function toast(text, { ms = 2600 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** A small burst of gold leaves that drift up from both sides of an element. Purely decorative. */
export async function leafBurst(anchor, { count = 8 } = {}) {
  const rect = anchor.getBoundingClientRect();
  const layer = h('div', { class: 'burst', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const dx = side * (24 + Math.floor(i / 2) * 14);
    layer.append(h('i', { style: { left: rect.left + rect.width / 2 + 'px', top: rect.top + rect.height / 2 + 'px', '--dx': dx + 'px', '--r': side * 30 + 'deg', '--d': Math.floor(i / 2) * 70 + 'ms' } }));
  }
  document.body.append(layer);
  await sleep(1900);
  layer.remove();
}
