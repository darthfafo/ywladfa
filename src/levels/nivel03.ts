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

/** el cuerpo sólido de un rancho (px de mundo): la planta de 3×3 casillas, sin las aleros */
const RANCHO_SOLID = { w: 40, h: 30 };
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
 * - la crecida (trig_n3_crecida) se lleva lo que quedó bajo (ConstructionSystem.flood).
 */
export class Nivel03Script implements LevelScript {
  readonly campZone = 'z1_fuerte';
  private readonly cons: ConstructionSystem;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private ghostOk: Phaser.GameObjects.Image | null = null;
  private ghostBad: Phaser.GameObjects.Image | null = null;
  /** dónde iría el rancho ahora (esquina de arriba a la izquierda, en casillas) */
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
    this.ghostOk = scene.add.image(0, 0, 'prop_rancho_ok').setDepth(9).setVisible(false);
    this.ghostBad = scene.add.image(0, 0, 'prop_rancho_mal').setDepth(9).setVisible(false);
    // la crecida: el agua baja sobre lo construido antes de que se abra su diálogo
    busOn(scene, 'trigger:fired', ({ triggerId }) => {
      if (triggerId === 'trig_n3_crecida') this.flood();
    });
  }

  /** ¿Se puede construir ahora? (después de la bandera, si la familia no tiene rancho) */
  private get building(): boolean {
    return game.flags.is('n3_bandera') && !game.flags.is('n3_tiene_rancho') && !game.flags.is('n3_acto1');
  }

  /** La esquina del rancho (3×3) delante del jugador, según hacia dónde mira. */
  private aim(): { x: number; y: number } {
    const p = this.host.player;
    const tx = toTile(p.x);
    const ty = toTile(p.y + 8);
    switch (this.host.facing()) {
      // con una casilla de aire entre el jugador y el rancho: si no, la figura lo tapa
      case 'north':
        return { x: tx - 1, y: ty - 4 };
      case 'south':
        return { x: tx - 1, y: ty + 2 };
      case 'east':
        return { x: tx + 2, y: ty - 2 };
      default:
        return { x: tx - 4, y: ty - 2 };
    }
  }

  freeAction(): { label: string; run: () => void } | null {
    if (!this.building) return null;
    const { x, y } = this.target;
    const can = this.cons.canPlace('rancho', x, y);
    const cost = this.cons.cost('rancho', x, y);
    return {
      label: can.ok ? `Rancho acá · ${cost.turnos} turnos` : 'Rancho acá',
      run: () => this.build(x, y),
    };
  }

  update(): void {
    if (!this.ghostOk || !this.ghostBad) return;
    const on = this.building;
    if (!on) {
      this.ghostOk.setVisible(false);
      this.ghostBad.setVisible(false);
      return;
    }
    this.target = this.aim();
    const ok = this.cons.canPlace('rancho', this.target.x, this.target.y).ok && this.enoughMaterial();
    const c = center(this.target.x, this.target.y, this.size('rancho'));
    this.ghostOk.setPosition(c.x, c.y).setVisible(ok);
    this.ghostBad.setPosition(c.x, c.y).setVisible(!ok);
  }

  private enoughMaterial(): boolean {
    return game.res.get('materiales') >= this.cons.cost('rancho').materiales;
  }

  private build(x: number, y: number): void {
    const can = this.cons.canPlace('rancho', x, y);
    if (!can.ok) {
      bus.emit('ui:pc-says', { text: can.reason === 'Ese terreno no sirve para esto.' ? 'Acá no se puede levantar nada.' : (can.reason ?? 'Acá no.') });
      return;
    }
    const cost = this.cons.cost('rancho', x, y);
    if (game.res.get('materiales') < cost.materiales) {
      bus.emit('ui:pc-says', { text: `Me falta material: barro y junco de la orilla. Necesito ${cost.materiales}.` });
      return;
    }
    game.res.change('materiales', -cost.materiales, 'rancho');
    this.cons.place('rancho', x, y);
    this.addSprite('rancho', x, y);
    sfx.knock();
    // dónde quedó: lo usan el diálogo, el diario y la crecida
    const cell = this.cons.cell(x, y)!;
    game.flags.setMany({
      n3_tiene_rancho: true,
      n3_rancho_lugar: cell.kind,
      n3_dia_rancho: game.state.progress.day,
      n3_obras: this.obras(),
    });
    bus.emit('ui:toast', { text: `Rancho levantado: ${cost.turnos} turnos de trabajo.` });
    // el trabajo lleva su tiempo (puede caer la noche)
    game.spendTurns(cost.turnos);
    this.host.checkTriggers();
  }

  private addSprite(kind: PieceKind, x: number, y: number): void {
    if (kind !== 'rancho' && kind !== 'corral') return;
    const c = center(x, y, this.size(kind));
    const s = this.host.scene.add.image(c.x, c.y, `prop_${kind}`).setDepth(9);
    this.host.solid(s, RANCHO_SOLID.w, RANCHO_SOLID.h);
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
    const stillHas = this.cons.placed.some((p) => p.kind === 'rancho');
    game.flags.setMany({
      n3_crecida: true,
      n3_dia_crecida: game.state.progress.day,
      n3_rancho_perdido: lost.some((p) => p.kind === 'rancho'),
      n3_tiene_rancho: stillHas,
      n3_obras: this.obras(),
    });
    if (lost.length) sfx.thunder();
  }
}
