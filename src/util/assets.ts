import Phaser from 'phaser';

/**
 * `src/assets/` (no `public/`) porque el proyecto tiene un modo de build de un solo
 * archivo (`npm run build:single`, docs/02-arquitectura.md): los assets bajo `src/`
 * pasan por el pipeline de Vite y `vite-plugin-singlefile` los puede incrustar como
 * data URI; lo que va en `public/` se copia suelto y rompería ese modo.
 *
 * `import.meta.glob` arma el mapa de lo que YA existe. Si un archivo todavía no
 * está, simplemente no aparece acá — no hay que mantener una lista a mano ni la
 * carga se rompe por un 404 (R3: nada de listas fijas que se desactualizan solas).
 */
const portraitFiles = import.meta.glob('../assets/portraits/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const sceneFiles = import.meta.glob('../assets/scenes/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const propFiles = import.meta.glob('../assets/props/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// íconos chicos de un solo ítem (ej. los bultos de CargoScene) — mismo espíritu que
// los props del mapa (pixel art, no ilustración pintada) pero nunca se plantan en
// el mundo, así que van en su propia carpeta en vez de mezclarse con esos.
const iconFiles = import.meta.glob('../assets/icons/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function baseName(path: string): string {
  return path.split('/').pop()!.replace(/\.png$/, '');
}

const portraitUrls = new Map(Object.entries(portraitFiles).map(([path, url]) => [baseName(path), url]));
const sceneUrls = new Map(Object.entries(sceneFiles).map(([path, url]) => [baseName(path), url]));
const propUrls = new Map(Object.entries(propFiles).map(([path, url]) => [baseName(path), url]));
const iconUrls = new Map(Object.entries(iconFiles).map(([path, url]) => [baseName(path), url]));

/** Props que son hoja de sprites (varios frames cuadrados, uno al lado del otro,
 * en un mismo PNG) en vez de una imagen sola — frameSize es el lado de cada
 * cuadro, no el total. Si se regenera el PNG a otra resolución, actualizar acá.
 * El resto de los props de `src/assets/props/` son imagen única. */
const PROP_SPRITESHEETS: Record<string, { frames: number; frameSize: number }> = {
  gaviotas: { frames: 3, frameSize: 64 },
};

export type Mood = 'neutral' | 'tenso' | 'calido';

export function portraitTextureKey(id: string, mood: Mood): string {
  return `portrait_${id}_${mood}`;
}

/** 'pc' → pc_m/pc_f según género elegido; 'npc_x' → 'x'; 'narrator' → sin retrato. */
export function portraitIdForSpeaker(speakerId: string, gender: 'f' | 'm'): string | null {
  if (speakerId === 'pc') return `pc_${gender}`;
  if (speakerId.startsWith('npc_')) return speakerId.slice(4);
  return null;
}

export function sceneTextureKey(id: string): string {
  return `scene_${id}`;
}

/** true si YA hay PNG real para esa escena (para decidir si mostrar imagen o placeholder). */
export function hasSceneArt(id: string): boolean {
  return sceneUrls.has(id);
}

/**
 * Fondo cinemático de pantalla completa si ya existe el PNG de esa escena — cubre el
 * rectángulo (x,y,w,h) sin deformarse (como background-size:cover: las escenas se
 * piden en 3:4, más "cuadradas" que la pantalla 9:16, así que recorta los costados
 * en vez de estirar) y con filtro lineal (son ilustraciones pintadas, no pixel art de
 * bordes duros; con pixelArt:true el filtro por default es NEAREST y queda dentado).
 * Devuelve null si el PNG todavía no existe — el llamador decide el placeholder.
 */
export function addSceneBackground(
  scene: Phaser.Scene,
  sceneId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Image | null {
  const key = sceneTextureKey(sceneId);
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(x, y, key);
  const scale = Math.max(w / img.width, h / img.height);
  img.setScale(scale);
  img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return img;
}

export function propTextureKey(id: string): string {
  return `prop_art_${id}`;
}

/** true si YA hay PNG real para ese elemento de mapa (guanaco, coirón, etc). */
export function hasPropArt(id: string): boolean {
  return propUrls.has(id);
}

/**
 * Prop suelto (no de pantalla completa) si ya existe el PNG: lo escala a `size`
 * píxeles de lado mayor mantenendo proporción. A diferencia de las escenas
 * cinemáticas (pintadas), estos son elementos de mapa en el mismo estilo pixel
 * art que el resto del juego — nada de filtro lineal, que a estos tamaños tan
 * chicos los emborronaba en vez de suavizarlos. Se apoya en el NEAREST que ya
 * es default de todo el juego (`pixelArt: true`, config.ts).
 * Devuelve null si el PNG no existe todavía — el llamador decide qué hacer
 * (nada, o el placeholder de código).
 */
export function addPropImage(
  scene: Phaser.Scene,
  id: string,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Image | null {
  const key = propTextureKey(id);
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(x, y, key);
  const scale = size / Math.max(img.width, img.height);
  img.setScale(scale);
  return img;
}

export function iconTextureKey(id: string): string {
  return `icon_${id}`;
}

/** true si YA hay PNG real para ese ícono (ej. "bulto_harina", CargoScene). */
export function hasIconArt(id: string): boolean {
  return iconUrls.has(id);
}

/** Ícono chico si ya existe el PNG: mismo criterio que addPropImage (pixel art,
 * NEAREST, sin filtro lineal) — se escala a `size` píxeles de lado mayor. Devuelve
 * null si el PNG no existe todavía. */
export function addIconImage(
  scene: Phaser.Scene,
  id: string,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Image | null {
  const key = iconTextureKey(id);
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(x, y, key);
  const scale = size / Math.max(img.width, img.height);
  img.setScale(scale);
  return img;
}

/** Registra en el loader de la escena todo el arte real que exista bajo src/assets/. */
export function preloadArt(scene: Phaser.Scene): void {
  for (const [name, url] of portraitUrls) {
    const match = /^(.+)_(neutral|tenso|calido)$/.exec(name);
    if (!match) continue;
    scene.load.image(portraitTextureKey(match[1]!, match[2] as Mood), url);
  }
  for (const [id, url] of sceneUrls) {
    scene.load.image(sceneTextureKey(id), url);
  }
  for (const [id, url] of iconUrls) {
    scene.load.image(iconTextureKey(id), url);
  }
  for (const [id, url] of propUrls) {
    const sheet = PROP_SPRITESHEETS[id];
    if (sheet) {
      scene.load.spritesheet(propTextureKey(id), url, {
        frameWidth: sheet.frameSize,
        frameHeight: sheet.frameSize,
      });
    } else {
      scene.load.image(propTextureKey(id), url);
    }
  }
}
