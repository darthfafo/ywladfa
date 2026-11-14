import Phaser from 'phaser';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import { sfx } from '@/audio/Sfx';
import { ConstructionSystem, type ConstructionConfig, type PieceKind } from '@/systems/ConstructionSystem';
import { busOn } from '@/util/scoped';
import { toTile } from '@/util/grid';
import { valleyGrid } from '@/util/mapgen';
import type { LevelScript, WorldHost } from './LevelScript';

/** el cuerpo sólido de cada obra (px de mundo): la planta, sin los aleros */
const SOLID: Partial<Record<PieceKind, { w: number; h: number }>> = {
  rancho: { w: 40, h: 30 },
  corral: { w: 56, h: 26 },
};
/** lo que dice el botón para cada obra */
const LABEL: Partial<Record<PieceKind, string>> = { rancho: 'Rancho acá', corral: 'Corral acá' };
/** centro de una pieza de `size` casillas con esquina en (x, y), en px de mundo */
const center = (x: number, y: number, size: [number, number]): { x: number; y: number } => ({ x: (x + size[0] / 2) * 16, y: (y + size[1] / 2) * 16 });

/**
 * El guion del Nivel 3 — El valle (en armado: el acto I, IX-1865). La bandera de
 * Murga va por datos (triggers, diálogos); acá vive lo que se construye:
 * - con material (barro y junco de la orilla), el botón de acción ofrece «Rancho
 *   acá» frente al jugador, con una vista previa verde (se puede) o rojiza (no);
 * - levantarlo cuesta materiales y turnos (más turnos cuanto más lejos del río:
 *   el barro hay que acarrearlo);
 * - lo construido se recuerda en la partida (flag `n3_obras`);
 * - la crecida (trig_n3_crecida) se lleva lo que quedó bajo (ConstructionSystem.flood);
 * - si se eligió rehacer el corral de todos, también se construye;
 * - después de la escena de Murga, la bandera queda en el mástil del fuerte.
 */
export class Nivel03Script implements LevelScript {
  readonly campZone = 'z1_fuerte';
  private readonly cons: ConstructionSystem;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private ghosts: Partial<Record<PieceKind, { ok: Phaser.GameObjects.Image; bad: Phaser.GameObjects.Image }>> = {};
  private flag: Phaser.GameObjects.Image | null = null;
  /** dónde iría la obra ahora (esquina de arriba a la izquierda, en casillas) */
  private target = { x: 0, y: 0 };

  constructor(private readonly host: WorldHost) {
    const b = registry.levelBalance('nivel-03');
    // lo que pesa de lo que quedó atrás: en la playa (Nivel 1) o en la estepa (Nivel 2)
    const taken = (game.flags.get('n1_carga') as string[] | undefined) ?? null;
    const dropped = (game.flags.get('n2_bultos_dejados') as string[] | undefined) ?? [];
    const without = (id: string): boolean => (taken !== null && !taken.includes(id)) || dropped.includes(id);
    this.cons = new ConstructionSystem(b.construccion as ConstructionConfig, valleyGrid(game.level), {
      sinHierro: without('hierro'),
      sinLabranza: without('labranza'),
    });
  }

  spawn(): void {
    const scene = this.host.scene;
    // lo ya construido (la partida guardada)
    for (const o of (game.flags.get('n3_obras') as string[] | undefined) ?? []) {
      const [kind, x, y] = o.split(':');
      if (this.cons.place(kind as PieceKind, Number(x), Number(y)).ok) this.addSprite(kind as PieceKind, Number(x), Number(y));
    }
    for (const k of ['rancho', 'corral'] as const) {
      this.ghosts[k] = {
        ok: scene.add.image(0, 0, `prop_${k}_ok`).setDepth(9).setVisible(false),
        bad: scene.add.image(0, 0, `prop_${k}_mal`).setDepth(9).setVisible(false),
      };
    }
    // la crecida: el agua baja sobre lo construido antes de que se abra su diálogo
    busOn(scene, 'trigger:fired', ({ triggerId }) => {
      if (triggerId === 'trig_n3_crecida') this.flood();
    });
  }

  /** Qué obra toca ahora: el corral, si se eligió rehacerlo; si no, el rancho que falte. */
  private get job(): PieceKind | null {
    const f = game.flags;
    if (!f.is('n3_bandera') || f.is('n3_acto1')) return null;
    if (f.get('n3_rehacer') === 'corral' && !f.is('n3_tiene_corral')) return 'corral';
    if (!f.is('n3_tiene_rancho')) return 'rancho';
    return null;
  }

  /** La esquina de la obra delante del jugador, según hacia dónde mira, con una casilla de aire (si no, la figura la tapa). */
  private aim(kind: PieceKind): { x: number; y: number } {
    const [w, h] = this.size(kind);
    const p = this.host.player;
    const tx = toTile(p.x);
    const ty = toTile(p.y + 8);
    switch (this.host.facing()) {
      case 'north':
        return { x: tx - Math.floor(w / 2), y: ty - 1 - h };
      case 'south':
        return { x: tx - Math.floor(w / 2), y: ty + 2 };
      case 'east':
        return { x: tx + 2, y: ty - Math.floor(h / 2) - 1 };
      default:
        return { x: tx - 1 - w, y: ty - Math.floor(h / 2) - 1 };
    }
  }

