/**
 * Mini-evaluador de condiciones de una línea. Sin `eval`, sin dependencias.
 * Soporta: == != > >= < <= && || ! includes, paréntesis, y rutas tipo `flags.x`.
 *
 *   "flags.n1_encontro_manantial == true"
 *   "resources.agua >= 12 && party.mari.health > 40"
 *   "flags.n1_carga includes 'imprenta'"
 *   "!(flags.n1_carga includes 'organo')"
 */

type Tok = { t: 'num' | 'str' | 'bool' | 'null' | 'path' | 'op' | 'lp' | 'rp'; v: any };

const OPS = ['&&', '||', '==', '!=', '>=', '<=', '>', '<', 'includes', '!'];

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c === '(') { out.push({ t: 'lp', v: '(' }); i++; continue; }
    if (c === ')') { out.push({ t: 'rp', v: ')' }); i++; continue; }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error(`String sin cerrar en: ${src}`);
      out.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '>=', '<='].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (src.startsWith('includes', i)) { out.push({ t: 'op', v: 'includes' }); i += 8; continue; }
    if (c === '>' || c === '<' || c === '!') { out.push({ t: 'op', v: c }); i++; continue; }
    const m = /^[A-Za-z0-9_.$-]+/.exec(src.slice(i));
    if (m) {
      const w = m[0];
      i += w.length;
      if (w === 'true' || w === 'false') out.push({ t: 'bool', v: w === 'true' });
      else if (w === 'null') out.push({ t: 'null', v: null });
      else if (/^-?\d+(\.\d+)?$/.test(w)) out.push({ t: 'num', v: Number(w) });
      else out.push({ t: 'path', v: w });
      continue;
    }
    throw new Error(`Carácter inesperado '${c}' en: ${src}`);
  }
  return out;
}

function resolvePath(path: string, ctx: unknown): unknown {
  let cur: any = ctx;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** Parser recursivo descendente: or → and → cmp → unary → primary */
class Parser {
  private p = 0;
  constructor(private toks: Tok[], private ctx: unknown) {}

  parse(): unknown {
    const v = this.or();
    if (this.p !== this.toks.length) throw new Error('Tokens sobrantes en la condición');
    return v;
  }
  private peek(): Tok | undefined { return this.toks[this.p]; }
  private eatOp(v: string): boolean {
    const t = this.peek();
    if (t && t.t === 'op' && t.v === v) { this.p++; return true; }
    return false;
  }
  private or(): unknown {
    let l = this.and();
    while (this.eatOp('||')) { const r = this.and(); l = Boolean(l) || Boolean(r); }
    return l;
  }
  private and(): unknown {
    let l = this.cmp();
    while (this.eatOp('&&')) { const r = this.cmp(); l = Boolean(l) && Boolean(r); }
    return l;
  }
  private cmp(): unknown {
    const l = this.unary();
    const t = this.peek();
    if (t && t.t === 'op' && ['==', '!=', '>', '>=', '<', '<=', 'includes'].includes(t.v)) {
      this.p++;
      const r = this.unary();
      switch (t.v) {
        case '==': return l === r || (l == null && r == null);
        case '!=': return !(l === r || (l == null && r == null));
        case '>': return Number(l) > Number(r);
        case '>=': return Number(l) >= Number(r);
        case '<': return Number(l) < Number(r);
        case '<=': return Number(l) <= Number(r);
        case 'includes':
          if (Array.isArray(l)) return l.includes(r as never);
          if (typeof l === 'string') return l.includes(String(r));
          return false;
      }
    }
    return l;
  }
  private unary(): unknown {
    if (this.eatOp('!')) return !Boolean(this.unary());
    return this.primary();
  }
  private primary(): unknown {
    const t = this.peek();
    if (!t) throw new Error('Condición incompleta');
    if (t.t === 'lp') { this.p++; const v = this.or(); if (!this.peek() || this.peek()!.t !== 'rp') throw new Error('Falta )'); this.p++; return v; }
    this.p++;
    if (t.t === 'path') return resolvePath(t.v, this.ctx);
    return t.v;
  }
}

/** Evalúa una condición contra un contexto. Una condición vacía es siempre true. */
export function evalCondition(expr: string | undefined | null, ctx: unknown): boolean {
  if (!expr || !expr.trim()) return true;
  try {
    return Boolean(new Parser(tokenize(expr), ctx).parse());
  } catch (e) {
    console.warn(`[conditions] No se pudo evaluar "${expr}":`, e);
    return false;
  }
}

export const __ops = OPS;
