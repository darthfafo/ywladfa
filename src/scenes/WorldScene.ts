import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import type { PasajeDef, TriggerDef } from '@/core/types';
import { TriggerSystem } from '@/systems/TriggerSystem';
import { TURNS } from '@/systems/TimeSystem';
import { addPropImage, hasPropArt, propTextureKey } from '@/util/assets';
import { tileCenter, toTile } from '@/util/grid';
import { input } from '@/util/input';
import { baseTerrain, buildTerrain, cellVariant, COLLIDES, TERRAIN, TERRAIN_SPEED, tileIndex, zoneAt } from '@/util/mapgen';
import { FACING_FRAME, makeCharacter, makeProps, makeTileset, NPC_COLORS } from '@/util/textures';

interface Interactable {
  sprite: Phaser.GameObjects.Image;
  kind: 'cajon' | 'npc' | 'jarilla' | 'pila' | 'cueva' | 'fogon' | 'guanaco';
  id: string;
  label: string;
}

/** Personajes (PC + NPCs) nativos a 16×24 se perdían contra el mapa (270px de
 * ancho de pantalla) — 1.5× los hace legibles sin que dejen de leerse como
 * personajes de un tile de ancho. pixelArt:true + NEAREST los mantiene nítidos. */
const CHAR_SCALE = 1.5;

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
  private carriedLena = 0;
  private gateOpen = new Map<string, boolean>();
  private mimosa: Phaser.GameObjects.Image | null = null;
  private gaviotas: { sprite: Phaser.GameObjects.Sprite; speedPxPerSec: number }[] = [];

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
    // 1.5×: a 16×24 nativos el personaje se perdía contra el mapa (270px de ancho
    // de pantalla). El cuerpo de colisión se define en píxeles SIN escalar — Arcade
    // Physics multiplica por scale solo, no hace falta tocar los números.
    this.player.setScale(CHAR_SCALE);
    this.player.body!.setSize(10, 8);
    (this.player.body as Phaser.Physics.Arcade.Body).setOffset(3, 15);
    this.physics.add.collider(this.player, this.layer);

    this.spawnProps(level);
    this.spawnDecor();

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

  /** Al cerrar la noche (CampScene.restoreOnShutdown), el jugador vuelve a aparecer
   * en el campamento — sin importar desde dónde cayó la noche (ej. todavía en el
   * cañadón, de vuelta del manantial): te despertás donde corresponde, no donde te
   * agarró el sueño. Mismo punto que ya usa el spawn de un día>1 recién arrancado. */
  wakeAtCamp(): void {
    const sp = game.level.spawns.fogon;
    this.player.setPosition(tileCenter(sp.x), tileCenter(sp.y));
    this.facing = 'north';
    this.player.setFrame(FACING_FRAME.north);
    this.cameras.main.centerOn(tileCenter(sp.x), tileCenter(sp.y));
    this.lastTile = { x: -1, y: -1 };
    this.trackTile();
  }

  /** Al cerrar d_n1_manantial (UiScene.openDialogue), Dafydd se despide y arranca a
   * caminar de vuelta al fogón en vez de quedarse plantado sentado ahí el resto de
   * la jornada. El flag `_dafydd_se_fue` lo pone ESTE método, no el trigger ni el
   * diálogo: `trig_manantial` ya pone `n1_encontro_manantial` en su propia acción,
   * ANTES de que el diálogo llegue a abrirse (TriggerSystem.consume aplica setFlag
   * y spendTurns antes de que la escena lance nada) — usar ese flag como
   * `hiddenAfterFlag` escondía el sprite de un frame al otro sin que se viera
   * nunca la despedida. Con un flag propio, puesto acá, el tween sí se ve. */
  sendDafyddHome(): void {
    const it = this.interactables.find((x) => x.kind === 'npc' && x.id === 'npc_dafydd');
    if (!it || !it.sprite.visible) return;
    game.flags.set('_dafydd_se_fue', true);
    const sp = game.level.spawns.fogon;
    this.tweens.add({
      targets: it.sprite,
      x: tileCenter(sp.x),
      y: tileCenter(sp.y),
      duration: 1200,
      ease: 'Sine.inOut',
      onComplete: () => it.sprite.setVisible(false).setActive(false),
    });
  }

  private spawnProps(level: typeof game.level): void {
    // el Mimosa, anclado frente a la costa hasta que zarpa (trig_vigia_mimosa) —
    // arte real si ya existe (src/assets/props/mimosa.png), si no el placeholder
    // de siempre (util/textures.ts).
    if (!game.flags.is('n1_vio_zarpar')) {
      this.mimosa =
        addPropImage(this, 'mimosa', tileCenter(27), tileCenter(110), 72) ??
        this.add.image(tileCenter(27), tileCenter(110), 'prop_mimosa');
      this.mimosa.setDepth(7);
    }
    // cajones a bajar — si ya se entregaron los 8 (ej. se retomó una partida guardada
    // en J2/J3, donde WorldScene.create() corre de cero otra vez) no hay que volver a
    // tirarlos desparramados en la playa: ya cumplieron su función.
    const cajonesFaltan = Number(game.flags.get('n1_cajones_bajados') ?? 0) < level.spawns.cajones.length;
    if (cajonesFaltan) {
      for (const [i, c] of level.spawns.cajones.entries()) {
        const s = this.add.image(tileCenter(c.x), tileCenter(c.y), 'prop_cajon').setDepth(10);
        this.interactables.push({ sprite: s, kind: 'cajon', id: `cajon_${i}`, label: 'Levantar' });
      }
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
      const s = this.add
        .image(tileCenter(n.x), tileCenter(n.y), n.id, FACING_FRAME.south)
        .setDepth(15)
        .setScale(CHAR_SCALE);
      this.interactables.push({ sprite: s, kind: 'npc', id: n.id, label: 'Hablar' });
    }
    this.updateNpcVisibility();
  }

  /**
   * Elementos de ambiente puramente decorativos (sin interactable, no bloquean
   * paso): solo se dibujan si ya existe el PNG real en src/assets/props/ — si
   * todavía no está ese archivo, esta función no dibuja nada, no hay placeholder
   * de código para estos (a diferencia de los props jugables de spawnProps()).
   * Tamaño grande a propósito: tienen que reconocerse desde lejos e invitar a
   * acercarse, no ser un detalle que se pierde contra el terreno.
   */
  private spawnDecor(): void {
    // guanaco a la distancia — vida silvestre del monte, mismo espíritu que
    // hint_agua_3 (huella de guanaco → agua), pero lejos de los nodos de jarilla.
    // 42, no 28: a 28 no se distinguía la silueta. Interactuable con una línea de
    // sabor nada más (no da ni pide nada) — que el jugador se acerque a mirarlo
    // tiene que valer la pena con algo, aunque sea un chiste.
    const guanaco = addPropImage(this, 'guanaco', tileCenter(9), tileCenter(59), 42)?.setDepth(6);
    if (guanaco) this.interactables.push({ sprite: guanaco, kind: 'guanaco', id: 'guanaco', label: 'Mirar' });

    // coirón disperso por el monte — decoración de terreno, no interactuable
    // (distinto de la jarilla, que sí se corta). 32, no 20: a 20 no se distinguía
    // la mata de pasto de una mancha de ruido del terreno.
    for (const [tx, ty] of [
      [4, 47],
      [20, 51],
      [12, 73],
    ] as const) {
      addPropImage(this, 'coiron', tileCenter(tx), tileCenter(ty), 32)?.setDepth(6);
    }

    // restos de costa y un bote menor — la playa se siente usada, no vacía.
    // Lejos de los cajones y la pila para no confundir qué se puede levantar.
    addPropImage(this, 'restos_costa', tileCenter(10), tileCenter(103), 28)?.setDepth(6);
    // 52, no 32: a 32 no se distinguía que era un bote — es angosto (2:1) y a ese
    // tamaño quedaba en poco más que una mancha marrón.
    addPropImage(this, 'bote_menor', tileCenter(44), tileCenter(108), 52)?.setDepth(6);

    // fauna del cañadón: es un espacio abierto y grande, no tiene sentido que esté
    // vacío de vida — mismo guanaco que ya se usa en el monte (roamea Patagonia
    // entera, no es exclusivo de una zona) y un par de matas de coirón, lejos de
    // los afloramientos de roca nuevos y del propio manantial.
    const guanacoCanadon = addPropImage(this, 'guanaco', tileCenter(21), tileCenter(30), 40)?.setDepth(6);
    if (guanacoCanadon) {
      this.interactables.push({ sprite: guanacoCanadon, kind: 'guanaco', id: 'guanaco_canadon', label: 'Mirar' });
    }
    for (const [tx, ty] of [
      [6, 11],
      [23, 36],
    ] as const) {
      addPropImage(this, 'coiron', tileCenter(tx), tileCenter(ty), 30)?.setDepth(6);
    }

    // el manantial: centrado en el mismo bloque de tiles que ya pinta buildTerrain()
    // (TERRAIN.SPRING, un bloque angosto de 2×2 = 32px). La imagen del pozo tiene
    // bastante margen transparente alrededor de la forma orgánica de las piedras
    // (no es un cuadrado sólido), así que se pone bien más grande (96) que ese
    // bloque — el borde de piedras del dibujo lo tapa entero contra el terreno del
    // cañadón alrededor, que combina mejor que un cuadrado de agua lisa asomando.
    addPropImage(this, 'manantial', tileCenter(9.5), tileCenter(7.5), 96)?.setDepth(5);

    // gaviotas: 2-3 frames animados (ver util/assets.ts PROP_SPRITESHEETS), planeando
    // de izquierda a derecha sobre la playa. No van con un tween de coordenadas fijas
    // del mapa: eso las hacía "aparecer" en cualquier punto en cuanto ese tramo del
    // mapa entraba en cámara, en vez de entrar volando desde el borde. Se mueven a
    // velocidad constante en updateGaviotas() (llamado desde update()) y se
    // reposicionan just fuera del borde IZQUIERDO de lo que la cámara esté mostrando
    // en ese momento apenas cruzan el borde derecho — así siempre entran por donde
    // corresponde, dondequiera que esté mirando la cámara.
    if (hasPropArt('gaviotas')) {
      const key = propTextureKey('gaviotas');
      if (!this.anims.exists('gaviota_vuelo')) {
        this.anims.create({
          key: 'gaviota_vuelo',
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: 2 }),
          frameRate: 4,
          repeat: -1,
        });
      }
      const viewLeft = this.player.x - VIEW.world.w / 2;
      for (const [ty, offset, speedPxPerSec] of [
        [96, 0, 16],
        [94, 90, 12],
      ] as const) {
        const sprite = this.add
          .sprite(viewLeft - 24 - offset, tileCenter(ty), key)
          .setDisplaySize(18, 18)
          .setDepth(11)
          .play('gaviota_vuelo');
        this.gaviotas.push({ sprite, speedPxPerSec });
      }
    }
  }

  private updateGaviotas(delta: number): void {
    if (!this.gaviotas.length) return;
    const view = this.cameras.main.worldView;
    const margin = 24;
    for (const g of this.gaviotas) {
      g.sprite.x += g.speedPxPerSec * (delta / 1000);
      if (g.sprite.x > view.right + margin) g.sprite.x = view.left - margin;
    }
  }

  /**
   * Los NPC no están siempre en el mismo lugar ni siempre presentes: `day` decide si
   * aparecen, `afterFlag` si ya se ganó verlos, `movesTo` si ya llegó el momento de
   * reubicarlos (ej. Dafydd, sentado junto al manantial recién en J2 tarde — coincide
   * con `trig_dafydd_perdido`; `trig_manantial` pide el mismo flag para no poder
   * "encontrar el agua" antes de que Dafydd se haya perdido en la ficción).
   */
  private updateNpcVisibility(): void {
    const day = game.state.progress.day;
    const turnIdx = TURNS.indexOf(game.state.progress.turn);
    for (const n of game.level.spawns.npcs) {
      const it = this.interactables.find((x) => x.kind === 'npc' && x.id === n.id);
      if (!it) continue;

      const dayOk = n.day === '*' || (Array.isArray(n.day) ? n.day.includes(day) : n.day === day);
      const flagOk = !n.afterFlag || game.flags.is(n.afterFlag);
      const hidden = !!n.hiddenAfterFlag && game.flags.is(n.hiddenAfterFlag);
      const visible = dayOk && flagOk && !hidden;
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

  override update(_time: number, delta: number): void {
    this.updateGaviotas(delta);

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
      case 'jarilla': {
        it.sprite.destroy();
        const amount = registry.levelBalance(game.state.progress.level).gains.jarilla.amount as number;
        this.carriedLena += amount;
        game.inv.add('haz_lena', amount);
        bus.emit('ui:toast', { text: `+${amount} haz de leña (a cargar hasta el fogón)` });
        break;
      }
      case 'npc':
        this.talkTo(it.id);
        break;
      case 'fogon':
        if (this.carriedLena > 0) {
          const n = this.carriedLena;
          game.inv.remove('haz_lena', n);
          this.carriedLena = 0;
          game.res.change('lena', n, 'jarilla');
          bus.emit('ui:toast', { text: `Leña cargada al fogón: +${n}` });
        } else {
          bus.emit('ui:toast', { text: 'El fogón. Acá se pasa la noche.' });
        }
        break;
      case 'cueva':
        this.runTriggerById('trig_eleccion_cueva');
        break;
      case 'guanaco':
        bus.emit('ui:toast', { text: '— Guarda que escupen.' });
        break;
    }
  }

  private talkTo(npcId: string): void {
    // primero por el campo `npc` del propio diálogo (confiable); si no lo tiene,
    // el nombre corto adentro del id del diálogo (heurística vieja). El chequeo de
    // hasFired/requires va ADENTRO del find, no después: un personaje puede tener
    // más de un diálogo que lo mencione (ej. npc_dafydd en trig_dafydd_perdido,
    // automático y ya disparado, Y en trig_manantial, todavía pendiente) — filtrar
    // recién al final se quedaba con el primero por orden de archivo aunque ya
    // hubiera disparado, y nunca llegaba a mirar el que sí correspondía.
    // hasFired solo descarta si `once` (igual que TriggerSystem.check): los
    // resguardos de charla repetible (ej. trig_lewis_flavor, once:false) tienen
    // que poder volver a disparar — si no, la primera vez que dan su línea ya
    // quedan marcados en triggersFired y el personaje cae en "Ahora no." igual.
    const t = game.level.triggers.find((tr) => {
      if (!tr.action?.dialogue) return false;
      const matches = registry.dialogue(tr.action.dialogue).npc === npcId || tr.action.dialogue.includes(shortName(npcId));
      if (!matches) return false;
      if (tr.once && this.triggers.hasFired(tr.id)) return false;
      return game.flags.eval(tr.requires);
    });
    if (t) {
      this.runTrigger(t as TriggerDef);
      return;
    }
    // línea corta en la bandeja de diálogo, no un toast: es lo que dice el NPC,
    // tiene que leerse en el mismo lugar que cualquier otra línea suya, no flotando
    // en cualquier lado de la pantalla.
    this.events.emit('request-refusal', npcId);
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

    // red de contención: los dos pasajes al cañadón ya exigen n1_dafydd_perdido,
    // así que esto no debería poder pasar nunca — pero si por lo que sea el
    // jugador termina adentro antes de tiempo, lo saca en vez de dejarlo ver el
    // manantial fuera de hora. Mejor esto que confiar solo en la colisión.
    if (zone?.id === 'z5_canadon' && !game.flags.is('n1_dafydd_perdido')) {
      this.player.setPosition(tileCenter(32), tileCenter(24));
      this.lastTile = { x: -1, y: -1 };
      const back = zoneAt(game.level, 32, 24);
      if (back) game.state.progress.zone = back.id;
      bus.emit('ui:toast', { text: 'Todavía no. Hay que volver más tarde.' });
      this.checkTriggers();
      return;
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
    if (list.length) {
      this.runTrigger(list[0]!);
      return;
    }
    this.checkLevelOver();
  }

  /** Red de contención (R7: el Nivel 1 no se puede perder ni quedar trabado): si ya
   * se pasaron los días del nivel y el cierre (`trig_punta_final`) todavía no
   * disparó, lo fuerza acá en vez de dejar que el reloj siga corriendo hacia una
   * "Jornada 4" que no existe en el diseño (`data/levels/nivel-01.json` solo define
   * 3 días de guion). */
  private checkLevelOver(): void {
    if (game.state.progress.day <= game.level.schedule.days) return;
    if (!game.flags.get('n1_carga')) return;
    const t = game.level.triggers.find((x) => x.id === 'trig_punta_final') as TriggerDef | undefined;
    if (!t || this.triggers.hasFired(t.id)) return;
    this.runTrigger(t);
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
    } else if (out.dialogue) this.events.emit('request-dialogue', { id: out.dialogue, next: out.next });
    else if (out.choice) this.events.emit('request-choice', out.choice);
    else if (out.scene && this.scene.get(out.scene)) this.scene.launch(out.scene);
    else if (out.scene) bus.emit('ui:toast', { text: `[escena pendiente: ${out.scene}]` });
  }
}

function shortName(npcId: string): string {
  return npcId.replace(/^npc_/, '');
}
