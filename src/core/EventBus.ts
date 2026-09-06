import type { JournalEntry, ResourceId, TurnId } from './types';

/**
 * Canal único entre sistemas y escenas. Nombres en `dominio:accion`.
 * Los sistemas emiten; las escenas escuchan y dibujan. Nunca al revés.
 */
export type GameEvents = {
  'time:turn-advanced': { day: number; turn: TurnId; prevTurn: TurnId };
  'time:day-ended': { day: number };

  'resource:changed': { id: ResourceId; from: number; to: number; reason: string };
  'resource:depleted': { id: ResourceId };

  'inventory:added': { itemId: string; qty: number };
  'inventory:removed': { itemId: string; qty: number };
  'inventory:overloaded': { current: number; capacity: number };
  'inventory:weight-changed': { current: number; capacity: number };

  'dialogue:start': { dialogueId: string };
  'dialogue:choice': { nodeId: string; choiceId: string };
  'dialogue:end': { dialogueId: string };

  'trigger:fired': { triggerId: string };
  'zone:entered': { zoneId: string; label: string };

  'party:health-changed': { memberId: string; from: number; to: number };
  'party:bond-changed': { memberId: string; level: number };
  'party:morale-changed': { from: number; to: number };

  'flag:set': { key: string; value: unknown };
  'journal:entry': { entry: JournalEntry };
  'save:written': { slot: number };
  'ui:toast': { text: string; icon?: string };
  'ui:tutorial': { id: string };
  'ui:action-context': { label: string | null };
};

type Handler<T> = (payload: T) => void;

class Emitter {
  private map = new Map<string, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(key as string);
    if (!set) {
      set = new Set();
      this.map.set(key as string, set);
    }
    set.add(fn);
    return () => this.off(key, fn);
  }

  once<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): void {
    const off = this.on(key, (p) => {
      off();
      fn(p);
    });
  }

  off<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): void {
    this.map.get(key as string)?.delete(fn);
  }

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    const set = this.map.get(key as string);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear(): void {
    this.map.clear();
  }
}

export const bus = new Emitter();
export type { Emitter };
