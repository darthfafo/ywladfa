import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { registry } from '@/core/Registry';
import type { TriggerDef } from '@/core/types';
import { DialogueSystem } from '@/systems/DialogueSystem';
import { TriggerSystem } from '@/systems/TriggerSystem';

/**
 * El acto II del Nivel 3 — el invierno de 1866 — con los sistemas reales (sin
 * Phaser): los triggers, diálogos y decisiones de data/*\/nivel-03.json, desde el
 * cierre del acto I. Verifica que cada camino llega al cierre y que ninguna
 * decisión es de adorno (lo que quedó atrás, los víveres guardados, el pan, el
 * trato) — docs/10-plan-nivel-03.md §4.3.
 *
 * Lo que hace el guion (src/levels/nivel03.ts, importa Phaser) se repite acá a
 * mano: los flags de lo que quedó atrás al entrar y la comida del invierno al
 * cerrarse d_n3_invierno.
 */

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) },
});

const level = () => registry.level('nivel-03');

interface Run {
  sin?: { harina?: boolean; abrigo?: boolean };
  viveres?: 'repartir' | 'guardar';
  picks?: Record<string, string>;
}

class Winter {
  readonly g = new Game(createInitialState('nivel-03', 'Elin', 'f'));
  readonly triggers = new TriggerSystem(this.g, level().triggers as TriggerDef[]);
  readonly fired: string[] = [];
  /** lo que se ofreció en cada pantalla de decisión (las opciones con la condición cumplida) */
  readonly offered: Record<string, string[]> = {};
  readonly lines: string[] = [];
  /** la comida al terminar cada trigger (al final, las noches la gastan toda) */
  readonly comidaTras: Record<string, number> = {};

  constructor(private readonly run: Run = {}) {
    // el acto I ya pasó: todo lo que lo cierra
    for (const t of level().triggers) if (/^trig_n3_(bandera|tut_rancho|rancho_hecho|viveres|viveres_reparto|crecida|rehacer|acto1_fin)$/.test(t.id)) this.triggers.markFired(t.id);
    this.g.flags.setMany({
      n3_bandera: true,
      n3_crecida: true,
      n3_rehacer: 'ayudar',
      n3_acto1: true,
      n3_viveres: run.viveres ?? 'repartir',
      ...(run.viveres === 'guardar' ? { n3_reserva_comida: 10 } : {}),
      // Nivel03Script.spawn
      n3_sin_harina: !!run.sin?.harina,
      n3_sin_abrigo: !!run.sin?.abrigo,
    });
  }

  settle(): this {
    for (let guard = 0; guard < 50; guard++) {
      const list = this.triggers.check({ tileX: 52, tileY: 31, zoneId: 'z1_fuerte' });
      if (!list.length) break;
      this.fire(list[0]!);
    }
    return this;
  }

  /** Como WorldScene.talkTo. */
  talkTo(npcId: string): this {
    const t = level().triggers.find((tr) => {
      if (!tr.action?.dialogue) return false;
      if (registry.dialogue(tr.action.dialogue).npc !== npcId) return false;
      if (tr.once && this.triggers.hasFired(tr.id)) return false;
      return this.g.flags.eval(tr.requires);
    }) as TriggerDef | undefined;
    expect(t, `nada que hablar con ${npcId}`).toBeTruthy();
    this.fire(t!);
    return this.settle();
  }

  private fire(t: TriggerDef): void {
    this.fired.push(t.id);
    const out = this.triggers.consume(t);
    if (out.dialogue) this.dialogue(out.dialogue);
    if (out.choice) {
      const c = registry.choiceScreen(out.choice);
      const opts = c.options.filter((o) => this.g.flags.eval(o.condition));
      this.offered[out.choice] = opts.map((o) => o.id);
      const pick = this.run.picks?.[out.choice] ?? opts[0]!.id;
      const o = opts.find((x) => x.id === pick);
      expect(o, `${out.choice}: «${pick}» no se ofrece (${opts.map((x) => x.id).join(', ')})`).toBeTruthy();
      this.g.applyEffects(o!.effects);
    }
    this.comidaTras[t.id] = this.g.res.get('comida');
  }

