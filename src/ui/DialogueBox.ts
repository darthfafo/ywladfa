import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { DialogueSystem, type RenderedLine } from '@/systems/DialogueSystem';
import { portraitIdForSpeaker, portraitTextureKey } from '@/util/assets';
import { input } from '@/util/input';
import { SelectList } from '@/util/selectList';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

const TRAY = VIEW.tray;

/**
 * Ocupa la MISMA franja inferior que los controles: no aparece ni desaparece nada,
 * solo cambia el contenido (GDD §8). En 9:16 eso es lo que mantiene el mundo intacto.
 */
export class DialogueBox {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private portrait: Phaser.GameObjects.Rectangle;
  private portraitImg: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private choiceNav: SelectList | null = null;
  private sys: DialogueSystem;
  private current: RenderedLine | null = null;
  private onClose: (() => void) | null = null;

  constructor(private scene: Phaser.Scene) {
    this.sys = new DialogueSystem(game);

    this.bg = scene.add.rectangle(0, 0, TRAY.w, TRAY.h, PAL.ink, 0.97).setOrigin(0, 0).setStrokeStyle(1, PAL.slate);
    this.portrait = scene.add.rectangle(8, 12, 48, 48, PAL.slate).setOrigin(0, 0).setStrokeStyle(1, PAL.seaPale, 0.5);
    // placeholder de color mientras no haya PNG real para ese personaje/expresión
    // (src/util/assets.ts decide en show() cuál de los dos se ve).
    this.portraitImg = scene.add.image(8, 12, '__DEFAULT').setOrigin(0, 0).setVisible(false);
    this.nameText = crisp(
      scene.add
        .text(64, 7, '', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#D9A845' })
        .setResolution(4),
    );
    this.bodyText = crisp(
      scene.add
        .text(64, 21, '', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.body,
          color: '#EAE8E0',
          wordWrap: { width: TRAY.w - 74 },
          lineSpacing: 4,
        })
        .setResolution(4),
    );
    this.hint = crisp(
      scene.add
        .text(TRAY.w - 8, TRAY.h - 13, '▼', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#7FB0B8' })
        .setOrigin(1, 0)
        .setResolution(4),
    );

    this.root = scene.add
      .container(TRAY.x, TRAY.y, [this.bg, this.portrait, this.portraitImg, this.nameText, this.bodyText, this.hint])
      .setDepth(80)
      .setVisible(false);

    this.bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, TRAY.w, TRAY.h), Phaser.Geom.Rectangle.Contains);
    this.bg.on('pointerdown', () => this.advance());
    // ocultar el container no desactiva el input de sus hijos: sin esto, este
    // rectángulo tapa toda la bandeja (joystick incluido) incluso cerrado.
    this.bg.disableInteractive();

    scene.input.keyboard?.on('keydown-SPACE', () => this.advance());
    scene.input.keyboard?.on('keydown-E', () => this.advance());
  }

  get active(): boolean {
    return this.root.visible;
  }

  start(dialogueId: string, onClose?: () => void): void {
    this.onClose = onClose ?? null;
    input.locked = true;
    this.bg.setInteractive();
    this.root.setVisible(true);
    this.show(this.sys.start(dialogueId));
  }

  private advance(): void {
    if (!this.active) return;
    if (this.current?.choices.length) return; // con opciones se avanza eligiendo
    this.show(this.sys.next());
  }

  private show(line: RenderedLine | null): void {
    this.clearChoices();
    this.current = line;

    if (!line) {
      this.root.setVisible(false);
      this.bg.disableInteractive();
      input.locked = false;
      const cb = this.onClose;
      this.onClose = null;
      cb?.();
      return;
    }

    this.nameText.setText(line.isNarrator ? '' : line.speakerName);
    const portraitId = line.isNarrator ? null : portraitIdForSpeaker(line.speakerId, game.state.player.gender);
    const key = portraitId ? portraitTextureKey(portraitId, line.portrait) : null;
    const hasArt = !!key && this.scene.textures.exists(key);
    this.portrait.setVisible(!line.isNarrator && !hasArt);
    this.portrait.setFillStyle(portraitColor(line.portrait));
    this.portraitImg.setVisible(hasArt);
    if (hasArt) {
      // el archivo puede venir a cualquier resolución (se pide más grande que 48x48
      // para no perder nitidez al bajar de tamaño, ver docs/05-prompts-arte.txt §1):
      // siempre se muestra a 48x48 acá adentro, sea cual sea el tamaño nativo.
      this.portraitImg.setTexture(key!).setDisplaySize(48, 48);
      // son ilustraciones pintadas, no pixel art de bordes duros — con pixelArt:true
      // el filtro por default es NEAREST y queda dentado al reescalar (igual que los
      // fondos cinemáticos, ver addSceneBackground en util/assets.ts).
      this.portraitImg.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.bodyText.setPosition(line.isNarrator ? 10 : 64, line.isNarrator ? 14 : 21);
    this.bodyText.setWordWrapWidth(line.isNarrator ? TRAY.w - 20 : TRAY.w - 74);
    this.bodyText.setColor(line.isNarrator ? '#9BAEB4' : '#EAE8E0');
    this.bodyText.setText(line.text);

    if (line.choices.length) {
      this.hint.setVisible(false);
      this.renderChoices(line);
    } else {
      this.hint.setVisible(true);
    }
  }

  private renderChoices(line: RenderedLine): void {
    this.bodyText.setVisible(false);
    this.nameText.setVisible(true);
    const startY = 21;
    const items = line.choices.map((c, i) => {
      const t = crisp(
        this.scene.add
          // arranca 6px más a la derecha que antes: deja lugar al cursor "›" que
          // dibuja SelectList a la izquierda de la opción activa, sin pisar el retrato.
          .text(70, startY + i * 26, c.text, {
            fontFamily: FONT_FAMILY,
            fontSize: FONT.body,
            color: '#BFD3D8',
            wordWrap: { width: TRAY.w - 80 },
          })
          .setResolution(4),
      ).setInteractive({ useHandCursor: true });
      // objetivo táctil de 20px internos mínimo (docs/03-assets.md), con margen extra
      // (el -14 en vez de -8 compensa que el texto ahora arranca 6px más a la derecha)
      t.input!.hitArea = new Phaser.Geom.Rectangle(-14, -8, TRAY.w - 58, 28);
      const onPick = (): void => {
        bus.emit('ui:toast', { text: '' });
        this.show(this.sys.choose(c.id));
      };
      t.on('pointerover', () => t.setColor('#D9A845'));
      t.on('pointerout', () => t.setColor('#BFD3D8'));
      t.on('pointerdown', onPick);
      this.choiceTexts.push(t);
      this.root.add(t);
      return { text: t, onPick };
    });
    // abajo/arriba + botón de acción, además del click/tap (GDD §8)
    this.choiceNav = new SelectList(this.scene, items, { normal: '#BFD3D8', selected: '#D9A845' }, this.root);
  }

  private clearChoices(): void {
    this.choiceNav?.destroy();
    this.choiceNav = null;
    for (const t of this.choiceTexts) t.destroy();
    this.choiceTexts = [];
    this.bodyText.setVisible(true);
  }
}

function portraitColor(p: 'neutral' | 'tenso' | 'calido'): number {
  if (p === 'tenso') return PAL.clayDark;
  if (p === 'calido') return PAL.moss;
  return PAL.slate;
}
