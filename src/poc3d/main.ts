import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import pcSheet from '@/assets/sprites/pc_m.png?url';
import pepperellSheet from '@/assets/sprites/npc_pepperell.png?url';
import edwynSheet from '@/assets/sprites/npc_edwyn.png?url';
import coironUrl from '@/assets/props/coiron.png?url';
import gaviotasUrl from '@/assets/props/gaviotas.png?url';

// Prueba aislada (no es el juego): la playa del J1 con terreno, mar, barranca y
// objetos en 3D real, luz/sombras dinámicas por turno, y los personajes como
// sprites pixel art parados en el mundo — el enfoque "HD-2D".

const frame = document.getElementById('frame')!;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
frame.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.1, 200);
// la cámara mira desde la barranca hacia el mar: el agua y el Mimosa quedan
// arriba en la pantalla, en el horizonte, en vez de detrás de la cámara.
const CAM_OFFSET = new THREE.Vector3(0, 5.2, -10);
// pegado a la barranca: más alta y más cerca, casi cenital
const CRANE_OFFSET = new THREE.Vector3(0, 8.5, -7.5);
const camOffset = new THREE.Vector3();
const ray = new THREE.Raycaster();
const rayFrom = new THREE.Vector3();
const rayDir = new THREE.Vector3();

// ---------- texturas procedurales ----------
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function speckle(base: string, dots: string[], n: number) {
  return (g: CanvasRenderingContext2D, s: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      g.fillStyle = dots[i % dots.length]!;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  };
}
const sandTex = canvasTex(256, speckle('#b5a47c', ['#c6b896', '#a09472', '#d3c6a3', '#8f8466'], 4000), 10);
const wetTex = canvasTex(256, speckle('#8a7e5f', ['#9c8f6c', '#7a6f52', '#6f664c'], 3000), 10);
const clayTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#9c5a3a';
  g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 6) {
    g.fillStyle = y % 12 ? '#8a4d30' : '#b07a52';
    g.fillRect(0, y + Math.random() * 3, s, 2);
  }
  speckle('rgba(0,0,0,0)', ['#7a4a2e', '#c89a6e'], 1500)(g, s);
}, 2);
const woodTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#7a5532';
  g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 32) {
    g.fillStyle = '#5c3e24';
    g.fillRect(x, 0, 2, s);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = Math.random() > 0.5 ? '#6b4a2b' : '#8a6440';
      g.fillRect(x + Math.random() * 30, Math.random() * s, 1, 6 + Math.random() * 10);
    }
  }
  g.strokeStyle = '#3e2a17';
  g.lineWidth = 6;
  g.strokeRect(0, 0, s, s);
});

// ---------- terreno ----------
// minZ deja al jugador delante del pie de la barranca (su frente anda por z≈-10.5)
const BEACH = { minX: -18, maxX: 18, minZ: -9.3, maxZ: 8.5 };
// la arena termina en la franja húmeda — antes se extendía por debajo del mar
// (plano más alto que el agua) y lo tapaba hasta lejos de la costa.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 32), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.z = -8.5;
ground.receiveShadow = true;
scene.add(ground);

const wet = new THREE.Mesh(new THREE.PlaneGeometry(80, 4), new THREE.MeshStandardMaterial({ map: wetTex, roughness: 0.6 }));
wet.rotation.x = -Math.PI / 2;
wet.position.set(0, 0.01, 9.4);
wet.receiveShadow = true;
scene.add(wet);

// mar: plano subdividido con olas en el vértice (CPU, alcanza para una prueba)
const seaGeo = new THREE.PlaneGeometry(140, 80, 100, 50);
seaGeo.rotateX(-Math.PI / 2);
const seaBase = Float32Array.from(seaGeo.attributes.position!.array as Float32Array);
const sea = new THREE.Mesh(
  seaGeo,
  new THREE.MeshStandardMaterial({ color: 0x4e8a96, emissive: 0x1d3a42, roughness: 0.45, metalness: 0, flatShading: true }),
);
sea.position.set(0, -0.05, 50.5);
sea.receiveShadow = true;
scene.add(sea);

