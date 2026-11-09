import Phaser from 'phaser';
import { INPUT_GUARD, PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { ResourceId } from '@/core/types';
import type { WorldScene } from '@/scenes/WorldScene';
import { playCinematic, type Cinematic } from '@/ui/cinematic';
import { DialogueBox } from '@/ui/DialogueBox';
import { TouchControls } from '@/ui/TouchControls';
import { input } from '@/util/input';
import { crisp, FONT, RETRO_FONT } from '@/util/text';
import { TURNS } from '@/systems/TimeSystem';
import { addPanel } from '@/ui/panel';
import { sfx } from '@/audio/Sfx';

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
/** x de cada columna de recursos, medido para el peor caso ("Comida 30") en RETRO_FONT
 * (bien más ancha por carácter que el monoespaciado de sistema que usaba esto antes)
 * con margen real. */
const RES_X = [6, 68, 146];
const LOADBAR_X = 210;
const LOADBAR_W = 54;

/** Diálogos que arrancan como cutscene de pantalla completa: fondo real detrás
 * (si ya existe el PNG) y HUD oculto mientras dura — docs/01-nivel-01.md §4. */
const CUTSCENE_DIALOGUES: Record<string, string> = {
  d_n1_cold_open: 'cold_open',
  d_n1_subida_barranca: 'subida_barranca',
  d_n1_manantial: 'manantial',
  d_n1_mimosa_zarpa: 'mimosa_zarpa',
  d_n1_final: 'punta_final',
};

/** Contexto geográfico para quien ve la escena por primera vez, en la misma
 * etiqueta que ya usa el juego para el nombre de zona (showZone) — solo donde
 * hace falta ubicar al jugador (el desembarco), no en cada cutscene. */
const CUTSCENE_LOCATIONS: Record<string, string> = {
  d_n1_cold_open: 'Punta Cuevas, Patagonia',
};

export class UiScene extends Phaser.Scene {
  private dayEl!: Phaser.GameObjects.DOMElement;
  private resEls = new Map<ResourceId, HTMLDivElement>();
  private loadBar!: Phaser.GameObjects.Rectangle;
  private toast!: Phaser.GameObjects.Text;
  private toastHideTimer: Phaser.Time.TimerEvent | null = null;
  private zoneLabel!: Phaser.GameObjects.Text;
  private dialogue!: DialogueBox;
  private touch!: TouchControls;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayCleanup: (() => void) | null = null;
  private hudObjects: Array<
    Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.DOMElement | Phaser.GameObjects.Graphics
  > = [];
  private cutsceneBg: Cinematic | null = null;

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
    world.events.on('request-refusal', (npcId: string, text?: string) => this.openRefusal(npcId, text));

    bus.on('resource:changed', () => this.refreshResources());
    // OJO: la cutscene de amanecer NO se dispara desde acá (ver showSunrise): este
    // evento sale en medio de TriggerSystem.consume() (spendTurns corre ANTES de que
    // WorldScene.runTrigger() decida lanzar CampScene), así que llamar a
    // this.dialogue acá pisaba el diálogo del fogón un instante después, sin que
    // nadie llegara a verlo, y dejaba el fondo/título de la cutscene huérfanos (su
    // onClose nunca corría). CampScene.restoreOnShutdown() la llama en el momento
    // correcto: cuando el jugador se despierta, no en medio de la noche anterior.
    bus.on('time:turn-advanced', () => this.refreshTime());
    bus.on('inventory:weight-changed', () => this.refreshLoad());
    bus.on('ui:toast', ({ text }) => {
      sfx.chime();
      this.showToast(text);
    });
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
    const track = (
      o: Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle | Phaser.GameObjects.DOMElement | Phaser.GameObjects.Graphics,
    ): void => {
      this.hudObjects.push(o);
    };
    // opaco del todo, no 0.96: mismo criterio que la bandeja (DialogueBox.bg,
    // buildTray) — más contraste para el texto contra el mundo de fondo.
    // placa con volumen (ui/panel.ts), con sombra proyectada hacia abajo sobre el mundo
    track(addPanel(this, h.x, h.y, h.w, h.h, { top: PAL.ink2, bottom: PAL.void, dropShadow: 'down' }).setDepth(60));

    // texto del HUD en HTML real, no Phaser Text: por más que se lo fuerce a
    // reescalado suave (index.html), a este tamaño (8-9px internos) el texto de
    // Phaser sigue horneado en un canvas de baja resolución fija y se ve borroso en
    // un celular real — confirmado en dispositivo, no alcanzaba con eso. Un <div>
    // lo rasteriza el navegador a la resolución física real de la pantalla, nítido
    // sin importar el factor de escala.
    const domStyle = (size: number, color: string): string =>
      `color:${color}; font-family: ${RETRO_FONT}; font-size:${size}px; white-space:nowrap; pointer-events:none;`;

    // fila 1: jornada y turno, centrados, con los 4 puntitos de turno (uno por
    // amanecer/mañana/tarde/noche, el de hoy resaltado) a la derecha del texto.
    // El "display:flex" NO puede ir en el <div> que crea este DOMElement: Phaser le
    // pisa el estilo `display` a mano en cada frame (lo fuerza a "block" para
    // mostrar/ocultar el elemento — mismo mecanismo que ya rompió un botón de
    // TouchControls esta sesión), así que un flex puesto ACÁ se pierde apenas
    // Phaser renderiza una vez y el gap/centrado interno deja de aplicar aunque el
    // texto se vea bien. El flex real vive en un <div> HIJO, adentro, que Phaser no
    // toca — ver refreshTime().
    //
    // ancho FIJO (h.w) + origin (0,0), no origin (0.5,0) sobre un div de ancho
    // automático: con ancho automático, Phaser necesita MEDIR el render real del
    // contenido para calcular el offset del centrado, y esa medida puede tomarse
    // con la fuente de reserva del sistema si "Press Start 2P" todavía no terminó
    // de bajar de Google Fonts (compitiendo con el preload de imágenes) — el texto
    // quedaba centrado con un ancho que no era el real, corrido y cortado contra el
    // borde de pantalla, y nada lo recalculaba después (pasaba incluso en el primer
    // "Jornada 1 · Amanecer" del arranque, antes de que corriera ningún otro turno).
    // Con ancho fijo, Phaser siempre mide lo mismo (h.w), sin importar la fuente —
    // el centrado real queda 100% del lado de justify-content en el <div> hijo, que
    // el navegador sí recalcula solo apenas la fuente entra, sin ayuda de JS.
    this.dayEl = this.add
      .dom(h.x, 5, 'div', `pointer-events:none; font-family: ${RETRO_FONT}; font-size:${FONT.tiny}; width:${h.w}px;`)
      .setOrigin(0, 0);
    track(this.dayEl);

    // fila 2: recursos con nombre completo y barra de carga, en columnas fijas.
    // Tamaño más chico (8px) que antes: RETRO_FONT es bien más ancha que el
    // monoespaciado de sistema que tenía esto, y a 9px "COMIDA 30" ya no entraba
    // en su columna (medido con el ancho real renderizado).
    HUD_RESOURCES.forEach((id, i) => {
      const el = this.add.dom(RES_X[i]!, 19, 'div', domStyle(8, '#EAE8E0')).setOrigin(0, 0);
      this.resEls.set(id, el.node as HTMLDivElement);
      track(el);
    });

    // sin la palabra "CARGA" al lado: ocupaba tanto lugar como la barra misma y
    // quedaba apretada contra los recursos. La barra ya se explica sola (el
    // tutorial tut_carga la señala como "la barra de la derecha") y gana el ancho
    // que liberó la etiqueta.
    // barra de carga hundida: fondo oscuro con canto de luz abajo
    track(this.add.rectangle(LOADBAR_X - 1, 19, LOADBAR_W + 2, 7, PAL.void).setOrigin(0, 0).setDepth(62));
    track(this.add.rectangle(LOADBAR_X - 1, 25, LOADBAR_W + 2, 1, PAL.wheat, 0.4).setOrigin(0, 0).setDepth(62));
    this.loadBar = this.add.rectangle(LOADBAR_X, 20, 0, 5, PAL.moss).setOrigin(0, 0).setDepth(63);
    track(this.loadBar);
  }

  /** Oculta/muestra el HUD entero — cutscenes de pantalla completa lo tapan (docs/01 §4).
   * El joystick/botón de acción también: CampScene/CargoScene pausan World (nadie
   * vuelve a limpiar el contexto del botón, ej. "HABLAR" quedaba flotando congelado
   * sobre la escena nueva) y de por sí no hacen falta en una pantalla sin mundo. */
  private setHudVisible(visible: boolean): void {
    for (const o of this.hudObjects) o.setVisible(visible);
    this.touch.setVisible(visible);
  }

  /* ---------------- bandeja (franja inferior, 96 px) ---------------- */

  private buildTray(): void {
    const t = VIEW.tray;
    // PAL.ink, no PAL.void: la bandeja tiene que leerse como panel del juego,
    // no fundirse con el fondo de la página que queda fuera del canvas. Opaca del
    // todo (no 0.97): mismo criterio que DialogueBox.bg.
    // misma placa que el diálogo (DialogueBox.bg): al abrirse uno sobre la otra no cambia nada de lugar
    addPanel(this, t.x, t.y, t.w, t.h, { top: PAL.ink2, bottom: PAL.void, trim: true, dropShadow: 'up' }).setDepth(40);

    this.zoneLabel = crisp(
      this.add
        .text(VIEW.width / 2, VIEW.world.y + 8, '', {
          fontFamily: RETRO_FONT,
          fontSize: FONT.small,
          color: '#F2EDE0',
          // contorno fino + sombra corta, como el título de la portada: se lee
          // sobre cualquier fondo sin el trazo grueso de antes
          stroke: '#0E1416',
          strokeThickness: 2,
          shadow: { offsetX: 0, offsetY: 2, color: 'rgba(14,20,22,0.8)', blur: 0, fill: true, stroke: true },
        })
        .setOrigin(0.5, 0)
        .setDepth(70)
        .setAlpha(0)
        .setResolution(8),
    );

    // origin (0.5, 1) + ancla pegada al borde de la bandeja: los toasts más largos
    // ("+3 haz de leña (a cargar hasta el fogón)") no entran en una línea ni al
    // tamaño más chico legible (miden 320px contra 270 de pantalla) — con wordWrap
    // crecen hacia ARRIBA desde ese punto fijo, así nunca se meten en la bandeja
    // sin importar cuántas líneas terminen ocupando.
    this.toast = crisp(
      this.add
        .text(VIEW.width / 2, VIEW.tray.y - 4, '', {
          fontFamily: RETRO_FONT,
          fontSize: FONT.tiny,
          color: '#D9A845',
          // sin caja: contorno fino y sombra corta, como los textos de la portada
          stroke: '#0E1416',
          strokeThickness: 2,
          shadow: { offsetX: 0, offsetY: 2, color: 'rgba(14,20,22,0.85)', blur: 0, fill: true, stroke: true },
          lineSpacing: 3,
          align: 'center',
          wordWrap: { width: VIEW.width - 24 },
        })
        .setOrigin(0.5, 1)
        .setDepth(70)
        .setAlpha(0)
        .setResolution(8),
    );
  }

  /* ---------------- refrescos ---------------- */

  private refreshTime(): void {
    const s = game.state.progress;
    // los 4 puntitos, uno por turno del día (TURNS): los YA CRUZADOS (incluido el
    // actual) en dorado, los que faltan apagados — de un vistazo, cuánto lleva
    // andado el día, no solo en qué turno está parado ahora mismo.
    const dots = TURNS.map(
      (_, i) =>
        // rombos, como el ornamento de la portada
        `<span style="width:4px; height:4px; display:inline-block; transform:rotate(45deg); background:${
          i <= game.time.turnIndex ? '#D9A845' : '#3A4A50'
        };"></span>`,
    ).join('');
    // setHTML(), no node.textContent/innerHTML directo: el centrado (origen 0.5)
    // necesita que Phaser sepa el ancho ACTUAL del div para su offset, y solo lo
    // recalcula (updateSize()) cuando el contenido cambia a través de su propio
    // método — mismo bug ya encontrado en TouchControls (ver ese commit).
    // Mayúsculas en todo el HUD: a este tamaño de letra, minúsculas con
    // ascendentes/descendentes finos se leen peor en un celular real.
    this.dayEl.setHTML(
      `<div style="display:flex; align-items:center; justify-content:center; gap:6px;">` +
        `<span style="color:#D9A845;">JORNADA ${s.day} · ${game.time.label().toUpperCase()}</span>` +
        `<span style="display:inline-flex; gap:3px;">${dots}</span>` +
        `</div>`,
    );
  }

  // nombre en un tono apagado, cantidad en uno bien claro: antes los tres recursos
  // se leían del mismo color y tamaño, pegados uno al lado del otro ("AGUA
  // 18COMIDA 14LEÑA 2") — a simple vista costaba separar dónde termina un recurso
  // y empieza el siguiente. El contraste de color hace ese corte solo, sin gastar
  // ancho en separadores.
  private refreshResources(): void {
    for (const [id, el] of this.resEls) {
      const v = game.res.get(id);
      const label = (RES_LABEL[id] ?? id).toUpperCase();
      const valueColor = game.res.isCritical(id) ? '#DE7050' : '#EAE8E0';
      el.innerHTML = `<span style="color:#7FB0B8">${label}</span> <span style="color:${valueColor}">${Math.round(v)}</span>`;
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
    // el botón de acción es HTML aparte del canvas y queda SIEMPRE por encima
    // del toast (ver TouchControls) — un texto de 2 líneas cerca del botón
    // (ej. "Mirar" un bote) quedaba tapado. Se oculta mientras el toast se ve.
    this.toastHideTimer?.remove();
    this.touch.setToastShowing(true);
    this.toastHideTimer = this.time.delayedCall(2200, () => this.touch.setToastShowing(false));
  }

  private showZone(label: string): void {
    this.zoneLabel.setText(label.toUpperCase()).setAlpha(1);
    this.tweens.killTweensOf(this.zoneLabel);
    this.tweens.add({ targets: this.zoneLabel, alpha: 0, delay: 1400, duration: 600 });
  }

  /** Cutscene corta al empezar el Amanecer de cada día (menos el 1, que ya tiene su
   * propia apertura): marca el ritmo de jornada a jornada con el mismo lenguaje que
   * cualquier otra cutscene (fondo real si existe, "JORNADA N" en la fuente retro
   * arriba, toca para seguir) en vez de que el único indicio sea el texto chico del
   * HUD. Si todavía no hay `sunrise.png` cae en un sol simple dibujado por código, no
   * en nada — este momento no puede quedar vacío.
   *
   * La llama CampScene.restoreOnShutdown() cuando el jugador se despierta, no un
   * listener de 'time:turn-advanced': ese evento sale en medio de
   * TriggerSystem.consume() (spendTurns corre ANTES de que WorldScene.runTrigger()
   * decida lanzar CampScene), así que reaccionar ahí pisaba el diálogo del fogón un
   * instante después sin que nadie llegara a verlo, y dejaba esta cutscene huérfana
   * (su propio cierre nunca corría, y con eso el joystick quedaba escondido para
   * siempre — o, si algo más lo reactivaba de paso, visible encima de un diálogo
   * bloqueado, que es como se veía "trabado" desde afuera).
   *
   * `onDone` corre DESPUÉS de que esta cutscene cierra sola, nunca en paralelo con
   * otro diálogo: CampScene la encadena con wakeAtCamp() ahí, así trig_amanecer_j2
   * (que sí necesita el jugador ya reposicionado) recién se evalúa una vez que esta
   * terminó de verdad — las dos pantallas nunca compiten por el mismo DialogueBox. */
  showSunrise(day: number, onDone?: () => void): void {
    this.touch.setVisible(false);
    this.setHudVisible(false);
    this.tweens.killTweensOf(this.zoneLabel);
    this.zoneLabel.setAlpha(0);

    const cx = VIEW.width / 2;
    const cy = VIEW.tray.y / 2;
    const cine = playCinematic(this, 'sunrise', { x: 0, y: 0, w: VIEW.width, h: VIEW.tray.y });
    const bg = cine.image;
    const extras: Phaser.GameObjects.GameObject[] = [];
    if (!bg) {
      extras.push(this.add.rectangle(0, 0, VIEW.width, VIEW.tray.y, PAL.ink2).setOrigin(0, 0).setDepth(-6));
      const horizonY = cy + 30;
      const glow = this.add.circle(cx, horizonY, 70, PAL.wheat, 0.12).setDepth(-5);
      const sun = this.add.circle(cx, horizonY + 40, 22, PAL.wheat, 0.9).setDepth(-4);
      extras.push(glow, sun);
      this.tweens.add({ targets: [glow, sun], y: `-=40`, duration: 1400, ease: 'Sine.out' });
      this.tweens.add({ targets: glow, alpha: 0.22, duration: 1400, ease: 'Sine.out' });
    }

    // más grande que un título de overlay común (FONT.title) y con sombra: esto
    // marca el arranque de una jornada nueva, no una pantalla de trámite — tiene
    // que pegar más fuerte que "Decisión" o "Carga".
    const title = crisp(
      this.add
        .text(cx, 14, `JORNADA ${day}`, { fontFamily: RETRO_FONT, fontSize: '16px', color: '#D9A845' })
        .setOrigin(0.5, 0)
        .setShadow(2, 2, '#000000', 4, true, true)
        .setDepth(-3)
        .setResolution(8),
    );

    // no repite "Jornada N." (eso ya lo dice el título de arriba): adelanta de
    // qué va el día, con el mismo one-liner que ya usa docs/01-nivel-01.md §4
    // para cada jornada — así el pie de esta pantalla suma algo en vez de ser el
    // mismo texto dos veces.
    const preview: Record<number, string> = {
      2: 'Hoy el objetivo es el agua. Lewis reparte las tareas apenas salga el sol.',
      3: 'Hoy se decide qué se lleva al sur y qué se queda. No hay vuelta atrás.',
    };
    this.dialogue.announce(
      preview[day] ?? `Jornada ${day}.`,
      () => {
        this.touch.setContext(null);
        this.touch.setVisible(true);
        this.setHudVisible(true);
        cine.close();
        title.destroy();
        for (const o of extras) o.destroy();
        onDone?.();
      },
      // más claro que el gris apagado de narración ambiental (ver DialogueBox.show):
      // acá el pie ES el contenido de la pantalla, no una línea de flavor de fondo.
      '#EAE8E0',
    );
  }

  /* ---------------- modales ---------------- */

  private openDialogue(id: string, next?: string): void {
    const cutsceneId = CUTSCENE_DIALOGUES[id];
    // el joystick/botón son HTML aparte del canvas: no se tapan solos detrás de una
    // cutscene ni de ningún diálogo, hay que ocultarlos a mano.
    this.touch.setVisible(false);
    if (cutsceneId) {
      this.setHudVisible(false);
      // el cartel de zona (showZone) no es parte del HUD de arriba (setHudVisible),
      // así que sin esto podía quedar terminando de desvanecerse encima de una
      // cutscene que arranca casi en el mismo instante (ej. z1_playa al spawnear,
      // justo cuando entra el cold open) — lo corta acá y, si esta escena puntual
      // tiene un lugar definido, lo deja fijo mientras dure.
      this.tweens.killTweensOf(this.zoneLabel);
      const location = CUTSCENE_LOCATIONS[id];
      this.zoneLabel.setText(location ? location.toUpperCase() : '').setAlpha(location ? 1 : 0);
      // solo contra el área sin bandeja (0-384, el HUD ya está oculto): cubrir la
      // pantalla 9:16 entera recortaba mucho más de una imagen pedida en 3:4.
      // con entrada animada, movimiento y ambiente (ui/cinematic.ts), no de golpe y quieta
      this.cutsceneBg = playCinematic(this, cutsceneId, { x: 0, y: 0, w: VIEW.width, h: VIEW.tray.y });
    }
    this.dialogue.start(id, () => {
      // `next` viene del trigger que disparó este diálogo (ej. trig_punta_final):
      // si lo tiene, era el cierre del nivel — no hay nada más que restaurar acá,
      // TransitionScene reemplaza World/Ui entero.
      if (next) {
        this.scene.launch('Transition', { next });
        return;
      }
      if (id === 'd_n1_manantial') (this.scene.get('World') as WorldScene).sendDafyddHome();
      this.touch.setContext(null);
      this.touch.setVisible(true);
      if (cutsceneId) {
        this.setHudVisible(true);
        this.cutsceneBg?.close();
        this.cutsceneBg = null;
        if (CUTSCENE_LOCATIONS[id]) this.zoneLabel.setAlpha(0);
      }
    });
  }

  /** El NPC más cercano no tiene nada que decir todavía (requires sin cumplir, o ya
   * habló lo que tenía). Va por la misma bandeja que cualquier diálogo real. */
  private openRefusal(npcId: string, text?: string): void {
    this.touch.setVisible(false);
    this.dialogue.refuse(npcId, () => this.touch.setVisible(true), text);
  }

  private openTutorial(id: string): void {
    const t = registry.tutorial(id);
    if (!t) return;
    this.openOverlay(t.title, t.text, [{ label: 'Entendido', onPick: () => this.closeOverlay() }], t.hint);
  }

  private openChoice(id: string): void {
    const c = registry.choiceScreen(id);
    this.openOverlay(
      'Decisión',
      c.prompt,
      c.options.map((o) => ({
        label: o.text,
        detail: o.detail,
        onPick: () => {
          game.applyEffects(o.effects);
          this.closeOverlay();
          // lo que se eligió puede habilitar un trigger al toque (ej. Lewis
          // explicando la tarea): no esperar a que el jugador dé un paso
          (this.scene.get('World') as WorldScene).recheckTriggers();
        },
      })),
      c.hint,
    );
  }

  /** Cartel del medio de la pantalla (tutoriales y decisiones): una tarjeta
   * compacta, centrada en la franja del mundo y del alto de lo que dice — el
   * mundo se sigue viendo alrededor. Texto en HTML real (como el HUD), no Phaser
   * Text: a 8-9 px internos el Text de Phaser queda horneado a baja resolución y
   * se ve borroso en el celular, y sin interlineado propio las opciones de dos
   * líneas se pisaban. Misma fuente (RETRO_FONT), colores y cursor "›" que el
   * resto del juego. `footer` es el `hint` de los datos: va abajo, más apagado. */
  private openOverlay(
    title: string,
    body: string,
    options: Array<{ label: string; detail?: string; onPick: () => void }>,
    footer?: string,
  ): void {
    this.closeOverlay();
    input.locked = true;
    this.touch.setVisible(false);

    const margin = 14;
    const pad = 12;
    const w = VIEW.width - margin * 2;
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // display lo pisa Phaser en el div que crea: el layout real vive en un hijo
    const el = this.add.dom(margin, 0, 'div', `width:${w}px; pointer-events:auto;`).setOrigin(0, 0).setDepth(121);
    const root = el.node as HTMLDivElement;
    // comillas simples: RETRO_FONT trae comillas dobles y cortaría el atributo style
    const font = RETRO_FONT.replace(/"/g, "'");
    root.innerHTML =
      `<div style="box-sizing:border-box; width:${w}px; padding:${pad}px; font-family:${font}; color:#EAE8E0; text-align:left;">` +
      `<div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#D9A845; line-height:1;">` +
      `<span style="width:4px; height:4px; background:#9C3A24; display:inline-block;"></span>${esc(title)}</div>` +
      `<div style="height:1px; background:rgba(127,176,184,0.35); margin:8px 0 9px;"></div>` +
      `<div style="font-size:8px; line-height:1.75;">${esc(body)}</div>` +
      `<div data-opts style="display:flex; flex-direction:column; gap:5px; margin-top:11px;"></div>` +
      (footer
        ? `<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(127,176,184,0.22); ` +
          `font-size:7px; line-height:1.8; color:#7FB0B8;">${esc(footer)}</div>`
        : '') +
      `</div>`;
    const optsEl = root.querySelector('[data-opts]') as HTMLDivElement;

    const openedAt = performance.now();
    let focused = 0;
    const pick = (i: number): void => {
      // las opciones recién aparecidas no se pueden elegir (ver INPUT_GUARD)
      if (performance.now() - openedAt < INPUT_GUARD.choiceMs) return;
      sfx.select();
      options[i]!.onPick();
    };
    const buttons = options.map((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText =
        'display:flex; gap:4px; width:100%; box-sizing:border-box; margin:0; padding:7px 8px; text-align:left; ' +
        `font-family:${RETRO_FONT}; font-size:8px; line-height:1.6; cursor:pointer; ` +
        'background:rgba(14,20,22,0.55); border:1px solid rgba(217,168,69,0.35); ' +
        'box-shadow:0 2px 6px rgba(0,0,0,0.3); -webkit-tap-highlight-color:transparent;';
      const cur = document.createElement('span');
      cur.textContent = '›';
      cur.style.cssText = 'flex:none; width:8px;';
      const label = document.createElement('span');
      label.style.cssText = 'display:flex; flex-direction:column; gap:3px;';
      label.append(o.label);
      if (o.detail) {
        // qué implica la opción, en chico y apagado debajo
        const det = document.createElement('span');
        det.textContent = o.detail;
        det.style.cssText = 'font-size:7px; line-height:1.6; color:#7FB0B8;';
        label.appendChild(det);
      }
      b.append(cur, label);
      b.addEventListener('click', () => pick(i));
      b.addEventListener('pointerenter', () => {
        focused = i;
        paint();
      });
      optsEl.appendChild(b);
      return { b, cur };
    });
    const paint = (): void =>
      buttons.forEach(({ b, cur }, i) => {
        const on = i === focused;
        b.style.color = on ? '#D9A845' : '#BFD3D8';
        b.style.borderColor = on ? '#D9A845' : 'rgba(217,168,69,0.35)';
        b.style.background = on ? 'linear-gradient(rgba(46,70,79,0.85), rgba(24,38,42,0.85))' : 'rgba(14,20,22,0.55)';
        cur.style.visibility = on ? 'visible' : 'hidden';
        cur.style.animation = on ? 'dlg-cursor-blink 0.9s step-end infinite' : '';
      });
    paint();

    // alto según el contenido, centrado en la franja del mundo
    const h = Math.min(root.offsetHeight, VIEW.world.h - 16);
    const y = VIEW.world.y + Math.round((VIEW.world.h - h) / 2);
    el.setY(y);
    const bg = addPanel(this, margin, y, w, h, {
      top: PAL.ink2,
      bottom: PAL.void,
      alpha: 0.97,
      trim: true,
      dropShadow: 'around',
    }).setDepth(120);
    // fundido suave del mundo detrás, para que la tarjeta mande
    const dim = this.add.rectangle(0, VIEW.world.y, VIEW.width, VIEW.world.h, PAL.void, 0.35).setOrigin(0, 0).setDepth(119);
    this.overlay = this.add.container(0, 0, [dim, bg, el]).setDepth(120);

    // abajo/arriba + botón de acción, además del toque (GDD §8)
    const kb = this.input.keyboard;
    const move = (d: number) => (): void => {
      focused = Math.max(0, Math.min(buttons.length - 1, focused + d));
      paint();
    };
    const down = move(1);
    const up = move(-1);
    const ok = (): void => pick(focused);
    const binds: Array<[string, () => void]> = [
      ['keydown-DOWN', down],
      ['keydown-S', down],
      ['keydown-UP', up],
      ['keydown-W', up],
      ['keydown-SPACE', ok],
      ['keydown-E', ok],
      ['keydown-ENTER', ok],
    ];
    for (const [ev, fn] of binds) kb?.on(ev, fn);
    this.overlayCleanup = () => {
      for (const [ev, fn] of binds) kb?.off(ev, fn);
    };
  }

  private closeOverlay(): void {
    this.overlayCleanup?.();
    this.overlayCleanup = null;
    this.overlay?.destroy(true);
    this.overlay = null;
    input.locked = false;
    this.touch.setVisible(true);
  }
}
