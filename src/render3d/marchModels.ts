/**
 * Modelos 3D low-poly de la marcha, hechos por código (no hay .glb todavía):
 * el caballo de carga articulado, los toldos, el fuerte de barro, los sauces y
 * la vegetación de la estepa. Todo con los colores de PAL y sombreado plano,
 * como el resto del mundo HD-2D: los personajes siguen siendo sprites.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '@/config';

const lambert = (color: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Número pseudoaleatorio estable (0..1) para variar sin azar entre partidas. */
export function hash(a: number, b: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function shadows(o: THREE.Object3D): void {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      (m as THREE.Mesh).castShadow = true;
      (m as THREE.Mesh).receiveShadow = true;
    }
  });
}

/** Un segmento de cilindro que va de `a` a `b` (para cuellos, patas, palos). */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, seg = 6): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, dir.length(), seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// ---------------------------------------------------------------- caballo

export type HorseLoad = 'barriles' | 'bultos' | 'suelto';

export interface HorseModel {
  obj: THREE.Group;
  /** pivote de cada pata (hombro o cadera), con `userData.knee` = pivote de la rodilla */
  legs: THREE.Object3D[];
  /** pivote del cuello, para cabecear al caminar o bajar la cabeza a pastar */
  neck: THREE.Object3D;
}

/** Pelajes de caballo criollo, de PAL: zaino, oscuro, bayo, tordillo. */
const COATS = [PAL.clayDark, PAL.soil, PAL.clayLight, PAL.grey];

/**
 * Caballo criollo de costado, mirando a +x, con el lomo a ~1.55 de alto.
 * `load`: dos barriles de agua, bultos de ropa y víveres, o suelto (sin carga).
 */
export function horse(load: HorseLoad, variant = 0): HorseModel {
  const g = new THREE.Group();
  const coat = lambert(COATS[variant % COATS.length]!);
  const dark = lambert(PAL.void);
  const hoofM = lambert(PAL.ink);

  // el cuerpo: barril, pecho y anca, un poco más angosto que alto
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.95, 3, 8), coat);
  torso.rotation.z = Math.PI / 2;
  torso.scale.set(1, 1, 0.82);
  torso.position.set(0, 1.25, 0);
  const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), coat);
  chest.scale.set(1, 1.05, 0.8);
  chest.position.set(0.55, 1.24, 0);
  const rump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), coat);
  rump.scale.set(1, 1, 0.84);
  rump.position.set(-0.58, 1.3, 0);
  g.add(torso, chest, rump);

  // cuello y cabeza, en un pivote que puede cabecear
  const neck = new THREE.Group();
  neck.position.set(0.68, 1.42, 0);
  g.add(neck);
  neck.add(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.42, 0.58, 0), 0.25, 0.15, coat));
  const mane = limb(new THREE.Vector3(-0.1, 0.18, 0), new THREE.Vector3(0.32, 0.74, 0), 0.07, 0.05, dark, 4);
  mane.scale.z = 0.6;
  neck.add(mane);
  const head = new THREE.Group();
  head.position.set(0.44, 0.64, 0);
  head.rotation.z = -0.95;
  neck.add(head);
  const skull = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.6, 6), coat);
  skull.rotation.z = -Math.PI / 2;
  skull.position.set(0.22, 0, 0);
  skull.scale.z = 0.8;
  head.add(skull);
  for (const ez of [-0.06, 0.06]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), coat);
    ear.position.set(-0.04, 0.14, ez);
    ear.rotation.z = 0.5;
    head.add(ear);
  }
  // el cabestro: una vuelta oscura en el hocico
  const halter = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 4, 8), dark);
  halter.rotation.y = Math.PI / 2;
  halter.position.set(0.34, 0, 0);
  head.add(halter);

  // la cola: tres mechones que caen
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.75, 4), dark);
    t.rotation.z = Math.PI - 0.25 - i * 0.12;
    t.position.set(-0.98 - i * 0.03, 1.1, (i - 1) * 0.04);
    g.add(t);
  }

  // patas: muslo, rodilla (o garrón), caña y vaso
  const legs: THREE.Object3D[] = [];
  for (const [lx, lz, front] of [
    [0.55, 0.16, true],
    [0.55, -0.16, true],
    [-0.6, 0.16, false],
    [-0.6, -0.16, false],
  ] as const) {
    const hip = new THREE.Group();
    hip.position.set(lx, 1.1, lz);
    hip.add(limb(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(front ? 0.02 : -0.08, -0.5, 0), front ? 0.12 : 0.15, 0.08, coat));
    const knee = new THREE.Group();
    knee.position.set(front ? 0.02 : -0.08, -0.5, 0);
    knee.add(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(front ? 0 : 0.05, -0.45, 0), 0.065, 0.055, coat));
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.09, 6), hoofM);
    hoof.position.set(front ? 0 : 0.05, -0.47, 0);
    knee.add(hoof);
    hip.add(knee);
    hip.userData.knee = knee;
    hip.userData.front = front;
    g.add(hip);
    legs.push(hip);
  }

  if (load !== 'suelto') packSaddle(g, load, variant);
  shadows(g);
  return { obj: g, legs, neck };
}

