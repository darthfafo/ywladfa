import { describe, expect, it } from 'vitest';
import balance from '@data/config/balance.json';
import track from '@data/proto/marcha.json';
import { MarchSystem, profileHeight, type MarchConfig, type MarchEvent, type MarchTrack } from '@/systems/MarchSystem';

const cfg = (balance as any).nivel02.marcha as MarchConfig;
const T = track as unknown as MarchTrack;

/** Lo que elige un jugador prolijo, salvo lo que cada test cambie. */
const SAFE: Record<string, string> = {
  caballo: 'repartir',
  canadon: 'bajar',
  bifurcacion: 'costa',
  aguada: 'seguir',
  cerro: 'derecha',
  rastrillada: 'tomar',
  tormenta: 'refugio',
  noche: 'repartir',
};

/** Corre la marcha a paso fijo; resuelve cada decisión con `pick`. */
function play(m: MarchSystem, pick: Record<string, string> = {}, maxSec = 2000): { ev: MarchEvent[]; asked: string[] } {
  const choices = { ...SAFE, ...pick };
  const ev: MarchEvent[] = [];
  const asked: string[] = [];
  for (let t = 0; t < maxSec * 10 && !m.state.arrived; t++) {
    ev.push(...m.update(0.1));
    while (m.state.blocked) {
      const id = m.state.blocked.id;
      if (!choices[id]) throw new Error(`sin elección para ${id}`);
      asked.push(id);
      ev.push(...m.choose(choices[id]!));
    }
  }
  return { ev, asked };
}

/** Tiempo total (turnos completos más el reloj del turno) con que se llegó, en tiles de reloj. */
const elapsed = (m: MarchSystem): number => {
  const idx = { amanecer: 0, manana: 1, tarde: 2, noche: 3 }[m.state.turn];
  return ((m.state.day - 1) * 3 + idx) * cfg.tilesPerTurn + m.state.clock;
};