// la barranca al fondo: bloques de arcilla de alturas irregulares.
// Cada bloque tiene su material para poder desvanecerlo cuando tapa al jugador.
const clayMat = new THREE.MeshStandardMaterial({ map: clayTex, roughness: 0.95, flatShading: true, transparent: true });
const occluders: THREE.Mesh[] = [];
for (let x = -30; x <= 30; x += 2.4) {
  const h = 5 + Math.sin(x * 0.7) * 1.5 + Math.random() * 2;
  const geo = new THREE.BoxGeometry(2.6, h, 3 + Math.random() * 2, 2, 3, 2);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (Math.random() - 0.5) * 0.4, p.getY(i), p.getZ(i) + (Math.random() - 0.5) * 0.5);
  geo.computeVertexNormals();
  const block = new THREE.Mesh(geo, clayMat.clone());
  block.position.set(x, h / 2, -13 - Math.random());
  block.castShadow = block.receiveShadow = true;
  scene.add(block);
  occluders.push(block);
}

// colisiones simples: círculos en el plano XZ que empujan al jugador hacia afuera
type Obstacle = { x: number; z: number; r: number };
const obstacles: Obstacle[] = [];
const PLAYER_R = 0.35;
// rocas sueltas
const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6a5e, roughness: 0.9, flatShading: true });
for (let i = 0; i < 22; i++) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.6, 0), rockMat);
  const onShore = i < 14;
  r.position.set(-20 + Math.random() * 40, 0.1, onShore ? 7 + Math.random() * 4 : -9 + Math.random() * 2);
  r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  r.scale.y = 0.6;
  r.castShadow = r.receiveShadow = true;
  scene.add(r);
  if (onShore) obstacles.push({ x: r.position.x, z: r.position.z, r: 0.45 });
}

// ---------- objetos 3D ----------
type Interactable = { obj: THREE.Object3D; label: string; onUse: () => void };
const interactables: Interactable[] = [];

const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 });
let carried = 0;
const crateSpots: [number, number][] = [[-9, 4], [-7, 6], [-4.5, 3.5], [-2.5, 5.5], [1, 4.5], [3.5, 6.5], [6, 3.8], [8.5, 5.8]];
for (const [x, z] of crateSpots) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), crateMat);
  c.position.set(x, 0.35, z);
  c.rotation.y = (Math.random() - 0.5) * 0.6;
  c.castShadow = c.receiveShadow = true;
  scene.add(c);
  const ob: Obstacle = { x, z, r: 0.55 };
  obstacles.push(ob);
  const it: Interactable = {
    obj: c,
    label: 'LEVANTAR',
    onUse: () => {
      scene.remove(c);
      obstacles.splice(obstacles.indexOf(ob), 1);
      interactables.splice(interactables.indexOf(it), 1);
      carried++;
      $('cajones').textContent = `CAJONES ${carried} / 8`;
      say('', carried === 8 ? 'Los ocho cajones están arriba de la arena. La marea ya no los alcanza.' : `Cajón ${carried} de 8.`);
    },
  };
  interactables.push(it);
}

// bote de desembarco: medio elipsoide abierto + bancos
function rowboat(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5c3e24, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }),
  );
  hull.scale.set(2.2, 0.55, 0.85);
  hull.position.y = 0.5;
  g.add(hull);
  for (const x of [-0.8, 0.6]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a6440 }));
    bench.position.set(x, 0.35, 0);
    g.add(bench);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  return g;
}
const boats = [rowboat(), rowboat()];
boats[0]!.position.set(-12, 0, 9.2);
boats[0]!.rotation.set(0, 0.4, 0.12);
boats[1]!.position.set(12, 0, 8.8);
boats[1]!.rotation.set(0, -0.3, -0.1);
boats.forEach((b) => {
  scene.add(b);
  // el casco es largo: tres círculos a lo largo de su eje
  for (const k of [-1.3, 0, 1.3]) {
    obstacles.push({ x: b.position.x + Math.cos(b.rotation.y) * k, z: b.position.z - Math.sin(b.rotation.y) * k, r: 0.8 });
  }
});

