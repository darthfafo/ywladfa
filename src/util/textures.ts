import Phaser from 'phaser';
import { PAL } from '@/config';
import { TERRAIN } from './mapgen';

/**
 * Arte placeholder generado por código, con los TAMAÑOS FINALES de docs/03-assets.md.
 * Se reemplaza por PNGs sin tocar el resto del código: mismos keys, mismas medidas.
 */

const TILE = 16;

const TERRAIN_COLORS: Record<number, [number, number]> = {
  // oscura y cálida, no gris: es roca de cueva, continuidad con la barranca (guía histórica)
  [TERRAIN.ROCK]: [PAL.soil, PAL.clayDark],
  [TERRAIN.SEA]: [PAL.sea, PAL.seaLight],
  [TERRAIN.SAND_DRY]: [PAL.sand, PAL.sandLight],
  [TERRAIN.SAND_WET]: [PAL.soil2, PAL.sand],
  [TERRAIN.PEBBLE]: [PAL.grey, PAL.sandLight],
  [TERRAIN.CLAY]: [PAL.clayLight, PAL.clayPale],
  [TERRAIN.SCRUB]: [PAL.scrub, PAL.moss],
  [TERRAIN.MESA]: [PAL.soil, PAL.soil2],
  [TERRAIN.CANYON]: [PAL.clayPale, PAL.clayLight],
  [TERRAIN.PATH]: [PAL.sandLight, PAL.bone],
  [TERRAIN.SPRING]: [PAL.seaLight, PAL.seaPale],
  // el acantilado natural de la barranca: erosión, nunca mampostería.
  [TERRAIN.CLIFF]: [PAL.clayDark, PAL.soil2],
  // pasaje cerrado: arena oscura marcada, distinta del acantilado — se lee como
  // obstáculo temporal, no como parte del paisaje.
  [TERRAIN.GATE]: [PAL.soil, PAL.soil2],
};

/** Ruido determinista por tile, para que el mapa no se vea plano. */
function noise(x: number, y: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Variantes por terreno: rompen el patrón repetido del mapa. Ver VARIANTS en mapgen. */
export const TILE_VARIANTS = 4;

export function makeTileset(scene: Phaser.Scene, key = 'tiles'): void {
  if (scene.textures.exists(key)) return;
  const ids = Object.values(TERRAIN) as number[];
  const cols = ids.length * TILE_VARIANTS;
  const tex = scene.textures.createCanvas(key, cols * TILE, TILE);
  const ctx = tex!.getContext();

  ids.forEach((id, idx) => {
    const [base, accent] = TERRAIN_COLORS[id] ?? [PAL.ink, PAL.ink2];
    for (let v = 0; v < TILE_VARIANTS; v++) {
      const ox = (idx * TILE_VARIANTS + v) * TILE;
      ctx.fillStyle = hex(base);
      ctx.fillRect(ox, 0, TILE, TILE);

      // grano fino, distinto en cada variante
      ctx.fillStyle = hex(accent);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const n = noise(idx * 131 + v * 37 + x * 3.1, y * 7.7 + v * 11);
          if (n > 0.88) ctx.fillRect(ox + x, y, 1, 1);
        }
      }
      // un rasgo más grande cada tanto: piedra, mata, veta
      const feature = noise(idx * 17 + v * 91, 5.5);
      if (feature > 0.55 && id !== TERRAIN.SEA) {
        const fx = Math.floor(noise(v * 13 + idx, 2) * 11) + 2;
        const fy = Math.floor(noise(idx, v * 5 + 3) * 11) + 2;
        ctx.fillStyle = hex(accent);
        ctx.fillRect(ox + fx, fy, 2, 2);
        ctx.fillStyle = hex(base);
        ctx.fillRect(ox + fx, fy + 2, 2, 1);
      }
      if (id === TERRAIN.CLIFF) {
        // una veta de sedimento angosta, en una fila al azar — erosión, no mampostería
        ctx.fillStyle = hex(PAL.ink2);
        const bandY = 2 + Math.floor(noise(idx * 7 + v * 19, 3) * (TILE - 6));
        ctx.fillRect(ox, bandY, TILE, 1);
      }
      if (id === TERRAIN.SEA) {
        ctx.fillStyle = hex(PAL.seaPale);
        ctx.fillRect(ox + ((v * 4) % 12), 4 + v * 2, 6, 1);
      }
      if (id === TERRAIN.GATE) {
        // rayado diagonal: marca deliberada, no ruido de terreno — dice "esto se puede abrir"
        ctx.fillStyle = hex(PAL.sandLight);
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            if ((x + y + v * 4) % 7 < 2) ctx.fillRect(ox + x, y, 1, 1);
          }
        }
      }
    }
  });
  tex!.refresh();
}

