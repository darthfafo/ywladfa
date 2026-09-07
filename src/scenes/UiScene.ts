import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { ResourceId } from '@/core/types';
import { addSceneBackground } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { TouchControls } from '@/ui/TouchControls';
import { input } from '@/util/input';
import { SelectList } from '@/util/selectList';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

/** Recursos que se muestran en el HUD del Nivel 1. El resto vive en el panel de jornada. */
const HUD_RESOURCES: ResourceId[] = ['agua', 'comida', 'lena'];
const RES_LABEL: Record<string, string> = {
  agua: 'Agua',
  comida: 'Comida',
  lena: 'Leña',
  forraje: 'Forraje',
  municion: 'Munición',
  materiales: 'Materiales',
};
/** x de cada columna de recursos, medido para el peor caso ("Comida 30") con margen. */
const RES_X = [6, 54, 113];
const LOADBAR_X = 165;
const LOADBAR_W = 48;
const CARGA_LABEL_X = 217;

/** Diálogos que arrancan como cutscene de pantalla completa: fondo real detrás
 * (si ya existe el PNG) y HUD oculto mientras dura — docs/01-nivel-01.md §4. */
const CUTSCENE_DIALOGUES: Record<string, string> = {
  d_n1_cold_open: 'cold_open',
};

export class UiScene extends Phaser.Scene {
  private dayText!: Phaser.GameObjects.Text;
  private resTexts = new Map<ResourceId, Phaser.GameObjects.Text>();
  private loadBar!: Phaser.GameObjects.Rectangle;
  private toast!: Phaser.GameObjects.Text;
  private zoneLabel!: Phaser.GameObjects.Text;
  private dialogue!: DialogueBox;
  private touch!: TouchControls;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayNav: SelectList | null = null;
  private hudObjects: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle> = [];
  private cutsceneBg: Phaser.GameObjects.Image | null = null;

  constructor() {
    super('Ui');
  }

  create(): void {
    this.buildHud();
    this.buildTray();

    this.dialogue = new DialogueBox(this);
    this.touch = new TouchControls(this);

    const world = this.scene.get('World');
    world.events.on('request-dialogue', (id: string) => this.openDialogue(id));
    world.events.on('request-choice', (id: string) => this.openChoice(id));

    bus.on('resource:changed', () => this.refreshResources());
    bus.on('time:turn-advanced', () => this.refreshTime());
    bus.on('inventory:weight-changed', () => this.refreshLoad());
    bus.on('ui:toast', ({ text }) => this.showToast(text));
    bus.on('ui:tutorial', ({ id }) => this.openTutorial(id));
    bus.on('zone:entered', ({ label }) => this.showZone(label));

    this.refreshResources();
    this.refreshTime();
    this.refreshLoad();
  }

  /* ---------------- HUD (franja superior, 32 px) ---------------- */

  /**
   * Dos filas fijas, cada una con su propio trabajo — así ningún elemento pelea por
   * espacio con otro sin importar el largo del texto (día/turno arriba, siempre solos;
   * recursos + carga abajo, con columnas medidas para el peor caso real).
   */
  private buildHud(): void {
    const h = VIEW.hud;
    const track = (o: Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle): void => {
      this.hudObjects.push(o);
    };
    track(this.add.rectangle(h.x, h.y, h.w, h.h, PAL.ink, 0.96).setOrigin(0, 0).setDepth(60));
    track(this.add.rectangle(h.x, h.y + h.h - 1, h.w, 1, PAL.slate).setOrigin(0, 0).setDepth(61));

    // fila 1: jornada y turno, sin nada más — nunca se queda sin lugar
    // (antes había 4 puntitos de turno acá; redundantes con el texto, se sacaron)
    this.dayText = crisp(
      this.add
        .text(6, 3, '', { fontFamily: FONT_FAMILY, fontSize: FONT.small, color: '#D9A845' })
        .setDepth(62)
        .setResolution(4),
    );
    track(this.dayText);

    // fila 2: recursos con nombre completo + barra de carga, en columnas fijas
    HUD_RESOURCES.forEach((id, i) => {
      const t = crisp(
        this.add
          .text(RES_X[i]!, 19, '', { fontFamily: FONT_FAMILY, fontSize: FONT.tiny, color: '#EAE8E0' })
          .setDepth(62)
          .setResolution(4),
      );
      this.resTexts.set(id, t);
      track(t);
    });

    track(this.add.rectangle(LOADBAR_X, 20, LOADBAR_W, 5, PAL.ink2).setOrigin(0, 0).setDepth(62));
    this.loadBar = this.add.rectangle(LOADBAR_X, 20, 0, 5, PAL.moss).setOrigin(0, 0).setDepth(63);
    track(this.loadBar);
    track(
      crisp(
        this.add
          .text(CARGA_LABEL_X, 19, 'CARGA', { fontFamily: FONT_FAMILY, fontSize: FONT.tiny, color: '#6B6A5E' })
          .setDepth(62)
          .setResolution(4),
      ),
    );
  }