  private dialogue(id: string): void {
    const d = new DialogueSystem(this.g);
    let line = d.start(id);
    for (let guard = 0; line && guard < 100; guard++) {
      this.lines.push(line.text);
      if (line.choices.length) {
        const pick = this.run.picks?.[id];
        line = d.choose(line.choices.find((c) => c.id === pick)?.id ?? line.choices[0]!.id);
      } else line = d.next();
    }
    // Nivel03Script.onDialogueEnd: la comida del invierno
    if (id === 'd_n3_invierno') {
      const base = (registry.levelBalance('nivel-03').invierno as { comida: number }).comida;
      const reserva = Number(this.g.flags.get('n3_reserva_comida') ?? 0);
      this.g.res.change('comida', base + reserva - this.g.res.get('comida'), 'el invierno');
    }
  }

  /** De punta a punta: el invierno, el toldo, la manta (hablando con el del toldo) y lo que siga. */
  play(): this {
    this.settle();
    return this.talkTo('npc_toldo');
  }

  get comida(): number {
    return this.g.res.get('comida');
  }
  get mari(): number {
    return this.g.state.party.find((m) => m.id === 'npc_mari')!.health;
  }
}

describe('Nivel 3, acto II: el invierno de 1866', () => {
  it('con toda la carga: el toldo, la manta y el cierre, sin Gwilym enfermo ni recaída', () => {
    const w = new Winter().play();
    expect(w.fired.slice(0, 3)).toEqual(['trig_n3_invierno', 'trig_n3_toldo', 'trig_n3_pan']);
    expect(w.fired).toContain('trig_n3_manta');
    expect(w.fired).not.toContain('trig_n3_gwilym_aviso');
    expect(w.fired).not.toContain('trig_n3_recaida');
    expect(w.g.flags.is('n3_acto2')).toBe(true);
    // el cierre: el campamento grande de la otra orilla (documentado)
    expect(w.lines.join(' ')).toContain('ochenta o noventa');
    // la ficha del Códice se abre con el trato
    expect(w.g.state.codex).toContain('cod_toldo_1866');
  });

  it('el del toldo habla aonikenk: para el personaje, bloques', () => {
    const w = new Winter().play();
    const d = registry.dialogue('d_n3_manta');
    const aon = Object.values(d.nodes).filter((n) => n.lang === 'aon');
    expect(aon.length).toBeGreaterThan(0);
    for (const n of aon) expect(w.g.lang.render(n.text!, 'aon')).toMatch(/^[▓\s¿?.,]+$/);
  });

  it('sin harina, sin guardar, con el pan llevado y sin trato: Gwilym muere, y el entierro tiene el coro', () => {
    const w = new Winter({ sin: { harina: true }, picks: { ch_n3_pan: 'llevar', d_n3_manta: 'c_nada' } }).play();
    expect(w.fired).toContain('trig_n3_gwilym_aviso');
    // no hay carne ni comida: lo único que se ofrece es «no hay nada»
    expect(w.offered.ch_n3_gwilym).toEqual(['nada']);
    expect(w.g.flags.is('n3_gwilym_murio')).toBe(true);
    expect(w.g.flags.is('n3_coro')).toBe(true);
    expect(w.g.flags.is('n3_acto2')).toBe(true);
    // Gwilym ya no está en el mapa
    const g = level().spawns.npcs.find((n) => n.id === 'npc_gwilym')!;
    expect(w.g.flags.eval(g.hiddenWhile)).toBe(true);
  });

  it('sin harina, con el trato justo: la carne del trato lo salva', () => {
    const w = new Winter({ sin: { harina: true }, picks: { d_n3_manta: 'c_justo', ch_n3_gwilym: 'carne' } }).play();
    expect(w.offered.ch_n3_gwilym).toContain('carne');
    expect(w.g.flags.is('n3_gwilym_fin')).toBe(true);
    expect(w.g.flags.is('n3_gwilym_murio')).toBe(false);
    expect(w.g.flags.is('n3_coro')).toBe(false);
    // en cama mientras estuvo enfermo; de nuevo en el mapa, curado
    const g = level().spawns.npcs.find((n) => n.id === 'npc_gwilym')!;
    expect(w.g.flags.eval(g.hiddenWhile)).toBe(false);
  });

  it('los víveres guardados en septiembre alcanzan para darle de lo propio, aun sin trato', () => {
    const w = new Winter({ sin: { harina: true }, viveres: 'guardar', picks: { d_n3_manta: 'c_nada', ch_n3_gwilym: 'deposito' } }).play();
    expect(w.offered.ch_n3_gwilym).toEqual(['deposito', 'guardar']);
    expect(w.g.flags.is('n3_gwilym_murio')).toBe(false);
    // y sin guardar, la misma partida no tiene con qué
    const r = new Winter({ sin: { harina: true }, viveres: 'repartir', picks: { d_n3_manta: 'c_nada' } }).play();
    expect(r.offered.ch_n3_gwilym).toEqual(['nada']);
  });

  it('sin abrigo: tu madre recae; los cueros del trato solo están si hubo trato', () => {
    const conTrato = new Winter({ sin: { abrigo: true }, picks: { d_n3_manta: 'c_justo', ch_n3_cuidar: 'cueros' } }).play();
    expect(conTrato.fired).toContain('trig_n3_recaida');
    expect(conTrato.offered.ch_n3_cuidar).toContain('cueros');
    const sinTrato = new Winter({ sin: { abrigo: true }, picks: { d_n3_manta: 'c_nada', ch_n3_cuidar: 'trabajar' } }).play();
    expect(sinTrato.offered.ch_n3_cuidar).not.toContain('cueros');
    expect(conTrato.mari).toBeGreaterThan(sinTrato.mari);
    expect(sinTrato.g.flags.is('n3_acto2')).toBe(true);
  });

  it('ninguna decisión de adorno: el pan y el trato cambian lo que queda y quién vuelve', () => {
    const base = { picks: { d_n3_manta: 'c_justo' } };
    const pan = new Winter({ picks: { ...base.picks, ch_n3_pan: 'llevar' } }).play();
    const sinPan = new Winter({ picks: { ...base.picks, ch_n3_pan: 'esperar' } }).play();
    // el pan se recuerda sobre la manta: la pierna de regalo compensa lo que se dio
    expect(pan.lines.join(' ')).toContain('Te reconoce');
    expect(sinPan.lines.join(' ')).not.toContain('Te reconoce');
    expect(pan.comidaTras.trig_n3_manta).toBeGreaterThan(sinPan.comidaTras.trig_n3_manta!);
    // pero si no hay trato, el pan se fue y no volvió nada
    const panNada = new Winter({ picks: { ch_n3_pan: 'llevar', d_n3_manta: 'c_nada' } }).play();
    const esperaNada = new Winter({ picks: { ch_n3_pan: 'esperar', d_n3_manta: 'c_nada' } }).play();
    expect(panNada.comidaTras.trig_n3_manta).toBeLessThan(esperaNada.comidaTras.trig_n3_manta!);

    const justo = new Winter({ picks: { d_n3_manta: 'c_justo' } }).play();
    const ventaja = new Winter({ picks: { d_n3_manta: 'c_ventaja' } }).play();
    const nada = new Winter({ picks: { d_n3_manta: 'c_nada' } }).play();
    // con ventaja queda más comida, pero el del toldo no vuelve
    expect(ventaja.comidaTras.trig_n3_manta).toBeGreaterThan(justo.comidaTras.trig_n3_manta!);
    expect(justo.g.flags.is('n3_vuelven')).toBe(true);
    expect(ventaja.g.flags.is('n3_vuelven')).toBe(false);
    expect(nada.comidaTras.trig_n3_manta).toBeLessThan(justo.comidaTras.trig_n3_manta!);
    expect(new Set([justo, ventaja, nada].map((w) => w.lines.find((l) => l.startsWith('El del toldo') || l.startsWith('Una mañana'))))).toHaveProperty('size', 3);
  });

  it('al cerrar el invierno, el del toldo se va si el trato no fue justo; si fue justo, se queda (volvió con los suyos)', () => {
    const toldo = level().spawns.npcs.find((n) => n.id === 'npc_toldo')!;
    for (const [trato, seVa] of [['c_justo', false], ['c_ventaja', true], ['c_nada', true]] as const) {
      const w = new Winter({ picks: { d_n3_manta: trato } }).play();
      expect(w.g.flags.is('n3_acto2'), trato).toBe(true);
      expect(w.g.flags.eval(toldo.hiddenWhile), trato).toBe(seVa);
    }
    // y lejos del campamento: hay que ir a buscarlo
    const camp = level().spawns.campamento!;
    expect(Math.hypot(toldo.x - camp.x, toldo.y - camp.y)).toBeGreaterThan(20);
  });
});