// el Mimosa, fondeado mar adentro
function ship(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.7, flatShading: true }),
  );
  hull.scale.set(7, 1.8, 1.8);
  hull.position.y = 1.2;
  g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 3.2), new THREE.MeshStandardMaterial({ color: 0x5c3e24 }));
  deck.position.y = 1.25;
  g.add(deck);
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xeae2cc, roughness: 1, side: THREE.DoubleSide });
  for (const x of [-3.5, 0.5, 4]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 11), new THREE.MeshStandardMaterial({ color: 0x3e2a17 }));
    mast.position.set(x, 6.5, 0);
    g.add(mast);
    for (const [y, w] of [[4.8, 4.2], [7.6, 3.4], [9.8, 2.4]] as const) {
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.2, 1, 4), sailMat);
      sail.scale.x = w / 0.2;
      sail.rotation.y = Math.PI / 2;
      sail.position.set(x, y, 0);
      // velas apenas recogidas, no un plano rígido
      const p = sail.geometry.attributes.position!;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) / 2.2) * Math.PI + Math.PI / 2) * 0.15);
      g.add(sail);
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
const mimosa = ship();
mimosa.position.set(-4, 0, 48);
mimosa.rotation.y = 0.75;
scene.add(mimosa);

// ---------- sprites (personajes y vegetación) en el mundo 3D ----------
const loader = new THREE.TextureLoader();
function pixelTex(url: string): THREE.Texture {
  const t = loader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

const FACING = { sur: 0, norte: 1, este: 2, oeste: 3 } as const;
type Facing = keyof typeof FACING;

class Billboard {
  readonly mesh: THREE.Mesh;
  private tex: THREE.Texture;
  constructor(url: string, frames: number, h: number, aspect: number) {
    this.tex = pixelTex(url);
    this.tex.repeat.x = 1 / frames;
    // emissive con el mismo mapa: el sprite toma el color de la luz del turno
    // pero nunca queda a contraluz ilegible (el sol puede venirle de atrás).
    const mat = new THREE.MeshLambertMaterial({
      map: this.tex,
      emissive: 0xffffff,
      emissiveMap: this.tex,
      emissiveIntensity: 0.55,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(h * aspect, h);
    geo.translate(0, h / 2, 0); // pies en el piso
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    // sombra con la silueta real del sprite, no un rectángulo
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ map: this.tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    scene.add(this.mesh);
  }
  frame(i: number, frames: number): void {
    this.tex.offset.x = i / frames;
  }
  face(yaw: number): void {
    // cilíndrico y paralelo al plano de la cámara (no apuntando a su posición):
    // así dos personajes juntos nunca se cruzan entre sí, uno queda delante del otro.
    this.mesh.rotation.y = yaw;
  }
}

const CHAR_H = 1.7;
const CHAR_ASPECT = 50 / 67;
const player = new Billboard(pcSheet, 4, CHAR_H, CHAR_ASPECT);
player.mesh.position.set(-3, 0, -2);
let facing: Facing = 'norte';
player.frame(FACING[facing], 4);
camera.position.copy(player.mesh.position).add(CAM_OFFSET);

const pepperell = new Billboard(pepperellSheet, 4, CHAR_H, CHAR_ASPECT);
pepperell.mesh.position.set(-10, 0, 7);
pepperell.frame(FACING.sur, 4);
const edwyn = new Billboard(edwynSheet, 4, CHAR_H, CHAR_ASPECT);
edwyn.mesh.position.set(9, 0, 1);
edwyn.frame(FACING.sur, 4);
for (const n of [pepperell, edwyn]) obstacles.push({ x: n.mesh.position.x, z: n.mesh.position.z, r: 0.4 });

interactables.push(
  { obj: pepperell.mesh, label: 'HABLAR', onUse: () => say('Cap. George Pepperell', 'Cajones. Abajo. Antes de marea. Rápido.') },
  { obj: edwyn.mesh, label: 'HABLAR', onUse: () => say('Edwyn Cynrig Roberts', 'Hay treinta bolsas. Dije que iba a haber doscientas. Es distinto.') },
);

const scenery: Billboard[] = [];
for (let i = 0; i < 18; i++) {
  const b = new Billboard(coironUrl, 1, 0.9 + Math.random() * 0.5, 1);
  b.mesh.position.set(-22 + Math.random() * 44, 0, -10 + Math.random() * 6);
  scenery.push(b);
}

// gaviotas: hoja de 3 cuadros, vuelan en círculos sobre la playa
const gulls: { b: Billboard; r: number; speed: number; phase: number; y: number }[] = [];
for (let i = 0; i < 4; i++) {
  const b = new Billboard(gaviotasUrl, 3, 0.6, 1);
  b.mesh.castShadow = true;
  gulls.push({ b, r: 6 + Math.random() * 8, speed: 0.25 + Math.random() * 0.2, phase: Math.random() * 6, y: 4 + Math.random() * 3 });
}

// ---------- luz por turno ----------
const hemi = new THREE.HemisphereLight(0xbfd3d8, 0x5e5741, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const lantern = new THREE.PointLight(0xffb366, 0, 9, 1.6);
lantern.castShadow = false;
scene.add(lantern);

const TURNS = {
  AMANECER: { sun: 0xffb27a, sunI: 2.2, sunDir: [-12, 6, 10], hemiSky: 0xe8cdb8, hemiGround: 0x6b6a5e, hemiI: 0.9, sky: 0xc9a58d, fog: 0xc9a58d, lantern: 0 },
  MAÑANA: { sun: 0xfff4e0, sunI: 2.6, sunDir: [-6, 14, 10], hemiSky: 0xd8e6ea, hemiGround: 0x7a7468, hemiI: 1.0, sky: 0xbfd3d8, fog: 0xbfd3d8, lantern: 0 },
  TARDE: { sun: 0xffc46b, sunI: 2.3, sunDir: [12, 8, 9], hemiSky: 0xe6c79a, hemiGround: 0x6b5a40, hemiI: 0.85, sky: 0xd99a6a, fog: 0xd9a37a, lantern: 0 },
  NOCHE: { sun: 0x7f9fd8, sunI: 0.35, sunDir: [8, 12, -6], hemiSky: 0x2e464f, hemiGround: 0x0e1416, hemiI: 0.25, sky: 0x0e1416, fog: 0x18262a, lantern: 6 },
} as const;
type Turn = keyof typeof TURNS;
let turn: Turn = 'AMANECER';
const sunOffset = new THREE.Vector3();
function applyTurn(t: Turn): void {
  turn = t;
  const c = TURNS[t];
  sun.color.setHex(c.sun);
  sun.intensity = c.sunI;
  sunOffset.set(c.sunDir[0], c.sunDir[1], c.sunDir[2]);
  hemi.color.setHex(c.hemiSky);
  hemi.groundColor.setHex(c.hemiGround);
  hemi.intensity = c.hemiI;
  scene.background = new THREE.Color(c.sky);
  scene.fog = new THREE.Fog(c.fog, 40, 110);
  lantern.intensity = c.lantern;
  $('turnLabel').textContent = t;
  document.querySelectorAll('#turns button').forEach((b) => b.classList.toggle('on', b.textContent === t));
}
for (const t of Object.keys(TURNS) as Turn[]) {
  const b = document.createElement('button');
  b.textContent = t;
  b.onclick = () => applyTurn(t);
  $('turns').appendChild(b);
}
applyTurn('AMANECER');

// ---------- post-proceso: bloom suave + tilt-shift (lo típico del HD-2D) ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.6, 0.85);
composer.addPass(bloom);
const hTilt = new ShaderPass(HorizontalTiltShiftShader);
const vTilt = new ShaderPass(VerticalTiltShiftShader);
hTilt.uniforms.r!.value = vTilt.uniforms.r!.value = 0.45;
composer.addPass(hTilt);
composer.addPass(vTilt);
composer.addPass(new OutputPass());
let fxOn = true;
$('fx').onclick = () => {
  fxOn = !fxOn;
  $('fx').textContent = `FX: ${fxOn ? 'SÍ' : 'NO'}`;
};

function resize(): void {
  const w = frame.clientWidth;
  const h = frame.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hTilt.uniforms.h!.value = 1.6 / w;
  vTilt.uniforms.v!.value = 1.6 / h;
}
window.addEventListener('resize', resize);
resize();

// ---------- entrada: teclado + arrastre ----------
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'e' || e.key === ' ') use();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const drag = { on: false, x0: 0, y0: 0, dx: 0, dy: 0 };
const stick = $('stick');
renderer.domElement.addEventListener('pointerdown', (e) => {
  Object.assign(drag, { on: true, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  const r = frame.getBoundingClientRect();
  stick.style.display = 'block';
  stick.style.left = `${e.clientX - r.left}px`;
  stick.style.top = `${e.clientY - r.top}px`;
});
window.addEventListener('pointermove', (e) => {
  if (!drag.on) return;
  drag.dx = e.clientX - drag.x0;
  drag.dy = e.clientY - drag.y0;
  const len = Math.hypot(drag.dx, drag.dy);
  const k = len > 30 ? 30 / len : 1;
  (stick.firstElementChild as HTMLElement).style.transform = `translate(${drag.dx * k}px, ${drag.dy * k}px)`;
});
window.addEventListener('pointerup', () => {
  drag.on = false;
  stick.style.display = 'none';
});
$('act').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  use();
});

let nearest: Interactable | null = null;
function use(): void {
  nearest?.onUse();
}
function say(name: string, text: string): void {
  $('tray').innerHTML = `${name ? `<div class="name">${name}</div>` : ''}${text}`;
}

// ---------- loop ----------
const clock = new THREE.Clock();
const SPEED = 4;
const tmp = new THREE.Vector3();
let fpsAcc = 0;
let fpsFrames = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  let vx = 0;
  let vz = 0;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (keys.has('w') || keys.has('arrowup')) vz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vz += 1;
  if (drag.on && Math.hypot(drag.dx, drag.dy) > 10) {
    vx = drag.dx;
    vz = drag.dy;
  }
  // mismas 4 direcciones que el juego 2D
  if (vx || vz) {
    if (Math.abs(vx) > Math.abs(vz)) {
      vz = 0;
      vx = Math.sign(vx);
      facing = vx > 0 ? 'este' : 'oeste';
    } else {
      vx = 0;
      vz = Math.sign(vz);
      facing = vz > 0 ? 'sur' : 'norte';
    }
    // la cámara mira hacia +z: "arriba" en pantalla es +z y "derecha" es -x
    const p = player.mesh.position;
    p.x = THREE.MathUtils.clamp(p.x - vx * SPEED * dt, BEACH.minX, BEACH.maxX);
    p.z = THREE.MathUtils.clamp(p.z - vz * SPEED * dt, BEACH.minZ, BEACH.maxZ);
    for (const o of obstacles) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + PLAYER_R;
      if (d < min && d > 1e-4) {
        p.x = o.x + (dx / d) * min;
        p.z = o.z + (dz / d) * min;
      }
    }
    player.frame(FACING[facing], 4);
  }

  // cámara que sigue con suavizado. Cerca de la barranca sube y se acerca
  // (pasa por arriba del borde en vez de quedar adentro de la arcilla).
  const pz = player.mesh.position.z;
  const crane = THREE.MathUtils.smoothstep(-pz, 1, -BEACH.minZ);
  camOffset.set(0, THREE.MathUtils.lerp(CAM_OFFSET.y, CRANE_OFFSET.y, crane), THREE.MathUtils.lerp(CAM_OFFSET.z, CRANE_OFFSET.z, crane));
  tmp.copy(player.mesh.position).add(camOffset);
  camera.position.lerp(tmp, 1 - Math.exp(-dt * 5));
  camera.lookAt(player.mesh.position.x, 1.6, player.mesh.position.z + 6 - crane * 5);

  // lo que quede entre la cámara y el jugador se desvanece
  rayFrom.set(player.mesh.position.x, 1, player.mesh.position.z);
  rayDir.copy(camera.position).sub(rayFrom);
  const camDist = rayDir.length();
  ray.set(rayFrom, rayDir.normalize());
  ray.far = camDist;
  const hidden = new Set(ray.intersectObjects(occluders, false).map((h) => h.object));
  for (const o of occluders) {
    const m = o.material as THREE.MeshStandardMaterial;
    // el rayo solo mira el centro; pegado a la barranca se abre un hueco del
    // ancho del sprite y algo más, para que nunca quede medio personaje tapado
    const near = crane > 0.25 && Math.abs(o.position.x - player.mesh.position.x) < 3.6;
    const target = hidden.has(o) || near ? 0.12 : 1;
    m.opacity += (target - m.opacity) * (1 - Math.exp(-dt * 10));
    m.depthWrite = m.opacity > 0.95;
  }
  sun.position.copy(player.mesh.position).add(sunOffset);
  sun.target.position.copy(player.mesh.position);
  lantern.position.set(player.mesh.position.x, 1.6, player.mesh.position.z + 0.3);

  // olas
  const pos = seaGeo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = seaBase[i * 3]!;
    const z = seaBase[i * 3 + 2]!;
    pos.setY(i, Math.sin(x * 0.35 + t * 1.2) * 0.18 + Math.cos(z * 0.5 + t * 0.9) * 0.14);
  }
  pos.needsUpdate = true;
  seaGeo.computeVertexNormals();

  mimosa.position.y = Math.sin(t * 0.7) * 0.15;
  mimosa.rotation.z = Math.sin(t * 0.5) * 0.02;
  boats.forEach((b, i) => (b.position.y = Math.max(0, Math.sin(t + i) * 0.04)));

  for (const g of gulls) {
    const a = t * g.speed + g.phase;
    g.b.mesh.position.set(Math.cos(a) * g.r, g.y + Math.sin(t * 2 + g.phase) * 0.3, 4 + Math.sin(a) * g.r * 0.5);
    g.b.frame(Math.floor(t * 4 + g.phase) % 3, 3);
  }

  const yaw = Math.atan2(camera.position.x - player.mesh.position.x, camera.position.z - player.mesh.position.z);
  for (const b of [player, pepperell, edwyn, ...scenery, ...gulls.map((g) => g.b)]) b.face(yaw);

  // interactuable más cercano
  let best: Interactable | null = null;
  let bestD = 1.6;
  for (const it of interactables) {
    const d = it.obj.position.distanceTo(player.mesh.position);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  if (best !== nearest) {
    nearest = best;
    $('act').style.display = best ? 'block' : 'none';
    if (best) $('act').textContent = best.label;
  }

  if (fxOn) composer.render();
  else renderer.render(scene, camera);

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc > 0.5) {
    $('fps').textContent = `${Math.round(fpsFrames / fpsAcc)} FPS · ${turn}`;
    fpsAcc = 0;
    fpsFrames = 0;
  }
});

if (import.meta.env.DEV) (window as unknown as { poc: unknown }).poc = { player, camera, occluders, obstacles, keys, interactables, use, get nearest() { return nearest; } };
