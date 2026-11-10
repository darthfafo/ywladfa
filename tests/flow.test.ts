import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { registry } from '@/core/Registry';
import type { TriggerDef } from '@/core/types';
import { DialogueSystem } from '@/systems/DialogueSystem';
import { TriggerSystem } from '@/systems/TriggerSystem';

/**
 * Recorrido completo del Nivel 1 con los sistemas reales (sin Phaser): el mismo
 * motor de triggers, diálogos, decisiones y noches que usa el juego, y las mismas
 * reglas de WorldScene (triggers por zona/rect, los `manual` solo hablando o
 * tocando algo, el que dispara primero gana). Si un cambio de datos deja un
 * paso inalcanzable, salta un turno que el jugador tenía que jugar (como pasó
 * con trig_apuntalar, que se comía la tarde del J1) o rompe el cierre, falla acá.
 *
 * Fuera de esto (lo prueba el juego, no este test): colisiones, el camino físico
 * entre zonas y los pasajes cerrados.
 */

// sin navegador no hay localStorage: el autoguardado de cada noche lo necesita
const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) },
});

const level = () => registry.level('nivel-01');

class Playthrough {
  readonly g = new Game(createInitialState('nivel-01', 'Idris', 'm'));
  readonly triggers = new TriggerSystem(this.g, level().triggers as TriggerDef[]);
  readonly fired: string[] = [];
  /** turnos en los que el jugador tuvo el control (día-turno) */
  readonly played = new Set<string>();
  private pos: { tileX: number; tileY: number; zoneId: string; enteredZone?: boolean } = { tileX: 27, tileY: 104, zoneId: 'z1_playa', enteredZone: true };

  /** Pararse en una zona (en un tile dado, o en el centro de su rect). */
  goTo(zoneId: string, tile?: [number, number]): this {
    const z = level().zones.find((x) => x.id === zoneId)!;
    const [x, y, w, h] = z.rect;
    const [tx, ty] = tile ?? [x + Math.floor(w / 2), y + Math.floor(h / 2)];
    this.pos = { tileX: tx, tileY: ty, zoneId, enteredZone: zoneId !== this.pos.zoneId };
    this.g.state.progress.zone = zoneId;
    return this.settle();
  }

  /** Pararse adentro del rect de un trigger. */
  stepOn(triggerId: string): this {
    const t = level().triggers.find((x) => x.id === triggerId)! as TriggerDef;
    const [x, y] = t.rect!;
    return this.goTo(t.zone!, [x + 1, y + 1]);
  }

  /** Como WorldScene.talkTo: el primer trigger con diálogo de ese NPC que se pueda disparar. */
  talkTo(npcId: string, choice?: string): this {
    const t = level().triggers.find((tr) => {
      const a = tr.action;
      if (!a?.dialogue) return false;
      const matches = registry.dialogue(a.dialogue).npc === npcId || a.dialogue.includes(npcId.replace(/^npc_/, ''));
      if (!matches) return false;
      if (tr.once && this.triggers.hasFired(tr.id)) return false;
      return this.g.flags.eval(tr.requires);
    }) as TriggerDef | undefined;
    if (t) this.run(t, choice);
    return this.settle();
  }

  /** Disparar un trigger manual por id (tocar la cueva, etc.), como WorldScene.runTriggerById. */
  use(triggerId: string, choice?: string): this {
    const t = level().triggers.find((x) => x.id === triggerId) as TriggerDef;
    expect(this.triggers.hasFired(t.id), `${triggerId} ya había disparado`).toBe(false);
    expect(this.g.flags.eval(t.requires), `${triggerId}: requires sin cumplir (${t.requires})`).toBe(true);
    this.run(t, choice);
    return this.settle();
  }

  /** Bajar los ocho cajones a la pila (WorldScene: flags.inc al dejarlos). */
  carryCrates(): this {
    this.g.flags.inc('n1_cajones_bajados', 8);
    return this.settle();
  }

  /** Elegir la carga en CargoScene (lo que hace finish()). */
  pickCargo(ids: string[]): this {
    for (const b of registry.bultos) {
      if (!ids.includes(b.id)) continue;
      if (b.ifTaken) this.g.flags.set(b.ifTaken, true);
    }
    this.g.flags.set('n1_carga', ids);
    return this.settle();
  }

  private choiceFor: Record<string, string> = {};
  /** Qué opción tomar en una pantalla de decisión o en un diálogo con opciones. */
  choose(id: string, optionId: string): this {
    this.choiceFor[id] = optionId;
    return this;
  }

