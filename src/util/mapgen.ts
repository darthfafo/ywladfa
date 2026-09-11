import type { LevelDef } from '@/core/types';

/**
 * Terreno del prototipo. Reemplazar por el .tmj de Tiled cuando exista el tileset real
 * (docs/03-assets.md §8). La geometría sale del mismo JSON de nivel, así que el mapa
 * de Tiled tiene que respetar estas mismas zonas y pasajes.
 */
export const TERRAIN = {
  ROCK: 0,
  SEA: 1,
  SAND_DRY: 2,
  SAND_WET: 3,
  PEBBLE: 4,
  CLAY: 5,
  SCRUB: 6,
  MESA: 7,
  CANYON: 8,
  PATH: 9,
  SPRING: 10,
  CLIFF: 11,
  /** Pasaje cerrado a la espera de su condición — distinto del acantilado natural. */
  GATE: 12,
} as const;

export type TerrainId = (typeof TERRAIN)[keyof typeof TERRAIN];

/** Variantes visuales por terreno (deben coincidir con TILE_VARIANTS de textures.ts). */
export const VARIANTS = 4;

/** Índice real de tile en el tileset: terreno × variantes + variante. */
export const tileIndex = (terrain: number, variant: number): number => terrain * VARIANTS + variant;
/** Terreno base a partir de un índice de tile. */
export const baseTerrain = (tileIdx: number): number => Math.floor(tileIdx / VARIANTS);

/** Índices que bloquean el paso (todas las variantes de los terrenos sólidos). */
export const COLLIDES: number[] = [TERRAIN.ROCK, TERRAIN.SEA, TERRAIN.CLIFF, TERRAIN.GATE].flatMap((t) =>
  Array.from({ length: VARIANTS }, (_, v) => tileIndex(t, v)),
);

/** Multiplicador de velocidad por terreno (docs/01-nivel-01.md §2.3). */
export const TERRAIN_SPEED: Record<number, number> = {
  [TERRAIN.SAND_DRY]: 0.85,
  [TERRAIN.SAND_WET]: 1.0,
  [TERRAIN.PEBBLE]: 0.75,
  [TERRAIN.CLAY]: 0.9,
  [TERRAIN.SCRUB]: 0.8,
  [TERRAIN.MESA]: 0.95,
  [TERRAIN.CANYON]: 0.9,
  [TERRAIN.PATH]: 1.15,
  [TERRAIN.SPRING]: 0.7,
};

const ZONE_TERRAIN: Record<string, number> = {
  z1_playa: TERRAIN.SAND_DRY,
  z6_punta: TERRAIN.PEBBLE,
  z2_barranca: TERRAIN.CLAY,
  // el monte usa el mismo terreno que la meseta, no SCRUB: todavía no hay verdes en
  // el juego (docs/03-assets.md — se reservan para más adelante en la campaña) y el
  // monte se lee como una continuación abierta de la meseta, no como una zona propia
  // con su propio color.
  z3_monte: TERRAIN.MESA,
  z4_meseta: TERRAIN.MESA,
  z5_canadon: TERRAIN.CANYON,
};

/**
 * `isOpen(pasajeId)` decide si un pasaje ya se puede cruzar. Sin ella (o si devuelve
 * true siempre) el mapa queda como antes. Un pasaje cerrado se pinta como acantilado:
 * mismo lenguaje visual que ya usa la pared de la barranca, nada de carteles.
 */
