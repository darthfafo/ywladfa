import type { GameState } from '@/core/types';

const KEY = 'wladfa_save';

/**
 * Un solo slot en localStorage, autoguardado al cerrar jornada (docs/01-nivel-01.md
 * checklist). Sin Phaser acá (R1): es lectura/escritura pura sobre localStorage.
 */
export class SaveSystem {
  hasSave(): boolean {
    return localStorage.getItem(KEY) !== null;
  }

  save(state: GameState): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[SaveSystem] no se pudo guardar', e);
    }
  }

  /** Devuelve el estado guardado, o null si no hay nada o está corrupto. */
  load(): GameState | null {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GameState;
    } catch (e) {
      console.warn('[SaveSystem] partida guardada corrupta, se ignora', e);
      return null;
    }
  }

  /** Metadata liviana para mostrar "Continuar (Jornada N)" sin deserializar todo. */
  peek(): { day: number; level: string } | null {
    const s = this.load();
    return s ? { day: s.progress.day, level: s.progress.level } : null;
  }

  clear(): void {
    localStorage.removeItem(KEY);
  }

  /** Descarga la partida como archivo — el único slot vive en localStorage del
   * navegador, así que probar en otro navegador/dispositivo (o que alguien de
   * afuera revise el estado) no tenía forma de acceder a una partida en curso. */
  exportToFile(state: GameState): void {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wladfa-jornada${state.progress.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Lee un archivo exportado con `exportToFile` y lo devuelve, o null si no es válido. */
  async importFromFile(file: File): Promise<GameState | null> {
    try {
      return JSON.parse(await file.text()) as GameState;
    } catch (e) {
      console.warn('[SaveSystem] archivo de partida inválido', e);
      return null;
    }
  }
}

export const saveSystem = new SaveSystem();
