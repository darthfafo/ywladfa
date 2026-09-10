import Phaser from 'phaser';

/** Fuente y tamaños de todo el texto del juego. Un solo lugar, nada de strings sueltos por escena. */
export const FONT_FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Fuente retro clásica (index.html la carga desde Google Fonts) para todo lo que es
 * "cromado" del juego, no texto narrado: títulos, HUD, nombres de diálogo y
 * botones/opciones. A las mayúsculas acentuadas del español (Á/É/Í/Ó/Ú) les falta el
 * glifo propio y caen en el de su minúscula (un "SUCEDIÓ" en un título se lee
 * "SUCEDIó") — un costo conocido y aceptado a cambio de mantener el aspecto pixel
 * clásico en títulos y botones, que es lo que se pidió. */
export const RETRO_FONT = '"Press Start 2P", ui-monospace, "SF Mono", Menlo, monospace';

/** Solo para texto narrado/leído (DialogueBox.bodyText, párrafos largos): Press
 * Start 2P es bien ancha por carácter a estos tamaños y hace que una línea entera
 * necesite una página extra por una sola palabra de sobra. Jersey 10 es bastante
 * más angosta y tiene el alfabeto español completo (sin el problema de arriba) —
 * mejor para leer un párrafo, aunque no combine con el pixel duro de RETRO_FONT en
 * títulos/botones (es la fuente que se lee, no la que se mira). */
export const NARRATIVE_FONT = '"Jersey 10", ui-monospace, "SF Mono", Menlo, monospace';

export const FONT = {
  tiny: '9px', // pie de portada, "carga"
  small: '10px', // botón de acción, glifos de recursos
  body: '11px', // diálogo, HUD, toasts — el grueso del texto del juego
  title: '13px', // títulos de overlay, subtítulo de portada
  hero: '24px', // título de portada
} as const;

/**
 * Fuerza filtrado lineal en la textura auto-generada de un Text.
 * Con pixelArt:true, Phaser aplica NEAREST a toda textura por default, lo que
 * arruina el antialiasing del texto (se ve dentado/sucio). Interino hasta
 * migrar a bitmap font — ver docs/03-assets.md §6 y CLAUDE.md R4.
 *
 * Phaser regenera la textura del Text en cada setText() cuyo tamaño cambia,
 * y esa textura nueva vuelve a heredar NEAREST. Por eso hay que reaplicar
 * el filtro después de cada setText, no solo al crear el objeto.
 */
export function crisp<T extends Phaser.GameObjects.Text>(text: T): T {
  const applyFilter = (): void => text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  applyFilter();

  const originalSetText = text.setText.bind(text);
  text.setText = ((value: string | string[]) => {
    const result = originalSetText(value);
    applyFilter();
    return result;
  }) as typeof text.setText;

  return text;
}
