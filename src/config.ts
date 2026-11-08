import Phaser from 'phaser';

/**
 * Pantalla 9:16 vertical, fija. Ver docs/00-GDD.md §8.
 * Tres franjas que nunca se mueven: HUD (32) · mundo (352) · bandeja (96).
 */
export const VIEW = {
  width: 270,
  height: 480,
  tile: 16,
  hud: { x: 0, y: 0, w: 270, h: 32 },
  world: { x: 0, y: 32, w: 270, h: 352 },
  tray: { x: 0, y: 384, w: 270, h: 96 },
} as const;

/** Paleta maestra. Ver docs/03-assets.md §1. Nada de colores fuera de acá. */
export const PAL = {
  void: 0x0e1416,
  ink: 0x18262a,
  ink2: 0x24363b,
  slate: 0x2e464f,
  sea: 0x3a6b78,
  seaLight: 0x4e8a96,
  seaPale: 0x7fb0b8,
  sky: 0xbfd3d8,

  soil: 0x45412f,
  soil2: 0x5e5741,
  sand: 0xa09472,
  sandLight: 0xc6b896,
  bone: 0xeae8e0,

  clayDark: 0x5c3022,
  clay: 0x7a4a2e,
  barranca: 0x9c3a24,
  clayLight: 0xb07a52,
  clayPale: 0xc89a6e,

  scrubDark: 0x2f3e24,
  scrub: 0x465533,
  moss: 0x586a46,
  coiron: 0xa9791f,
  wheat: 0xd9a845,

  blood: 0x7a2418,
  snow: 0xf2f2ec,
  grey: 0x6b6a5e,
} as const;

/**
 * Tinte de luz por turno del día, sobre el mundo (WorldScene) — mismo criterio
 * que PAL: reutiliza sus colores, no inventa hex nuevos para esto. `noche` casi
 * nunca se ve en WorldScene (el fogón corre en su propia CampScene aparte), pero
 * queda definido igual por si el jugador queda ahí un instante antes de que
 * dispare esa escena. `manana` es luz llena: sin tinte.
 */
export const TURN_TINT: Record<string, { color: number; alpha: number }> = {
  amanecer: { color: PAL.slate, alpha: 0.22 },
  manana: { color: PAL.slate, alpha: 0 },
  tarde: { color: PAL.wheat, alpha: 0.16 },
  noche: { color: PAL.ink, alpha: 0.55 },
};

/**
 * Mundo HD-2D (src/render3d/World3D.ts): el terreno, el mar y los objetos se
 * dibujan en 3D con Three.js debajo del canvas de Phaser, que queda transparente
 * en la franja del mundo. `?2d` en la URL vuelve al mundo 2D de siempre.
 */
export const RENDER_3D = typeof location === 'undefined' || !new URLSearchParams(location.search).has('2d');
/** Post-proceso (bloom + tilt-shift). `?fx=0` lo apaga para medir rendimiento. */
export const RENDER_3D_FX = typeof location === 'undefined' || new URLSearchParams(location.search).get('fx') !== '0';

/** Cámara del mundo 3D. Unidad = 1 tile (16 px del mapa). Mira al norte, como el mapa 2D. */
export const CAM_3D = {
  fov: 30,
  /** grados bajo el horizonte */
  pitch: 48,
  /** distancia al jugador: con fov 30 y la franja de 270 px de ancho entran ~17 tiles, igual que en 2D */
  distance: 40,
  /** suavizado del seguimiento (1/s) */
  follow: 5,
  /** a partir de esta distancia (tiles) la cámara salta en vez de deslizarse */
  snapDistance: 10,
  /** cuánto se inclinan los sprites hacia la cámara (0 = parados, 1 = de frente a la cámara).
   * 0: inclinados hacia atrás, la cabeza se metía en la pared que tenían detrás. */
  spriteLean: 0,
} as const;

/** Alto de cada terreno en el mundo 3D (tiles). Lo que no figura es piso (0). */
export const TERRAIN_HEIGHT_3D: Record<string, number> = {
  ROCK: 2.6,
  CLIFF: 2.6,
  GATE: 1.6,
  SEA: -1,
  SPRING: -0.25,
};

/** Cambio de luz entre turnos (ms): nunca de un cuadro al otro. */
export const TURN_LIGHT_MS = 2500;
/** Atardecer: al caer la noche el sol se va de a poco y, recién cuando terminó,
 * los triggers del fogón pueden disparar (WorldScene.checkTriggers). */
export const DUSK_MS = 4000;

/** Luz por turno en el mundo 3D — el equivalente de TURN_TINT. `glow` escala el
 * brillo propio del piso y los sprites (que los mantiene legibles a contraluz):
 * de noche casi se apaga, si no la noche se ve como de día. */
export const TURN_LIGHT: Record<
  string,
  { sun: number; sunI: number; sunDir: [number, number, number]; sky: number; ground: number; hemiI: number; fog: number; lantern: number; glow: number }
> = {
  // sol del este a la mañana (+x) y del oeste a la tarde, apenas del lado de la
  // cámara (+z) para que las paredes que dan al jugador no queden a contraluz
  amanecer: { sun: 0xffb27a, sunI: 2.1, sunDir: [16, 8, 5], sky: 0xe8cdb8, ground: PAL.grey, hemiI: 0.95, fog: 0xc9a58d, lantern: 0, glow: 1 },
  manana: { sun: 0xfff4e0, sunI: 2.5, sunDir: [7, 18, 7], sky: 0xd8e6ea, ground: 0x7a7468, hemiI: 1.05, fog: PAL.sky, lantern: 0, glow: 1 },
  tarde: { sun: 0xffc46b, sunI: 2.2, sunDir: [-16, 9, 5], sky: 0xe6c79a, ground: 0x6b5a40, hemiI: 0.9, fog: 0xd9a37a, lantern: 0, glow: 1 },
  noche: { sun: 0x7f9fd8, sunI: 0.35, sunDir: [-8, 14, 5], sky: PAL.slate, ground: PAL.void, hemiI: 0.3, fog: PAL.ink, lantern: 7, glow: 0.12 },
};

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW.width,
  height: VIEW.height,
  backgroundColor: PAL.void,
  // con el mundo 3D, la franja del mundo del canvas de Phaser tiene que dejar ver
  // el canvas de Three.js que está debajo
  transparent: RENDER_3D,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // habilita this.add.dom(...) — el único uso es el campo de texto del nombre en BootScene
  dom: { createContainer: true },
  input: { activePointers: 3 },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  render: { powerPreference: 'low-power' },
};