/** El aparejo: pelero, los dos caballetes de madera, la cincha y la carga. */
function packSaddle(g: THREE.Group, load: Exclude<HorseLoad, 'suelto'>, variant: number): void {
  const cloth = lambert(variant % 2 ? PAL.barranca : PAL.slate);
  const wood = lambert(PAL.clay);
  const rope = lambert(PAL.soil2);
  const iron = lambert(PAL.ink2);

  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.86), cloth);
  blanket.position.set(-0.02, 1.6, 0);
  const flapL = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.04), cloth);
  flapL.position.set(-0.02, 1.46, 0.3);
  const flapR = flapL.clone();
  flapR.position.z = -0.3;
  g.add(blanket, flapL, flapR);
  // los caballetes: dos cruces de palo sobre el lomo, adelante y atrás
  for (const bx of [0.28, -0.32]) {
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), wood);
      bar.position.set(bx, 1.75, 0);
      bar.rotation.x = s * 0.55;
      g.add(bar);
    }
  }
  const cinch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.74), rope);
  cinch.position.set(0.12, 1.22, 0);
  g.add(cinch);

  if (load === 'barriles') {
    // un barril de agua de cada lado, con los zunchos de hierro
    for (const z of [0.5, -0.5]) {
      const barrel = new THREE.Group();
      const staves = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.62, 9), wood);
      const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.26, 9), wood);
      barrel.add(staves, belly);
      for (const hy of [-0.24, 0, 0.24]) {
        const hoop = new THREE.Mesh(new THREE.CylinderGeometry(hy === 0 ? 0.232 : 0.207, hy === 0 ? 0.232 : 0.207, 0.035, 9), iron);
        hoop.position.y = hy;
        barrel.add(hoop);
      }
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(-0.03, 1.38, z);
      g.add(barrel);
    }
    const sling = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.1), rope);
    sling.position.set(-0.03, 1.66, 0);
    g.add(sling);
  } else {
    // bolsas de víveres a los costados, un rollo de cueros arriba y la pava
    const sack = lambert(PAL.sandLight);
    const sack2 = lambert(PAL.sand);
    for (const z of [0.46, -0.46]) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 1), z > 0 ? sack : sack2);
      s.scale.set(1.45, 1.05, 0.7);
      s.position.set(-0.05, 1.38, z);
      g.add(s);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), rope);
      tie.position.set(-0.05, 1.5, z * 1.04);
      g.add(tie);
    }
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.95, 8), lambert(PAL.clayLight));
    roll.rotation.x = Math.PI / 2;
    roll.position.set(-0.04, 1.82, 0);
    g.add(roll);
    // dos ataduras alrededor del rollo
    for (const bz of [-0.3, 0.3]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 8), rope);
      band.rotation.x = Math.PI / 2;
      band.position.set(-0.04, 1.82, bz);
      g.add(band);
    }
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.16, 7), iron);
    kettle.position.set(-0.5, 1.36, 0.42);
    g.add(kettle);
  }
}

// ---------------------------------------------------------------- vegetación

