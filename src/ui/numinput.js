/**
 * A number field that opens the in-app keypad (digits, decimal point, plus/minus) in a sheet.
 * The iPhone decimal keypad has no minus key, so every calculator field uses this instead of a text input.
 *
 *   const f = numInput({ label: 'Balance', value: 10000, prefix: '$', onChange: (v) => ... });
 *   f.el  the element      f.set(v)  change the value from code      f.value  the current number (or null)
 */

import { h } from './dom.js';
import { openSheet, closeSheet } from './kit.js';
import { numberEntry } from './keypad.js';

const shown = (v, { prefix = '', suffix = '', decimals } = {}) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  const body = decimals !== undefined ? n.toFixed(decimals) : Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 6 });
  return (n < 0 ? '−' : '') + prefix + body.replace('-', '') + suffix;
};

export function numInput({ label, value = null, prefix = '', suffix = '', decimals, allowNegative = false, allowDecimal = true, max = 10, hint, onChange } = {}) {
  let current = value;
  let dec = decimals;
  const val = h('span', { class: 'nf-val' }, shown(current, { prefix, suffix, decimals: dec }));
  const el = h('button', { type: 'button', class: 'numfield', 'aria-label': label + ': ' + shown(current, { prefix, suffix, decimals: dec }) },
    h('span', { class: 'nf-label' }, label), val, hint ? h('em', { class: 'nf-hint' }, hint) : null);
  const api = {
    el,
    get value() { return current; },
    setDecimals(d) {
      dec = d;
      val.textContent = shown(current, { prefix, suffix, decimals: dec });
    },
    set(v, { silent = false } = {}) {
      current = v === '' || v === null || Number.isNaN(Number(v)) ? null : Number(v);
      val.textContent = shown(current, { prefix, suffix, decimals: dec });
      el.setAttribute('aria-label', label + ': ' + val.textContent);
      if (!silent && onChange) onChange(current);
    }
  };
  el.addEventListener('click', () => {
    const entry = numberEntry({ prefix, suffix, placeholder: prefix + '0' + suffix, allowNegative, allowDecimal, max, submitLabel: 'Done', onSubmit: (v) => { if (v !== '' && v !== '-') api.set(v); closeSheet(); } });
    if (current !== null) entry.field.set(String(current));
    openSheet(entry.el, { title: label });
  });
  return api;
}
