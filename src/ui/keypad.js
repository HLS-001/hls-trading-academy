/**
 * The in-app numeric keypad.
 *
 * The iPhone decimal keypad has no minus key, and R-multiples are often negative. This keypad has
 * digits, a decimal point, a plus/minus key, backspace and clear, and it avoids the system
 * keyboard's zoom and layout jumps.
 */

import { h } from './dom.js';

export class NumberField {
  constructor({ max = 10, allowNegative = true, allowDecimal = true, onChange } = {}) {
    this.value = '';
    this.max = max;
    this.allowNegative = allowNegative;
    this.allowDecimal = allowDecimal;
    this.onChange = onChange || (() => {});
  }

  press(key) {
    let v = this.value;
    if (key === 'bs') v = v.slice(0, -1);
    else if (key === 'clr') v = '';
    else if (key === 'sign') {
      if (!this.allowNegative) return;
      v = v.startsWith('-') ? v.slice(1) : '-' + v;
    } else if (key === '.') {
      if (!this.allowDecimal || v.includes('.')) return;
      v = v === '' || v === '-' ? v + '0.' : v + '.';
    } else if (/^\d$/.test(key)) {
      if (v.replace('-', '').length >= this.max) return;
      if (v === '0') v = key;
      else if (v === '-0') v = '-' + key;
      else v += key;
    }
    this.set(v);
  }

  set(v) {
    this.value = v;
    this.onChange(v);
  }

  get number() {
    const n = parseFloat(this.value);
    return Number.isNaN(n) ? null : n;
  }
}

export function displayText(value, { prefix = '', suffix = '' } = {}) {
  if (value === '' || value === undefined) return '';
  const neg = value.startsWith('-');
  return (neg ? '−' : '') + prefix + value.replace('-', '') + suffix;
}

/** The keys. Send each press to a NumberField (or anything with press(key)). */
export function keypad({ onKey, onSubmit, submitLabel = 'Check', disabled = false }) {
  const key = (label, k, cls = '') => h('button', { type: 'button', class: `key ${cls}`.trim(), 'data-k': k, 'aria-label': ({ bs: 'Backspace', sign: 'Plus or minus', clr: 'Clear' })[k] || label, onclick: () => onKey(k) }, label);
  const go = h('button', { type: 'button', class: 'key go', 'data-k': 'ok', disabled, onclick: () => onSubmit && onSubmit() }, submitLabel);
  const el = h('div', { class: 'keypad', role: 'group', 'aria-label': 'Number keypad' },
    key('7', '7'), key('8', '8'), key('9', '9'), key('⌫', 'bs', 'op'),
    key('4', '4'), key('5', '5'), key('6', '6'), key('±', 'sign', 'op'),
    key('1', '1'), key('2', '2'), key('3', '3'), key('C', 'clr', 'op'),
    key('0', '0'), key('.', '.'), go);
  el.setDisabled = (v) => (go.disabled = v);
  el.setSubmitLabel = (t) => (go.textContent = t);
  return el;
}

/** A display plus a keypad, wired together. Returns { el, field, keypad }. */
export function numberEntry({ prefix = '', suffix = '', placeholder = '0', onSubmit, submitLabel = 'Check', max = 10, allowNegative = true, allowDecimal = true } = {}) {
  const shown = h('span', { class: 'disp-val' }, placeholder);
  const display = h('div', { class: 'disp', 'aria-live': 'polite' }, shown);
  const field = new NumberField({
    max,
    allowNegative,
    allowDecimal,
    onChange: (v) => {
      shown.textContent = v === '' ? placeholder : displayText(v, { prefix, suffix });
      display.classList.toggle('empty', v === '');
    }
  });
  display.classList.add('empty');
  const pad = keypad({ onKey: (k) => field.press(k), onSubmit: () => onSubmit && onSubmit(field.value), submitLabel });
  return { el: h('div', { class: 'number-entry' }, display, pad), field, keypad: pad, display };
}