/** Mata de coirón: hojas finas que se abren desde la base. */
export function tuftGeometry(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const h = 0.38 + hash(seed, k) * 0.32;
    const blade = new THREE.ConeGeometry(0.035, h, 3);
    blade.translate(0, h / 2, 0);
    const a = (k / n) * Math.PI * 2 + hash(seed, k + 20);
    const tilt = 0.25 + hash(seed, k + 40) * 0.35;
    blade.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * tilt, 0, Math.cos(a) * tilt)));
    blade.translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
    parts.push(blade.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}

/** Mata de jarilla o quilembai: un manchón redondo, achatado, con ramitas. */
export function bushGeometry(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const r = 0.22 + hash(seed, k) * 0.14;
    const b = new THREE.IcosahedronGeometry(r, 0);
    b.scale(1, 0.72, 1);
    b.translate((hash(seed, k + 10) - 0.5) * 0.45, r * 0.6, (hash(seed, k + 20) - 0.5) * 0.4);
    parts.push(b.toNonIndexed());
  }
  for (let k = 0; k < 3; k++) {
    const t = new THREE.ConeGeometry(0.025, 0.4, 3);
    t.translate(0, 0.2, 0);
    t.applyMatrix4(new THREE.Matrix4().makeRotationZ((hash(seed, k + 30) - 0.5) * 1.2));
    t.translate((hash(seed, k + 40) - 0.5) * 0.5, 0.25, (hash(seed, k + 50) - 0.5) * 0.3);
    parts.push(t.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}

/** Piedra: un dodecaedro deformado, más ancho que alto. */
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(0.24, 0);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + hash(seed, Math.round(p.getX(i) * 50 + p.getY(i) * 70 + p.getZ(i) * 90)) * 0.4;
    p.setXYZ(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  g.translate(0, 0.08, 0);
  g.computeVertexNormals();
  return g;
}

/** Sauce criollo: tronco torcido y la copa que cae en mechones. */
export function willow(seed: number): THREE.Group {
  const g = new THREE.Group();
  const bark = lambert(PAL.soil);
  const leafA = lambert(PAL.moss);
  const leafB = lambert(PAL.scrub);
  const lean = (hash(seed, 1) - 0.5) * 0.4;
  g.add(limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.6, 1.0, 0), 0.17, 0.12, bark));
  g.add(limb(new THREE.Vector3(lean * 0.6, 1.0, 0), new THREE.Vector3(lean * 1.4, 1.9, 0.1), 0.12, 0.07, bark));
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + hash(seed, k);
    const r = 0.45 + hash(seed, k + 10) * 0.35;
    const clump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + hash(seed, k + 20) * 0.2, 0), k % 2 ? leafA : leafB);
    clump.scale.set(0.9, 1.6, 0.9); // los mechones caen
    clump.position.set(lean * 1.2 + Math.cos(a) * r, 1.75 + hash(seed, k + 30) * 0.5 - r * 0.4, Math.sin(a) * r);
    g.add(clump);
  }
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), leafA);
  top.scale.set(1.1, 1.2, 1.1);
  top.position.set(lean * 1.4, 2.35, 0);
  g.add(top);
  shadows(g);
  return g;
}

// ---------------------------------------------------------------- toldo

/**
 * Toldo tehuelche: cueros de guanaco cosidos sobre palos, alto adelante y casi a
 * ras del suelo atrás. Visto de costado se lee la caída del techo.
 */
