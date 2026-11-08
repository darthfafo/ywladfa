import * as THREE from 'three';

// Un clíper de tres palos fondeado, armado por código (sin modelos externos).
// Eje local: +x = proa, +y = arriba, z = manga. La línea de flotación es y = 0.
// Fondeado: las velas bajas van aferradas sobre la verga; las gavias y juanetes
// quedan sueltas (se orean al sol), con las vergas braceadas para que se vean de 3/4.

const L = 18; // eslora
const BEAM = 2.1; // media manga
const DECK_Y = 1.4;
const KEEL_Y = -1.1;

const C = {
  rail: new THREE.Color(0x2a1d14),
  stripe: new THREE.Color(0xd8c9a0),
  hull: new THREE.Color(0x1d1a17),
  copper: new THREE.Color(0x8a5536),
  wood: 0x5c3e24,
  mast: 0x3e2a17,
  sail: 0xeae2cc,
  rope: 0x2a2018,
};

function halfWidth(u: number): number {
  // u ∈ [-1, 1]: popa → proa. Popa con espejo (no termina en punta), proa afinada.
  return u >= 0 ? BEAM * (1 - Math.pow(u, 1.7)) : BEAM * (1 - 0.55 * Math.pow(-u, 3));
}
function sheer(u: number): number {
  // arrufo: la cubierta sube hacia proa y popa
  return DECK_Y + 0.35 * u * u + (u > 0 ? 0.25 * u * u * u : 0);
}

