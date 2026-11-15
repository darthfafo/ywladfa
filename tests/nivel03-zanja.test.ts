import { describe, expect, it } from 'vitest';
import balance from '@data/config/balance.json';
import { Game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { registry } from '@/core/Registry';
import type { TriggerDef } from '@/core/types';
import { ConstructionSystem, type ConstructionConfig } from '@/systems/ConstructionSystem';
import { DialogueSystem } from '@/systems/DialogueSystem';
import { TriggerSystem } from '@/systems/TriggerSystem';
import { chacraRects, valleyGrid } from '@/util/mapgen';

/**
 * El acto III del Nivel 3 — la zanja (1867 → marzo de 1868). Dos partes:
 * - el trazado, sobre el valle real: la chacra de los vecinos (en un bajo) queda
 *   entre el río y la tuya; el camino corto pasa pegado y la inunda, el largo no,
 *   y una compuerta de su lado la riega;
 * - el recorrido de datos: Madryn, la idea de Rachel, la cosecha (con zanja o con
 *   la red de contención del día 20) y el cierre del nivel.
 * Lo que hace el guion al cavar (src/levels/nivel03.ts) se repite a mano: los
 * flags n3_regada / n3_inundo_vecinos / n3_riega_vecinos y n3_regada_lista.
 */

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) },
});

const level = () => registry.level('nivel-03');
const cfg = (balance as any).nivel03.construccion as ConstructionConfig;
const col = (x: number, y0: number, y1: number): Array<[number, number]> => Array.from({ length: y0 - y1 + 1 }, (_, i) => [x, y0 - i]);

function trazar(path: Array<[number, number]>, compuertas: Array<[number, number]> = []) {
  const c = new ConstructionSystem(cfg, valleyGrid(level()));
  for (const [x, y] of path) expect(c.place('zanja', x, y).ok, `tramo ${x},${y}`).toBe(true);
  for (const [x, y] of compuertas) expect(c.place('compuerta', x, y).ok, `compuerta ${x},${y}`).toBe(true);
  return { c, w: c.water() };
}

describe('la zanja, sobre el valle', () => {
  it('la chacra de los vecinos queda entre el río y la tuya', () => {
    const r = chacraRects(level());
    const fam = r.find((c) => c.id === 'chacra_familia')!;
    const vec = r.find((c) => c.id === 'chacra_vecinos')!;
    expect(vec.y).toBeGreaterThan(fam.y + fam.h - 1); // más cerca del río
    expect(vec.x).toBeLessThanOrEqual(fam.x + fam.w - 1);
    expect(vec.x + vec.w - 1).toBeGreaterThanOrEqual(fam.x);
    expect(vec.bajo).toBeGreaterThan(0);
  });

  it('el camino corto, pegado a los vecinos, los inunda; el largo no; con compuerta de su lado, se riegan', () => {
    const corto = trazar([...col(19, 44, 37)], [[19, 37]]);
    const largo = trazar([...col(18, 44, 37), [19, 37]], [[19, 37]]);
    expect(corto.c.placed.filter((p) => p.kind === 'zanja').length).toBeLessThan(largo.c.placed.filter((p) => p.kind === 'zanja').length);
    // las dos riegan tu chacra (la compuerta al final)
    expect(corto.w.irrigated.has('chacra_familia')).toBe(true);
    expect(largo.w.irrigated.has('chacra_familia')).toBe(true);
    // pero la corta inunda a los vecinos
    expect(corto.w.flooded.has('chacra_vecinos')).toBe(true);
    expect(largo.w.flooded.has('chacra_vecinos')).toBe(false);
    // una compuerta de su lado: el agua es riego en vez de ruina
    const compartida = trazar([...col(19, 44, 37)], [[19, 37], [19, 42]]);
    expect(compartida.w.irrigated.has('chacra_vecinos')).toBe(true);
    expect(compartida.w.flooded.has('chacra_vecinos')).toBe(false);
  });

  it('sin compuerta el agua pasa al lado de tu chacra pero no entra', () => {
    const { w } = trazar([...col(18, 44, 37), [19, 37]]);
    expect(w.wet.size).toBeGreaterThan(0);
    expect(w.irrigated.has('chacra_familia')).toBe(false);
  });

  it('leer el terreno: wouldFlow anticipa si el tramo siguiente va a tener agua', () => {
    const c = new ConstructionSystem(cfg, valleyGrid(level()));
    // la toma: pegada al río, más baja que el agua
    expect(c.wouldFlow(18, 44)).toBe(true);
    c.place('zanja', 18, 44);
    expect(c.wouldFlow(18, 43)).toBe(true);
    // en lo alto de una lomada (el bulto del oeste) no llega
    const grid = valleyGrid(level());
    let alto: [number, number] | null = null;
    for (let y = 30; y < 44 && !alto; y++) for (let x = 0; x < 40 && !alto; x++) if (grid.cells[y * grid.w + x]!.h - cfg.zanjaDepth > grid.riverLevel) alto = [x, y];
    expect(alto).not.toBeNull();
    expect(c.wouldFlow(alto![0], alto![1])).toBe(false);
  });
});

interface Run {
  madryn?: 'empacar' | 'jenkins';
  labranza?: boolean;
}