export type HatStyle = 'copa' | 'boina';

/** Personaje 16×24, cuatro direcciones. Silueta reconocible por el sombrero (docs/03-assets.md §3). */
export function makeCharacter(
  scene: Phaser.Scene,
  key: string,
  body: number,
  hat: number,
  hatStyle: HatStyle = 'boina',
): void {
  if (scene.textures.exists(key)) return;
  const W = 16;
  const H = 24;
  const dirs = ['south', 'north', 'east', 'west'];
  const tex = scene.textures.createCanvas(key, W * dirs.length, H);
  const ctx = tex!.getContext();

  dirs.forEach((dir, i) => {
    const ox = i * W;
    ctx.clearRect(ox, 0, W, H);
    // sombra
    ctx.fillStyle = 'rgba(14,20,22,0.35)';
    ctx.fillRect(ox + 4, H - 2, 8, 2);
    // piernas
    ctx.fillStyle = hex(PAL.ink);
    ctx.fillRect(ox + 5, H - 7, 2, 5);
    ctx.fillRect(ox + 9, H - 7, 2, 5);
    // cuerpo
    ctx.fillStyle = hex(body);
    ctx.fillRect(ox + 4, 9, 8, 9);
    // cabeza
    ctx.fillStyle = hex(PAL.clayPale);
    ctx.fillRect(ox + 5, 4, 6, 6);
    // sombrero: dos siluetas de colono, no solo color (docs/04-guia-historica.md)
    ctx.fillStyle = hex(hat);
    if (hatStyle === 'copa') {
      // galera: ala fina + copa alta y angosta
      ctx.fillRect(ox + 4, 4, 8, 1);
      ctx.fillRect(ox + 6, 0, 4, 4);
    } else {
      // boina: más achatada y ancha, con el copete corrido a un lado
      ctx.fillRect(ox + 4, 3, 8, 2);
      ctx.fillRect(ox + 10, 2, 2, 2);
    }
    // orientación: nuca oscura si mira al norte, ojos si mira al sur/costados
    ctx.fillStyle = hex(PAL.ink);
    if (dir === 'north') {
      ctx.fillRect(ox + 5, 5, 6, 3);
    } else if (dir === 'south') {
      ctx.fillRect(ox + 6, 7, 1, 1);
      ctx.fillRect(ox + 9, 7, 1, 1);
    } else if (dir === 'east') {
      ctx.fillRect(ox + 9, 7, 1, 1);
    } else {
      ctx.fillRect(ox + 6, 7, 1, 1);
    }
  });
  tex!.refresh();
  // un frame por dirección: 0 sur · 1 norte · 2 este · 3 oeste
  dirs.forEach((_, i) => tex!.add(i, 0, i * W, 0, W, H));
}

export const FACING_FRAME: Record<string, number> = { south: 0, north: 1, east: 2, west: 3 };

/** Cuerpo/sombrero por personaje — misma silueta que ve WorldScene en el sprite del mundo. */
export const NPC_COLORS: Record<string, [number, number, HatStyle]> = {
  npc_lewis: [PAL.ink2, PAL.ink, 'copa'],
  npc_edwyn: [PAL.soil, PAL.soil2, 'boina'],
  npc_matthews: [PAL.ink, PAL.bone, 'copa'],
  npc_berwyn: [PAL.soil2, PAL.sandLight, 'copa'],
  npc_pepperell: [PAL.slate, PAL.bone, 'copa'],
  npc_mari: [PAL.clayDark, PAL.clayPale, 'boina'],
  npc_dafydd: [PAL.soil2, PAL.coiron, 'boina'],
};

const PC_COLORS: Record<string, [number, number, HatStyle]> = {
  pc_m: [PAL.clay, PAL.ink, 'boina'],
  pc_f: [PAL.clayDark, PAL.wheat, 'boina'],
};

/**
 * Retratos placeholder de diálogo (48×48), uno por personaje × expresión, con el
 * mismo color de cuerpo/sombrero que el sprite del mundo — así se distingue quién
 * habla mientras no exista el PNG real (docs/05-prompts-arte.txt §1). DialogueBox
 * los usa solo si no hay arte real cargado (src/util/assets.ts).
 */
export function makePortraits(scene: Phaser.Scene): void {
  const moods: Array<'neutral' | 'tenso' | 'calido'> = ['neutral', 'tenso', 'calido'];
  const all: Array<[string, number, number, HatStyle]> = [
    ...Object.entries(NPC_COLORS).map(([id, c]): [string, number, number, HatStyle] => [id.replace(/^npc_/, ''), ...c]),
    ...Object.entries(PC_COLORS).map(([id, c]): [string, number, number, HatStyle] => [id, ...c]),
  ];
  for (const [id, body, hat, style] of all) {
    for (const mood of moods) makePortrait(scene, `portrait_${id}_${mood}`, body, hat, style, mood);
  }
}

