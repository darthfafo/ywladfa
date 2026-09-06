import { bus } from '@/core/EventBus';
import { registry } from '@/core/Registry';
import type { GameState } from '@/core/types';

/**
 * Ítems, peso y capacidad. Pilar P2: sobrepasar la capacidad NUNCA bloquea,
 * solo hace caminar más lento. No existe el cartel de "inventario lleno".
 */
export class InventorySystem {
  constructor(private state: GameState) {}

  get carried(): number {
    return this.state.player.carriedKg;
  }
  get capacity(): number {
    return this.state.player.capacityKg;
  }
  get isOverloaded(): boolean {
    return this.carried > this.capacity;
  }

  /**
   * Multiplicador de velocidad por peso. 1 sin sobrecarga, cae gradual hasta el
   * piso del balance — `overloadRangeMultiplier` estira el rango para que cargar
   * un poco de más y cargar todo se sientan distinto, no lo mismo (docs/01 §2.3).
   */
  speedMultiplier(): number {
    if (!this.isOverloaded) return 1;
    const min = registry.balance.global.overloadSpeedMultiplier as number;
    const range = (registry.balance.global.overloadRangeMultiplier as number) ?? 1;
    const excess = (this.carried - this.capacity) / Math.max(1, this.capacity * range);
    return Math.max(min, 1 - excess);
  }

  count(itemId: string): number {
    return this.state.inventory.reduce((sum, e) => (e.itemId === itemId ? sum + e.qty : sum), 0);
  }

  add(itemId: string, qty = 1): void {
    const def = registry.item(itemId);
    const entry = this.state.inventory.find((e) => e.itemId === itemId);
    if (entry && def.stackable !== false) entry.qty += qty;
    else this.state.inventory.push({ itemId, qty });

    this.state.player.carriedKg = round1(this.carried + def.weightKg * qty);
    bus.emit('inventory:added', { itemId, qty });
    bus.emit('inventory:weight-changed', { current: this.carried, capacity: this.capacity });
    if (this.isOverloaded) bus.emit('inventory:overloaded', { current: this.carried, capacity: this.capacity });
  }

  remove(itemId: string, qty = 1): boolean {
    // no stackable: cada unidad puede vivir en su propia entrada (qty:1) —
    // hay que juntar de todas, no solo de la primera que aparezca.
    const entries = this.state.inventory.filter((e) => e.itemId === itemId);
    if (entries.reduce((sum, e) => sum + e.qty, 0) < qty) return false;

    let remaining = qty;
    for (const e of entries) {
      if (remaining <= 0) break;
      const take = Math.min(e.qty, remaining);
      e.qty -= take;
      remaining -= take;
    }
    this.state.inventory = this.state.inventory.filter((e) => e.qty > 0);

    this.state.player.carriedKg = round1(Math.max(0, this.carried - registry.item(itemId).weightKg * qty));
    bus.emit('inventory:removed', { itemId, qty });
    bus.emit('inventory:weight-changed', { current: this.carried, capacity: this.capacity });
    return true;
  }

  has(itemId: string): boolean {
    return this.count(itemId) > 0;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
