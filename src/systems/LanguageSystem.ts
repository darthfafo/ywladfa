import type { GameState, LangId } from '@/core/types';

const BLOCK = '▓';

/** Palabras que siempre pasan: números, nombres propios y lugares (se reconocen por contexto). */
const ALWAYS_CLEAR = /^[0-9]+$/;

/**
 * Pilar P3: entender es un recurso. Sin idioma, el diálogo se ve con huecos literales.
 *   0 → todo en bloques · 1 → palabras sueltas · 2 → casi todo · 3 → completo
 */
export class LanguageSystem {
  constructor(private state: GameState) {}

  level(lang: LangId | 'none'): number {
    if (lang === 'none') return 3;
    return this.state.languages[lang] ?? 0;
  }

  /** Enmascara una línea según el nivel del jugador en ese idioma. */
  render(text: string, lang: LangId | 'none', bonus = 0): string {
    const lvl = Math.min(3, this.level(lang) + bonus);
    if (lvl >= 3) return text;

    const keepRatio = lvl === 0 ? 0 : lvl === 1 ? 0.25 : 0.7;
    return text
      .split(/(\s+)/)
      .map((tok) => {
        if (/^\s+$/.test(tok)) return tok;
        const core = tok.replace(/^[^\wáéíóúüñÁÉÍÓÚÜÑŵŷâêîôû]+|[^\wáéíóúüñÁÉÍÓÚÜÑŵŷâêîôû]+$/g, '');
        if (!core) return tok;
        if (ALWAYS_CLEAR.test(core)) return tok;
        // determinista: la misma palabra se entiende o no siempre igual
        if (hash(core) % 100 < keepRatio * 100) return tok;
        return tok.replace(core, BLOCK.repeat(Math.max(2, Math.min(8, core.length))));
      })
      .join('');
  }

  /** Un intérprete en el grupo da +1 temporal. */
  interpreterBonus(hasInterpreter: boolean): number {
    return hasInterpreter ? 1 : 0;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export const BLOCK_CHAR = BLOCK;
