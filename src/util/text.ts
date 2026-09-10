import Phaser from 'phaser';

/** Fuente y tamaños de todo el texto del juego. Un solo lugar, nada de strings sueltos por escena. */
export const FONT_FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Fuente retro (index.html la carga desde Google Fonts) para títulos, nombres de
 * diálogo y botones de acción. */
export const RETRO_FONT = '"Press Start 2P", ui-monospace, "SF Mono", Menlo, monospace';

/** Solo para el cuerpo narrado de los diálogos (DialogueBox.bodyText): Press Start
 * 2P es bien ancha por carácter y la mayoría de las líneas del juego terminaban
 * pasando a una segunda página por una sola palabra de sobra. Jersey 10 (index.html)
 * es más angosta a la misma altura de línea — mismo espíritu pixel/retro, entra
 * más texto por página. */
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