describe('marcha (prototipo del Nivel 2)', () => {
  it('tres días si el viento afloja, cuatro si no: arriesgando bien se llega al tercero; siendo cauto en todo, al cuarto', () => {
    const audaz = new MarchSystem(cfg, T);
    const a = play(audaz, { caballo: 'dejar', bifurcacion: 'adentro', cerro: 'derecha', tormenta: 'seguir', rastrillada: 'derecho' });
    expect(audaz.state.arrived).toBe(true);
    expect(a.asked).toContain('noche');
    expect(a.ev.filter((e) => e.type === 'night')).toHaveLength(2);
    expect(audaz.state.day).toBe(3);
    const cauto = new MarchSystem(cfg, T);
    const c = play(cauto);
    expect(cauto.state.arrived).toBe(true);
    expect(c.ev.filter((e) => e.type === 'night')).toHaveLength(3);
    expect(cauto.state.day).toBe(4);
  });

  it('la rastrillada rodea el arenal: más vuelta, pero tu madre no se hunde en la arena', () => {
    const medano = T.obstacles.find((o) => o.id === 'medano')!;
    const enArena = (pick: string): { v: number; m: MarchSystem } => {
      const m = new MarchSystem(cfg, T);
      for (let i = 0; i < 30000 && m.state.pos < medano.from! + 3 && !m.state.arrived; i++) {
        m.update(0.1);
        if (m.state.blocked) m.choose({ ...SAFE, rastrillada: pick }[m.state.blocked.id]!);
      }
      return { v: m.speed(), m };
    };
    const tomar = enArena('tomar');
    const derecho = enArena('derecho');
    expect(tomar.m.state.avoided).toContain('medano');
    expect(tomar.v).toBeGreaterThan(derecho.v);
    // la línea de la arena solo la dice quien cruza el arenal
    const arena = T.lines.findIndex((l) => l.text.startsWith('Arena'));
    expect(derecho.m.state.said).toContain(arena);
    expect(tomar.m.state.said).not.toContain(arena);
    // el campamento se ve de lejos: no frena la columna ni pide decidir nada
    expect(play(new MarchSystem(cfg, T)).asked).not.toContain('toldos');
  });

  it('el paso importa: apurar llega en menos tiempo, con menos agua y Mari más cansada', () => {
    const lento = new MarchSystem(cfg, T);
    lento.setPace('aflojar');
    play(lento);
    const rapido = new MarchSystem(cfg, T);
    rapido.setPace('apurar');
    play(rapido);
    expect(elapsed(rapido)).toBeLessThan(elapsed(lento));
    expect(rapido.state.mariStamina).toBeLessThan(lento.state.mariStamina);
  });

  it('la bifurcación decide qué aparece: la aguada por la costa, el cerro por adentro', () => {
    const costa = play(new MarchSystem(cfg, T), { bifurcacion: 'costa' }).asked;
    expect(costa).toContain('aguada');
    expect(costa).not.toContain('cerro');
    const adentro = play(new MarchSystem(cfg, T), { bifurcacion: 'adentro' }).asked;
    expect(adentro).toContain('cerro');
    expect(adentro).not.toContain('aguada');
  });

  it('el atajo bien tomado llega antes que la costa; mal tomado, se pierden y llegan después', () => {
    const costa = new MarchSystem(cfg, T);
    play(costa, { bifurcacion: 'costa' });
    const bien = new MarchSystem(cfg, T);
    play(bien, { bifurcacion: 'adentro', cerro: 'derecha' });
    const mal = new MarchSystem(cfg, T);
    const { ev } = play(mal, { bifurcacion: 'adentro', cerro: 'izquierda' });
    expect(elapsed(bien)).toBeLessThan(elapsed(costa));
    expect(elapsed(mal)).toBeGreaterThan(elapsed(costa));
    expect(mal.state.lostCount).toBe(1);
    expect(ev.some((e) => e.type === 'skip' && e.kind === 'lost')).toBe(true);
    // perdidos, terminan saliendo a la costa: el mar vuelve a verse y no se cruzan con la aguada que ya quedó atrás
    expect(mal.state.route).toBe('costa');
    // la línea de Lewis que avisa del cerro sale antes de la bifurcación
    const aviso = T.lines.find((l) => l.text.includes('cerro'))!;
    expect(aviso.at).toBeLessThan(T.obstacles.find((o) => o.id === 'bifurcacion')!.at!);
  });

  it('por adentro se pierde de vista el mar (y se lo recupera al volver a la costa)', () => {
    const m = new MarchSystem(cfg, T);
    const f = T.obstacles.find((o) => o.id === 'bifurcacion')!;
    let maxInland = 0;
    for (let i = 0; i < 20000 && !m.state.arrived; i++) {
      m.update(0.1);
      if (m.state.blocked) m.choose({ ...SAFE, bifurcacion: 'adentro' }[m.state.blocked.id]!);
      maxInland = Math.max(maxInland, m.inland());
      if (m.state.pos > f.rejoinAt! + 2) break;
    }
    expect(maxInland).toBe(1);
    expect(m.inland()).toBe(0);
  });

  it('el caballo: repartir la carga frena el resto del camino; dejar un bulto cuesta comida', () => {
    const hastaElCaballo = (): MarchSystem => {
      const m = new MarchSystem(cfg, T);
      for (let i = 0; i < 5000 && m.state.blocked?.id !== 'caballo'; i++) m.update(0.1);
      return m;
    };
    const rep = hastaElCaballo();
    const comida = rep.state.comida;
    rep.choose('repartir');
    expect(rep.state.loadFactor).toBeLessThan(1);
    expect(rep.state.comida).toBe(comida);
    const dej = hastaElCaballo();
    dej.choose('dejar');
    expect(dej.state.loadFactor).toBe(1);
    expect(dej.state.comida).toBeLessThan(comida);
    // y repartir la carga cuesta horas hasta el final
    play(rep);
    play(dej);
    expect(elapsed(dej)).toBeLessThan(elapsed(rep));
  });

  it('la tormenta: enfrentarla frena y cansa; refugiarse cuesta tiempo pero Mari descansa', () => {
    const storm = T.obstacles.find((o) => o.id === 'tormenta')!;
    // cruzar el mismo trecho con el viento en contra cansa más que con el viento calmo
    const cansancio = (pick: string): number => {
      const m = new MarchSystem(cfg, T);
      m.state.pos = storm.at! + 1;
      m.state.resolved.tormenta = pick;
      m.state.mariStamina = 60;
      for (let i = 0; i < 2000 && m.state.pos < storm.at! + 6; i++) m.update(0.1);
      return 60 - m.state.mariStamina;
    };
    expect(cansancio('seguir')).toBeGreaterThan(cansancio('refugio'));
    // y refugiarse le devuelve aire a tu madre
    expect(storm.options!.find((o) => o.id === 'refugio')!.mariStamina).toBeGreaterThan(0);
    // en la zona de la tormenta, enfrentarla va más lento que fuera de ella
    const m = new MarchSystem(cfg, T);
    m.state.pos = storm.at! + 2;
    m.state.resolved.tormenta = 'seguir';
    const enTormenta = m.speed();
    m.state.resolved.tormenta = 'refugio';
    expect(enTormenta).toBeLessThan(m.speed());
  });

  it('la noche: racionar estira el agua pero Mari lo paga', () => {
    const rep = new MarchSystem(cfg, T);
    play(rep, { noche: 'repartir' });
    const rac = new MarchSystem(cfg, T);
    play(rac, { noche: 'racionar' });
    expect(rac.state.agua).toBeGreaterThan(rep.state.agua);
    expect(rac.state.mariHealth).toBeLessThan(rep.state.mariHealth);
    expect(rac.state.rationedNights).toBeGreaterThanOrEqual(1);
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
    for (let i = 0; i < 5000 && m.state.blocked?.id !== 'canadon'; i++) {
      m.update(0.1);
      if (m.state.blocked && m.state.blocked.id !== 'canadon') m.choose(SAFE[m.state.blocked.id]!);
    }
    expect(m.state.blocked?.id).toBe('canadon');
    const pos = m.state.pos;
    for (let i = 0; i < 20; i++) m.update(0.1);
    expect(m.state.pos).toBe(pos); // frenada
    const agua = m.state.agua;
    m.choose('rodear');
    const c = T.obstacles.find((o) => o.id === 'canadon')!;
    expect(m.state.pos).toBeGreaterThan(c.at! + c.width!);
    expect(m.state.agua).toBeLessThan(agua);
  });

  it('Mari cansada se queda atrás y la columna la espera sola', () => {
    const m = new MarchSystem(cfg, T);
    m.setPace('apurar');
    m.state.mariStamina = 0;
    const ev: MarchEvent[] = [];
    for (let i = 0; i < 400; i++) {
      ev.push(...m.update(0.1));
      if (m.state.blocked) m.choose(SAFE[m.state.blocked.id]!);
    }
    expect(ev.some((e) => e.type === 'mariBehind')).toBe(true);
    expect(m.state.mariLag).toBeLessThanOrEqual(cfg.mariMaxLagTiles);
  });

  it('el peor camino posible igual llega (R7): sin agua, perdidos, enfrentando la tormenta', () => {
    const m = new MarchSystem(cfg, T);
    m.state.agua = 0;
    m.setPace('apurar');
    const health = m.state.mariHealth;
    const { ev } = play(m, { bifurcacion: 'adentro', cerro: 'izquierda', tormenta: 'seguir', noche: 'racionar', caballo: 'repartir' });
    expect(m.state.arrived).toBe(true);
    expect(ev.some((e) => e.type === 'thirst')).toBe(true);
    expect(m.state.mariHealth).toBeLessThan(health);
  });

  it('el perfil hunde el cañadón y baja al valle al final', () => {
    const c = T.obstacles.find((o) => o.id === 'canadon')!;
    const borde = profileHeight(T, c.at! - 1);
    const fondo = profileHeight(T, c.at! + c.width! / 2);
    expect(borde - fondo).toBeGreaterThan(c.depth! * 0.8);
    expect(profileHeight(T, T.lengthTiles)).toBeLessThan(profileHeight(T, 140));
  });
});
