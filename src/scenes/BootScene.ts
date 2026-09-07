import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { saveSystem } from '@/systems/SaveSystem';
import { addSceneBackground, preloadArt } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';
import { makePortraits, makeProps, makeShipLarge } from '@/util/textures';

type Gender = 'f' | 'm';
const DEFAULT_NAME: Record<Gender, string> = { f: 'Elin', m: 'Idris' };

// tres franjas fijas durante todo el arranque, igual de espíritu que HUD/mundo/bandeja
// del juego real (VIEW en config.ts): título arriba, imagen al medio, diálogo abajo.
// Achica bastante el recorte de las escenas 3:4 contra la pantalla 9:16 completa, y el
// título deja de competir con lo que haya debajo — tiene su propio fondo sólido.
const TOP_H = 70;
const TRAY_Y = VIEW.tray.y;
const TRAY_H = VIEW.tray.h;
const IMG_H = TRAY_Y - TOP_H;
const IMG_CY = TOP_H + IMG_H / 2;

/**
 * Portada + arranque de partida. La secuencia es: título (continuar/nueva partida)
 * → la Mimosa en el puerto, preguntando género → nombre → enlistamiento con
 * Pepperell (con la escena correspondiente al género) → recién ahí el Nivel 1.
 * Así conocés al capitán ANTES de que te grite en la playa (docs/01 T1).
 */
export class BootScene extends Phaser.Scene {
  /** Todo lo que dibuja el paso actual (menos el título/bandeja fijos), para borrarlo al cambiar de paso. */
  private stepObjects: Phaser.GameObjects.GameObject[] = [];
  private nameInput: Phaser.GameObjects.DOMElement | null = null;
  private dialogue: DialogueBox | null = null;

  private playerName = '';
  private playerGender: Gender = 'f';

  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    const cx = VIEW.width / 2;
    makeProps(this); // trae 'prop_mimosa': WorldScene todavía no corrió, no existe todavía
    makeShipLarge(this); // versión grande de 3 mástiles, solo para estas cinemáticas
    makePortraits(this); // retratos placeholder por si el diálogo de enlistamiento ya los necesita

