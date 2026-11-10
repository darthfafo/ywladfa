import { bus } from './EventBus';
import { conditionContext, createInitialState } from './GameState';
import { registry } from './Registry';
import { resolvePath } from './conditions';
import type { DialogueEffect, ExitGradeRow, GameState } from './types';

import { FlagSystem } from '@/systems/FlagSystem';
import { InventorySystem } from '@/systems/InventorySystem';
import { JournalSystem } from '@/systems/JournalSystem';
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
  journal!: JournalSystem;

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
    this.journal = new JournalSystem(this);
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

  /** Qué hay que hacer ahora, en una línea (data: level.goals). Para el menú de pausa. */
  currentGoal(): string {
    for (const g of this.level.goals ?? []) if (!g.requires || this.flags.eval(g.requires)) return g.text;
    return '';
  }

  /** Balance de salida del nivel (data: level.exit.computeGrade): con qué se va el grupo. */
  exitGrade(): ExitGradeRow[] {
    const ctx = conditionContext(this.state);
    return Object.entries(this.level.exit?.computeGrade ?? {}).map(([id, g]) => {
      const value = Math.round(Number(resolvePath(g.field, ctx) ?? 0));
      return { id, value, grade: value >= g.good ? 'good' : value >= g.ok ? 'ok' : 'bad' };
    });
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
    if (e.codex && !this.state.codex.includes(e.codex)) {
      this.state.codex.push(e.codex);
      const c = registry.codex.find((x) => x.id === e.codex);
      if (c) bus.emit('codex:unlocked', { id: c.id, title: c.title });
    }
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
    const closingDay = this.state.progress.day;
    const days = this.time.advance(cost);
    if (days > 0 || wasNight) {
      // el diario de la jornada que termina se escribe solo, antes del autoguardado
      this.journal.write(closingDay);
      this.runNight();
    }
  }

  private runNight(): void {
    const groupSize = registry.levelBalance(this.state.progress.level).groupSize as number;
    const fire = this.res.applyNight(groupSize);
    // no es un flag de nivel (por eso el prefijo "_", no "n1_"): CampScene y las
    // ramas de d_n1_fogon_j2 necesitan saber qué fuego se prendió, y mirar la leña
    // que queda no sirve — ResourceSystem.applyNight() ya la descontó ANTES de
    // que nada de esto se lea, así que "leña actual >= 2" casi nunca coincide con
    // el fuego que en realidad se prendió esa noche.
    this.flags.set('_lastFire', fire);
    this.party.applyNight(fire);
    // se lee a la mañana siguiente, con el fuego ya apagado: en pasado
    const fireText = fire === 'bigFire' ? 'Anoche el fuego fue grande.' : fire === 'smallFire' ? 'Anoche el fuego fue chico.' : 'Anoche no hubo fuego.';
    // autoguardado al cerrar jornada, un solo slot (docs/01-nivel-01.md checklist)
    saveSystem.save(this.state);
    bus.emit('ui:toast', { text: `${fireText} · Partida guardada.` });
    bus.emit('save:written', { slot: 0 });
  }
}

export const game = new Game();
