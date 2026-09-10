import Phaser from 'phaser';

/** Fuente y tamaños de todo el texto del juego. Un solo lugar, nada de strings sueltos por escena. */
export const FONT_FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Fuente retro (index.html la carga desde Google Fonts) para títulos, diálogos y
 * botones de acción. No es Press Start 2P: a esa fuente le faltan los glifos de
 * mayúsculas acentuadas del español (Á/É/Í/Ó/Ú se dibujan como su minúscula — un
 * "SUCEDIÓ" en el título se leía "SUCEDIó"), inaceptable para un juego en español
 * (CLAUDE.md R6). Jersey 10 tiene el mismo espíritu pixel/retro con el alfabeto
 * español completo, mayúsculas incluidas. */
export const RETRO_FONT = '"Jersey 10", ui-monospace, "SF Mono", Menlo, monospace';

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
