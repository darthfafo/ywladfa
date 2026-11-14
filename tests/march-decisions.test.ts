import { describe, expect, it } from 'vitest';
import balance from '@data/config/balance.json';
import level from '@data/levels/nivel-02.json';
import { MarchSystem, type MarchConfig, type MarchState, type MarchTrack } from '@/systems/MarchSystem';

/**
 * Que la marcha se juegue: cada decisión pesa, el paso es una decisión de todo el
 * tiempo (apurar no es gratis), lo que se deja importa, el terreno se lee, y la
 * moral cambia lo que se puede hacer.
 */
const cfg = (balance as any).nivel02.marcha as MarchConfig;
const T = (level as unknown as { march: MarchTrack }).march;

const SAFE: Record<string, string> = {
  caballo: 'repartir',
  canadon: 'bajar',
  bifurcacion: 'costa',
  aguada: 'desviar',
  cerro: 'derecha',
  rastrillada: 'tomar',
  tormenta: 'refugio',
  cruce: 'costado',
  noche: 'repartir',
};

type Policy = 'normal' | 'apurar' | 'atento';

function run(pick: Record<string, string> = {}, opts: { seed?: number; policy?: Policy; start?: Partial<MarchState> & Record<string, unknown> } = {}): MarchSystem {
  const m = new MarchSystem(cfg, T, { seed: opts.seed ?? 3, ...(opts.start ?? {}) });
  const choices = { ...SAFE, ...pick };
  for (let t = 0; t < 60000 && !m.state.arrived; t++) {
    const p = opts.policy ?? 'normal';
    if (p === 'atento') m.setPace(m.state.mariStamina > 55 ? 'apurar' : m.state.mariStamina > 30 ? 'normal' : 'aflojar');
    else m.setPace(p);
    m.update(0.1);
    while (m.state.blocked) {
      const b = m.state.blocked;
      const [o, d] = choices[b.id]!.split(':');
      m.choose(o!, d);
      if (m.state.blocked === b) throw new Error(`${b.id}: ${choices[b.id]} no avanzó`);
    }
  }
  expect(m.state.arrived).toBe(true);
  return m;
}

/** Cuándo se llegó, en tiles de reloj desde el arranque. */
const when = (s: MarchState): number =>
  ((s.day - 1) * 3 + { amanecer: 0, manana: 1, tarde: 2, noche: 3 }[s.turn]) * cfg.tilesPerTurn + s.clock;

/** ¿Las dos llegadas son distintas de verdad en algo que importa? */
function differs(a: MarchState, b: MarchState): boolean {
  return (
    Math.abs(when(a) - when(b)) >= 10 ||
    Math.abs(a.agua - b.agua) >= 1 ||
    Math.abs(a.comida - b.comida) >= 1 ||
    Math.abs(a.mariHealth - b.mariHealth) >= 2 ||
    Math.abs(a.morale - b.morale) >= 2 ||
    a.dropped.join() !== b.dropped.join()
  );
}

