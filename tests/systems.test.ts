import { describe, expect, it, beforeEach } from 'vitest';
import { evalCondition } from '@/core/conditions';
import { Game } from '@/core/Game';
import { createInitialState } from '@/core/GameState';
import { registry } from '@/core/Registry';

function fresh(): Game {
  return new Game(createInitialState('nivel-01'));
}

describe('TimeSystem', () => {
  let g: Game;
  beforeEach(() => { g = fresh(); });

  it('arranca en jornada 1, amanecer', () => {
    expect(g.state.progress.day).toBe(1);
    expect(g.state.progress.turn).toBe('amanecer');
  });

  it('avanza turnos dentro de la jornada', () => {
    g.time.advance(1);
    expect(g.state.progress.turn).toBe('manana');
    g.time.advance(2);
    expect(g.state.progress.turn).toBe('noche');
    expect(g.state.progress.day).toBe(1);
  });

  it('cierra la jornada al pasar de noche', () => {
    const ended = g.time.advance(4);
    expect(ended).toBe(1);
    expect(g.state.progress.day).toBe(2);
    expect(g.state.progress.turn).toBe('amanecer');
  });

  it('el nivel dura exactamente 3 jornadas', () => {
    g.time.advance(12);
    expect(g.state.progress.day).toBe(4);
    expect(g.time.isLevelOver(registry.levelBalance('nivel-01').days)).toBe(true);
  });
});

describe('ResourceSystem', () => {
  let g: Game;
  beforeEach(() => { g = fresh(); });

  it('toma el estado inicial del balance, no de constantes', () => {
    const start = registry.levelBalance('nivel-01').startState.resources;
    expect(g.res.get('agua')).toBe(start.agua);
    expect(g.res.get('comida')).toBe(start.comida);
  });

  it('nunca baja de cero', () => {
    g.res.change('agua', -999, 'test');
    expect(g.res.get('agua')).toBe(0);
  });

  it('spend falla si no alcanza y no modifica nada', () => {
    const before = g.res.get('lena');
    expect(g.res.spend('lena', 99, 'test')).toBe(false);
    expect(g.res.get('lena')).toBe(before);
  });

  it('la noche consume comida por persona y agua por grupo', () => {
    const groupSize = registry.levelBalance('nivel-01').groupSize as number;
    const nc = registry.balance.nightConsumption;
    const comidaAntes = g.res.get('comida');
    const aguaAntes = g.res.get('agua');
    g.res.applyNight(groupSize);
    expect(g.res.get('comida')).toBe(comidaAntes - nc.comidaPerPerson * groupSize);
    expect(g.res.get('agua')).toBe(aguaAntes - nc.aguaPerGroup);
  });

  it('sin leña suficiente, no hay fuego', () => {
    g.res.change('lena', -99, 'test');
    expect(g.res.applyNight(9)).toBe('noFire');
  });

  it('con leña de sobra, fuego grande', () => {
    g.res.change('lena', 10, 'test');
    expect(g.res.applyNight(9)).toBe('bigFire');
  });
});

describe('InventorySystem', () => {
  let g: Game;
  beforeEach(() => { g = fresh(); });

  it('la sobrecarga no bloquea: solo frena (Pilar P2)', () => {
    for (let i = 0; i < 4; i++) g.inv.add('cajon_provisiones', 1);
    expect(g.inv.isOverloaded).toBe(true);
    expect(g.inv.speedMultiplier()).toBeLessThan(1);
    expect(g.inv.speedMultiplier()).toBeGreaterThanOrEqual(
      registry.balance.global.overloadSpeedMultiplier,
    );
  });

  it('sacar un ítem devuelve el peso', () => {
    const before = g.inv.carried;
    g.inv.add('pala', 1);
    expect(g.inv.carried).toBeGreaterThan(before);
    g.inv.remove('pala', 1);
    expect(g.inv.carried).toBeCloseTo(before, 1);
  });
});

describe('evaluador de condiciones', () => {
  it('compara flags y recursos', () => {
    const ctx = { flags: { a: true, carga: ['imprenta', 'harina'] }, resources: { agua: 18 }, party: { mari: { health: 78 } } };
    expect(evalCondition('flags.a == true', ctx)).toBe(true);
    expect(evalCondition('resources.agua >= 12 && party.mari.health > 40', ctx)).toBe(true);
    expect(evalCondition("flags.carga includes 'imprenta'", ctx)).toBe(true);
    expect(evalCondition("!(flags.carga includes 'organo')", ctx)).toBe(true);
    expect(evalCondition('flags.inexistente == null', ctx)).toBe(true);
    expect(evalCondition('', ctx)).toBe(true);
  });

  it('evalúa las condiciones reales de los triggers del nivel', () => {
    const g = fresh();
    expect(g.flags.eval("progress.day == 1 && progress.turn == 'amanecer'")).toBe(true);
    expect(g.flags.eval('flags.n1_cajones_bajados >= 6')).toBe(false);
    g.flags.set('n1_cajones_bajados', 8);
    expect(g.flags.eval('flags.n1_cajones_bajados >= 6')).toBe(true);
  });
});

describe('integridad del contenido', () => {
  it('todo trigger con diálogo apunta a un diálogo que existe', () => {
    for (const t of registry.level('nivel-01').triggers) {
      if (t.action?.dialogue) expect(() => registry.dialogue(t.action.dialogue)).not.toThrow();
      if (t.action?.choice) expect(() => registry.choiceScreen(t.action.choice)).not.toThrow();
    }
  });

  it('hay exactamente 8 bultos y la capacidad es 5', () => {
    expect(registry.bultos).toHaveLength(8);
    expect(registry.levelBalance('nivel-01').cargoDecision.capacity).toBe(5);
  });

  it('toda ficha del códice declara qué está dramatizado', () => {
    for (const c of registry.codex) {
      expect(c.documented.length).toBeGreaterThan(40);
      expect(c.dramatized.length).toBeGreaterThan(3);
    }
  });
});

describe('LanguageSystem', () => {
  it('en nivel 3 no enmascara nada', () => {
    const g = fresh();
    expect(g.lang.render('Hay agua a tres días', 'cym')).toBe('Hay agua a tres días');
  });

  it('en nivel 0 tapa casi todo pero deja los números', () => {
    const g = fresh();
    g.state.languages.aon = 0;
    const out = g.lang.render('Hay agua a 3 dias', 'aon');
    expect(out).toContain('▓');
    expect(out).toContain('3');
  });

  it('es determinista: la misma palabra se entiende siempre igual', () => {
    const g = fresh();
    g.state.languages.aon = 1;
    const a = g.lang.render('el agua esta cerca del cerro', 'aon');
    const b = g.lang.render('el agua esta cerca del cerro', 'aon');
    expect(a).toBe(b);
  });
});
