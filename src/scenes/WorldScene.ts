import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { PasajeDef, TriggerDef } from '@/core/types';
import { TriggerSystem } from '@/systems/TriggerSystem';
import { TURNS } from '@/systems/TimeSystem';
import { tileCenter, toTile } from '@/util/grid';
import { input } from '@/util/input';
import { baseTerrain, buildTerrain, cellVariant, COLLIDES, TERRAIN, TERRAIN_SPEED, tileIndex, zoneAt } from '@/util/mapgen';
import type { HatStyle } from '@/util/textures';
import { FACING_FRAME, makeCharacter, makeProps, makeTileset } from '@/util/textures';

interface Interactable {
  sprite: Phaser.GameObjects.Image;
  kind: 'cajon' | 'npc' | 'jarilla' | 'pila' | 'cueva' | 'fogon';
  id: string;
  label: string;
}

/** Ropa de colono: negros y marrones, nada de colores vivos (docs/04-guia-historica.md). */
const NPC_COLORS: Record<string, [number, number, HatStyle]> = {
  npc_lewis: [PAL.ink2, PAL.ink, 'copa'],
  npc_edwyn: [PAL.soil, PAL.soil2, 'boina'],
  npc_matthews: [PAL.ink, PAL.bone, 'copa'],
  npc_berwyn: [PAL.soil2, PAL.sandLight, 'copa'],
  npc_pepperell: [PAL.slate, PAL.bone, 'copa'],
  npc_mari: [PAL.clayDark, PAL.clayPale, 'boina'],
  npc_dafydd: [PAL.soil2, PAL.coiron, 'boina'],
};

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private terrain: number[][] = [];
  private interactables: Interactable[] = [];
  private triggers!: TriggerSystem;
  private lastTile = { x: -1, y: -1 };
  private facing: keyof typeof FACING_FRAME = 'north';
  private nearest: Interactable | null = null;
  private carriedCajones = 0;
  private gateOpen = new Map<string, boolean>();
  private mimosa: Phaser.GameObjects.Image | null = null;

  constructor() {
    super('World');
  }

  create(): void {
    const level = game.level;
    makeTileset(this);
    makeProps(this);
    makeCharacter(this, 'pc', PAL.clay, PAL.ink, 'boina');
    for (const [id, [body, hat, style]] of Object.entries(NPC_COLORS)) makeCharacter(this, id, body, hat, style);

    // ---- mapa (los pasajes con `requires` sin cumplir arrancan cerrados, como acantilado)
    for (const p of level.spawns.pasajes) {
      this.gateOpen.set(p.id, !p.requires || game.flags.eval(p.requires));
    }
    this.terrain = buildTerrain(level, (id) => this.gateOpen.get(id) ?? true);
    const map = this.make.tilemap({ data: this.terrain, tileWidth: VIEW.tile, tileHeight: VIEW.tile });
    const tileset = map.addTilesetImage('tiles', 'tiles', VIEW.tile, VIEW.tile, 0, 0)!;
    this.layer = map.createLayer(0, tileset, 0, 0)!;
    this.layer.setCollision(COLLIDES);

    // ---- jugador: la playa solo en la primera jornada — después el campamento es la base
    const sp = game.state.progress.day > 1 ? level.spawns.fogon : level.spawns.player;
    this.player = this.physics.add.sprite(tileCenter(sp.x), tileCenter(sp.y), 'pc', FACING_FRAME.north);
    this.player.setDepth(20);
    this.player.body!.setSize(10, 8);
    (this.player.body as Phaser.Physics.Arcade.Body).setOffset(3, 15);
    this.physics.add.collider(this.player, this.layer);

    this.spawnProps(level);

    // ---- cámara: viewport recortado a la franja del mundo (9:16)
    const cam = this.cameras.main;
    cam.setViewport(VIEW.world.x, VIEW.world.y, VIEW.world.w, VIEW.world.h);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setRoundPixels(true);
    cam.startFollow(this.player, true, level.camera.follow.lerpX, level.camera.follow.lerpY);
    cam.setDeadzone(48, 96);
    cam.setBackgroundColor(PAL.void);

    // ---- triggers
    this.triggers = new TriggerSystem(game, level.triggers as TriggerDef[]);
    bus.on('inventory:added', (p) => this.fireEventTriggers('inventory:added', p as never));
    bus.on('inventory:overloaded', (p) => this.fireEventTriggers('inventory:overloaded', p as never));
    bus.on('time:turn-advanced', () => {
      this.updateGates();
      this.updateNpcVisibility();
    });

    this.setupKeyboard();
    this.scene.launch('Ui');
    this.time.delayedCall(120, () => this.checkTriggers());
  }

  private spawnProps(level: typeof game.level): void {
    // el Mimosa, anclado frente a la costa hasta que zarpa (trig_vigia_mimosa)
    if (!game.flags.is('n1_vio_zarpar')) {
      this.mimosa = this.add.image(tileCenter(27), tileCenter(110), 'prop_mimosa').setDepth(7);
    }
    // cajones a bajar
    for (const [i, c] of level.spawns.cajones.entries()) {
      const s = this.add.image(tileCenter(c.x), tileCenter(c.y), 'prop_cajon').setDepth(10);
      this.interactables.push({ sprite: s, kind: 'cajon', id: `cajon_${i}`, label: 'Levantar' });
    }
    // la pila donde se dejan: tierra adentro, lejos de la marea — por eso hay que
    // bajarlos ahí y no dejarlos donde el bote los tiró, cerca del agua
    const pila = this.add
      .rectangle(tileCenter(27), tileCenter(97), 26, 14, PAL.soil2, 0.55)
      .setStrokeStyle(1, PAL.sandLight, 0.8)
      .setDepth(9);
    this.interactables.push({ sprite: pila as unknown as Phaser.GameObjects.Image, kind: 'pila', id: 'pila', label: 'Dejar' });

    // jarilla
    for (const n of level.spawns.gatherNodes) {
      if (n.type !== 'lena') continue;
      const s = this.add.image(tileCenter(n.x), tileCenter(n.y), 'prop_jarilla').setDepth(10);
      this.interactables.push({ sprite: s, kind: 'jarilla', id: n.id, label: 'Cortar' });
    }
    // fogón y cuevas
    const f = level.spawns.fogon;
    const fs = this.add.image(tileCenter(f.x), tileCenter(f.y), 'prop_fogon').setDepth(10);
    this.interactables.push({ sprite: fs, kind: 'fogon', id: 'fogon', label: 'Fogón' });
    for (const c of level.spawns.cuevas) {
      const s = this.add.image(tileCenter(c.x), tileCenter(c.y), 'prop_cueva').setDepth(8);
      this.interactables.push({ sprite: s, kind: 'cueva', id: c.id, label: 'Entrar' });
    }
    // NPCs
    for (const n of level.spawns.npcs) {
      const s = this.add.image(tileCenter(n.x), tileCenter(n.y), n.id, FACING_FRAME.south).setDepth(15);
      this.interactables.push({ sprite: s, kind: 'npc', id: n.id, label: 'Hablar' });
    }
    this.updateNpcVisibility();
  }

  /**
   * Los NPC no están siempre en el mismo lugar ni siempre presentes: `day` decide si
   * aparecen, `afterFlag` si ya se ganó verlos, `movesTo` si ya llegó el momento de
   * reubicarlos (ej. Dafydd, sentado junto al manantial desde la mañana de J2 — el
   * cañadón se puede pisar desde esa hora, así que no puede llegar más tarde que eso).
   */
  private updateNpcVisibility(): void {
    const day = game.state.progress.day;
    const turnIdx = TURNS.indexOf(game.state.progress.turn);
    for (const n of game.level.spawns.npcs) {
      const it = this.interactables.find((x) => x.kind === 'npc' && x.id === n.id);
      if (!it) continue;

      const dayOk = n.day === '*' || (Array.isArray(n.day) ? n.day.includes(day) : n.day === day);
      const flagOk = !n.afterFlag || game.flags.is(n.afterFlag);
      const visible = dayOk && flagOk;
      it.sprite.setVisible(visible).setActive(visible);

      const m = n.movesTo;
      const moved = m && (day > m.day || (day === m.day && turnIdx >= TURNS.indexOf(m.turn)));
      const pos = moved ? m! : n;
      it.sprite.setPosition(tileCenter(pos.x), tileCenter(pos.y));
    }
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-SPACE', () => !input.locked && input.pressAction());
    kb.on('keydown-E', () => !input.locked && input.pressAction());
  }

  override update(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (input.locked) {
      body.setVelocity(0, 0);
      return;
    }

    // teclado suma al vector táctil
    const kb = this.input.keyboard;
    let kx = 0;
    let ky = 0;
    if (kb) {
      const k = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
      if (k.A?.isDown || k.LEFT?.isDown) kx -= 1;
      if (k.D?.isDown || k.RIGHT?.isDown) kx += 1;
      if (k.W?.isDown || k.UP?.isDown) ky -= 1;
      if (k.S?.isDown || k.DOWN?.isDown) ky += 1;
    }
    const vx = kx !== 0 || ky !== 0 ? kx : input.x;
    const vy = kx !== 0 || ky !== 0 ? ky : input.y;

    const speed = this.currentSpeed();
    body.setVelocity(vx * speed, vy * speed);
    if (vx !== 0 || vy !== 0) {
      this.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'east' : 'west') : vy > 0 ? 'south' : 'north';
      this.player.setFrame(FACING_FRAME[this.facing]!);
    }

    this.updateNearest();
    if (input.takeAction()) this.interact();
    this.trackTile();
  }

  private currentSpeed(): number {
    const base = registry.balance.global.playerBaseSpeedPxPerSec as number;
    const tx = toTile(this.player.x);
    const ty = toTile(this.player.y + 8);
    const t = baseTerrain(this.terrain[ty]?.[tx] ?? tileIndex(TERRAIN.SAND_DRY, 0));
    const terrainMul = TERRAIN_SPEED[t] ?? 1;
    const zone = zoneAt(game.level, tx, ty);
    const zoneDef = game.level.zones.find((z) => z.id === zone?.id);
    const zoneMul = zoneDef?.speedModifier ?? 1;
    return base * terrainMul * zoneMul * game.inv.speedMultiplier();
  }

  private updateNearest(): void {
    let best: Interactable | null = null;
    let bestD = 30; // más margen que el ancho de un tile: cuesta menos alinearse con el pulgar
    for (const it of this.interactables) {
      if (!it.sprite.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y + 6, it.sprite.x, it.sprite.y);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (best !== this.nearest) {
      this.nearest = best;
      bus.emit('ui:action-context', { label: best ? best.label : null });
    }
  }

  private interact(): void {
    const it = this.nearest;
    if (!it) return;
    switch (it.kind) {
      case 'cajon':
        it.sprite.destroy();
        this.carriedCajones += 1;
        game.inv.add('cajon_provisiones', 1);
        break;
      case 'pila': {
        if (this.carriedCajones === 0) {
          bus.emit('ui:toast', { text: 'No estás cargando nada.' });
          return;
        }
        const n = this.carriedCajones;
        game.inv.remove('cajon_provisiones', n);
        this.carriedCajones = 0;
        const total = game.flags.inc('n1_cajones_bajados', n);
        bus.emit('ui:toast', { text: `Cajones bajados: ${total} de 8` });
        this.checkTriggers();
        break;
      }
      case 'jarilla':
        it.sprite.destroy();
        game.res.change('lena', 1, 'jarilla');
        bus.emit('ui:toast', { text: '+1 haz de leña' });
        break;
      case 'npc':
        this.talkTo(it.id);
        break;
      case 'fogon':
        bus.emit('ui:toast', { text: 'El fogón. Acá se pasa la noche.' });
        break;
      case 'cueva':
        this.runTriggerById('trig_eleccion_cueva');
        break;
    }
  }

  private talkTo(npcId: string): void {
    const t = game.level.triggers.find((tr) => tr.action?.dialogue && tr.action.dialogue.includes(shortName(npcId)));
    if (t && !this.triggers.hasFired(t.id) && game.flags.eval(t.requires)) {
      this.runTrigger(t as TriggerDef);
      return;
    }
    const npc = registry.npc(npcId);
    bus.emit('ui:toast', { text: `${npc.name}: — Ahora no.` });
  }

  private trackTile(): void {
    const tx = toTile(this.player.x);
    const ty = toTile(this.player.y + 8);
    if (tx === this.lastTile.x && ty === this.lastTile.y) return;
    this.lastTile = { x: tx, y: ty };

    const zone = zoneAt(game.level, tx, ty);
    if (zone && zone.id !== game.state.progress.zone) {
      game.state.progress.zone = zone.id;
      bus.emit('zone:entered', { zoneId: zone.id, label: zone.label });
    }
    this.checkTriggers();
  }

  /** Revisa si algún pasaje cerrado ya cumple su condición y lo abre. */
  private updateGates(): void {
    let changed = false;
    for (const p of game.level.spawns.pasajes) {
      if (!p.requires) continue;
      const open = game.flags.eval(p.requires);
      if (open === this.gateOpen.get(p.id)) continue;
      this.gateOpen.set(p.id, open);
      this.paintPasaje(p, open);
      changed = true;
    }
    if (changed) this.layer.setCollision(COLLIDES);

    if (this.mimosa && game.flags.is('n1_vio_zarpar')) {
      this.mimosa.destroy();
      this.mimosa = null;
    }
  }

  private paintPasaje(p: PasajeDef, open: boolean): void {
    const t = open ? TERRAIN.PATH : TERRAIN.GATE;
    for (let j = p.y; j < p.y + p.h; j++) {
      for (let i = p.x; i < p.x + p.w; i++) {
        const idx = tileIndex(t, cellVariant(i, j));
        this.terrain[j]![i] = idx;
        this.layer.putTileAt(idx, i, j);
      }
    }
    if (open) bus.emit('ui:toast', { text: 'Se abrió el paso.' });
  }

  private checkTriggers(): void {
    if (input.locked) return;
    this.updateGates();
    const tx = toTile(this.player.x);
    const ty = toTile(this.player.y + 8);
    const list = this.triggers.check({ tileX: tx, tileY: ty, zoneId: game.state.progress.zone });
    if (list.length) this.runTrigger(list[0]!);
  }

  private fireEventTriggers(name: string, payload: Record<string, unknown>): void {
    const list = this.triggers.byEvent(name, payload);
    if (list.length) this.runTrigger(list[0]!);
  }

  private runTriggerById(id: string): void {
    const t = game.level.triggers.find((x) => x.id === id) as TriggerDef | undefined;
    if (!t || this.triggers.hasFired(t.id) || !game.flags.eval(t.requires)) return;
    this.runTrigger(t);
  }

  private runTrigger(t: TriggerDef): void {
    const out = this.triggers.consume(t);
    if (out.toast) bus.emit('ui:toast', { text: out.toast });
    if (out.tutorial) bus.emit('ui:tutorial', { id: out.tutorial });
    if (out.dialogue && registry.dialogue(out.dialogue).context === 'camp') {
      this.scene.launch('Camp', { dialogueId: out.dialogue });
    } else if (out.dialogue) this.events.emit('request-dialogue', out.dialogue);
    else if (out.choice) this.events.emit('request-choice', out.choice);
    else if (out.scene && this.scene.get(out.scene)) this.scene.launch(out.scene);
    else if (out.scene) bus.emit('ui:toast', { text: `[escena pendiente: ${out.scene}]` });
  }
}

function shortName(npcId: string): string {
  return npcId.replace(/^npc_/, '');
}