  /** Oculta/muestra el HUD entero — cutscenes de pantalla completa lo tapan (docs/01 §4). */
  private setHudVisible(visible: boolean): void {
    for (const o of this.hudObjects) o.setVisible(visible);
  }

  /* ---------------- bandeja (franja inferior, 96 px) ---------------- */

  private buildTray(): void {
    const t = VIEW.tray;
    // PAL.ink, no PAL.void: la bandeja tiene que leerse como panel del juego,
    // no fundirse con el fondo de la página que queda fuera del canvas.
    this.add.rectangle(t.x, t.y, t.w, t.h, PAL.ink, 0.97).setOrigin(0, 0).setDepth(40);
    this.add.rectangle(t.x, t.y, t.w, 1, PAL.slate).setOrigin(0, 0).setDepth(41);

    this.zoneLabel = crisp(
      this.add
        .text(VIEW.width / 2, VIEW.world.y + 8, '', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#EAE8E0' })
        .setOrigin(0.5, 0)
        .setDepth(70)
        .setAlpha(0)
        .setResolution(4),
    );

    this.toast = crisp(
      this.add
        .text(VIEW.width / 2, VIEW.tray.y - 18, '', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.body,
          color: '#D9A845',
          backgroundColor: '#18262A',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 0)
        .setDepth(70)
        .setAlpha(0)
        .setResolution(4),
    );
  }

  /* ---------------- refrescos ---------------- */

  private refreshTime(): void {
    const s = game.state.progress;
    // mayúsculas acá (y en el resto del HUD): a tamaño de letra chico en un celular
    // real, minúsculas con ascendentes/descendentes finos se pierden contra el
    // reescalado del canvas — las formas más simples de las mayúsculas aguantan mejor.
    this.dayText.setText(`JORNADA ${s.day} · ${game.time.label().toUpperCase()}`);
  }

  private refreshResources(): void {
    for (const [id, t] of this.resTexts) {
      const v = game.res.get(id);
      t.setText(`${(RES_LABEL[id] ?? id).toUpperCase()} ${Math.round(v)}`);
      t.setColor(game.res.isCritical(id) ? '#DE7050' : '#EAE8E0');
    }
  }

  private refreshLoad(): void {
    const ratio = game.inv.carried / Math.max(1, game.inv.capacity);
    // el track mide LOADBAR_W: la barra nunca lo pasa, aunque haya sobrecarga real
    this.loadBar.width = Math.min(LOADBAR_W, LOADBAR_W * ratio);
    this.loadBar.setFillStyle(ratio > 1 ? PAL.barranca : ratio > 0.8 ? PAL.coiron : PAL.moss);
  }

  private showToast(text: string): void {
    if (!text) return;
    this.toast.setText(text.toUpperCase()).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1800, duration: 400 });
  }

  private showZone(label: string): void {
    this.zoneLabel.setText(label.toUpperCase()).setAlpha(1);
    this.tweens.killTweensOf(this.zoneLabel);
    this.tweens.add({ targets: this.zoneLabel, alpha: 0, delay: 1400, duration: 600 });
  }

  /* ---------------- modales ---------------- */

  private openDialogue(id: string): void {
    const cutsceneId = CUTSCENE_DIALOGUES[id];
    // el joystick/botón son HTML aparte del canvas: no se tapan solos detrás de una
    // cutscene ni de ningún diálogo, hay que ocultarlos a mano.
    this.touch.setVisible(false);
    if (cutsceneId) {
      this.setHudVisible(false);
      // solo contra el área sin bandeja (0-384, el HUD ya está oculto): cubrir la
      // pantalla 9:16 entera recortaba mucho más de una imagen pedida en 3:4.
      this.cutsceneBg = addSceneBackground(this, cutsceneId, VIEW.width / 2, VIEW.tray.y / 2, VIEW.width, VIEW.tray.y);
      this.cutsceneBg?.setDepth(-5);
    }
    this.dialogue.start(id, () => {
      this.touch.setContext(null);
      this.touch.setVisible(true);
      if (cutsceneId) {
        this.setHudVisible(true);
        this.cutsceneBg?.destroy();
        this.cutsceneBg = null;
      }
    });
  }

  private openTutorial(id: string): void {
    const t = registry.tutorial(id);
    if (!t) return;
    this.openOverlay(t.title, t.text, [{ label: 'Entendido', onPick: () => this.closeOverlay() }]);
  }

  private openChoice(id: string): void {
    const c = registry.choiceScreen(id);
    this.openOverlay(
      'Decisión',
      c.prompt,
      c.options.map((o) => ({
        label: o.text,
        onPick: () => {
          game.applyEffects(o.effects);
          this.closeOverlay();
        },
      })),
    );
  }

  /** Panel a pantalla completa: en 9:16 no entran las ventanas flotantes (GDD §8). */
  private openOverlay(title: string, body: string, options: Array<{ label: string; onPick: () => void }>): void {
    this.closeOverlay();
    input.locked = true;
    this.touch.setVisible(false);

    const bg = this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void, 0.96).setOrigin(0, 0);
    const titleT = crisp(
      this.add
        .text(16, 56, title, { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
        .setResolution(4),
    );
    const bodyT = crisp(
      this.add
        .text(16, 80, body, {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.body,
          color: '#EAE8E0',
          wordWrap: { width: VIEW.width - 32 },
          lineSpacing: 4,
        })
        .setResolution(4),
    );

    const items: Phaser.GameObjects.GameObject[] = [bg, titleT, bodyT];
    let y = 80 + bodyT.height + 22;
    const navItems = options.map((o) => {
      const t = crisp(
        this.add
          .text(16, y, o.label, {
            fontFamily: FONT_FAMILY,
            fontSize: FONT.body,
            color: '#BFD3D8',
            wordWrap: { width: VIEW.width - 32 },
          })
          .setResolution(4),
      ).setInteractive({ useHandCursor: true });
      t.input!.hitArea = new Phaser.Geom.Rectangle(-8, -10, VIEW.width - 16, t.height + 24);
      t.on('pointerover', () => t.setColor('#D9A845'));
      t.on('pointerout', () => t.setColor('#BFD3D8'));
      t.on('pointerdown', () => o.onPick());
      items.push(t);
      y += t.height + 26;
      return { text: t, onPick: o.onPick };
    });

    this.overlay = this.add.container(0, 0, items).setDepth(120);
    // abajo/arriba + botón de acción, además del click/tap (GDD §8)
    this.overlayNav = new SelectList(this, navItems, { normal: '#BFD3D8', selected: '#D9A845' }, this.overlay);
  }

  private closeOverlay(): void {
    this.overlayNav?.destroy();
    this.overlayNav = null;
    this.overlay?.destroy(true);
    this.overlay = null;
    input.locked = false;
    this.touch.setVisible(true);
  }
}
