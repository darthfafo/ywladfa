import { bus } from '@/core/EventBus';
import type { Game } from '@/core/Game';
import type { TriggerDef } from '@/core/types';

export interface TriggerContext {
  tileX: number;
  tileY: number;
  zoneId: string;
}

/**
 * Decide qué dispara y en qué orden. No ejecuta la acción: la devuelve para que
 * la escena la interprete (regla R1: los sistemas no conocen Phaser).
 */
export class TriggerSystem {
  private fired = new Set<string>();

  constructor(private game: Game, private triggers: TriggerDef[]) {}

  get firedIds(): string[] {
    return [...this.fired];
  }

  hasFired(id: string): boolean {
    return this.fired.has(id);
  }

  markFired(id: string): void {
    this.fired.add(id);
  }

  /** Triggers espaciales y de estado, evaluados al moverse o al cambiar el turno. */
  check(ctx: TriggerContext): TriggerDef[] {
    const out: TriggerDef[] = [];
    for (const t of this.triggers) {
      if (t.event) continue; // los de evento se manejan en byEvent()
      if (t.once && this.fired.has(t.id)) continue;
      if (!this.matchesSpace(t, ctx)) continue;
      if (!this.game.flags.eval(t.requires)) continue;
      out.push(t);
    }
    return out;
  }

  /** Triggers atados a un evento del bus (ej. inventory:added). */
  byEvent(eventName: string, payload: Record<string, unknown>): TriggerDef[] {
    const out: TriggerDef[] = [];
    for (const t of this.triggers) {
      if (t.event !== eventName) continue;
      if (t.once && this.fired.has(t.id)) continue;
      if (t.match && !Object.entries(t.match).every(([k, v]) => payload[k] === v)) continue;
      if (!this.game.flags.eval(t.requires)) continue;
      out.push(t);
    }
    return out;
  }

  private matchesSpace(t: TriggerDef, ctx: TriggerContext): boolean {
    if (t.rect) {
      const [x, y, w, h] = t.rect;
      return ctx.tileX >= x && ctx.tileX < x + w && ctx.tileY >= y && ctx.tileY < y + h;
    }
    if (t.zone) return t.zone === ctx.zoneId;
    return true; // solo condicional (requires)
  }

  /** Ejecuta la parte "de datos" de la acción y devuelve lo que la escena tiene que hacer. */
  consume(t: TriggerDef): { dialogue?: string; choice?: string; scene?: string; tutorial?: string; toast?: string } {
    this.fired.add(t.id);
    bus.emit('trigger:fired', { triggerId: t.id });

    const a = t.action ?? {};
    if (a.setFlag) this.game.flags.setMany(a.setFlag);
    if (a.grant) {
      for (const [id, amount] of Object.entries(a.grant as Record<string, number>)) {
        this.game.res.change(id as never, amount, t.id);
      }
    }
    if (a.giveItem) this.game.inv.add(a.giveItem, 1);
    if (a.unlock) for (const u of a.unlock as string[]) this.game.flags.set(`unlocked_${u}`, true);
    if (t.turnCost > 0) this.game.spendTurns(t.turnCost);

    return {
      dialogue: a.dialogue,
      choice: a.choice,
      scene: a.scene,
      tutorial: a.tutorial,
      toast: a.toast ?? a.modifier?.toast ?? a.hint,
    };
  }
}