  /** Corre los triggers automáticos hasta que no quede ninguno (como checkTriggers en bucle). */
  settle(): this {
    for (let guard = 0; guard < 50; guard++) {
      const list = this.triggers.check(this.pos);
      // como en el juego: el ambiente de zona dispara una sola vez al entrar
      this.pos.enteredZone = false;
      if (!list.length) break;
      this.run(list[0]!);
    }
    this.played.add(`${this.g.state.progress.day}-${this.g.state.progress.turn}`);
    return this;
  }

  private run(t: TriggerDef, choice?: string): void {
    this.fired.push(t.id);
    const out = this.triggers.consume(t);
    if (out.dialogue) this.playDialogue(out.dialogue, choice);
    if (out.choice) {
      const c = registry.choiceScreen(out.choice);
      const pick = this.choiceFor[out.choice] ?? c.options[0]!.id;
      const o = c.options.find((x) => x.id === pick)!;
      expect(o, `opción ${pick} en ${out.choice}`).toBeTruthy();
      this.g.applyEffects(o.effects);
    }
  }

  private playDialogue(id: string, choice?: string): void {
    const d = new DialogueSystem(this.g);
    let line = d.start(id);
    for (let guard = 0; line && guard < 100; guard++) {
      if (line.choices.length) {
        const pick = choice ?? this.choiceFor[id] ?? line.choices[0]!.id;
        line = d.choose(line.choices.find((c) => c.id === pick)?.id ?? line.choices[0]!.id);
      } else line = d.next();
    }
  }

  get when(): string {
    return `${this.g.state.progress.day}-${this.g.state.progress.turn}`;
  }
}

