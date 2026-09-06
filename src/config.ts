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

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW.width,
  height: VIEW.height,
  backgroundColor: PAL.void,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 3 },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  render: { powerPreference: 'low-power' },
};
