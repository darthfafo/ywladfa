import { bus } from './EventBus';
import { createInitialState } from './GameState';
import { registry } from './Registry';
import type { DialogueEffect, GameState } from './types';

import { FlagSystem } from '@/systems/FlagSystem';
import { InventorySystem } from '@/systems/InventorySystem';
import { LanguageSystem } from '@/systems/LanguageSystem';
import { PartySystem } from '@/systems/PartySystem';
import { ResourceSystem } from '@/systems/ResourceSystem';
import { saveSystem } from '@/systems/SaveSystem';
import { TimeSystem } from '@/systems/TimeSystem';

/**
 * Raíz de composición: tiene el estado y todos los sistemas.
 * Las escenas leen de acá y llaman a los sistemas; NUNCA escriben `state` directo (regla R2).
 */
export class Game {
  state: GameState;
  time!: TimeSystem;
  res!: ResourceSystem;
  inv!: InventorySystem;
  party!: PartySystem;
  flags!: FlagSystem;
  lang!: LanguageSystem;

  constructor(state?: GameState) {
    this.state = state ?? createInitialState();
    this.wire();
  }

  private wire(): void {
    this.time = new TimeSystem(this.state);
    this.res = new ResourceSystem(this.state);
    this.inv = new InventorySystem(this.state);
    this.party = new PartySystem(this.state);
    this.flags = new FlagSystem(this.state);
    this.lang = new LanguageSystem(this.state);
  }

  replaceState(next: GameState): void {
    this.state = next;
    this.wire();
    this.migrateFlags();
  }

  /** Parche de compatibilidad para partidas guardadas de antes de un cambio de
   * regla — ej. p_playa_barranca empezó a pedir también n1_edwyn_deposito (no solo
   * los 8 cajones) para subir a la barranca. Una partida vieja que ya estaba
   * arriba, guardada con las reglas de antes, quedaba del lado equivocado de un
   * candado que no existía cuando lo cruzó: sin este parche no podía volver a
   * bajar a la playa nunca más. Si ya llegó a la barranca, el candado viejo (el
   * que sea) ya está satisfecho por definición. */
  private migrateFlags(): void {
    if (this.flags.is('n1_llego_barranca') && !this.flags.is('n1_edwyn_deposito')) {
      this.flags.set('n1_edwyn_deposito', true);
    }
  }

  get level() {
    return registry.level(this.state.progress.level);
  }

  /** Aplica un efecto de diálogo/elección. Único lugar donde se traduce data → sistemas. */
  applyEffect(e: DialogueEffect): void {
    if (e.setFlag) this.flags.setMany(e.setFlag);
    if (e.bond) this.party.bond(e.bond.npc, e.bond.delta);
    if (e.resource) this.res.change(e.resource.id, e.resource.delta, e.resource.reason ?? '');
    if (typeof e.morale === 'number') this.party.groupMorale(e.morale);
    if (e.partyStat) {
      if (typeof e.partyStat.health === 'number') this.party.health(e.partyStat.npc, e.partyStat.health);
      if (typeof e.partyStat.morale === 'number') this.party.memberMorale(e.partyStat.npc, e.partyStat.morale);
    }
    if (e.giveItem) this.inv.add(e.giveItem, 1);
    if (e.codex && !this.state.codex.includes(e.codex)) this.state.codex.push(e.codex);
    if (e.unlock) for (const u of e.unlock) this.flags.set(`unlocked_${u}`, true);
    if (e.objective) this.flags.set(`obj_activo_${e.objective}`, true);
    if (e.unlockHint) this.flags.set(`hint_${e.unlockHint}`, true);
  }

  applyEffects(list?: DialogueEffect[]): void {
    if (!list) return;
    for (const e of list) this.applyEffect(e);
  }

  /** Gasta turnos y, si se cerró una jornada, corre la noche. */
  spendTurns(cost: number): void {
    if (cost <= 0) return;
    const wasNight = this.state.progress.turn === 'noche';
    const days = this.time.advance(cost);
    if (days > 0 || wasNight) this.runNight();
  }

  private runNight(): void {
    const groupSize = registry.levelBalance(this.state.progress.level).groupSize as number;
    const fire = this.res.applyNight(groupSize);
    this.party.applyNight(fire);
    const fireText = fire === 'bigFire' ? 'El fuego es grande.' : fire === 'smallFire' ? 'El fuego es chico.' : 'No hubo fuego.';
    // autoguardado al cerrar jornada, un solo slot (docs/01-nivel-01.md checklist)
    saveSystem.save(this.state);
    bus.emit('ui:toast', { text: `${fireText} · Partida guardada.` });
    bus.emit('save:written', { slot: 0 });
  }
}

export const game = new Game();
