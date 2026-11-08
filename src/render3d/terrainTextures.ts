import * as THREE from 'three';
import { PAL } from '@/config';
import { TERRAIN } from '@/util/mapgen';

/**
 * Texturas de terreno del mundo HD-2D, generadas por código con la paleta del
 * juego (PAL). Pixel art más fino que el tile 2D (32 px por tile en vez de 16)
 * y sin costuras: cada textura cubre TEX_TILES×TEX_TILES tiles y se repite en
 * coordenadas de mundo, así el piso no se ve como una grilla de baldosas.
 *
 * Tapas (`top`) para el piso y la parte de arriba de las paredes; laterales
 * (`side`) para las caras de las paredes — estratos de arcilla en la barranca,
 * piedra apilada en los pasajes cerrados.
 */

export const TEX_TILES = 2;
const SIZE = 64; // px por textura → 32 px por tile

type RGB = [number, number, number];

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Ruido de valor que se repite cada `period` celdas (para texturas sin costura). */
function tileNoise(period: number, seed: number): (u: number, v: number) => number {
  const r = rng(seed);
  const g = Array.from({ length: period * period }, () => r());
  const at = (x: number, y: number) => g[(((y % period) + period) % period) * period + (((x % period) + period) % period)]!;
  return (u, v) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fbm(seed: number): (u: number, v: number) => number {
  const o = [tileNoise(4, seed), tileNoise(8, seed + 1), tileNoise(16, seed + 2)];
  return (u, v) => o[0]!(u, v) * 0.55 + o[1]!(u, v) * 0.3 + o[2]!(u, v) * 0.15;
}

/** Pinta píxel a píxel con `fn(u, v)` y después deja dibujar detalles encima
 * (con `wrap` para que lo que cruza un borde aparezca del otro lado). */
function paint(fn: (u: number, v: number, r: () => number) => RGB, seed: number, extra?: (dot: Dot, r: () => number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const r = rng(seed * 7 + 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [R, G, B] = fn(x / SIZE, y / SIZE, r);
      const i = (y * SIZE + x) * 4;
      img.data[i] = R;
      img.data[i + 1] = G;
      img.data[i + 2] = B;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (extra) {
    const dot: Dot = (x, y, w, h, color) => {
      ctx.fillStyle = `rgb(${color[0] | 0},${color[1] | 0},${color[2] | 0})`;
      for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) ctx.fillRect(Math.round(x + ox), Math.round(y + oy), w, h);
    };
    extra(dot, rng(seed * 13 + 5));
  }
  return c;
}
type Dot = (x: number, y: number, w: number, h: number, color: RGB) => void;

/** Granitos sueltos: el ruido fino que hace que se lea como tierra/arena y no como plástico. */
const grain = (c: RGB, r: () => number, amount: number): RGB => {
  const k = r();
  return k < amount ? shade(c, 0.86) : k > 1 - amount ? shade(c, 1.1) : c;
};

const P = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, rgb(v)])) as Record<keyof typeof PAL, RGB>;

function pebbles(dot: Dot, r: () => number, n: number, colors: RGB[]): void {
  for (let i = 0; i < n; i++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    const w = 2 + Math.floor(r() * 3);
    const c = colors[Math.floor(r() * colors.length)]!;
    dot(x, y + 1, w, 1, shade(c, 0.6)); // sombra
    dot(x, y, w, Math.max(1, w - 1), c);
    dot(x, y, 1, 1, shade(c, 1.25)); // brillo
  }
}

function cracks(dot: Dot, r: () => number, n: number, color: RGB): void {
  for (let i = 0; i < n; i++) {
    let x = r() * SIZE;
    let y = r() * SIZE;
    const len = 6 + r() * 14;
    let dx = r() - 0.5;
    let dy = r() - 0.5;
    for (let s = 0; s < len; s++) {
      dot(x, y, 1, 1, color);
      dx += (r() - 0.5) * 0.6;
      dy += (r() - 0.5) * 0.6;
      const l = Math.hypot(dx, dy) || 1;
      x += dx / l;
      y += dy / l;
    }
  }
}

function tufts(dot: Dot, r: () => number, n: number, colors: RGB[]): void {
  for (let i = 0; i < n; i++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    const c = colors[Math.floor(r() * colors.length)]!;
    dot(x, y, 1, 2, c);
    dot(x - 1, y + 1, 1, 1, c);
    dot(x + 1, y + 1, 1, 1, shade(c, 0.85));
  }
}

