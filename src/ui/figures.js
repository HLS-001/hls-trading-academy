/** Small diagrams used inside lessons. */

import { h, s } from './dom.js';

export function figure(name) {
  if (name === 'cycle') return cycle();
  if (name === 'quadrant') return quadrant();
  return h('div');
}

function cycle() {
  const steps = ['Understand', 'Practice', 'Test', 'Demonstrate', 'Advance'];
  const w = 320;
  const cx = w / 2;
  const cy = 118;
  const r = 84;
  const nodes = steps.map((label, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / steps.length;
    return { label, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const svg = s('svg', { viewBox: `0 0 ${w} 236`, class: 'fig fig-cycle', role: 'img', 'aria-label': 'The learning cycle: understand, practice, test, demonstrate, advance' },
    s('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(255,200,61,.35)', 'stroke-width': 2, 'stroke-dasharray': '4 5' }),
    ...nodes.map((n, i) => s('g', { style: `--i:${i}`, class: 'fig-node' },
      s('circle', { cx: n.x, cy: n.y, r: 15, fill: 'url(#hlsGold)' }),
      s('text', { x: n.x, y: n.y + 4.5, 'text-anchor': 'middle', fill: '#2A1600', 'font-size': 13, 'font-weight': 800, 'font-family': 'Manrope, sans-serif' }, String(i + 1)),
      s('text', { x: n.x, y: n.y + (n.y < cy ? -22 : 30), 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 11.5, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, n.label))),
    s('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', fill: 'var(--gold-hi)', 'font-size': 12, 'font-family': 'Cinzel, serif', 'letter-spacing': '.12em' }, 'REPEAT'));
  return h('div', { class: 'figure' }, svg);
}

function quadrant() {
  const cell = (x, y, title, sub, tone) => s('g', null,
    s('rect', { x, y, width: 152, height: 76, rx: 10, fill: tone, 'fill-opacity': 0.16, stroke: tone, 'stroke-opacity': 0.55 }),
    s('text', { x: x + 76, y: y + 34, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 12.5, 'font-weight': 800, 'font-family': 'Manrope, sans-serif' }, title),
    s('text', { x: x + 76, y: y + 54, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11, 'font-family': 'Manrope, sans-serif' }, sub));
  const svg = s('svg', { viewBox: '0 0 340 232', class: 'fig fig-quadrant', role: 'img', 'aria-label': 'Decision quality against result: four possibilities' },
    s('text', { x: 178, y: 14, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10.5, 'font-family': 'Cinzel, serif', 'letter-spacing': '.1em' }, 'RESULT'),
    s('text', { x: 100, y: 30, 'text-anchor': 'middle', fill: 'var(--teal)', 'font-size': 11, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, 'Profit'),
    s('text', { x: 260, y: 30, 'text-anchor': 'middle', fill: 'var(--gold)', 'font-size': 11, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, 'Loss'),
    s('text', { x: 6, y: 78, fill: 'var(--teal)', 'font-size': 10.5, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, 'Good'),
    s('text', { x: 6, y: 92, fill: 'var(--teal)', 'font-size': 10.5, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, 'decision'),
    s('text', { x: 6, y: 168, fill: 'var(--gold)', 'font-size': 10.5, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, 'Poor'),
    s('text', { x: 6, y: 182, fill: 'var(--gold)', 'font-size': 10.5, 'font-weight': 700, 'font-family': 'Manrope, sans-serif' }, 'decision'),
    cell(24, 38, 'Deserved', 'Good plan, good result', '#2DD4BF'),
    cell(184, 38, 'Bad luck', 'Good plan, a loss', '#38BDF8'),
    cell(24, 122, 'Lucky', 'Poor plan, a win', '#FFC83D'),
    cell(184, 122, 'Deserved', 'Poor plan, a loss', '#FF5C8A'));
  return h('div', { class: 'figure' }, svg);
}
