import Phaser from 'phaser';
import * as THREE from 'three';
import { CAM_MARCH, PAL, TURN_LIGHT, VIEW } from '@/config';
import { profileHeight, type MarchTrack } from '@/systems/MarchSystem';

/**
 * La marcha en vista lateral (prototipo del Nivel 2): una maqueta de la estepa
 * vista de costado, con la columna caminando hacia la derecha. Mismo lugar que
 * World3D (debajo del canvas de Phaser, en la franja del mundo) y mismo criterio
 * de luz por turno, pero su propia cámara y su propio terreno: un perfil largo a
 * lo largo del camino, con sierras de fondo y mucho cielo.
 *
 * MarchScene es dueña de la lógica (MarchSystem) y le pasa cada cuadro dónde
 * está cada uno; esto solo dibuja.
 */

export interface MarchActor {
  id: string;
  /** textura de Phaser (hoja de 4 direcciones) o 'horse' para un caballo de carga */
  texture: string;
  /** corrimiento en profundidad (tiles): la columna no va en fila perfecta */
  z: number;
}

interface ActorMesh {
  obj: THREE.Object3D;
  /** solo personajes: el plano con la textura */
  sprite?: THREE.Mesh;
  legs?: THREE.Object3D[];
  lastX: number;
  phase: number;
  amp: number;
  baseY: number;
}

/** el terreno va de bien adelante de la cámara (que está en z≈22) hasta el fondo */
const D = { near: 30, far: -46 };

