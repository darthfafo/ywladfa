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
import { FACING_FRAME, makeProps, makeTileset, NPC_COLORS, PC_COLORS, resolveCharacterTexture } from '@/util/textures';

interface Interactable {
  sprite: Phaser.GameObjects.Image;
  kind: 'cajon' | 'npc' | 'jarilla' | 'pila' | 'cueva' | 'fogon' | 'guanaco' | 'algas' | 'bote';
  id: string;
  label: string;
}

/** Personajes (PC + NPCs): 3× para que el arte chibi real (24×32) se aprecie —
 * a 1.5× quedaba chico y el detalle del sprite se perdía. pixelArt:true +
 * NEAREST los mantiene nítidos (ver preloadArt: los sprites de personaje NO
 * llevan el filtro LINEAR que sí usan props/retratos pintados). */
const CHAR_SCALE = 3;

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private terrain: number[][] = [];
  private interactables: Interactable[] = [];
  private triggers!: TriggerSystem;
  private lastTile = { x: -1, y: -1 };
  private facing: keyof typeof FACING_FRAME = 'north';
  private nearest: Interactable | null = null;
  /** Rebote de caminata: con un solo frame estático por dirección (sin ciclo de
   * piernas todavía, ver docs/06-prompts-sprites.txt) el personaje deslizaba sin
   * ningún indicio visual de que se está moviendo — R4 prohíbe escalas/rotaciones
   * no enteras en el mundo, así que el "paso" es un offset vertical de 1px entero,
   * no un squash/stretch. Ver el final de update(). */
  private walkBobTimer = 0;
  private walkBobUp = false;
  private carriedCajones = 0;
  private carriedLena = 0;
  private gateOpen = new Map<string, boolean>();
  private mimosa: Phaser.GameObjects.Image | null = null;
  private gaviotas: { sprite: Phaser.GameObjects.Sprite; speedPxPerSec: number }[] = [];
  /** Dafydd, de vuelta del manantial: no es un tween a un punto fijo (cruzaba
   * paredes y props en línea recta, "volando" por encima de todo) — sigue el
   * rastro real de pasos del jugador, así camina por donde vos caminaste. Ver
   * sendDafyddHome() y el bloque de seguimiento en update(). */
  private dafyddFollow: Phaser.GameObjects.Image | null = null;
  private playerTrail: { x: number; y: number }[] = [];
  /** id de NPC → texture key resuelta (arte real o placeholder) — ver create(). */
  private npcTextureKeys = new Map<string, string>();

  constructor() {
    super('World');
  }

  create(): void {
    const level = game.level;
    makeTileset(this);
    makeProps(this);
    // arte real (hoja de 4 direcciones) si ya existe para ese personaje, si no el
    // placeholder de siempre — ver docs/06-prompts-sprites.txt. 'pc' no es un id
    // fijo: depende del género elegido (antes SIEMPRE usaba los colores de pc_m,
    // sin importar qué se hubiera elegido — bug real, separado del arte nuevo).
    const pcId = `pc_${game.state.player.gender}`;
    const [pcBody, pcHat, pcHatStyle] = PC_COLORS[pcId]!;
    const pcTextureKey = resolveCharacterTexture(this, pcId, pcBody, pcHat, pcHatStyle);
    this.npcTextureKeys = new Map(
      Object.entries(NPC_COLORS).map(([id, [body, hat, style]]) => [id, resolveCharacterTexture(this, id, body, hat, style)]),
    );

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
    this.player = this.physics.add.sprite(tileCenter(sp.x), tileCenter(sp.y), pcTextureKey, FACING_FRAME.north);
    this.player.setDepth(20);
    // 1.5×: a tamaño nativo (16×24 el placeholder, 24×32 el arte real) el
    // personaje se perdía contra el mapa (270px de ancho de pantalla). El cuerpo
    // de colisión se define en píxeles SIN escalar — Arcade Physics multiplica
    // por scale solo, no hace falta tocar los números.
    this.player.setScale(CHAR_SCALE);
    // caja de colisión como proporción del cuadro real (60% ancho, 33% alto,
    // centrada, pegada abajo menos 1px): así sigue calzando con los pies tanto
    // si el frame es el placeholder (16×24) como el arte real (24×32, más
    // cabeza) sin mantener dos números hardcodeados por separado — esta fórmula
    // reproduce EXACTO los valores viejos (10×8, offset 3,15) para 16×24.
    const pcFrame = this.textures.get(pcTextureKey).get(0);
    const boxW = Math.round(pcFrame.width * 0.6);
    const boxH = Math.round(pcFrame.height / 3);
    this.player.body!.setSize(boxW, boxH);
    (this.player.body as Phaser.Physics.Arcade.Body).setOffset(
      Math.round((pcFrame.width - boxW) / 2),
      pcFrame.height - boxH - 1,
    );
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
    // los triggers sin `zone`/`rect` (ej. trig_pantalla_carga, trig_reacciones_carga)
    // no dependen de dónde estás parado — solo de un flag — pero checkTriggers()
    // hoy solo corre desde trackTile(), en cada cambio de tile. Sin esto, uno de
    // estos triggers quedaba esperando a que el jugador diera UN paso cualquiera
    // después de que su condición ya era cierta, una demora artificial que no
    // tiene nada que ver con moverse. delayedCall(0): 'dialogue:end' sale ANTES
    // de que DialogueBox termine de poner input.locked en false, así que
    // checkTriggers() en el mismo instante se encontraba con el juego todavía
    // "bloqueado" y no hacía nada — un tick después ya está desbloqueado.
    bus.on('dialogue:end', () => this.time.delayedCall(0, () => this.checkTriggers()));

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
   * seguirte de vuelta al campamento en vez de quedarse plantado sentado ahí el
   * resto de la jornada. No es un tween a un punto fijo (cruzaba paredes y props
   * en línea recta, "volando" por encima de todo el cañadón) — camina por el
   * rastro real de pasos que vos vas dejando, ver el bloque de seguimiento en
   * update(). El flag `_dafydd_se_fue` (que lo esconde del mapa vía
   * `hiddenAfterFlag`) recién se pone cuando de verdad llega a la barranca, en
   * trackTile() — no acá: `trig_manantial` ya pone `n1_encontro_manantial` en su
   * propia acción ANTES de que el diálogo llegue a abrirse, así que usar ESE flag
   * como disparador escondía el sprite de un frame al otro sin que se viera nunca
   * la despedida (ya lo pisó un bug antes). */
  sendDafyddHome(): void {
    const it = this.interactables.find((x) => x.kind === 'npc' && x.id === 'npc_dafydd');
    if (!it || !it.sprite.visible) return;
    this.dafyddFollow = it.sprite;
    this.playerTrail = [{ x: this.player.x, y: this.player.y }];
  }

  private spawnProps(level: typeof game.level): void {
    // el Mimosa, anclado frente a la costa hasta que zarpa (trig_vigia_mimosa) —
    // arte real si ya existe (src/assets/props/mimosa.png), si no el placeholder
    // de siempre (util/textures.ts).
    // OJO con este número: la cámara SIGUE AL JUGADOR (startFollow), no mira fijo
    // al barco — "más profundo = más grande" solo sirve si además entra en la
    // ventana que la cámara REALMENTE muestra parada en el spawn (27,104), no en
    // cualquier centrado manual. Esa ventana (viewport 352px, jugador arriba)
    // cubre y≈1496-1848px. La vez anterior medí márgenes contra los bordes del
    // MAPA (heightTiles) en vez de contra esa ventana real, así que "verifiqué"
    // un encuadre que el juego nunca muestra — el barco quedaba con la mitad de
    // abajo cortada por el borde de la franja del mundo. 110px + fila 112 entra
    // completo en esa ventana real con margen (~15px arriba y abajo), medido
    // esta vez con el mismo startFollow/bounds que usa el juego, no con
    // cam.centerOn() a mano.
    if (!game.flags.is('n1_vio_zarpar')) {
      this.mimosa =
        addPropImage(this, 'mimosa', tileCenter(27), tileCenter(112), 110) ??
        this.add.image(tileCenter(27), tileCenter(112), 'prop_mimosa');
      this.mimosa.setDepth(7);
    }
    // cajones a bajar — si ya se entregaron los 8 (ej. se retomó una partida guardada
    // en J2/J3, donde WorldScene.create() corre de cero otra vez) no hay que volver a
    // tirarlos desparramados en la playa: ya cumplieron su función.
    const cajonesFaltan = Number(game.flags.get('n1_cajones_bajados') ?? 0) < level.spawns.cajones.length;
    if (cajonesFaltan) {
      for (const [i, c] of level.spawns.cajones.entries()) {
        // arte real si ya existe (src/assets/props/cajon.png), si no el placeholder
        // de siempre — mismo criterio que mimosa más arriba.
        const s =
          addPropImage(this, 'cajon', tileCenter(c.x), tileCenter(c.y), 14) ??
          this.add.image(tileCenter(c.x), tileCenter(c.y), 'prop_cajon');
        s.setDepth(10);
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

    // jarilla — arte real si ya existe (src/assets/props/jarilla.png)
    for (const n of level.spawns.gatherNodes) {
      if (n.type !== 'lena') continue;
      const s =
        addPropImage(this, 'jarilla', tileCenter(n.x), tileCenter(n.y), 14) ??
        this.add.image(tileCenter(n.x), tileCenter(n.y), 'prop_jarilla');
      s.setDepth(10);
      this.interactables.push({ sprite: s, kind: 'jarilla', id: n.id, label: 'Cortar' });
    }
    // fogón y cuevas — arte real si ya existe (src/assets/props/fogon.png, cueva.png)
    const f = level.spawns.fogon;
    const fs =
      addPropImage(this, 'fogon', tileCenter(f.x), tileCenter(f.y), 16) ??
      this.add.image(tileCenter(f.x), tileCenter(f.y), 'prop_fogon');
    fs.setDepth(10);
    this.interactables.push({ sprite: fs, kind: 'fogon', id: 'fogon', label: 'Fogón' });
    for (const c of level.spawns.cuevas) {
      const s =
        addPropImage(this, 'cueva', tileCenter(c.x), tileCenter(c.y), 21) ??
        this.add.image(tileCenter(c.x), tileCenter(c.y), 'prop_cueva');
      s.setDepth(8);
      this.interactables.push({ sprite: s, kind: 'cueva', id: c.id, label: 'Entrar' });
    }
    // NPCs
    for (const n of level.spawns.npcs) {
      const s = this.add
        .image(tileCenter(n.x), tileCenter(n.y), this.npcTextureKeys.get(n.id) ?? n.id, FACING_FRAME.south)
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
    const guanaco = addPropImage(this, 'guanaco', tileCenter(9), tileCenter(59), 50)?.setDepth(6);
    if (guanaco) this.interactables.push({ sprite: guanaco, kind: 'guanaco', id: 'guanaco', label: 'Mirar' });

    // coirón disperso por el monte — decoración de terreno, no interactuable
    // (distinto de la jarilla, que sí se corta).
    for (const [tx, ty] of [
      [4, 47],
      [20, 51],
      [12, 73],
    ] as const) {
      addPropImage(this, 'coiron', tileCenter(tx), tileCenter(ty), 38)?.setDepth(6);
    }

    // restos de costa, algas varadas y botes menores — la playa se siente usada,
    // no vacía. Lejos de los cajones y la pila para no confundir qué se puede
    // levantar.
    addPropImage(this, 'restos_costa', tileCenter(10), tileCenter(103), 34)?.setDepth(6);

    // algas: varios ovillos esparcidos por la arena húmeda (donde de verdad las
    // deja la marea, no en la seca) — cada uno interactuable, mismo criterio que
    // el guanaco (una línea de sabor, no da ni pide nada).
    ([
      [7, 106],
      [33, 107],
      [48, 106],
    ] as const).forEach(([ax, ay], i) => {
      const s =
        addPropImage(this, 'algas', tileCenter(ax), tileCenter(ay), 18) ??
        this.add.image(tileCenter(ax), tileCenter(ay), 'prop_algas');
      s.setDepth(6);
      this.interactables.push({ sprite: s, kind: 'algas', id: `algas_${i}`, label: 'Mirar' });
    });

    // botes menores: varados en la arena SECA, no en la húmeda — un bote de
    // verdad no se deja donde lo agarra la marea. Uno cerca del otro (como
    // quedan de verdad, arrastrados juntos) más uno solo hacia el medio de la
    // orilla. 60, no 52: angosto (2:1), a 52 se perdía contra la arena.
    ([
      [44, 103],
      [40, 105],
      [22, 102],
    ] as const).forEach(([bx, by], i) => {
      const s = addPropImage(this, 'bote_menor', tileCenter(bx), tileCenter(by), 60)?.setDepth(6);
      if (s) this.interactables.push({ sprite: s, kind: 'bote', id: `bote_${i}`, label: 'Mirar' });
    });

    // fauna del cañadón: es un espacio abierto y grande, no tiene sentido que esté
    // vacío de vida — mismo guanaco que ya se usa en el monte (roamea Patagonia
    // entera, no es exclusivo de una zona) y un par de matas de coirón, lejos de
    // los afloramientos de roca nuevos y del propio manantial.
    const guanacoCanadon = addPropImage(this, 'guanaco', tileCenter(21), tileCenter(30), 48)?.setDepth(6);
    if (guanacoCanadon) {
      this.interactables.push({ sprite: guanacoCanadon, kind: 'guanaco', id: 'guanaco_canadon', label: 'Mirar' });
    }
    for (const [tx, ty] of [
      [6, 11],
      [23, 36],
    ] as const) {
      addPropImage(this, 'coiron', tileCenter(tx), tileCenter(ty), 36)?.setDepth(6);
    }

    // la meseta: pasto y agua en algún lado (por algo baja Lewis a buscarla ahí) —
    // dos tropillas de guanaco (3-4 juntos, que es como se los ve de verdad, no de
    // a uno suelto como en el monte o el cañadón) y varios juncos dispersos. Cada
    // tropilla registra un solo guanaco como interactuable ("Mirar"); el resto es
    // decoración — se lee igual como grupo, no hace falta que los cuatro respondan.
    const mesetaGroups: Array<{ id: string; spots: ReadonlyArray<readonly [number, number]> }> = [
      {
        id: 'guanaco_meseta_1',
        spots: [
          [35, 15],
          [37, 16.5],
          [34, 17],
          [36, 18.5],
        ],
      },
      {
        id: 'guanaco_meseta_2',
        spots: [
          [48, 25],
          [50, 26.5],
          [47, 27],
        ],
      },
    ];
    for (const group of mesetaGroups) {
      group.spots.forEach(([gx, gy], i) => {
        const s = addPropImage(this, 'guanaco', tileCenter(gx), tileCenter(gy), 46)?.setDepth(6);
        if (s && i === 0) this.interactables.push({ sprite: s, kind: 'guanaco', id: group.id, label: 'Mirar' });
      });
    }
    for (const [tx, ty] of [
      [33, 10],
      [42, 12],
      [55, 18],
      [38, 29],
      [52, 30],
      [44, 21],
    ] as const) {
      addPropImage(this, 'coiron', tileCenter(tx), tileCenter(ty), 38)?.setDepth(6);
    }

    // el manantial: centrado en el mismo bloque de tiles que ya pinta buildTerrain()
    // (TERRAIN.SPRING, un bloque angosto de 2×2 = 32px). La imagen del pozo tiene
    // bastante margen transparente alrededor de la forma orgánica de las piedras
    // (no es un cuadrado sólido), así que se pone bien más grande (96) que ese
    // bloque — el borde de piedras del dibujo lo tapa entero contra el terreno del
    // cañadón alrededor, que combina mejor que un cuadrado de agua lisa asomando.
    addPropImage(this, 'manantial', tileCenter(9.5), tileCenter(7.5), 108)?.setDepth(5);

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
          .setDisplaySize(22, 22)
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
      // Dafydd siguiendo al jugador (ver sendDafyddHome): su posición la maneja el
      // seguimiento cuadro a cuadro, no esto — si algo dispara un turno mientras
      // camina detrás tuyo, sin este corte lo hacía "saltar" de vuelta al manantial
      // (su posición de movesTo) en medio del camino.
      if (this.dafyddFollow && n.id === 'npc_dafydd') continue;

      const dayOk = n.day === '*' || (Array.isArray(n.day) ? n.day.includes(day) : n.day === day);
      const flagOk = !n.afterFlag || game.flags.is(n.afterFlag);
      const hidden = !!n.hiddenAfterFlag && game.flags.is(n.hiddenAfterFlag);
      const visible = dayOk && flagOk && !hidden;
      it.sprite.setVisible(visible).setActive(visible);

      // movesTo puede ser una sola parada o una lista de mudanzas (ej. Edwyn:
      // playa → barranca en J2 → playa de vuelta en J3) — de las que ya pasaron
      // su umbral, la última declarada gana.
      const stops = n.movesTo ? (Array.isArray(n.movesTo) ? n.movesTo : [n.movesTo]) : [];
      const reached = stops.filter((m) => day > m.day || (day === m.day && turnIdx >= TURNS.indexOf(m.turn)));
      const pos = reached.length ? reached[reached.length - 1]! : n;
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
    let vx = kx !== 0 || ky !== 0 ? kx : input.x;
    let vy = kx !== 0 || ky !== 0 ? ky : input.y;
    // solo las 4 direcciones cardinales, nunca diagonal — mismo criterio que el
    // sprite (4 frames, uno por dirección) y el resto de la estética "RPG viejo".
    // De paso saca un bug real: con teclado, sostener dos direcciones a la vez
    // sumaba un vector (±1,±1) sin normalizar — el personaje caminaba más rápido
    // en diagonal que en línea recta (el joystick táctil ya normalizaba bien esto
    // solo, ver InputState.setVector; el teclado no pasa por ahí). Mismo desempate
    // que ya usa el cálculo de facing más abajo (empate → vertical), así el eje que
    // se recorta siempre coincide con hacia dónde termina mirando el personaje.
    if (vx !== 0 || vy !== 0) {
      if (Math.abs(vx) > Math.abs(vy)) vy = 0;
      else vx = 0;
    }

    const speed = this.currentSpeed();
    body.setVelocity(vx * speed, vy * speed);
    if (vx !== 0 || vy !== 0) {
      this.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'east' : 'west') : vy > 0 ? 'south' : 'north';
      this.player.setFrame(FACING_FRAME[this.facing]!);
    }

    // rebote de caminata (ver el campo walkBobTimer): alterna 1px cada 180ms
    // mientras se mueve, nunca en reposo. Se aplica DESPUÉS de que Arcade
    // Physics ya sincronizó player.y con el body en este frame, así que no
    // hace falta deshacerlo — el próximo frame arranca de nuevo desde la
    // posición real del body antes de sumar el offset.
    if (vx !== 0 || vy !== 0) {
      this.walkBobTimer += delta;
      if (this.walkBobTimer >= 180) {
        this.walkBobTimer = 0;
        this.walkBobUp = !this.walkBobUp;
      }
    } else {
      this.walkBobTimer = 0;
      this.walkBobUp = false;
    }
    if (this.walkBobUp) this.player.y -= 1;

    this.updateNearest();
    if (input.takeAction()) this.interact();
    this.updateDafyddFollow(delta);
    this.trackTile();
  }

  /** Dafydd caminando detrás tuyo (ver sendDafyddHome): en vez de perseguir tu
   * posición ACTUAL (eso lo pegaba pegado al jugador, o lo hacía cortar camino
   * en diagonal atravesando paredes si vos doblabas una esquina), persigue un
   * punto de tu propio rastro de pasos con un retraso fijo — así su camino es,
   * literal, el mismo que el tuyo. */
  private updateDafyddFollow(delta: number): void {
    if (!this.dafyddFollow) return;
    const MAX_TRAIL = 90; // ~1.5s de rastro a 60fps, de sobra para el retraso de abajo
    const LAG_STEPS = 20; // cuántas muestras atrás sigue — más cerca sin pisarte los talones
    this.playerTrail.push({ x: this.player.x, y: this.player.y });
    if (this.playerTrail.length > MAX_TRAIL) this.playerTrail.shift();

    const idx = Math.max(0, this.playerTrail.length - 1 - LAG_STEPS);
    const target = this.playerTrail[idx]!;
    const sprite = this.dafyddFollow;
    const dx = target.x - sprite.x;
    const dy = target.y - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const speed = registry.balance.global.playerBaseSpeedPxPerSec as number;
    const step = Math.min(dist, (speed * delta) / 1000);
    sprite.x += (dx / dist) * step;
    sprite.y += (dy / dist) * step;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north';
    sprite.setFrame(FACING_FRAME[dir]);
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
      case 'algas':
        bus.emit('ui:toast', { text: 'Hay muchas algas en la costa.' });
        break;
      case 'bote':
        // no son botes de pesca cualquiera: son los que bajaron a los 150
        // colonos del Mimosa a remo, como el del cold open ("El bote toca la
        // playa y nadie baja primero") — varios viajes, no cupo todos de una.
        bus.emit('ui:toast', { text: 'Uno de los botes que bajamos del Mimosa.' });
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

    // Dafydd te siguió hasta acá (ver sendDafyddHome): recién al llegar de
    // verdad a la barranca se despide del todo — el flag lo esconde del mapa
    // (updateNpcVisibility → hiddenAfterFlag) sin que updateNpcVisibility haya
    // podido tironear su posición mientras todavía estaba caminando detrás tuyo.
    if (this.dafyddFollow && zone?.id === 'z2_barranca') {
      this.dafyddFollow.setVisible(false).setActive(false);
      this.dafyddFollow = null;
      this.playerTrail = [];
      game.flags.set('_dafydd_se_fue', true);
    }

    // red de contención: los dos pasajes al cañadón ya exigen n1_dafydd_perdido,
    // así que esto no debería poder pasar nunca — pero si por lo que sea el
    // jugador termina adentro antes de tiempo, lo saca en vez de dejarlo ver el
    // manantial fuera de hora. Mejor esto que confiar solo en la colisión.
    // Vuelve al fogón, no a un punto fijo en la meseta: la meseta tiene sus
    // propios pasajes cerrados hasta el día 2 (p_barranca_meseta), así que un
    // punto "seguro" ahí podía dejar al jugador atrapado sin salida en la
    // jornada 1 — el fogón, en cambio, siempre es territorio ya alcanzado.
    if (zone?.id === 'z5_canadon' && !game.flags.is('n1_dafydd_perdido')) {
      const back = game.level.spawns.fogon;
      this.player.setPosition(tileCenter(back.x), tileCenter(back.y));
      this.lastTile = { x: -1, y: -1 };
      const backZone = zoneAt(game.level, back.x, back.y);
      if (backZone) game.state.progress.zone = backZone.id;
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

  /** Para escenas que cierran sin pasar por DialogueBox (CargoScene: fija
   * `n1_carga` y se cierra sola) — mismo motivo que el listener de 'dialogue:end'
   * más arriba: un trigger sin `zone` no tiene por qué esperar a que el jugador
   * dé un paso para que se note que su condición ya se cumplió. */
  recheckTriggers(): void {
    this.checkTriggers();
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
      this.scene.launch('Camp', { dialogueId: out.dialogue, night: out.night });
    } else if (out.dialogue) this.events.emit('request-dialogue', { id: out.dialogue, next: out.next });
    else if (out.choice) this.events.emit('request-choice', out.choice);
    else if (out.scene && this.scene.get(out.scene)) this.scene.launch(out.scene);
    else if (out.scene) bus.emit('ui:toast', { text: `[escena pendiente: ${out.scene}]` });
  }
}

function shortName(npcId: string): string {
  return npcId.replace(/^npc_/, '');
}
