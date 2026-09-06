import Phaser from 'phaser';
import { GAME_CONFIG } from './config';
import { BootScene } from './scenes/BootScene';
import { CampScene } from './scenes/CampScene';
import { CargoScene } from './scenes/CargoScene';
import { UiScene } from './scenes/UiScene';
import { WorldScene } from './scenes/WorldScene';
import { applyIntegerScale } from './util/scale';

const game = new Phaser.Game({
  ...GAME_CONFIG,
  scene: [BootScene, WorldScene, UiScene, CampScene, CargoScene],
});

applyIntegerScale(game);

// evita el zoom por doble tap y el pull-to-refresh en móviles
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
