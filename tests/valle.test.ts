import { describe, expect, it } from 'vitest';
import balance from '@data/config/balance.json';
import { registry } from '@/core/Registry';
import { ConstructionSystem, type ConstructionConfig } from '@/systems/ConstructionSystem';
import { buildTerrain, chacraRects, COLLIDES, valleKind, valleyGrid } from '@/util/mapgen';

/**
 * El mapa del Nivel 3 (en armado): el valle del Chubut se genera entero, se
 * camina, y el riego tiene solución (el agua puede llegar a la chacra de la
 * familia) pero no cualquier trazado sirve (las lomadas cortan).
 */
const level = registry.level('nivel-03');
const cfg = (balance as any).nivel03.construccion as ConstructionConfig;
const { widthTiles: W, heightTiles: H } = level.map;

describe('el valle (Nivel 3, en armado)', () => {
  it('todavía no se entra desde el Nivel 2 (draft), pero sus datos cargan', () => {
    expect(registry.hasLevel('nivel-03')).toBe(false);
    expect(level.map.generator).toBe('valle_chubut');
  });

  it('el río es uno solo y continuo, del borde oeste hasta el mar', () => {
    const seen = new Set<number>();
    const start = Array.from({ length: H }, (_, y) => y).find((y) => valleKind(0, y) === 'rio')!;
    expect(start).toBeDefined();
    const q: Array<[number, number]> = [[0, start]];
    seen.add(start * W);
    let reachesSea = false;
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
        if (a < 0 || b < 0 || a >= W || b >= H || seen.has(b * W + a)) continue;
        const k = valleKind(a, b);
        if (k === 'mar') reachesSea = true;
        if (k !== 'rio') continue;
        seen.add(b * W + a);
        q.push([a, b]);
      }
    }
    expect(reachesSea).toBe(true);
  });

  it('desde donde arranca el jugador se llega a todos, al fogón y a cada chacra', () => {
    const g = buildTerrain(level);
    const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !COLLIDES.includes(g[y]![x]!);
    const p = level.spawns.player;
    expect(walk(p.x, p.y)).toBe(true);
    const seen = new Set<string>([`${p.x},${p.y}`]);
    const q: Array<[number, number]> = [[p.x, p.y]];
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
        if (seen.has(`${a},${b}`) || !walk(a, b)) continue;
        seen.add(`${a},${b}`);
        q.push([a, b]);
      }
    }
    const near = (x: number, y: number) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => seen.has(`${x + dx},${y + dy}`)));
    for (const n of level.spawns.npcs) expect(near(n.x, n.y), n.id).toBe(true);
    expect(near(level.spawns.fogon.x, level.spawns.fogon.y)).toBe(true);
    for (const c of chacraRects(level)) expect(seen.has(`${c.x},${c.y}`), c.id).toBe(true);
    // y se sube a la barda por la bajada (el lugar seguro de la crecida)
    expect([...seen].some((k) => valleKind(Number(k.split(',')[0]), Number(k.split(',')[1])) === 'barda')).toBe(true);
  });

  it('las chacras quedan en el llano, sin pisarse, y la de la familia está más lejos del río que la del vecino', () => {
    const rects = chacraRects(level);
    const cells = new Set<string>();
    for (const c of rects)
      for (let y = c.y; y < c.y + c.h; y++)
        for (let x = c.x; x < c.x + c.w; x++) {
          expect(['llano', 'lomada'], `${c.id} en ${x},${y}`).toContain(valleKind(x, y));
          expect(cells.has(`${x},${y}`)).toBe(false);
          cells.add(`${x},${y}`);
        }
    const fam = rects.find((c) => c.owner === 'familia')!;
    const vec = rects.find((c) => c.owner === 'vecinos')!;
    expect(fam.y + fam.h).toBeLessThan(vec.y);
  });

  it('el riego tiene solución: hay un trazado por el que el agua llega a la chacra de la familia', () => {
    // el mejor nivel de agua que puede llegar a cada casilla del llano cavando por donde sea
    const grid = valleyGrid(level);
    const head = new Map<number, number>();
    const q: number[] = [];
    for (let i = 0; i < grid.cells.length; i++) {
      const c = grid.cells[i]!;
      if (c.kind !== 'orilla' && c.kind !== 'llano') continue;
      const x = i % W;
      const y = Math.floor(i / W);
      const nextToRiver = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([a, b]) => grid.cells[b! * W + a!]?.kind === 'rio');
      if (nextToRiver && c.h - cfg.zanjaDepth < grid.riverLevel) {
        head.set(i, grid.riverLevel);
        q.push(i);
      }
    }
    while (q.length) {
      q.sort((a, b) => head.get(b)! - head.get(a)!);
      const i = q.shift()!;
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
        const j = b * W + a;
        const c = grid.cells[j];
        if (!c || a < 0 || a >= W || (c.kind !== 'orilla' && c.kind !== 'llano') || c.chacra) continue;
        const nh = head.get(i)! - cfg.headLossPerCell;
        if (c.h - cfg.zanjaDepth >= nh || (head.get(j) ?? -Infinity) >= nh) continue;
        head.set(j, nh);
        q.push(j);
      }
    }
    const fam = chacraRects(level).find((c) => c.owner === 'familia')!;
    let reaches = false;
    for (let y = fam.y - 1; y <= fam.y + fam.h; y++) for (let x = fam.x - 1; x <= fam.x + fam.w; x++) if (head.has(y * W + x)) reaches = true;
    expect(reaches).toBe(true);
    // y no todo el llano es alcanzable: las lomadas cortan el paso del agua
    const llano = grid.cells.map((c, i) => [c, i] as const).filter(([c]) => c.kind === 'llano' && !c.chacra);
    const wetLlano = llano.filter(([, i]) => head.has(i)).length;
    expect(wetLlano).toBeLessThan(llano.length);
  });

  it('la grilla de construcción y el sistema se arman con el valle', () => {
    const c = new ConstructionSystem(cfg, valleyGrid(level));
    expect(c.canPlace('rancho', 38, 20).ok).toBe(true); // el llano, al oeste del fuerte
    expect(c.canPlace('rancho', 52, 24).ok).toBe(false); // adentro de las ruinas del fuerte, no
  });
});