const TOPS: Record<number, () => HTMLCanvasElement> = {
  [TERRAIN.SAND_DRY]: () => {
    const n = fbm(11);
    return paint((u, v, r) => {
      // ondas de viento: bandas suaves que se tuercen con el ruido
      const ripple = Math.sin((v * 5 + n(u, v) * 1.6) * Math.PI * 2);
      const base = mix(P.sand, P.sandLight, clamp01(0.35 + n(u, v) * 0.6));
      return grain(shade(base, 1 - Math.max(0, ripple) * 0.07), r, 0.08);
    }, 11, (dot, r) => pebbles(dot, r, 3, [P.grey, P.sandLight]));
  },
  [TERRAIN.SAND_WET]: () => {
    const n = fbm(12);
    return paint((u, v, r) => grain(mix(P.soil2, P.sand, clamp01(n(u, v) * 0.7)), r, 0.05), 12, (dot, r) =>
      pebbles(dot, r, 5, [P.grey, P.soil]),
    );
  },
  [TERRAIN.PEBBLE]: () => {
    const n = fbm(13);
    return paint((u, v, r) => grain(mix(P.grey, P.sand, clamp01(n(u, v))), r, 0.1), 13, (dot, r) =>
      pebbles(dot, r, 40, [P.grey, P.sandLight, P.bone, P.soil2]),
    );
  },
  [TERRAIN.CLAY]: () => {
    const n = fbm(14);
    return paint((u, v, r) => grain(mix(P.clayLight, P.clayPale, clamp01(n(u, v) * 0.9)), r, 0.07), 14, (dot, r) => {
      cracks(dot, r, 5, shade(P.clay, 0.9));
      pebbles(dot, r, 4, [P.clay, P.grey]);
    });
  },
  [TERRAIN.MESA]: () => {
    const n = fbm(15);
    return paint((u, v, r) => grain(mix(P.soil, P.soil2, clamp01(n(u, v))), r, 0.1), 15, (dot, r) => {
      tufts(dot, r, 14, [P.coiron, P.moss, P.wheat]);
      pebbles(dot, r, 5, [P.grey, P.soil2]);
    });
  },
  [TERRAIN.SCRUB]: () => {
    const n = fbm(16);
    return paint((u, v, r) => grain(mix(P.scrubDark, P.scrub, clamp01(n(u, v))), r, 0.1), 16, (dot, r) =>
      tufts(dot, r, 20, [P.moss, P.coiron]),
    );
  },
  [TERRAIN.CANYON]: () => {
    const n = fbm(17);
    const streaks = tileNoise(16, 99);
    return paint((u, v, r) => {
      const streak = streaks(u * 0.25, v);
      return grain(mix(P.clayPale, P.clayLight, clamp01(n(u, v) * 0.7 + streak * 0.3)), r, 0.07);
    }, 17, (dot, r) => pebbles(dot, r, 6, [P.clay, P.clayLight, P.grey]));
  },
  [TERRAIN.PATH]: () => {
    // tierra pisada: más clara y pareja que lo de alrededor, con marcas de pasos
    const n = fbm(18);
    return paint((u, v, r) => grain(mix(P.sand, P.sandLight, clamp01(0.45 + n(u, v) * 0.4)), r, 0.04), 18, (dot, r) => {
      for (let i = 0; i < 10; i++) {
        const x = r() * SIZE;
        const y = r() * SIZE;
        dot(x, y, 2, 3, shade(P.sand, 0.92));
      }
    });
  },
  [TERRAIN.SPRING]: () => {
    const n = fbm(19);
    return paint((u, v) => mix(P.sea, P.seaPale, clamp01(n(u, v) * 0.8 + Math.sin((u + v) * 12) * 0.08)), 19);
  },
  [TERRAIN.ROCK]: () => {
    const n = fbm(20);
    // lomo de la roca: tierra seca con pasto, no arcilla roja (eso es la cara)
    return paint((u, v, r) => grain(mix(P.soil, P.soil2, clamp01(n(u, v) * 1.1)), r, 0.1), 20, (dot, r) => {
      tufts(dot, r, 18, [P.coiron, P.moss, P.wheat]);
      pebbles(dot, r, 6, [P.grey, P.sand]);
    });
  },
  [TERRAIN.CLIFF]: () => {
    const n = fbm(21);
    return paint((u, v, r) => grain(mix(P.clay, P.clayLight, clamp01(n(u, v))), r, 0.1), 21, (dot, r) => {
      tufts(dot, r, 12, [P.coiron, P.wheat, P.moss]);
      cracks(dot, r, 3, P.clayDark);
    });
  },
};
// un pasaje cerrado se ve como la barranca misma (mapgen.ts: "mismo lenguaje
// visual que la pared de la barranca, nada de carteles"), no como un camino
TOPS[TERRAIN.GATE] = TOPS[TERRAIN.CLIFF]!;

/** Cara de barranca: estratos de arcilla horizontales con surcos de erosión. */
function strata(seed: number, layers: RGB[]): HTMLCanvasElement {
  const n = fbm(seed);
  const gully = tileNoise(16, seed + 50);
  return paint((u, v, r) => {
    const t = v + n(u, v) * 0.12;
    const band = layers[Math.floor((((t * layers.length) % layers.length) + layers.length) % layers.length)]!;
    const g = gully(u, v * 0.15); // surcos verticales
    return grain(shade(band, 0.85 + g * 0.25), r, 0.1);
  }, seed);
}

const SIDES: Record<number, () => HTMLCanvasElement> = {
  [TERRAIN.CLIFF]: () => strata(31, [P.clay, P.barranca, P.clayLight, P.clay, P.clayPale, P.clayDark]),
  [TERRAIN.ROCK]: () => strata(32, [P.soil, P.clayDark, P.soil2, P.clay, P.soil]),
};
SIDES[TERRAIN.GATE] = SIDES[TERRAIN.CLIFF]!;

const cache = new Map<string, THREE.CanvasTexture>();

/** Textura de tapa o de lateral para un terreno (las que no tienen lateral
 * propio usan la de arcilla: son el borde del piso bajando al mar). */
export function terrainTexture(terrain: number, face: 'top' | 'side'): THREE.CanvasTexture {
  const key = `${face}:${terrain}`;
  let t = cache.get(key);
  if (t) return t;
  const make =
    face === 'side'
      ? (SIDES[terrain] ?? (() => strata(34, [P.soil2, P.sand, P.soil])))
      : (TOPS[terrain] ?? TOPS[TERRAIN.SAND_DRY]!);
  t = new THREE.CanvasTexture(make());
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
