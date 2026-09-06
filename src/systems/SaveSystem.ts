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
}

export const saveSystem = new SaveSystem();