describe('recorrido completo del Nivel 1', () => {
  it('se juega de punta a punta sin saltear turnos ni trabarse', () => {
    const p = new Playthrough();
    p.choose('ch_n1_cueva', 'cueva_fogon').choose('ch_n1_tareas', 't_agua');

    // ---- Jornada 1
    p.settle();
    expect(p.fired.slice(0, 2)).toEqual(['trig_desembarco', 'trig_pepperell_cajones']);
    expect(p.when).toBe('1-amanecer');
    p.carryCrates();
    expect(p.fired).toContain('trig_edwyn_deposito');
    expect(p.when).toBe('1-manana');

    p.goTo('z2_barranca', [30, 60]);
    expect(p.fired).toContain('trig_subida_barranca');
    expect(p.when).toBe('1-manana');

    p.stepOn('trig_eleccion_cueva');
    expect(p.g.flags.get('n1_cueva_elegida')).toBe('cueva_fogon');
    // la tarde del J1 tiene que poder jugarse (antes trig_apuntalar se la comía)
    expect(p.when).toBe('1-tarde');
    p.talkTo('npc_lewis');
    expect(p.when).toBe('1-tarde');

    p.use('trig_apuntalar');
    // apuntalar trae la noche y, en el campamento, el fogón (que cierra la jornada)
    expect(p.fired).toContain('trig_fogon_j1');
    // al despertar en el campamento encadenan el amanecer y el reparto de
    // tareas (que gasta el amanecer: así está diseñado el J2)

    // ---- Jornada 2
    expect(p.fired).toContain('trig_amanecer_j2');
    expect(p.fired).toContain('trig_reparto_tareas');
    expect(p.g.flags.get('n1_tarea')).toBe('agua');
    expect(p.when).toBe('2-manana');

    p.stepOn('trig_vigia_mimosa');
    expect(p.fired).toContain('trig_vigia_mimosa');
    expect(p.when).toBe('2-tarde');

    p.goTo('z2_barranca', [30, 60]);
    expect(p.fired).toContain('trig_dafydd_perdido');
    expect(p.g.flags.is('n1_dafydd_perdido')).toBe(true);

    p.stepOn('trig_manantial');
    expect(p.g.flags.is('n1_encontro_manantial')).toBe(true);
    expect(p.when).toBe('2-noche');

    p.goTo('z2_barranca', [30, 60]);
    expect(p.fired).toContain('trig_fogon_j2');

    // ---- Jornada 3
    expect(p.fired).toContain('trig_anuncio_marcha');
    expect(p.fired).toContain('trig_pantalla_carga');
    p.pickCargo(['harina', 'labranza', 'semilla', 'abrigo', 'hierro']);
    expect(p.fired).toContain('trig_reacciones_carga');

    p.stepOn('trig_berwyn_libreta');
    expect(p.fired).toContain('trig_berwyn_libreta');

    p.stepOn('trig_punta_final');
    expect(p.fired).toContain('trig_punta_final');
    expect(p.g.state.progress.day).toBe(3);

    // el diario se escribió solo, con lo que pasó de verdad
    const diario = p.g.journal.entries();
    expect(diario.map((e) => e.day)).toEqual([1, 2, 3]);
    const txt = diario.flatMap((e) => e.lines).join(' ');
    expect(txt).toContain('Elegimos cueva: la del fogón.');
    expect(txt).toContain('Encontramos agua en el cañadón');
    expect(txt).toMatch(/Dejamos .+ en la playa/);
    expect(txt).not.toMatch(/\{\w+\}/); // sin marcadores sin reemplazar
    // y las dos noches quedaron guardadas en el estado
    expect(p.g.state.journal.map((e) => e.day)).toEqual([1, 2]);
    // fichas del Códice de este nivel
    for (const id of ['cod_wladfa', 'cod_punta_cuevas', 'cod_agua_patagonia', 'cod_mimosa']) expect(p.g.state.codex).toContain(id);

    // el jugador tuvo el control en todos los turnos de día de las tres jornadas
    for (const t of ['1-amanecer', '1-manana', '1-tarde', '2-manana', '2-tarde', '3-manana']) {
      expect(p.played, `turno ${t} sin jugar`).toContain(t);
    }
  });

  /** hasta la mañana del J2 con la tarea elegida, ya en el campamento */
  const toJ2Morning = (task: string): Playthrough => {
    const p = new Playthrough().choose('ch_n1_tareas', task);
    p.settle().carryCrates().goTo('z2_barranca', [30, 60]).stepOn('trig_eleccion_cueva').use('trig_apuntalar');
    p.goTo('z2_barranca', [31, 60]);
    expect(p.when).toBe('2-manana');
    return p;
  };

  it('la mañana del J2 no pasa sola: Lewis explica la tarea sin gastar turno', () => {
    const p = toJ2Morning('t_lena');
    expect(p.fired).toContain('trig_lewis_j2_manana');
    expect(p.when).toBe('2-manana');
    // subir a mirar el golfo con otra tarea tampoco la cierra
    p.stepOn('trig_vigia_mimosa');
    expect(p.fired).toContain('trig_vigia_mimosa');
    expect(p.when).toBe('2-manana');
  });

  it('tarea de leña: termina con tres haces en el fogón', () => {
    const p = toJ2Morning('t_lena');
    p.g.flags.inc('n1_lena_traida_j2', 2);
    p.settle();
    expect(p.when).toBe('2-manana');
    p.g.flags.inc('n1_lena_traida_j2', 1);
    p.settle();
    expect(p.fired).toContain('trig_tarea_lena');
    expect(p.when).toBe('2-tarde');
  });

  it('tarea de cuevas: termina arreglando la propia cueva', () => {
    const p = toJ2Morning('t_cuevas');
    p.use('trig_tarea_cuevas');
    expect(p.when).toBe('2-tarde');
  });

  it('si no encuentra el manantial, pedir ayuda a Lewis cierra la tarde (fracaso suave, sin trabarse)', () => {
    const p = toJ2Morning('t_agua');
    p.stepOn('trig_vigia_mimosa');
    expect(p.when).toBe('2-tarde');
    p.goTo('z2_barranca', [30, 60]);
    expect(p.g.flags.is('n1_dafydd_perdido')).toBe(true);
    const agua = p.g.res.get('agua');
    // seguir buscando no cierra nada
    p.talkTo('npc_lewis', 'pa_seguir');
    expect(p.when).toBe('2-tarde');
    p.talkTo('npc_lewis', 'pa_ayuda');
    expect(p.fired).toContain('trig_manantial_tardio');
    expect(p.g.flags.is('n1_agua_tardia')).toBe(true);
    expect(p.g.res.get('agua')).toBeGreaterThan(agua);
    // ya no se puede encontrar el manantial después
    expect(p.g.flags.eval(registry.level('nivel-01').triggers.find((t) => t.id === 'trig_manantial')!.requires)).toBe(false);
    // la noche llega y el fogón del J2 dispara: el nivel sigue
    p.goTo('z2_barranca', [30, 60]);
    expect(p.fired).toContain('trig_fogon_j2');
    expect(p.g.state.progress.day).toBe(3);
  });

  it('tarea de agua: termina subiendo al vigía', () => {
    const p = toJ2Morning('t_agua');
    p.stepOn('trig_vigia_mimosa');
    expect(p.fired).toContain('trig_tarea_agua');
    expect(p.when).toBe('2-tarde');
  });
});
