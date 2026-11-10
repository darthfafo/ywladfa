import Phaser from 'phaser';
import { INPUT_GUARD, PAL, VIEW } from '@/config';
import { game } from '@/core/Game';
import { saveSystem } from '@/systems/SaveSystem';
import { RETRO_FONT } from '@/util/text';
import { sceneTextureKey } from '@/util/assets';

interface TransitionData {
  /** id del nivel que sigue (`data/levels/*.json` → `next`). Todavía no existe
   * ningún nivel más allá de nivel-01 — hasta que exista, esta pantalla es el
   * cierre real en vez de un mundo sin nada más que hacer o un error silencioso. */
  next: string;
}

/**
 * Pantalla de cierre de nivel cuando `next` todavía no es jugable. Pantalla
 * completa en negro, sin HUD ni mundo detrás (docs/02-arquitectura.md — todavía
 * no existe TransitionScene "de verdad" con tarjeta narrativa por nivel; esto
 * cubre el caso general: cualquier nivel que termine y no tenga a dónde ir).
 */
export class TransitionScene extends Phaser.Scene {
  constructor() {
    super('Transition');
  }

  create(_data: TransitionData): void {
    this.scene.stop('World');
    this.scene.stop('Ui');
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;

    this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void, 1).setOrigin(0, 0);
    // la última ilustración del nivel (la punta) detrás, apagada: cierra con imagen, no en negro
    const key = sceneTextureKey('punta_final');
    if (this.textures.exists(key)) {
      const img = this.add.image(cx, cy, key);
      img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      img.setScale(Math.max(VIEW.width / img.width, VIEW.height / img.height)).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 0.4, duration: 1600, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: img, scale: img.scale * 1.06, duration: 20000, ease: 'Sine.easeInOut' });
    }
    // viñeta, como la portada
    this.add
      .dom(0, 0, 'div', `width:${VIEW.width}px; height:${VIEW.height}px; pointer-events:none; ` +
        'background:radial-gradient(ellipse at 50% 50%, rgba(14,20,22,0.35) 30%, rgba(14,20,22,0.9) 100%);')
      .setOrigin(0, 0);

    const font = RETRO_FONT.replace(/"/g, "'");
    const outline = 'text-shadow: 1px 0 0 #0E1416, -1px 0 0 #0E1416, 0 1px 0 #0E1416, 0 -1px 0 #0E1416, 0 3px 0 rgba(14,20,22,0.85);';
    const rule = (side: 'left' | 'right') =>
      `<span style="display:inline-block; width:40px; height:1px; vertical-align:middle; background:linear-gradient(to ${side}, #D9A845, rgba(217,168,69,0));"></span>`;
    const diamond = '<span style="display:inline-block; width:4px; height:4px; margin:0 7px; vertical-align:middle; background:#9C3A24; transform:rotate(45deg);"></span>';
    const el = this.add.dom(0, cy - 58, 'div', `width:${VIEW.width}px; pointer-events:none;`).setOrigin(0, 0);
    el.setHTML(
      `<div style="font-family:${font}; text-align:center; opacity:0; animation: tr-in 1.4s .4s ease-out forwards;">` +
        `<style>@keyframes tr-in { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:none;} }</style>` +
        `<div style="font-size:7px; color:#BFD3D8; letter-spacing:1px; ${outline}">Fin de la primera parte</div>` +
        `<div style="margin:12px 0 10px; white-space:nowrap;">${rule('left')}${diamond}${rule('right')}</div>` +
        `<div style="font-size:15px; color:#D9A845; ${outline}">Continuará…</div>` +
      `</div>`,
    );

    // el diario de la partida, escrito solo (JournalSystem): cierra el nivel con lo que pasó
    if (game.journal.entries().length) {
      this.renderButton(cx, cy + 48, 'Leer el diario', () => this.scene.launch('Journal', { tab: 'diario' }));
      this.renderButton(cx, cy + 74, 'Jugar otra vez', () => this.playAgain(), false);
    } else {
      this.renderButton(cx, cy + 48, 'Jugar otra vez', () => this.playAgain());
    }
  }

  /** Botón de vidrio con filete dorado, el mismo de la portada (BootScene.glassButton). */
  private renderButton(cx: number, y: number, label: string, onPick: () => void, primary = true): void {
    const el = this.add.dom(
      cx,
      y,
      'button',
      `width:150px; height:21px; box-sizing:border-box; margin:0; padding:0 6px; border-radius:0; ` +
        `font-family: ${RETRO_FONT}; font-size:8px; letter-spacing:1px; cursor:pointer; ` +
        (primary
          ? 'background:linear-gradient(rgba(46,70,79,0.85), rgba(24,38,42,0.85)); border:1px solid rgba(217,168,69,0.85); color:#F2EDE0; '
          : 'background:rgba(14,20,22,0.55); border:1px solid rgba(217,168,69,0.35); color:#BFD3D8; ') +
        'text-shadow:0 1px 0 #0E1416; box-shadow:0 2px 8px rgba(0,0,0,0.35); ' +
        'opacity:0; transition:opacity .8s; -webkit-tap-highlight-color:transparent;',
    );
    const b = el.node as HTMLButtonElement;
    b.type = 'button';
    // "› ‹" en los márgenes, aparte del texto: sumados al texto lo sacaban del botón.
    // Sin tocar `position`: Phaser ya lo deja en absolute para ubicar el botón (con
    // relative los botones se apilaban como texto común y se corrían de lugar)
    b.innerHTML =
      '<span data-mk style="position:absolute; left:5px; top:50%; transform:translateY(-50%); visibility:hidden;">›</span>' +
      `<span>${label}</span>` +
      '<span data-mk style="position:absolute; right:5px; top:50%; transform:translateY(-50%); visibility:hidden;">‹</span>';
    setTimeout(() => (b.style.opacity = '1'), 1400);
    const on = (yes: boolean) => {
      b.querySelectorAll<HTMLElement>('[data-mk]').forEach((m) => (m.style.visibility = yes ? 'visible' : 'hidden'));
      b.style.color = yes ? '#D9A845' : primary ? '#F2EDE0' : '#BFD3D8';
      b.style.borderColor = yes ? '#D9A845' : primary ? 'rgba(217,168,69,0.85)' : 'rgba(217,168,69,0.35)';
    };
    b.addEventListener('pointerenter', () => on(true));
    b.addEventListener('pointerleave', () => on(false));
    const shownAt = performance.now();
    const pick = (): void => {
      if (performance.now() - shownAt < INPUT_GUARD.buttonMs) return;
      onPick();
    };
    b.addEventListener('click', pick);
    // teclado solo para el botón principal, y no con la libreta abierta encima
    if (!primary) return;
    const kb = this.input.keyboard;
    const key = (): void => {
      if (!this.scene.isActive('Journal')) pick();
    };
    kb?.on('keydown-SPACE', key);
    kb?.on('keydown-E', key);
  }

  /** Borra la partida guardada — sin esto, "jugar otra vez" volvía a la portada
   * pero el título seguía ofreciendo "Continuar" con el nivel ya terminado. */
  private playAgain(): void {
    saveSystem.clear();
    this.scene.start('Boot');
  }
}
