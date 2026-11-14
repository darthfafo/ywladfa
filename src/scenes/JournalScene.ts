import Phaser from 'phaser';
import { INPUT_GUARD, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { sfx } from '@/audio/Sfx';
import { BookView3D } from '@/render3d/BookView3D';
import { RETRO_FONT } from '@/util/text';

type Tab = 'diario' | 'codice';

interface JournalData {
  tab?: Tab;
  /** escenas a pausar mientras está abierta y a reanudar al cerrar (World/Ui en el juego) */
  pause?: string[];
}

/** alto de la barra de abajo (hojas, saltos, cerrar); el cuaderno ocupa el resto */
const BAR_H = 62;

/**
 * La libreta: un cuaderno 3D (render3d/BookView3D) que llega volando desde la
 * esquina, se abre en la primera hoja y se hojea. Es la bitácora del viaje: cada
 * jornada con lo que pasó y, debajo de cada decisión, lo que el personaje cree que
 * va a traer (JournalSystem.bookBlocks). Al final, el Códice.
 *
 * Se pasa de hoja tocando la mitad derecha o izquierda del cuaderno, deslizando,
 * con las flechas de abajo o con el teclado. Lee de JournalSystem; no escribe nada.
 */
export class JournalScene extends Phaser.Scene {
  private tab: Tab = 'diario';
  private paused: string[] = [];
  private book: BookView3D | null = null;
  private bar: HTMLDivElement | null = null;
  private closing = false;
  private readyAt = 0;

  constructor() {
    super('Journal');
  }

  init(data: JournalData): void {
    this.tab = data.tab ?? 'diario';
    this.paused = data.pause ?? [];
    this.closing = false;
    this.book = null;
    this.bar = null;
    this.readyAt = Number.POSITIVE_INFINITY;
  }

  create(): void {
    this.scene.bringToTop();
    for (const k of this.paused) this.scene.pause(k);
    if (this.paused.length) bus.emit('ui:hud-visible', { visible: false });
    sfx.whoosh();

    // el fondo: el juego queda atrás, oscurecido
    const backdrop = document.createElement('div');
    backdrop.style.cssText =
      `width:${VIEW.width}px; height:${VIEW.height}px; pointer-events:auto; opacity:0; transition:opacity .35s; ` +
      'background:radial-gradient(ellipse at 50% 42%, rgba(36,54,59,0.82), rgba(14,20,22,0.96) 75%);';
    this.add.dom(0, 0, backdrop).setOrigin(0, 0).setDepth(9);
    requestAnimationFrame(() => (backdrop.style.opacity = '1'));

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `width:${VIEW.width}px; height:${VIEW.height - BAR_H}px; display:block; touch-action:none; pointer-events:auto;`;
    this.add.dom(0, 0, canvas).setOrigin(0, 0).setDepth(10);
    this.bindGestures(canvas);
    this.buildBar();

    const kb = this.input.keyboard;
    kb?.on('keydown-RIGHT', () => this.turn(1));
    kb?.on('keydown-LEFT', () => this.turn(-1));
    kb?.on('keydown-ESC', () => this.close());
    kb?.on('keydown-SPACE', () => this.close());
    kb?.on('keydown-C', () => this.jump('codice'));
    kb?.on('keydown-D', () => this.jump('inicio'));
    kb?.on('keydown-H', () => this.jump('hoy'));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.book?.destroy();
      this.book = null;
    });

    // la letra de las hojas tiene que estar antes de paginar (si no hay internet, Georgia)
    void loadFonts().then(() => {
      if (!this.scene.isActive()) return;
      const rect = this.game.canvas.getBoundingClientRect();
      const ratio = Math.min(3, (window.devicePixelRatio || 1) * Math.max(1, rect.width / VIEW.width));
      this.book = new BookView3D(canvas, VIEW.width, VIEW.height - BAR_H, ratio, game.journal.bookBlocks(), game.state.player.name);
      this.book.open(() => {
        this.readyAt = performance.now() + INPUT_GUARD.buttonMs * 0.5;
        if (this.tab === 'codice') this.jump('codice');
        this.refreshBar();
        if (this.bar) this.bar.style.opacity = '1';
      });
    });
  }

  override update(time: number): void {
    this.book?.tick(time);
  }

  // ---------------------------------------------------------------- controles

  private get ready(): boolean {
    return !!this.book && !this.closing && !this.book.busy && performance.now() >= this.readyAt;
  }

  private turn(dir: 1 | -1): void {
    if (!this.ready || !this.book) return;
    if (this.book.goTo(this.book.index + dir, () => this.refreshBar())) sfx.page();
  }

  /** Saltos: la primera hoja, la última escrita («hoy») o el Códice. */
  private jump(to: 'inicio' | 'hoy' | 'codice'): void {
    if (!this.ready || !this.book) return;
    const codex = this.book.anchor('codice');
    const target = to === 'inicio' ? 0 : to === 'codice' ? codex : Math.max(0, codex - 1);
    if (this.book.goTo(target, () => this.refreshBar())) sfx.page();
  }

  /** Tocar la mitad derecha pasa a la siguiente, la izquierda vuelve; deslizar también. */
  private bindGestures(canvas: HTMLCanvasElement): void {
    let x0 = 0;
    let y0 = 0;
    canvas.addEventListener('pointerdown', (e) => {
      x0 = e.clientX;
      y0 = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      const r = canvas.getBoundingClientRect();
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) this.turn(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) this.turn(e.clientX - r.left > r.width / 2 ? 1 : -1);
    });
  }

  private buildBar(): void {
    const font = RETRO_FONT.replace(/"/g, "'");
    const bar = document.createElement('div');
    bar.style.cssText =
      `box-sizing:border-box; width:${VIEW.width}px; height:${BAR_H}px; padding:7px 10px 0; font-family:${font}; ` +
      'color:#EAE8E0; opacity:0; transition:opacity .4s; pointer-events:auto; ' +
      'background:linear-gradient(rgba(14,20,22,0), rgba(14,20,22,0.92) 30%); border-top:1px solid rgba(217,168,69,0.25);';
    const btn = (attrs: string, label: string, extra = ''): string =>
      `<button type="button" ${attrs} style="height:20px; box-sizing:border-box; margin:0; padding:0 4px; border-radius:0; cursor:pointer; ` +
      `font-family:${font}; font-size:7px; background:rgba(14,20,22,0.6); border:1px solid rgba(217,168,69,0.4); color:#BFD3D8; ` +
      `-webkit-tap-highlight-color:transparent; ${extra}">${label}</button>`;
    bar.innerHTML =
      `<div style="display:flex; align-items:center; gap:6px;">` +
      btn('data-prev', '◀', 'width:34px;') +
      `<span data-page style="flex:1; text-align:center; font-size:7px; color:#D9A845;"></span>` +
      btn('data-next', '▶', 'width:34px;') +
      `</div>` +
      `<div style="display:flex; gap:4px; margin-top:6px;">` +
      btn('data-go="inicio"', 'Inicio', 'flex:1;') +
      btn('data-go="hoy"', 'Hoy', 'flex:1;') +
      btn('data-go="codice"', 'Códice', 'flex:1;') +
      btn('data-close', 'Cerrar', 'flex:1.2; color:#D9A845; border-color:rgba(217,168,69,0.85);') +
      `</div>`;
    this.add.dom(0, VIEW.height - BAR_H, bar).setOrigin(0, 0).setDepth(11);
    bar.querySelector('[data-prev]')!.addEventListener('click', () => this.turn(-1));
    bar.querySelector('[data-next]')!.addEventListener('click', () => this.turn(1));
    bar.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => this.jump(b.dataset.go as 'inicio' | 'hoy' | 'codice')),
    );
    bar.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    this.bar = bar;
  }

  private refreshBar(): void {
    if (!this.bar || !this.book) return;
    const i = this.book.index;
    const n = this.book.pageCount;
    (this.bar.querySelector('[data-page]') as HTMLElement).textContent = `Hoja ${i + 1} de ${n}`;
    (this.bar.querySelector('[data-prev]') as HTMLButtonElement).style.opacity = i > 0 ? '1' : '0.35';
    (this.bar.querySelector('[data-next]') as HTMLButtonElement).style.opacity = i < n - 1 ? '1' : '0.35';
  }

  private close(): void {
    if (this.closing) return;
    // mientras se abre no se cierra (un toque que venía de antes); si las letras
    // todavía no cargaron y no hay cuaderno, se cierra directo
    if (this.book && performance.now() < this.readyAt) return;
    this.closing = true;
    sfx.select();
    if (this.bar) this.bar.style.opacity = '0';
    const done = (): void => {
      for (const k of this.paused) this.scene.resume(k);
      if (this.paused.length) bus.emit('ui:hud-visible', { visible: true });
      this.scene.stop();
    };
    if (this.book) this.book.close(done);
    else done();
  }
}

/** Espera las letras de la libreta, pero no para siempre (sin internet, siguen con Georgia). */
function loadFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return Promise.resolve();
  const all = Promise.all([
    fonts.load('29px "IM Fell English"'),
    fonts.load('italic 27px "IM Fell English"'),
    fonts.load('14px "Press Start 2P"'),
  ]).then(() => undefined);
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, 1500))]).catch(() => undefined);
}
