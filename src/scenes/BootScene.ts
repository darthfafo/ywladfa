import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { saveSystem } from '@/systems/SaveSystem';
import { addSceneBackground, preloadArt } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { makePortraits, makeProps, makeShipLarge } from '@/util/textures';
import { RETRO_FONT } from '@/util/text';

type Gender = 'f' | 'm';
const DEFAULT_NAME: Record<Gender, string> = { f: 'Elin', m: 'Idris' };

// fallback de RETRO_FONT (renderDomText/renderDomButton) si Google Fonts no llegó a
// cargar (o no hay internet) — ver util/text.ts. `retro: false` explícito es la
// única forma de pedir este monoespaciado; todo el resto del arranque usa la
// fuente retro por default, para no mezclar dos estilos de letra en la misma
// pantalla (antes pasaba con el campo "¿Cómo te llamás?" y el aviso de "se pierde
// la partida guardada", los únicos dos textos que quedaban en este monoespaciado
// junto a botones y títulos ya en fuente retro).
const UI_FONT = 'ui-monospace, "SF Mono", Menlo, monospace';

// tres franjas fijas durante todo el arranque, igual de espíritu que HUD/mundo/bandeja
// del juego real (VIEW en config.ts): título arriba, imagen al medio, diálogo abajo.
// Achica bastante el recorte de las escenas 3:4 contra la pantalla 9:16 completa, y el
// título deja de competir con lo que haya debajo — tiene su propio fondo sólido.
const TOP_H = 76;
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
  private fileInputEl: HTMLInputElement | null = null;
  private dialogue: DialogueBox | null = null;

  private playerName = '';
  private playerGender: Gender = 'f';
  // "Press Start 2P" (Google Fonts) carga async: si el texto centrado ya se midió
  // con la fuente de reemplazo (más angosta) antes de que la real termine de bajar,
  // Phaser deja el centrado calculado con ese ancho viejo y el texto queda corrido
  // apenas la tipografía real entra y reflowea más ancha. Se reintenta el centrado
  // de cada texto retro en cuanto la fuente esté lista, sea cual sea el paso activo.
  private retroRefreshers: Array<() => void> = [];

  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    // la pantalla de espera de puro HTML/CSS (index.html) ya cumplió: create() solo
    // corre acá una vez que preload() terminó de bajar todo, así que el juego ya
    // tiene algo real para mostrar.
    document.getElementById('boot-loading')?.remove();
    // ver util/scale.ts: el momento real en que el juego se hace visible (no un
    // tiempo adivinado) es el que tiene que disparar el reencuadre en frío.
    window.dispatchEvent(new Event('wladfa:ready-to-show'));

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
    this.renderDomText(cx, 14, 'Y WLADFA', { size: 15, color: '#EAE8E0', align: 'center', retro: true });
    // "La colonia galesa en Chubut" REEMPLAZA al subtítulo evocador de antes ("La
    // Huella de los Rifleros") — contexto llano para quien lo ve por primera vez,
    // no se suman las dos. Debajo, la aclaración de rigor histórico — blanca, más
    // chica, no compite con el título ni el subtítulo.
    this.renderDomText(cx, 42, 'La colonia galesa en Chubut', { size: 9, color: '#D9A845', align: 'center', retro: true });
    this.renderDomText(cx, 58, 'JUEGO CON RIGOR HISTÓRICO, ASÍ SUCEDIÓ', {
      size: 6,
      color: '#EAE8E0',
      align: 'center',
      retro: true,
    });

    // bandeja inferior fija: mismo estilo que la bandeja real del juego (UiScene.buildTray),
    // opaca del todo — igual que DialogueBox.bg, para que no haya un salto de contraste
    // entre esta franja "de reposo" y la que se ve apenas arranca un diálogo.
    this.add.rectangle(0, TRAY_Y, VIEW.width, TRAY_H, PAL.ink, 1).setOrigin(0, 0).setDepth(20);
    this.add.rectangle(0, TRAY_Y, VIEW.width, 1, PAL.slate).setOrigin(0, 0).setDepth(21);

    // firma discreta — fuera de cualquier paso (no this.track()) para que sobreviva
    // los clearStep() y se vea en todo el arranque, hasta la travesía; una vez que
    // arranca World esta escena entera se destruye sola, se va con ella.
    this.renderDomText(VIEW.width - 8, TRAY_Y + TRAY_H - 12, 'FP', {
      size: 7,
      color: '#22343A',
      align: 'right',
      retro: true,
    });

    this.renderTitle();

    document.fonts?.ready.then(() => {
      for (const refresh of this.retroRefreshers) refresh();
    });
  }

  /* ---------------- paso 1: título (continuar / nueva partida) ---------------- */

  private renderTitle(): void {
    this.clearStep();
    // acá arranca la historia de verdad: la salida, no la llegada a Punta Cuevas
    // (docs/04-guia-historica.md — el Mimosa zarpa el 28-V-1865 de Liverpool. Liverpool
    // es un puerto inglés, no galés — los colonos viajaron hasta ahí para embarcarse).
    this.renderImage('mimosa_puerto');

    // contexto narrativo en la bandeja, como cualquier línea de narrador. La fecha
    // en dorado (mismo tono que el resto de los acentos del juego, #D9A845) para
    // que se distinga del resto sin perder contraste contra el fondo oscuro.
    // RETRO_FONT (default de renderDomText), como todo el resto del juego. Un solo
    // salto manual (la fecha en su propia línea, a propósito); el resto fluye solo
    // con el ancho — forzar otro salto después de "fundar" quedaba como un corte al
    // azar en cuanto el texto entraba más ancho. size 7: a 8, "Liverpool, 28 de
    // mayo de 1865." mide 240px reales contra 238 disponibles — se pasaba por 2px,
    // justo lo bastante para que redondeos de subpíxel distintos entre navegadores
    // lo hicieran partir en dos líneas ("1865." solo, huérfano) en algunos casos y
    // no en otros. A 7 mide 210, con margen real.
    this.track(
      this.renderDomText(16, TRAY_Y + 10, '', {
        size: 7,
        color: '#9BAEB4',
        width: VIEW.width - 32,
        retro: true,
        lineHeight: 1.5,
        html:
          '<span style="color:#D9A845">Liverpool, 28 de mayo de 1865.</span><br>El Mimosa lleva colonos galeses ' +
          'rumbo a Sudamérica: van a fundar Y Wladfa, la Colonia.',
      }),
    );

    // el menú (continuar/nueva partida) va bien visible sobre la imagen, no perdido
    // adentro del párrafo de la bandeja. Exportar/importar van como parte de la
    // misma lista, debajo de las dos opciones principales — no como links sueltos
    // aparte, para que se lean como parte del mismo menú.
    const options: Array<{ label: string; onPick: () => void }> = [];
    const save = saveSystem.peek();
    if (save) options.push({ label: `Continuar — Jornada ${save.day}`, onPick: () => this.continueGame() });
    options.push({ label: 'Nueva partida', onPick: () => this.renderGenderIntro() });
    options.push({ label: 'Importar partida', onPick: () => this.triggerImportFile() });
    if (save) options.push({ label: 'Exportar partida', onPick: () => this.exportCurrentSave() });
    this.renderMenu(options, IMG_CY);

    // input de archivo invisible, siempre presente: el botón "Importar partida" de
    // arriba solo lo dispara (inputEl.click()).
    this.renderFileInput();
  }

  private exportCurrentSave(): void {
    const s = saveSystem.load();
    if (s) saveSystem.exportToFile(s);
  }

  private triggerImportFile(): void {
    this.fileInputEl?.click();
  }

  /** El único slot de guardado vive en localStorage del navegador — sin esto no
   * había forma de sacar una partida de acá (probarla en otro navegador,
   * mandarla, revisarla) más que abriendo las devtools a mano. */
  private renderFileInput(): void {
    const cx = VIEW.width / 2;
    // alpha 0, no display:none: Phaser reescribe `style.display` en cada frame
    // (para poder mostrar/ocultar el propio GameObject), así que un display:none a
    // mano en el string de estilo se pisaba solo — el input quedaba visible. 1x1px
    // además, para que ese input invisible (pero clickeable por código) no le tape
    // el toque a ningún botón vecino.
    const fileInput = this.add
      .dom(cx, TRAY_Y + 78, 'input', 'width:1px; height:1px; overflow:hidden;')
      .setAlpha(0);
    const inputEl = fileInput.node as HTMLInputElement;
    this.fileInputEl = inputEl;
    inputEl.type = 'file';
    inputEl.accept = 'application/json';
    inputEl.addEventListener('change', () => {
      const file = inputEl.files?.[0];
      if (!file) return;
      saveSystem.importFromFile(file).then((s) => {
        if (!s) {
          bus.emit('ui:toast', { text: 'Archivo de partida inválido.' });
          return;
        }
        saveSystem.save(s);
        this.renderTitle();
      });
    });
    this.track(fileInput);
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
      IMG_CY,
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
    this.track(this.renderDomText(cx, TOP_H + 8, '¿Cómo te llamás?', { size: 13, color: '#D9A845', align: 'center' }));

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
    this.track(this.renderDomText(16, TRAY_Y + 10, 'Se pierde la partida guardada.', { size: 11, color: '#DE7050' }));
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

    // dos meses de travesía real: 28-V-1865 (zarpada, Liverpool) a 28-VII-1865
    // (desembarco, Punta Cuevas) — docs/04-guia-historica.md.
    const voyageText = this.renderDomText(16, TRAY_Y + 14, '', {
      size: 11,
      color: '#EAE8E0',
      width: VIEW.width - 32,
      retro: true,
      html: 'Dos meses en el mar,<br>rumbo al Sur<span id="voyage-dots"></span>',
    });
    this.track(voyageText);
    // puntos suspensivos animados: sin esto la escena parece trabada durante los
    // 9s fijos que dura (no hay nada más en pantalla que se mueva) y da la
    // sensación de que el juego colgó en vez de estar en una cinemática. Se anima
    // solo el <span> (no todo el bloque vía setHTML) para no reflowear las dos
    // líneas de arriba en cada tick.
    const dotsSpan = voyageText.node.querySelector('#voyage-dots');
    const dots = ['', '.', '..', '...'];
    let dotFrame = 0;
    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        dotFrame = (dotFrame + 1) % dots.length;
        if (dotsSpan) dotsSpan.textContent = dots[dotFrame];
      },
    });
    // sin forma de adelantarla: un toque de una pantalla anterior que todavía
    // estuviera "en vuelo" alcanzaba para saltear la cinemática antes de que se
    // llegara a ver un solo frame. Esta y cualquier cinemática futura corren su
    // tiempo fijo completo, sin listener de toque/tecla que la pueda cortar.
    this.time.delayedCall(9000, () => this.scene.start('World'));
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
   * `prompt` opcional: una pregunta como primera línea, ARRIBA de las opciones.
   * Las opciones quedan siempre centradas en `centerY`, tengan o no prompt encima:
   * antes el prompt sumaba su alto adentro de la misma caja centrada, empujando los
   * botones hacia abajo — el género quedaba más bajo que el título aunque a los dos
   * se los llamara con el mismo centerY. Ahora el prompt crece la caja hacia
   * ARRIBA, no corre las opciones. */
  private renderMenu(options: Array<{ label: string; onPick: () => void }>, centerY: number, prompt?: string): void {
    const cx = VIEW.width / 2;
    const rowH = 26;
    const optionsTop = centerY - (options.length * rowH) / 2;

    if (prompt) {
      const promptH = 22;
      const pad = 8;
      const boxTop = optionsTop - promptH - pad;
      const boxH = promptH + options.length * rowH + pad * 2;
      // sin `prompt` (título: nada más que "Nueva partida"/"Continuar") la caja
      // translúcida es puro relleno — los botones ya son opacos por su cuenta.
      // Con `prompt` (género: hay una pregunta arriba de las opciones) sigue
      // haciendo falta para que ese texto se lea contra la imagen.
      this.track(
        this.add
          .rectangle(24, boxTop, VIEW.width - 48, boxH, PAL.ink, 0.8)
          .setOrigin(0, 0)
          .setStrokeStyle(1, PAL.seaPale, 0.5)
          .setDepth(15),
      );
      this.track(this.renderDomText(cx, boxTop + pad, prompt, { size: 9, color: '#D9A845', align: 'center', retro: true }));
    }

    options.forEach((o, i) => {
      const y = optionsTop + i * rowH + (rowH - 2) / 2;
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
    retro = true,
  ): Phaser.GameObjects.DOMElement {
    // fondo semitransparente (0.75), no sólido: para que la imagen de atrás siga
    // asomando un poco — "que no corte totalmente el fondo".
    const el = this.add.dom(
      x,
      y,
      'button',
      `width:${width}px; height:${height}px; box-sizing:border-box; margin:0; padding:0 6px; ` +
        '-webkit-appearance:none; appearance:none; border-radius:0; ' +
        'background:rgba(46,70,79,0.75); color:#BFD3D8; border:1px solid #7FB0B8; ' +
        `font-family: ${retro ? RETRO_FONT : UI_FONT}; font-size:${retro ? 9 : 12}px; line-height:1; text-align:center; ` +
        'cursor:pointer; -webkit-tap-highlight-color:transparent;',
    );
    const btn = el.node as HTMLButtonElement;
    btn.textContent = label;
    btn.type = 'button';
    btn.addEventListener('click', onPick);
    btn.addEventListener('touchstart', () => (btn.style.background = 'rgba(58,85,96,0.85)'), { passive: true });
    btn.addEventListener('touchend', () => (btn.style.background = 'rgba(46,70,79,0.75)'));
    return el.setDepth(16);
  }

  /** Texto HTML real, no Phaser Text: aunque se le pida filtro suave al canvas
   * (index.html), el texto de Phaser sigue horneado en un canvas de resolución
   * fija baja y se ve borroso en un celular real — confirmado en dispositivo, ver
   * el mismo cambio en UiScene (HUD). Un <div> lo rasteriza el navegador a la
   * resolución física real de cada pantalla. */
  private renderDomText(
    x: number,
    y: number,
    text: string,
    opts: {
      size: number;
      color: string;
      align?: 'left' | 'center' | 'right';
      width?: number;
      weight?: string;
      retro?: boolean;
      html?: string;
      lineHeight?: number;
    },
  ): Phaser.GameObjects.DOMElement {
    const style =
      `color:${opts.color}; font-family: ${opts.retro === false ? UI_FONT : RETRO_FONT}; font-size:${opts.size}px; ` +
      `font-weight:${opts.weight ?? 'normal'}; text-align:${opts.align ?? 'left'}; line-height:${opts.lineHeight ?? 1.5}; ` +
      (opts.width ? `width:${opts.width}px;` : 'white-space:nowrap;');
    const originX = opts.align === 'center' ? 0.5 : opts.align === 'right' ? 1 : 0;
    const el = this.add.dom(x, y, 'div', style).setOrigin(originX, 0);
    // setText()/setHTML(), no node.textContent directo: el origen centrado necesita
    // que Phaser sepa el ancho actual del div para calcular el offset, y solo lo
    // recalcula (updateSize()) cuando el texto cambia a través de su propio método
    // — mismo bug ya encontrado en TouchControls (ver ese commit).
    if (opts.html) el.setHTML(opts.html);
    else el.setText(text);
    // el elemento puede haberse destruido (cambió de paso) para cuando la fuente
    // esté lista — `document.body.contains` es más confiable acá que `.active`
    // (Phaser no siempre lo pone en false al destruir un DOMElement).
    if (opts.retro) {
      this.retroRefreshers.push(() => {
        if (!document.body.contains(el.node)) return;
        if (opts.html) el.setHTML(opts.html!);
        else el.setText(text);
      });
    }
    return el;
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
