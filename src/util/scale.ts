import Phaser from 'phaser';
import { VIEW } from '@/config';

/**
 * Escalado 9:16.
 *
 * `Phaser.Scale.FIT` escala al tamaño del contenedor, así que el truco es dimensionar
 * el contenedor, no pelearse con el zoom:
 *
 *  - **DPR ≥ 2 (teléfonos):** el contenedor ocupa todo, FIT usa el factor exacto que entre
 *    aunque sea fraccionario. A esa densidad la diferencia de tamaño entre píxeles vecinos
 *    es física­mente invisible y a cambio se aprovecha toda la pantalla.
 *  - **DPR = 1 (desktop):** el contenedor se fija a un múltiplo entero de 270×480, así FIT
 *    cae exacto en ×2 / ×3 / ×4 y no hay píxeles de tamaño desparejo.
 *
 * Lo que sobra queda como banda del color más oscuro de la paleta, sin decorar.
 *
 * `window.innerHeight` en mobile mide el viewport LAYOUT, que puede incluir el área
 * tapada por la barra de direcciones — con eso el contenedor queda más alto de lo que
 * en verdad se ve, y la bandeja (joystick/diálogo) termina recortada abajo. Por eso acá
 * se usa `visualViewport` cuando existe: es el tamaño realmente visible, y dispara sus
 * propios eventos cuando la barra del navegador aparece/desaparece o el teléfono rota,
 * sin depender de un timeout adivinado.
 */
export function applyIntegerScale(game: Phaser.Game): void {
  const parent = document.getElementById('game');
  if (!parent) return;

  // El teclado virtual angosta `visualViewport.height` mucho (250-350px en un celular),
  // muchísimo más que cualquier barra de navegador (como mucho ~100px). El único <input>
  // del juego (BootScene.renderName) vive arriba de todo, justamente para no quedar
  // tapado por ningún teclado — así que el juego no necesita encogerse cuando aparece.
  // Ante una reducción grande se ignora y se sigue usando el último alto "sin teclado"
  // conocido, en vez de perseguir un valor chico y transitorio (que además a veces
  // nunca se termina de recuperar al cerrarse el teclado).
  let lastStableHeight = window.innerHeight;

  const viewportSize = (): { w: number; h: number } => {
    const vv = window.visualViewport;
    if (!vv) return { w: window.innerWidth, h: window.innerHeight };
    const keyboardLikelyOpen = window.innerHeight - vv.height > 120;
    if (!keyboardLikelyOpen) lastStableHeight = vv.height;
    return { w: vv.width, h: keyboardLikelyOpen ? lastStableHeight : vv.height };
  };

  // `devicePixelRatio >= 2` sola no distingue un teléfono de una Mac con pantalla
  // Retina: una notebook de escritorio con mouse también reporta dpr 2, pero ahí
  // "aprovechar toda la pantalla" (una ventana ancha, no 9:16) estira el contenedor
  // muy por fuera de la proporción del juego — Phaser sigue calculando el
  // letterboxing bien, pero la superposición HTML (joystick, botón, HUD) queda
  // mucho más lejos del centro de lo esperado. `pointer: coarse` sí es específico
  // de touch: una Mac con trackpad/mouse da `false` aunque tenga Retina.
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

  const fit = (): void => {
    const { w, h } = viewportSize();
    const dpr = window.devicePixelRatio || 1;

    if (dpr >= 2 && isTouchPrimary) {
      parent.style.width = `${w}px`;
      parent.style.height = `${h}px`;
    } else {
      // Antes esto entraba solo en múltiplos enteros de 270×480 (×1/×2/×3...) para
      // que cada píxel del mundo cayera parejo — pero el canvas ya se muestra con
      // image-rendering:auto (bilinear, ver index.html) desde que el texto pasó a
      // vivir ahí: ya no hay píxeles "parejos" que proteger, y de paso el celular ya
      // escala con el factor fraccionario que entre (rama de arriba). El único
      // efecto real del entero era, en una ventana de escritorio común (alto bien
      // por debajo de 960px), quedar pegado a ×1 (270×480) en medio de una ventana
      // mucho más grande — se veía "achicado" sin necesidad.
      const raw = Math.min(w / VIEW.width, h / VIEW.height);
      const zoom = Math.max(1, raw);
      parent.style.width = `${VIEW.width * zoom}px`;
      parent.style.height = `${VIEW.height * zoom}px`;
    }
    game.scale.refresh();
  };

  // la barra del navegador y la rotación tardan en asentarse; un solo intento en el
  // momento del evento puede leer medidas a mitad de la animación — reintenta un par
  // de veces más por las dudas. El arranque en frío en un celular (primera vez que
  // se abre la URL, no una recarga) es el caso más lento de asentar: por eso el
  // último reintento llega bastante más tarde que los de un resize normal.
  const fitWithRetries = (): void => {
    fit();
    setTimeout(fit, 150);
    setTimeout(fit, 400);
    setTimeout(fit, 1000);
  };

  fitWithRetries();
  window.addEventListener('resize', fitWithRetries);
  window.addEventListener('orientationchange', fitWithRetries);
  window.visualViewport?.addEventListener('resize', fitWithRetries);
  window.visualViewport?.addEventListener('scroll', fitWithRetries);

  // En frío, `preload()` de BootScene puede tardar bastante más que el último
  // reintento de arriba (1000ms) — varios MB sin caché en una conexión de celular
  // lenta. La barra de Safari sigue animándose/asentándose durante esa espera (la
  // pantalla de carga de index.html la tapa), así que para cuando el juego se
  // muestra de verdad (acá) la medida de hace un segundo ya quedó vieja: el
  // contenedor se armaba con un alto de sobra y, centrado por el body, se comía
  // la franja de arriba (título) contra el borde superior real de la pantalla.
  // Re-ajustar justo en este momento — el que de verdad importa, no uno adivinado
  // por tiempo — lo agarra siempre, sea cual sea cuánto tardó la descarga.
  window.addEventListener('wladfa:ready-to-show', fitWithRetries);

  // remedio de última instancia: si el resize de arriba no llegó a tiempo o con la
  // medida correcta, cada toque en la pantalla reajusta el tamaño ANTES de que Phaser
  // calcule dónde cayó ese mismo toque (capture, no bubble: corre primero) — así un
  // primer toque "en falso" nunca hace falta para destrabar el encuadre.
  document.addEventListener('touchstart', fit, { passive: true, capture: true });
  document.addEventListener('pointerdown', fit, { passive: true, capture: true });
}
