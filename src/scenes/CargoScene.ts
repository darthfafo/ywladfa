import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { BultoDef, ResourceId } from '@/core/types';
import { addSceneBackground } from '@/util/assets';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

interface Card {
  bulto: BultoDef;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  kg: Phaser.GameObjects.Text;
  taken: boolean;
}

const COLS = 2;
const CARD_W = 126;
const CARD_H = 99;
const GAP = 6;
const GRID_Y = 58;

/**
 * La decisión de carga (docs/01-nivel-01.md §5): 5 de 8 bultos, sin deshacer, sin
 * confirmación doble. Pantalla completa y propia — es "el núcleo del nivel", no una
 * elección más. Al elegir el quinto bulto la escena se cierra sola y sigue el viaje.
 */
export class CargoScene extends Phaser.Scene {
  private cards: Card[] = [];
  private counterText!: Phaser.GameObjects.Text;
  private taken = new Set<string>();
  private capacity = 5;
  private closing = false;

  constructor() {
    super('CargoScene');
  }

  create(): void {
    this.scene.bringToTop();
    this.scene.pause('World');
    this.scene.pause('Ui');
    // pausar Ui no la oculta: el HUD es HTML aparte del canvas y se queda flotando
    // arriba de esta escena sin importar el depth.
    bus.emit('ui:hud-visible', { visible: false });
    this.taken.clear();
    this.closing = false;

    const level = game.state.progress.level;
    this.capacity = registry.levelBalance(level).cargoDecision?.capacity ?? 5;

    // fondo real si ya existe (los bultos amontonados, listos para elegir) — se ve
    // detrás de la grilla, oscurecido para no competir con la lectura de las 8
    // tarjetas: esta pantalla no puede perder legibilidad por atmósfera.
    const bg = addSceneBackground(this, 'decision_carga', VIEW.width / 2, VIEW.height / 2, VIEW.width, VIEW.height);
    this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void, bg ? 0.62 : 1).setOrigin(0, 0);

    crisp(
      this.add
        .text(8, 6, 'La carga', { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
        .setResolution(4),
    );
    crisp(
      this.add
        .text(8, 24, 'Los carros llevan 5 bultos. Hay 8. Sin vuelta atrás.', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.tiny,
          color: '#9BAEB4',
          wordWrap: { width: VIEW.width - 16 },
        })
        .setResolution(4),
    );
    this.counterText = crisp(
      this.add
        .text(VIEW.width - 8, 6, '', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#EAE8E0' })
        .setOrigin(1, 0)
        .setResolution(4),
    );

    registry.bultos.forEach((b, i) => this.buildCard(b, i));
    this.refreshCounter();

    this.events.once('shutdown', () => {
      this.scene.resume('World');
      this.scene.resume('Ui');
      bus.emit('ui:hud-visible', { visible: true });
    });
  }

  private buildCard(b: BultoDef, i: number): void {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = 6 + col * (CARD_W + GAP);
    const y = GRID_Y + row * (CARD_H + GAP);

    const bg = this.add
      .rectangle(x, y, CARD_W, CARD_H, PAL.ink2, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, PAL.slate)
      .setInteractive({ useHandCursor: true });

    const label = crisp(
      this.add
        .text(x + 8, y + 8, b.label, {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.small,
          color: '#EAE8E0',
          wordWrap: { width: CARD_W - 16 },
          lineSpacing: 2,
        })
        .setResolution(4),
    );
    const kg = crisp(
      this.add
        .text(x + 8, y + CARD_H - 18, `${b.kg} kg`, {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.tiny,
          color: '#6B6A5E',
        })
        .setResolution(4),
    );

    const card: Card = { bulto: b, bg, label, kg, taken: false };
    bg.on('pointerover', () => {
      if (!card.taken) bg.setFillStyle(PAL.slate, 0.95);
    });
    bg.on('pointerout', () => {
      if (!card.taken) bg.setFillStyle(PAL.ink2, 0.95);
    });
    bg.on('pointerdown', () => this.pick(card));

    this.cards.push(card);
  }

  private pick(card: Card): void {
    if (this.closing || card.taken || this.taken.size >= this.capacity) return;

    card.taken = true;
    this.taken.add(card.bulto.id);
    card.bg.disableInteractive();
    card.bg.setFillStyle(PAL.moss, 0.9).setStrokeStyle(1, PAL.wheat);
    card.label.setColor('#0E1416');
    card.kg.setColor('#18262A').setText(`${card.kg.text} · llevado`);

    this.refreshCounter();

    if (this.taken.size >= this.capacity) {
      this.closing = true;
      for (const c of this.cards) if (!c.taken) c.bg.disableInteractive();
      this.time.delayedCall(700, () => this.finish());
    }
  }

  private refreshCounter(): void {
    this.counterText.setText(`${this.taken.size} / ${this.capacity}`);
  }

  private finish(): void {
    for (const b of registry.bultos) {
      if (!this.taken.has(b.id)) continue;
      if (b.ifTaken) game.flags.set(b.ifTaken, true);
      for (const [resId, amount] of Object.entries(b.grants ?? {})) {
        game.res.change(resId as ResourceId, amount, `bulto:${b.id}`);
      }
    }
    game.flags.set('n1_carga', [...this.taken]);
    this.scene.stop();
  }
}