export function toldo(seed: number, cuero?: { hide: number; seam: number }): THREE.Group {
  const g = new THREE.Group();
  const hide = lambert(cuero?.hide ?? (seed % 2 ? PAL.clayLight : PAL.clayPale));
  const seam = lambert(cuero?.seam ?? PAL.clay);
  const pole = lambert(PAL.soil);
  const prof = new THREE.Shape();
  prof.moveTo(0, 0);
  prof.lineTo(2.8, 0);
  prof.lineTo(2.8, 0.28);
  prof.quadraticCurveTo(1.2, 0.55, 0, 1.25);
  prof.lineTo(0, 0);
  const body = new THREE.ExtrudeGeometry(prof, { depth: 1.8, bevelEnabled: false });
  body.translate(-1.4, 0, -0.9);
  g.add(new THREE.Mesh(body, hide));
  // las costuras entre cuero y cuero, como franjas sobre el techo
  for (let k = 1; k < 4; k++) {
    const x = -1.4 + k * 0.7;
    const y = 1.25 - (k * 0.7) / 2.8 * 0.97 + 0.02;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 1.84), seam);
    s.position.set(x, y, 0);
    s.rotation.z = -0.38;
    g.add(s);
  }
  // los palos del frente asoman por encima del cuero
  for (const sz of [-0.8, 0, 0.8]) g.add(limb(new THREE.Vector3(-1.4, 0, sz), new THREE.Vector3(-1.45, 1.55, sz), 0.035, 0.03, pole, 4));
  // cueros estaqueados al lado, secándose
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.03), seam);
  rack.position.set(-2.1, 0.45, 0.4 + hash(seed, 3) * 0.4);
  rack.rotation.y = 0.4;
  g.add(rack);
  shadows(g);
  return g;
}

/**
 * Nivel 3, abril de 1866: el toldo que arman los cuatro que llegan junto al fuerte
 * (docs/04 §1.3). El toldo de cuero, un caballo suelto pastando y, delante, la
 * manta del trato con la carne y los cueros encima.
 */
export function toldoCamp(): THREE.Group {
  const g = new THREE.Group();
  // de cerca, el cuero claro de la marcha se leía como tablas: acá, cuero de guanaco más oscuro
  const t = toldo(1, { hide: PAL.clay, seam: PAL.clayDark });
  t.rotation.y = Math.PI; // la boca hacia el este, hacia el fuerte
  t.scale.setScalar(1.2);
  g.add(t);
  // la boca del toldo: la cara alta queda abierta, oscura por dentro
  const boca = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 1.3), lambert(PAL.void));
  boca.position.set(1.4 * 1.2 + 0.02, 0.53, 0);
  g.add(boca);
  const h = horse('suelto', 3);
  h.obj.position.set(-0.9, 0, 2.3);
  h.obj.rotation.y = 0.35;
  h.neck.rotation.z = -1.1; // la cabeza abajo, pastando
  h.obj.scale.setScalar(1.25);
  g.add(h.obj);
  // la manta: un rectángulo bajo con guarda, y encima la carne y un cuero doblado
  const manta = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.8), lambert(PAL.blood));
  manta.position.set(2.5, 0.02, 0.3);
  g.add(manta);
  const guarda = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.6), lambert(PAL.wheat));
  guarda.position.set(2.5, 0.025, 0.3);
  g.add(guarda);
  const carne = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), lambert(PAL.barranca));
  carne.scale.set(1.4, 0.6, 1);
  carne.position.set(2.35, 0.1, 0.2);
  g.add(carne);
  const cuero = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.3), lambert(PAL.clayPale));
  cuero.position.set(2.7, 0.07, 0.42);
  cuero.rotation.y = 0.3;
  g.add(cuero);
  shadows(g);
  return g;
}

/**
 * Nivel 3, acto III: un tramo de zanja de una casilla. Un surco de tierra oscura
 * con los bordes de la tierra sacada; con agua, el fondo es agua. Tramo a tramo se
 * tocan y se lee una zanja seguida. La vista previa: un cuadro translúcido.
 */
export function zanjaTramo(state: 'seca' | 'agua' | 'ok' | 'mal' | 'lee'): THREE.Group {
  const g = new THREE.Group();
  if (state === 'ok' || state === 'mal' || state === 'lee') {
    const color = state === 'ok' ? PAL.moss : state === 'mal' ? PAL.barranca : PAL.seaPale;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.04, 0.96),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    m.position.y = 0.03;
    g.add(m);
    return g;
  }
  const fondo = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 1.0), lambert(state === 'agua' ? PAL.sea : PAL.soil));
  fondo.position.y = 0.015;
  g.add(fondo);
  if (state === 'agua') {
    const brillo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.08), lambert(PAL.seaPale));
    brillo.position.set(0.1, 0.035, -0.15);
    g.add(brillo);
  }
  // la tierra sacada, amontonada en las cuatro esquinas (así los tramos se unen en cualquier dirección)
  const tierra = lambert(PAL.clay);
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const) {
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), tierra);
    t.scale.set(1, 0.55, 1);
    t.position.set(x, 0.06, z);
    g.add(t);
  }
  return g;
}

