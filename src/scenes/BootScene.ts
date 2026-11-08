import Phaser from 'phaser';
import { PAL, RENDER_3D, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { saveSystem } from '@/systems/SaveSystem';
import { addSceneBackground, preloadArt } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { makePortraits, makeProps, makeShipLarge } from '@/util/textures';
import { RETRO_FONT } from '@/util/text';
import { buildTerrain } from '@/util/mapgen';
import { World3D } from '@/render3d/World3D';

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

/** Título del juego (antes "Y Wladfa": ese es el nombre de la colonia, no del juego). */
const GAME_TITLE = 'CHUBUT 1865';
const GAME_SUBTITLE = 'La Huella de los Rifleros';

/**
 * Portada + arranque de partida. La secuencia es: título (continuar/nueva partida)
 * → personaje (género y nombre en una sola pantalla) → enlistamiento con Pepperell
 * (con la escena correspondiente al género) → travesía corta → el Nivel 1.
 * Así conocés al capitán ANTES de que te grite en la playa (docs/01 T1).
 *
 * Con el mundo HD-2D (RENDER_3D), la portada y el personaje van sobre el mundo 3D
 * real: la playa de Punta Cuevas al amanecer con el Mimosa fondeado, la cámara a
 * ras del agua y paneando despacio. Las franjas fijas de arriba/abajo (`chrome`)
 * solo aparecen en los pasos con imagen (enlistamiento, travesía).
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
  /** franjas fijas de título/bandeja: visibles solo en los pasos con imagen */
  private chrome: Phaser.GameObjects.GameObject[] = [];
  /** el mundo 3D de fondo de la portada (null si RENDER_3D está apagado o ya se cerró) */
  private backdrop: World3D | null = null;
  private stopBackdropDraw: (() => void) | null = null;

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

    const c = (o: Phaser.GameObjects.GameObject) => this.chrome.push(o);
    // placeholder de color mientras no haya PNG real, acotado al área de la imagen.
    c(this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void).setOrigin(0, 0).setDepth(-10));
    c(this.add.rectangle(0, TOP_H + IMG_H * 0.55, VIEW.width, IMG_H * 0.2, PAL.sea, 0.5).setOrigin(0, 0).setDepth(-10));
    c(this.add.rectangle(0, TOP_H + IMG_H * 0.75, VIEW.width, IMG_H * 0.25, PAL.soil, 0.6).setOrigin(0, 0).setDepth(-10));

    // franja superior fija: título/subtítulo, siempre visibles durante todo el arranque,
    // con su propio fondo sólido — así nunca compiten con la imagen de atrás. Opaca del
    // todo (no 0.97): mismo criterio que la bandeja de diálogo (DialogueBox.bg), más
    // contraste para el título contra la imagen de fondo.
    c(this.add.rectangle(0, 0, VIEW.width, TOP_H, PAL.ink, 1).setOrigin(0, 0).setDepth(20));
    c(this.add.rectangle(0, TOP_H - 1, VIEW.width, 1, PAL.slate).setOrigin(0, 0).setDepth(21));
    c(this.renderDomText(cx, 14, GAME_TITLE, { size: 15, color: '#EAE8E0', align: 'center', retro: true }));
    // "Chubut 1865" ya da el contexto (dónde y cuándo) que antes ponía "La colonia
    // galesa en Chubut", así que vuelve el subtítulo evocador. Debajo, la
    // aclaración de rigor histórico — blanca, más chica, no compite con el título.
    c(this.renderDomText(cx, 42, GAME_SUBTITLE, { size: 9, color: '#D9A845', align: 'center', retro: true }));
    c(
      this.renderDomText(cx, 58, 'JUEGO CON RIGOR HISTÓRICO, ASÍ SUCEDIÓ', {
        size: 6,
        color: '#EAE8E0',
        align: 'center',
        retro: true,
      }),
    );

    // bandeja inferior fija: mismo estilo que la bandeja real del juego (UiScene.buildTray),
    // opaca del todo — igual que DialogueBox.bg, para que no haya un salto de contraste
    // entre esta franja "de reposo" y la que se ve apenas arranca un diálogo.
    c(this.add.rectangle(0, TRAY_Y, VIEW.width, TRAY_H, PAL.ink, 1).setOrigin(0, 0).setDepth(20));
    c(this.add.rectangle(0, TRAY_Y, VIEW.width, 1, PAL.slate).setOrigin(0, 0).setDepth(21));

    // firma discreta — fuera de cualquier paso (no this.track()) para que sobreviva
    // los clearStep() y se vea en todo el arranque, hasta la travesía; una vez que
    // arranca World esta escena entera se destruye sola, se va con ella. Esquina
    // inferior IZQUIERDA, no derecha: ahí abajo a la derecha vive el "▼" de
    // DialogueBox que avisa que hay más texto — coincidían casi pixel a pixel.
    c(
      this.renderDomText(8, TRAY_Y + TRAY_H - 12, 'FP', {
        size: 7,
        color: '#22343A',
        align: 'left',
        retro: true,
      }),
    );

    if (RENDER_3D) this.startBackdrop();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopBackdrop());
    this.renderTitle();

    document.fonts?.ready.then(() => {
      for (const refresh of this.retroRefreshers) refresh();
    });
  }

  /* ---------------- fondo 3D de la portada ---------------- */

  /** La playa de Punta Cuevas en 3D, de espaldas a la barranca y mirando al mar,
   * con el Mimosa fondeado. La cámara sigue un punto que pasea despacio por la
   * orilla — un paneo lento, sin jugador. Mismo terreno y luz que el juego. */
  private startBackdrop(): void {
    const grid = buildTerrain(game.level);
    const drift = { x: 0, y: 0, displayWidth: 0, displayHeight: 0, originY: 0.5 };
    const shore = { x0: 23, x1: 32, z: 104 }; // tiles: el tramo de playa que recorre la cámara
    const set = (t: number) => {
      const k = 0.5 + 0.5 * Math.sin(t * 0.04);
      drift.x = (shore.x0 + (shore.x1 - shore.x0) * k) * VIEW.tile;
      drift.y = shore.z * VIEW.tile;
    };
    set(0);
    this.backdrop = new World3D(
      { scene: this, player: drift, terrain: () => grid, terrainVersion: () => 0, objects: () => [] },
      // cerca y bajo: más lejos, la cámara quedaba encima de la barranca y en primer plano se veía roca, no playa
      { fullScreen: true, pitch: 13, distance: 20, facing: 'south', lookHeight: 2, cutaway: false },
    );
    this.backdrop.setTurn('amanecer', 0);
    const ship = World3D.mimosa();
    ship.obj.position.set(27.5, 0, 124);
    this.backdrop.addModel(ship.obj, ship.update);
    let t = 0;
    const draw = () => {
      t += this.game.loop.delta / 1000;
      set(t);
      this.backdrop?.render(this.game.loop.delta);
    };
    this.game.events.on(Phaser.Core.Events.POST_RENDER, draw);
    this.stopBackdropDraw = () => this.game.events.off(Phaser.Core.Events.POST_RENDER, draw);
  }

  private stopBackdrop(): void {
    this.stopBackdropDraw?.();
    this.stopBackdropDraw = null;
    this.backdrop?.destroy();
    this.backdrop = null;
  }

  /** Muestra u oculta las franjas fijas (título arriba, bandeja abajo, fondo liso). */
  private setChrome(visible: boolean): void {
    for (const o of this.chrome) {
      (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
      // un texto HTML que se re-midió escondido (al terminar de cargar la fuente
      // con la portada 3D encima) quedó con ancho 0 y el centrado corrido: se
      // muestra ya (sin esperar al render de Phaser) y se vuelve a medir
      if (visible && o instanceof Phaser.GameObjects.DOMElement) {
        (o.node as HTMLElement).style.display = '';
        o.updateSize();
      }
    }
  }

  /** Degradé oscuro (HTML) para que el texto se lea sobre el 3D sin tapar todo con una franja. */
  private renderShade(y: number, h: number, from: 'top' | 'bottom'): void {
    const dir = from === 'top' ? 'to bottom' : 'to top';
    this.track(
      this.add
        .dom(0, y, 'div', `width:${VIEW.width}px; height:${h}px; pointer-events:none; ` +
          `background:linear-gradient(${dir}, rgba(14,20,22,0.88), rgba(14,20,22,0.55) 55%, rgba(14,20,22,0));`)
        .setOrigin(0, 0)
        .setDepth(-1), // debajo de los textos (0) y botones (16)
    );
  }

  /* ---------------- paso 1: título (continuar / nueva partida) ---------------- */

  private renderTitle(): void {
    this.clearStep();
    const cx = VIEW.width / 2;
    if (!this.backdrop) {
      // sin mundo 3D (?2d): la portada de siempre, con imagen y franjas
      this.setChrome(true);
      this.renderImage('mimosa_puerto');
    } else {
      this.setChrome(false);
      this.renderShade(0, 150, 'top');
      this.renderShade(VIEW.height - 170, 170, 'bottom');
      const shadow = 'text-shadow: 0 2px 0 #0E1416, 0 0 8px rgba(14,20,22,0.8);';
      this.track(
        this.renderDomText(cx, 34, '', { size: 22, color: '#EAE8E0', align: 'center', retro: true, html: `<span style="${shadow}">${GAME_TITLE}</span>` }),
      );
      this.track(
        this.renderDomText(cx, 70, '', { size: 9, color: '#D9A845', align: 'center', retro: true, html: `<span style="${shadow}">${GAME_SUBTITLE}</span>` }),
      );
      this.track(
        this.renderDomText(cx, 90, 'JUEGO CON RIGOR HISTÓRICO, ASÍ SUCEDIÓ', { size: 6, color: '#BFD3D8', align: 'center', retro: true }),
      );
    }

    // el menú abajo, a la altura del pulgar; continuar/nueva partida primero, y
    // exportar/importar como parte de la misma lista, no como links sueltos aparte
    const options: Array<{ label: string; onPick: () => void }> = [];
    const save = saveSystem.peek();
    if (save) options.push({ label: `Continuar — Jornada ${save.day}`, onPick: () => this.continueGame() });
    options.push({ label: 'Nueva partida', onPick: () => this.renderCharacter() });
    options.push({ label: 'Importar partida', onPick: () => this.triggerImportFile() });
    if (save) options.push({ label: 'Exportar partida', onPick: () => this.exportCurrentSave() });
    this.renderMenu(options, this.backdrop ? VIEW.height - 34 - (options.length * 26) / 2 : IMG_CY);

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

  /* ---------------- paso 2: personaje (género y nombre, una sola pantalla) ---------------- */

  /** Antes eran dos pantallas (género, después nombre) con una imagen cada una;
   * ahora una sola sobre el mundo 3D. El panel va arriba de todo: un teclado
   * virtual de celular tapa desde la mitad de la pantalla para abajo. */
  private renderCharacter(): void {
    this.clearStep();
    const cx = VIEW.width / 2;
    if (this.backdrop) {
      this.setChrome(false);
      this.renderShade(0, 200, 'top');
      this.renderShade(VIEW.height - 110, 110, 'bottom');
    } else {
      this.setChrome(true);
      this.renderImage(`enlistamiento_${this.playerGender}`);
      this.renderTextBacking(TOP_H, TOP_H + 120);
    }
    const top = this.backdrop ? 18 : TOP_H + 8;
    this.track(this.renderDomText(cx, top, '¿Quién sos?', { size: 13, color: '#D9A845', align: 'center' }));

    // género: dos botones lado a lado, el elegido resaltado
    const pick = (g: Gender) => {
      const prev = DEFAULT_NAME[this.playerGender];
      this.playerGender = g;
      const input = this.nameInput?.node as HTMLInputElement | undefined;
      // el nombre por defecto sigue al género, salvo que ya se haya escrito otro
      if (input && (!input.value.trim() || input.value === prev)) input.value = DEFAULT_NAME[g];
      paint();
    };
    const rowG = top + 34;
    const btnM = this.renderDomButton(cx - 54, rowG, 'Varón', () => pick('m'), 100, 24);
    const btnF = this.renderDomButton(cx + 54, rowG, 'Mujer', () => pick('f'), 100, 24);
    this.track(btnM);
    this.track(btnF);
    const paint = () => {
      for (const [el, g] of [
        [btnM, 'm'],
        [btnF, 'f'],
      ] as const) {
        const b = el.node as HTMLButtonElement;
        const on = this.playerGender === g;
        b.style.background = on ? 'rgba(217,168,69,0.9)' : 'rgba(46,70,79,0.75)';
        b.style.color = on ? '#18262A' : '#BFD3D8';
        b.style.borderColor = on ? '#D9A845' : '#7FB0B8';
      }
    };

    const rowN = rowG + 34;
    const defaultName = DEFAULT_NAME[this.playerGender];
    // RETRO_FONT, igual que los botones de al lado
    this.nameInput = this.add.dom(
      cx - 46,
      rowN,
      'input',
      `width:120px; height:24px; box-sizing:border-box; padding:4px; text-align:center; font-family: ${RETRO_FONT}; ` +
        'font-size:9px; background:#18262A; color:#EAE8E0; border:1px solid #2E464F; outline:none;',
    );
    const inputEl = this.nameInput.node as HTMLInputElement;
    inputEl.value = this.playerName || defaultName; // el 5to arg de add.dom() no sirve para el value de un <input>
    inputEl.maxLength = 18;
    inputEl.autocomplete = 'off'; // si no, el navegador puede autocompletar/sugerir un nombre ya tipeado antes
    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.confirmName();
    });
    // si el jugador cierra el teclado sin avanzar (toca afuera, o "ocultar teclado"),
    // el desincronizado de scale.ts puede pasar ACÁ: mismo reintento al perder foco
    inputEl.addEventListener('blur', () => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    });
    this.track(this.renderDomButton(cx + 66, rowN, 'Empezar ›', () => this.confirmName(), 96, 24));
    this.track(this.renderDomButton(cx, rowN + 34, '‹ Volver', () => this.renderTitle(), 90, 20));
    paint();

    // contexto narrativo abajo, como cualquier línea de narrador
    this.track(
      this.renderDomText(16, VIEW.height - 64, 'Vas a enlistarte para viajar en el Mimosa junto a tu madre.', {
        size: 9,
        color: '#EAE8E0',
        width: VIEW.width - 32,
        retro: true,
        lineHeight: 1.5,
      }),
    );
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
    this.setChrome(true);
    this.renderImage(`enlistamiento_${this.playerGender}`);
    this.track(
      this.renderDomText(16, TRAY_Y + 10, 'Se pierde la partida guardada.', { size: 9, color: '#DE7050', width: VIEW.width - 32 }),
    );
    this.renderOptions(
      [
        { label: 'Sí, empezar de nuevo', onPick: () => this.renderEnlist() },
        { label: 'Volver', onPick: () => this.renderCharacter() },
      ],
      TRAY_Y + 44,
    );
  }

  /* ---------------- paso 4: enlistamiento con el capitán ---------------- */

  private renderEnlist(): void {
    this.clearStep();
    // desde acá son escenas con imagen (Liverpool, la travesía): se apaga el 3D
    this.stopBackdrop();
    this.setChrome(true);
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
    // programado ACÁ, antes de armar cualquier otra cosa: si algo de lo que sigue
    // (retrato, texto, animación de puntos) llegara a tirar una excepción, el
    // salto al mundo real no puede quedar sin programarse — significaría que el
    // juego se queda trabado en esta pantalla para siempre, sin ningún control
    // para salir. Mejor una cinemática con algún detalle roto que un dead end.
    const goToWorld = (): void => {
      if (this.scene.isActive()) this.scene.start('World');
    };
    // 3 s, no 6: lo justo para leer la línea — el arranque tiene que llevar rápido a jugar
    this.time.delayedCall(3000, goToWorld);
    // respaldo con setTimeout nativo, no de Phaser: si algo deja trabado el
    // propio loop de Phaser (this.time depende de que el juego siga actualizando
    // cuadro a cuadro; un timer del navegador no) esto igual dispara el salto.
    // isActive() en los dos evita el doble disparo si el de arriba sí llegó a andar.
    window.setTimeout(goToWorld, 4000);

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
    // 6s fijos que dura (no hay nada más en pantalla que se mueva) y da la
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
    // tiempo fijo completo, sin listener de toque/tecla que la pueda cortar — el
    // delayedCall que hace el salto real ya se programó al principio de la
    // función, ver el comentario ahí.
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
    // ancho SIEMPRE fijo cuando hay align center/right, aunque el llamado no haya
    // pedido uno: sin esto Phaser mide el div por su contenido (nowrap) para poder
    // aplicar el origen 0.5/1, y esa medida puede salir con la fuente de reserva
    // del sistema si "Press Start 2P" todavía no bajó de Google Fonts — el texto
    // quedaba centrado con un ancho que no era el real, corrido y cortado contra el
    // borde, sin que nada lo recalculara después (mismo bug ya encontrado y resuelto
    // así en UiScene, el header de jornada). Con ancho fijo por CSS, Phaser siempre
    // mide lo mismo sin importar la fuente, y el centrado real queda 100% del lado
    // de text-align, que el navegador sí recalcula solo apenas la fuente entra.
    // Todo llamado centrado de este archivo usa x = VIEW.width/2 (columna completa);
    // "right" no tiene ningún uso hoy, pero el default (ancho = x, caja de 0 a x)
    // sigue la misma lógica por si alguno lo necesita más adelante.
    const width = opts.width ?? (opts.align === 'center' ? VIEW.width : opts.align === 'right' ? x : undefined);
    const style =
      `color:${opts.color}; font-family: ${opts.retro === false ? UI_FONT : RETRO_FONT}; font-size:${opts.size}px; ` +
      `font-weight:${opts.weight ?? 'normal'}; text-align:${opts.align ?? 'left'}; line-height:${opts.lineHeight ?? 1.5}; ` +
      (width ? `width:${width}px;` : 'white-space:nowrap;');
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
    // === opts.retro, no opts.retro === true: el estilo de arriba ya usa RETRO_FONT
    // por default (solo cae a UI_FONT con retro:false explícito) — si esta condición
    // no calzara con esa misma regla, cualquier llamado que omitiera el flag (ej. el
    // título "¿Cómo te llamás?" en renderName, que SÍ se dibuja en RETRO_FONT) nunca
    // se re-centraba al terminar de cargar la fuente. Mismo bug que ya se encontró y
    // arregló en UiScene (el header de jornada), acá por una condición desalineada.
    if (opts.retro !== false) {
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
