import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { ResourceId } from '@/core/types';
import type { WorldScene } from '@/scenes/WorldScene';
import { addSceneBackground } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { TouchControls } from '@/ui/TouchControls';
import { input } from '@/util/input';
import { SelectList } from '@/util/selectList';
import { crisp, FONT, RETRO_FONT } from '@/util/text';
import { TURNS } from '@/systems/TimeSystem';

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
    // OJO: la cutscene de amanecer NO se dispara desde acá (ver showSunrise): este
    // evento sale en medio de TriggerSystem.consume() (spendTurns corre ANTES de que
    // WorldScene.runTrigger() decida lanzar CampScene), así que llamar a
    // this.dialogue acá pisaba el diálogo del fogón un instante después, sin que
    // nadie llegara a verlo, y dejaba el fondo/título de la cutscene huérfanos (su
    // onClose nunca corría). CampScene.restoreOnShutdown() la llama en el momento
    // correcto: cuando el jugador se despierta, no en medio de la noche anterior.
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

    // mismo problema que ya resolvió BootScene (document.fonts.ready): si esta escena
    // arranca ANTES de que "Press Start 2P" termine de bajar de Google Fonts (ej. al
    // entrar directo a una jornada avanzada, con el preload de imágenes compitiendo
    // por ancho de banda), setHTML() mide el div con la fuente de sistema de reserva
    // — más angosta — y Phaser centra el texto con ESE ancho. Cuando la fuente real
    // carga un instante después el texto se redibuja más ancho pero nadie recalcula
    // el centrado: "Jornada 3 · Tarde" quedaba corrido a la derecha, cortado por el
    // borde de pantalla. Repetir refreshTime() una vez que la fuente está lista
    // corrige el centrado con el ancho real.
    document.fonts?.ready.then(() => this.refreshTime());
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
    this.dayEl = this.add
      .dom(h.w / 2, 5, 'div', `pointer-events:none; font-family: ${RETRO_FONT}; font-size:${FONT.tiny};`)
      .setOrigin(0.5, 0);
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
    track(this.add.rectangle(LOADBAR_X, 20, LOADBAR_W, 5, PAL.ink2).setOrigin(0, 0).setDepth(62));
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
    this.add.rectangle(t.x, t.y, t.w, t.h, PAL.ink, 1).setOrigin(0, 0).setDepth(40);
    this.add.rectangle(t.x, t.y, t.w, 1, PAL.slate).setOrigin(0, 0).setDepth(41);

    this.zoneLabel = crisp(
      this.add
        .text(VIEW.width / 2, VIEW.world.y + 8, '', { fontFamily: RETRO_FONT, fontSize: FONT.body, color: '#EAE8E0' })
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
          backgroundColor: '#18262A',
          padding: { x: 4, y: 2 },
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
    // los 4 puntitos, uno por turno del día (TURNS): el de hoy resaltado en dorado,
    // el resto apagado — la misma información que ya da el texto, pero de un
    // vistazo, sin tener que leer la palabra.
    const dots = TURNS.map(
      (_, i) =>
        `<span style="width:5px; height:5px; display:inline-block; background:${
          i === game.time.turnIndex ? '#D9A845' : '#3A4A50'
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
    const bg = addSceneBackground(this, 'sunrise', cx, cy, VIEW.width, VIEW.tray.y);
    bg?.setDepth(-5);
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
        bg?.destroy();
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
      if (id === 'd_n1_manantial') (this.scene.get('World') as WorldScene).sendDafyddHome();
      this.touch.setContext(null);
      this.touch.setVisible(true);
      if (cutsceneId) {
        this.setHudVisible(true);
        this.cutsceneBg?.destroy();
        this.cutsceneBg = null;
        if (CUTSCENE_LOCATIONS[id]) this.zoneLabel.setAlpha(0);
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
    this.openOverlay(t.title, t.text, [{ label: 'Entendido', onPick: () => this.closeOverlay() }], t.hint);
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
      c.hint,
    );
  }

  /** Panel confinado al cuadro de mapa (VIEW.world: la franja del medio, entre HUD y
   * bandeja) — no a la pantalla entera. El HUD y la bandeja se quedan a la vista
   * alrededor, no hace falta ocultarlos ni ganan sentido las "ventanas flotantes"
   * que evita GDD §8: esto sigue siendo un panel fijo, solo que del tamaño de la
   * franja que le corresponde en las tres bandas del layout (docs/00-GDD.md §8),
   * con el mismo marco con borde que las cajas del arranque (BootScene.renderMenu).
   * Todo el panel en RETRO_FONT — misma fuente en todos lados, ver util/text.ts.
   * `footer` (opcional) es la aclaración técnica o el consejo de juego de
   * `hint` en los datos (choices/tutoriales) — va anclado abajo del todo del
   * panel, separado por su propia línea, para no dejar vacío el resto de la
   * franja cuando el cuerpo y las opciones son cortos (que es casi siempre). */
  private openOverlay(
    title: string,
    body: string,
    options: Array<{ label: string; onPick: () => void }>,
    footer?: string,
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
        .setResolution(8),
    );
    const rule = this.add.rectangle(16, top + 42, VIEW.width - 32, 1, PAL.seaPale, 0.35).setOrigin(0, 0);
    // FONT.tiny (9px), no FONT.body: este panel tiene alto FIJO, sin paginado ni
    // scroll (a diferencia de DialogueBox) — a 11px el cuerpo + opciones + footer de
    // "Carga" o "¿Qué elegís primero?" se salían del panel por abajo, superpuestos
    // con el mundo. Medido con las 6 pantallas reales del juego (4 tutoriales, 2
    // decisiones) contra el alto real disponible: a 9px todas entran con margen.
    const bodyT = crisp(
      this.add
        .text(16, top + 48, body, {
          fontFamily: RETRO_FONT,
          fontSize: FONT.tiny,
          color: '#EAE8E0',
          wordWrap: { width: VIEW.width - 32 },
          lineSpacing: 4,
        })
        .setResolution(8),
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
            fontFamily: RETRO_FONT,
            fontSize: FONT.tiny,
            color: '#BFD3D8',
            wordWrap: { width: VIEW.width - 72 },
          })
          .setResolution(8),
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

    if (footer) {
      const panelBottom = top + VIEW.world.h - margin;
      const footerT = crisp(
        this.add
          .text(16, 0, footer, {
            fontFamily: RETRO_FONT,
            fontSize: FONT.tiny,
            color: '#7FB0B8',
            wordWrap: { width: VIEW.width - 32 },
            lineSpacing: 3,
          })
          .setResolution(8),
      );
      // anclado abajo del todo salvo que las opciones ya lleguen tan abajo que se
      // pisarían — en ese caso, se corre justo debajo de la última opción.
      const footerY = Math.max(y + 4, panelBottom - footerT.height - 12);
      footerT.setPosition(16, footerY);
      const footerRule = this.add.rectangle(16, footerY - 8, VIEW.width - 32, 1, PAL.seaPale, 0.25).setOrigin(0, 0);
      items.push(footerRule, footerT);
    }

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