function makePortrait(
  scene: Phaser.Scene,
  key: string,
  body: number,
  hat: number,
  hatStyle: HatStyle,
  mood: 'neutral' | 'tenso' | 'calido',
): void {
  if (scene.textures.exists(key)) return;
  const W = 48;
  const H = 48;
  const tex = scene.textures.createCanvas(key, W, H);
  const ctx = tex!.getContext();

  ctx.fillStyle = hex(PAL.ink2);
  ctx.fillRect(0, 0, W, H);
  // hombros
  ctx.fillStyle = hex(body);
  ctx.fillRect(4, 30, 40, 18);
  // cabeza
  ctx.fillStyle = hex(PAL.clayPale);
  ctx.fillRect(15, 8, 18, 22);
  // sombrero: misma silueta que el sprite del mundo
  ctx.fillStyle = hex(hat);
  if (hatStyle === 'copa') {
    ctx.fillRect(12, 7, 24, 3);
    ctx.fillRect(20, 0, 8, 7);
  } else {
    ctx.fillRect(10, 5, 28, 6);
    ctx.fillRect(32, 2, 6, 6);
  }
  // cejas/ojos: apenas cambian con el ánimo, para no depender solo del color de fondo
  ctx.fillStyle = hex(PAL.ink);
  const browY = mood === 'tenso' ? 20 : 19;
  ctx.fillRect(19, browY, 3, 2);
  ctx.fillRect(27, browY, 3, 2);
  ctx.fillRect(19, 24, 3, 3);
  ctx.fillRect(27, 24, 3, 3);

  tex!.refresh();
}

/** Props chicos: cajón, mata de jarilla, fogón, boca de cueva. */
export function makeProps(scene: Phaser.Scene): void {
  // oscuro con banda dorada: PAL.soil2 se perdía contra la arena (mismo tono)
  makeRect(scene, 'prop_cajon', 12, 10, PAL.ink2, PAL.wheat);
  makeRect(scene, 'prop_jarilla', 12, 12, PAL.scrubDark, PAL.moss);
  makeRect(scene, 'prop_fogon', 14, 10, PAL.blood, PAL.wheat);
  makeRect(scene, 'prop_cueva', 16, 18, PAL.ink, PAL.clayDark);
  makeRect(scene, 'prop_agua', 14, 8, PAL.seaLight, PAL.seaPale);
  makeShip(scene);
}

/**
 * El Mimosa, anclado frente a la costa (docs/04-guia-historica.md). Casco simple +
 * gallardete con los colores de la bandera galesa (verde, blanco, el rojo del dragón),
 * lo justo para que se note qué barco es sin dibujar un dragón en 6 px.
 */
function makeShip(scene: Phaser.Scene, key = 'prop_mimosa'): void {
  if (scene.textures.exists(key)) return;
  const W = 36;
  const H = 26;
  const tex = scene.textures.createCanvas(key, W, H);
  const ctx = tex!.getContext();

  // casco
  ctx.fillStyle = hex(PAL.ink);
  ctx.fillRect(2, 14, 32, 7);
  ctx.fillStyle = hex(PAL.soil2);
  ctx.fillRect(3, 15, 30, 5);
  ctx.fillStyle = hex(PAL.soil);
  ctx.fillRect(6, 20, 24, 2); // línea de flotación

  // cubierta
  ctx.fillStyle = hex(PAL.sandLight);
  ctx.fillRect(4, 13, 28, 1);

  // mástil
  ctx.fillStyle = hex(PAL.ink);
  ctx.fillRect(17, 2, 1, 12);

  // gallardete: verde y blanco, con un toque de rojo — bandera galesa, no el dragón entero
  ctx.fillStyle = hex(PAL.moss);
  ctx.fillRect(18, 2, 7, 3);
  ctx.fillStyle = hex(PAL.snow);
  ctx.fillRect(18, 5, 7, 3);
  ctx.fillStyle = hex(PAL.blood);
  ctx.fillRect(19, 4, 3, 2);

  tex!.refresh();
}

function makeRect(scene: Phaser.Scene, key: string, w: number, h: number, fill: number, edge: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex!.getContext();
  ctx.fillStyle = hex(edge);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hex(fill);
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = hex(edge);
  for (let x = 1; x < w - 1; x += 3) ctx.fillRect(x, Math.floor(h / 2), 1, 1);
  tex!.refresh();
}

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
