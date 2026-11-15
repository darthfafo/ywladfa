import Phaser from 'phaser';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import { sfx } from '@/audio/Sfx';
import { ConstructionSystem, type ConstructionConfig, type PieceKind } from '@/systems/ConstructionSystem';
import { busOn } from '@/util/scoped';
import { toTile } from '@/util/grid';
import { chacraRects, valleyGrid } from '@/util/mapgen';
import { makeRect } from '@/util/textures';
import { PAL } from '@/config';
import { TURNS } from '@/systems/TimeSystem';
import type { Interactable, LevelScript, WorldHost } from './LevelScript';

/** el cuerpo sólido de cada obra (px de mundo): la planta, sin los aleros */
const SOLID: Partial<Record<PieceKind, { w: number; h: number }>> = {
  rancho: { w: 40, h: 30 },
  corral: { w: 56, h: 26 },
};
/** lo que dice el botón para cada obra */
const LABEL: Partial<Record<PieceKind, string>> = { rancho: 'Rancho acá', corral: 'Corral acá' };
/** la jornada en que pasó cada cosa (el diario la necesita: quests con dayFlag) */
const DAY_OF: Record<string, string> = {
  n3_viveres: 'n3_dia_viveres',
  n3_invierno: 'n3_dia_invierno',
  n3_trato: 'n3_dia_trato',
  n3_gwilym: 'n3_dia_gwilym',
  n3_cuidado: 'n3_dia_cuidado',
  n3_gwilym_fin: 'n3_dia_gwilym_fin',
  n3_acto2: 'n3_dia_acto2',
  n3_1867: 'n3_dia_1867',
  n3_zanja: 'n3_dia_zanja',
  n3_inundo_vecinos: 'n3_dia_inundo',
  n3_regada: 'n3_dia_regada',
  n3_cosecha: 'n3_dia_cosecha',
};
/** un paso hacia donde mira el jugador */
const STEP: Record<'north' | 'south' | 'east' | 'west', [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
/** las chacras que importan para el riego (data: map.chacras[].id) */
const FAMILIA = 'chacra_familia';
const VECINOS = 'chacra_vecinos';
/** el toldo, a la espalda del hombre que trata (casillas respecto de su spawn) */
const TOLDO_FROM_NPC = { x: -3, y: -1 };
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
 * - después de la escena de Murga, la bandera queda en el mástil del fuerte;
 * - acto II (invierno de 1866): al pasar el verano, la comida del invierno (lo que
 *   haya en el depósito); el toldo junto al fuerte desde que llegan; lo que quedó
 *   atrás (harina, abrigo) como flags para los triggers; el coro del entierro;
 * - acto III (XI-1867): la zanja se cava de a un tramo («Cavar acá», un turno),
 *   desde una toma pegada al río; el agua corre por donde el terreno la deja
 *   (ConstructionSystem.water) y se ve; la compuerta la hace entrar a una chacra;
 *   sin compuerta, al lado de la chacra baja de los vecinos, la inunda. Quien
 *   ayudó a los Jenkins ve antes de cavar si el agua va a llegar (wouldFlow).
 */
export class Nivel03Script implements LevelScript {
  readonly campZone = 'z1_fuerte';
  private readonly cons: ConstructionSystem;
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private ghosts: Partial<Record<PieceKind, { ok: Phaser.GameObjects.Image; bad: Phaser.GameObjects.Image }>> = {};
  private flag: Phaser.GameObjects.Image | null = null;
  private toldo: Phaser.GameObjects.Image | null = null;
  /** cada tramo de zanja: seco o con agua (dos dibujos, se prende uno) */
  private readonly tramos = new Map<number, { seca: Phaser.GameObjects.Image; agua: Phaser.GameObjects.Image }>();
  private zghost: Record<'ok' | 'mal' | 'lee', Phaser.GameObjects.Image> | null = null;
  /** la casilla delante del jugador (la zanja se cava de a una) */
  private ztarget = { x: 0, y: 0 };
  private dichoCompuerta = false;
  /** cada chacra: seca y regada (dos dibujos, se prende uno) */
  private readonly chacras = new Map<string, Record<'seca' | 'regada' | 'inundada', Phaser.GameObjects.Image>>();
  /** lo que pesa de lo que quedó atrás */
  private readonly sin: { harina: boolean; abrigo: boolean; labranza: boolean };
  /** dónde iría la obra ahora (esquina de arriba a la izquierda, en casillas) */
  private target = { x: 0, y: 0 };

  constructor(private readonly host: WorldHost) {
    const b = registry.levelBalance('nivel-03');
    // lo que pesa de lo que quedó atrás: en la playa (Nivel 1) o en la estepa (Nivel 2)
    const taken = (game.flags.get('n1_carga') as string[] | undefined) ?? null;
    const dropped = (game.flags.get('n2_bultos_dejados') as string[] | undefined) ?? [];
    const without = (id: string): boolean => (taken !== null && !taken.includes(id)) || dropped.includes(id);
    this.sin = { harina: without('harina'), abrigo: without('abrigo'), labranza: without('labranza') };
    this.cons = new ConstructionSystem(b.construccion as ConstructionConfig, valleyGrid(game.level), {
      sinHierro: without('hierro'),
      sinLabranza: without('labranza'),
    });
  }

  spawn(): void {
    const scene = this.host.scene;
    // lo que quedó en la playa o en la estepa, para los triggers del invierno
    game.flags.setMany({ n3_sin_harina: this.sin.harina, n3_sin_abrigo: this.sin.abrigo, n3_sin_labranza: this.sin.labranza });
    // lo ya construido (la partida guardada)
    for (const o of (game.flags.get('n3_obras') as string[] | undefined) ?? []) {
      const [kind, x, y] = o.split(':');
      if (this.cons.place(kind as PieceKind, Number(x), Number(y)).ok) this.addSprite(kind as PieceKind, Number(x), Number(y));
    }
    this.drawChacras();
    this.zghost = {
      ok: scene.add.image(0, 0, 'prop_zanja_ok').setDepth(4).setVisible(false),
      mal: scene.add.image(0, 0, 'prop_zanja_mal').setDepth(4).setVisible(false),
      lee: scene.add.image(0, 0, 'prop_zanja_lee').setDepth(4).setVisible(false),
    };
    if (this.cons.placed.some((p) => p.kind === 'zanja')) this.refreshWater(false);
    for (const k of ['rancho', 'corral'] as const) {
      this.ghosts[k] = {
        ok: scene.add.image(0, 0, `prop_${k}_ok`).setDepth(9).setVisible(false),
        bad: scene.add.image(0, 0, `prop_${k}_mal`).setDepth(9).setVisible(false),
      };
    }
    // lo que ya estaba en pie al cargar (la bandera, el toldo): no esperar a que el control quede libre
    if (game.flags.is('n3_bandera')) this.raiseFlag();
    if (game.flags.is('n3_toldo')) this.pitchToldo();
    // la crecida: el agua baja sobre lo construido antes de que se abra su diálogo
    busOn(scene, 'trigger:fired', ({ triggerId }) => {
      if (triggerId === 'trig_n3_crecida') this.flood();
    });
    busOn(scene, 'flag:set', ({ key }) => {
      // la jornada en que pasó, la primera vez
      const day = DAY_OF[key];
      if (day && game.flags.get(day) == null) game.flags.set(day, game.state.progress.day);
      // el entierro: el coro, una de las tres veces de la campaña (GDD §9)
      if (key === 'n3_coro') sfx.choir();
      // el toldo aparece mientras se cuenta que lo arman, no después
      if (key === 'n3_toldo' && !this.toldo) this.pitchToldo();
    });
  }

  onDialogueEnd(dialogueId: string): void {
    // pasó el verano y la cosecha se perdió: el invierno arranca con poco, más lo guardado en septiembre
    if (dialogueId === 'd_n3_invierno') {
      const base = (registry.levelBalance('nivel-03').invierno as { comida: number }).comida;
      const reserva = Number(game.flags.get('n3_reserva_comida') ?? 0);
      game.res.change('comida', base + reserva - game.res.get('comida'), 'el invierno');
    }
    if (dialogueId === 'd_n3_regada') this.finishRiego();
  }

  /** Las jornadas de más sin herramientas de labranza (items.json: la promesa) y, después, a esperar la cosecha. */
  private finishRiego(): void {
    const extra = this.cons.extraJornadasZanja;
    const perDay = game.level.schedule.turnsPerDay;
    // primero el flag: las noches de abajo guardan, y sin él la cosecha no llegaba nunca
    game.flags.set('n3_regada_lista', true);
    for (let d = 0; d < extra; d++) game.spendTurns(perDay);
    this.host.checkTriggers();
  }

  /** El fogón del campamento: descansar hasta la mañana siguiente. */
  label(it: Interactable): string | undefined {
    return it.kind === 'fogon' ? 'Descansar' : undefined;
  }

  /**
   * Descansar junto al fuego: pasa el tiempo hasta el amanecer (corre la noche, que
   * guarda). Sin esto, con el rancho hecho y nada más que hacer, la jornada no
   * avanzaba y lo que espera a otro día (la crecida) no llegaba nunca.
   */
  interact(it: Interactable): boolean {
    if (it.kind !== 'fogon') return false;
    const left = game.level.schedule.turnsPerDay - TURNS.indexOf(game.state.progress.turn);
    game.spendTurns(left);
    this.host.checkTriggers();
    return true;
  }

  refusal(npcId: string): string | undefined {
    // después del trato, el del toldo saluda en su lengua (para el jugador, bloques)
    if (npcId === 'npc_toldo') return game.lang.render('Cuando apriete el frío.', 'aon');
    return undefined;
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

  /** ¿Es la hora de cavar? (desde la idea de Rachel hasta que el agua entra a la chacra) */
  private get digging(): boolean {
    return game.flags.is('n3_zanja') && !game.flags.is('n3_regada');
  }

  /** La chacra pegada a (x, y), si hay. */
  private chacraNextTo(x: number, y: number): string | null {
    for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
      const c = this.cons.cell(a, b);
      if (c?.chacra) return c.chacra;
    }
    return null;
  }

  private hasCompuerta(x: number, y: number): boolean {
    return this.cons.placed.some((p) => p.kind === 'compuerta' && p.x === x && p.y === y);
  }

  private zanjaAction(): { label: string; run: () => void } {
    const { x, y } = this.ztarget;
    const here = this.cons.pieceAt(x, y);
    if (here?.kind === 'zanja' && this.chacraNextTo(x, y) && !this.hasCompuerta(x, y)) return { label: 'Compuerta acá', run: () => this.dig('compuerta', x, y) };
    const can = this.cons.canPlace('zanja', x, y);
    const t = this.cons.cost('zanja', x, y).turnos;
    return { label: can.ok ? `Cavar acá · ${t} ${t === 1 ? 'turno' : 'turnos'}` : 'Cavar acá', run: () => this.dig('zanja', x, y) };
  }

  freeAction(): { label: string; run: () => void } | null {
    if (this.digging) return this.zanjaAction();
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
    // la bandera en el mástil, desde la escena de Murga
    if (!this.flag && game.flags.is('n3_bandera')) this.raiseFlag();
    // el toldo, desde que llegaron (abril de 1866)
    if (!this.toldo && game.flags.is('n3_toldo')) this.pitchToldo();
    this.updateZanjaGhost();
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

  private updateZanjaGhost(): void {
    const g = this.zghost;
    if (!g) return;
    for (const im of Object.values(g)) im.setVisible(false);
    if (!this.digging) return;
    const p = this.host.player;
    const [dx, dy] = STEP[this.host.facing()];
    this.ztarget = { x: toTile(p.x) + dx, y: toTile(p.y + 8) + dy };
    const { x, y } = this.ztarget;
    const cx = (x + 0.5) * 16;
    const cy = (y + 0.5) * 16;
    // sobre un tramo pegado a una chacra: la compuerta
    if (this.cons.pieceAt(x, y)?.kind === 'zanja') {
      if (this.chacraNextTo(x, y) && !this.hasCompuerta(x, y)) g.ok.setPosition(cx, cy).setVisible(true);
      return;
    }
    const ok = this.cons.canPlace('zanja', x, y).ok;
    // quien cavó con Rachel lee el terreno: azul si el agua va a llegar ahí
    const reads = game.flags.is('n3_lee_terreno');
    const im = !ok ? g.mal : reads && this.cons.wouldFlow(x, y) ? g.lee : g.ok;
    im.setPosition(cx, cy).setVisible(true);
  }

  /** Cavar un tramo o poner una compuerta. */
  private dig(kind: 'zanja' | 'compuerta', x: number, y: number): void {
    const can = this.cons.canPlace(kind, x, y);
    if (!can.ok) {
      bus.emit('ui:pc-says', { text: can.reason ?? 'Acá no.' });
      return;
    }
    const cost = this.cons.cost(kind, x, y);
    if (game.res.get('materiales') < cost.materiales) {
      bus.emit('ui:pc-says', { text: `Para la compuerta hace falta barro y junco de la orilla: ${cost.materiales}.` });
      return;
    }
    if (cost.materiales) game.res.change('materiales', -cost.materiales, kind);
    this.cons.place(kind, x, y);
    sfx.knock();
    if (kind === 'zanja') this.addTramo(x, y);
    else this.addCompuerta(x, y);
    game.flags.set('n3_obras', this.obras());
    this.refreshWater(true, x, y);
    game.spendTurns(cost.turnos);
    this.host.checkTriggers();
  }

  /** Las chacras se ven (tierra arada con estacas); al regarse, se ponen verdes. */
  private drawChacras(): void {
    const scene = this.host.scene;
    for (const c of chacraRects(game.level)) {
      const key = `prop_chacra_${c.w}x${c.h}`;
      makeRect(scene, key, c.w * 16, c.h * 16, PAL.clay, PAL.clayLight);
      makeRect(scene, `${key}_regada`, c.w * 16, c.h * 16, PAL.soil, PAL.moss);
      makeRect(scene, `${key}_inundada`, c.w * 16, c.h * 16, PAL.seaLight, PAL.soil);
      const x = (c.x + c.w / 2) * 16;
      const y = (c.y + c.h / 2) * 16;
      this.chacras.set(c.id, {
        seca: scene.add.image(x, y, key).setDepth(2),
        regada: scene.add.image(x, y, `${key}_regada`).setDepth(2).setVisible(false),
        inundada: scene.add.image(x, y, `${key}_inundada`).setDepth(2).setVisible(false),
      });
    }
  }

  private addTramo(x: number, y: number): void {
    const scene = this.host.scene;
    const cx = (x + 0.5) * 16;
    const cy = (y + 0.5) * 16;
    this.tramos.set(y * this.cons.grid.w + x, {
      seca: scene.add.image(cx, cy, 'prop_zanja_seca').setDepth(3),
      agua: scene.add.image(cx, cy, 'prop_zanja_agua').setDepth(3).setVisible(false),
    });
  }

  private addCompuerta(x: number, y: number): void {
    this.host.scene.add.image((x + 0.5) * 16, (y + 0.5) * 16, 'prop_compuerta').setDepth(5);
  }

  /** Por dónde corre el agua ahora: se ve, y lo que riega o inunda queda en la partida. */
  private refreshWater(say: boolean, x?: number, y?: number): void {
    const w = this.cons.water();
    for (const [k, t] of this.tramos) {
      t.agua.setVisible(w.wet.has(k));
      t.seca.setVisible(!w.wet.has(k));
    }
    for (const [id, c] of this.chacras) {
      const estado = w.irrigated.has(id) ? 'regada' : w.flooded.has(id) ? 'inundada' : 'seca';
      for (const k of ['seca', 'regada', 'inundada'] as const) c[k].setVisible(k === estado);
    }
    const f = game.flags;
    if (w.flooded.has(VECINOS) && !f.is('n3_inundo_vecinos')) f.set('n3_inundo_vecinos', true);
    if (w.irrigated.has(VECINOS) && !f.is('n3_riega_vecinos')) f.set('n3_riega_vecinos', true);
    if (w.irrigated.has(FAMILIA) && !f.is('n3_regada')) f.set('n3_regada', true);
    if (!say || x === undefined || y === undefined) return;
    const k = y * this.cons.grid.w + x;
    if (w.dry.has(k)) bus.emit('ui:pc-says', { text: 'Hasta acá el agua no llega: el terreno sube.' });
    else if (!this.dichoCompuerta && !w.irrigated.has(FAMILIA) && this.chacraNextTo(x, y) === FAMILIA && w.wet.has(k)) {
      this.dichoCompuerta = true;
      bus.emit('ui:pc-says', { text: 'El agua pasa al lado de la chacra, pero no entra. Falta la compuerta.' });
    }
  }

  /** La bandera, en el mástil viejo del fuerte (decor «fuerte», render3d: mudFort pone el palo ahí). */
  private raiseFlag(): void {
    const fort = game.level.spawns.decor?.find((d) => d.id === 'fuerte');
    if (!fort) return;
    // el palo del fuerte está 1,6 casillas al este del centro (marchModels.mudFort)
    this.flag = this.host.scene.add.image((fort.x + 0.5 + 1.7) * 16, (fort.y + 0.5) * 16, 'prop_bandera').setDepth(8);
  }

  /** El toldo de cuero de los cuatro que llegan, al oeste del fuerte, con sus caballos (render3d: marchModels.toldoCamp). */
  private pitchToldo(): void {
    const at = game.level.spawns.npcs.find((n) => n.id === 'npc_toldo');
    if (!at) return;
    const x = at.x + TOLDO_FROM_NPC.x;
    const y = at.y + TOLDO_FROM_NPC.y;
    this.toldo = this.host.scene.add.image((x + 0.5) * 16, (y + 0.5) * 16, 'prop_toldo').setDepth(8);
    this.host.solid(this.toldo, 40, 20);
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
    if (kind === 'zanja') return this.addTramo(x, y);
    if (kind === 'compuerta') return this.addCompuerta(x, y);
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
