/**
 * A tiny, safe expression language for storylet conditions and effects.
 *
 *   conditions:  subject.traits.has('Hothead') && meters.media < 40
 *   effects:     fans += 5 ; subject.morale -= 10 ; follow('arrest_court', 3)
 *
 * Expressions compile to closures over an environment object. No eval, no
 * access to globals. Unknown identifiers evaluate to undefined.
 */

type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'eof'; v: string; pos: number };

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '<', '>', '+', '-', '*', '/', '%', '!', '(', ')', ',', '.', '[', ']', '?', ':', '='];

export class ExprError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j).replace(/_/g, ''), pos: i });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError(`Unterminated string at ${i} in: ${src}`);
      out.push({ t: 'str', v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected '${c}' at ${i} in: ${src}`);
    out.push({ t: 'op', v: op, pos: i });
    i += op.length;
  }
  out.push({ t: 'eof', v: '', pos: src.length });
  return out;
}

export type Node =
  | { k: 'lit'; v: unknown }
  | { k: 'id'; name: string }
  | { k: 'mem'; obj: Node; prop: string }
  | { k: 'idx'; obj: Node; index: Node }
  | { k: 'call'; callee: Node; args: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'tern'; c: Node; a: Node; b: Node }
  | { k: 'arr'; items: Node[] };

class Parser {
  i = 0;
  constructor(
    private toks: Tok[],
    private src: string,
  ) {}
  peek(): Tok {
    return this.toks[this.i];
  }
  next(): Tok {
    return this.toks[this.i++];
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return t.t === 'op' && t.v === v;
  }
  expect(v: string): void {
    const t = this.next();
    if (t.t !== 'op' || t.v !== v) throw new ExprError(`Expected '${v}' at ${t.pos} in: ${this.src}`);
  }
  parseExpr(): Node {
    return this.ternary();
  }
  ternary(): Node {
    const c = this.or();
    if (this.isOp('?')) {
      this.next();
      const a = this.parseExpr();
      this.expect(':');
      const b = this.parseExpr();
      return { k: 'tern', c, a, b };
    }
    return c;
  }
  bin(next: () => Node, ops: string[]): Node {
    let a = next();
    while (this.peek().t === 'op' && ops.includes(this.peek().v)) {
      const op = this.next().v;
      const b = next();
      a = { k: 'bin', op, a, b };
    }
    return a;
  }
  or(): Node {
    return this.bin(() => this.and(), ['||']);
  }
  and(): Node {
    return this.bin(() => this.eq(), ['&&']);
  }
  eq(): Node {
    return this.bin(() => this.rel(), ['==', '!=']);
  }
  rel(): Node {
    return this.bin(() => this.add(), ['<', '<=', '>', '>=']);
  }
  add(): Node {
    return this.bin(() => this.mul(), ['+', '-']);
  }
  mul(): Node {
    return this.bin(() => this.unary(), ['*', '/', '%']);
  }
  unary(): Node {
    if (this.isOp('!') || this.isOp('-')) {
      const op = this.next().v;
      return { k: 'un', op, a: this.unary() };
    }
    return this.postfix();
  }
  postfix(): Node {
    let n = this.primary();
    for (;;) {
      if (this.isOp('.')) {
        this.next();
        const t = this.next();
        if (t.t !== 'id') throw new ExprError(`Expected property name at ${t.pos} in: ${this.src}`);
        n = { k: 'mem', obj: n, prop: t.v };
      } else if (this.isOp('(')) {
        this.next();
        const args: Node[] = [];
        if (!this.isOp(')')) {
          args.push(this.parseExpr());
          while (this.isOp(',')) {
            this.next();
            args.push(this.parseExpr());
          }
        }
        this.expect(')');
        n = { k: 'call', callee: n, args };
      } else if (this.isOp('[')) {
        this.next();
        const index = this.parseExpr();
        this.expect(']');
        n = { k: 'idx', obj: n, index };
      } else break;
    }
    return n;
  }
  primary(): Node {
    const t = this.next();
    if (t.t === 'num') return { k: 'lit', v: Number(t.v) };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null' || t.v === 'undefined') return { k: 'lit', v: null };
      return { k: 'id', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      const e = this.parseExpr();
      this.expect(')');
      return e;
    }
    if (t.t === 'op' && t.v === '[') {
      const items: Node[] = [];
      if (!this.isOp(']')) {
        items.push(this.parseExpr());
        while (this.isOp(',')) {
          this.next();
          items.push(this.parseExpr());
        }
      }
      this.expect(']');
      return { k: 'arr', items };
    }
    throw new ExprError(`Unexpected '${t.v || t.t}' at ${t.pos} in: ${this.src}`);
  }
}

export function parse(src: string): Node {
  const p = new Parser(tokenize(src), src);
  const n = p.parseExpr();
  if (p.peek().t !== 'eof') throw new ExprError(`Unexpected '${p.peek().v}' at ${p.peek().pos} in: ${src}`);
  return n;
}

export type Env = Record<string, any>;
export type Compiled = (env: Env) => any;

const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

function member(obj: any, prop: string): any {
  if (obj === null || obj === undefined || BLOCKED.has(prop)) return undefined;
  if (Array.isArray(obj)) {
    if (prop === 'has' || prop === 'includes') return (x: unknown) => obj.includes(x);
    if (prop === 'length') return obj.length;
    if (prop === 'some') return (x: unknown) => obj.includes(x);
  }
  if (typeof obj === 'string') {
    if (prop === 'length') return obj.length;
    if (prop === 'has' || prop === 'includes') return (x: string) => obj.includes(x);
  }
  if (typeof obj !== 'object' && typeof obj !== 'function') return undefined;
  return Object.prototype.hasOwnProperty.call(obj, prop) ? obj[prop] : undefined;
}

export function compileNode(n: Node): Compiled {
  switch (n.k) {
    case 'lit': {
      const v = n.v;
      return () => v;
    }
    case 'id': {
      const name = n.name;
      return (env) => (Object.prototype.hasOwnProperty.call(env, name) ? env[name] : undefined);
    }
    case 'mem': {
      const o = compileNode(n.obj);
      const p = n.prop;
      return (env) => member(o(env), p);
    }
    case 'idx': {
      const o = compileNode(n.obj);
      const ix = compileNode(n.index);
      return (env) => member(o(env), String(ix(env)));
    }
    case 'call': {
      const f = compileNode(n.callee);
      const args = n.args.map(compileNode);
      return (env) => {
        const fn = f(env);
        if (typeof fn !== 'function') return undefined;
        return fn(...args.map((a) => a(env)));
      };
    }
    case 'arr': {
      const items = n.items.map(compileNode);
      return (env) => items.map((i) => i(env));
    }
    case 'un': {
      const a = compileNode(n.a);
      return n.op === '!' ? (env) => !a(env) : (env) => -num(a(env));
    }
    case 'tern': {
      const c = compileNode(n.c);
      const a = compileNode(n.a);
      const b = compileNode(n.b);
      return (env) => (c(env) ? a(env) : b(env));
    }
    case 'bin': {
      const a = compileNode(n.a);
      const b = compileNode(n.b);
      switch (n.op) {
        case '&&': return (env) => a(env) && b(env);
        case '||': return (env) => a(env) || b(env);
        case '==': return (env) => a(env) == b(env); // eslint-disable-line eqeqeq
        case '!=': return (env) => a(env) != b(env); // eslint-disable-line eqeqeq
        case '<': return (env) => num(a(env)) < num(b(env));
        case '<=': return (env) => num(a(env)) <= num(b(env));
        case '>': return (env) => num(a(env)) > num(b(env));
        case '>=': return (env) => num(a(env)) >= num(b(env));
        case '+': return (env) => {
          const x = a(env);
          const y = b(env);
          return typeof x === 'string' || typeof y === 'string' ? String(x ?? '') + String(y ?? '') : num(x) + num(y);
        };
        case '-': return (env) => num(a(env)) - num(b(env));
        case '*': return (env) => num(a(env)) * num(b(env));
        case '/': return (env) => {
          const d = num(b(env));
          return d === 0 ? 0 : num(a(env)) / d;
        };
        case '%': return (env) => {
          const d = num(b(env));
          return d === 0 ? 0 : num(a(env)) % d;
        };
      }
    }
  }
  throw new ExprError('Unknown node');
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const cache = new Map<string, Compiled>();

export function compile(src: string): Compiled {
  let c = cache.get(src);
  if (!c) {
    c = compileNode(parse(src));
    cache.set(src, c);
  }
  return c;
}

export function evaluate(src: string | undefined, env: Env): any {
  if (!src || !src.trim()) return true;
  return compile(src)(env);
}

// ---------------------------------------------------------------- statements

export interface Statement {
  kind: 'assign' | 'call';
  target?: string[]; // path
  op?: '=' | '+=' | '-=' | '*=';
  value?: Compiled;
  call?: Compiled;
  src: string;
}

const stmtCache = new Map<string, Statement>();

export function parseStatement(src: string): Statement {
  const hit = stmtCache.get(src);
  if (hit) return hit;
  const toks = tokenize(src);
  // find a top-level assignment operator
  let depth = 0;
  let at = -1;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'op') continue;
    if (t.v === '(' || t.v === '[') depth++;
    else if (t.v === ')' || t.v === ']') depth--;
    else if (depth === 0 && (t.v === '=' || t.v === '+=' || t.v === '-=' || t.v === '*=')) {
      at = i;
      break;
    }
  }
  let st: Statement;
  if (at < 0) {
    st = { kind: 'call', call: compileNode(parse(src)), src };
  } else {
    const lhs = toks.slice(0, at);
    const path: string[] = [];
    for (let i = 0; i < lhs.length; i++) {
      const t = lhs[i];
      if (i % 2 === 0) {
        if (t.t !== 'id') throw new ExprError(`Bad assignment target in: ${src}`);
        path.push(t.v);
      } else if (!(t.t === 'op' && t.v === '.')) throw new ExprError(`Bad assignment target in: ${src}`);
    }
    if (!path.length) throw new ExprError(`Empty assignment target in: ${src}`);
    const rhs = src.slice(toks[at].pos + toks[at].v.length);
    st = { kind: 'assign', target: path, op: toks[at].v as Statement['op'], value: compileNode(parse(rhs)), src };
  }
  stmtCache.set(src, st);
  return st;
}

/** Collect identifier roots used in an expression (for validation). */
export function identifiers(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    switch (n.k) {
      case 'id': out.add(n.name); break;
      case 'mem': walk(n.obj); break;
      case 'idx': walk(n.obj); walk(n.index); break;
      case 'call': walk(n.callee); n.args.forEach(walk); break;
      case 'un': walk(n.a); break;
      case 'bin': walk(n.a); walk(n.b); break;
      case 'tern': walk(n.c); walk(n.a); walk(n.b); break;
      case 'arr': n.items.forEach(walk); break;
    }
  };
  walk(parse(src));
  return [...out];
}