    // placeholder de color mientras no haya PNG real, acotado al área de la imagen.
    this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void).setOrigin(0, 0).setDepth(-10);
    this.add.rectangle(0, TOP_H + IMG_H * 0.55, VIEW.width, IMG_H * 0.2, PAL.sea, 0.5).setOrigin(0, 0).setDepth(-10);
    this.add.rectangle(0, TOP_H + IMG_H * 0.75, VIEW.width, IMG_H * 0.25, PAL.soil, 0.6).setOrigin(0, 0).setDepth(-10);

    // franja superior fija: título/subtítulo, siempre visibles durante todo el arranque,
    // con su propio fondo sólido — así nunca compiten con la imagen de atrás. Opaca del
    // todo (no 0.97): mismo criterio que la bandeja de diálogo (DialogueBox.bg), más
    // contraste para el título contra la imagen de fondo.
    this.add.rectangle(0, 0, VIEW.width, TOP_H, PAL.ink, 1).setOrigin(0, 0).setDepth(20);
    this.add.rectangle(0, TOP_H - 1, VIEW.width, 1, PAL.slate).setOrigin(0, 0).setDepth(21);
    crisp(
      this.add
        .text(cx, 24, 'Y WLADFA', { fontFamily: FONT_FAMILY, fontSize: FONT.hero, color: '#EAE8E0', align: 'center' })
        .setOrigin(0.5)
        .setResolution(4)
        .setDepth(22),
    );
    crisp(
      this.add
        .text(cx, 48, 'La Huella de los Rifleros', { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
        .setOrigin(0.5)
        .setResolution(4)
        .setDepth(22),
    );

    // bandeja inferior fija: mismo estilo que la bandeja real del juego (UiScene.buildTray),
    // opaca del todo — igual que DialogueBox.bg, para que no haya un salto de contraste
    // entre esta franja "de reposo" y la que se ve apenas arranca un diálogo.
    this.add.rectangle(0, TRAY_Y, VIEW.width, TRAY_H, PAL.ink, 1).setOrigin(0, 0).setDepth(20);
    this.add.rectangle(0, TRAY_Y, VIEW.width, 1, PAL.slate).setOrigin(0, 0).setDepth(21);

    this.renderTitle();
  }

  /* ---------------- paso 1: título (continuar / nueva partida) ---------------- */

  private renderTitle(): void {
    this.clearStep();
    // acá arranca la historia de verdad: la salida, no la llegada a Punta Cuevas
    // (docs/04-guia-historica.md — el Mimosa zarpa el 28-V-1865 de Liverpool. Liverpool
    // es un puerto inglés, no galés — los colonos viajaron hasta ahí para embarcarse).
    this.renderImage('mimosa_puerto');

    // contexto narrativo en la bandeja, como cualquier línea de narrador.
    this.track(
      crisp(
        this.add
          .text(
            16,
            TRAY_Y + 14,
            'Liverpool, 28 de mayo de 1865. El Mimosa lleva colonos galeses rumbo a Sudamérica: van a fundar Y Wladfa, la Colonia.',
            {
              fontFamily: FONT_FAMILY,
              fontSize: FONT.tiny,
              color: '#9BAEB4',
              wordWrap: { width: VIEW.width - 32 },
              lineSpacing: 4,
            },
          )
          .setDepth(22)
          .setResolution(4),
      ),
    );

    // el menú (continuar/nueva partida) va bien visible sobre la imagen, no perdido
    // adentro del párrafo de la bandeja.
    const options: Array<{ label: string; onPick: () => void }> = [];
    const save = saveSystem.peek();
    if (save) options.push({ label: `Continuar — Jornada ${save.day}`, onPick: () => this.continueGame() });
    options.push({ label: 'Nueva partida', onPick: () => this.renderGenderIntro() });
    this.renderMenu(options, IMG_CY + 60);
  }

  /* ---------------- paso 2: la Mimosa en el puerto, ¿varón o mujer? ---------------- */

  private renderGenderIntro(): void {
    this.clearStep();
    this.renderImage('mimosa_puerto');
    this.renderMenu(
      [
        { label: 'Varón', onPick: () => this.pickGender('m') },
        { label: 'Mujer', onPick: () => this.pickGender('f') },
      ],
      IMG_CY + 60,
      '¿Sos varón o mujer?',
    );
  }

  private pickGender(g: Gender): void {
    this.playerGender = g;
    this.renderName();
  }

  /* ---------------- paso 3: nombre ---------------- */

  private renderName(): void {
    this.clearStep();
    const cx = VIEW.width / 2;

    // la misma escena de enlistamiento a la que se llega después, ya con el género
    // elegido — no la Mimosa genérica de los pasos anteriores.
    this.renderImage(`enlistamiento_${this.playerGender}`);
    // esta pantalla es la única excepción a "todo el diálogo va en la bandeja de
    // abajo": el campo de nombre tiene que quedar arriba, pegado a la franja del
    // título, porque un teclado virtual de celular tapa desde la mitad de la
    // pantalla para abajo — si viviera en la bandeja, quedaría inaccesible al escribir.
    // Una sola franja bajita (campo + botón lado a lado), no un cuadro grande.
    const rowY = TOP_H + 44;
    this.renderTextBacking(TOP_H, TOP_H + 72);
    this.track(
      crisp(
        this.add
          .text(cx, TOP_H + 14, '¿Cómo te llamás?', { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
          .setOrigin(0.5)
          .setResolution(4)
          .setDepth(1),
      ),
    );

    const defaultName = DEFAULT_NAME[this.playerGender];
    const inputX = cx - 40;
    this.nameInput = this.add.dom(
      inputX,
      rowY,
      'input',
      'width:104px; padding:4px; text-align:center; font-family: ui-monospace, "SF Mono", Menlo, monospace; ' +
        'font-size:12px; background:#18262A; color:#EAE8E0; border:1px solid #2E464F; outline:none;',
    );
    const inputEl = this.nameInput.node as HTMLInputElement;
    inputEl.value = this.playerName || defaultName; // el 5to arg de add.dom() no sirve para el value de un <input>
    inputEl.maxLength = 18;
    inputEl.autocomplete = 'off'; // si no, el navegador puede autocompletar/sugerir un nombre ya tipeado antes

    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.confirmName();
    });
    // si el jugador cierra el teclado sin todavía avanzar de paso (toca afuera, o el
    // botón "ocultar teclado" del navegador), el mismo desincronizado de scale.ts
    // puede pasar ACÁ, antes de llegar a clearStep() — se dispara el mismo reintento
    // apenas el campo pierde foco, no solo al salir del paso.
    inputEl.addEventListener('blur', () => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    });
    inputEl.focus();

    // botón compacto al lado del campo, no una opción de lista aparte más abajo.
    this.track(this.renderDomButton(cx + 68, rowY, 'Ir ›', () => this.confirmName(), 62, 24));
  }

  private confirmName(): void {
    const raw = (this.nameInput?.node as HTMLInputElement | undefined)?.value.trim() ?? '';
    this.playerName = raw || DEFAULT_NAME[this.playerGender];
    if (saveSystem.hasSave()) this.renderConfirmOverwrite();
    else this.renderEnlist();
  }

  /* ---------------- empezar de nuevo con una partida ya guardada ---------------- */

  private renderConfirmOverwrite(): void {
    this.clearStep();
    this.renderImage(`enlistamiento_${this.playerGender}`);
    this.track(
      crisp(
        this.add
          .text(16, TRAY_Y + 10, 'Se pierde la partida guardada.', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#DE7050' })
          .setDepth(22)
          .setResolution(4),
      ),
    );
    this.renderOptions(
      [
        { label: 'Sí, empezar de nuevo', onPick: () => this.renderEnlist() },
        { label: 'Volver', onPick: () => this.renderName() },
      ],
      TRAY_Y + 44,
    );
  }

  /* ---------------- paso 4: enlistamiento con el capitán ---------------- */

  private renderEnlist(): void {
    this.clearStep();
    // el estado del juego pasa a tener el nombre/género elegidos ANTES de arrancar
    // el diálogo: si se hacía en beginNewGame() (al cerrarse), la charla misma se
    // jugaba todavía con el estado por defecto ("Elin"), sin importar qué se eligiera.
    saveSystem.clear();
    game.replaceState(createInitialState('nivel-01', this.playerName, this.playerGender));
    this.renderImage(`enlistamiento_${this.playerGender}`);
    this.dialogue = new DialogueBox(this);
    this.dialogue.start('d_n1_enlistamiento', () => this.renderVoyage());
  }

  /* ---------------- paso 5: la travesía, cinemática corta ---------------- */

  private renderVoyage(): void {
    this.clearStep();
    const cx = VIEW.width / 2;
    const bg = this.renderImage('travesia');

    if (!bg) {
      // mar animado por código: placeholder hasta que exista travesia.png
      this.track(this.add.rectangle(0, TOP_H, VIEW.width, IMG_H, PAL.sea, 0.9).setOrigin(0, 0).setDepth(-8));
      for (let i = 0; i < 5; i++) {
        const y = TOP_H + 20 + i * 46;
        const w = this.add.rectangle(0, y, VIEW.width * 1.4, 2, PAL.seaPale, 0.3).setOrigin(0, 0).setDepth(-7);
        this.track(w);
        this.tweens.add({ targets: w, x: -60, duration: 1600 + i * 260, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
      // acá se ve mucho más grande que en el mundo, así que usa la versión de tres
      // mástiles en vez del casco simple del prop chico (textures.ts).
      const ship = this.add.image(cx, IMG_CY, 'prop_mimosa_grande').setScale(2.3).setDepth(-5);
      this.track(ship);
      this.tweens.add({ targets: ship, y: '+=6', duration: 1500, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }

    this.track(
      crisp(
        this.add
          // dos meses de travesía real: 28-V-1865 (zarpada, Liverpool) a 28-VII-1865
          // (desembarco, Punta Cuevas) — docs/04-guia-historica.md.
          .text(16, TRAY_Y + 18, 'Dos meses de mar, rumbo al sur.', {
            fontFamily: FONT_FAMILY,
            fontSize: FONT.body,
            color: '#EAE8E0',
          })
          .setDepth(22)
          .setResolution(4),
      ),
    );
    // sin forma de adelantarla: un toque de una pantalla anterior que todavía
    // estuviera "en vuelo" alcanzaba para saltear la cinemática antes de que se
    // llegara a ver un solo frame. Esta y cualquier cinemática futura corren su
    // tiempo fijo completo, sin listener de toque/tecla que la pueda cortar.
    this.time.delayedCall(4500, () => this.scene.start('World'));
  }

  /* ---------------- arranque ---------------- */

  private continueGame(): void {
    const saved = saveSystem.load();
    if (saved) game.replaceState(saved);
    this.scene.start('World');
  }

  /* ---------------- helpers de UI ---------------- */

  /** Imagen cinemática acotada al área del medio (entre el título y la bandeja) si ya
   * existe el PNG; si no, no dibuja nada y queda el placeholder de color de create().
   * Al no cubrir la pantalla 9:16 entera, sino solo esta franja más "cuadrada", el
   * recorte contra el original 3:4 es mucho menor (docs/05-prompts-arte.txt §2). */
  private renderImage(sceneId: string): Phaser.GameObjects.Image | null {
    const img = addSceneBackground(this, sceneId, VIEW.width / 2, IMG_CY, VIEW.width, IMG_H);
    if (!img) return null;
    this.track(img.setDepth(-5));
    return img;
  }

  /** Franja oscura semitransparente para que el texto se lea encima de un fondo cinemático. */
  private renderTextBacking(fromY: number, toY: number = VIEW.height): void {
    this.track(this.add.rectangle(0, fromY, VIEW.width, toY - fromY, PAL.void, 0.55).setOrigin(0, 0).setDepth(-1));
  }

  /** Menú centrado sobre la imagen, con su propia caja — para las dos decisiones
   * "de portada" (continuar/nueva partida, género), no para el resto de los pasos.
   * `prompt` opcional: una pregunta como primera línea, adentro de la misma caja. */
  private renderMenu(options: Array<{ label: string; onPick: () => void }>, centerY: number, prompt?: string): void {
    const cx = VIEW.width / 2;
    const rowH = 26;
    const promptH = prompt ? 26 : 0;
    const boxH = promptH + options.length * rowH + 14;
    const boxY = centerY - boxH / 2;
    // sin `prompt` (título: nada más que "Nueva partida"/"Continuar") la caja
    // translúcida es puro relleno — los botones ya son opacos por su cuenta.
    // Con `prompt` (género: hay una pregunta arriba de las opciones) sigue haciendo
    // falta para que ese texto se lea contra la imagen.
    if (prompt) {
      this.track(
        this.add
          .rectangle(24, boxY, VIEW.width - 48, boxH, PAL.ink, 0.8)
          .setOrigin(0, 0)
          .setStrokeStyle(1, PAL.seaPale, 0.5)
          .setDepth(15),
      );
    }
    if (prompt) {
      this.track(
        crisp(
          this.add
            .text(cx, boxY + 8, prompt, { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
            .setOrigin(0.5, 0)
            .setDepth(16)
            .setResolution(4),
        ),
      );
    }

    options.forEach((o, i) => {
      const y = boxY + 8 + promptH + i * rowH + (rowH - 2) / 2;
      this.track(this.renderDomButton(cx, y, o.label, o.onPick, VIEW.width - 64));
    });
  }

  private renderOptions(options: Array<{ label: string; onPick: () => void }>, startY: number): void {
    options.forEach((o, i) => {
      this.track(this.renderDomButton(VIEW.width / 2, startY + i * 24 + 10, o.label, o.onPick, VIEW.width - 32));
    });
  }

  /** Botón HTML real, no texto de Phaser con hit-area manual: en varios celulares el
   * mapeo de coordenadas touch→canvas quedaba un pelo desincronizado y hacían falta
   * varios toques para acertar. Un <button> lo maneja el navegador directo, sin pasar
   * por esa traducción — la razón de ser de la misma excepción que ya tiene el campo
   * de nombre (`this.add.dom`, ver renderName).
   * `box-sizing:border-box` + alto explícito: sin esto, el padding/borde default del
   * navegador se suma por afuera del tamaño pedido y el botón termina sobresaliendo
   * de la caja translúcida que lo enmarca (más notorio en Safari/iOS que en desktop). */
  private renderDomButton(
    x: number,
    y: number,
    label: string,
    onPick: () => void,
    width: number,
    height = 22,
  ): Phaser.GameObjects.DOMElement {
    const el = this.add.dom(
      x,
      y,
      'button',
      `width:${width}px; height:${height}px; box-sizing:border-box; margin:0; padding:0 8px; ` +
        '-webkit-appearance:none; appearance:none; border-radius:0; ' +
        'background:#2E464F; color:#BFD3D8; border:1px solid #7FB0B8; ' +
        'font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size:12px; line-height:1; text-align:center; ' +
        'cursor:pointer; -webkit-tap-highlight-color:transparent;',
    );
    const btn = el.node as HTMLButtonElement;
    btn.textContent = label;
    btn.type = 'button';
    btn.addEventListener('click', onPick);
    btn.addEventListener('touchstart', () => (btn.style.background = '#3A5560'), { passive: true });
    btn.addEventListener('touchend', () => (btn.style.background = '#2E464F'));
    return el.setDepth(16);
  }

  private track(obj: Phaser.GameObjects.GameObject): void {
    this.stepObjects.push(obj);
  }

  /** Limpia todo lo que dibujó el paso anterior (no el título/bandeja fijos), para dejar lugar al siguiente. */
  private clearStep(): void {
    for (const o of this.stepObjects) o.destroy();
    this.stepObjects = [];
    if (this.nameInput) {
      // Hay que desenfocar ANTES de destruir el <input>: si se lo saca del DOM con el
      // teclado virtual del celular todavía abierto, el navegador cierra el teclado
      // tarde (o el visualViewport tarda en asentarse) y el mapeo de toques del canvas
      // queda desincronizado con lo que se ve en pantalla — se puede ver bien el paso
      // siguiente pero no responder a ningún toque. Forzamos el reajuste (scale.ts)
      // con reintentos, igual que ya se hace en orientationchange.
      (this.nameInput.node as HTMLInputElement).blur();
      this.nameInput.destroy();
      this.nameInput = null;
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    }
  }
}
