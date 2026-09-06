import Phaser from 'phaser';

export interface SelectableItem {
  text: Phaser.GameObjects.Text;
  onPick: () => void;
}

/**
 * Navegación por teclado para listas de opciones (elecciones de diálogo, overlays
 * de decisión/tutorial): abajo/arriba mueve el resaltado, el botón de acción
 * (espacio/E) confirma. El click/tap en cada texto ya funciona por su cuenta;
 * esto es la alternativa de teclado que pide GDD §8 ("las dos entradas activas").
 */
export class SelectList {
  private index = 0;
  private keys: Phaser.Input.Keyboard.Key[] = [];

  constructor(
    scene: Phaser.Scene,
    private items: SelectableItem[],
    private colors: { normal: string; selected: string },
  ) {
    if (!items.length) return;
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
    this.items[i]?.text.setColor(on ? this.colors.selected : this.colors.normal).setScale(on ? 1.12 : 1);
  }

  private confirm(): void {
    this.items[this.index]?.onPick();
  }

  destroy(): void {
    for (const k of this.keys) k.removeAllListeners();
    this.keys = [];
  }
}