function hullGeometry(): THREE.BufferGeometry {
  const N = 40; // secciones a lo largo
  const M = 14; // puntos por sección
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    const x = (u * L) / 2;
    const w = halfWidth(u);
    const top = sheer(u);
    const depth = (top - KEEL_Y) * (1 - 0.35 * Math.pow(Math.abs(u), 4));
    for (let j = 0; j <= M; j++) {
      const t = (j / M) * Math.PI;
      const z = w * Math.cos(t);
      const y = top - depth * Math.pow(Math.sin(t), 0.6);
      pos.push(x, y, z);
      const c = y > top - 0.22 ? C.rail : y > top - 0.62 && y < top - 0.32 ? C.stripe : y < 0.05 ? C.copper : C.hull;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // espejo de popa: abanico que cierra la primera sección
  const center = pos.length / 3;
  pos.push(-L / 2, sheer(-1) - 0.8, 0);
  col.push(C.hull.r, C.hull.g, C.hull.b);
  for (let j = 0; j < M; j++) idx.push(center, j + 1, j);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function deckGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    const p = [(u * L) / 2, halfWidth(u) - 0.08] as const;
    if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  }
  for (let i = N; i >= 0; i--) {
    const u = -1 + (2 * i) / N;
    s.lineTo((u * L) / 2, -(halfWidth(u) - 0.08));
  }
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Vela cuadra colgada de una verga: plano con panza hacia proa. */
function squareSail(wTop: number, wBot: number, h: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.PlaneGeometry(1, h, 6, 6);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const v = (p.getY(i) + h / 2) / h; // 0 abajo, 1 arriba
    const w = wBot + (wTop - wBot) * v;
    const sx = p.getX(i) * w;
    const belly = Math.sin(v * Math.PI) * (1 - Math.pow(2 * p.getX(i), 2)) * 0.45;
    // el plano queda en el plano local z-y (perpendicular a la crujía), con panza en +x
    p.setXYZ(i, belly, p.getY(i) - h / 2, sx);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function triangle(a: number[], b: number[], c: number[], mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export function buildShip(): THREE.Group {
  const ship = new THREE.Group();

  const hull = new THREE.Mesh(
    hullGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
  );
  ship.add(hull);
  const deck = new THREE.Mesh(deckGeometry(), new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.9 }));
  deck.position.y = DECK_Y + 0.05;
  ship.add(deck);
  // castillo de popa: un escalón de cubierta
  const poop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 3.2), new THREE.MeshStandardMaterial({ color: C.wood }));
  poop.position.set(-L / 2 + 2.1, DECK_Y + 0.3, 0);
  ship.add(poop);

  const woodMat = new THREE.MeshStandardMaterial({ color: C.mast, roughness: 0.8 });
  const sailMat = new THREE.MeshStandardMaterial({
    color: C.sail,
    emissive: 0x3a352a,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const ropeMat = new THREE.LineBasicMaterial({ color: C.rope, transparent: true, opacity: 0.8 });
  const rope: number[] = [];
  const line = (a: number[], b: number[]) => rope.push(...a, ...b);

  // bauprés y botalón
  const bowX = L / 2;
  const bowY = sheer(1);
  const spritTip = [bowX + 5, bowY + 1.6, 0];
  const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 6), woodMat);
  sprit.position.set(bowX + 2.3, bowY + 0.75, 0);
  sprit.rotation.z = -Math.PI / 2 + 0.32;
  ship.add(sprit);

  const masts = [
    { x: 4.6, h: 15, k: 1 }, // trinquete
    { x: 0, h: 16.5, k: 1.08 }, // mayor
    { x: -4.6, h: 13, k: 0.85 }, // mesana
  ];
  const BRACE = 0.5; // vergas braceadas: las velas se ven de 3/4
  const tops: number[][] = [];
  for (const m of masts) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, m.h, 8), woodMat);
    mast.position.set(m.x, DECK_Y + m.h / 2, 0);
    ship.add(mast);
    const top = [m.x, DECK_Y + m.h, 0];
    tops.push(top);

    // tres vergas: mayor (vela aferrada), gavia y juanete (sueltas)
    const levels = [
      { y: 5.2, len: 7.6 },
      { y: 9.4, len: 6.2 },
      { y: 12.6, len: 4.6 },
    ].map((l) => ({ y: DECK_Y + l.y * m.k * 0.92, len: l.len * m.k }));
    const yards = new THREE.Group();
    yards.position.x = m.x;
    yards.rotation.y = BRACE;
    for (let i = 0; i < levels.length; i++) {
      const l = levels[i]!;
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, l.len, 6), woodMat);
      yard.rotation.x = Math.PI / 2; // a lo ancho (eje z)
      yard.position.y = l.y;
      yards.add(yard);
      if (i === 0) {
        // vela baja aferrada: un rollo de lona sobre la verga
        const furled = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, l.len * 0.92, 8), sailMat);
        furled.rotation.x = Math.PI / 2;
        furled.position.set(0.12, l.y - 0.12, 0);
        furled.scale.set(1, 1, 0.75);
        yards.add(furled);
      } else {
        // suelta: cuelga hasta la verga de abajo, más ancha abajo que arriba
        const below = levels[i - 1]!;
        const h = l.y - below.y - 0.25;
        const sail = squareSail(l.len * 0.88, below.len * 0.9, h, sailMat);
        sail.position.set(0.15, l.y - 0.05, 0);
        yards.add(sail);
      }
      // brazas: de la punta de la verga a cubierta, hacia popa
      // (rotar en y por BRACE lleva el z local a x = z·sen, z = z·cos)
      const tipZ = (l.len / 2) * Math.cos(BRACE);
      const tipDx = (l.len / 2) * Math.sin(BRACE);
      line([m.x + tipDx, l.y, tipZ], [m.x - 3, DECK_Y + 0.3, BEAM * 0.9]);
      line([m.x - tipDx, l.y, -tipZ], [m.x - 3, DECK_Y + 0.3, -BEAM * 0.9]);
    }
    ship.add(yards);

    // obenques: del tope del palo a las bordas, a cada lado
    for (const side of [1, -1]) {
      for (const dx of [-0.6, 0, 0.6]) {
        line([m.x, DECK_Y + m.h * 0.68, 0], [m.x + dx - 0.4, DECK_Y + 0.2, side * (halfWidth((2 * m.x) / L) - 0.05)]);
      }
    }
  }

  // estays: proa ← trinquete ← mayor ← mesana
  line(tops[0]!, spritTip);
  line([masts[0]!.x, DECK_Y + masts[0]!.h * 0.7, 0], [bowX + 1, bowY + 0.4, 0]);
  line(tops[1]!, [masts[0]!.x, DECK_Y + masts[0]!.h * 0.75, 0]);
  line(tops[2]!, [masts[1]!.x, DECK_Y + masts[1]!.h * 0.72, 0]);
  // popa: de la mesana al coronamiento
  line(tops[2]!, [-L / 2 + 0.3, sheer(-1), 0]);

  // foques: dos velas triangulares entre el bauprés y el trinquete
  ship.add(triangle(spritTip, [masts[0]!.x + 0.2, DECK_Y + masts[0]!.h * 0.78, 0], [bowX + 0.6, bowY + 0.6, 0], sailMat));
  ship.add(
    triangle([bowX + 2.6, bowY + 1, 0], [masts[0]!.x + 0.2, DECK_Y + masts[0]!.h * 0.6, 0], [bowX - 0.6, bowY + 0.4, 0], sailMat),
  );

  // cangreja en la mesana (aferrada a medias: un trapecio chico)
  const mz = masts[2]!.x;
  const spanker = new THREE.BufferGeometry();
  spanker.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        mz - 0.15, DECK_Y + 2, 0, mz - 0.15, DECK_Y + 6.5, 0, mz - 3.6, DECK_Y + 5.4, 0,
        mz - 0.15, DECK_Y + 2, 0, mz - 3.6, DECK_Y + 5.4, 0, mz - 3.8, DECK_Y + 2.2, 0,
      ],
      3,
    ),
  );
  spanker.computeVertexNormals();
  ship.add(new THREE.Mesh(spanker, sailMat));
  const gaff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.7), woodMat);
  gaff.position.set(mz - 1.85, DECK_Y + 5.95, 0);
  gaff.rotation.z = Math.PI / 2 - 0.3;
  ship.add(gaff);

  const rigging = new THREE.LineSegments(new THREE.BufferGeometry(), ropeMat);
  rigging.geometry.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
  ship.add(rigging);

  ship.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return ship;
}
