import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { registry } from '@/core/Registry';
import { buildTerrain, COLLIDES } from '@/util/mapgen';

/**
 * El camino físico del Nivel 1: desde donde arranca el jugador, caminando por
 * casillas pisables (con los pasajes cerrados o abiertos según el momento del
 * nivel), ¿se llega a cada cosa que el nivel pide tocar? flow.test.ts prueba la
 * lógica (triggers, turnos); esto prueba que el mapa la deja jugar. Si un cambio
 * de costa, de zona o de pasaje encierra algo, falla acá.
 *
 * No modela los cuerpos sólidos de props/NPCs (son chicos y se rodean) ni el
 * ancho del jugador (15 px, menos de una casilla).
 */

const level = registry.level('nivel-01');

function reachable(g: Game, from: { x: number; y: number }): Set<string> {
  const grid = buildTerrain(level, (id) => {
    const p = level.spawns.pasajes.find((x) => x.id === id)!;
    return !p.requires || g.flags.eval(p.requires);
  });
  const H = grid.length;
  const W = grid[0]!.length;
  const walk = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && !COLLIDES.includes(grid[y]![x]!);
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [[from.x, from.y]];
  expect(walk(from.x, from.y), `el punto de partida (${from.x},${from.y}) no es pisable`).toBe(true);
  seen.add(`${from.x},${from.y}`);
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !walk(x + dx, y + dy)) continue;
      seen.add(k);
      queue.push([x + dx, y + dy]);
    }
  }
  return seen;
}

/** ¿Se llega a la casilla o a alguna vecina (para tocar un prop sólido)? */
function near(seen: Set<string>, x: number, y: number, r = 1): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (seen.has(`${x + dx},${y + dy}`)) return true;
  return false;
}

function inRect(seen: Set<string>, rect: [number, number, number, number]): boolean {
  const [x, y, w, h] = rect;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (seen.has(`${i},${j}`)) return true;
  return false;
}

const trig = (id: string) => level.triggers.find((t) => t.id === id)!;
const npc = (id: string) => level.spawns.npcs.find((n) => n.id === id)!;

describe('caminos del Nivel 1', () => {
  it('J1 al llegar: cajones, pila, Pepperell y Edwyn; la barranca todavía cerrada', () => {
    const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
    const seen = reachable(g, level.spawns.player);
    for (const c of level.spawns.cajones) expect(near(seen, c.x, c.y), `cajón (${c.x},${c.y})`).toBe(true);
    expect(near(seen, 27, 97), 'la pila').toBe(true);
    for (const id of ['npc_pepperell', 'npc_edwyn']) expect(near(seen, npc(id).x, npc(id).y, 2), id).toBe(true);
    expect(near(seen, level.spawns.fogon.x, level.spawns.fogon.y), 'el fogón no debería alcanzarse todavía').toBe(false);
  });

  it('J1 con los cajones bajados: cuevas y fogón; ni la estepa ni la meseta', () => {
    const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
    g.flags.set('n1_cajones_bajados', 8);
    g.flags.set('n1_edwyn_deposito', true);
    const seen = reachable(g, level.spawns.player);
    for (const c of level.spawns.cuevas) expect(near(seen, c.x, c.y, 2), c.id).toBe(true);
    expect(near(seen, level.spawns.fogon.x, level.spawns.fogon.y), 'fogón').toBe(true);
    expect(inRect(seen, trig('trig_eleccion_cueva').rect!), 'elección de cueva').toBe(true);
    expect(inRect(seen, trig('trig_vigia_mimosa').rect!), 'el vigía no debería alcanzarse en J1').toBe(false);
    expect(near(seen, 10, 50), 'la estepa no debería alcanzarse en J1').toBe(false);
  });

  it('J2 a la mañana: jarilla, molle, mejillones y el vigía; el cañadón cerrado', () => {
    const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
    g.flags.set('n1_cajones_bajados', 8);
    g.flags.set('n1_edwyn_deposito', true);
    g.state.progress.day = 2;
    g.state.progress.turn = 'manana';
    const camp = level.spawns.campamento ?? level.spawns.fogon;
    const seen = reachable(g, camp);
    for (const n of level.spawns.gatherNodes) expect(near(seen, n.x, n.y), n.id).toBe(true);
    expect(inRect(seen, trig('trig_vigia_mimosa').rect!), 'vigía').toBe(true);
    expect(inRect(seen, trig('trig_manantial').rect!), 'el manantial no debería alcanzarse antes de que se pierda Dafydd').toBe(false);
  });

  it('J2 a la tarde: el manantial por los dos pasos, y vuelta al fogón', () => {
    const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
    g.flags.set('n1_cajones_bajados', 8);
    g.flags.set('n1_edwyn_deposito', true);
    g.flags.set('n1_dafydd_perdido', true);
    g.state.progress.day = 2;
    g.state.progress.turn = 'tarde';
    const camp = level.spawns.campamento ?? level.spawns.fogon;
    const seen = reachable(g, camp);
    expect(inRect(seen, trig('trig_manantial').rect!), 'manantial').toBe(true);
    const daf = npc('npc_dafydd');
    const stop = Array.isArray(daf.movesTo) ? daf.movesTo[0]! : daf.movesTo!;
    expect(near(seen, stop.x, stop.y, 2), 'Dafydd junto al manantial').toBe(true);
  });

  it('J3: Berwyn en la punta y el cierre', () => {
    const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
    g.flags.set('n1_cajones_bajados', 8);
    g.flags.set('n1_edwyn_deposito', true);
    g.state.progress.day = 3;
    g.state.progress.turn = 'manana';
    const camp = level.spawns.campamento ?? level.spawns.fogon;
    const seen = reachable(g, camp);
    expect(inRect(seen, trig('trig_berwyn_libreta').rect!), 'Berwyn').toBe(true);
    expect(inRect(seen, trig('trig_punta_final').rect!), 'cierre').toBe(true);
    // los NPC con mudanza quedan en casillas pisables o al lado
    for (const n of level.spawns.npcs) {
      if (n.id === 'npc_dafydd') continue; // solo J1-J2, cubierto en el test de la tarde del J2
      const stops = n.movesTo ? (Array.isArray(n.movesTo) ? n.movesTo : [n.movesTo]) : [];
      for (const m of stops) expect(near(seen, m.x, m.y, 2), `${n.id} en (${m.x},${m.y})`).toBe(true);
    }
  });
});
