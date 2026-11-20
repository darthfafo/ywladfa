import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState, InvalidSaveError, levelStartState, migrateState, SAVE_VERSION, stateForNextLevel } from '@/core/GameState';
import { registry } from '@/core/Registry';
import type { GameState, TriggerDef } from '@/core/types';
import { DialogueSystem } from '@/systems/DialogueSystem';
import { MarchSystem } from '@/systems/MarchSystem';
import { saveSystem } from '@/systems/SaveSystem';
import { TriggerSystem } from '@/systems/TriggerSystem';

/**
 * El guardado con los tres niveles: lo que se guarda vuelve igual (mapa, marcha,
 * valle con lo construido), lo que se importa se valida, las partidas viejas se
 * ponen al día, se pasa de un nivel al otro, y el autoguardado de la noche nunca
 * deja una partida trabada a mitad de una escena.
 */

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) },
});

/** Exportar e importar: el archivo es el JSON de la partida (SaveSystem.exportToFile / importFromFile). */
const roundTrip = (s: GameState): GameState => migrateState(JSON.parse(JSON.stringify(s, null, 2)));

describe('guardar, exportar e importar', () => {
  it('cada nivel vuelve igual: el mapa del 1, la marcha a mitad de camino y el valle con lo construido', () => {
    const n1 = createInitialState('nivel-01', 'Idris', 'm');
    n1.flags.n1_carga = ['harina', 'semilla'];

    const n2 = createInitialState('nivel-02', 'Elin', 'f');
    const lvl2 = registry.level('nivel-02');
    const m = new MarchSystem(registry.levelBalance('nivel-02').marcha as never, lvl2.march!, { seed: 7 });
    for (let i = 0; i < 200 && !m.snapshot().blocked; i++) m.update(0.25);
    n2.march = m.snapshot();

    const n3 = createInitialState('nivel-03', 'Elin', 'f');
    Object.assign(n3.flags, { n3_acto2: true, n3_obras: ['rancho:38:20', 'zanja:19:44', 'zanja:19:43', 'compuerta:19:43'], n3_trato: 'justo' });
    n3.triggersFired = ['trig_n3_bandera', 'trig_n3_crecida'];
    n3.progress.finished = true;

    for (const s of [n1, n2, n3]) {
      const back = roundTrip(structuredClone(s));
      expect(back.meta.version).toBe(SAVE_VERSION);
      expect({ ...back, meta: undefined }).toEqual({ ...s, meta: undefined });
    }
    // y la marcha retoma donde quedó
    const again = new MarchSystem(registry.levelBalance('nivel-02').marcha as never, lvl2.march!, {}, roundTrip(structuredClone(n2)).march);
    expect(again.snapshot()).toEqual(m.snapshot());
  });

  it('lo que no es una partida no se importa (ni rompe el juego)', () => {
    expect(() => migrateState({} as GameState)).toThrow(InvalidSaveError);
    expect(() => migrateState(JSON.parse('[1,2,3]'))).toThrow(InvalidSaveError);
    const otro = createInitialState('nivel-01');
    otro.progress.level = 'nivel-99';
    expect(() => migrateState(otro)).toThrow(InvalidSaveError);
    // y en el slot: corrupta o ajena → null, como si no hubiera
    mem.set('wladfa_save', '{roto');
    expect(saveSystem.load()).toBeNull();
    mem.set('wladfa_save', JSON.stringify({ hola: 1 }));
    expect(saveSystem.load()).toBeNull();
    expect(saveSystem.peek()).toBeNull();
  });

  it('importar desde un archivo: válido entra, inválido devuelve null', async () => {
    const s = createInitialState('nivel-03', 'Elin', 'f');
    const ok = await saveSystem.importFromFile(new File([JSON.stringify(s)], 'p.json'));
    expect(ok?.progress.level).toBe('nivel-03');
    expect(await saveSystem.importFromFile(new File(['no es json'], 'p.json'))).toBeNull();
    expect(await saveSystem.importFromFile(new File([JSON.stringify({ progress: { level: 'nivel-03' } })], 'p.json'))).toBeNull();
  });

  it('una partida vieja del valle suma a la gente nueva del nivel (sus vínculos se guardan)', () => {
    const vieja = createInitialState('nivel-03', 'Elin', 'f');
    vieja.meta.version = '0.2.0';
    vieja.party = vieja.party.filter((p) => !['npc_rachel', 'npc_aaron', 'npc_gwilym'].includes(p.id));
    const g = new Game(roundTrip(vieja));
    for (const id of ['npc_rachel', 'npc_aaron', 'npc_gwilym']) expect(g.state.party.some((p) => p.id === id), id).toBe(true);
    g.party.bond('npc_rachel', 1);
    expect(g.state.party.find((p) => p.id === 'npc_rachel')!.bond).toBe(1);
  });

  it('de la marcha al valle: el Nivel 3 hereda la carga, lo dejado en la estepa y los vínculos', () => {
    expect(registry.hasLevel('nivel-03')).toBe(true);
    const n2 = createInitialState('nivel-02', 'Elin', 'f');
    Object.assign(n2.flags, { n1_carga: ['harina', 'semilla', 'hierro'], n2_bultos_dejados: ['hierro'], n2_mari_enferma: true });
    n2.party.find((p) => p.id === 'npc_lewis')!.bond = 2;
    n2.progress.finished = true;
    const n3 = stateForNextLevel(n2, 'nivel-03');
    expect(n3.progress).toEqual({ level: 'nivel-03', day: 1, turn: 'amanecer', zone: '' });
    expect(n3.flags.n2_bultos_dejados).toEqual(['hierro']);
    expect(n3.party.find((p) => p.id === 'npc_lewis')!.bond).toBe(2);
    for (const n of registry.level('nivel-03').spawns.npcs) expect(n3.party.some((p) => p.id === n.id), n.id).toBe(true);
    expect(n3.march).toBeUndefined();
    // y sobrevive al guardado
    expect(roundTrip(structuredClone(n3)).flags.n1_carga).toEqual(['harina', 'semilla', 'hierro']);
  });
});

