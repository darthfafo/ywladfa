import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState, stateForNextLevel } from '@/core/GameState';
import { registry } from '@/core/Registry';
import { MarchSystem, type MarchConfig, type MarchEvent, type MarchStart } from '@/systems/MarchSystem';

/**
 * El Nivel 2 como nivel del juego: se llega desde el cierre del Nivel 1, hereda
 * lo que pasó ahí, guarda cada noche, se puede retomar, y al llegar vuelca todo
 * a la partida (diario, Códice, balance de salida). Sin navegador: la escena
 * hace exactamente estas llamadas (MarchScene → Game.marchDecision / saveMarch /
 * finishMarch).
 */
// en Node no hay localStorage: uno en memoria, así el guardado de cada noche también se prueba
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

const cfg = registry.levelBalance('nivel-02').marcha as MarchConfig;
const track = registry.level('nivel-02').march!;

/** Lo que elige un jugador prolijo. */
const SAFE: Record<string, string> = {
  caballo: 'repartir',
  canadon: 'bajar',
  bifurcacion: 'costa',
  aguada: 'desviar',
  cerro: 'derecha',
  rastrillada: 'tomar',
  tormenta: 'refugio',
  cruce: 'costado',
  noche: 'repartir',
};

/** Un Nivel 1 terminado: con la carga elegida y algo de vínculo. */
function endOfLevel1(carga = ['harina', 'abrigo', 'libros', 'labranza']): Game {
  const g = new Game(createInitialState('nivel-01', 'Idris', 'm'));
  g.flags.set('n1_carga', carga);
  g.party.bond('npc_edwyn', 2);
  return g;
}

/** Arranca el Nivel 2 como lo hace «Seguir viaje» (TransitionScene.goNext). */
function startLevel2(g: Game): Game {
  return new Game(stateForNextLevel(g.state, 'nivel-02'));
}

/** Lo que MarchScene.inherited() saca de la partida. */
function inherited(g: Game): MarchStart {
  const taken = g.flags.get('n1_carga') as string[];
  return {
    agua: g.res.get('agua'),
    comida: g.res.get('comida'),
    mariHealth: g.party.member('npc_mari')?.health,
    morale: g.state.morale,
    left: registry.bultos.filter((b) => !taken.includes(b.id)).map((b) => b.id),
    bondHelper: g.state.party.find((p) => p.id === 'npc_edwyn' && p.bond >= 1)?.id ?? null,
  };
}

/** Juega la marcha como la escena: cada decisión a la partida, cada noche se guarda. */
function walk(g: Game, m: MarchSystem, pick: Record<string, string> = {}, untilDay = 99): MarchEvent[] {
  const choices = { ...SAFE, ...pick };
  const ev: MarchEvent[] = [];
  for (let t = 0; t < 40000 && !m.state.arrived && m.state.day < untilDay; t++) {
    ev.push(...m.update(0.1));
    while (m.state.blocked) {
      const o = m.state.blocked;
      const day = m.state.day;
      if (!choices[o.id]) throw new Error(`sin elección para ${o.id}`);
      const [opt, drop] = choices[o.id]!.split(':');
      ev.push(...m.choose(opt!, drop));
      if (m.state.blocked === o) throw new Error(`la elección ${choices[o.id]} no avanzó en ${o.id}`);
      const extra: Record<string, string> = {};
      if (drop) extra[`${o.id}_dejado`] = drop;
      if (m.state.variant[o.id]) extra[`${o.id}_variante`] = m.state.variant[o.id]!;
      g.marchDecision(o.type === 'night' ? `noche_${day}` : o.id, opt!, day, extra);
      if (o.type === 'night') g.saveMarch(m.snapshot());
    }
  }
  if (m.state.arrived) g.finishMarch(m.snapshot());
  return ev;
}

