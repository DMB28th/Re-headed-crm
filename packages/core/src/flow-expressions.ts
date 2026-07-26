/**
 * Bounded evaluator for Salesforce flow formula expressions (NATIVE rung).
 *
 * Covers the constructs rep-facing flows actually use: arithmetic, comparison,
 * logical operators, `&`/`+` string concat, parentheses, merge-field references
 * (`{!Var}`, `{!$GlobalConstant.True}`, `{!$Flow.CurrentDate}`), and a core
 * function library. Anything outside that — unknown function, unknown global,
 * unparseable syntax — returns `{ ok: false }` so callers DEGRADE the path
 * instead of guessing. Never throws on user-authored formulas.
 *
 * Type model mirrors flow's: string | number | boolean | null (dates ride as
 * ISO strings; DATE()/TODAY() emit ISO strings, date comparison is lexical —
 * correct for ISO).
 */

export type FormulaValue = string | number | boolean | null;

export type FormulaResult = { ok: true; value: FormulaValue } | { ok: false; reason: string };

export type FormulaScope = (ref: string) => FormulaValue | undefined;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; v: string }
  | { t: "ident"; v: string }
  | { t: "op"; v: string }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "comma" };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "rparen" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ t: "comma" });
      i++;
      continue;
    }
    if (c === "{" && src[i + 1] === "!") {
      const end = src.indexOf("}", i);
      if (end === -1) return null;
      tokens.push({ t: "ref", v: src.slice(i + 2, end).trim() });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = "";
      while (j < n && src[j] !== c) {
        out += src[j];
        j++;
      }
      if (j >= n) return null;
      tokens.push({ t: "str", v: out });
      i = j + 1;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && ((src[j]! >= "0" && src[j]! <= "9") || src[j] === ".")) j++;
      const raw = src.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) return null;
      tokens.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$.]/.test(src[j]!)) j++;
      tokens.push({ t: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    // Multi-char operators first
    const two = src.slice(i, i + 2);
    if (two === "<>" || two === "<=" || two === ">=" || two === "==" || two === "&&" || two === "||") {
      tokens.push({ t: "op", v: two === "==" ? "=" : two });
      i += 2;
      continue;
    }
    if ("+-*/=<>&!^".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    return null; // unknown character
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser / evaluator (recursive descent)
// ---------------------------------------------------------------------------

class Unevaluable extends Error {}

function truthy(v: FormulaValue): boolean {
  return v === true; // flow booleans are strict; null/"" are not true
}

function num(v: FormulaValue): number {
  if (v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") throw new Unevaluable("boolean where number expected");
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) throw new Unevaluable(`"${v}" is not a number`);
  return parsed;
}

function str(v: FormulaValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function isBlank(v: FormulaValue): boolean {
  return v === null || v === "" || v === undefined;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Fn = (args: FormulaValue[]) => FormulaValue;

const FUNCTIONS: Record<string, { arity: [number, number]; fn: Fn }> = {
  IF: { arity: [3, 3], fn: (a) => (truthy(a[0]!) ? a[1]! : a[2]!) },
  AND: { arity: [1, 99], fn: (a) => a.every(truthy) },
  OR: { arity: [1, 99], fn: (a) => a.some(truthy) },
  NOT: { arity: [1, 1], fn: (a) => !truthy(a[0]!) },
  ISBLANK: { arity: [1, 1], fn: (a) => isBlank(a[0]!) },
  ISNULL: { arity: [1, 1], fn: (a) => a[0] === null },
  NULLVALUE: { arity: [2, 2], fn: (a) => (isBlank(a[0]!) ? a[1]! : a[0]!) },
  BLANKVALUE: { arity: [2, 2], fn: (a) => (isBlank(a[0]!) ? a[1]! : a[0]!) },
  TEXT: { arity: [1, 1], fn: (a) => str(a[0]!) },
  VALUE: { arity: [1, 1], fn: (a) => num(a[0]!) },
  LEN: { arity: [1, 1], fn: (a) => str(a[0]!).length },
  LEFT: { arity: [2, 2], fn: (a) => str(a[0]!).slice(0, Math.max(0, num(a[1]!))) },
  RIGHT: { arity: [2, 2], fn: (a) => { const s = str(a[0]!); const k = Math.max(0, num(a[1]!)); return k === 0 ? "" : s.slice(-k); } },
  MID: { arity: [3, 3], fn: (a) => str(a[0]!).slice(Math.max(0, num(a[1]!) - 1), Math.max(0, num(a[1]!) - 1) + Math.max(0, num(a[2]!))) },
  TRIM: { arity: [1, 1], fn: (a) => str(a[0]!).trim() },
  UPPER: { arity: [1, 1], fn: (a) => str(a[0]!).toUpperCase() },
  LOWER: { arity: [1, 1], fn: (a) => str(a[0]!).toLowerCase() },
  CONTAINS: { arity: [2, 2], fn: (a) => str(a[0]!).includes(str(a[1]!)) },
  BEGINS: { arity: [2, 2], fn: (a) => str(a[0]!).startsWith(str(a[1]!)) },
  SUBSTITUTE: { arity: [3, 3], fn: (a) => str(a[0]!).split(str(a[1]!)).join(str(a[2]!)) },
  FIND: { arity: [2, 3], fn: (a) => str(a[1]!).indexOf(str(a[0]!), a[2] !== undefined ? Math.max(0, num(a[2]!) - 1) : 0) + 1 },
  ABS: { arity: [1, 1], fn: (a) => Math.abs(num(a[0]!)) },
  ROUND: { arity: [2, 2], fn: (a) => { const p = num(a[1]!); const m = 10 ** p; return Math.round(num(a[0]!) * m) / m; } },
  FLOOR: { arity: [1, 1], fn: (a) => Math.floor(num(a[0]!)) },
  CEILING: { arity: [1, 1], fn: (a) => Math.ceil(num(a[0]!)) },
  MOD: { arity: [2, 2], fn: (a) => num(a[0]!) % num(a[1]!) },
  MIN: { arity: [1, 99], fn: (a) => Math.min(...a.map(num)) },
  MAX: { arity: [1, 99], fn: (a) => Math.max(...a.map(num)) },
  SQRT: { arity: [1, 1], fn: (a) => Math.sqrt(num(a[0]!)) },
  EXP: { arity: [1, 1], fn: (a) => Math.exp(num(a[0]!)) },
  LN: { arity: [1, 1], fn: (a) => Math.log(num(a[0]!)) },
  TODAY: { arity: [0, 0], fn: () => todayIso() },
  NOW: { arity: [0, 0], fn: () => new Date().toISOString() },
  DATE: {
    arity: [3, 3],
    fn: (a) =>
      `${String(num(a[0]!)).padStart(4, "0")}-${String(num(a[1]!)).padStart(2, "0")}-${String(num(a[2]!)).padStart(2, "0")}`,
  },
  DATEVALUE: { arity: [1, 1], fn: (a) => str(a[0]!).slice(0, 10) },
  ISNUMBER: { arity: [1, 1], fn: (a) => !isBlank(a[0]!) && Number.isFinite(Number(a[0]!)) },
  CASE: {
    arity: [4, 99],
    fn: (a) => {
      const subject = a[0]!;
      let i = 1;
      for (; i + 1 < a.length; i += 2) {
        if (str(subject) === str(a[i]!)) return a[i + 1]!;
      }
      return i < a.length ? a[i]! : null; // trailing else
    },
  },
};

const GLOBALS: Record<string, () => FormulaValue> = {
  "$GlobalConstant.True": () => true,
  "$GlobalConstant.False": () => false,
  "$GlobalConstant.EmptyString": () => "",
  "$Flow.CurrentDate": () => todayIso(),
  "$Flow.CurrentDateTime": () => new Date().toISOString(),
  "$Flow.FaultMessage": () => "",
};

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly scope: FormulaScope,
  ) {}

  parse(): FormulaValue {
    const value = this.expr();
    if (this.pos !== this.tokens.length) throw new Unevaluable("trailing tokens");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private takeOp(...ops: string[]): string | null {
    const t = this.peek();
    if (t?.t === "op" && ops.includes(t.v)) {
      this.pos++;
      return t.v;
    }
    return null;
  }

  // expr := cmp (("&&"|"||") cmp)*
  private expr(): FormulaValue {
    let left = this.cmp();
    for (;;) {
      const op = this.takeOp("&&", "||");
      if (!op) return left;
      const right = this.cmp();
      left = op === "&&" ? truthy(left) && truthy(right) : truthy(left) || truthy(right);
    }
  }

  // cmp := concat (("="|"<>"|"<"|">"|"<="|">=") concat)?
  private cmp(): FormulaValue {
    const left = this.concat();
    const op = this.takeOp("=", "<>", "<", ">", "<=", ">=");
    if (!op) return left;
    const right = this.concat();
    if (op === "=") return cmpEq(left, right);
    if (op === "<>") return !cmpEq(left, right);
    const l = typeof left === "string" && typeof right === "string" ? left : num(left);
    const r = typeof left === "string" && typeof right === "string" ? (right as string) : num(right);
    if (op === "<") return l < r;
    if (op === ">") return l > r;
    if (op === "<=") return l <= r;
    return l >= r;
  }

  // concat := add ("&" add)*
  private concat(): FormulaValue {
    let left = this.add();
    for (;;) {
      if (!this.takeOp("&")) return left;
      left = str(left) + str(this.add());
    }
  }

  // add := mul (("+"|"-") mul)*
  private add(): FormulaValue {
    let left = this.mul();
    for (;;) {
      const op = this.takeOp("+", "-");
      if (!op) return left;
      const right = this.mul();
      if (op === "+" && (typeof left === "string" || typeof right === "string")) {
        left = str(left) + str(right); // flow's + concatenates text
      } else {
        left = op === "+" ? num(left) + num(right) : num(left) - num(right);
      }
    }
  }

  // mul := pow (("*"|"/") pow)*
  private mul(): FormulaValue {
    let left = this.pow();
    for (;;) {
      const op = this.takeOp("*", "/");
      if (!op) return left;
      const right = this.pow();
      left = op === "*" ? num(left) * num(right) : num(left) / num(right);
    }
  }

  // pow := unary ("^" unary)*
  private pow(): FormulaValue {
    let left = this.unary();
    for (;;) {
      if (!this.takeOp("^")) return left;
      left = num(left) ** num(this.unary());
    }
  }

  private unary(): FormulaValue {
    if (this.takeOp("-")) return -num(this.unary());
    if (this.takeOp("+")) return num(this.unary());
    if (this.takeOp("!")) return !truthy(this.unary());
    return this.primary();
  }

  private primary(): FormulaValue {
    const t = this.peek();
    if (!t) throw new Unevaluable("unexpected end");
    if (t.t === "num") {
      this.pos++;
      return t.v;
    }
    if (t.t === "str") {
      this.pos++;
      return t.v;
    }
    if (t.t === "lparen") {
      this.pos++;
      const v = this.expr();
      if (this.peek()?.t !== "rparen") throw new Unevaluable("missing )");
      this.pos++;
      return v;
    }
    if (t.t === "ref") {
      this.pos++;
      return this.resolveRef(t.v);
    }
    if (t.t === "ident") {
      this.pos++;
      const name = t.v;
      if (this.peek()?.t === "lparen") {
        this.pos++;
        const args: FormulaValue[] = [];
        if (this.peek()?.t !== "rparen") {
          for (;;) {
            args.push(this.expr());
            if (this.peek()?.t === "comma") {
              this.pos++;
              continue;
            }
            break;
          }
        }
        if (this.peek()?.t !== "rparen") throw new Unevaluable("missing ) after args");
        this.pos++;
        const fn = FUNCTIONS[name.toUpperCase()];
        if (!fn) throw new Unevaluable(`unknown function ${name}`);
        if (args.length < fn.arity[0] || args.length > fn.arity[1]) {
          throw new Unevaluable(`${name} arity`);
        }
        return fn.fn(args);
      }
      // Bare identifiers: TRUE/FALSE/NULL, globals, or a merge ref without {!}
      const up = name.toUpperCase();
      if (up === "TRUE") return true;
      if (up === "FALSE") return false;
      if (up === "NULL") return null;
      return this.resolveRef(name);
    }
    throw new Unevaluable(`unexpected token ${JSON.stringify(t)}`);
  }

  private resolveRef(ref: string): FormulaValue {
    const global = GLOBALS[ref];
    if (global) return global();
    if (ref.startsWith("$")) throw new Unevaluable(`unknown global ${ref}`);
    const v = this.scope(ref);
    if (v === undefined) return null; // unset variables read as null, like flow
    return v;
  }
}

function cmpEq(a: FormulaValue, b: FormulaValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" || typeof b === "number") {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an === bn;
  }
  return str(a) === str(b);
}

/**
 * Evaluate a flow formula. `scope` resolves merge references (variables,
 * screen answers, element outputs — dotted refs included, e.g. `Get_A.Name`).
 */
export function evaluateFormula(expression: string, scope: FormulaScope): FormulaResult {
  const tokens = tokenize(expression);
  if (!tokens) return { ok: false, reason: "unrecognized syntax" };
  try {
    return { ok: true, value: new Parser(tokens, scope).parse() };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Unevaluable ? error.message : "evaluation failed",
    };
  }
}
