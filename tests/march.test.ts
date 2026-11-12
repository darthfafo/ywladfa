import { describe, expect, it } from 'vitest';
import balance from '@data/config/balance.json';
import track from '@data/proto/marcha.json';
import { MarchSystem, profileHeight, type MarchConfig, type MarchEvent, type MarchTrack } from '@/systems/MarchSystem';

const cfg = (balance as any).nivel02.marcha as MarchConfig;
const T = track as unknown as MarchTrack;

/** Corre la marcha a paso fijo; resuelve los obstáculos con `pick`. */
function play(m: MarchSystem, pick: Record<string, string>, maxSec = 2000): MarchEvent[] {
  const all: MarchEvent[] = [];
  for (let t = 0; t < maxSec * 10 && !m.state.arrived; t++) {
    const ev = m.update(0.1);
    all.push(...ev);
    if (m.state.blocked) all.push(...m.choose(pick[m.state.blocked.id]!));
  }
  return all;
}

describe('marcha (prototipo del Nivel 2)', () => {
  it('a paso normal se llega al río, con una noche de campamento en el medio', () => {
    const m = new MarchSystem(cfg, T);
    const ev = play(m, { canadon: 'bajar', aguada: 'seguir' });
    expect(m.state.arrived).toBe(true);
    expect(ev.filter((e) => e.type === 'night')).toHaveLength(1);
    expect(m.state.day).toBe(2);
    // todas las líneas del camino se dijeron
    expect(ev.filter((e) => e.type === 'line')).toHaveLength(T.lines.length);
  });

  it('el reloj es la distancia: apurar llega con menos turnos pero más sed y más cansancio', () => {
    const lento = new MarchSystem(cfg, T);
    lento.setPace('aflojar');
    play(lento, { canadon: 'bajar', aguada: 'seguir' });
    const rapido = new MarchSystem(cfg, T);
    rapido.setPace('apurar');
    play(rapido, { canadon: 'bajar', aguada: 'seguir' });
    expect(rapido.state.agua).toBeLessThan(lento.state.agua);
    expect(rapido.state.mariStamina).toBeLessThan(lento.state.mariStamina);
  });

  it('esperar no acerca pero el reloj corre, y Mari se recupera', () => {
    const m = new MarchSystem(cfg, T);
    m.state.mariStamina = 10;
    m.setWaiting(true);
    const pos = m.state.pos;
    const clock = m.state.clock;
    for (let i = 0; i < 30; i++) m.update(0.1);
    expect(m.state.pos).toBe(pos);
    expect(m.state.clock).toBeGreaterThan(clock);
    expect(m.state.mariStamina).toBeGreaterThan(10);
  });

  it('el cañadón frena la columna hasta decidir; rodear cuesta reloj y agua, no posición', () => {
    const m = new MarchSystem(cfg, T);
    let ev: MarchEvent[] = [];
    for (let i = 0; i < 5000 && !m.state.blocked; i++) ev = m.update(0.1);
    expect(m.state.blocked?.id).toBe('canadon');
    expect(ev.some((e) => e.type === 'obstacle')).toBe(true);
    const pos = m.state.pos;
    for (let i = 0; i < 20; i++) m.update(0.1);
    expect(m.state.pos).toBe(pos); // frenada
    const agua = m.state.agua;
    m.choose('rodear');
    const c = T.obstacles.find((o) => o.id === 'canadon')!;
    expect(m.state.pos).toBeGreaterThan(c.at! + c.width!);
    expect(m.state.agua).toBeLessThan(agua);
    expect(m.state.extraTiles).toBe(45);
  });

  it('Mari cansada se queda atrás y la columna la espera sola', () => {
    const m = new MarchSystem(cfg, T);
    m.setPace('apurar');
    m.state.mariStamina = 0;
    const ev: MarchEvent[] = [];
    for (let i = 0; i < 400; i++) ev.push(...m.update(0.1));
    expect(ev.some((e) => e.type === 'mariBehind')).toBe(true);
    expect(m.state.mariLag).toBeLessThanOrEqual(cfg.mariMaxLagTiles);
  });

  it('sin agua no se pierde: se llega igual, más lento y con Mari peor (R7)', () => {
    const m = new MarchSystem(cfg, T);
    m.state.agua = 0;
    const health = m.state.mariHealth;
    const ev = play(m, { canadon: 'rodear', aguada: 'seguir' });
    expect(m.state.arrived).toBe(true);
    expect(ev.some((e) => e.type === 'thirst')).toBe(true);
    expect(m.state.mariHealth).toBeLessThan(health);
  });

  it('el perfil hunde el cañadón y deja el resto del camino caminable', () => {
    const c = T.obstacles.find((o) => o.id === 'canadon')!;
    const borde = profileHeight(T, c.at! - 1);
    const fondo = profileHeight(T, c.at! + c.width! / 2);
    expect(borde - fondo).toBeGreaterThan(c.depth! * 0.8);
    expect(profileHeight(T, T.lengthTiles)).toBeLessThan(profileHeight(T, 140)); // se baja al valle
  });
});
