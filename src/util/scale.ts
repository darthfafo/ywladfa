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

  const viewportSize = (): { w: number; h: number } => {
    const vv = window.visualViewport;
    return vv ? { w: vv.width, h: vv.height } : { w: window.innerWidth, h: window.innerHeight };
  };

  const fit = (): void => {
    const { w, h } = viewportSize();
    const dpr = window.devicePixelRatio || 1;

    if (dpr >= 2) {
      parent.style.width = `${w}px`;
      parent.style.height = `${h}px`;
    } else {
      const raw = Math.min(w / VIEW.width, h / VIEW.height);
      const zoom = Math.max(1, Math.floor(raw));
      parent.style.width = `${VIEW.width * zoom}px`;
      parent.style.height = `${VIEW.height * zoom}px`;
    }
    game.scale.refresh();
  };

  // la barra del navegador, la rotación Y el cierre del teclado virtual tardan en
  // asentarse; un solo intento en el momento del evento puede leer medidas a mitad
  // de la animación (sobre todo `visualViewport` al cerrarse el teclado) y el juego
  // queda "trabado" en el tamaño chico — reintenta un par de veces más por las dudas.
  const fitWithRetries = (): void => {
    fit();
    setTimeout(fit, 150);
    setTimeout(fit, 400);
  };

  fit();
  window.addEventListener('resize', fitWithRetries);
  window.addEventListener('orientationchange', fitWithRetries);
  window.visualViewport?.addEventListener('resize', fitWithRetries);
  window.visualViewport?.addEventListener('scroll', fitWithRetries);
}