/**
 * Una chacra de `w`×`h` casillas: tierra arada con surcos y una estaca en cada
 * esquina. `regada`: la tierra oscura y húmeda, con el trigo que asoma.
 * `inundada`: el agua desbordada encima, quieta y marrón.
 */
export function chacraField(w: number, h: number, estado: 'seca' | 'regada' | 'inundada'): THREE.Group {
  const g = new THREE.Group();
  const regada = estado === 'regada';
  // tierra removida, más oscura que el llano; los surcos, lomos bajos y parejos (no tablas)
  const tierra = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.03, h - 0.1), lambert(regada ? PAL.soil : PAL.soil2));
  tierra.position.y = 0.015;
  tierra.receiveShadow = true;
  g.add(tierra);
  const lomo = lambert(regada ? PAL.soil2 : PAL.clay);
  const rows = Math.max(2, Math.round(h * 2));
  for (let k = 0; k < rows; k++) {
    const z = -h / 2 + (k + 0.5) * (h / rows);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, w - 0.35, 5, 1), lomo);
    s.rotation.z = Math.PI / 2;
    s.scale.set(1, 1, 0.45);
    s.position.set(0, 0.035, z);
    g.add(s);
    // regada: el trigo que asoma, en hilera sobre cada surco
    if (regada) {
      const brote = lambert(k % 2 ? PAL.moss : PAL.scrub);
      for (let i = 0; i < Math.round(w * 2.5); i++) {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), brote);
        b.position.set(-w / 2 + 0.3 + i * ((w - 0.6) / Math.max(1, Math.round(w * 2.5) - 1)), 0.15, z + (i % 2 ? 0.04 : -0.04));
        g.add(b);
      }
    }
  }
  if (estado === 'inundada') {
    const agua = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.2, 0.02, h - 0.2),
      new THREE.MeshLambertMaterial({ color: PAL.seaLight, transparent: true, opacity: 0.8 }),
    );
    agua.position.y = 0.1;
    g.add(agua);
  }
  // estacas en las esquinas y un hilo bajo que marca el lindero
  const madera = lambert(PAL.soil2);
  const hilo = lambert(PAL.bone);
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  corners.forEach(([x, z], i) => {
    const px = (x * (w - 0.1)) / 2;
    const pz = (z * (h - 0.1)) / 2;
    const estaca = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07), madera);
    estaca.position.set(px, 0.22, pz);
    g.add(estaca);
    const [nx, nz] = corners[(i + 1) % 4]!;
    const qx = (nx * (w - 0.1)) / 2;
    const qz = (nz * (h - 0.1)) / 2;
    const len = Math.hypot(qx - px, qz - pz);
    const linea = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.012), hilo);
    linea.position.set((px + qx) / 2, 0.36, (pz + qz) / 2);
    linea.rotation.y = -Math.atan2(qz - pz, qx - px);
    g.add(linea);
  });
  shadows(g);
  return g;
}

/** La compuerta: dos postes y una tabla que se levanta para dejar pasar el agua. */
export function compuerta(): THREE.Group {
  const g = new THREE.Group();
  const madera = lambert(PAL.soil2);
  for (const x of [-0.42, 0.42]) {
    const poste = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), madera);
    poste.position.set(x, 0.27, 0);
    g.add(poste);
  }
  const tabla = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.06), madera);
  tabla.position.set(0, 0.38, 0);
  g.add(tabla);
  shadows(g);
  return g;
}

// ---------------------------------------------------------------- fuerte

/**
 * Las ruinas de un fuerte de barro: paredes de terrón desmoronadas, con huecos y
 * cascotes, y la zanja que lo rodeaba con la tierra amontonada del lado de afuera.
 * `ground(x, z)` da el alto del suelo, para asentarlo en el terreno.
 */
