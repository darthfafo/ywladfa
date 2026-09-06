/**
 * Entrada unificada: teclado y touch escriben el mismo vector.
 * El juego no detecta plataforma — las dos entradas están siempre activas (GDD §8).
 */
class InputState {
  /** Vector de movimiento normalizado, -1..1 */
  x = 0;
  y = 0;
  /** Flanco de subida del botón de acción; se consume con `takeAction()`. */
  private actionQueued = false;
  /** true mientras una escena modal (diálogo) tiene el control. */
  locked = false;

  setVector(x: number, y: number): void {
    const len = Math.hypot(x, y);
    if (len > 1) {
      this.x = x / len;
      this.y = y / len;
    } else {
      this.x = x;
      this.y = y;
    }
  }

  clearVector(): void {
    this.x = 0;
    this.y = 0;
  }

  pressAction(): void {
    this.actionQueued = true;
  }

  takeAction(): boolean {
    if (!this.actionQueued) return false;
    this.actionQueued = false;
    return true;
  }

  get moving(): boolean {
    return Math.abs(this.x) > 0.01 || Math.abs(this.y) > 0.01;
  }
}

export const input = new InputState();
