import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { saveSystem } from '@/systems/SaveSystem';
import { preloadArt, sceneTextureKey } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { SelectList } from '@/util/selectList';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';
import { makePortraits, makeProps, makeShipLarge } from '@/util/textures';

type Gender = 'f' | 'm';
const DEFAULT_NAME: Record<Gender, string> = { f: 'Elin', m: 'Idris' };

/**
 * Portada + arranque de partida. La secuencia es: título (continuar/nueva partida)
 * → la Mimosa en el puerto, preguntando género → nombre → enlistamiento con
 * Pepperell (con la escena correspondiente al género) → recién ahí el Nivel 1.
 * Así conocés al capitán ANTES de que te grite en la playa (docs/01 T1).
 */
export class BootScene extends Phaser.Scene {
  /** Todo lo que dibuja el paso actual (menos el título fijo), para poder borrarlo al cambiar de paso. */
  private stepObjects: Phaser.GameObjects.GameObject[] = [];
  private optionNav: SelectList | null = null;
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

    // profundidad negativa: si un paso pone un fondo cinemático real (renderBackground)
    // tiene que quedar delante de estas franjas placeholder, no tapado por ellas.
    this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void).setOrigin(0, 0).setDepth(-10);
    this.add.rectangle(0, 300, VIEW.width, 60, PAL.sea, 0.5).setOrigin(0, 0).setDepth(-10);
    this.add.rectangle(0, 360, VIEW.width, 120, PAL.soil, 0.6).setOrigin(0, 0).setDepth(-10);

    crisp(
      this.add
        .text(cx, 60, 'Y WLADFA', { fontFamily: FONT_FAMILY, fontSize: FONT.hero, color: '#EAE8E0', align: 'center' })
        .setOrigin(0.5)
        .setResolution(4),
    );
    crisp(
      this.add
        .text(cx, 90, 'La Huella de los Rifleros', { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
        .setOrigin(0.5)
        .setResolution(4),
    );
    crisp(
      this.add
        .text(cx, 458, 'prototipo v0.1 · arte placeholder', { fontFamily: FONT_FAMILY, fontSize: FONT.tiny, color: '#6B6A5E' })
        .setOrigin(0.5)
        .setResolution(4),
    );

    this.renderTitle();
  }

  /* ---------------- paso 1: título (continuar / nueva partida) ---------------- */

  private renderTitle(): void {
    this.clearStep();
    const cx = VIEW.width / 2;
    // acá arranca la historia de verdad: la salida, no la llegada a Punta Cuevas
    // (docs/04-guia-historica.md — el Mimosa zarpa el 28-V-1865 de Liverpool. Liverpool
    // es un puerto inglés, no galés — los colonos viajaron hasta ahí para embarcarse).
    this.renderBackground('mimosa_puerto');
    // franja detrás de la fecha y las opciones nada más: el título/subtítulo se lee
    // bien directo sobre la imagen, pero la fecha se perdía contra el aparejo del barco.
    this.renderTextBacking(100, 225);
    // todo lo interactivo va pegado al título/subtítulo, no más abajo: es lo único
    // que queda siempre libre de un teclado virtual (que tapa desde la mitad de la
    // pantalla para abajo) y no depende de que el reajuste de escala llegue a tiempo.
    this.track(
      crisp(
        this.add
          .text(cx, 122, 'Liverpool\n28 de mayo de 1865', {
            fontFamily: FONT_FAMILY,
            fontSize: FONT.body,
            color: '#9BAEB4',
            align: 'center',
            lineSpacing: 5,
          })
          .setOrigin(0.5)
          .setResolution(4),
      ),
    );

    const options: Array<{ label: string; onPick: () => void }> = [];
    const save = saveSystem.peek();
    if (save) options.push({ label: `Continuar — Jornada ${save.day}`, onPick: () => this.continueGame() });
    options.push({ label: 'Nueva partida', onPick: () => this.renderGenderIntro() });
    this.renderOptions(options, 185);

    // mientras no haya PNG real (mimosa_puerto.png), el barco placeholder es la
    // versión grande de tres mástiles — acá se ve bastante más grande que en el
    // mundo, así que vale la pena que tenga más detalle (textures.ts).
    if (!this.textures.exists(sceneTextureKey('mimosa_puerto'))) {
      this.track(this.add.image(cx, 310, 'prop_mimosa_grande').setScale(2.3).setDepth(-5));
    }
  }

  /* ---------------- paso 2: la Mimosa en el puerto, ¿varón o mujer? ---------------- */

  private renderGenderIntro(): void {
    this.clearStep();
    this.renderBackground('mimosa_puerto');
    this.renderTextBacking(108, 235);
    const cx = VIEW.width / 2;
    this.track(
      crisp(
        this.add
          .text(cx, 128, '¿Sos varón o mujer?', { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
          .setOrigin(0.5)
          .setResolution(4),
      ),
    );
    this.renderOptions(
      [
        { label: 'Varón', onPick: () => this.pickGender('m') },
        { label: 'Mujer', onPick: () => this.pickGender('f') },
      ],
      170,
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

    // pegado al subtítulo: es la única zona que un teclado virtual (que tapa desde
    // la mitad de la pantalla para abajo) nunca llega a cubrir.
    this.track(
      crisp(
        this.add
          .text(cx, 118, '¿Cómo te llamás?', { fontFamily: FONT_FAMILY, fontSize: FONT.title, color: '#D9A845' })
          .setOrigin(0.5)
          .setResolution(4),
      ),
    );

    const defaultName = DEFAULT_NAME[this.playerGender];
    this.nameInput = this.add.dom(
      cx,
      148,
      'input',
      'width:140px; padding:5px; text-align:center; font-family: ui-monospace, "SF Mono", Menlo, monospace; ' +
        'font-size:13px; background:#18262A; color:#EAE8E0; border:1px solid #2E464F; outline:none;',
    );
    const inputEl = this.nameInput.node as HTMLInputElement;
    inputEl.value = this.playerName || defaultName; // el 5to arg de add.dom() no sirve para el value de un <input>
    inputEl.maxLength = 18;
    inputEl.autocomplete = 'off'; // si no, el navegador puede autocompletar/sugerir un nombre ya tipeado antes

    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.confirmName();
    });
    inputEl.focus();

    this.renderOptions([{ label: 'Siguiente', onPick: () => this.confirmName() }], 188);
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
    this.track(
      crisp(
        this.add
          .text(VIEW.width / 2, 118, 'Se pierde la partida guardada.', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#DE7050' })
          .setOrigin(0.5)
          .setResolution(4),
      ),
    );
    this.renderOptions(
      [
        { label: 'Sí, empezar de nuevo', onPick: () => this.renderEnlist() },
        { label: 'Volver', onPick: () => this.renderName() },
      ],
      160,
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
    // sin franja oscura acá: la imagen ocupa mundo+HUD (0-384) y el diálogo, opaco,
    // ya cubre la bandeja (384-480) por su cuenta.
    this.renderBackground(`enlistamiento_${this.playerGender}`);
    this.dialogue = new DialogueBox(this);
    this.dialogue.start('d_n1_enlistamiento', () => this.renderVoyage());
  }

  /* ---------------- paso 5: la travesía, cinemática corta ---------------- */

  private renderVoyage(): void {
    this.clearStep();
    const cx = VIEW.width / 2;

    // mar de horizonte a horizonte, sin las franjas de tierra del resto del arranque
    this.track(this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.sea, 0.9).setOrigin(0, 0).setDepth(-8));
    for (let i = 0; i < 5; i++) {
      const y = 90 + i * 46;
      const w = this.add.rectangle(0, y, VIEW.width * 1.4, 2, PAL.seaPale, 0.3).setOrigin(0, 0).setDepth(-7);
      this.track(w);
      this.tweens.add({ targets: w, x: -60, duration: 1600 + i * 260, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }

    // acá se ve mucho más grande que en el mundo, así que usa la versión de tres
    // mástiles en vez del casco simple del prop chico (textures.ts).
    const ship = this.add.image(cx, 210, 'prop_mimosa_grande').setScale(2.6).setDepth(-5);
    this.track(ship);
    this.tweens.add({ targets: ship, y: '+=6', duration: 1500, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    this.track(
      crisp(
        this.add
          // dos meses de travesía real: 28-V-1865 (zarpada, Liverpool) a 28-VII-1865
          // (desembarco, Punta Cuevas) — docs/04-guia-historica.md.
          .text(cx, 400, 'Dos meses de mar, rumbo al sur.', {
            fontFamily: FONT_FAMILY,
            fontSize: FONT.body,
            color: '#EAE8E0',
            align: 'center',
          })
          .setOrigin(0.5)
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

  /** Fondo cinemático de pantalla completa si ya existe el PNG; si no, no dibuja nada
   * y quedan a la vista las franjas de color placeholder puestas en create(). */
  private renderBackground(sceneId: string): void {
    const key = sceneTextureKey(sceneId);
    if (!this.textures.exists(key)) return;
    const img = this.add.image(VIEW.width / 2, VIEW.height / 2, key).setDepth(-5);
    // las escenas se piden en 3:4 (docs/05-prompts-arte.txt), más "cuadradas" que la
    // pantalla real de 9:16 — si se estira a 270×480 exacto queda deformada. Se
    // escala para CUBRIR el marco (como background-size:cover) y se recortan los
    // costados, que es justo para lo que el prompt pide márgenes seguros.
    const scale = Math.max(VIEW.width / img.width, VIEW.height / img.height);
    img.setScale(scale);
    // son ilustraciones pintadas, no pixel art de bordes duros: con pixelArt:true el
    // filtro por default es NEAREST, que al reescalar una imagen grande se ve
    // dentado — igual que crisp() hace con el texto (util/text.ts).
    img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.track(img);
  }

  /** Franja oscura semitransparente para que el texto se lea encima de un fondo cinemático. */
  private renderTextBacking(fromY: number, toY: number = VIEW.height): void {
    this.track(this.add.rectangle(0, fromY, VIEW.width, toY - fromY, PAL.void, 0.55).setOrigin(0, 0).setDepth(-1));
  }

  private renderOptions(options: Array<{ label: string; onPick: () => void }>, startY: number): void {
    const x = 40;
    const navItems = options.map((o, i) => {
      const t = crisp(
        this.add
          .text(x, startY + i * 24, o.label, { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#BFD3D8' })
          .setResolution(4),
      ).setInteractive({ useHandCursor: true });
      t.input!.hitArea = new Phaser.Geom.Rectangle(-10, -8, VIEW.width - 2 * x + 20, 24);
      t.on('pointerover', () => t.setColor('#D9A845'));
      t.on('pointerout', () => t.setColor('#BFD3D8'));
      t.on('pointerdown', () => o.onPick());
      this.track(t);
      return { text: t, onPick: o.onPick };
    });
    this.optionNav = new SelectList(this, navItems, { normal: '#BFD3D8', selected: '#D9A845' });
  }

  private track(obj: Phaser.GameObjects.GameObject): void {
    this.stepObjects.push(obj);
  }

  /** Limpia todo lo que dibujó el paso anterior, para dejar lugar al siguiente. */
  private clearStep(): void {
    this.optionNav?.destroy();
    this.optionNav = null;
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
