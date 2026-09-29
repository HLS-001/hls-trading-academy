/** The frame around every screen: top bar, scrolling screen, bottom tabs. */

import { h, $ } from './dom.js';
import { icon } from './kit.js';
import { markStatic } from './mark.js';
import { go } from '../core/router.js';

const TABS = [
  { id: 'today', label: 'Today', href: '#/today' },
  { id: 'curriculum', label: 'Curriculum', href: '#/curriculum' },
  { id: 'practice', label: 'Practice', href: '#/practice' },
  { id: 'progress', label: 'Progress', href: '#/progress' }
];

let refs = null;

export function initShell(root = document.body) {
  const title = h('div', { class: 'tb-title', id: 'tb-title' });
  const left = h('div', { class: 'tb-left', id: 'tb-left' });
  const right = h('div', { class: 'tb-right', id: 'tb-right' });
  const top = h('header', { class: 'topbar', id: 'topbar' }, left, title, right);
  const banner = h('div', { id: 'update-banner', class: 'update-banner hidden', role: 'status' });
  const screen = h('main', { id: 'screen', class: 'screen', tabindex: '-1' });
  const tabs = h('nav', { class: 'tabs', id: 'tabs', 'aria-label': 'Main' }, ...TABS.map((t) => h('a', { href: t.href, 'data-tab': t.id, class: 'tab' }, icon(t.id), h('span', null, t.label))));
  const app = h('div', { id: 'app' }, top, banner, screen, tabs);
  root.append(app);
  refs = { title, left, right, top, screen, tabs, banner };
  return refs;
}

/**
 * Begin a screen. Clears the screen, sets the title and active tab.
 *   back: a hash (#/…) to show a back button, or null for the mark
 *   tab:  which tab is active (null hides the tab bar for focused screens)
 */
export function begin({ title = '', tab = null, back = null, right = null, focus = false } = {}) {
  refs.screen.replaceChildren();
  refs.title.textContent = title;
  refs.left.replaceChildren(back ? h('button', { class: 'tb-btn', type: 'button', 'aria-label': 'Back', onclick: () => (typeof back === 'function' ? back() : go(back)) }, icon('back')) : markStatic(30));
  refs.right.replaceChildren(...(right ? [].concat(right) : [h('a', { class: 'tb-btn', href: '#/settings', 'aria-label': 'Settings' }, icon('gear'))]));
  refs.tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  document.body.classList.toggle('focus-mode', !!focus);
  refs.screen.scrollTop = 0;
  window.scrollTo(0, 0);
  return refs.screen;
}

export const screenEl = () => refs.screen;

export function showUpdateBanner(onReload) {
  refs.banner.classList.remove('hidden');
  refs.banner.replaceChildren(h('span', null, 'An update is ready.'), h('button', { type: 'button', class: 'btn small', onclick: onReload }, 'Update Now'));
}
