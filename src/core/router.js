/**
 * A small hash router. Routes look like #/lesson/l01-what-is-trading .
 * The pattern approach and constants follow the HLS Law App's router.
 */

const routes = [];
let notFound = () => {};
let current = null;
let before = null;

export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((part) => {
          if (part.startsWith(':')) {
            keys.push(part.slice(1));
            return '([^/]+)';
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$'
  );
  routes.push({ regex, keys, handler, pattern });
}

export const onNotFound = (fn) => (notFound = fn);
export const beforeNavigate = (fn) => (before = fn);
export const currentRoute = () => current;

export function go(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : '#' + path;
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function resolve() {
  const raw = window.location.hash.replace(/^#/, '') || '/today';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.replace(/\/+$/, '') || '/today';
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  for (const r of routes) {
    const m = path.match(r.regex);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const next = { path, pattern: r.pattern, params, query };
    if (before && before(current, next) === false) return;
    current = next;
    r.handler(params, query);
    return;
  }
  current = { path, pattern: null, params: {}, query };
  notFound(path);
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
