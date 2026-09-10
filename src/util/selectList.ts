import Phaser from 'phaser';

import { crisp } from './text';

export interface SelectableItem {
  text: Phaser.GameObjects.Text;
  onPick: () => void;
}

const CURSOR = '›';
const CURSOR_GAP = 12;

/**
 * Navegación por teclado para listas de opciones (elecciones de diálogo, overlays
 * de decisión/tutorial, arranque): abajo/arriba mueve un cursor "›" a la izquierda
 * de la opción activa (estilo RPG clásico), el botón de acción (espacio/E) confirma.
 * El click/tap en cada texto ya funciona por su cuenta; esto es la alternativa de
 * teclado que pide GDD §8 ("las dos entradas activas").
 */
export class SelectList {
  private index = 0;
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private cursor: Phaser.GameObjects.Text | null = null;

  constructor(
    scene: Phaser.Scene,
    private items: SelectableItem[],
    private colors: { normal: string; selected: string },
    container?: Phaser.GameObjects.Container,
  ) {
    if (!items.length) return;

    const style = items[0].text.style;
    this.cursor = crisp(
      scene.add
        .text(0, 0, CURSOR, { fontFamily: style.fontFamily, fontSize: style.fontSize, color: this.colors.selected })
        .setResolution(8)
        // sin esto el cursor queda en profundidad 0 por default: en una pantalla que usa
        // setDepth() a propósito (BootScene.renderMenu, con su propia caja de fondo) el
        // cursor terminaba dibujado DETRÁS de la caja, invisible.
        .setDepth(items[0].text.depth),
    );
    container?.add(this.cursor);

    this.highlight(0, true);

    const kb = scene.input.keyboard;
    if (!kb) return;
    const bind = (code: string, fn: () => void): void => {
      const k = kb.addKey(code);
      k.on('down', fn);
      this.keys.push(k);
    };
    bind('DOWN', () => this.move(1));
    bind('S', () => this.move(1));
    bind('UP', () => this.move(-1));
    bind('W', () => this.move(-1));
    bind('SPACE', () => this.confirm());
    bind('E', () => this.confirm());
  }

  private move(dir: number): void {
    if (this.items.length < 2) return;
    // Sin wraparound: en listas cortas (2-3 opciones) saltar del primero al último
    // da la sensación confusa de "ir para atrás" a una pantalla anterior. Se clampea.
    const next = this.index + dir;
    if (next < 0 || next >= this.items.length) return;
    this.highlight(this.index, false);
    this.index = next;
    this.highlight(this.index, true);
  }

  private highlight(i: number, on: boolean): void {
    const it = this.items[i];
    if (!it) return;
    it.text.setColor(on ? this.colors.selected : this.colors.normal);
    if (on) this.cursor?.setPosition(it.text.x - CURSOR_GAP, it.text.y);
  }

  private confirm(): void {
    this.items[this.index]?.onPick();
  }

  destroy(): void {
    for (const k of this.keys) k.removeAllListeners();
    this.keys = [];
    this.cursor?.destroy();
    this.cursor = null;
  }
}
