import Phaser from 'phaser';
import { INPUT_GUARD, PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { saveSystem } from '@/systems/SaveSystem';
import { addSceneBackground, preloadArt, sceneTextureKey } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { BUTTON_3D_CSS } from '@/ui/panel';
import { ensureFxTextures } from '@/ui/cinematic';
import { makePortraits, makeProps, makeShipLarge } from '@/util/textures';
import { RETRO_FONT } from '@/util/text';
import { sfx } from '@/audio/Sfx';

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
 * La portada y el personaje van a pantalla completa sobre una secuencia
 * cinemática (ver startCinematic): las ilustraciones del viaje encadenadas, con
 * movimiento de cámara lento y clima encima — lluvia en Liverpool, tormenta en
 * altamar, bruma al llegar, viento en la barranca. Las franjas fijas de
 * arriba/abajo (`chrome`) solo aparecen en los pasos de diálogo (enlistamiento,
 * travesía).
 */

/** Una toma de la secuencia de portada: qué imagen y qué clima lleva encima (0..1). */
interface Slide {
  id: string;
  rain: number;
  lightning?: boolean;
  wind?: boolean;
  /** centro vertical de la ilustración (por defecto CINE_IMG_CY) */
  cy?: number;
  /** llena toda la pantalla (recorta los costados) en vez de entrar entera a lo ancho */
  cover?: boolean;
}

/** El viaje entero en la portada: salida, travesía, llegada, la barranca. */
// a pantalla completa (cover): entera a lo ancho dejaba franjas y bordes duros
// arriba y abajo. Lo importante de cada ilustración está al centro.
// Llueve en Liverpool y en altamar; al llegar a Chubut ya no: bruma nomás.
const TITLE_SLIDES: Slide[] = [
  { id: 'mimosa_puerto', rain: 0.5, cover: true },
  { id: 'travesia', rain: 1, lightning: true, cover: true },
  { id: 'cold_open', rain: 0, cover: true },
  { id: 'mimosa_zarpa', rain: 0, wind: true, cover: true },
];
const SLIDE_MS = 7000;
/** centro vertical de la ilustración: entre el título (arriba) y el menú (abajo) */
const CINE_IMG_CY = 262;
const FADE_MS = 1600;
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
  /** la secuencia cinemática de fondo (portada, personaje), o null si no hay */
  private cine: {
    slides: Slide[];
    index: number;
    current: Phaser.GameObjects.Image[];
    /** tomas anteriores que todavía se están desvaneciendo */
    fading: Phaser.GameObjects.Image[];
    timer: Phaser.Time.TimerEvent | null;
    flash: Phaser.Time.TimerEvent | null;
    rain: Phaser.GameObjects.Particles.ParticleEmitter;
    wind: Phaser.GameObjects.Particles.ParticleEmitter;
    flashRect: Phaser.GameObjects.Rectangle;
    overlays: Phaser.GameObjects.GameObject[];
  } | null = null;

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
    // filete dorado fino abajo, como los botones del arranque (antes una línea pizarra)
    c(this.add.rectangle(0, TOP_H - 1, VIEW.width, 1, PAL.wheat, 0.45).setOrigin(0, 0).setDepth(21));
    const [titleWord, titleYear] = GAME_TITLE.split(' ');
    c(
      this.renderDomText(cx, 14, '', {
        size: 14,
        color: '#F2EDE0',
        align: 'center',
        retro: true,
        lineHeight: 1,
        html:
          `<span style="letter-spacing:1px; text-shadow:0 2px 0 rgba(0,0,0,0.6);">${titleWord}</span>` +
          `<span style="display:inline-block; width:3px; height:3px; margin:0 6px; position:relative; top:-5px; background:#9C3A24; transform:rotate(45deg);"></span>` +
          `<span style="color:#D9A845; letter-spacing:2px; text-shadow:0 2px 0 rgba(0,0,0,0.6);">${titleYear}</span>`,
      }),
    );
    // "Chubut 1865" ya da el contexto (dónde y cuándo) que antes ponía "La colonia
    // galesa en Chubut", así que vuelve el subtítulo evocador. Debajo, la
    // aclaración de rigor histórico — blanca, más chica, no compite con el título.
    c(this.renderDomText(cx, 40, GAME_SUBTITLE, { size: 8, color: '#EAE8E0', align: 'center', retro: true }));
    c(
      // en minúsculas: Press Start 2P no tiene mayúsculas acentuadas ("HISTóRICO")
      this.renderDomText(cx, 56, 'Un juego con rigor histórico', {
        size: 6,
        color: '#7FB0B8',
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

    this.makeFxTextures();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopCinematic());
    this.renderTitle();

    document.fonts?.ready.then(() => {
      for (const refresh of this.retroRefreshers) refresh();
    });
  }

  /* ---------------- secuencia cinemática (portada y personaje) ---------------- */

  /** Texturas chicas para las partículas (compartidas con las cutscenes, ui/cinematic.ts). */
  private makeFxTextures(): void {
    ensureFxTextures(this);
  }

  /**
   * Encadena `slides` a pantalla completa: cada imagen entra con un fundido, se
   * acerca y se corre despacio (Ken Burns), y cambia el clima de encima según la
   * toma. Con una sola toma, se queda en ella moviéndose.
   */
  private startCinematic(slides: Slide[]): void {
    this.stopCinematic();
    const W = VIEW.width;
    const H = VIEW.height;
    const rain = this.add.particles(0, 0, 'fx_rain', {
      x: { min: -60, max: W + 120 },
      y: -20,
      lifespan: 1100,
      speedY: { min: 520, max: 680 },
      speedX: { min: -190, max: -150 },
      rotate: 16,
      scaleY: { min: 0.7, max: 1.4 },
      alpha: { start: 0.85, end: 0.35 },
      frequency: -1,
    }).setDepth(5);
    const wind = this.add.particles(0, 0, 'fx_wisp', {
      x: -10,
      y: { min: H * 0.15, max: H * 0.9 },
      lifespan: 2600,
      speedX: { min: 140, max: 240 },
      speedY: { min: -20, max: 25 },
      rotate: { min: -10, max: 10 },
      alpha: { start: 0.7, end: 0 },
      frequency: -1,
    }).setDepth(5);
    const flashRect = this.add.rectangle(0, 0, W, H, 0xeef3f5, 0).setOrigin(0, 0).setDepth(6);
    // viñeta: oscurece los bordes, lo de siempre en una toma de cine
    const vignette = this.add
      .dom(0, 0, 'div', `width:${W}px; height:${H}px; pointer-events:none; ` +
        'background: radial-gradient(ellipse at 50% 45%, rgba(14,20,22,0) 45%, rgba(14,20,22,0.75) 100%);')
      .setOrigin(0, 0)
      .setDepth(-2);
    this.cine = { slides, index: -1, current: [], fading: [], timer: null, flash: null, rain, wind, flashRect, overlays: [vignette] };
    this.nextSlide();
  }

  private nextSlide(): void {
    const c = this.cine;
    if (!c) return;
    c.index = (c.index + 1) % c.slides.length;
    const slide = c.slides[c.index]!;
    const key = sceneTextureKey(slide.id);
    if (this.textures.exists(key)) {
      const W = VIEW.width;
      const H = VIEW.height;
      // Las ilustraciones son 3:4 y la pantalla 9:16: llenarla recortaba un cuarto
      // de cada costado (cabezas, el barco) y encima se acercaba más. Ahora la
      // ilustración entra ENTERA a lo ancho, y arriba/abajo se rellena con la misma
      // imagen agrandada, desenfocada y oscura — como un video vertical en el celular.
      const bg = this.add.image(W / 2, H / 2, key).setDepth(-8).setAlpha(0);
      bg.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      bg.setScale(Math.max(W / bg.width, H / bg.height) * 1.12).setTint(0x8a9094);
      bg.preFX?.addBlur(2, 2, 2, 1.4);
      const img = this.add.image(W / 2, slide.cover ? H / 2 : (slide.cy ?? CINE_IMG_CY), key).setDepth(-6).setAlpha(0);
      // entera a lo ancho (con el relleno desenfocado arriba/abajo), o llenando todo
      const fit = slide.cover ? Math.max(W / img.width, H / img.height) : W / img.width;
      // movimiento chico: el pixel art titila si se lo escala mucho
      const dir = c.index % 2 ? 1 : -1;
      img.setScale(fit).setX(W / 2 - dir * 4);
      this.tweens.add({ targets: [bg, img], alpha: 1, duration: FADE_MS, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: img, scale: fit * 1.05, x: W / 2 + dir * 4, duration: SLIDE_MS + FADE_MS * 2, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: bg, x: W / 2 + dir * 10, duration: SLIDE_MS + FADE_MS * 2, ease: 'Sine.easeInOut' });
      for (const prev of c.current) {
        prev.setDepth(prev.depth - 1);
        c.fading.push(prev);
        this.tweens.add({
          targets: prev,
          alpha: 0,
          delay: FADE_MS * 0.6,
          duration: FADE_MS,
          onComplete: () => {
            c.fading = c.fading.filter((f) => f !== prev);
            prev.destroy();
          },
        });
      }
      c.current = [bg, img];
    }
    // sonido de esta toma: lluvia, el mar en las tomas con agua, viento en la barranca
    const seaSlides = ['travesia', 'cold_open', 'mimosa_zarpa', 'mimosa_puerto'];
    sfx.setAmbience({
      rain: slide.rain,
      sea: seaSlides.includes(slide.id) ? (slide.id === 'travesia' ? 1 : 0.6) : 0,
      wind: slide.wind ? 0.9 : 0.35,
    });
    // clima de esta toma
    c.rain.setFrequency(slide.rain > 0 ? 60 / slide.rain : -1, slide.rain > 0.7 ? 2 : 1);
    if (slide.rain > 0) c.rain.start();
    else c.rain.stop();
    if (slide.wind) c.wind.setFrequency(90, 1).start();
    else c.wind.stop();
    c.flash?.remove();
    c.flash = slide.lightning ? this.time.addEvent({ delay: 2600, loop: true, callback: () => this.lightning() }) : null;
    if (slide.lightning) this.time.delayedCall(700, () => this.lightning());
    c.timer = c.slides.length > 1 ? this.time.delayedCall(SLIDE_MS, () => this.nextSlide()) : null;
  }

  /** Relámpago lejano: dos destellos cortos, el segundo más débil. */
  private lightning(): void {
    const r = this.cine?.flashRect;
    if (!r || Math.random() < 0.35) return;
    sfx.thunder();
    this.tweens.killTweensOf(r);
    r.setFillStyle(0xeef3f5, 0);
    this.tweens.chain({
      targets: r,
      tweens: [
        { fillAlpha: 0.55, duration: 60 },
        { fillAlpha: 0.05, duration: 120 },
        { fillAlpha: 0.3, duration: 50 },
        { fillAlpha: 0, duration: 500, ease: 'Sine.easeOut' },
      ],
    });
  }

  private stopCinematic(): void {
    const c = this.cine;
    if (!c) return;
    c.timer?.remove();
    c.flash?.remove();
    for (const o of [...c.current, ...c.fading, c.rain, c.wind, c.flashRect, ...c.overlays]) {
      if (o) {
        this.tweens.killTweensOf(o);
        o.destroy();
      }
    }
    this.cine = null;
  }

  /** Cambia la toma de una secuencia de una sola imagen (ej. el personaje al elegir género). */
  private swapCinematic(slide: Slide): void {
    if (!this.cine) return this.startCinematic([slide]);
    this.cine.slides = [slide];
    this.cine.index = -1;
    this.cine.timer?.remove();
    this.nextSlide();
  }

  /** Animaciones CSS de la entrada del título (una sola vez por página). */
  private ensureTitleCss(): void {
    if (document.getElementById('ttl-css')) return;
    const st = document.createElement('style');
    st.id = 'ttl-css';
    st.textContent =
      '@keyframes ttl-in { from { opacity:0; letter-spacing:0.5em; filter:blur(6px); } to { opacity:1; letter-spacing:normal; filter:blur(0); } }' +
      '.ttl-in { display:inline-block; animation: ttl-in 1.6s cubic-bezier(.2,.7,.2,1) both; }' +
      '.ttl-d1 { animation-delay: .7s; } .ttl-d2 { animation-delay: 1.2s; } .ttl-d3 { animation-delay: 1.7s; }' +
      // solo opacidad: Phaser ubica los botones con `transform` en el mismo nodo
      '@keyframes ttl-up { from { opacity:0; } to { opacity:1; } }' +
      '.ttl-up { animation: ttl-up .9s ease-out both; }';
    document.head.appendChild(st);
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
  private renderShade(y: number, h: number, from: 'top' | 'bottom', strength = 0.88): void {
    const dir = from === 'top' ? 'to bottom' : 'to top';
    this.track(
      this.add
        .dom(0, y, 'div', `width:${VIEW.width}px; height:${h}px; pointer-events:none; ` +
          `background:linear-gradient(${dir}, rgba(14,20,22,${strength}), rgba(14,20,22,${strength * 0.6}) 55%, rgba(14,20,22,0));`)
        .setOrigin(0, 0)
        .setDepth(-1), // debajo de los textos (0) y botones (16)
    );
  }

  /* ---------------- paso 1: título (continuar / nueva partida) ---------------- */

  private renderTitle(): void {
    this.clearStep();
    const cx = VIEW.width / 2;
    this.setChrome(false);
    if (!this.cine || this.cine.slides !== TITLE_SLIDES) this.startCinematic(TITLE_SLIDES);
    this.renderShade(0, 170, 'top', 0.8);
    this.renderShade(VIEW.height - 150, 150, 'bottom', 0.85);
    // viñeta suave en los bordes: encuadra la ilustración sin franjas duras
    this.track(
      this.add
        .dom(0, 0, 'div', `width:${VIEW.width}px; height:${VIEW.height}px; pointer-events:none; ` +
          'background:radial-gradient(ellipse at 50% 45%, rgba(14,20,22,0) 55%, rgba(14,20,22,0.55) 100%);')
        .setOrigin(0, 0)
        .setDepth(-2),
    );
    // entrada del título: cada parte aparece después de la anterior (CSS, ver ensureTitleCss)
    this.ensureTitleCss();
    // contorno fino de un píxel (pixel art) + una sombra corta: se lee sobre la
    // foto sin el bloque grueso de antes
    const outline =
      'text-shadow: 1px 0 0 #0E1416, -1px 0 0 #0E1416, 0 1px 0 #0E1416, 0 -1px 0 #0E1416, 0 3px 0 rgba(14,20,22,0.85), 0 0 18px rgba(14,20,22,0.7);';
    const [word, year] = GAME_TITLE.split(' ');
    this.track(
      this.renderDomText(cx, 30, '', {
        size: 22,
        color: '#F2EDE0',
        align: 'center',
        retro: true,
        lineHeight: 1,
        html: `<span class="ttl-in" style="letter-spacing:2px; ${outline}">${word}</span>`,
      }),
    );
    // año en dorado, entre dos filetes con un rombo: el ornamento de una portada de época
    const rule = (side: 'l' | 'r') =>
      `<span style="display:inline-block; width:34px; height:1px; vertical-align:middle; ` +
      `background:linear-gradient(to ${side === 'l' ? 'left' : 'right'}, #D9A845, rgba(217,168,69,0));"></span>`;
    const diamond = '<span style="display:inline-block; width:4px; height:4px; margin:0 6px; vertical-align:middle; background:#9C3A24; transform:rotate(45deg);"></span>';
    this.track(
      this.renderDomText(cx, 62, '', {
        size: 16,
        color: '#D9A845',
        align: 'center',
        retro: true,
        lineHeight: 1,
        html:
          `<span class="ttl-in" style="white-space:nowrap;">${rule('l')}${diamond}` +
          `<span style="letter-spacing:4px; vertical-align:middle; ${outline}">${year}</span>${diamond}${rule('r')}</span>`,
      }),
    );
    this.track(
      this.renderDomText(cx, 92, '', {
        size: 8,
        color: '#EAE8E0',
        align: 'center',
        retro: true,
        html: `<span class="ttl-in ttl-d1" style="${outline}">${GAME_SUBTITLE}</span>`,
      }),
    );
    // en minúsculas: Press Start 2P no tiene mayúsculas acentuadas ("HISTóRICO")
    this.track(
      this.renderDomText(cx, 110, '', {
        size: 6,
        color: '#BFD3D8',
        align: 'center',
        retro: true,
        html: '<span class="ttl-in ttl-d2" style="text-shadow:0 1px 0 #0E1416; opacity:0.9;">Un juego con rigor histórico</span>',
      }),
    );

    // el menú abajo, a la altura del pulgar; continuar/nueva partida primero, y
    // exportar/importar como parte de la misma lista, no como links sueltos aparte
    const options: Array<{ label: string; onPick: () => void }> = [];
    const save = saveSystem.peek();
    if (save) options.push({ label: `Continuar · Jornada ${save.day}`, onPick: () => this.continueGame() });
    options.push({ label: 'Nueva partida', onPick: () => this.renderCharacter() });
    options.push({ label: 'Importar partida', onPick: () => this.triggerImportFile() });
    if (save) options.push({ label: 'Exportar partida', onPick: () => this.exportCurrentSave() });
    const rowH = 25;
    const top = VIEW.height - 30 - options.length * rowH;
    options.forEach((o, i) => {
      const el = this.renderDomButton(cx, top + i * rowH + rowH / 2, o.label, o.onPick, 196, 21);
      const b = this.glassButton(el, i === 0);
      b.classList.add('ttl-up', 'ttl-d3');
      this.track(el);
    });

    // sonido sí/no, chiquito arriba a la derecha (queda guardado por jugador)
    const soundLabel = () => (sfx.isMuted ? 'Sonido: No' : 'Sonido: Sí');
    const soundBtn = this.renderDomButton(VIEW.width - 40, 12, soundLabel(), () => {
      sfx.toggleMute();
      (soundBtn.node as HTMLButtonElement).textContent = soundLabel();
    }, 70, 15);
    // discreto: texto chico sobre vidrio, sin el bloque de botón
    (soundBtn.node as HTMLButtonElement).style.cssText +=
      '; font-size:6px; white-space:nowrap; background:rgba(14,20,22,0.45); border:1px solid rgba(191,211,216,0.25);' +
      ' box-shadow:none; color:#BFD3D8;';
    this.track(soundBtn);

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
    this.setChrome(false);
    // la ilustración arriba de todo: los botones quedan sobre la pintura, no sobre una franja vacía
    // pantalla completa: con la imagen entera a lo ancho quedaban una franja oscura
    // arriba, otra abajo y el borde duro entre la pintura y el relleno. Acá el
    // personaje está al centro: recortar los costados no pierde nada importante.
    const portrait = (g: Gender): Slide => ({ id: `enlistamiento_${g}`, rain: 0.3, cover: true });
    this.startCinematic([portrait(this.playerGender)]);
    // más suave que en la portada: acá arriba solo hay botones, no un título
    // grande — con el degradé fuerte la franja de arriba quedaba negra
    this.renderShade(0, 150, 'top', 0.55);
    this.renderShade(VIEW.height - 110, 110, 'bottom');
    const top = 18;
    this.track(this.stepTitle(top, '¿Quién sos?'));

    // género: dos botones lado a lado, el elegido resaltado
    const pick = (g: Gender) => {
      const prev = DEFAULT_NAME[this.playerGender];
      this.playerGender = g;
      const input = this.nameInput?.node as HTMLInputElement | undefined;
      // el nombre por defecto sigue al género, salvo que ya se haya escrito otro
      if (input && (!input.value.trim() || input.value === prev)) input.value = DEFAULT_NAME[g];
      // la escena de fondo cambia con el género (enlistamiento_f / _m)
      this.swapCinematic(portrait(g));
      paint();
    };
    const rowG = top + 34;
    const btnM = this.renderDomButton(cx - 50, rowG, 'Varón', () => pick('m'), 92, 21);
    const btnF = this.renderDomButton(cx + 50, rowG, 'Mujer', () => pick('f'), 92, 21);
    this.glassButton(btnM);
    this.glassButton(btnF);
    this.track(btnM);
    this.track(btnF);
    const paint = () => {
      for (const [el, g] of [
        [btnM, 'm'],
        [btnF, 'f'],
      ] as const) {
        const b = el.node as HTMLButtonElement & { repaint?: () => void };
        b.dataset.selected = this.playerGender === g ? '1' : '';
        b.repaint?.();
      }
    };

    const rowN = rowG + 34;
    const defaultName = DEFAULT_NAME[this.playerGender];
    // RETRO_FONT, igual que los botones de al lado
    this.nameInput = this.add.dom(
      cx - 46,
      rowN,
      'input',
      `width:120px; height:21px; box-sizing:border-box; padding:4px; text-align:center; font-family: ${RETRO_FONT}; ` +
        'font-size:8px; letter-spacing:1px; background:rgba(14,20,22,0.7); color:#F2EDE0; border:1px solid rgba(217,168,69,0.55); ' +
        'border-radius:0; outline:none; backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);',
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
    const start = this.renderDomButton(cx + 66, rowN, 'Empezar', () => this.confirmName(), 92, 21);
    this.glassButton(start, true);
    this.track(start);
    const back = this.renderDomButton(cx, rowN + 30, 'Volver', () => this.renderTitle(), 80, 18);
    this.glassButton(back);
    (back.node as HTMLButtonElement).style.fontSize = '7px';
    this.track(back);
    paint();

    // contexto narrativo abajo, como cualquier línea de narrador
    this.track(
      this.renderDomText(cx, VIEW.height - 56, '', {
        size: 8,
        color: '#EAE8E0',
        align: 'center',
        retro: true,
        lineHeight: 1.7,
        html: '<span style="text-shadow:0 1px 0 #0E1416;">Vas a enlistarte para viajar<br>en el Mimosa junto a tu madre.</span>',
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
    this.stopCinematic();
    this.setChrome(true);
    this.renderImage(`enlistamiento_${this.playerGender}`);
    this.track(
      this.renderDomText(VIEW.width / 2, TRAY_Y + 12, 'Se pierde la partida guardada.', { size: 8, color: '#DE7050', align: 'center' }),
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
    // desde acá son escenas con imagen fija y bandeja de diálogo
    this.stopCinematic();
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

  private renderOptions(options: Array<{ label: string; onPick: () => void }>, startY: number): void {
    options.forEach((o, i) => {
      const el = this.renderDomButton(VIEW.width / 2, startY + i * 25 + 10, o.label, o.onPick, 190, 21);
      this.glassButton(el, i === 0);
      this.track(el);
    });
  }

  /** Botón "de portada": vidrio oscuro con filete dorado fino (el estilo de todo el
   * arranque, no el bloque con volumen de los menús del juego). `primary` lo marca
   * un poco más; `selected` lo deja resaltado fijo (ej. el género elegido). Al
   * pasar por encima se pone dorado con "› ‹" a los costados. */
  private glassButton(el: Phaser.GameObjects.DOMElement, primary = false): HTMLButtonElement {
    const b = el.node as HTMLButtonElement;
    const label = b.textContent ?? '';
    // los "› ‹" van en los márgenes del botón, aparte del texto: antes se sumaban
    // al texto al pasar por encima y lo hacían más ancho que el botón
    b.textContent = '';
    const mk = (side: 'left' | 'right', ch: string): HTMLSpanElement => {
      const m = document.createElement('span');
      m.textContent = ch;
      m.style.cssText = `position:absolute; ${side}:4px; top:50%; transform:translateY(-50%); visibility:hidden;`;
      return m;
    };
    const left = mk('left', '›');
    const right = mk('right', '‹');
    const text = document.createElement('span');
    text.textContent = label;
    b.append(left, text, right);
    b.style.cssText +=
      '; position:relative; padding:0 12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.35); font-size:8px; letter-spacing:1px; white-space:nowrap;' +
      ' backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);';
    const paint = (): void => {
      const hover = b.dataset.hover === '1';
      const sel = b.dataset.selected === '1';
      const strong = primary || sel;
      b.style.background = strong ? 'linear-gradient(rgba(46,70,79,0.85), rgba(24,38,42,0.85))' : 'rgba(14,20,22,0.55)';
      b.style.border = `1px solid ${hover || sel ? '#D9A845' : strong ? 'rgba(217,168,69,0.85)' : 'rgba(217,168,69,0.35)'}`;
      b.style.color = hover || sel ? '#D9A845' : strong ? '#F2EDE0' : '#BFD3D8';
      left.style.visibility = right.style.visibility = hover ? 'visible' : 'hidden';
    };
    const set = (k: 'hover', v: boolean) => {
      b.dataset[k] = v ? '1' : '';
      paint();
    };
    b.addEventListener('pointerenter', () => set('hover', true));
    b.addEventListener('pointerleave', () => set('hover', false));
    b.addEventListener('focus', () => set('hover', true));
    b.addEventListener('blur', () => set('hover', false));
    (b as HTMLButtonElement & { repaint?: () => void }).repaint = paint;
    paint();
    fitButtonText(b);
    return b;
  }

  /** Título chico de un paso del arranque, con el ornamento de la portada (filete y rombo). */
  private stepTitle(y: number, text: string): Phaser.GameObjects.DOMElement {
    const outline = 'text-shadow: 1px 0 0 #0E1416, -1px 0 0 #0E1416, 0 1px 0 #0E1416, 0 -1px 0 #0E1416, 0 2px 0 rgba(14,20,22,0.85);';
    const rule = (side: 'l' | 'r') =>
      `<span style="display:inline-block; width:24px; height:1px; vertical-align:middle; ` +
      `background:linear-gradient(to ${side === 'l' ? 'left' : 'right'}, #D9A845, rgba(217,168,69,0));"></span>`;
    const diamond = '<span style="display:inline-block; width:3px; height:3px; margin:0 5px; vertical-align:middle; background:#9C3A24; transform:rotate(45deg);"></span>';
    return this.renderDomText(VIEW.width / 2, y, '', {
      size: 10,
      color: '#D9A845',
      align: 'center',
      retro: true,
      lineHeight: 1,
      html: `<span style="white-space:nowrap;">${rule('l')}${diamond}<span style="vertical-align:middle; ${outline}">${text}</span>${diamond}${rule('r')}</span>`,
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
        BUTTON_3D_CSS + ' color:#D8E4E7; ' +
        `font-family: ${retro ? RETRO_FONT : UI_FONT}; font-size:${retro ? 9 : 12}px; line-height:1; text-align:center; ` +
        'cursor:pointer; -webkit-tap-highlight-color:transparent;',
    );
    const btn = el.node as HTMLButtonElement;
    btn.textContent = label;
    btn.type = 'button';
    const shownAt = performance.now();
    btn.addEventListener('click', () => {
      // un botón recién aparecido no responde: el toque que abrió esta pantalla no
      // puede, además, apretar lo que quedó debajo (ver INPUT_GUARD)
      if (performance.now() - shownAt < INPUT_GUARD.buttonMs) return;
      sfx.select();
      onPick();
    });
    // al apretar se hunde: sin la sombra de abajo y un píxel más abajo el texto
    btn.addEventListener('touchstart', () => (btn.style.filter = 'brightness(1.25)'), { passive: true });
    btn.addEventListener('touchend', () => (btn.style.filter = ''));
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

/** Achica la letra de un botón de ancho fijo hasta que el texto entre (primero el
 * espaciado entre letras, después el tamaño). Se repite cuando termina de cargar
 * la fuente retro: medido con la de reserva, el texto parece más angosto. */
export function fitButtonText(b: HTMLElement, minSize = 6): void {
  const fit = (): void => {
    b.style.letterSpacing = '1px';
    b.style.fontSize = '8px';
    if (b.scrollWidth <= b.clientWidth) return;
    b.style.letterSpacing = '0px';
    let size = 8;
    while (b.scrollWidth > b.clientWidth && size > minSize) {
      size -= 0.5;
      b.style.fontSize = `${size}px`;
    }
  };
  fit();
  document.fonts?.ready.then(fit);
}
