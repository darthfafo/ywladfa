import type { LevelScript, WorldHost } from './LevelScript';
import { Nivel01Script } from './nivel01';

/** El guion de cada nivel de mapa, por id. Un nivel sin guion propio usa solo lo genérico. */
const SCRIPTS: Record<string, (host: WorldHost) => LevelScript> = {
  'nivel-01': (h) => new Nivel01Script(h),
};

export function scriptFor(levelId: string, host: WorldHost): LevelScript | null {
  return SCRIPTS[levelId]?.(host) ?? null;
}

export type { Interactable, LevelScript, WorldHost } from './LevelScript';
