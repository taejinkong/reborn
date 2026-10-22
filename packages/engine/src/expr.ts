// 콘텐츠 DSL용 안전 표현식 언어.
// 지원: 숫자·문자열·불리언·배열 리터럴, 점 경로(stats.health), 함수 호출(화이트리스트),
//       ! - (단항), * / % + - < <= > >= == != in && || 와 괄호, 삼항 a ? b : c.
// 임의 코드 실행이 없도록 직접 파싱하고 해석한다.

export type Node =
  | { t: 'lit'; v: unknown }
  | { t: 'arr'; items: Node[] }
  | { t: 'path'; parts: string[] }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'un'; op: '!' | '-'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'cond'; c: Node; a: Node; b: Node };

type Tok = { k: 'num' | 'str' | 'id' | 'op' | 'end'; v: string; pos: number };

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '!', '(', ')', '[', ']', ',', '.', '?', ':'];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(src.slice(i))!;
      out.push({ k: 'num', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) throw new ExprError('문자열이 닫히지 않음', src, i);
      out.push({ k: 'str', v: src.slice(i + 1, end), pos: i });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`알 수 없는 문자 '${ch}'`, src, i);
    out.push({ k: 'op', v: op, pos: i });
    i += op.length;
  }
  out.push({ k: 'end', v: '', pos: src.length });
  return out;
}

export class ExprError extends Error {
  constructor(msg: string, src: string, pos: number) {
    super(`${msg} (위치 ${pos}): ${src}`);
  }
}

const BIN_PREC: Record<string, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, in: 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

export function parse(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const take = () => toks[p++];
  const expect = (v: string) => {
    const t = take();
    if (t.v !== v) throw new ExprError(`'${v}' 필요`, src, t.pos);
  };

  function primary(): Node {
    const t = take();
    if (t.k === 'num') return { t: 'lit', v: Number(t.v) };
    if (t.k === 'str') return { t: 'lit', v: t.v };
    if (t.k === 'op' && t.v === '(') {
      const e = expr(0);
      expect(')');
      return e;
    }
    if (t.k === 'op' && t.v === '[') {
      const items: Node[] = [];
      if (peek().v !== ']') {
        do items.push(expr(0));
        while (peek().v === ',' && take());
      }
      expect(']');
      return { t: 'arr', items };
    }
    if (t.k === 'op' && (t.v === '!' || t.v === '-')) return { t: 'un', op: t.v, a: unaryOperand() };
    if (t.k === 'id') {
      if (t.v === 'true') return { t: 'lit', v: true };
      if (t.v === 'false') return { t: 'lit', v: false };
      if (t.v === 'null') return { t: 'lit', v: null };
      if (peek().v === '(') {
        take();
        const args: Node[] = [];
        if (peek().v !== ')') {
          do args.push(expr(0));
          while (peek().v === ',' && take());
        }
        expect(')');
        return { t: 'call', name: t.v, args };
      }
      const parts = [t.v];
      while (peek().v === '.') {
        take();
        const n = take();
        if (n.k !== 'id') throw new ExprError('경로 이름 필요', src, n.pos);
        parts.push(n.v);
      }
      return { t: 'path', parts };
    }
    throw new ExprError(`예상하지 못한 '${t.v || '끝'}'`, src, t.pos);
  }

  // 단항 연산자는 곱셈보다 강하게 묶는다
  function unaryOperand(): Node {
    return primary();
  }

  function expr(minPrec: number): Node {
    let left = primary();
    for (;;) {
      const t = peek();
      const op = t.k === 'op' || (t.k === 'id' && t.v === 'in') ? t.v : null;
      const prec = op ? BIN_PREC[op] : undefined;
      if (prec === undefined || prec <= minPrec) break;
      take();
      left = { t: 'bin', op: op!, a: left, b: expr(prec) };
    }
    // 삼항은 가장 약하게, 오른쪽으로 묶는다
    if (minPrec === 0 && peek().v === '?') {
      take();
      const a = expr(0);
      expect(':');
      return { t: 'cond', c: left, a, b: expr(0) };
    }
    return left;
  }

  const node = expr(0);
  if (peek().k !== 'end') throw new ExprError(`남은 입력 '${peek().v}'`, src, peek().pos);
  return node;
}

export type Fn = (...args: unknown[]) => unknown;
export interface Scope {
  /** 최상위 경로 이름 → 값 */
  vars: Record<string, unknown>;
  fns: Record<string, Fn>;
}

export function evaluate(n: Node, scope: Scope): unknown {
  switch (n.t) {
    case 'lit':
      return n.v;
    case 'arr':
      return n.items.map((x) => evaluate(x, scope));
    case 'path': {
      let v: unknown = scope.vars[n.parts[0]];
      for (let i = 1; i < n.parts.length && v != null; i++) v = (v as Record<string, unknown>)[n.parts[i]];
      return v;
    }
    case 'call': {
      const f = scope.fns[n.name];
      if (!f) throw new Error(`알 수 없는 함수 ${n.name}()`);
      return f(...n.args.map((x) => evaluate(x, scope)));
    }
    case 'un': {
      const a = evaluate(n.a, scope);
      return n.op === '!' ? !a : -(a as number);
    }
    case 'cond':
      return evaluate(n.c, scope) ? evaluate(n.a, scope) : evaluate(n.b, scope);
    case 'bin': {
      if (n.op === '&&') return evaluate(n.a, scope) && evaluate(n.b, scope);
      if (n.op === '||') return evaluate(n.a, scope) || evaluate(n.b, scope);
      const a = evaluate(n.a, scope) as never, b = evaluate(n.b, scope) as never;
      switch (n.op) {
        case '==': return a === b;
        case '!=': return a !== b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '+': return (a as number) + (b as number);
        case '-': return (a as number) - (b as number);
        case '*': return (a as number) * (b as number);
        case '/': return (a as number) / (b as number);
        case '%': return (a as number) % (b as number);
        case 'in': return Array.isArray(b) && (b as unknown[]).includes(a);
      }
    }
  }
  throw new Error('평가할 수 없는 식');
}

/** 식이 참조하는 최상위 경로와 함수 이름 (린트용) */
export function refs(n: Node, out = { paths: new Set<string>(), fns: new Set<string>() }) {
  if (n.t === 'path') out.paths.add(n.parts.join('.'));
  else if (n.t === 'call') { out.fns.add(n.name); n.args.forEach((x) => refs(x, out)); }
  else if (n.t === 'arr') n.items.forEach((x) => refs(x, out));
  else if (n.t === 'un') refs(n.a, out);
  else if (n.t === 'bin') { refs(n.a, out); refs(n.b, out); }
  else if (n.t === 'cond') { refs(n.c, out); refs(n.a, out); refs(n.b, out); }
  return out;
}

/** 문자열이면 파싱해서 평가, 숫자·불리언이면 그대로. */
export type Expr = string | number | boolean;
export function compile(e: Expr): (scope: Scope) => unknown {
  if (typeof e !== 'string') return () => e;
  const node = parse(e);
  return (scope) => evaluate(node, scope);
}
