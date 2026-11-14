import { bus } from '@/core/EventBus';
import type { Game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { JournalEntry } from '@/core/types';

/** Un bloque de texto de la libreta: qué es (define cómo se dibuja) y su texto. */
export interface BookBlock {
  kind: 'title' | 'subtitle' | 'chapter' | 'day' | 'line' | 'thought' | 'note' | 'codex-title' | 'codex-label' | 'codex-text';
  text: string;
  /** empieza en hoja nueva */
  pageBreak?: boolean;
  /** marca para saltar a esta parte (la cinta del Códice) */
  anchor?: string;
}

/**
 * Diario y Códice (GDD §5.11).
 *
 * El Diario se escribe solo, en primera persona: cada jornada junta las
 * `journalLine` de las quests de ese día (data/quests) cuya condición
 * `journalWhen` ya se cumple, eligiendo la variante de éxito o de fracaso suave
 * según `journalSuccessWhen`. Se arma a partir del estado, así que siempre
 * coincide con lo que pasó, y al cerrar cada noche se guarda una copia en
 * `state.journal` (el resumen legible de la partida guardada).
 *
 * El Códice se desbloquea al disparar el trigger que nombra cada ficha
 * (`unlockedBy` en data/codex.json).
 */
export class JournalSystem {
  constructor(private game: Game) {}

  /** Entrada de una jornada, o null si todavía no pasó nada que contar. */
  entry(day: number): JournalEntry | null {
    const lines: string[] = [];
    const thoughts: string[] = [];
    for (const q of registry.questsFor(this.game.state.progress.level)) {
      // `dayFlag`: la jornada sale de un flag (en la marcha, el día en que se tomó la decisión)
      const qDay = q.dayFlag ? Number(this.game.flags.get(q.dayFlag) ?? 0) : q.day;
      if (qDay !== day || !(q.journalLine || q.journalThought)) continue;
      if (q.journalWhen && !this.game.flags.eval(q.journalWhen)) continue;
      let line: string | undefined = q.journalLine;
      // `journalThought`: lo que el personaje cree que va a pasar por esto (la bitácora)
      let thought: string | undefined = q.journalThought;
      if (q.journalSuccessWhen) {
        const ok = this.game.flags.eval(q.journalSuccessWhen);
        line = (ok ? q.journalLineIfSuccess : q.journalLineIfFail) ?? line;
        thought = (ok ? q.journalThoughtIfSuccess : q.journalThoughtIfFail) ?? thought;
      }
      if (line) {
        lines.push(this.fill(line));
        thoughts.push(thought ? this.fill(thought) : '');
      } else if (thought && lines.length) {
        // un pensamiento suelto se suma a la última línea (ej. uno por cada bulto que quedó)
        const i = lines.length - 1;
        thoughts[i] = [thoughts[i], this.fill(thought)].filter(Boolean).join(' ');
      }
    }
    return lines.length ? { level: this.game.state.progress.level, day, title: `Jornada ${day}`, lines, thoughts } : null;
  }

  /**
   * Todo el libro, en orden, como bloques de texto (la libreta 3D los pagina y los
   * dibuja; acá no hay nada de dibujo): la portada, un capítulo por nivel con sus
   * jornadas —cada línea con lo que el personaje cree que va a pasar— y el Códice.
   */
  bookBlocks(): BookBlock[] {
    const s = this.game.state;
    const out: BookBlock[] = [
      { kind: 'title', text: `Libreta de ${s.player.name}` },
      { kind: 'subtitle', text: 'Me la dio Berwyn en Punta Cuevas: «Dentro de cuarenta años alguien va a preguntar cómo fue, y no va a quedar nadie que se acuerde».' },
    ];
    const entries = this.entries();
    if (!entries.length) out.push({ kind: 'note', text: 'Todavía no hay nada escrito.' });
    let level = '';
    for (const e of entries) {
      const lv = e.level ?? s.progress.level;
      if (lv !== level) {
        level = lv;
        const def = registry.hasLevel(lv) ? registry.level(lv) : null;
        out.push({ kind: 'chapter', text: def?.title ?? lv, pageBreak: true });
        if (def?.date) out.push({ kind: 'subtitle', text: def.date });
      }
      out.push({ kind: 'day', text: e.title });
      e.lines.forEach((l, i) => {
        out.push({ kind: 'line', text: l });
        const t = e.thoughts?.[i];
        if (t) out.push({ kind: 'thought', text: t });
      });
    }
    const codex = this.codex();
    out.push({ kind: 'chapter', text: 'Códice', pageBreak: true, anchor: 'codice' });
    out.push({ kind: 'note', text: `${codex.length} de ${registry.codex.length} fichas. Cada una separa lo documentado de lo que el juego inventa.` });
    for (const c of codex) {
      out.push({ kind: 'codex-title', text: c.title });
      out.push({ kind: 'codex-label', text: 'Lo documentado' });
      out.push({ kind: 'codex-text', text: c.documented });
      out.push({ kind: 'codex-label', text: 'Lo dramatizado' });
      out.push({ kind: 'codex-text', text: c.dramatized });
    }
    return out;
  }

  /** Todas las jornadas hasta la actual, en orden. */
  entries(): JournalEntry[] {
    // lo escrito en niveles anteriores queda guardado tal cual; el nivel actual se
    // arma en vivo (así la jornada de hoy ya aparece antes de que caiga la noche)
    const level = this.game.state.progress.level;
    const out: JournalEntry[] = this.game.state.journal.filter((e) => (e.level ?? level) !== level);
    for (let d = 1; d <= this.game.state.progress.day; d++) {
      const e = this.entry(d);
      if (e) out.push(e);
    }
    return out;
  }

  /** Guarda la entrada de `day` en el estado (al cerrar la noche). */
  write(day: number): void {
    const e = this.entry(day);
    if (!e) return;
    const list = this.game.state.journal;
    const i = list.findIndex((x) => x.day === day && (x.level ?? e.level) === e.level);
    if (i >= 0) list[i] = e;
    else list.push(e);
    bus.emit('journal:entry', { entry: e });
  }

  /** Desbloquea las fichas del Códice que abre este trigger. */
  unlockCodexFor(triggerId: string): void {
    for (const c of registry.codex) {
      if (c.unlockedBy !== triggerId || this.game.state.codex.includes(c.id)) continue;
      this.game.state.codex.push(c.id);
      bus.emit('codex:unlocked', { id: c.id, title: c.title });
    }
  }

  /** Fichas desbloqueadas, en el orden del archivo de datos. */
  codex(): Array<{ id: string; title: string; documented: string; dramatized: string }> {
    return registry.codex.filter((c) => this.game.state.codex.includes(c.id));
  }

  /** Reemplaza {cueva}, {n} y {dejados} con lo que eligió el jugador. */
  private fill(line: string): string {
    const flags = this.game.flags;
    return line
      .replace('{cueva}', () => {
        const id = flags.get('n1_cueva_elegida') as string | undefined;
        const op = (registry.levelBalance('nivel-01').cuevas?.opciones as Array<{ id: string; label: string }> | undefined)?.find((o) => o.id === id);
        return op ? lower(op.label) : 'una';
      })
      .replace('{n}', () => String(flags.get('n1_lena_traida_j2') ?? 0))
      .replace('{dejados}', () => {
        const taken = (flags.get('n1_carga') as string[] | undefined) ?? [];
        const left = registry.bultos.filter((b) => !taken.includes(b.id)).map((b) => lower(b.label));
        return joinEs(left);
      });
  }
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** "a", "a y b", "a, b y c" */
function joinEs(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? 'nada';
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}
