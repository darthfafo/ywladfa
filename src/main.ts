import Phaser from 'phaser';
import { GAME_CONFIG } from './config';
import { game as coreGame } from './core/Game';
import { BootScene } from './scenes/BootScene';
import { CampScene } from './scenes/CampScene';
import { CargoScene } from './scenes/CargoScene';
import { saveSystem } from './systems/SaveSystem';
import { UiScene } from './scenes/UiScene';
import { WorldScene } from './scenes/WorldScene';
import { applyIntegerScale } from './util/scale';

const game = new Phaser.Game({
  ...GAME_CONFIG,
  scene: [BootScene, WorldScene, UiScene, CampScene, CargoScene],
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
