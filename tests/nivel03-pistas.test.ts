import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { registry } from '@/core/Registry';
import type { TriggerDef } from '@/core/types';
import { DialogueSystem } from '@/systems/DialogueSystem';
import { TriggerSystem } from '@/systems/TriggerSystem';

/**
 * En el valle nadie contesta «Ahora no.»: sin escena pendiente, cada uno da una
 * pista de cómo seguir según el momento del nivel (como en el Nivel 1). Se elige
 * igual que WorldScene.talkTo: el primer trigger manual con diálogo de ese NPC.
 */
const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) },
});

const level = () => registry.level('nivel-03');
const NPCS = ['npc_lewis', 'npc_mari', 'npc_edwyn', 'npc_matthews', 'npc_berwyn'];

/** Lo que dice `npc` si le hablás con estos flags (sin disparar nada más). */
function says(npc: string, flags: Record<string, unknown>): string | null {
  const g = new Game(createInitialState('nivel-03', 'Elin', 'f'));
  g.flags.setMany(flags as never);
  const ts = new TriggerSystem(g, level().triggers as TriggerDef[]);
  // las escenas automáticas ya pasaron: solo queda hablar
  for (const t of level().triggers) if (!t.manual) ts.markFired(t.id);
  const t = level().triggers.find((tr) => {
    if (!tr.action?.dialogue || !tr.manual) return false;
    if (registry.dialogue(tr.action.dialogue).npc !== npc) return false;
    if (tr.once && ts.hasFired(tr.id)) return false;
    return g.flags.eval(tr.requires);
  });
  if (!t) return null;
  const line = new DialogueSystem(g).start(t.action.dialogue);
  return line?.text ?? null;
}

describe('Nivel 3: lo que dice cada uno es una pista', () => {
  const stages: Array<[string, Record<string, unknown>, RegExp]> = [
    ['el rancho', { n3_bandera: true }, /rancho|barro|barda|fuerte|jornadas/i],
    ['esperar el río', { n3_bandera: true, n3_tiene_rancho: true }, /descans|fuego|fogón/i],
    ['rehacer', { n3_bandera: true, n3_crecida: true, n3_rehacer: 'techo' }, /arriba|río|marca/i],
    ['el toldo', { n3_acto1: true, n3_invierno: true, n3_toldo: true }, /toldo|manta|manos|diccionario/i],
    ['la zanja', { n3_acto1: true, n3_acto2: true, n3_zanja: true }, /agua|río|chacra|compuerta|suelo|tramo/i],
  ];
  for (const [name, flags, re] of stages) {
    it(`${name}: todos tienen algo útil para decir`, () => {
      for (const npc of NPCS) {
        const t = says(npc, flags);
        expect(t, `${npc} en «${name}»`).not.toBeNull();
        expect(t, `${npc} en «${name}»`).toMatch(re);
      }
    });
  }

  it('cuando hay escena pendiente, la escena gana (la pista va al final)', () => {
    const order = level().triggers.map((t) => t.id);
    expect(order.indexOf('trig_n3_manta')).toBeLessThan(order.indexOf('trig_n3_lewis_pista'));
    expect(order.findIndex((id) => id.endsWith('_pista'))).toBeGreaterThan(order.indexOf('trig_n3_acto2_fin'));
  });
});
