import Phaser from 'phaser';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAM_3D, PAL, RENDER_3D_FX, TERRAIN_HEIGHT_3D, TURN_LIGHT, VIEW } from '@/config';
import { game } from '@/core/Game';
import { baseTerrain, TERRAIN } from '@/util/mapgen';
import { buildShip } from './ship';
import { TEX_TILES, terrainTexture } from './terrainTextures';

/**
 * El mundo en HD-2D: terreno con alturas, mar, luz y sombras en 3D (Three.js),
 * personajes y props como sprites pixel art parados en ese mundo.
 *
 * NO tiene lógica de juego. WorldScene sigue siendo dueña de todo (física,
 * colisiones, triggers, NPCs, Dafydd siguiéndote, pasajes): solo deja de
 * dibujar, y esta clase copia cada cuadro lo que hay en la escena. Por eso
 * cualquier cosa nueva que WorldScene ponga en el mapa aparece acá sola.
 *
 * Unidades: 1 = un tile (16 px del mapa). x = columna, z = fila (norte = -z).
 */

/** Lo mínimo del jugador que necesita la cámara (un sprite real o un punto que se mueve). */
export interface Focus {
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  originY: number;
}

/** Lo que World3D necesita de quien lo usa (WorldScene, o la portada). */
export interface WorldSource {
  scene: Phaser.Scene;
  player: Focus;
  terrain(): number[][];
  /** sube cada vez que cambia el terreno (se abre un pasaje) */
  terrainVersion(): number;
  /** objetos de Phaser a copiar al 3D; por defecto, todos los de `scene` */
  objects?: () => readonly Phaser.GameObjects.GameObject[];
}

/** Variantes de cámara/encuadre: el juego usa las de CAM_3D; la portada, una
 * toma baja mirando al mar, a pantalla completa. */
export interface ViewOptions {
  /** ocupa los 480 px del canvas, no solo la franja del mundo */
  fullScreen?: boolean;
  pitch?: number;
  distance?: number;
  /** 'north' = como el mapa (el juego); 'south' = de espaldas a la barranca, mirando al mar */
  facing?: 'north' | 'south';
  /** a qué altura mira la cámara (tiles); 0 = al piso */
  lookHeight?: number;
  /** recorte de paredes delante del jugador (sin sentido sin jugador) */
  cutaway?: boolean;
}

const PX = 1 / VIEW.tile;
/** subdivisiones por tile de la malla del terreno (ver buildTerrain) */
const TERRAIN_SUB = 2;
/** brillo propio (emissive) del piso y de los sprites a plena luz; TURN_LIGHT.glow lo escala */
const TERRAIN_GLOW = 0.35;
const SPRITE_GLOW = 0.5;
/** caminata procedural: pasos por tile recorrido, alto del saltito (tiles),
 * balanceo (radianes) y duración de la nube de polvo */
const WALK = { stepsPerTile: 1.1, hop: 0.16, sway: 0.07, dustSeconds: 0.45 };
/** Inclinación de los sprites hacia la cámara y estiramiento vertical que
 * compensa el escorzo: un sprite parado visto desde arriba se ve achatado
 * (cos del ángulo); estirándolo así se ve del mismo alto que en el 2D. */
const SPRITE_TILT = THREE.MathUtils.degToRad(CAM_3D.pitch) * CAM_3D.spriteLean;
const SPRITE_STRETCH = 1 / Math.cos(THREE.MathUtils.degToRad(CAM_3D.pitch) - SPRITE_TILT);
const TERRAIN_NAME = Object.fromEntries(Object.entries(TERRAIN).map(([k, v]) => [v, k])) as Record<number, string>;
const heightOf = (tileIdx: number): number => TERRAIN_HEIGHT_3D[TERRAIN_NAME[baseTerrain(tileIdx)] ?? ''] ?? 0;

type Kind = 'billboard' | 'flat' | 'model';
interface Mirror {
  kind: Kind;
  obj: THREE.Object3D;
  /** solo billboards/flat: el material con la textura del cuadro */
  mat?: THREE.MeshLambertMaterial;
  tex?: THREE.Texture;
  lift?: number;
  /** corrimiento mínimo en profundidad: dos sprites en la misma fila no titilan */
  zBias?: number;
  /** caminata procedural (ver walk()): última posición, fase del paso, intensidad */
  walk?: { x: number; y: number; phase: number; amp: number };
  update?: (t: number) => void;
}

