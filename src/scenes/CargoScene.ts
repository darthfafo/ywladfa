import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { BultoDef, ResourceId } from '@/core/types';
import type { WorldScene } from '@/scenes/WorldScene';
import { addIconImage, addSceneBackground } from '@/util/assets';
import { crisp, FONT, RETRO_FONT } from '@/util/text';

interface Card {
  bulto: BultoDef;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  kg: Phaser.GameObjects.Text;
  check: Phaser.GameObjects.Text;
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

    // título en la fuente retro, igual que el resto de las pantallas importantes
    // del juego (arranque, tutoriales) — "La carga" es LA decisión del nivel, tiene
    // que leerse con el mismo peso que esas, no como un panel más.
    crisp(
      this.add
        .text(8, 6, 'La carga', { fontFamily: RETRO_FONT, fontSize: FONT.title, color: '#D9A845' })
        .setResolution(8),
    );
    crisp(
      this.add
        .text(8, 26, 'Elegí 5 de 8 bultos. Se puede corregir hasta cerrar.', {
          fontFamily: RETRO_FONT,
          fontSize: FONT.tiny,
          color: '#7FB0B8',
          wordWrap: { width: VIEW.width - 16 },
        })
        .setResolution(8),
    );
    this.counterText = crisp(
      this.add
        .text(VIEW.width - 8, 6, '', { fontFamily: RETRO_FONT, fontSize: FONT.body, color: '#EAE8E0' })
        .setOrigin(1, 0)
        .setResolution(8),
    );
    // línea divisoria sutil entre el encabezado y la grilla — mismo color/alpha que
    // ya usa el borde y la regla de UiScene.openOverlay (PAL.seaPale), para que se
    // lea como parte de la misma familia de pantallas importantes, no una aparte.
    this.add.rectangle(0, GRID_Y - 6, VIEW.width, 1, PAL.seaPale, 0.35).setOrigin(0, 0);
    // marco sutil en el borde de toda la pantalla — mismo lenguaje que las cajas
    // del arranque y el panel de openOverlay (borde PAL.seaPale), para que esta
    // pantalla completa no se sienta "pelada" al lado de esas.
    this.add
      .rectangle(2, 2, VIEW.width - 4, VIEW.height - 4, 0, 0)
      .setOrigin(0, 0)
      .setStrokeStyle(1, PAL.seaPale, 0.35);

    registry.bultos.forEach((b, i) => this.buildCard(b, i));
    this.refreshCounter();

    this.events.once('shutdown', () => {
      this.scene.resume('World');
      this.scene.resume('Ui');
      bus.emit('ui:hud-visible', { visible: true });
      // trig_reacciones_carga no tiene zona — no hace falta esperar a que el
      // jugador dé un paso para que se note que n1_carga ya está puesto.
      (this.scene.get('World') as WorldScene).recheckTriggers();
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

    // ícono si ya existe el PNG (b.icon, ej. "bulto_harina") — centrado arriba de
    // la tarjeta. Si no existe todavía cae en el mismo layout de siempre, solo
    // texto, sin dejar un hueco vacío donde iría el ícono.
    const icon = b.icon ? addIconImage(this, b.icon, x + CARD_W / 2, y + 8) : null;
    icon?.setOrigin(0.5, 0).setDepth(1);
    const labelY = icon ? y + 40 : y + 8;

    const label = crisp(
      this.add
        .text(x + 8, labelY, b.label, {
          fontFamily: RETRO_FONT,
          fontSize: FONT.small,
          color: '#EAE8E0',
          wordWrap: { width: CARD_W - 16 },
          lineSpacing: 2,
          align: icon ? 'center' : 'left',
        })
        .setOrigin(icon ? 0.5 : 0, 0)
        .setX(icon ? x + CARD_W / 2 : x + 8)
        .setResolution(8),
    );
    const kg = crisp(
      this.add
        .text(x + 8, y + CARD_H - 18, `${b.kg} kg`, {
          fontFamily: RETRO_FONT,
          fontSize: FONT.tiny,
          color: '#6B6A5E',
        })
        .setResolution(8),
    );
    // "elegido" como una marca aparte, no pegada al texto de kg — pegarla ahí
    // ("140 kg · llevado") se salía del ancho de la tarjeta y quedaba cortado a
    // la mitad contra la tarjeta de al lado. Esquina propia, siempre entra.
    const check = crisp(
      this.add
        .text(x + CARD_W - 8, y + 6, '✓', {
          fontFamily: RETRO_FONT,
          fontSize: FONT.small,
          color: '#18262A',
        })
        .setOrigin(1, 0)
        .setResolution(8)
        .setVisible(false),
    );

    const card: Card = { bulto: b, bg, label, kg, check, taken: false };
    bg.on('pointerover', () => {
      if (!card.taken) bg.setFillStyle(PAL.slate, 0.95);
    });
    bg.on('pointerout', () => {
      if (!card.taken) bg.setFillStyle(PAL.ink2, 0.95);
    });
    bg.on('pointerdown', () => this.pick(card));

    this.cards.push(card);
  }

  /** Tocar una tarjeta ya elegida la saca — por si alguien se equivoca de bulto,
   * no hay por qué obligarlo a cerrar la pantalla para corregirse. Esto NO es lo
   * mismo que "deshacer": la tarjeta sigue interactiva mientras se sigue eligiendo,
   * pero apenas se completan las 5 (`closing`) nada vuelve a responder — ahí sí
   * es la decisión final, sin vuelta atrás, como pide el diseño. */
  private pick(card: Card): void {
    if (this.closing) return;
    if (card.taken) {
      this.setCardTaken(card, false);
      this.refreshCounter();
      return;
    }
    if (this.taken.size >= this.capacity) return;

    this.setCardTaken(card, true);
    this.refreshCounter();

    if (this.taken.size >= this.capacity) {
      this.closing = true;
      for (const c of this.cards) c.bg.disableInteractive();
      this.time.delayedCall(700, () => this.finish());
    }
  }

  private setCardTaken(card: Card, taken: boolean): void {
    card.taken = taken;
    if (taken) {
      this.taken.add(card.bulto.id);
      card.bg.setFillStyle(PAL.moss, 0.9).setStrokeStyle(1, PAL.wheat);
      card.label.setColor('#0E1416');
      card.kg.setColor('#18262A');
      card.check.setVisible(true);
    } else {
      this.taken.delete(card.bulto.id);
      card.bg.setFillStyle(PAL.ink2, 0.95).setStrokeStyle(1, PAL.slate);
      card.label.setColor('#EAE8E0');
      card.kg.setColor('#6B6A5E');
      card.check.setVisible(false);
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
