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
import { crisp, FONT, FONT_FAMILY, RETRO_FONT } from '@/util/text';

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
  d_n1_manantial: 'manantial',
  d_n1_final: 'punta_final',
};

export class UiScene extends Phaser.Scene {
  private dayEl!: Phaser.GameObjects.DOMElement;
  private resEls = new Map<ResourceId, HTMLDivElement>();
  private loadBar!: Phaser.GameObjects.Rectangle;
  private toast!: Phaser.GameObjects.Text;
  private zoneLabel!: Phaser.GameObjects.Text;
  private dialogue!: DialogueBox;
  private touch!: TouchControls;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayNav: SelectList | null = null;
  private hudObjects: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.DOMElement> = [];
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
    world.events.on('request-dialogue', (p: { id: string; next?: string }) => this.openDialogue(p.id, p.next));
    world.events.on('request-choice', (id: string) => this.openChoice(id));
    world.events.on('request-refusal', (npcId: string) => this.openRefusal(npcId));

    bus.on('resource:changed', () => this.refreshResources());
    bus.on('time:turn-advanced', () => this.refreshTime());
    bus.on('inventory:weight-changed', () => this.refreshLoad());
    bus.on('ui:toast', ({ text }) => this.showToast(text));
    bus.on('ui:tutorial', ({ id }) => this.openTutorial(id));
    bus.on('zone:entered', ({ label }) => this.showZone(label));
    // CampScene/CargoScene pausan Ui pero no la ocultan: el HUD es HTML aparte del
    // canvas (ver buildHud) y se queda flotando arriba de esas escenas sin esto.
    bus.on('ui:hud-visible', ({ visible }) => this.setHudVisible(visible));

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
    const track = (o: Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.DOMElement): void => {
      this.hudObjects.push(o);
    };
    // opaco del todo, no 0.96: mismo criterio que la bandeja (DialogueBox.bg,
    // buildTray) — más contraste para el texto contra el mundo de fondo.
    track(this.add.rectangle(h.x, h.y, h.w, h.h, PAL.ink, 1).setOrigin(0, 0).setDepth(60));
    track(this.add.rectangle(h.x, h.y + h.h - 1, h.w, 1, PAL.slate).setOrigin(0, 0).setDepth(61));

    // texto del HUD en HTML real, no Phaser Text: por más que se lo fuerce a
    // reescalado suave (index.html), a este tamaño (9-10px internos) el texto de
    // Phaser sigue horneado en un canvas de baja resolución fija y se ve borroso en
    // un celular real — confirmado en dispositivo, no alcanzaba con eso. Un <div>
    // lo rasteriza el navegador a la resolución física real de la pantalla, nítido
    // sin importar el factor de escala.
    const domStyle = (size: number, color: string): string =>
      `color:${color}; font-family: ui-monospace, "SF Mono", Menlo, monospace; ` +
      `font-size:${size}px; white-space:nowrap; pointer-events:none;`;

    // fila 1: jornada y turno, sin nada más — nunca se queda sin lugar
    // (antes había 4 puntitos de turno acá; redundantes con el texto, se sacaron)
    this.dayEl = this.add.dom(6, 3, 'div', domStyle(10, '#D9A845')).setOrigin(0, 0);
    track(this.dayEl);

    // fila 2: recursos con nombre completo + barra de carga, en columnas fijas
    HUD_RESOURCES.forEach((id, i) => {
      const el = this.add.dom(RES_X[i]!, 19, 'div', domStyle(9, '#EAE8E0')).setOrigin(0, 0);
      this.resEls.set(id, el.node as HTMLDivElement);
      track(el);
    });

