import { evalCondition } from '@/core/conditions';
import { bus } from '@/core/EventBus';
import { conditionContext } from '@/core/GameState';
import type { FlagValue, GameState } from '@/core/types';

/** Almacén de flags + evaluador de condiciones contra el estado actual. */
export class FlagSystem {
  constructor(private state: GameState) {}

  get(key: string): FlagValue {
    return this.state.flags[key] ?? null;
  }

  set(key: string, value: FlagValue): void {
    this.state.flags[key] = value;
    bus.emit('flag:set', { key, value });
  }

  setMany(obj: Record<string, FlagValue>): void {
    for (const [k, v] of Object.entries(obj)) this.set(k, v);
  }

  /** Contador: incrementa y devuelve el nuevo valor. */
  inc(key: string, by = 1): number {
    const cur = Number(this.state.flags[key] ?? 0);
    const next = cur + by;
    this.set(key, next);
    return next;
  }

  is(key: string): boolean {
    return Boolean(this.state.flags[key]);
  }

  /** Evalúa una expresión del mini-lenguaje contra el estado. Vacía = true. */
  eval(expr?: string | null): boolean {
    return evalCondition(expr, conditionContext(this.state));
  }
}