export function mudFort(ground: (x: number, z: number) => number, cx: number, cz: number, size: { w: number; d: number } = { w: 7, d: 5 }): THREE.Group {
  const g = new THREE.Group();
  const adobe = lambert(PAL.clayLight);
  const adobeDark = lambert(PAL.clay);
  const ditch = lambert(PAL.soil);
  const berm = lambert(PAL.soil2);
  const wood = lambert(PAL.soil);
  const W = size.w;
  const Dp = size.d;
  // cada lado del cuadrado: [x0, z0, x1, z1], recorrido en tramos de terrón
  const sides: Array<[number, number, number, number]> = [
    [-W / 2, 0, W / 2, 0],
    [W / 2, 0, W / 2, -Dp],
    [W / 2, -Dp, -W / 2, -Dp],
    [-W / 2, -Dp, -W / 2, 0],
  ];
  sides.forEach(([x0, z0, x1, z1], si) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 0.7);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      // la entrada del lado de la huella, y paredes caídas aquí y allá
      if (si === 0 && t > 0.42 && t < 0.62) continue;
      const fallen = hash(si * 31 + k, 5);
      // la altura cambia de a poco a lo largo de la pared (no son almenas): lo
      // que la lluvia y el viento comieron en once años
      const wave = 0.5 + 0.5 * Math.sin(t * 4.2 + si * 1.7) * Math.sin(t * 1.9 + si);
      const h = fallen < 0.15 ? 0.25 : (0.6 + 0.95 * wave) * (si === 2 ? 1.2 : 1);
      const x = cx + x0 + (x1 - x0) * t;
      const z = cz + z0 + (z1 - z0) * t;
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(len / n + 0.04, h, 0.5), fallen < 0.7 ? adobe : adobeDark);
      chunk.rotation.y = -Math.atan2(z1 - z0, x1 - x0) + (hash(k, si) - 0.5) * 0.06;
      chunk.position.set(x, ground(x, z) + h / 2 - 0.08, z);
      g.add(chunk);
      if (fallen < 0.25) {
        // cascotes al pie de lo que se cayó
        const rub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), adobeDark);
        rub.scale.set(1.3, 0.5, 1);
        const rz = z + (hash(k, si + 9) > 0.5 ? 0.45 : -0.45);
        rub.position.set(x, ground(x, rz) + 0.05, rz);
        g.add(rub);
      }
    }
  });
  // la zanja (oscura, a ras del suelo) y el terraplén de afuera
  const m = 1.4;
  const ring: Array<[number, number, number, number]> = [
    [-W / 2 - m, m, W / 2 + m, m],
    [W / 2 + m, m, W / 2 + m, -Dp - m],
    [W / 2 + m, -Dp - m, -W / 2 - m, -Dp - m],
    [-W / 2 - m, -Dp - m, -W / 2 - m, m],
  ];
  ring.forEach(([x0, z0, x1, z1], si) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 1.2);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      if (si === 0 && t > 0.4 && t < 0.62) continue; // el paso de la entrada
      const x = cx + x0 + (x1 - x0) * t;
      const z = cz + z0 + (z1 - z0) * t;
      const rot = -Math.atan2(z1 - z0, x1 - x0);
      const d = new THREE.Mesh(new THREE.BoxGeometry(len / n + 0.05, 0.06, 0.7), ditch);
      d.rotation.y = rot;
      d.position.set(x, ground(x, z) + 0.01, z);
      // el terraplén, corrido hacia afuera
      const ox = Math.sin(rot) * 0.6 * (si === 1 || si === 2 ? -1 : 1);
      const oz = Math.cos(rot) * 0.6 * (si === 1 || si === 2 ? -1 : 1);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len / n + 0.1, 0.32, 0.5), berm);
      b.rotation.y = rot;
      b.position.set(x + ox, ground(x + ox, z + oz) + 0.1, z + oz);
      g.add(d, b);
    }
  });
  // torreones en las esquinas: más altos que las paredes, con la parte de arriba comida
  [[-W / 2, 0], [W / 2, 0], [W / 2, -Dp], [-W / 2, -Dp]].forEach(([x0, z0], i) => {
    const x = cx + x0!;
    const z = cz + z0!;
    const h = 1.5 + hash(i, 41) * 0.7;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, h, 1.25), i % 2 ? adobe : adobeDark);
    base.position.set(x, ground(x, z) + h / 2 - 0.08, z);
    base.rotation.y = (hash(i, 42) - 0.5) * 0.1;
    g.add(base);
    // lo que queda de arriba: un pedazo corrido, y cascotes al pie
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.55), adobe);
    top.position.set(x + (hash(i, 43) - 0.5) * 0.4, ground(x, z) + h + 0.15, z + (hash(i, 44) - 0.5) * 0.4);
    g.add(top);
    for (let k = 0; k < 3; k++) {
      const rub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), adobeDark);
      rub.scale.set(1.2, 0.5, 1);
      const rx = x + (hash(i * 3 + k, 45) - 0.5) * 2;
      const rz = z + (hash(i * 3 + k, 46) - 0.5) * 2;
      rub.position.set(rx, ground(rx, rz) + 0.05, rz);
      g.add(rub);
    }
  });
  // la entrada: los dos postes del portón, y el dintel caído atravesado en el suelo
  for (const ex of [-0.12, 0.12]) {
    const px = cx - W / 2 + W * (ex < 0 ? 0.42 : 0.62);
    g.add(limb(new THREE.Vector3(px, ground(px, cz), cz), new THREE.Vector3(px + ex * 0.4, ground(px, cz) + 1.9, cz), 0.09, 0.07, wood, 5));
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W * 0.24, 0.14, 0.16), wood);
  lintel.position.set(cx - W / 2 + W * 0.52, ground(cx, cz + 0.6) + 0.08, cz + 0.6);
  lintel.rotation.y = 0.35;
  g.add(lintel);
  // adentro, contra el fondo: lo que fue la cuadra, sin techo, con las vigas caídas
  const bx = cx - W / 4;
  const bz = cz - Dp + 1.2;
  const bw = W * 0.38;
  const bd = 1.6;
  const walls: Array<[number, number, number, number]> = [
    [bx - bw / 2, bz + bd / 2, bw, 0.3],
    [bx - bw / 2, bz, 0.3, bd],
    [bx + bw / 2, bz, 0.3, bd],
  ];
  walls.forEach(([x, z, w, d], i) => {
    const h = 0.55 + hash(i, 47) * 0.4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i ? adobeDark : adobe);
    m.position.set(x + (i ? 0 : w / 2), ground(x, z) + h / 2 - 0.05, z);
    g.add(m);
  });
  for (let k = 0; k < 3; k++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, 0.1, 0.12), wood);
    beam.position.set(bx + (k - 1) * 0.2, ground(bx, bz) + 0.12 + k * 0.18, bz - 0.3 + k * 0.35);
    beam.rotation.set(0, (hash(k, 48) - 0.5) * 0.7, (k - 1) * 0.18);
    g.add(beam);
  }
  // un palo de lo que fue el mástil, todavía parado
  const pole = limb(new THREE.Vector3(cx + 1.6, ground(cx + 1.6, cz - 2.6), cz - 2.6), new THREE.Vector3(cx + 1.7, ground(cx + 1.6, cz - 2.6) + 2.6, cz - 2.6), 0.06, 0.04, lambert(PAL.soil), 5);
  g.add(pole);
  shadows(g);
  return g;
}