export function buildTerrain(level: LevelDef, isOpen: (pasajeId: string) => boolean = () => true): number[][] {
  const { widthTiles: W, heightTiles: H } = level.map;
  // roca genérica, no acantilado: el relleno por default es el borde exterior del mapa
  // jugable (monte, el resto de la meseta) y tiene que leerse como límite natural sin
  // ser una pared de piedra por todos lados — el acantilado (TERRAIN.CLIFF) se reserva
  // para donde de verdad hay una pared con intención (la barranca, más abajo). El mar
  // sí marca border explícito, pero solo donde corresponde (playa al sur, golfo al
  // este) — no en los cuatro lados por igual.
  const g: number[][] = Array.from({ length: H }, () => Array<number>(W).fill(TERRAIN.ROCK));

  // zonas
  for (const z of level.zones) {
    const [x, y, w, h] = z.rect;
    const t = ZONE_TERRAIN[z.id] ?? TERRAIN.ROCK;
    for (let j = y; j < y + h && j < H; j++) {
      for (let i = x; i < x + w && i < W; i++) g[j]![i] = t;
    }
  }

  // borde de la playa: arena húmeda y después el mar
  const playa = level.zones.find((z) => z.id === 'z1_playa');
  if (playa) {
    const [px, , pw] = playa.rect;
    for (let j = 106; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const inBeachX = i >= px - 2 && i < px + pw + 2;
        g[j]![i] = j >= 109 ? TERRAIN.SEA : inBeachX ? TERRAIN.SAND_WET : TERRAIN.SEA;
      }
    }
  }

  // borde este: el golfo, del lado de la meseta y de la punta. La barranca queda
  // afuera a propósito — son cuevas cavadas en el cerro, de cara al campamento, no
  // a la costa; con mar pegado a su propio borde se veía el golfo "a través" de la
  // pared de la cueva apenas caminabas unos pasos al este. Solo pisa relleno
  // todavía sin reclamar (el default de arriba), así que cada zona se queda con el
  // ancho de playa que le toque según cuánto se acerque al borde real.
  const barrancaZone = level.zones.find((z) => z.id === 'z2_barranca');
  const [, barrancaY, , barrancaH] = barrancaZone?.rect ?? [0, -1, 0, 0];
  for (let j = 0; j < 106 && j < H; j++) {
    if (barrancaZone && j >= barrancaY && j < barrancaY + barrancaH) continue;
    for (let i = 60; i < W; i++) {
      if (g[j]![i] === TERRAIN.ROCK) g[j]![i] = TERRAIN.SEA;
    }
  }

  // borde norte de la meseta: el vigía (trig_vigia_mimosa) mira al golfo desde ahí,
  // pero sin esto el borde norte era la misma roca genérica de relleno que cualquier
  // otro límite del mapa — no había nada que leer como "acá se ve el mar". Dos filas
  // de acantilado en el borde de la zona (mismo lenguaje visual que ya usa la pared
  // de la barranca) y mar más allá, ya visible en cámara aunque no sea pisable. Solo
  // en el rango de X de z4_meseta — z5_canadon linda con el mismo borde más al oeste
  // y se queda sin vista a propósito, no está señalizado en el diseño.
  const mesetaZone = level.zones.find((z) => z.id === 'z4_meseta');
  if (mesetaZone) {
    const [mx, , mw] = mesetaZone.rect;
    for (let i = mx; i < mx + mw && i < W; i++) {
      for (let j = 0; j < 4; j++) {
        g[j]![i] = j < 2 ? TERRAIN.SEA : TERRAIN.CLIFF;
      }
    }
  }

  // pasajes entre zonas: corredores de sendero, o bloqueo temporal si todavía están cerrados
  for (const p of level.spawns.pasajes) {
    const open = !p.requires || isOpen(p.id);
    const t = open ? TERRAIN.PATH : TERRAIN.GATE;
    for (let j = p.y; j < p.y + p.h && j < H; j++) {
      for (let i = p.x; i < p.x + p.w && i < W; i++) {
        if (j >= 0 && i >= 0) g[j]![i] = t;
      }
    }
  }

  // la pared de la barranca: una línea de acantilado bajo la zona 2, salvo donde pasa el corredor
  const barranca = level.zones.find((z) => z.id === 'z2_barranca');
  if (barranca) {
    const [bx, by, bw, bh] = barranca.rect;
    const bottom = by + bh;
    for (let i = bx; i < bx + bw && i < W; i++) {
      for (let j = bottom; j < bottom + 2 && j < H; j++) {
        if (g[j]![i] !== TERRAIN.PATH) g[j]![i] = TERRAIN.CLIFF;
      }
    }
  }

  // la pared norte de la barranca, donde el cañadón la toca directo: los dos
  // pasajes de verdad al cañadón (p_monte_canadon, p_meseta_canadon) entran por
  // otro lado — acá los rects de las dos zonas simplemente se tocan (sin gap),
  // así que sin esta pared quedaba un tramo caminable de punta a punta que se
  // saltea los dos pasajes (y su `requires`) por completo. Se pinta sobre las
  // últimas filas del propio cañadón, no de la barranca (mismo criterio que la
  // pared sur: nunca pisa el rect de la zona que da al campamento).
  const canadonZone = level.zones.find((z) => z.id === 'z5_canadon');
  if (barranca && canadonZone) {
    const [bx, by, bw] = barranca.rect;
    const [cx, , cw] = canadonZone.rect;
    const overlapStart = Math.max(bx, cx);
    const overlapEnd = Math.min(bx + bw, cx + cw);
    for (let i = overlapStart; i < overlapEnd && i < W; i++) {
      for (let j = by - 2; j < by && j >= 0; j++) {
        if (g[j]![i] !== TERRAIN.PATH) g[j]![i] = TERRAIN.CLIFF;
      }
    }
  }

  // el manantial, al fondo del cañadón — bloque angosto (2×2, no 4×4): la imagen
  // real que se pone encima (WorldScene.spawnDecor) tiene bastante margen
  // transparente alrededor de la piedra, así que un bloque de agua lisa más grande
  // que eso se veía por las esquinas, como un cuadrado azul plano detrás del dibujo.
  for (let j = 7; j < 9; j++) for (let i = 9; i < 11; i++) g[j]![i] = TERRAIN.SPRING;

  // el cañadón es una zona abierta y grande (26×38) — un par de afloramientos
  // sueltos no alcanzaban a hacer que encontrar el manantial se sintiera como
  // encontrar algo, era cruzar un rectángulo vacío bordeando dos piedras. Ahora
  // un laberinto en zigzag ocupa la franja del medio, de punta a punta del
  // ancho de la zona: cinco paredes de barranco (2 filas de espesor cada una,
  // mismo acantilado que ya usa la pared de la barranca), el hueco real
  // alternando izquierda/derecha. Dos de las paredes tienen ADEMÁS un hueco
  // falso que no lleva a ningún lado — un cajón sin salida sellado por los
  // tres costados, para que equivocarse de hueco cueste volver — sin tocar el
  // hueco real de esa misma pared. El manantial queda del otro lado (filas
  // 2-12, al norte); las dos entradas reales (p_monte_canadon al sur,
  // p_meseta_canadon reubicado cerca del mismo punto, ver nivel-01.json)
  // arrancan las dos desde abajo de todo, así que ninguna se salta la mitad
  // del recorrido. Solo bloquea `TERRAIN.CANYON` propio: nunca pisa un pasaje.
  const canadonMazeWalls: Array<{ y: number; segments: Array<[number, number]> }> = [
    { y: 13, segments: [[2, 22]] },
    { y: 18, segments: [[8, 16], [20, 28]] }, // hueco real 2-7, hueco falso 16-19
    { y: 23, segments: [[2, 22]] },
    { y: 28, segments: [[8, 12], [16, 28]] }, // hueco real 2-7, hueco falso 12-15
    { y: 33, segments: [[2, 22]] },
  ];
  // los dos callejones sin salida: cajón de 4×1 caminable, cerrado por los dos
  // costados y el fondo — la única salida es volver por el mismo hueco falso.
  // Una sola fila de profundidad, no dos: la franja abierta entre paredes mide
  // 3 filas — un cajón de 2 de profundidad (más 1 de fondo) la ocupaba ENTERA
  // de lado a lado, y sin querer cortaba el paso lateral de todo el ancho del
  // laberinto en dos mitades sin conexión entre sí. Con 1 fila de cajón + 1 de
  // fondo queda una fila libre para bordearlo.
  const canadonDeadEnds: Array<[number, number, number, number]> = [
    [15, 20, 1, 1],
    [20, 20, 1, 1],
    [15, 21, 6, 1],
    [11, 30, 1, 1],
    [16, 30, 1, 1],
    [11, 31, 6, 1],
  ];
  if (canadonZone) {
    for (const wall of canadonMazeWalls) {
      for (const [start, end] of wall.segments) {
        for (let j = wall.y; j < wall.y + 2; j++) {
          for (let i = start; i < end && i < W; i++) {
            if (g[j]![i] === TERRAIN.CANYON) g[j]![i] = TERRAIN.CLIFF;
          }
        }
      }
    }
    for (const [ci, cj, cw, ch] of canadonDeadEnds) {
      for (let j = cj; j < cj + ch; j++) {
        for (let i = ci; i < ci + cw; i++) {
          if (g[j]![i] === TERRAIN.CANYON) g[j]![i] = TERRAIN.CLIFF;
        }
      }
    }
  }

  // resuelve la variante visual de cada celda: mismo mapa siempre, sin patrón obvio
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      g[j]![i] = tileIndex(g[j]![i]!, cellVariant(i, j));
    }
  }
  return g;
}

export function cellVariant(x: number, y: number): number {
  const h = Math.sin(x * 37.71 + y * 91.13) * 24691.357;
  return Math.floor((h - Math.floor(h)) * VARIANTS) % VARIANTS;
}

export function zoneAt(level: LevelDef, tx: number, ty: number): { id: string; label: string } | null {
  for (const z of level.zones) {
    const [x, y, w, h] = z.rect;
    if (tx >= x && tx < x + w && ty >= y && ty < y + h) return { id: z.id, label: z.label };
  }
  return null;
}
