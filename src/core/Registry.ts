import gameJson from '@data/config/game.json';
import balanceJson from '@data/config/balance.json';
import itemsJson from '@data/items.json';
import npcsJson from '@data/npcs.json';
import codexJson from '@data/codex.json';

// cada nivel son tres archivos con el mismo nombre (nivel-NN.json): el mapa y los
// triggers, los diálogos y las quests. Se cargan todos los que haya: sumar un
// nivel es sumar sus archivos, no tocar este código.
const levelFiles = import.meta.glob('../../data/levels/*.json', { eager: true, import: 'default' });
const dialogueFiles = import.meta.glob('../../data/dialogues/*.json', { eager: true, import: 'default' });
const questFiles = import.meta.glob('../../data/quests/*.json', { eager: true, import: 'default' });
const byName = (files: Record<string, unknown>): Map<string, any> =>
  new Map(Object.entries(files).map(([path, json]) => [path.split('/').pop()!.replace('.json', ''), json]));

import type {
  BultoDef, ChoiceScreenDef, DialogueDef, ItemDef, LevelDef, NpcDef, ResourceDef, TutorialDef,
} from './types';

/**
 * Acceso tipado y con validación a los JSON de /data.
 * REGLA R3: ningún número de balance se hardcodea en src/. Sale de acá.
 */
class GameRegistry {
  readonly game = gameJson as any;
  readonly balance = balanceJson as any;
  readonly resources = (gameJson as any).resources as ResourceDef[];

  private items = new Map<string, ItemDef>();
  private npcs = new Map<string, NpcDef>();
  private levels = new Map<string, LevelDef>();
  private dialogues = new Map<string, DialogueDef>();
  private choices = new Map<string, ChoiceScreenDef>();
  private tutorials = new Map<string, TutorialDef>();

  readonly bultos = (itemsJson as any).bultos_nivel01 as BultoDef[];
  readonly codex = (codexJson as any).entries as Array<{ id: string; title: string; unlockedBy?: string; documented: string; dramatized: string }>;
  private questsByLevel = new Map<string, Array<any>>();

  constructor() {
    for (const i of (itemsJson as any).items as ItemDef[]) this.items.set(i.id, i);
    for (const n of (npcsJson as any).npcs as NpcDef[]) this.npcs.set(n.id, n);
    for (const [id, json] of byName(levelFiles)) this.levels.set(id, json as LevelDef);
    for (const [, json] of byName(dialogueFiles)) {
      for (const d of (json.dialogues ?? []) as DialogueDef[]) this.dialogues.set(d.id, d);
      for (const c of (json.choices ?? []) as ChoiceScreenDef[]) this.choices.set(c.id, c);
      for (const t of (json.tutorials ?? []) as TutorialDef[]) this.tutorials.set(t.id, t);
    }
    for (const [id, json] of byName(questFiles)) this.questsByLevel.set(id, json.quests ?? []);
  }

  /** ¿Existe un nivel con este id (data/levels/<id>.json)? */
  hasLevel(id: string): boolean {
    return this.levels.has(id);
  }

  /** Quests de un nivel (data/quests/<id>.json); vacío si no tiene. */
  questsFor(levelId: string): Array<any> {
    return this.questsByLevel.get(levelId) ?? [];
  }

  item(id: string): ItemDef {
    const v = this.items.get(id);
    if (!v) throw new Error(`[Registry] item inexistente: ${id}`);
    return v;
  }
  npc(id: string): NpcDef {
    const v = this.npcs.get(id);
    if (!v) throw new Error(`[Registry] npc inexistente: ${id}`);
    return v;
  }
  level(id: string): LevelDef {
    const v = this.levels.get(id);
    if (!v) throw new Error(`[Registry] nivel inexistente: ${id}`);
    return v;
  }
  dialogue(id: string): DialogueDef {
    const v = this.dialogues.get(id);
    if (!v) throw new Error(`[Registry] diálogo inexistente: ${id}`);
    return v;
  }
  choiceScreen(id: string): ChoiceScreenDef {
    const v = this.choices.get(id);
    if (!v) throw new Error(`[Registry] choice inexistente: ${id}`);
    return v;
  }
  tutorial(id: string): TutorialDef | undefined {
    return this.tutorials.get(id);
  }
  speakerName(speaker: string, playerName: string): string {
    if (speaker === 'pc') return playerName;
    if (speaker === 'narrator') return '';
    return this.npcs.get(speaker)?.name ?? speaker;
  }
  /** Balance del nivel actual, con fallback claro si falta. */
  levelBalance(levelId: string): any {
    const key = levelId.replace('nivel-', 'nivel');
    const v = this.balance[key];
    if (!v) throw new Error(`[Registry] falta balance para ${levelId} (clave esperada: ${key})`);
    return v;
  }
}

export const registry = new GameRegistry();