// ---------------------------------------------------------------- rancho (Nivel 3)

/**
 * Rancho de barro con techo de junco a dos aguas, sobre 3×3 casillas (centro en el
 * origen). `ghost`: la vista previa de dónde va a quedar, transparente, en verde si
 * se puede construir ahí y en rojizo si no.
 */
export function adobeHut(ghost?: 'ok' | 'mal'): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: number): THREE.Material =>
    ghost
      ? new THREE.MeshBasicMaterial({ color: ghost === 'ok' ? PAL.moss : PAL.barranca, transparent: true, opacity: 0.45, depthWrite: false })
      : lambert(color);
  const wall = mat(PAL.clayLight);
  const wallDark = mat(PAL.clay);
  const thatch = mat(PAL.coiron);
  const dark = mat(PAL.ink);
  const W = 1.6;
  const D = 1.3;
  const H = 0.9;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wall);
  walls.position.y = H / 2;
  g.add(walls);
  // zócalo más oscuro (barro mojado) y la puerta
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.18, D + 0.04), wallDark);
  base.position.y = 0.09;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 0.04), dark);
  door.position.set(0.2, 0.3, D / 2 + 0.02);
  g.add(base, door);
  // techo a dos aguas: dos faldones de junco y la cumbrera
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.08, D / 2 + 0.32), thatch);
    slab.position.set(0, H + 0.28, s * (D / 4 + 0.06));
    slab.rotation.x = s * 0.62;
    g.add(slab);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(W + 0.34, 0.09, 0.12), wallDark);
  ridge.position.y = H + 0.5;
  g.add(ridge);
  if (!ghost) shadows(g);
  // a la escala de los personajes del mundo (que miden unas tres casillas): la planta ocupa 3×3
  g.scale.setScalar(1.85);
  return g;
}

