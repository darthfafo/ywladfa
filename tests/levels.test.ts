import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState, migrateState, SAVE_VERSION, stateForNextLevel } from '@/core/GameState';
import { registry } from '@/core/Registry';
import type { GameState } from '@/core/types';

/**
 * Lo que hace falta para encadenar niveles: carga por nivel, qué pasa al nivel
 * siguiente (exit.carryOver), el diario con varios niveles y las partidas
 * guardadas con una versión vieja. Todavía hay un solo nivel: el «siguiente»
 * de estas pruebas es el mismo nivel 1, que alcanza para probar la mecánica.
 */
describe('encadenar niveles', () => {
  it('los niveles se cargan de data/levels por nombre de archivo', () => {
    expect(registry.hasLevel('nivel-01')).toBe(true);
    expect(registry.hasLevel('nivel-99')).toBe(false);
    expect(registry.questsFor('nivel-01').length).toBeGreaterThan(0);
    expect(registry.questsFor('nivel-99')).toEqual([]);
  });

  it('el nivel siguiente hereda lo que dice exit.carryOver y arranca de cero el resto', () => {
    const g = new Game(createInitialState('nivel-01', 'Idris', 'm'));
    g.res.change('agua', 20, 'test');
    g.flags.set('n1_carga', ['harina', 'abrigo']);
    g.state.progress.day = 3;
    g.state.progress.turn = 'tarde';
    g.state.triggersFired.push('trig_desembarco');
    g.state.codex.push('cod_mimosa');
    g.journal.write(1);
    g.state.journal.push({ level: 'nivel-01', day: 1, title: 'Jornada 1', lines: ['x'] });
    const agua = g.res.get('agua');

    const next = stateForNextLevel(g.state, 'nivel-01');
    expect(next.player.name).toBe('Idris');
    expect(next.resources.agua).toBe(agua);
    expect(next.flags.n1_carga).toEqual(['harina', 'abrigo']);
    expect(next.codex).toContain('cod_mimosa');
    expect(next.progress).toEqual({ level: 'nivel-01', day: 1, turn: 'amanecer', zone: '' });
    expect(next.triggersFired).toEqual([]);
    // copia, no referencia: cambiar el nivel nuevo no toca el estado anterior
    next.resources.agua = 0;
    expect(g.state.resources.agua).toBe(agua);
  });

  it('el diario muestra lo de niveles anteriores y arma el actual en vivo', () => {
    const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
    g.state.journal.push({ level: 'nivel-00', day: 1, title: 'Jornada 1', lines: ['Algo que pasó antes.'] });
    g.flags.set('n1_cajones_bajados', 8);
    const e = g.journal.entries();
    expect(e[0]!.level).toBe('nivel-00');
    expect(e.some((x) => x.level === 'nivel-01' && x.day === 1)).toBe(true);
  });

  it('una partida guardada con la versión 0.1.0 se pone al día sin perder nada', () => {
    const old = JSON.parse(JSON.stringify(createInitialState('nivel-01', 'Elin', 'f'))) as GameState;
    old.meta.version = '0.1.0';
    old.journal = [{ day: 1, title: 'Jornada 1', lines: ['Bajamos los cajones.'] }];
    old.flags.n1_apuntalado = true;
    const s = migrateState(old);
    expect(s.meta.version).toBe(SAVE_VERSION);
    expect(s.journal[0]!.level).toBe('nivel-01');
    expect(s.journal[0]!.lines).toEqual(['Bajamos los cajones.']);
    expect(s.flags.n1_apuntalado).toBe(true);
  });
});