  freeAction(): { label: string; run: () => void } | null {
    const kind = this.job;
    if (!kind) return null;
    const { x, y } = this.target;
    const can = this.cons.canPlace(kind, x, y);
    const cost = this.cons.cost(kind, x, y);
    return {
      label: can.ok ? `${LABEL[kind]} · ${cost.turnos} turnos` : LABEL[kind]!,
      run: () => this.build(kind, x, y),
    };
  }

  update(): void {
    // jornada en que llegaron los víveres (el diario la necesita)
    if (game.flags.get('n3_viveres') && game.flags.get('n3_dia_viveres') == null) game.flags.set('n3_dia_viveres', game.state.progress.day);
    // la bandera en el mástil, desde la escena de Murga
    if (!this.flag && game.flags.is('n3_bandera')) this.raiseFlag();
    const kind = this.job;
    for (const [k, g] of Object.entries(this.ghosts)) {
      if (k === kind) continue;
      g.ok.setVisible(false);
      g.bad.setVisible(false);
    }
    if (!kind) return;
    const g = this.ghosts[kind]!;
    this.target = this.aim(kind);
    const ok = this.cons.canPlace(kind, this.target.x, this.target.y).ok && game.res.get('materiales') >= this.cons.cost(kind).materiales;
    const c = center(this.target.x, this.target.y, this.size(kind));
    g.ok.setPosition(c.x, c.y).setVisible(ok);
    g.bad.setPosition(c.x, c.y).setVisible(!ok);
  }

  /** La bandera, en el mástil viejo del fuerte (decor «fuerte», render3d: mudFort pone el palo ahí). */
  private raiseFlag(): void {
    const fort = game.level.spawns.decor?.find((d) => d.id === 'fuerte');
    if (!fort) return;
    // el palo del fuerte está 1,6 casillas al este del centro (marchModels.mudFort)
    this.flag = this.host.scene.add.image((fort.x + 0.5 + 1.7) * 16, (fort.y + 0.5) * 16, 'prop_bandera').setDepth(8);
  }

  private build(kind: PieceKind, x: number, y: number): void {
    const can = this.cons.canPlace(kind, x, y);
    if (!can.ok) {
      bus.emit('ui:pc-says', { text: can.reason === 'Ese terreno no sirve para esto.' ? 'Acá no se puede levantar nada.' : (can.reason ?? 'Acá no.') });
      return;
    }
    const cost = this.cons.cost(kind, x, y);
    if (game.res.get('materiales') < cost.materiales) {
      bus.emit('ui:pc-says', { text: `Me falta material: barro y junco de la orilla. Necesito ${cost.materiales}.` });
      return;
    }
    game.res.change('materiales', -cost.materiales, kind);
    this.cons.place(kind, x, y);
    this.addSprite(kind, x, y);
    sfx.knock();
    // dónde quedó: lo usan el diálogo, el diario y la crecida
    const cell = this.cons.cell(x, y)!;
    game.flags.setMany(
      kind === 'rancho'
        ? { n3_tiene_rancho: true, n3_rancho_lugar: cell.kind, n3_dia_rancho: game.state.progress.day, n3_obras: this.obras() }
        : { n3_tiene_corral: true, n3_dia_corral: game.state.progress.day, n3_obras: this.obras() },
    );
    bus.emit('ui:toast', { text: `${kind === 'rancho' ? 'Rancho' : 'Corral'} levantado: ${cost.turnos} turnos de trabajo.` });
    // el trabajo lleva su tiempo (puede caer la noche)
    game.spendTurns(cost.turnos);
    this.host.checkTriggers();
  }

  private addSprite(kind: PieceKind, x: number, y: number): void {
    const solid = SOLID[kind];
    if (!solid) return;
    const c = center(x, y, this.size(kind));
    const s = this.host.scene.add.image(c.x, c.y, `prop_${kind}`).setDepth(9);
    this.host.solid(s, solid.w, solid.h);
    this.sprites.set(`${kind}:${x}:${y}`, s);
  }

  private size(kind: PieceKind): [number, number] {
    return (registry.levelBalance('nivel-03').construccion as ConstructionConfig).pieces[kind].size;
  }

  private obras(): string[] {
    return this.cons.placed.map((p) => `${p.kind}:${p.x}:${p.y}`);
  }

  /** La crecida de 1865: se lleva lo que quedó bajo. */
  private flood(): void {
    const level = (registry.levelBalance('nivel-03').crecida as { level: number }).level;
    const lost = this.cons.flood(level);
    for (const p of lost) {
      const key = `${p.kind}:${p.x}:${p.y}`;
      this.sprites.get(key)?.destroy();
      this.sprites.delete(key);
    }
    game.flags.setMany({
      n3_crecida: true,
      n3_dia_crecida: game.state.progress.day,
      n3_rancho_perdido: lost.some((p) => p.kind === 'rancho'),
      n3_tiene_rancho: this.cons.placed.some((p) => p.kind === 'rancho'),
      n3_tiene_corral: this.cons.placed.some((p) => p.kind === 'corral'),
      n3_obras: this.obras(),
    });
    if (lost.length) sfx.thunder();
  }
}