/**
 * Corral de palos y travesaños sobre 4×3 casillas (centro en el origen), con una
 * tranquera abierta adelante. `ghost`: la vista previa, como la del rancho.
 */
export function corral(ghost?: 'ok' | 'mal'): THREE.Group {
  const g = new THREE.Group();
  const wood = ghost
    ? new THREE.MeshBasicMaterial({ color: ghost === 'ok' ? PAL.moss : PAL.barranca, transparent: true, opacity: 0.5, depthWrite: false })
    : lambert(PAL.soil);
  const W = 3.6;
  const D = 2.6;
  const posts: Array<[number, number]> = [];
  for (let i = 0; i <= 4; i++) posts.push([-W / 2 + (W * i) / 4, -D / 2], [-W / 2 + (W * i) / 4, D / 2]);
  for (let j = 1; j < 3; j++) posts.push([-W / 2, -D / 2 + (D * j) / 3], [W / 2, -D / 2 + (D * j) / 3]);
  for (const [x, z] of posts) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 5), wood);
    p.position.set(x, 0.55, z);
    p.rotation.z = (hash(x * 7, z * 3) - 0.5) * 0.12;
    g.add(p);
  }
  // dos travesaños por lado; adelante, la tranquera abierta en el medio
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), wood);
    r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(r);
  };
  for (const y of [0.45, 0.85]) {
    rail(-W / 2, -D / 2, W / 2, -D / 2, y);
    rail(-W / 2, -D / 2, -W / 2, D / 2, y);
    rail(W / 2, -D / 2, W / 2, D / 2, y);
    rail(-W / 2, D / 2, -W * 0.15, D / 2, y);
    rail(W * 0.15, D / 2, W / 2, D / 2, y);
  }
  if (!ghost) shadows(g);
  // 3,6 × 2,6 → entra en la planta de 4×3 casillas, a la altura de los personajes
  g.scale.set(1.1, 1.5, 1.1);
  return g;
}

/**
 * La bandera celeste y blanca en un palo alto (15-IX-1865). Colores apagados, de la
 * paleta. Devuelve también el cuadro a cuadro: la tela flamea con el viento del oeste.
 */
export function flagPole(): { obj: THREE.Group; update: (t: number) => void } {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6), lambert(PAL.soil));
  pole.position.y = 2.1;
  g.add(pole);
  const geo = new THREE.PlaneGeometry(1.5, 0.95, 12, 3);
  const stripes = document.createElement('canvas');
  stripes.width = 48;
  stripes.height = 30;
  const c = stripes.getContext('2d')!;
  const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  c.fillStyle = hex(PAL.seaPale);
  c.fillRect(0, 0, 48, 30);
  c.fillStyle = hex(PAL.bone);
  c.fillRect(0, 10, 48, 10);
  const tex = new THREE.CanvasTexture(stripes);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  cloth.position.set(0.78, 3.65, 0);
  g.add(cloth);
  shadows(g);
  const base = (geo.attributes.position as THREE.BufferAttribute).array.slice();
  const update = (t: number): void => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]! + 0.75; // 0 en el palo, 1,5 en la punta
      pos.setZ(i, Math.sin(t * 4 + x * 3.2) * 0.09 * x); // t en segundos (World3D.sync)
    }
    pos.needsUpdate = true;
  };
  return { obj: g, update };
}
