import { migrateState } from '@/core/GameState';
import type { GameState } from '@/core/types';

const KEY = 'wladfa_save';
/** el comienzo de cada jornada jugada (el selector de jornadas de la portada) */
const CP_KEY = 'wladfa_jornadas';
/** cuántos comienzos de jornada se guardan como mucho (los más viejos se van) */
const CP_MAX = 60;

interface Checkpoint {
  level: string;
  day: number;
  savedAt: number;
  state: GameState;
}

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
    this.recordCheckpoint(state);
  }

  /**
   * Anota el comienzo de una jornada (y de cada nivel). Se guarda al cerrar cada
   * noche, así que lo último guardado de una jornada es su comienzo en la partida más
   * reciente. La pantalla de cierre de un nivel y la llegada de la marcha no son
   * comienzos de jornada: no se anotan.
   */
  private recordCheckpoint(state: GameState): void {
    if (state.progress.finished || state.flags?.[`n${Number(state.progress.level.slice(-2))}_llegada`]) return;
    const all = this.readCheckpoints();
    const key = `${state.progress.level}|${state.progress.day}`;
    all[key] = { level: state.progress.level, day: state.progress.day, savedAt: Date.now(), state: structuredClone(state) };
    const keys = Object.keys(all).sort((a, b) => all[a]!.savedAt - all[b]!.savedAt);
    while (keys.length > CP_MAX) delete all[keys.shift()!];
    try {
      localStorage.setItem(CP_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('[SaveSystem] no se pudo anotar la jornada', e);
    }
  }

  private readCheckpoints(): Record<string, Checkpoint> {
    try {
      return (JSON.parse(localStorage.getItem(CP_KEY) ?? '{}') as Record<string, Checkpoint>) ?? {};
    } catch {
      return {};
    }
  }

  /** Las jornadas jugadas, por nivel y en orden (para el selector de la portada). */
  checkpoints(): Array<{ level: string; day: number }> {
    return Object.values(this.readCheckpoints())
      .map((c) => ({ level: c.level, day: c.day }))
      .sort((a, b) => a.level.localeCompare(b.level) || a.day - b.day);
  }

  /** La partida al comienzo de esa jornada, o null si no está o ya no se puede usar. */
  loadCheckpoint(level: string, day: number): GameState | null {
    const c = this.readCheckpoints()[`${level}|${day}`];
    if (!c) return null;
    try {
      return migrateState(structuredClone(c.state));
    } catch (e) {
      console.warn('[SaveSystem] jornada guardada que no se puede usar', e);
      return null;
    }
  }

  /** Devuelve el estado guardado, o null si no hay nada o está corrupto. */
  load(): GameState | null {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      return migrateState(JSON.parse(raw) as GameState);
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
    // el nivel y la jornada en el nombre: con varios niveles, «jornada3» no decía de cuál
    a.download = `chubut1865-${state.progress.level}-jornada${state.progress.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Lee un archivo exportado con `exportToFile` y lo devuelve, o null si no es válido. */
  async importFromFile(file: File): Promise<GameState | null> {
    try {
      return migrateState(JSON.parse(await file.text()) as GameState);
    } catch (e) {
      console.warn('[SaveSystem] archivo de partida inválido', e);
      return null;
    }
  }
}

export const saveSystem = new SaveSystem();
