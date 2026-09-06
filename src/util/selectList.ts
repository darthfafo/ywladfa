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
    this.highlight(this.index, false);
    this.index = (this.index + dir + this.items.length) % this.items.length;
    this.highlight(this.index, true);
  }

  private highlight(i: number, on: boolean): void {
    this.items[i]?.text.setColor(on ? this.colors.selected : this.colors.normal);
  }

  private confirm(): void {
    this.items[this.index]?.onPick();
  }

  destroy(): void {
    for (const k of this.keys) k.removeAllListeners();
    this.keys = [];
  }
}