    track(this.add.rectangle(LOADBAR_X, 20, LOADBAR_W, 5, PAL.ink2).setOrigin(0, 0).setDepth(62));
    this.loadBar = this.add.rectangle(LOADBAR_X, 20, 0, 5, PAL.moss).setOrigin(0, 0).setDepth(63);
    track(this.loadBar);
    const cargaEl = this.add.dom(CARGA_LABEL_X, 19, 'div', domStyle(9, '#6B6A5E')).setOrigin(0, 0);
    (cargaEl.node as HTMLDivElement).textContent = 'CARGA';
    track(cargaEl);
  }

  /** Oculta/muestra el HUD entero — cutscenes de pantalla completa lo tapan (docs/01 §4). */
  private setHudVisible(visible: boolean): void {
    for (const o of this.hudObjects) o.setVisible(visible);
  }

  /* ---------------- bandeja (franja inferior, 96 px) ---------------- */

  private buildTray(): void {
    const t = VIEW.tray;
    // PAL.ink, no PAL.void: la bandeja tiene que leerse como panel del juego,
    // no fundirse con el fondo de la página que queda fuera del canvas. Opaca del
    // todo (no 0.97): mismo criterio que DialogueBox.bg.
    this.add.rectangle(t.x, t.y, t.w, t.h, PAL.ink, 1).setOrigin(0, 0).setDepth(40);
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
    // mayúsculas en todo el HUD: a este tamaño de letra, minúsculas con
    // ascendentes/descendentes finos se leen peor en un celular real.
    this.dayEl.node.textContent = `JORNADA ${s.day} · ${game.time.label().toUpperCase()}`;
  }

  private refreshResources(): void {
    for (const [id, el] of this.resEls) {
      const v = game.res.get(id);
      el.textContent = `${(RES_LABEL[id] ?? id).toUpperCase()} ${Math.round(v)}`;
      el.style.color = game.res.isCritical(id) ? '#DE7050' : '#EAE8E0';
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

  private openDialogue(id: string, next?: string): void {
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
      // `next` viene del trigger que disparó este diálogo (ej. trig_punta_final):
      // si lo tiene, era el cierre del nivel — no hay nada más que restaurar acá,
      // TransitionScene reemplaza World/Ui entero.
      if (next) {
        this.scene.launch('Transition', { next });
        return;
      }
      this.touch.setContext(null);
      this.touch.setVisible(true);
      if (cutsceneId) {
        this.setHudVisible(true);
        this.cutsceneBg?.destroy();
        this.cutsceneBg = null;
      }
    });
  }

  /** El NPC más cercano no tiene nada que decir todavía (requires sin cumplir, o ya
   * habló lo que tenía). Va por la misma bandeja que cualquier diálogo real. */
  private openRefusal(npcId: string): void {
    this.touch.setVisible(false);
    this.dialogue.refuse(npcId, () => this.touch.setVisible(true));
  }

  private openTutorial(id: string): void {
    const t = registry.tutorial(id);
    if (!t) return;
    this.openOverlay(t.title, t.text, [{ label: 'Entendido', onPick: () => this.closeOverlay() }], true);
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

  /** Panel confinado al cuadro de mapa (VIEW.world: la franja del medio, entre HUD y
   * bandeja) — no a la pantalla entera. El HUD y la bandeja se quedan a la vista
   * alrededor, no hace falta ocultarlos ni ganan sentido las "ventanas flotantes"
   * que evita GDD §8: esto sigue siendo un panel fijo, solo que del tamaño de la
   * franja que le corresponde en las tres bandas del layout (docs/00-GDD.md §8),
   * con el mismo marco con borde que las cajas del arranque (BootScene.renderMenu).
   * `retro` es para las OPCIONES de los tutoriales (título + único botón, siempre cortos) — las
   * pantallas de decisión tienen oraciones largas de datos y en Press Start 2P
   * (mucho más ancha por carácter) arriesgan un wrap de demasiadas líneas. El título sí va
   * siempre en fuente retro: es corto en todos los casos ("Carga", "Decisión", etc). */
  private openOverlay(
    title: string,
    body: string,
    options: Array<{ label: string; onPick: () => void }>,
    retro = false,
  ): void {
    this.closeOverlay();
    input.locked = true;
    this.touch.setVisible(false);

    const top = VIEW.world.y;
    const margin = 10;
    const bg = this.add
      .rectangle(margin, top + margin, VIEW.width - margin * 2, VIEW.world.h - margin * 2, PAL.void, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, PAL.seaPale, 0.5);
    const titleT = crisp(
      this.add
        .text(16, top + 24, title, {
          fontFamily: RETRO_FONT,
          fontSize: '11px',
          color: '#D9A845',
        })
        .setResolution(4),
    );
    const rule = this.add.rectangle(16, top + 42, VIEW.width - 32, 1, PAL.seaPale, 0.35).setOrigin(0, 0);
    const bodyT = crisp(
      this.add
        .text(16, top + 48, body, {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.body,
          color: '#EAE8E0',
          wordWrap: { width: VIEW.width - 32 },
          lineSpacing: 4,
        })
        .setResolution(4),
    );

    const items: Phaser.GameObjects.GameObject[] = [bg, titleT, rule, bodyT];
    let y = top + 48 + bodyT.height + 22;
    // opciones como cajas con borde, no texto plano — mismo lenguaje visual que los
    // botones del arranque (BootScene.renderMenu) y las cartas de CargoScene, para
    // que el selector se sienta parte del mismo juego.
    const navItems = options.map((o) => {
      const label = crisp(
        this.add
          .text(28, y + 8, o.label, {
            fontFamily: retro ? RETRO_FONT : FONT_FAMILY,
            fontSize: retro ? '9px' : FONT.body,
            color: '#BFD3D8',
            wordWrap: { width: VIEW.width - 72 },
          })
          .setResolution(4),
      );
      const boxH = label.height + 16;
      const box = this.add
        .rectangle(16, y, VIEW.width - 32, boxH, PAL.ink2, 0.9)
        .setOrigin(0, 0)
        .setStrokeStyle(1, PAL.slate)
        .setInteractive({ useHandCursor: true });
      box.on('pointerover', () => {
        box.setStrokeStyle(1, PAL.wheat);
        label.setColor('#D9A845');
      });
      box.on('pointerout', () => {
        box.setStrokeStyle(1, PAL.slate);
        label.setColor('#BFD3D8');
      });
      box.on('pointerdown', () => o.onPick());
      items.push(box, label);
      y += boxH + 8;
      return { text: label, onPick: o.onPick };
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
