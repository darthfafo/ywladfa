import { bus } from '@/core/EventBus';
import { registry } from '@/core/Registry';
import type { GameState, ResourceId } from '@/core/types';

/** Suma y resta con clamp, y aplica el consumo nocturno. Nunca escribe otra cosa del estado. */
export class ResourceSystem {
  constructor(private state: GameState) {}

  get(id: ResourceId): number {
    return this.state.resources[id] ?? 0;
  }

  /** delta positivo suma, negativo resta. Devuelve el valor final ya clampeado. */
  change(id: ResourceId, delta: number, reason = ''): number {
    const def = registry.resources.find((r) => r.id === id);
    const min = def?.min ?? 0;
    const max = def?.max ?? Number.MAX_SAFE_INTEGER;
    const from = this.get(id);
    const to = Math.max(min, Math.min(max, from + delta));
    if (to === from) return to;
    this.state.resources[id] = to;
    bus.emit('resource:changed', { id, from, to, reason });
    if (to <= min && from > min) bus.emit('resource:depleted', { id });
    return to;
  }

  spend(id: ResourceId, amount: number, reason = ''): boolean {
    if (this.get(id) < amount) return false;
    this.change(id, -amount, reason);
    return true;
  }

  isCritical(id: ResourceId): boolean {
    const def = registry.resources.find((r) => r.id === id);
    return def ? this.get(id) < def.criticalBelow : false;
  }

  /**
   * Consumo de la noche. Devuelve qué clase de fuego se pudo encender,
   * que es lo que decide la recuperación del grupo (balance.nightRecovery).
   */
  applyNight(groupSize: number): 'bigFire' | 'smallFire' | 'noFire' {
    const nc = registry.balance.nightConsumption;
    this.change('comida', -nc.comidaPerPerson * groupSize, 'cena');
    this.change('agua', -nc.aguaPerGroup, 'noche');

    const big = registry.balance.nightRecovery.bigFire.requiresLena as number;
    const small = registry.balance.nightRecovery.smallFire.requiresLena as number;
    // nunca queda en cero: siempre se junta algo — ramas, lo que haya — para
    // prender al menos un fuego chico. Sin esto, con leña en 0 la escena del
    // fogón igual mostraba fogon_chico.png (que SÍ tiene una llama real) y a la
    // mañana siguiente el aviso decía "No hubo fuego" — rompía la continuidad.
    if (this.get('lena') < small) this.change('lena', small - this.get('lena'), 'lo último que se consigue a último momento');

    const lena = this.get('lena');
    if (lena >= big) {
      this.change('lena', -big, 'fuego grande');
      return 'bigFire';
    }
    if (lena >= small) {
      this.change('lena', -small, 'fuego chico');
      return 'smallFire';
    }
    return 'noFire';
  }
}
