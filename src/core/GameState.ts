import { registry } from './Registry';
import type { GameState, LangId, LangLevel, PartyMember, ResourceId } from './types';

export const SAVE_VERSION = '0.1.0';

/** Crea el estado inicial de una partida nueva a partir de /data (nunca hardcodeado). */
export function createInitialState(levelId = 'nivel-01', name = 'Elin', gender: 'f' | 'm' = 'f'): GameState {
  const b = registry.levelBalance(levelId);
  const start = b.startState;
  const level = registry.level(levelId);

  const party: PartyMember[] = level.spawns.npcs
    .map((s) => registry.npc(s.id))
    .map((n) => ({
      id: n.id,
      name: n.name,
      health: n.stats.health,
      morale: n.stats.morale,
      stamina: n.stats.stamina,
      bond: n.bond,
      trade: n.trade,
    }));

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