describe('Nivel 2 en el juego', () => {
  it('el Nivel 1 sigue en el 2: es una marcha, con la columna y lo que se trae', () => {
    const g1 = endOfLevel1();
    const agua = g1.res.get('agua');
    const g = startLevel2(g1);
    expect(g.isMarch).toBe(true);
    expect(g.state.progress.level).toBe('nivel-02');
    expect(g.res.get('agua')).toBe(agua);
    for (const id of registry.level('nivel-02').party!) expect(g.party.member(id)).toBeTruthy();
    expect(g.flags.get('n1_carga')).toEqual(['harina', 'abrigo', 'libros', 'labranza']);
  });

  it('de punta a punta: diario por jornada, Códice al llegar y balance de salida', () => {
    const g = startLevel2(endOfLevel1());
    const m = new MarchSystem(cfg, track, inherited(g));
    walk(g, m);
    expect(m.state.arrived).toBe(true);
    // lo de la marcha volvió a la partida
    expect(g.res.get('agua')).toBe(Math.round(m.state.agua));
    expect(g.party.member('npc_mari')!.health).toBe(Math.round(m.state.mariHealth));
    expect(g.state.progress.day).toBe(m.state.day);
    expect(g.flags.get('n2_llegada')).toBe(true);
    expect(g.state.march).toBeUndefined();
    for (const c of registry.level('nivel-02').codexOnArrive!) expect(g.state.codex).toContain(c);
    // el diario: una entrada por jornada, la llegada en la última
    const entries = g.journal.entries().filter((e) => e.level === 'nivel-02');
    expect(entries.map((e) => e.day)).toEqual(Array.from({ length: m.state.day }, (_, i) => i + 1));
    expect(entries.at(-1)!.lines.some((l) => l.includes('Caer Antur'))).toBe(true);
    expect(entries.flatMap((e) => e.lines).some((l) => l.includes('toldos'))).toBe(true);
    // el balance de salida sale del nivel 2
    expect(g.exitGrade().map((r) => r.id)).toEqual(['agua', 'comida', 'mariHealth', 'morale']);
  });

  it('se guarda cada noche y se retoma igual que si no se hubiera cortado', () => {
    const g = startLevel2(endOfLevel1());
    const corrido = new MarchSystem(cfg, track, inherited(g));
    walk(startLevel2(endOfLevel1()), corrido);

    const m = new MarchSystem(cfg, track, inherited(g));
    walk(g, m, {}, 2); // hasta la primera noche
    expect(g.state.march?.day).toBe(2);
    expect(g.state.progress.day).toBe(2);
    // «Continuar»: la partida guardada, una marcha nueva desde el snapshot
    const saved = new Game(JSON.parse(JSON.stringify(g.state)));
    const retomada = new MarchSystem(cfg, track, {}, saved.state.march);
    walk(saved, retomada);
    expect(retomada.state.day).toBe(corrido.state.day);
    expect(retomada.state.turn).toBe(corrido.state.turn);
    expect(retomada.state.agua).toBeCloseTo(corrido.state.agua, 5);
    expect(saved.journal.entries().filter((e) => e.level === 'nivel-02')).toHaveLength(corrido.state.day);
  });

  it('lo que quedó en Punta Cuevas pesa: sin abrigo enferma, sin libros baja la moral', () => {
    const run = (carga: string[]) => {
      const g = startLevel2(endOfLevel1(carga));
      const m = new MarchSystem(cfg, track, inherited(g));
      walk(g, m);
      return m.state;
    };
    const todo = registry.bultos.map((b) => b.id);
    const conTodo = run(todo);
    expect(run(todo.filter((b) => b !== 'abrigo')).mariHealth).toBeLessThan(conTodo.mariHealth);
    expect(run(todo.filter((b) => b !== 'libros')).morale).toBeLessThan(conTodo.morale);
  });

  it('sin comida, las noches se pasan con hambre y tu madre lo paga (y se llega igual, R7)', () => {
    const g = startLevel2(endOfLevel1());
    const m = new MarchSystem(cfg, track, { ...inherited(g), comida: 0 });
    const health = m.state.mariHealth;
    walk(g, m);
    expect(m.state.arrived).toBe(true);
    expect(m.state.hungryNights).toBeGreaterThan(0);
    expect(m.state.mariHealth).toBeLessThan(health);
    expect(g.flags.get('n2_noches_hambre')).toBe(m.state.hungryNights);
  });

  it('con vínculo, alguien sale a buscarte cuando te perdés y la vuelta es más corta', () => {
    const perdido = (helper: string | null) => {
      const m = new MarchSystem(cfg, track, { bondHelper: helper });
      const ev = walk(startLevel2(endOfLevel1()), m, { bifurcacion: 'adentro', cerro: 'izquierda' });
      const skip = ev.find((e) => e.type === 'skip' && e.kind === 'lost') as Extract<MarchEvent, { type: 'skip' }>;
      return skip;
    };
    const solo = perdido(null);
    const acompañado = perdido('npc_edwyn');
    expect(acompañado.helper).toBe('npc_edwyn');
    expect(acompañado.tiles).toBeLessThan(solo.tiles);
  });

  it('lo que se decide vuelve a la partida: el consejo seguido, lo que quedó en la estepa, cómo llega tu madre', () => {
    const g = startLevel2(endOfLevel1(['harina', 'semilla', 'abrigo', 'libros']));
    const edwyn = g.party.member('npc_edwyn')!.bond;
    const m = new MarchSystem(cfg, track, { ...inherited(g), mariHealth: 30 });
    walk(g, m, { caballo: 'dejar:semilla', bifurcacion: 'costa' });
    // seguir a Edwyn por la costa suma vínculo con él (pasa al Nivel 3)
    expect(g.party.member('npc_edwyn')!.bond).toBe(edwyn + 1);
    // la semilla quedó en la estepa: flag para el Nivel 3 y línea en el diario
    expect(g.flags.get('n2_bultos_dejados')).toEqual(['semilla']);
    const lines = g.journal.entries().filter((e) => e.level === 'nivel-02').flatMap((e) => e.lines);
    expect(lines.some((l) => l.includes('semilla de trigo'))).toBe(true);
    // con la salud baja, llega enferma: queda dicho
    expect(g.flags.get('n2_mari_enferma')).toBe(true);
    expect(lines.some((l) => l.includes('fiebre'))).toBe(true);
  });

  it('la moral baja queda en el diario el día que pasó', () => {
    const g = startLevel2(endOfLevel1());
    const m = new MarchSystem(cfg, track, { ...inherited(g), morale: 20 });
    // la escena anota el día en que el grupo se quedó sin ánimo (MarchScene → lowMorale)
    for (let i = 0; i < 50 && !m.state.lowMoraleSaid; i++) for (const e of m.update(0.1)) if (e.type === 'lowMorale') g.marchDecision('moral_baja', 'si', m.state.day);
    walk(g, m);
    const lines = g.journal.entries().filter((e) => e.level === 'nivel-02').flatMap((e) => e.lines);
    expect(lines.some((l) => l.includes('nadie habló'))).toBe(true);
  });
});