export class World3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene3 = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer | null;
  private readonly hTilt: ShaderPass | null = null;
  private readonly vTilt: ShaderPass | null = null;
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly lantern = new THREE.PointLight(0xffb366, 0, 10, 1.6);
  private readonly mirrors = new Map<Phaser.GameObjects.GameObject, Mirror>();
  /** objetos de la escena que no se copian (capa de tiles, capa de luz 2D) */
  private readonly ignored = new WeakSet<Phaser.GameObjects.GameObject>();
  private mirrorCount = 0;
  private seaMat: THREE.MeshStandardMaterial | null = null;
  private readonly sources = new Map<unknown, THREE.Texture>();
  private terrainMeshes: THREE.Mesh[] = [];
  /** elipse de recorte en píxeles del canvas: centro (x, y) y radios (x, y) */
  private readonly cut = { value: new THREE.Vector4(0, 0, 1, 1) };
  private terrainBuilt = -1;
  private readonly focus = { value: new THREE.Vector3() };
  private readonly time = { value: 0 };
  private readonly camOffset: THREE.Vector3;
  private readonly lookAhead: number;
  private readonly sunOffset = new THREE.Vector3();
  private rect = '';
  /** luz actual, interpolando de `from` a `to` (ver setTurn) */
  private light = { from: lightOf('manana'), to: lightOf('manana'), cur: lightOf('manana'), k: 1, ms: 1 };

  constructor(
    private readonly src: WorldSource,
    private readonly view: ViewOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const el = this.renderer.domElement;
    // debajo de todo lo de Phaser sin tocar su canvas ni su capa DOM (los toques
    // del diálogo son elementos HTML de esa capa: si el canvas sube de z-index,
    // los tapa). `isolation` hace que el z-index negativo quede dentro de #game.
    el.style.cssText = 'position:absolute; left:0; top:0; z-index:-1; pointer-events:none;';
    const parent = src.scene.game.canvas.parentElement!;
    parent.style.position = 'relative';
    parent.style.isolation = 'isolate';
    parent.prepend(el);

    const pitch = THREE.MathUtils.degToRad(view.pitch ?? CAM_3D.pitch);
    const dist = view.distance ?? CAM_3D.distance;
    const dir = view.facing === 'south' ? -1 : 1;
    this.camOffset = new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist * dir);
    // el jugador va un poco abajo del centro, como en 2D: se ve más de lo que hay adelante
    this.lookAhead = 2 * dir;
    this.camera = new THREE.PerspectiveCamera(CAM_3D.fov, VIEW.world.w / VIEW.world.h, 1, 220);

    this.scene3.add(this.hemi, this.sun, this.sun.target, this.lantern);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = s.bottom = -26;
    s.right = s.top = 26;
    s.near = 1;
    s.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;

    this.buildSea();

    if (RENDER_3D_FX) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene3, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.5, 0.88));
      this.hTilt = new ShaderPass(HorizontalTiltShiftShader);
      this.vTilt = new ShaderPass(VerticalTiltShiftShader);
      this.hTilt.uniforms.r!.value = this.vTilt.uniforms.r!.value = 0.5;
      this.composer.addPass(this.hTilt);
      this.composer.addPass(this.vTilt);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
    }

    this.setTurn(game.state.progress.turn, 0);
    const p = this.src.player;
    this.camera.position.set(p.x * PX, 0, p.y * PX).add(this.camOffset);
  }

  /** Agrega un objeto 3D suelto (sin sprite de Phaser detrás), ej. el Mimosa de la portada. */
  addModel(obj: THREE.Object3D, update?: (t: number) => void): void {
    this.scene3.add(obj);
    if (update) this.extraUpdates.push(update);
  }
  private readonly extraUpdates: Array<(t: number) => void> = [];

  /** El Mimosa fondeado (mismo modelo que en el juego), en tiles. */
  static mimosa(): { obj: THREE.Object3D; update: (t: number) => void } {
    const ship = buildShip();
    ship.scale.setScalar(0.42);
    ship.rotation.y = 0.12;
    return { obj: ship, update: (t) => (ship.position.y = -0.4 + Math.sin(t * 0.7) * 0.12) };
  }

  destroy(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- terreno

  /**
   * Terreno como una malla continua, más fina que la grilla (TERRAIN_SUB celdas
   * por tile), en vez de un cubo por tile:
   * - barrancas empinadas pero con borde y lomo irregulares (la pendiente queda
   *   ADENTRO del tile de pared: el piso caminable no se achica)
   * - la playa baja en declive al agua, no en escalón
   * - los límites entre terrenos caminables se deshilachan en vez de seguir la grilla
   * - todo con un leve desplazamiento horizontal y facetado ("low-poly")
   * Es solo visual: la colisión sigue siendo la de la grilla de WorldScene.
   */
  private buildTerrain(): void {
    for (const m of this.terrainMeshes) {
      this.scene3.remove(m);
      m.geometry.dispose();
    }
    this.terrainMeshes = [];
    const grid = this.src.terrain();
    const H = grid.length;
    const W = grid[0]?.length ?? 0;
    const S = TERRAIN_SUB;
    const hash = (a: number, b: number, k: number) => {
      const h = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
      return h - Math.floor(h);
    };
    const tileT = (i: number, j: number): number => {
      const row = grid[j];
      if (!row || i < 0 || i >= W) return TERRAIN.ROCK;
      return baseTerrain(row[i]!);
    };
    const hOf = (t: number) => heightOf(t * 4);
    const isWall = (t: number) => hOf(t) > 0.5;
    const SEA_H = TERRAIN_HEIGHT_3D.SEA ?? -1;

    // terreno de cada triángulo: el del tile bajo su centro, corrido por un ruido
    // suave — los límites entre terrenos caminables quedan ondulados y en
    // diagonal, no siguiendo la grilla. Nunca invade una pared ni el mar.
    const wobble = (x: number, z: number) => [
      Math.sin(x * 1.3 + z * 0.7) * 0.28 + Math.sin(x * 0.45 - z * 1.9 + 1.7) * 0.2,
      Math.sin(z * 1.1 - x * 0.8 + 0.4) * 0.28 + Math.sin(z * 0.5 + x * 1.7 + 2.3) * 0.2,
    ];
    const triT = (cx: number, cz: number): number => {
      const t = tileT(Math.floor(cx), Math.floor(cz));
      if (isWall(t) || t === TERRAIN.SEA) return t;
      const [dx, dz] = wobble(cx, cz);
      const n = tileT(Math.floor(cx + dx!), Math.floor(cz + dz!));
      return isWall(n) || n === TERRAIN.SEA ? t : n;
    };

    // alturas en los vértices de la malla fina
    const GW = W * S + 1;
    const GH = H * S + 1;
    const hgt = new Float32Array(GW * GH);
    const px = new Float32Array(GW * GH);
    const pz = new Float32Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        // los 4 tiles (no subceldas) que tocan este vértice
        // las 4 subceldas alrededor del vértice → sus tiles
        const ts: number[] = [];
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
          ts.push(tileT(Math.floor((gx + dx) / S), Math.floor((gy + dy) / S)));
        }
        const hs = ts.map(hOf);
        const lo = Math.min(...hs);
        const hi = Math.max(...hs);
        let h: number;
        if (lo === hi) {
          // adentro de un solo terreno: lomo irregular en paredes, leve ondulación en el piso
          h = isWall(ts[0]!) ? hi * (0.82 + hash(gx, gy, 1) * 0.3) : hi === SEA_H ? SEA_H : hi + (hash(gx, gy, 2) - 0.5) * 0.06;
        } else if (hi > 0.5) {
          // borde de una pared: al nivel del piso (la pared sube adentro de su tile)
          h = lo <= SEA_H ? SEA_H * 0.4 : lo;
        } else {
          // costa: la arena baja en declive al agua
          h = SEA_H * 0.45 + (hash(gx, gy, 4) - 0.5) * 0.15;
        }
        const k = gy * GW + gx;
        hgt[k] = h;
        // corrimiento horizontal leve (no en el borde del mapa)
        const edge = gx === 0 || gy === 0 || gx === GW - 1 || gy === GH - 1;
        const jx = edge ? 0 : (hash(gx, gy, 5) - 0.5) * (0.35 / S);
        const jz = edge ? 0 : (hash(gx, gy, 6) - 0.5) * (0.35 / S);
        px[k] = gx / S + jx;
        pz[k] = gy / S + jz;
      }
    }
    // el anillo de vértices justo adentro de una pared también queda alto pero
    // dentado: arriba del borde, la barranca no es una línea recta
    for (let gy = 1; gy < GH - 1; gy++) {
      for (let gx = 1; gx < GW - 1; gx++) {
        const k = gy * GW + gx;
        const t = tileT(Math.floor(gx / S - 0.0001), Math.floor(gy / S - 0.0001));
        if (!isWall(t)) continue;
        const nearEdge = [hgt[k - 1]!, hgt[k + 1]!, hgt[k - GW]!, hgt[k + GW]!].some((v) => v < 0.5);
        if (nearEdge && hgt[k]! > 0.5) hgt[k] = hOf(t) * (0.55 + hash(gx, gy, 7) * 0.45);
      }
    }

    const groups = new Map<string, { terrain: number; face: 'top' | 'side'; pos: number[]; uv: number[] }>();
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const tri = (base: number, a: number, b: number, c: number) => {
      va.set(px[a]!, hgt[a]!, pz[a]!);
      vb.set(px[b]!, hgt[b]!, pz[b]!);
      vc.set(px[c]!, hgt[c]!, pz[c]!);
      const t = isWall(base) || base === TERRAIN.SEA ? base : triT((va.x + vb.x + vc.x) / 3, (va.z + vb.z + vc.z) / 3);
      const n = vb.clone().sub(va).cross(vc.clone().sub(va)).normalize();
      if (n.y < 0) n.negate();
      // empinado y de pared → cara de barranca (estratos); si no, tapa
      const face: 'top' | 'side' = n.y < 0.6 && (isWall(t) || t === TERRAIN.SEA) ? 'side' : 'top';
      const tt = t === TERRAIN.SEA ? TERRAIN.SAND_WET : t;
      const key = `${face}:${tt}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { terrain: tt, face, pos: [], uv: [] }));
      for (const v of [va, vb, vc]) {
        g.pos.push(v.x, v.y, v.z);
        if (face === 'top') g.uv.push(v.x / TEX_TILES, -v.z / TEX_TILES);
        else g.uv.push((Math.abs(n.x) > Math.abs(n.z) ? v.z : v.x) / TEX_TILES, v.y / TEX_TILES);
      }
    };
    for (let sy = 0; sy < H * S; sy++) {
      for (let sx = 0; sx < W * S; sx++) {
        const t = tileT(Math.floor(sx / S), Math.floor(sy / S));
        const a = sy * GW + sx;
        const b = a + 1;
        const c = a + GW;
        const d = c + 1;
        // diagonal alternada al azar: sin dibujo de grilla
        if (hash(sx, sy, 8) < 0.5) {
          tri(t, a, c, b);
          tri(t, b, c, d);
        } else {
          tri(t, a, c, d);
          tri(t, a, d, b);
        }
      }
    }
    // piso debajo de las paredes: si una pared se recorta para dejar ver al
    // jugador, se ve tierra y no el mar que corre por debajo del mapa
    const under = { terrain: TERRAIN.ROCK, face: 'top' as const, pos: [] as number[], uv: [] as number[] };
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        if (!isWall(tileT(i, j))) continue;
        const y = -0.08;
        const q = [
          [i, j + 1],
          [i + 1, j + 1],
          [i + 1, j],
          [i, j],
        ];
        for (const idx of [0, 1, 2, 0, 2, 3]) {
          under.pos.push(q[idx]![0]!, y, q[idx]![1]!);
          under.uv.push(q[idx]![0]! / TEX_TILES, -q[idx]![1]! / TEX_TILES);
        }
      }
    }
    groups.set('under', under);

    for (const g of groups.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.computeVertexNormals(); // sin índices: normal por cara → facetado
      const mesh = new THREE.Mesh(geo, this.terrainMaterial(g.terrain, g.face));
      mesh.receiveShadow = true;
      mesh.castShadow = g.face === 'side' || isWall(g.terrain);
      this.scene3.add(mesh);
      this.terrainMeshes.push(mesh);
    }
    if (this.terrainBuilt < 0) this.scatterDetail(grid);
    this.terrainBuilt = this.src.terrainVersion();
  }

  private readonly terrainMats = new Map<string, THREE.MeshLambertMaterial>();

  private terrainMaterial(terrain: number, face: 'top' | 'side'): THREE.MeshLambertMaterial {
    const key = `${face}:${terrain}`;
    const cached = this.terrainMats.get(key);
    if (cached) return cached;
    const tex = terrainTexture(terrain, face);
    // emissive con la misma textura: el piso conserva la paleta aunque el sol
    // venga bajo (amanecer, tarde) — la luz tiñe, no apaga. TURN_LIGHT.glow lo baja de noche
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: TERRAIN_GLOW * this.light.cur.glow,
    });
    // recorte: solo donde una pared tapa al jugador en pantalla (una elipse
    // alrededor de su sprite, ver render) y la pared está más cerca de la
    // cámara que él. Antes se tramaba toda pared en una caja delante del
    // jugador, aunque no lo tapara: en las esquinas quedaban muros "transparentes".
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFocus = this.focus;
      sh.uniforms.uCut = this.cut;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform vec3 uFocus;\nuniform vec4 uCut;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          if (vWPos.y > 0.3 && vWPos.z > uFocus.z + 0.15) {
            float d = length((gl_FragCoord.xy - uCut.xy) / uCut.zw);
            if (d < 0.8) discard;
            if (d < 1.0 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
          }`,
        );
    };
    this.terrainMats.set(key, mat);
    return mat;
  }

  /** Piedritas y matas de pasto seco sueltas: solo decoración (no chocan), fija
   * por tile (mismo hash siempre), para que el piso no sea una lámina lisa. */
  private scatterDetail(grid: number[][]): void {
    const hash = (i: number, j: number, k: number) => {
      const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
      return h - Math.floor(h);
    };
    const stones: THREE.Matrix4[] = [];
    const tufts: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const grassy = new Set<number>([TERRAIN.MESA, TERRAIN.CANYON, TERRAIN.SCRUB, TERRAIN.CLAY]);
    const stony = new Set<number>([TERRAIN.MESA, TERRAIN.CANYON, TERRAIN.CLAY, TERRAIN.PEBBLE, TERRAIN.SAND_DRY]);
    for (let j = 0; j < grid.length; j++) {
      for (let i = 0; i < grid[j]!.length; i++) {
        const t = baseTerrain(grid[j]![i]!);
        if (stony.has(t) && hash(i, j, 1) < (t === TERRAIN.PEBBLE ? 0.25 : 0.06)) {
          const s = 0.1 + hash(i, j, 2) * 0.16;
          e.set(hash(i, j, 3) * 3, hash(i, j, 4) * 3, 0);
          m.compose(v.set(i + hash(i, j, 5), s * 0.4, j + hash(i, j, 6)), q.setFromEuler(e), sc.set(s, s * 0.7, s));
          stones.push(m.clone());
        }
        if (grassy.has(t) && hash(i, j, 7) < 0.07) {
          const s = 0.9 + hash(i, j, 8) * 0.7;
          e.set(0, hash(i, j, 9) * 6, 0);
          m.compose(v.set(i + hash(i, j, 10), 0, j + hash(i, j, 11)), q.setFromEuler(e), sc.set(s, s, s));
          tufts.push(m.clone());
        }
      }
    }
    const stoneMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: PAL.grey, flatShading: true }),
      stones.length,
    );
    stones.forEach((mt, k) => stoneMesh.setMatrixAt(k, mt));
    stoneMesh.castShadow = stoneMesh.receiveShadow = true;
    // mata de coirón: un puñado de hojas finas (conos) abiertas en abanico
    const blades: THREE.BufferGeometry[] = [];
    for (let b = 0; b < 7; b++) {
      const c = new THREE.ConeGeometry(0.06, 0.7, 3);
      c.translate(0, 0.35, 0);
      c.rotateZ(Math.cos(b * 0.9) * 0.45);
      c.rotateY((b / 7) * Math.PI * 2);
      blades.push(c);
    }
    const tuftGeo = mergeGeometries(blades);
    const tuftMesh = new THREE.InstancedMesh(tuftGeo, new THREE.MeshLambertMaterial({ color: PAL.wheat }), tufts.length);
    tufts.forEach((mt, k) => tuftMesh.setMatrixAt(k, mt));
    tuftMesh.castShadow = true;
    this.scene3.add(stoneMesh, tuftMesh);
  }

  private buildSea(): void {
    const geo = new THREE.PlaneGeometry(240, 300, 120, 150);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: PAL.seaLight,
      emissive: 0x1d3a42,
      roughness: 0.4,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wp = modelMatrix * vec4(position, 1.0);
          transformed.y += sin(wp.x * 0.45 + uTime * 1.2) * 0.12 + cos(wp.z * 0.6 + uTime * 0.9) * 0.1;`,
        );
    };
    this.seaMat = mat;
    const sea = new THREE.Mesh(geo, mat);
    sea.position.set(32, -0.45, 60);
    sea.receiveShadow = true;
    this.scene3.add(sea);
  }

  // ---------------------------------------------------------------- objetos

  private texFor(go: Phaser.GameObjects.Image): THREE.Texture {
    const srcImg = go.frame.source.image as TexImageSource;
    let base = this.sources.get(srcImg);
    if (!base) {
      base = srcImg instanceof HTMLCanvasElement ? new THREE.CanvasTexture(srcImg) : new THREE.Texture(srcImg as HTMLImageElement);
      base.colorSpace = THREE.SRGBColorSpace;
      base.magFilter = base.minFilter = THREE.NearestFilter;
      base.generateMipmaps = false;
      base.needsUpdate = true;
      this.sources.set(srcImg, base);
    }
    const t = base.clone();
    t.needsUpdate = true;
    return t;
  }

  private setFrame(tex: THREE.Texture, frame: Phaser.Textures.Frame): void {
    const w = frame.source.width;
    const h = frame.source.height;
    tex.repeat.set(frame.cutWidth / w, frame.cutHeight / h);
    tex.offset.set(frame.cutX / w, 1 - (frame.cutY + frame.cutHeight) / h);
  }

  private makeMirror(go: Phaser.GameObjects.GameObject): Mirror | null {
    if (go instanceof Phaser.GameObjects.Rectangle) {
      if (go.scrollFactorX === 0) return null; // la capa de luz 2D
      // la pila de cajones: tablones bajos en el piso
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(go.width * PX, 0.15, go.height * PX),
        new THREE.MeshLambertMaterial({ color: PAL.soil2 }),
      );
      box.receiveShadow = true;
      return { kind: 'model', obj: box, lift: 0.075 };
    }
    if (!(go instanceof Phaser.GameObjects.Image) && !(go instanceof Phaser.GameObjects.Sprite)) return null;
    const key = go.texture.key;
    if (key === 'tiles') return null;
    if (key.includes('mimosa')) {
      // el 2D lo pone pegado al borde del mapa; en 3D va mar adentro, de costado
      const ship = World3D.mimosa();
      const holder = new THREE.Group();
      holder.add(ship.obj);
      ship.obj.position.z = 3;
      return { kind: 'model', obj: holder, lift: 0, update: ship.update };
    }
    if (key === 'prop_cajon') return { kind: 'model', obj: crate() };
    if (key === 'prop_jarilla') return { kind: 'model', obj: bush() };
    if (key === 'prop_fogon') {
      const f = fire();
      return { kind: 'model', obj: f.group, update: f.update };
    }
    if (key === 'prop_cueva') return { kind: 'model', obj: caveMouth() };

    const tex = this.texFor(go as Phaser.GameObjects.Image);
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: SPRITE_GLOW * this.light.cur.glow,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    const flat = key.includes('manantial') || key.includes('algas');
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, flat ? 0 : 0.5, 0);
    if (flat) geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !flat;
    mesh.receiveShadow = flat;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    if (!flat) mesh.rotation.x = -SPRITE_TILT;
    return { kind: flat ? 'flat' : 'billboard', obj: mesh, mat, tex, lift: key.includes('gaviotas') ? 5 : flat ? 0.03 : 0 };
  }

  private sync(t: number, dt: number): void {
    const seen = new Set<Phaser.GameObjects.GameObject>();
    for (const go of this.src.objects ? this.src.objects() : this.src.scene.children.list) {
      if (this.ignored.has(go)) continue;
      let m = this.mirrors.get(go);
      if (!m) {
        const made = this.makeMirror(go);
        if (!made) {
          this.ignored.add(go);
          continue;
        }
        m = made;
        m.zBias = (this.mirrorCount++ % 11) * 0.004;
        this.mirrors.set(go, m);
        this.scene3.add(m.obj);
      }
      seen.add(go);
      const g = go as Phaser.GameObjects.Image;
      m.obj.visible = g.visible;
      if (!g.visible) continue;
      const w = g.displayWidth * PX;
      const h = g.displayHeight * PX;
      if (m.kind === 'billboard') {
        // los pies (borde de abajo del sprite) sobre el piso, en la fila donde pisan
        m.obj.position.set(g.x * PX, m.lift ?? 0, (g.y + g.displayHeight * (1 - g.originY)) * PX + (m.zBias ?? 0));
        m.obj.scale.set(w, h * SPRITE_STRETCH, 1);
        if (!m.lift) this.walk(m, g, dt);
      } else if (m.kind === 'flat') {
        m.obj.position.set(g.x * PX, m.lift ?? 0, g.y * PX);
        m.obj.scale.set(w, 1, h);
      } else {
        m.obj.position.set(g.x * PX, m.lift ?? 0, g.y * PX);
      }
      if (m.tex && g.frame) this.setFrame(m.tex, g.frame);
      if (m.mat) {
        m.mat.opacity = g.alpha;
        m.mat.transparent = g.alpha < 1;
      }
      m.update?.(t);
    }
    for (const [go, m] of this.mirrors) {
      if (seen.has(go)) continue;
      this.scene3.remove(m.obj);
      m.tex?.dispose();
      this.mirrors.delete(go);
    }
  }

  // ---------------------------------------------------------------- caminata

  /**
   * Los sprites tienen un solo cuadro por dirección (sin ciclo de caminata): sin
   * esto se deslizan por el piso. Cada paso es un saltito, un balanceo de lado a
   * lado apoyado en los pies y una nube de polvo. La cadencia sale de la
   * velocidad real, así que más lento (arena, sobrecarga) = pasos más lentos.
   */
  private walk(m: Mirror, g: Phaser.GameObjects.Image, dt: number): void {
    const w = (m.walk ??= { x: g.x, y: g.y, phase: 0, amp: 0 });
    const dist = Math.hypot(g.x - w.x, g.y - w.y) * PX; // tiles
    w.x = g.x;
    w.y = g.y;
    // un salto de más de un tile en un cuadro es un teletransporte (movesTo,
    // despertarse en el campamento), no una caminata
    const moving = dt > 0 && dist > 0.002 && dist < 1;
    w.amp += ((moving ? 1 : 0) - w.amp) * Math.min(1, dt * 12);
    if (moving) {
      const before = Math.floor(w.phase / Math.PI);
      w.phase += dist * WALK.stepsPerTile * Math.PI;
      if (Math.floor(w.phase / Math.PI) !== before) this.puff(m.obj.position);
    } else if (w.amp < 0.02) {
      w.phase = 0;
    }
    const step = Math.sin(w.phase);
    m.obj.position.y += Math.abs(step) * WALK.hop * w.amp;
    m.obj.rotation.z = step * WALK.sway * w.amp;
  }

  private readonly dust: { mesh: THREE.Mesh; age: number }[] = [];
  private dustNext = 0;

  private puff(at: THREE.Vector3): void {
    if (!this.dust.length) {
      const mat = new THREE.MeshBasicMaterial({ color: PAL.sandLight, transparent: true, opacity: 0, depthWrite: false });
      for (let i = 0; i < 12; i++) {
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat.clone());
        mesh.visible = false;
        this.scene3.add(mesh);
        this.dust.push({ mesh, age: 1 });
      }
    }
    const d = this.dust[this.dustNext++ % this.dust.length]!;
    d.age = 0;
    d.mesh.visible = true;
    d.mesh.position.set(at.x + (Math.random() - 0.5) * 0.3, 0.12, at.z + 0.1);
  }

  private stepDust(dt: number): void {
    for (const d of this.dust) {
      if (!d.mesh.visible) continue;
      d.age += dt / WALK.dustSeconds;
      if (d.age >= 1) {
        d.mesh.visible = false;
        continue;
      }
      d.mesh.scale.setScalar(0.6 + d.age * 1.4);
      d.mesh.position.y += dt * 0.6;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - d.age) * this.light.cur.glow;
    }
  }

  // ---------------------------------------------------------------- luz

  /** Lleva la luz al turno `turn` en `ms` milisegundos (0 = de golpe). La
   * decide WorldScene, no el reloj: así el atardecer se ve cuando el jugador
   * puede verlo, no en el medio de un diálogo. */
  setTurn(turn: string, ms: number): void {
    this.light.from = { ...this.light.cur };
    this.light.to = lightOf(turn);
    this.light.k = ms > 0 ? 0 : 1;
    this.light.ms = Math.max(1, ms);
    if (ms <= 0) this.light.cur = { ...this.light.to };
    this.applyLight();
  }

  private stepLight(dtMs: number): void {
    const L = this.light;
    if (L.k >= 1) return;
    L.k = Math.min(1, L.k + dtMs / L.ms);
    const e = L.k * L.k * (3 - 2 * L.k); // suave al principio y al final
    L.cur = mixLight(L.from, L.to, e);
    this.applyLight();
  }

  private applyLight(): void {
    const c = this.light.cur;
    this.sun.color.copy(c.sun);
    this.sun.intensity = c.sunI;
    this.sunOffset.copy(c.sunDir);
    this.hemi.color.copy(c.sky);
    this.hemi.groundColor.copy(c.ground);
    this.hemi.intensity = c.hemiI;
    if (!(this.scene3.background instanceof THREE.Color)) this.scene3.background = new THREE.Color();
    (this.scene3.background as THREE.Color).copy(c.fog);
    if (!this.scene3.fog) this.scene3.fog = new THREE.Fog(c.fog, 75, 170);
    (this.scene3.fog as THREE.Fog).color.copy(c.fog);
    this.lantern.intensity = c.lantern;
    for (const m of this.terrainMats.values()) m.emissiveIntensity = TERRAIN_GLOW * c.glow;
    if (this.seaMat) this.seaMat.emissiveIntensity = c.glow;
    for (const m of this.mirrors.values()) if (m.mat) m.mat.emissiveIntensity = SPRITE_GLOW * c.glow;
  }

  // ---------------------------------------------------------------- cuadro

  private fitToCanvas(): void {
    const canvas = this.src.scene.game.canvas;
    const parent = canvas.parentElement!;
    const r = canvas.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const k = r.height / VIEW.height;
    const left = r.left - pr.left;
    const top = r.top - pr.top + (this.view.fullScreen ? 0 : VIEW.world.y * k);
    const w = r.width;
    const h = this.view.fullScreen ? r.height : VIEW.world.h * k;
    const key = `${left}|${top}|${w}|${h}`;
    if (key === this.rect) return;
    this.rect = key;
    const el = this.renderer.domElement;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.hTilt && this.vTilt) {
      this.hTilt.uniforms.h!.value = 1.4 / w;
      this.vTilt.uniforms.v!.value = 1.4 / h;
    }
  }

  /** Proyecta el sprite del jugador a pantalla y deja ahí la elipse de recorte
   * (en píxeles del buffer, como gl_FragCoord), un poco más grande que el dibujo. */
  private updateCut(px: number, pz: number, w: number, h: number): void {
    this.camera.updateMatrixWorld();
    const size = this.renderer.getDrawingBufferSize(this.tmpV2);
    const toPx = (v: THREE.Vector3) => v.project(this.camera).set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y, 0);
    const feet = toPx(this.tmpA.set(px, 0, pz));
    const head = toPx(this.tmpB.set(px, h, pz));
    const side = toPx(this.tmpC.set(px + w / 2, h / 2, pz));
    const mid = this.tmpD.set((feet.x + head.x) / 2, (feet.y + head.y) / 2, 0);
    this.cut.value.set(mid.x, mid.y, Math.max(8, Math.abs(side.x - mid.x)) * 1.1, Math.max(8, Math.abs(head.y - feet.y) / 2) * 1.2);
  }
  private readonly tmpV2 = new THREE.Vector2();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();

  render(dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    this.time.value += dt;
    this.stepLight(dtMs);
    if (this.terrainBuilt !== this.src.terrainVersion()) this.buildTerrain();
    this.fitToCanvas();
    this.sync(this.time.value, dt);
    this.stepDust(dt);
    for (const u of this.extraUpdates) u(this.time.value);

    const p = this.src.player;
    const px = p.x * PX;
    const pz = (p.y + p.displayHeight * (1 - p.originY)) * PX;
    this.focus.value.set(px, 0, pz);
    const target = new THREE.Vector3(px, 0, pz - this.lookAhead).add(this.camOffset);
    // un salto grande (despertarse en el campamento, cambio de escena) no se
    // recorre en cámara lenta por medio mapa: se corta directo
    if (this.camera.position.distanceTo(target) > CAM_3D.snapDistance) this.camera.position.copy(target);
    else this.camera.position.lerp(target, 1 - Math.exp(-dt * CAM_3D.follow));
    this.camera.lookAt(this.camera.position.x, this.view.lookHeight ?? 0, this.camera.position.z - this.camOffset.z);
    if (this.view.cutaway === false) this.cut.value.set(-1e5, -1e5, 1, 1);
    else this.updateCut(px, pz, p.displayWidth * PX, p.displayHeight * PX * SPRITE_STRETCH);

    this.sun.position.set(px, 0, pz).add(this.sunOffset);
    this.sun.target.position.set(px, 0, pz);
    this.lantern.position.set(px, 2.5, pz + 0.5);

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene3, this.camera);
  }
}

// ---------------------------------------------------------------- props 3D

function crate(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5532 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a3220 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.75, 0.75), wood);
  box.position.y = 0.375;
  g.add(box);
  for (const x of [-0.42, 0.42]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.77, 0.77), dark);
    band.position.set(x, 0.375, 0);
    g.add(band);
  }
  g.rotation.y = 0.15;
  g.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  return g;
}

function bush(): THREE.Group {
  const g = new THREE.Group();
  const mats = [PAL.scrubDark, PAL.scrub, PAL.moss].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  const blobs: Array<[number, number, number, number]> = [
    [0, 0.45, 0, 0.5],
    [-0.4, 0.3, 0.15, 0.35],
    [0.4, 0.32, -0.1, 0.38],
    [0.1, 0.7, -0.15, 0.32],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mats[i % mats.length]!);
    m.position.set(x, y, z);
    m.rotation.set(i, i * 2, 0);
    m.castShadow = true;
    g.add(m);
  });
  return g;
}

function caveMouth(): THREE.Group {
  const g = new THREE.Group();
  // un afloramiento de arcilla con la boca de la cueva mirando al sur (a la
  // cámara): se lee como "cavada en el barranco", no como una carpa
  const geo = new THREE.BoxGeometry(3.4, 2.8, 2, 5, 4, 2);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 1.3;
    p.setXYZ(
      i,
      p.getX(i) + Math.sin(i * 12.9898) * 0.12,
      p.getY(i) + (top ? Math.sin(i * 78.233) * 0.25 : 0),
      p.getZ(i) + Math.sin(i * 39.425) * 0.12,
    );
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: PAL.clay, flatShading: true }));
  rock.position.set(0, 1.4, -0.8);
  rock.castShadow = rock.receiveShadow = true;
  g.add(rock);
  // boca: un arco (rectángulo + medio círculo) negro, apenas delante de la cara sur
  const arch = new THREE.Shape();
  arch.moveTo(-0.6, 0);
  arch.lineTo(-0.6, 1);
  arch.absarc(0, 1, 0.6, Math.PI, 0, true);
  arch.lineTo(0.6, 0);
  arch.lineTo(-0.6, 0);
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(arch, 8), new THREE.MeshBasicMaterial({ color: PAL.void }));
  mouth.position.set(0, 0.01, 0.25);
  g.add(mouth);
  return g;
}

function fire(): { group: THREE.Group; update: (t: number) => void } {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: PAL.grey, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), stone);
    s.position.set(Math.cos(a) * 0.8, 0.14, Math.sin(a) * 0.8);
    s.rotation.set(i, i * 1.7, 0);
    s.castShadow = true;
    g.add(s);
  }
  const log = new THREE.MeshLambertMaterial({ color: 0x4a3220 });
  for (const r of [0.5, -0.6, 1.6]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), log);
    l.rotation.set(Math.PI / 2, 0, r);
    l.position.y = 0.15;
    g.add(l);
  }
  const flames = [
    { c: 0xff7a2a, r: 0.36, h: 1.0, y: 0.6 },
    { c: 0xffb347, r: 0.24, h: 0.8, y: 0.55 },
    { c: 0xffe08a, r: 0.12, h: 0.5, y: 0.45 },
  ].map((f) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(f.r, f.h, 7), new THREE.MeshBasicMaterial({ color: f.c, transparent: true, opacity: 0.85 }));
    m.position.y = f.y;
    g.add(m);
    return m;
  });
  const light = new THREE.PointLight(0xff9a40, 4, 10, 1.6);
  light.position.y = 1.2;
  g.add(light);
  return {
    group: g,
    update: (t) => {
      flames.forEach((f, i) => {
        const k = 0.8 + Math.sin(t * (11 + i * 3)) * 0.12 + Math.sin(t * (6.3 + i)) * 0.08;
        f.scale.set(1, k, 1);
        f.rotation.y = t * (1 + i);
      });
      light.intensity = 3.6 + Math.sin(t * 13) * 0.5 + Math.sin(t * 7.1) * 0.4;
    },
  };
}

// ---------------------------------------------------------------- luz

interface Light {
  sun: THREE.Color;
  sunI: number;
  sunDir: THREE.Vector3;
  sky: THREE.Color;
  ground: THREE.Color;
  hemiI: number;
  fog: THREE.Color;
  lantern: number;
  glow: number;
}

function lightOf(turn: string): Light {
  const c = TURN_LIGHT[turn] ?? TURN_LIGHT.manana!;
  return {
    sun: new THREE.Color(c.sun),
    sunI: c.sunI,
    sunDir: new THREE.Vector3(...c.sunDir),
    sky: new THREE.Color(c.sky),
    ground: new THREE.Color(c.ground),
    hemiI: c.hemiI,
    fog: new THREE.Color(c.fog),
    lantern: c.lantern,
    glow: c.glow,
  };
}

function mixLight(a: Light, b: Light, k: number): Light {
  const n = (x: number, y: number) => x + (y - x) * k;
  return {
    sun: a.sun.clone().lerp(b.sun, k),
    sunI: n(a.sunI, b.sunI),
    sunDir: a.sunDir.clone().lerp(b.sunDir, k),
    sky: a.sky.clone().lerp(b.sky, k),
    ground: a.ground.clone().lerp(b.ground, k),
    hemiI: n(a.hemiI, b.hemiI),
    fog: a.fog.clone().lerp(b.fog, k),
    lantern: n(a.lantern, b.lantern),
    glow: n(a.glow, b.glow),
  };
}
