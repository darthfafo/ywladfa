import Phaser from 'phaser';

/** Fuente y tamaños de todo el texto del juego. Un solo lugar, nada de strings sueltos por escena. */
export const FONT_FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Fuente retro (index.html la carga desde Google Fonts), la única fuente "de juego"
 * — títulos, HUD, nombres y cuerpo de diálogo, botones de acción, opciones. Un solo
 * font-family en todos lados: mezclar esta con Press Start 2P (como se hizo un rato
 * en esta misma sesión) se leía inconsistente, dos estilos de letra distintos en la
 * misma pantalla. No es Press Start 2P: a esa fuente le faltan los glifos de
 * mayúsculas acentuadas del español (Á/É/Í/Ó/Ú se dibujan como su minúscula — un
 * "SUCEDIÓ" se leía "SUCEDIó"), inaceptable para un juego en español (CLAUDE.md R6).
 * Jersey 10 tiene el alfabeto español completo y es bastante más angosta por
 * carácter — a igual tamaño en px entra más texto y hay menos riesgo de que una
 * palabra se vaya sola a la página siguiente. */
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
