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

// sprites de personaje: hoja de 4 direcciones (sur·norte·este·oeste, en ese
// orden — mismo layout que makeCharacter() en textures.ts, así FACING_FRAME
// sirve para las dos fuentes sin cambios) armada a partir de lo que se genera
// a partir de los retratos (ver docs/06-prompts-sprites.txt). Carpeta separada
// de props: a diferencia de esos, tienen 4 frames fijos, no una imagen sola.
const spriteFiles = import.meta.glob('../assets/sprites/*.png', {
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
const spriteUrls = new Map(Object.entries(spriteFiles).map(([path, url]) => [baseName(path), url]));

/** Props que son hoja de sprites (varios frames cuadrados, uno al lado del otro,
 * en un mismo PNG) en vez de una imagen sola — frameSize es el lado de cada
 * cuadro, no el total. Si se regenera el PNG a otra resolución, actualizar acá.
 * El resto de los props de `src/assets/props/` son imagen única. */
const PROP_SPRITESHEETS: Record<string, { frames: number; frameSize: number }> = {
  gaviotas: { frames: 3, frameSize: 22 },
};

/** Tamaño de cuadro por personaje en su hoja de 4 direcciones — 50×67 por
 * default (ver scripts/compose-sprites.py), salvo Dafydd (9 años, más chico a
 * propósito, misma proporción). Si un PNG no tiene entrada acá usa el
 * default. Si se regenera algún PNG a otro tamaño, actualizar acá también. */
const SPRITE_FRAME_SIZE: Record<string, { w: number; h: number }> = {
  npc_dafydd: { w: 42, h: 56 },
};
const DEFAULT_SPRITE_FRAME = { w: 50, h: 67 };

export function spriteTextureKey(id: string): string {
  return `sprite_art_${id}`;
}

/** true si YA hay hoja de 4 direcciones real para ese personaje (pc_m, pc_f, npc_lewis, ...). */
export function hasSpriteArt(id: string): boolean {
  return spriteUrls.has(id);
}

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
 * Prop suelto (no de pantalla completa) si ya existe el PNG — a su tamaño
 * NATIVO, escala 1, sin reescalar. Ya son pixel art hecho a mano a la
 * resolución final (ver scripts/resize-assets.py, que las deja del lado
 * derecho de src/assets/props/ ya en su tamaño de juego); reescalarlas acá
 * —con cualquier filtro, NEAREST o LINEAR— a un factor no entero les
 * deformaba los bordes, mismo problema que ya se encontró y resolvió para
 * los sprites de personaje. Si hay que agrandar/achicar un prop, se
 * regenera con ese script a un tamaño nuevo, no se escala en el juego.
 * Devuelve null si el PNG no existe todavía — el llamador decide qué hacer
 * (nada, o el placeholder de código).
 */
export function addPropImage(scene: Phaser.Scene, id: string, x: number, y: number): Phaser.GameObjects.Image | null {
  const key = propTextureKey(id);
  if (!scene.textures.exists(key)) return null;
  return scene.add.image(x, y, key);
}

export function iconTextureKey(id: string): string {
  return `icon_${id}`;
}

/** true si YA hay PNG real para ese ícono (ej. "bulto_harina", CargoScene). */
export function hasIconArt(id: string): boolean {
  return iconUrls.has(id);
}

/** Ícono chico si ya existe el PNG: mismo criterio que addPropImage — tamaño
 * nativo, escala 1, sin reescalar (ver scripts/resize-assets.py). Devuelve
 * null si el PNG no existe todavía. */
export function addIconImage(scene: Phaser.Scene, id: string, x: number, y: number): Phaser.GameObjects.Image | null {
  const key = iconTextureKey(id);
  if (!scene.textures.exists(key)) return null;
  return scene.add.image(x, y, key);
}

/** Registra en el loader de la escena todo el arte real que exista bajo src/assets/. */
export function preloadArt(scene: Phaser.Scene): void {
  const realArtKeys: string[] = [];
  for (const [name, url] of portraitUrls) {
    const match = /^(.+)_(neutral|tenso|calido)$/.exec(name);
    if (!match) continue;
    const key = portraitTextureKey(match[1]!, match[2] as Mood);
    scene.load.image(key, url);
    realArtKeys.push(key);
  }
  for (const [id, url] of sceneUrls) {
    const key = sceneTextureKey(id);
    scene.load.image(key, url);
    realArtKeys.push(key);
  }
  for (const [id, url] of iconUrls) {
    const key = iconTextureKey(id);
    scene.load.image(key, url);
    realArtKeys.push(key);
  }
  for (const [id, url] of propUrls) {
    const sheet = PROP_SPRITESHEETS[id];
    const key = propTextureKey(id);
    if (sheet) {
      scene.load.spritesheet(key, url, { frameWidth: sheet.frameSize, frameHeight: sheet.frameSize });
    } else {
      scene.load.image(key, url);
    }
    realArtKeys.push(key);
  }
  // sprites de personaje: NEAREST (el default global), no LINEAR como el resto
  // del arte real de acá abajo. A diferencia de los props/retratos/escenas
  // (ilustración pintada, sombreado suave), estos se pidieron explícitamente
  // pixel art de bordes duros (docs/06-prompts-sprites.txt) — LINEAR les
  // difumina justo el borde de píxel que es parte del estilo, se leen borrosos
  // en vez de nítidos. No entran en realArtKeys a propósito.
  for (const [id, url] of spriteUrls) {
    const size = SPRITE_FRAME_SIZE[id] ?? DEFAULT_SPRITE_FRAME;
    const key = spriteTextureKey(id);
    scene.load.spritesheet(key, url, { frameWidth: size.w, frameHeight: size.h });
  }

  // el juego entero corre con pixelArt:true (GAME_CONFIG) — filtro NEAREST global,
  // lo que hace falta para que el tileset/personajes procedurales (bloques de color
  // a propósito) se vean nítidos. Pero este arte real es ilustración pintada, no
  // bloques de píxel: escalada con NEAREST a un tamaño que casi nunca es un
  // múltiplo entero del original (ver addPropImage/addIconImage, `size` es un
  // ancho en px de destino, no un factor 1x/2x/3x), el resultado son bordes
  // deformados/con flecos, no "más pixelado" en el sentido prolijo sino distorsionado.
  // LINEAR (suavizado) para ESTAS texturas puntuales, sin tocar el default global,
  // arregla el escalado sin afectar nada de lo procedural.
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    for (const key of realArtKeys) {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  });
}
