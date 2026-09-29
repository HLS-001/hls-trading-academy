/** First run: a welcome, a name, and a way into the Orientation. */

import { app, emit } from '../core/app.js';
import { go } from '../core/router.js';
import { h, mount } from '../ui/dom.js';
import { button, ornament } from '../ui/kit.js';
import { begin } from '../ui/shell.js';
import { markAnimated } from '../ui/mark.js';
import { isStandalone, isIOS } from '../core/platform.js';

export function welcomeView() {
  const screen = begin({ title: '', focus: true, right: [] });
  const name = h('input', { type: 'text', maxlength: 30, autocomplete: 'given-name', 'aria-label': 'Your first name', placeholder: 'Your first name', class: 'name-input' });
  const m = markAnimated({ size: 180 });
  const install = !isStandalone() && isIOS()
    ? h('p', { class: 'hint-line center' }, 'Tip: tap Share, then Add to Home Screen, to keep this on your Home Screen and use it without a connection.')
    : null;
  const begin_ = () => {
    emit('profile.set', { name: name.value.trim() });
    go('#/lesson/l00-how-it-works');
  };
  name.addEventListener('keydown', (e) => e.key === 'Enter' && begin_());
  mount(screen,
    h('div', { class: 'welcome' }, m,
      h('h1', null, 'Welcome'),
      ornament(),
      h('p', null, 'This is a course in how markets work, how to measure risk and evidence, and how to think clearly about decisions. It takes a few months. It starts simple.'),
      h('label', { class: 'field center' }, h('span', null, 'What should we call you?'), name),
      button('Begin The Orientation', { block: true, onClick: begin_ }),
      install));
  requestAnimationFrame(() => m.play());
}