export class MarchView3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene3 = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly actors = new Map<string, ActorMesh>();
  private readonly wisps: THREE.Mesh[] = [];
  private readonly camPos = new THREE.Vector3();
  private rect = '';
  private time = 0;
  private skyMat: THREE.MeshBasicMaterial | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly track: MarchTrack,
    actors: MarchActor[],
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const el = this.renderer.domElement;
    el.style.cssText = 'position:absolute; left:0; top:0; z-index:-1; pointer-events:none;';
    const parent = scene.game.canvas.parentElement!;
    parent.style.position = 'relative';
    parent.style.isolation = 'isolate';
    parent.prepend(el);

    this.camera = new THREE.PerspectiveCamera(CAM_MARCH.fov, VIEW.world.w / VIEW.world.h, 0.5, 400);
    this.scene3.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0008;

    this.buildSky();
    this.buildMountains();
    this.buildTerrain();
    this.buildRiver();
    this.scatterProps();
    this.buildWisps();
    for (const a of actors) this.addActor(a);
    this.setTurn('manana');
  }

  // ---------------------------------------------------------------- escenario

  private buildSky(): void {
    const geo = new THREE.PlaneGeometry(900, 90, 1, 12);
    const colors: number[] = [];
    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++) colors.push(1, 1, 1);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // sin tone mapping: si no, el ACES de la escena lo lava a un blanco parejo
    this.skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, toneMapped: false });
    const sky = new THREE.Mesh(geo, this.skyMat);
    // a la distancia y la altura que la cámara (mirando apenas hacia abajo) ve por
    // encima de las sierras: así el degradé se ve entero, no solo el horizonte
    sky.position.set(this.track.lengthTiles / 2, 30, -150);
    sky.renderOrder = -10;
    this.scene3.add(sky);
  }

  /** Pinta el cielo de arriba (hondo) al horizonte (claro, del color de la bruma). */
  private paintSky(top: THREE.Color, horizon: THREE.Color): void {
    const sky = this.scene3.children.find((o) => (o as THREE.Mesh).material === this.skyMat) as THREE.Mesh | undefined;
    if (!sky) return;
    const geo = sky.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position!;
    const col = geo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + 45) / 90; // 0 abajo, 1 arriba
      const k = Math.min(1, Math.max(0, (t - 0.2) / 0.7));
      const c = horizon.clone().lerp(top, k);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  private buildMountains(): void {
    // tres filas de sierras bajas, cada una más lejos y más azulada por la bruma:
    // la meseta patagónica no tiene cumbres, tiene bordes
    const rows: Array<[number, number, number]> = [
      [-60, 5, PAL.soil2],
      [-90, 8, PAL.grey],
      [-125, 12, PAL.slate],
    ];
    rows.forEach(([z, amp, color], r) => {
      const n = 120;
      const x0 = -80;
      const x1 = this.track.lengthTiles + 120;
      const shape = new THREE.Shape();
      shape.moveTo(x0, -10);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const h =
          amp * (0.55 + 0.3 * Math.sin(x * 0.031 + r * 1.7) + 0.15 * Math.sin(x * 0.11 + r)) +
          (Math.abs(Math.sin(x * 0.017 + r * 2.3)) > 0.93 ? amp * 0.4 : 0); // alguna mesa más alta
        shape.lineTo(x, h);
      }
      shape.lineTo(x1, -10);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color, flatShading: true }));
      mesh.position.z = z;
      this.scene3.add(mesh);
    });
  }

  private buildTerrain(): void {
    const L = this.track.lengthTiles;
    const x0 = -30;
    const x1 = L + 40;
    const segX = Math.round((x1 - x0) * 1.5);
    const segZ = 40;
    const geo = new THREE.PlaneGeometry(x1 - x0, D.near - D.far, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (D.near + D.far) / 2);
    const pos = geo.attributes.position!;
    const colors: number[] = [];
    const cSand = new THREE.Color(PAL.sand);
    const cSoil = new THREE.Color(PAL.soil2);
    const cDry = new THREE.Color(PAL.coiron);
    const cPath = new THREE.Color(PAL.sandLight);
    const cClay = new THREE.Color(PAL.clay);
    const cGreen = new THREE.Color(PAL.moss);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = noise(x, z);
      // el camino sigue el perfil; hacia atrás el terreno sube en lomadas
      let h = profileHeight(this.track, Math.max(0, Math.min(L, x)));
      if (z < -3) h += (-z - 3) * 0.09 * (0.6 + 0.4 * Math.sin(x * 0.07 + z * 0.13)) + n * 0.6;
      else h += n * 0.15 * Math.min(1, Math.abs(z) / 2);
      if (x > L) h = profileHeight(this.track, L) - Math.min(1.2, (x - L) * 0.2);
      pos.setY(i, h);
      // color: estepa ocre, la huella del camino más clara, el cañadón en arcilla,
      // y al final el verde apagado del valle (GDD §9: el verde saturado es del Nivel 10)
      const slope = Math.abs(profileHeight(this.track, x + 0.5) - profileHeight(this.track, x - 0.5));
      let c = cSand.clone().lerp(cSoil, 0.35 + 0.35 * n).lerp(cDry, Math.max(0, Math.sin(x * 0.21 + z * 0.4)) * 0.25);
      if (Math.abs(z) < 0.9 && x >= 0 && x <= L) c.lerp(cPath, 0.45);
      if (slope > 0.35) c = c.lerp(cClay, Math.min(1, slope));
      if (x > L - 14) c.lerp(cGreen, Math.min(1, (x - (L - 14)) / 14) * 0.7);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    this.scene3.add(mesh);
  }

  private buildRiver(): void {
    const L = this.track.lengthTiles;
    const y = profileHeight(this.track, L) - 0.5;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(60, D.near - D.far),
      new THREE.MeshLambertMaterial({ color: PAL.seaLight, emissive: 0x16323a, transparent: true, opacity: 0.9 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(L + 26, y, (D.near + D.far) / 2);
    this.scene3.add(water);
    // sauces en la orilla: lo primero que no es estepa en dos días
    const leaf = new THREE.MeshLambertMaterial({ color: PAL.moss, flatShading: true });
    const trunk = new THREE.MeshLambertMaterial({ color: PAL.soil });
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 5), trunk);
      t.position.y = 0.7;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 6), leaf);
      c.position.y = 2.3;
      c.castShadow = true;
      g.add(t, c);
      const x = L + 4 + i * 2.7 + hash(i, 3) * 1.5;
      const z = -4 - hash(i, 7) * 18;
      g.position.set(x, profileHeight(this.track, L) - 0.2, z);
      g.scale.setScalar(0.8 + hash(i, 9) * 0.6);
      this.scene3.add(g);
    }
  }

  private scatterProps(): void {
    const L = this.track.lengthTiles;
    const coiron = new THREE.MeshLambertMaterial({ color: PAL.coiron, flatShading: true });
    const bush = new THREE.MeshLambertMaterial({ color: PAL.scrubDark, flatShading: true });
    const stone = new THREE.MeshLambertMaterial({ color: PAL.grey, flatShading: true });
    const cone = new THREE.ConeGeometry(0.14, 0.55, 4);
    const ico = new THREE.IcosahedronGeometry(0.4, 0);
    const rock = new THREE.DodecahedronGeometry(0.22, 0);
    for (let i = 0; i < 420; i++) {
      const x = -20 + hash(i, 1) * (L + 40);
      const z = D.far * 0.55 + hash(i, 2) * (8 - D.far * 0.55);
      if (Math.abs(z) < 1.2) continue; // el camino queda libre
      const kind = hash(i, 4);
      let m: THREE.Object3D;
      if (kind < 0.55) {
        m = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const c = new THREE.Mesh(cone, coiron);
          c.position.set((hash(i, 10 + k) - 0.5) * 0.3, 0.25, (hash(i, 20 + k) - 0.5) * 0.3);
          c.rotation.z = (hash(i, 30 + k) - 0.5) * 0.6;
          (m as THREE.Group).add(c);
        }
      } else if (kind < 0.85) {
        m = new THREE.Mesh(ico, bush);
        m.scale.set(1, 0.7, 1);
        m.position.y = 0.2;
        (m as THREE.Mesh).castShadow = true;
      } else {
        m = new THREE.Mesh(rock, stone);
      }
      const holder = new THREE.Group();
      holder.add(m);
      const h = profileHeight(this.track, Math.max(0, Math.min(L, x)));
      const back = z < -3 ? (-z - 3) * 0.09 * (0.6 + 0.4 * Math.sin(x * 0.07 + z * 0.13)) + noise(x, z) * 0.6 : noise(x, z) * 0.15;
      holder.position.set(x, h + back, z);
      holder.scale.setScalar(0.8 + hash(i, 5) * 0.8);
      this.scene3.add(holder);
    }
  }

  /** Briznas que cruza el viento: el oeste es una presencia, no un dato. */
  private buildWisps(): void {
    const mat = new THREE.MeshBasicMaterial({ color: PAL.sandLight, transparent: true, opacity: 0.5, depthWrite: false });
    const geo = new THREE.PlaneGeometry(0.5, 0.03);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.position.set(hash(i, 40) * 30, 0.6 + hash(i, 41) * 3, -2 - hash(i, 42) * 10);
      m.userData.v = 6 + hash(i, 43) * 6;
      this.wisps.push(m);
      this.scene3.add(m);
    }
  }

  // ---------------------------------------------------------------- columna

  private addActor(a: MarchActor): void {
    if (a.texture === 'horse') {
      const h = horse();
      this.scene3.add(h.obj);
      this.actors.set(a.id, { obj: h.obj, legs: h.legs, lastX: 0, phase: hash(a.id.length, 3) * 3, amp: 0, baseY: 0 });
      h.obj.position.z = a.z;
      return;
    }
    const tex = this.scene.textures.get(a.texture);
    const frame = tex.get(2); // de costado, mirando a la derecha (FACING_FRAME.east)
    const src = frame.source.image as HTMLImageElement | HTMLCanvasElement;
    const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    const w = frame.source.width;
    const hh = frame.source.height;
    t.repeat.set(frame.cutWidth / w, frame.cutHeight / hh);
    t.offset.set(frame.cutX / w, 1 - (frame.cutY + frame.cutHeight) / hh);
    const mat = new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45, alphaTest: 0.5, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const sprite = new THREE.Mesh(geo, mat);
    sprite.castShadow = true;
    sprite.customDepthMaterial = new THREE.MeshDepthMaterial({ map: t, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    const H = CAM_MARCH.spriteHeight;
    sprite.scale.set((H * frame.cutWidth) / frame.cutHeight, H, 1);
    const holder = new THREE.Group();
    holder.add(sprite);
    holder.position.z = a.z;
    this.scene3.add(holder);
    this.actors.set(a.id, { obj: holder, sprite, lastX: 0, phase: hash(a.id.length, 5) * 3, amp: 0, baseY: 0 });
  }

  /** Luz del turno (TURN_LIGHT, config.ts): la misma que el mundo de arriba. */
  setTurn(turn: string): void {
    const c = TURN_LIGHT[turn] ?? TURN_LIGHT.manana!;
    this.sun.color.set(c.sun);
    this.sun.intensity = c.sunI * 0.9;
    // el sol de costado: de la izquierda a la mañana, de la derecha a la tarde, siempre algo de frente
    this.sunDir.set(c.sunDir[0] * 0.8, c.sunDir[1], 10 + Math.abs(c.sunDir[2]));
    this.hemi.color.set(c.sky);
    this.hemi.groundColor.set(c.ground);
    this.hemi.intensity = c.hemiI;
    const fog = new THREE.Color(c.fog);
    this.scene3.background = fog;
    this.scene3.fog = new THREE.Fog(fog, 60, 190);
    // arriba, un celeste patagónico lavado (de día) o casi negro (de noche)
    const top = new THREE.Color(c.sky).lerp(new THREE.Color(turn === 'noche' ? PAL.void : 0x6d93ad), turn === 'noche' ? 0.85 : 0.75);
    this.paintSky(top, fog);
    for (const a of this.actors.values()) {
      const m = a.sprite?.material as THREE.MeshLambertMaterial | undefined;
      if (m) m.emissiveIntensity = 0.45 * c.glow;
    }
  }
  private readonly sunDir = new THREE.Vector3();

  /**
   * Un cuadro: `focusX` es el jugador (la cámara lo sigue), `xs` dónde está cada
   * uno de la columna (tiles a lo largo del camino).
   */
  render(dtMs: number, focusX: number, xs: Record<string, number>): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    this.time += dt;
    this.fitToCanvas();
    const L = this.track.lengthTiles;

    for (const [id, a] of this.actors) {
      const x = xs[id];
      if (x === undefined) continue;
      const moved = Math.abs(x - a.lastX);
      const moving = moved > 0.0005 && moved < 2;
      a.amp += ((moving ? 1 : 0) - a.amp) * Math.min(1, dt * 10);
      a.phase += moved * 2.2 * Math.PI;
      a.lastX = x;
      const y = profileHeight(this.track, Math.max(0, Math.min(L, x)));
      const step = Math.sin(a.phase);
      if (a.sprite) {
        a.obj.position.set(x, y + Math.abs(step) * 0.12 * a.amp, a.obj.position.z);
        a.sprite.rotation.z = step * 0.06 * a.amp;
      } else {
        // caballo: se inclina con la pendiente y mueve las patas
        const slope = profileHeight(this.track, x + 0.6) - profileHeight(this.track, x - 0.6);
        a.obj.position.set(x, y, a.obj.position.z);
        a.obj.rotation.z = Math.atan2(slope, 1.2);
        a.legs?.forEach((leg, i) => (leg.rotation.z = Math.sin(a.phase * 0.5 + (i % 2) * Math.PI) * 0.45 * a.amp));
      }
    }

    // cámara de costado, siguiendo al jugador con suavidad
    const fy = profileHeight(this.track, Math.max(0, Math.min(L, focusX)));
    const target = new THREE.Vector3(focusX + CAM_MARCH.lookAhead, fy + CAM_MARCH.height, CAM_MARCH.distance);
    if (this.camPos.lengthSq() === 0 || this.camPos.distanceTo(target) > 30) this.camPos.copy(target);
    else this.camPos.lerp(target, 1 - Math.exp(-dt * CAM_MARCH.follow));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camPos.x, fy + CAM_MARCH.lookHeight, 0);

    this.sun.position.set(focusX, 0, 0).add(this.sunDir);
    this.sun.target.position.set(focusX, 0, 0);

    for (const w of this.wisps) {
      w.position.x += (w.userData.v as number) * dt;
      if (w.position.x > focusX + 18) w.position.x = focusX - 18 - Math.random() * 6;
      const m = w.material as THREE.MeshBasicMaterial;
      m.opacity = 0.35 + 0.25 * Math.sin(this.time * 3 + w.position.z);
    }

    this.renderer.render(this.scene3, this.camera);
  }

  private fitToCanvas(): void {
    const canvas = this.scene.game.canvas;
    const parent = canvas.parentElement!;
    const r = canvas.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const k = r.height / VIEW.height;
    const left = r.left - pr.left;
    const top = r.top - pr.top + VIEW.world.y * k;
    const w = r.width;
    const h = VIEW.world.h * k;
    const key = `${left}|${top}|${w}|${h}`;
    if (key === this.rect) return;
    this.rect = key;
    const el = this.renderer.domElement;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy(): void {
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}

/** Caballo de carga low-poly, mirando a la derecha, con los bultos a los costados. */
function horse(): { obj: THREE.Group; legs: THREE.Object3D[] } {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: PAL.clayDark, flatShading: true });
  const pack = new THREE.MeshLambertMaterial({ color: PAL.sand, flatShading: true });
  const rope = new THREE.MeshLambertMaterial({ color: PAL.soil, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.55), coat);
  body.position.y = 1.25;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.32), coat);
  neck.position.set(0.85, 1.65, 0);
  neck.rotation.z = -0.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.28), coat);
  head.position.set(1.18, 1.95, 0);
  head.rotation.z = -0.35;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), rope);
  tail.position.set(-0.9, 1.1, 0);
  tail.rotation.z = 0.35;
  const bagL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.3), pack);
  bagL.position.set(-0.05, 1.3, 0.42);
  const bagR = bagL.clone();
  bagR.position.z = -0.42;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.6), pack);
  top.position.set(-0.05, 1.72, 0);
  g.add(body, neck, head, tail, bagL, bagR, top);
  const legs: THREE.Object3D[] = [];
  for (const [lx, lz] of [
    [0.65, 0.18],
    [0.65, -0.18],
    [-0.65, 0.18],
    [-0.65, -0.18],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.95, lz);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.95, 0.13), coat);
    leg.position.y = -0.47;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  g.scale.setScalar(0.95);
  return { obj: g, legs };
}

function hash(a: number, b: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Ruido suave determinista en el plano (0..1). */
function noise(x: number, z: number): number {
  return 0.5 + 0.25 * Math.sin(x * 0.23 + z * 0.31) + 0.15 * Math.sin(x * 0.61 - z * 0.47) + 0.1 * Math.sin(x * 1.37 + z * 1.11);
}
