import { registry } from './Registry';
import type { GameState, LangId, LangLevel, PartyMember, ResourceId } from './types';

export const SAVE_VERSION = '0.3.0';

/** Una partida que no se puede usar (archivo ajeno, roto o de un nivel que no existe). */
export class InvalidSaveError extends Error {}

/** Un miembro del grupo recién llegado, con los valores de npcs.json. */
function newMember(id: string): PartyMember {
  const n = registry.npc(id);
  return { id: n.id, name: n.name, health: n.stats.health, morale: n.stats.morale, stamina: n.stats.stamina, bond: n.bond, trade: n.trade };
}

/**
 * Pone al día una partida guardada con una versión anterior del juego: completa
 * lo que el formato nuevo espera y no estaba. Nunca borra nada del jugador.
 *  0.1.0 → 0.2.0: las entradas del diario guardan de qué nivel son.
 *  0.2.0 → 0.3.0: el grupo suma a la gente nueva de su nivel (ej. Gwilym, Rachel y
 *  Aaron en el Nivel 3: sin estar en el grupo, sus vínculos no se guardaban).
 * Antes, se fija que sea una partida: si no lo es, InvalidSaveError (y no se carga).
 */
export function migrateState(s: GameState): GameState {
  const ok =
    !!s &&
    typeof s === 'object' &&
    typeof s.progress?.level === 'string' &&
    typeof s.progress.day === 'number' &&
    !!s.resources &&
    typeof s.resources === 'object' &&
    Array.isArray(s.party) &&
    !!s.player &&
    typeof s.player.name === 'string';
  if (!ok) throw new InvalidSaveError('no es una partida del juego');
  if (!registry.levelExists(s.progress.level)) throw new InvalidSaveError(`nivel desconocido: ${s.progress.level}`);
  const level = registry.level(s.progress.level);
  const ids = level.kind === 'march' ? (level.party ?? []) : level.spawns.npcs.map((n) => n.id);
  for (const id of ids) if (!s.party.some((m) => m.id === id)) s.party.push(newMember(id));
  s.meta ??= { version: '0.1.0', seed: 0, createdAt: Date.now(), playtimeMs: 0 };
  s.journal ??= [];
  s.codex ??= ['cod_wladfa'];
  s.flags ??= {};
  s.triggersFired ??= [];
  for (const e of s.journal) e.level ??= s.progress.level;
  s.meta.version = SAVE_VERSION;
  return s;
}

/**
 * Estado con el que arranca el nivel siguiente: lo que dice `exit.carryOver` del
 * nivel que termina (recursos, inventario, grupo, flags, idiomas, diario, códice)
 * pasa tal cual; el resto vuelve a empezar (jornada 1 al amanecer, sin triggers
 * disparados). Si el nivel nuevo trae gente que no estaba en el grupo, se suma.
 */
export function stateForNextLevel(prev: GameState, nextLevel: string): GameState {
  const fresh = createInitialState(nextLevel, prev.player.name, prev.player.gender);
  const carry = new Set(registry.level(prev.progress.level).exit?.carryOver ?? []);
  const keep = <K extends keyof GameState>(k: K): GameState[K] =>
    carry.has(k as string) ? structuredClone(prev[k]) : fresh[k];
  const party = keep('party');
  if (carry.has('party')) for (const m of fresh.party) if (!party.some((p) => p.id === m.id)) party.push(m);
  return {
    ...fresh,
    meta: { ...prev.meta, version: SAVE_VERSION },
    player: { ...prev.player },
    resources: keep('resources'),
    inventory: keep('inventory'),
    party,
    morale: carry.has('party') ? prev.morale : fresh.morale,
    languages: keep('languages'),
    flags: keep('flags'),
    journal: keep('journal'),
    codex: keep('codex'),
    progress: { level: nextLevel, day: 1, turn: 'amanecer', zone: '' },
    triggersFired: [],
    march: undefined,
  };
}

/** Crea el estado inicial de una partida nueva a partir de /data (nunca hardcodeado). */
export function createInitialState(levelId = 'nivel-01', name = 'Elin', gender: 'f' | 'm' = 'f'): GameState {
  const b = registry.levelBalance(levelId);
  const start = b.startState;
  const level = registry.level(levelId);

  // un nivel de marcha no tiene mapa: la columna sale de `party`
  const ids = level.kind === 'march' ? (level.party ?? []) : level.spawns.npcs.map((s) => s.id);
  const party: PartyMember[] = ids.map(newMember);

  return {
    meta: { version: SAVE_VERSION, seed: Date.now() % 2147483647, createdAt: Date.now(), playtimeMs: 0 },
    player: { name, gender, capacityKg: start.playerCapacityKg, carriedKg: start.playerCarriedKg },
    progress: { level: levelId, day: 1, turn: 'amanecer', zone: '' },
    resources: { ...start.resources } as Record<ResourceId, number>,
    inventory: [],
    party,
    morale: start.morale,
    languages: { ...start.languages } as Record<LangId, LangLevel>,
    factions: Object.fromEntries(
      (registry.game.factions as Array<{ id: string; startTrust: number }>).map((f) => [f.id, { trust: f.startTrust }]),
    ) as GameState['factions'],
    flags: {},
    map: { discovered: [], registered: [] },
    journal: [],
    codex: ['cod_wladfa'],
    triggersFired: [],
  };
}

/** Contexto plano que consumen las condiciones (`flags.x`, `resources.agua`, `party.mari.health`). */
export function conditionContext(s: GameState): Record<string, unknown> {
  const party: Record<string, unknown> = { morale: s.morale, bondsAtLeast1: s.party.filter((p) => p.bond >= 1).length };
  for (const m of s.party) {
    party[m.id] = m;
    party[m.id.replace(/^npc_/, '')] = m;
  }
  return {
    flags: s.flags,
    resources: s.resources,
    progress: s.progress,
    languages: s.languages,
    player: s.player,
    party,
    codex: s.codex,
  };
}
