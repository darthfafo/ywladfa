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

function baseName(path: string): string {
  return path.split('/').pop()!.replace(/\.png$/, '');
}

const portraitUrls = new Map(Object.entries(portraitFiles).map(([path, url]) => [baseName(path), url]));
const sceneUrls = new Map(Object.entries(sceneFiles).map(([path, url]) => [baseName(path), url]));

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
}
