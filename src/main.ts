import Phaser from 'phaser';
import { GAME_CONFIG } from './config';
import { game as coreGame } from './core/Game';
import { BootScene } from './scenes/BootScene';
import { CampScene } from './scenes/CampScene';
import { CargoScene } from './scenes/CargoScene';
import { saveSystem } from './systems/SaveSystem';
import { TransitionScene } from './scenes/TransitionScene';
import { UiScene } from './scenes/UiScene';
import { WorldScene } from './scenes/WorldScene';
import { applyIntegerScale } from './util/scale';

/**
 * Cartel de error visible en pantalla, ANTES de crear el juego (así agarra
 * cualquier excepción, hasta las que pasan durante el propio arranque de
 * Phaser). Sin esto, un error sin capturar en producción deja el juego
 * "trabado" en cualquier frame que haya quedado dibujado, sin ningún rastro
 * de qué pasó — ni consola de DevTools a mano en un celular. El texto entero
 * queda a la vista para poder mandarlo tal cual, sin adivinar la causa.
 */
function showFatalError(message: string): void {
  const id = 'wladfa-fatal-error';
  if (document.getElementById(id)) return; // no apilar carteles si hay más de un error
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText =
    'position:fixed; inset:0; z-index:99999; background:#3a0f0f; color:#f2f2ec; ' +
    'font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:12px; line-height:1.5; ' +
    'padding:16px; overflow:auto; white-space:pre-wrap; word-break:break-word;';
  el.textContent = 'Y Wladfa se rompió acá — mandá este texto tal cual:\n\n' + message;
  document.body.appendChild(el);
}
window.addEventListener('error', (e) => {
  showFatalError(`${e.message}\n${e.error?.stack ?? '(sin stack)'}`);
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  showFatalError(reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason));
});

const game = new Phaser.Game({
  ...GAME_CONFIG,
  scene: [BootScene, WorldScene, UiScene, CampScene, CargoScene, TransitionScene],
});

applyIntegerScale(game);

// solo en `npm run dev` (Vite lo saca del bundle de producción): acceso directo al
// estado desde la consola para probar sin tener que jugar el arranque de punta a
// punta cada vez — `wladfa.game.state`, `wladfa.save.save(wladfa.game.state)`,
// `wladfa.phaser.scene.start('World')`.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).wladfa = { game: coreGame, phaser: game, save: saveSystem };
}

// evita el zoom por doble tap y el pull-to-refresh en móviles
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