class Acto3 {
  readonly g = new Game(createInitialState('nivel-03', 'Elin', 'f'));
  readonly triggers = new TriggerSystem(this.g, level().triggers as TriggerDef[]);
  readonly fired: string[] = [];
  readonly lines: string[] = [];
  next: string | undefined;

  constructor(private readonly run: Run = {}) {
    for (const t of level().triggers) if (t.id.startsWith('trig_n3_') && !/1867|madryn|rachel|zanja|inundo|regada|cosecha/.test(t.id)) this.triggers.markFired(t.id);
    this.g.flags.setMany({ n3_bandera: true, n3_acto1: true, n3_invierno: true, n3_toldo: true, n3_trato: 'justo', n3_acto2: true, n3_sin_labranza: !!run.labranza });
  }

  settle(): this {
    for (let guard = 0; guard < 50; guard++) {
      const list = this.triggers.check({ tileX: 20, tileY: 40, zoneId: 'z2_llano' });
      if (!list.length) break;
      const t = list[0]!;
      this.fired.push(t.id);
      const out = this.triggers.consume(t);
      if (out.next) this.next = out.next;
      if (out.dialogue) this.dialogue(out.dialogue);
      if (out.choice) {
        const c = registry.choiceScreen(out.choice);
        const pick = out.choice === 'ch_n3_madryn' ? (this.run.madryn ?? 'empacar') : c.options[0]!.id;
        this.g.applyEffects(c.options.find((o) => o.id === pick)!.effects);
      }
    }
    return this;
  }

  private dialogue(id: string): void {
    const d = new DialogueSystem(this.g);
    let line = d.start(id);
    for (let guard = 0; line && guard < 100; guard++) {
      this.lines.push(line.text);
      line = line.choices.length ? d.choose(line.choices[0]!.id) : d.next();
    }
    // Nivel03Script.finishRiego
    if (id === 'd_n3_regada') this.g.flags.set('n3_regada_lista', true);
  }
}

describe('Nivel 3, acto III: de Madryn a la cosecha', () => {
  it('1867: la colonia decide irse; ayudar a los Jenkins enseña a leer el terreno', () => {
    const j = new Acto3({ madryn: 'jenkins' }).settle();
    expect(j.fired.slice(0, 3)).toEqual(['trig_n3_1867', 'trig_n3_madryn', 'trig_n3_rachel']);
    expect(j.lines.join(' ')).toContain('Madryn');
    expect(j.lines.join(' ')).toContain('se termina el comercio');
    expect(j.g.flags.is('n3_lee_terreno')).toBe(true);
    expect(j.g.flags.is('n3_zanja')).toBe(true);
    expect(j.g.state.codex).toContain('cod_riego');
    const e = new Acto3({ madryn: 'empacar' }).settle();
    expect(e.g.flags.is('n3_lee_terreno')).toBe(false);
    // y la escena de Rachel cambia: «vos cavaste conmigo» solo si estuviste
    expect(j.lines.some((l) => l.includes('cavaste conmigo'))).toBe(true);
    expect(e.lines.some((l) => l.includes('cavaste conmigo'))).toBe(false);
  });

  it('con la chacra regada: cosecha espléndida y el nivel cierra hacia el siguiente', () => {
    const a = new Acto3().settle();
    expect(a.fired).not.toContain('trig_n3_cosecha');
    const antes = a.g.res.get('comida');
    a.g.flags.set('n3_regada', true);
    a.settle();
    expect(a.fired).toContain('trig_n3_regada');
    expect(a.fired).toContain('trig_n3_cosecha');
    expect(a.next).toBe('nivel-04');
    expect(a.g.flags.is('n3_cosecha')).toBe(true);
    expect(a.lines.join(' ')).toContain('cosecha espléndida');
    expect(a.g.res.get('comida')).toBeGreaterThan(antes);
  });

  it('inundar a los vecinos tiene escena y se paga en la cosecha; regarlos, también se nota', () => {
    const inunda = new Acto3().settle();
    inunda.g.flags.set('n3_inundo_vecinos', true);
    inunda.settle();
    expect(inunda.fired).toContain('trig_n3_inundo');
    inunda.g.flags.set('n3_regada', true);
    inunda.settle();
    expect(inunda.lines.join(' ')).toContain('pudrió la semilla');

    const riega = new Acto3().settle();
    riega.g.flags.setMany({ n3_riega_vecinos: true, n3_regada: true });
    riega.settle();
    expect(riega.lines.join(' ')).toContain('primera harina');
    expect(riega.g.res.get('comida')).toBeGreaterThan(inunda.g.res.get('comida'));
  });

  it('red de contención (R7): si al día 20 la zanja no llegó, la cosecha llega igual, más chica', () => {
    const a = new Acto3().settle();
    a.g.state.progress.day = 20;
    a.settle();
    expect(a.fired).toContain('trig_n3_cosecha');
    expect(a.lines.join(' ')).toContain('Los Jenkins comparten');
    expect(a.next).toBe('nivel-04');
  });

  it('sin herramientas de labranza, la escena del riego lo dice (las jornadas las pasa el guion)', () => {
    const a = new Acto3({ labranza: true }).settle();
    a.g.flags.set('n3_regada', true);
    a.settle();
    expect(a.lines.join(' ')).toContain('cuatro jornadas más');
    const b = new Acto3().settle();
    b.g.flags.set('n3_regada', true);
    b.settle();
    expect(b.lines.join(' ')).not.toContain('cuatro jornadas más');
  });
});