describe('las decisiones de la marcha pesan', () => {
  it('cada opción de cada decisión cambia cómo se llega (ninguna decisión es de adorno)', () => {
    const decisions: Array<[string, string[]]> = [
      ['caballo', ['repartir', 'dejar:raciones', 'dejar:semilla']],
      ['canadon', ['bajar', 'rodear']],
      ['bifurcacion', ['costa', 'adentro']],
      ['aguada', ['desviar', 'seguir']],
      ['cerro', ['derecha', 'izquierda']],
      ['rastrillada', ['tomar', 'derecho']],
      ['tormenta', ['seguir', 'refugio']],
      ['cruce', ['costado', 'espalda']],
      ['noche', ['repartir', 'racionar', 'luna']],
    ];
    for (const [id, options] of decisions) {
      const route: Record<string, string> = id === 'cerro' ? { bifurcacion: 'adentro' } : {};
      const ends = options.map((o) => run({ ...route, [id]: o }).state);
      for (let i = 0; i < ends.length; i++)
        for (let j = i + 1; j < ends.length; j++) expect(differs(ends[i]!, ends[j]!), `${id}: ${options[i]} vs ${options[j]}`).toBe(true);
    }
  });

  it('apurar no es gratis: llega antes, pero un paso atento al aire de tu madre la cuida mejor', () => {
    const apurado = run({}, { policy: 'apurar' });
    const atento = run({}, { policy: 'atento' });
    expect(when(apurado.state)).toBeLessThan(when(atento.state));
    expect(atento.state.mariHealth).toBeGreaterThan(apurado.state.mariHealth + 3);
    expect(atento.state.agua).toBeGreaterThan(apurado.state.agua);
  });

  it('caminar con tu madre sin aire la enferma; esperar no', () => {
    const m = new MarchSystem(cfg, T);
    m.setPace('apurar');
    m.state.mariStamina = 5;
    const h = m.state.mariHealth;
    for (let i = 0; i < 30; i++) m.update(0.1);
    expect(m.state.mariHealth).toBeLessThan(h);
    const w = new MarchSystem(cfg, T);
    w.state.mariStamina = 5;
    w.setWaiting(true);
    const h2 = w.state.mariHealth;
    for (let i = 0; i < 30; i++) w.update(0.1);
    expect(w.state.mariHealth).toBe(h2);
  });

  it('lo que se deja: un bulto del Nivel 1 no cuesta comida ahora (pesa después); la harina y las raciones sí', () => {
    const semilla = run({ caballo: 'dejar:semilla' }).state;
    const raciones = run({ caballo: 'dejar:raciones' }).state;
    const harina = run({ caballo: 'dejar:harina' }).state;
    expect(semilla.dropped).toEqual(['semilla']);
    expect(raciones.comida).toBeLessThan(semilla.comida);
    expect(harina.comida).toBeLessThan(semilla.comida);
  });

  it('la aguada es la misma en toda la partida y se lee: matas verdes dan agua, grises casi nada', () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const variants = seeds.map((seed) => new MarchSystem(cfg, T, { seed }).state.variant.aguada);
    expect(new Set(variants)).toEqual(new Set(['verde', 'seca']));
    // fija: la misma semilla, la misma aguada
    expect(new MarchSystem(cfg, T, { seed: 3 }).state.variant.aguada).toBe(new MarchSystem(cfg, T, { seed: 3 }).state.variant.aguada);
    const verde = seeds.find((_, i) => variants[i] === 'verde')!;
    const seca = seeds.find((_, i) => variants[i] === 'seca')!;
    const gain = (seed: number) => run({ aguada: 'desviar' }, { seed }).state.agua - run({ aguada: 'seguir' }, { seed }).state.agua;
    expect(gain(verde)).toBeGreaterThan(5);
    expect(gain(seca)).toBeLessThan(1.5);
    // el texto es la pista
    const o = new MarchSystem(cfg, T, { seed: verde });
    expect(o.resolve(T.obstacles.find((x) => x.id === 'aguada')!).prompt).toContain('verdes');
  });

  it('caminar con la luna avanza de noche, pero nunca saltea una decisión (espera al amanecer)', () => {
    const m = new MarchSystem(cfg, T);
    for (let i = 0; i < 20000 && m.state.blocked?.id !== 'noche'; i++) {
      m.update(0.1);
      if (m.state.blocked && m.state.blocked.id !== 'noche') {
        const [o, d] = SAFE[m.state.blocked.id]!.split(':');
        m.choose(o!, d);
      }
    }
    const pos = m.state.pos;
    m.choose('luna');
    expect(m.state.pos).toBeGreaterThan(pos);
    const next = T.obstacles.filter((o) => o.options || o.variants).map((o) => o.at!).filter((a) => a > pos)[0]!;
    expect(m.state.pos).toBeLessThan(next);
    expect(m.state.nightWalks).toBe(1);
  });

  it('el cruce: con el viento en la espalda se pierden; Lewis lo dice', () => {
    const m = run({ cruce: 'espalda' });
    expect(m.state.lostCount).toBe(1);
    expect(T.obstacles.find((o) => o.id === 'cruce')!.lostLine).toContain('viento');
    // la pista del viento se dice mucho antes
    const pista = T.lines.find((l) => l.text.includes('lado derecho'))!;
    expect(pista.at).toBeLessThan(T.obstacles.find((o) => o.id === 'cruce')!.at!);
  });

  it('sin ánimo el grupo camina más lento y nadie quiere arriesgarse por el atajo', () => {
    const m = new MarchSystem(cfg, T);
    const v = m.speed();
    m.state.morale = cfg.morale.slowBelow - 1;
    expect(m.speed()).toBeLessThan(v);
    const ev = m.update(0.1);
    expect(ev.some((e) => e.type === 'lowMorale')).toBe(true);
    const fork = T.obstacles.find((o) => o.id === 'bifurcacion')!;
    const adentro = fork.options!.find((o) => o.id === 'adentro')!;
    m.state.morale = adentro.requiresMorale! - 1;
    expect(m.available(adentro)).toBe(false);
    m.state.blocked = fork;
    expect(m.choose('adentro')).toEqual([]);
    expect(m.state.blocked).toBe(fork);
  });
});
