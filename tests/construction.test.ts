import { describe, expect, it } from 'vitest';
import balance from '@data/config/balance.json';
import { ConstructionSystem, type Cell, type ConstructionConfig, type ValleyGrid } from '@/systems/ConstructionSystem';

/**
 * La construcción del Nivel 3 sin navegador: dónde va cada pieza, cuánto cuesta,
 * por dónde corre el agua de la zanja, qué se riega, qué se inunda y qué se lleva
 * la crecida.
 */
const cfg = (balance as any).nivel03.construccion as ConstructionConfig;

/**
 * Un valle chico, 12 × 6 (x hacia la derecha, lejos del río):
 *   columna 0: el río (nivel 2.0)
 *   columna 1: la orilla, 1.8 (el albardón)
 *   el llano baja suave hacia la derecha: 1.6 … 1.2
 *   columnas 9-11: la barda, alta (3.5)
 *   filas 4-5, columnas 5-6: la chacra propia («mia»), 1.3
 *   filas 0-1, columnas 4-5: la chacra del vecino («vecino»), baja: 0.7
 *   fila 2, columna 6: una lomada (3.0) que corta el paso del agua (más alta que el agua + la zanja)
 */
function valley(): ValleyGrid {
  const w = 12;
  const h = 6;
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c: Cell;
      if (x === 0) c = { h: 1.0, kind: 'rio' };
      else if (x === 1) c = { h: 1.8, kind: 'orilla' };
      else if (x >= 9) c = { h: 3.5, kind: 'barda' };
      else c = { h: 1.6 - (x - 2) * 0.06, kind: 'llano' };
      if (y >= 4 && (x === 5 || x === 6)) c = { h: 1.3, kind: 'llano', chacra: 'mia' };
      if (y <= 1 && (x === 4 || x === 5)) c = { h: 0.7, kind: 'llano', chacra: 'vecino' };
      if (y === 2 && x === 6) c = { h: 3.0, kind: 'llano' };
      cells.push(c);
    }
  return { w, h, cells, riverLevel: 2.0 };
}

/** Traza una zanja casilla por casilla; falla si alguna no se puede. */
function dig(c: ConstructionSystem, path: Array<[number, number]>): void {
  for (const [x, y] of path) {
    const r = c.place('zanja', x, y);
    expect(r.ok, `zanja en ${x},${y}: ${r.reason}`).toBe(true);
  }
}

