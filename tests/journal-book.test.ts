import { describe, expect, it } from 'vitest';
import { Game } from '@/core/Game';
import { createInitialState, stateForNextLevel } from '@/core/GameState';
import { paginate } from '@/render3d/BookView3D';

/**
 * La libreta como bitácora: cada decisión con lo que el personaje cree que va a
 * traer, un capítulo por nivel, el Códice al final, y el paginado de las hojas.
 */

/** Ancho de texto falso (sin canvas): cada letra mide lo mismo. */
const measure = (_font: string, t: string): number => t.length * 14;

function level1Done(): Game {
  const g = new Game(createInitialState('nivel-01', 'Elin', 'f'));
  g.flags.set('n1_cajones_bajados', 8);
  g.flags.set('n1_encontro_manantial', true);
  g.flags.set('n1_carga', ['harina', 'semilla', 'imprenta', 'organo', 'hierro']);
  g.state.progress.day = 3;
  return g;
}

describe('la libreta: bitácora del viaje', () => {
  it('cada decisión lleva lo que el personaje cree que va a pasar', () => {
    const g = level1Done();
    const d2 = g.journal.entry(2)!;
    const agua = d2.lines.findIndex((l) => l.includes('Encontramos agua'));
    expect(d2.thoughts![agua]).toContain('barriles');
    // la carga: un pensamiento por cada bulto que quedó, pegado a la línea de la carga
    const d3 = g.journal.entry(3)!;
    const carga = d3.lines.findIndex((l) => l.includes('Dejamos'));
    const t = d3.thoughts![carga]!;
    expect(t).toContain('ropa de abrigo');
    expect(t).toContain('libros');
    expect(t).not.toContain('semilla'); // la semilla se la llevaron
  });

  it('el libro: portada, un capítulo por nivel con sus jornadas, y el Códice al final', () => {
    const g1 = level1Done();
    g1.journal.write(1);
    g1.journal.write(2);
    g1.journal.write(3);
    const g = new Game(stateForNextLevel(g1.state, 'nivel-02'));
    g.marchDecision('caballo', 'repartir', 1);
    const blocks = g.journal.bookBlocks();
    expect(blocks[0]).toEqual({ kind: 'title', text: 'Libreta de Elin' });
    const chapters = blocks.filter((b) => b.kind === 'chapter').map((b) => b.text);
    expect(chapters).toEqual(['Las cuevas', 'La travesía', 'Códice']);
    expect(blocks.some((b) => b.kind === 'thought' && b.text.includes('más lentos'))).toBe(true);
    expect(blocks.find((b) => b.anchor === 'codice')?.kind).toBe('chapter');
  });

  it('sin nada escrito, el libro igual se abre (portada y Códice)', () => {
    const g = new Game(createInitialState('nivel-01', 'Idris', 'm'));
    const blocks = g.journal.bookBlocks();
    expect(blocks.some((b) => b.kind === 'note' && b.text.includes('Todavía no hay nada'))).toBe(true);
    expect(blocks[0]!.text).toBe('Libreta de Idris');
  });

  it('el paginado: cada capítulo en hoja nueva, nada se sale de la hoja, y la marca del Códice apunta bien', () => {
    const g1 = level1Done();
    for (const d of [1, 2, 3]) g1.journal.write(d);
    const blocks = g1.journal.bookBlocks();
    const { pages, anchors } = paginate(blocks, measure);
    expect(pages.length).toBeGreaterThan(2);
    // la portada sola en la primera hoja
    expect(pages[0]!.rows.every((r) => r.kind === 'title' || r.kind === 'subtitle')).toBe(true);
    // cada capítulo arranca una hoja
    for (const p of pages) {
      const i = p.rows.findIndex((r) => r.kind === 'chapter');
      if (i >= 0) expect(i).toBe(0);
    }
    // ningún renglón queda fuera de la hoja ni pasa el ancho
    for (const p of pages) for (const r of p.rows) expect(r.y).toBeLessThan(1000);
    expect(pages[anchors.codice!]!.rows[0]!.text).toBe('Códice');
    // todo el texto entra (nada se pierde al paginar)
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const inBlocks = blocks.reduce((n, b) => n + words(b.text), 0);
    const inPages = pages.reduce((n, p) => n + p.rows.reduce((m, r) => m + words(r.text), 0), 0);
    expect(inPages).toBe(inBlocks);
  });

  it('una hoja con poco texto agranda la letra, sin pasarse del pie; las llenas quedan igual', () => {
    // un ancho que depende del tamaño de la letra (como el canvas de verdad)
    const sized = (font: string, t: string): number => t.length * Number(/(\d+)px/.exec(font)![1]) * 0.5;
    const line = 'El viento no paró en todo el día y el agua de los barriles ya sabe a madera vieja.';
    const blocks = [
      { kind: 'chapter' as const, text: 'La travesía', pageBreak: true },
      { kind: 'day' as const, text: 'Jornada 1' },
      ...Array.from({ length: 14 }, () => ({ kind: 'line' as const, text: line })),
      { kind: 'thought' as const, text: 'Lo que quedó en la playa nos va a faltar en algún momento. No sé cuándo.', pageBreak: true },
      { kind: 'chapter' as const, text: 'El valle', pageBreak: true },
      { kind: 'day' as const, text: 'Jornada 1' },
    ];
    const { pages } = paginate(blocks, sized);
    const sola = pages.find((p) => p.rows.length && p.rows.every((r) => r.kind === 'thought'));
    expect(sola, 'el pensamiento quedó solo en una hoja').toBeTruthy();
    expect(sola!.scale).toBeGreaterThan(1);
    // no se sale de la hoja y no se pierde ni una palabra
    const last = sola!.rows[sola!.rows.length - 1]!;
    expect(last.y + 36 * sola!.scale!).toBeLessThan(928 - 96);
    expect(sola!.rows.map((r) => r.text).join(' ')).toBe(blocks.find((b) => b.kind === 'thought')!.text);
    // las hojas de capítulo y las llenas, con la letra de siempre
    for (const p of pages) {
      const full = p.rows.length && p.rows[p.rows.length - 1]!.y > 928 * 0.6;
      if (p.rows.some((r) => r.kind === 'chapter') || full) expect(p.scale ?? 1, p.rows[0]?.text).toBe(1);
    }
  });
});
