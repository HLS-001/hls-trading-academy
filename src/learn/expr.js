/**
 * A small, safe arithmetic evaluator for content templates. No eval, no property access.
 *
 *   evaluate('lots * pipSize * 100000 / price', { lots: 0.5, pipSize: 0.01, price: 150 })
 *
 * Supports + - * / ^ ( ), unary minus, numbers, variables, and these functions:
 *   floor ceil round(x, places) abs min max sqrt pow log exp
 */

const FUNCS = {
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  log: Math.log,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  round: (x, d = 0) => {
    const f = 10 ** d;
    return (Math.sign(x) * Math.round((Math.abs(x) + 1e-12) * f)) / f;
  }
};

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(.))/gy;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1] !== undefined) tokens.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined && m[3].trim()) tokens.push({ t: 'op', v: m[3] });
    if (re.lastIndex >= src.length) break;
  }
  return tokens;
}

export function evaluate(src, vars = {}) {
  const tokens = tokenize(String(src));
  let i = 0;
  const peek = () => tokens[i];
  const eat = (v) => {
    const t = tokens[i];
    if (!t || t.v !== v) throw new Error(`Expected "${v}" in expression: ${src}`);
    i++;
  };

  function primary() {
    const t = tokens[i++];
    if (!t) throw new Error('Unexpected end of expression: ' + src);
    if (t.t === 'num') return t.v;
    if (t.t === 'id') {
      if (peek() && peek().v === '(') {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Unknown function "${t.v}" in expression: ${src}`);
        eat('(');
        const args = [];
        if (peek() && peek().v !== ')') {
          args.push(sum());
          while (peek() && peek().v === ',') {
            i++;
            args.push(sum());
          }
        }
        eat(')');
        return fn(...args);
      }
      if (!(t.v in vars)) throw new Error(`Unknown variable "${t.v}" in expression: ${src}`);
      const v = vars[t.v];
      if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`Variable "${t.v}" is not a number in expression: ${src}`);
      return v;
    }
    if (t.v === '(') {
      const v = sum();
      eat(')');
      return v;
    }
    if (t.v === '-') return -unary();
    if (t.v === '+') return unary();
    throw new Error(`Unexpected "${t.v}" in expression: ${src}`);
  }
  function unary() {
    return primary();
  }
  function power() {
    const base = primary();
    if (peek() && peek().v === '^') {
      i++;
      return base ** power();
    }
    return base;
  }
  function product() {
    let v = power();
    while (peek() && (peek().v === '*' || peek().v === '/')) {
      const op = tokens[i++].v;
      const r = power();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = tokens[i++].v;
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const result = sum();
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i].v}" in expression: ${src}`);
  return result;
}
