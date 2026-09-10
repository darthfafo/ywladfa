import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { saveSystem } from '@/systems/SaveSystem';
import { crisp, RETRO_FONT } from '@/util/text';

interface TransitionData {
  /** id del nivel que sigue (`data/levels/*.json` → `next`). Todavía no existe
   * ningún nivel más allá de nivel-01 — hasta que exista, esta pantalla es el
   * cierre real en vez de un mundo sin nada más que hacer o un error silencioso. */
  next: string;
}

/**
 * Pantalla de cierre de nivel cuando `next` todavía no es jugable. Pantalla
 * completa en negro, sin HUD ni mundo detrás (docs/02-arquitectura.md — todavía
 * no existe TransitionScene "de verdad" con tarjeta narrativa por nivel; esto
 * cubre el caso general: cualquier nivel que termine y no tenga a dónde ir).
 */
export class TransitionScene extends Phaser.Scene {
  constructor() {
    super('Transition');
  }

  create(_data: TransitionData): void {
    this.scene.stop('World');
    this.scene.stop('Ui');

    this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void, 1).setOrigin(0, 0);

    crisp(
      this.add
        .text(VIEW.width / 2, VIEW.height / 2 - 24, 'Continuará…', {
          fontFamily: RETRO_FONT,
          fontSize: '13px',
          color: '#D9A845',
        })
        .setOrigin(0.5, 0.5)
        .setResolution(4),
    );

    this.renderButton(VIEW.width / 2, VIEW.height / 2 + 30, '› Jugar otra vez', () => this.playAgain());
  }

  private renderButton(cx: number, y: number, label: string, onPick: () => void): void {
    const text = crisp(
      this.add
        .text(cx, y, label, { fontFamily: RETRO_FONT, fontSize: '12px', color: '#BFD3D8' })
        .setOrigin(0.5, 0.5)
        .setResolution(4),
    );
    const w = text.width + 32;
    const h = text.height + 16;
    const box = this.add
      .rectangle(cx, y, w, h, PAL.ink2, 0.9)
      .setStrokeStyle(1, PAL.slate)
      .setInteractive({ useHandCursor: true })
      .setDepth(-1);
    box.on('pointerover', () => {
      box.setStrokeStyle(1, PAL.wheat);
      text.setColor('#D9A845');
    });
    box.on('pointerout', () => {
      box.setStrokeStyle(1, PAL.slate);
      text.setColor('#BFD3D8');
    });
    box.on('pointerdown', onPick);

    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', onPick);
    kb?.on('keydown-E', onPick);
  }

  /** Borra la partida guardada — sin esto, "jugar otra vez" volvía a la portada
   * pero el título seguía ofreciendo "Continuar" con el nivel ya terminado. */
  private playAgain(): void {
    saveSystem.clear();
    this.scene.start('Boot');
  }
}