describe('construcción (Nivel 3)', () => {
  it('cada pieza en su lugar: no en el río, no encima de otra, no en una chacra', () => {
    const c = new ConstructionSystem(cfg, valley());
    expect(c.canPlace('rancho', 0, 2).ok).toBe(false); // el río
    expect(c.place('rancho', 2, 2).ok).toBe(true);
    expect(c.canPlace('rancho', 3, 3).reason).toBe('Ya hay algo ahí.');
    expect(c.canPlace('corral', 4, 0).reason).toBe('Es una chacra.');
    expect(c.canPlace('rancho', 9, 0).ok).toBe(true); // la barda sirve para un rancho
    expect(c.canPlace('zanja', 9, 3).ok).toBe(false); // y no para una zanja
  });

  it('la zanja sale del río y crece de a una casilla; la compuerta va sobre la zanja', () => {
    const c = new ConstructionSystem(cfg, valley());
    expect(c.canPlace('zanja', 3, 3).ok).toBe(false); // suelta, lejos del río
    expect(c.place('zanja', 1, 3).ok).toBe(true); // la toma, pegada al río
    expect(c.canPlace('zanja', 2, 3).ok).toBe(true);
    expect(c.canPlace('compuerta', 2, 3).ok).toBe(false); // ahí no hay zanja todavía
    expect(c.place('compuerta', 1, 3).ok).toBe(true);
  });

  it('el agua corre por la zanja mientras baje, y riega la chacra que tiene compuerta', () => {
    const c = new ConstructionSystem(cfg, valley());
    dig(c, [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]]);
    c.place('compuerta', 5, 3);
    const w = c.water();
    expect(w.dry.size).toBe(0);
    expect(w.wet.size).toBe(5);
    expect(w.irrigated.has('mia')).toBe(true);
    expect(w.flooded.size).toBe(0);
  });

  it('si el terreno sube, el agua no llega: la zanja queda seca de ahí en adelante', () => {
    const c = new ConstructionSystem(cfg, valley());
    dig(c, [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]]);
    const w = c.water();
    // la lomada en (6, 2) corta: (6, 2) y (7, 2) quedan secas
    expect(w.dry.size).toBe(2);
    expect(w.wet.size).toBe(5);
  });

  it('pasar al lado de la chacra baja del vecino sin compuerta la inunda; con compuerta, no', () => {
    const sin = new ConstructionSystem(cfg, valley());
    dig(sin, [[1, 2], [2, 2], [3, 2], [4, 2]]);
    expect(sin.water().flooded.has('vecino')).toBe(true);
    const con = new ConstructionSystem(cfg, valley());
    dig(con, [[1, 2], [2, 2], [3, 2], [4, 2]]);
    con.place('compuerta', 4, 2);
    const w = con.water();
    expect(w.flooded.has('vecino')).toBe(false);
    expect(w.irrigated.has('vecino')).toBe(true);
  });

  it('sin río al lado no hay toma: la zanja no se puede empezar y no hay agua', () => {
    const g = valley();
    for (const cell of g.cells) if (cell.kind === 'rio') cell.kind = 'llano';
    const seco = new ConstructionSystem(cfg, g);
    expect(seco.canPlace('zanja', 1, 3).ok).toBe(false);
    expect(seco.water().wet.size).toBe(0);
  });

  it('lo que quedó en Punta Cuevas pesa: sin hierro todo tarda el doble; sin labranza, la zanja lleva jornadas de más', () => {
    const normal = new ConstructionSystem(cfg, valley());
    const sinHierro = new ConstructionSystem(cfg, valley(), { sinHierro: true });
    expect(sinHierro.cost('rancho').turnos).toBe(normal.cost('rancho').turnos * cfg.mods.sinHierroFactor);
    const sinLabranza = new ConstructionSystem(cfg, valley(), { sinLabranza: true });
    expect(sinLabranza.extraJornadasZanja).toBe(0); // sin zanja todavía
    sinLabranza.place('zanja', 1, 3);
    expect(sinLabranza.extraJornadasZanja).toBe(cfg.mods.sinLabranzaZanjaJornadas);
    normal.place('zanja', 1, 3);
    expect(normal.extraJornadasZanja).toBe(0);
  });

  it('la crecida se lleva lo que está bajo y respeta lo que está en la barda', () => {
    const c = new ConstructionSystem(cfg, valley());
    c.place('rancho', 2, 2); // en el llano, cerca del río
    c.place('rancho', 9, 2); // en la barda
    dig(c, [[1, 4]]);
    const lost = c.flood(2.2);
    expect(lost.map((p) => [p.x, p.y])).toEqual([[2, 2]]);
    expect(c.pieceAt(9, 2)?.kind).toBe('rancho');
    expect(c.pieceAt(2, 2)).toBeNull(); // se puede volver a construir
    expect(c.pieceAt(1, 4)?.kind).toBe('zanja'); // la zanja queda
  });

  it('el barro sale del río: lejos del agua, el rancho lleva turnos de acarreo', () => {
    const c = new ConstructionSystem(cfg, valley());
    expect(c.distanceToRiver(1, 3)).toBe(1);
    const cerca = c.cost('rancho', 2, 2).turnos;
    const lejos = c.cost('rancho', 9, 2).turnos; // en la barda, 9 casillas del río
    expect(lejos).toBeGreaterThan(cerca);
    expect(lejos - cerca).toBe(Math.floor(9 / cfg.acarreo.tilesPerTurno) - Math.floor(2 / cfg.acarreo.tilesPerTurno));
    // la zanja no acarrea barro: se cava ahí mismo
    expect(c.cost('zanja', 8, 2).turnos).toBe(c.cost('zanja').turnos);
  });
});
