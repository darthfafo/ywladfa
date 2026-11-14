import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { registry } from '@/core/Registry';
import { DialogueSystem } from '@/systems/DialogueSystem';

/**
 * Cada línea en su idioma (GDD §5.5, P3): en una escena en galés, lo que dice
 * Murga en castellano llega en bloques si el personaje no sabe castellano.
 */
describe('el idioma de cada línea', () => {
  it('la bandera: Murga en castellano (bloques) y Lewis en galés (se entiende)', () => {
    const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
    expect(g.state.languages.spa).toBe(0);
    const d = new DialogueSystem(g);
    const lines: Array<{ who: string; text: string }> = [];
    let l = d.start('d_n3_bandera');
    for (let i = 0; i < 20 && l; i++) {
      lines.push({ who: l.speakerId, text: l.text });
      l = l.choices.length ? d.choose(l.choices[0]!.id) : d.next();
    }
    const murga = lines.find((x) => x.who === 'npc_murga')!;
    expect(murga.text).toContain('▓');
    const lewis = lines.find((x) => x.who === 'npc_lewis')!;
    expect(lewis.text).not.toContain('▓');
    expect(lewis.text).toContain('Trerawson');
    expect(registry.dialogue('d_n3_bandera').lang).toBe('cym');
  });
});
