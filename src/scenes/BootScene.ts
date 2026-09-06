import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { saveSystem } from '@/systems/SaveSystem';
import { SelectList } from '@/util/selectList';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

/**
 * Portada. En 9:16 no hay hero gigante: el título arriba, el mundo insinuado abajo.
 * Sin partida guardada, un solo toque en cualquier parte arranca. Con partida
 * guardada, hay que elegir: seguirla o empezar de nuevo (con confirmación, porque
 * es un solo slot y "empezar de nuevo" la borra).
 */
export class BootScene extends Phaser.Scene {
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private optionNav: SelectList | null = null;

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

    if (saveSystem.hasSave()) this.renderMenu();
    else this.renderStartAnywhere();
  }

  /** Sin partida guardada: lo de siempre, tocar en cualquier lado arranca. */
  private renderStartAnywhere(): void {
    const cx = VIEW.width / 2;
    const start = crisp(
      this.add
        .text(cx, 420, 'TOCAR PARA EMPEZAR', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#EAE8E0' })
        .setOrigin(0.5)
        .setResolution(4),
    );
    this.tweens.add({ targets: start, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => this.beginNewGame());
    this.input.keyboard?.once('keydown', () => this.beginNewGame());
  }

  /** Con partida guardada: elegir entre continuar o empezar de nuevo. */
  private renderMenu(): void {
    const day = saveSystem.peek()?.day ?? 1;
    this.renderOptions(
      [
        { label: `Continuar — Jornada ${day}`, onPick: () => this.continueGame() },
        { label: 'Empezar de nuevo', onPick: () => this.renderConfirmNewGame() },
      ],
      408,
    );
  }

  /** "Empezar de nuevo" borra el único slot: confirmar antes de hacerlo. */
  private renderConfirmNewGame(): void {
    crisp(
      this.add
        .text(VIEW.width / 2, 388, 'Se pierde la partida guardada.', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.tiny,
          color: '#DE7050',
        })
        .setOrigin(0.5)
        .setResolution(4),
    );
    this.renderOptions(
      [
        { label: 'Sí, empezar de nuevo', onPick: () => this.beginNewGame() },
        { label: 'Volver', onPick: () => this.scene.restart() },
      ],
      416,
    );
  }

  private renderOptions(options: Array<{ label: string; onPick: () => void }>, startY: number): void {
    this.clearOptions();
    // origen (0,0) a propósito: es el mismo patrón probado de DialogueBox/UiScene.
    // Con setOrigin(0.5) el hitArea rectangular queda mal calculado y no responde al click.
    const x = 40;
    const navItems = options.map((o, i) => {
      const t = crisp(
        this.add
          .text(x, startY + i * 24, `› ${o.label}`, { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#BFD3D8' })
          .setResolution(4),
      ).setInteractive({ useHandCursor: true });
      t.input!.hitArea = new Phaser.Geom.Rectangle(-10, -8, VIEW.width - 2 * x + 20, 24);
      t.on('pointerover', () => t.setColor('#D9A845'));
      t.on('pointerout', () => t.setColor('#BFD3D8'));
      t.on('pointerdown', () => o.onPick());
      this.optionTexts.push(t);
      return { text: t, onPick: o.onPick };
    });
    this.optionNav = new SelectList(this, navItems, { normal: '#BFD3D8', selected: '#D9A845' });
  }

  private clearOptions(): void {
    this.optionNav?.destroy();
    this.optionNav = null;
    for (const t of this.optionTexts) t.destroy();
    this.optionTexts = [];
  }

  private continueGame(): void {
    const saved = saveSystem.load();
    if (saved) game.replaceState(saved);
    this.scene.start('World');
  }

  private beginNewGame(): void {
    saveSystem.clear();
    game.replaceState(createInitialState());
    this.scene.start('World');
  }
}
