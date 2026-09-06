import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

/**
 * Portada. En 9:16 no hay hero gigante: el título arriba, el mundo insinuado abajo.
 * Un solo toque en cualquier parte arranca — es la primera cosa que el jugador aprende.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const cx = VIEW.width / 2;

    this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void).setOrigin(0, 0);
    // mar y cielo, muy esquemáticos
    this.add.rectangle(0, 300, VIEW.width, 60, PAL.sea, 0.5).setOrigin(0, 0);
    this.add.rectangle(0, 360, VIEW.width, 120, PAL.soil, 0.6).setOrigin(0, 0);

    crisp(
      this.add
        .text(cx, 92, 'Y WLADFA', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.hero,
          color: '#EAE8E0',
          align: 'center',
        })
        .setOrigin(0.5)
        .setResolution(4),
    );

    crisp(
      this.add
        .text(cx, 122, 'La Huella de los Rifleros', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.title,
          color: '#D9A845',
        })
        .setOrigin(0.5)
        .setResolution(4),
    );

    crisp(
      this.add
        .text(cx, 172, 'Punta Cuevas, Golfo Nuevo\n28 de julio de 1865', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.body,
          color: '#9BAEB4',
          align: 'center',
          lineSpacing: 5,
        })
        .setOrigin(0.5)
        .setResolution(4),
    );

    crisp(
      this.add
        .text(cx, 236, '«Nos dijeron que era verde.»', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.body,
          color: '#7FB0B8',
        })
        .setOrigin(0.5)
        .setResolution(4),
    );

    const start = crisp(
      this.add
        .text(cx, 420, 'TOCAR PARA EMPEZAR', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#EAE8E0' })
        .setOrigin(0.5)
        .setResolution(4),
    );
    this.tweens.add({ targets: start, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });

    crisp(
      this.add
        .text(cx, 458, 'prototipo v0.1 · arte placeholder', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.tiny,
          color: '#6B6A5E',
        })
        .setOrigin(0.5)
        .setResolution(4),
    );

    this.input.once('pointerdown', () => this.scene.start('World'));
    this.input.keyboard?.once('keydown', () => this.scene.start('World'));
  }
}