describe('el autoguardado de la noche no traba la partida', () => {
  /**
   * Un trigger con costo en turnos se marca disparado y pasa la noche antes de
   * mostrar su escena. Si la noche guardaba ahí, la partida quedaba con la escena
   * «vista» y sin sus efectos: al continuar, nada la volvía a disparar.
   */
  const worldLevels = ['nivel-01', 'nivel-03'];
  for (const id of worldLevels) {
    it(`${id}: ninguna escena que cruza la noche queda guardada a medias`, () => {
      const risky = (registry.level(id).triggers as TriggerDef[]).filter((t) => t.turnCost > 0 && (t.action.dialogue || t.action.choice));
      expect(risky.length).toBeGreaterThan(0);
      for (const t of risky) {
        mem.clear();
        const g = new Game(createInitialState(id, 'Elin', 'f'));
        g.state.progress.turn = 'noche'; // cualquier costo cruza la noche
        const ts = new TriggerSystem(g, registry.level(id).triggers as TriggerDef[]);
        ts.consume(t);
        const saved = saveSystem.load();
        expect(saved?.triggersFired ?? [], t.id).not.toContain(t.id);
        // termina la escena y el jugador recupera el control (WorldScene → releaseSaves): ahora sí
        if (t.action.dialogue) {
          const d = new DialogueSystem(g);
          let line = d.start(t.action.dialogue);
          for (let k = 0; line && k < 100; k++) line = line.choices.length ? d.choose(line.choices[0]!.id) : d.next();
        }
        g.releaseSaves();
        expect(saveSystem.load()!.triggersFired, t.id).toContain(t.id);
      }
    });
  }

  it('el ejemplo concreto: 1867 se guarda con su flag, no sin él', () => {
    mem.clear();
    const g = new Game(createInitialState('nivel-03', 'Elin', 'f'));
    g.flags.set('n3_acto2', true);
    const t = (registry.level('nivel-03').triggers as TriggerDef[]).find((x) => x.id === 'trig_n3_1867')!;
    new TriggerSystem(g, registry.level('nivel-03').triggers as TriggerDef[]).consume(t);
    expect(saveSystem.load()?.flags.n3_1867).toBeUndefined();
    const d = new DialogueSystem(g);
    let line = d.start('d_n3_1867');
    while (line) line = d.next();
    g.releaseSaves();
    const s = saveSystem.load()!;
    expect(s.triggersFired).toContain('trig_n3_1867');
    expect(s.flags.n3_1867).toBe(true);
  });
});

describe('el selector de jornadas', () => {
  it('anota el comienzo de cada jornada de cada nivel, y se puede volver a cualquiera', () => {
    mem.clear();
    const days: Array<[string, number]> = [['nivel-01', 1], ['nivel-01', 2], ['nivel-01', 3], ['nivel-02', 1], ['nivel-02', 2], ['nivel-03', 1]];
    for (const [level, day] of days) {
      const s = createInitialState(level, 'Elin', 'f');
      s.progress.day = day;
      s.flags.marca = `${level}-${day}`;
      saveSystem.save(s);
    }
    expect(saveSystem.checkpoints()).toEqual(days.map(([level, day]) => ({ level, day })));
    const back = saveSystem.loadCheckpoint('nivel-01', 2)!;
    expect(back.progress).toMatchObject({ level: 'nivel-01', day: 2 });
    expect(back.flags.marca).toBe('nivel-01-2');
    expect(saveSystem.loadCheckpoint('nivel-03', 9)).toBeNull();
  });

  it('el cierre de un nivel y la llegada de la marcha no son jornadas', () => {
    mem.clear();
    const fin = createInitialState('nivel-01', 'Elin', 'f');
    fin.progress.day = 3;
    fin.progress.finished = true;
    saveSystem.save(fin);
    const llegada = createInitialState('nivel-02', 'Elin', 'f');
    llegada.progress.day = 4;
    llegada.flags.n2_llegada = true;
    saveSystem.save(llegada);
    expect(saveSystem.checkpoints()).toEqual([]);
  });

  it('la misma jornada vuelta a jugar se pisa con la más reciente', () => {
    mem.clear();
    const a = createInitialState('nivel-03', 'Elin', 'f');
    a.progress.day = 5;
    a.flags.version = 'vieja';
    saveSystem.save(a);
    a.flags.version = 'nueva';
    saveSystem.save(a);
    expect(saveSystem.checkpoints()).toHaveLength(1);
    expect(saveSystem.loadCheckpoint('nivel-03', 5)!.flags.version).toBe('nueva');
  });

  it('el comienzo de un nivel sin jugarlo: se encadenan los anteriores con lo de siempre', () => {
    const s = levelStartState('nivel-03', 'Idris', 'm');
    expect(s.progress).toMatchObject({ level: 'nivel-03', day: 1, turn: 'amanecer' });
    expect(s.player.name).toBe('Idris');
    for (const n of registry.level('nivel-03').spawns.npcs) expect(s.party.some((p) => p.id === n.id), n.id).toBe(true);
    expect(roundTrip(structuredClone(s)).progress.level).toBe('nivel-03');
  });
});

