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
export function toldo(seed: number): THREE.Group {
  const g = new THREE.Group();
  const hide = lambert(seed % 2 ? PAL.clayLight : PAL.clayPale);
  const seam = lambert(PAL.clay);
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

// ---------------------------------------------------------------- fuerte

/**
 * Las ruinas de un fuerte de barro: paredes de terrón desmoronadas, con huecos y
 * cascotes, y la zanja que lo rodeaba con la tierra amontonada del lado de afuera.
 * `ground(x, z)` da el alto del suelo, para asentarlo en el terreno.
 */
export function mudFort(ground: (x: number, z: number) => number, cx: number, cz: number): THREE.Group {
  const g = new THREE.Group();
  const adobe = lambert(PAL.clayLight);
  const adobeDark = lambert(PAL.clay);
  const ditch = lambert(PAL.soil);
  const berm = lambert(PAL.soil2);
  const W = 7;
  const Dp = 5;
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
      const h = fallen < 0.15 ? 0.18 : (0.35 + 0.7 * wave) * (si === 2 ? 1.2 : 1);
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
  // un palo de lo que fue el mástil, todavía parado
  const pole = limb(new THREE.Vector3(cx + 1.6, ground(cx + 1.6, cz - 2.6), cz - 2.6), new THREE.Vector3(cx + 1.7, ground(cx + 1.6, cz - 2.6) + 2.6, cz - 2.6), 0.06, 0.04, lambert(PAL.soil), 5);
  g.add(pole);
  shadows(g);
  return g;
}
