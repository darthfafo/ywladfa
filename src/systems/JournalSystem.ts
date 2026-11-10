import { bus } from '@/core/EventBus';
import type { Game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { JournalEntry } from '@/core/types';

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
    for (const q of registry.quests) {
      if (q.day !== day || !q.journalLine) continue;
      if (q.journalWhen && !this.game.flags.eval(q.journalWhen)) continue;
      let line: string = q.journalLine;
      if (q.journalSuccessWhen) {
        const ok = this.game.flags.eval(q.journalSuccessWhen);
        line = (ok ? q.journalLineIfSuccess : q.journalLineIfFail) ?? line;
      }
      lines.push(this.fill(line));
    }
    return lines.length ? { day, title: `Jornada ${day}`, lines } : null;
  }

  /** Todas las jornadas hasta la actual, en orden. */
  entries(): JournalEntry[] {
    const out: JournalEntry[] = [];
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
    const i = list.findIndex((x) => x.day === day);
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
