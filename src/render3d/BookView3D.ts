import * as THREE from 'three';
import type { BookBlock } from '@/systems/JournalSystem';

/**
 * La libreta en 3D (JournalScene): un cuaderno de tapas de cuero que llega
 * volando desde el botón de la esquina, se abre en la primera hoja y se hojea.
 * Las hojas son texturas de canvas con el texto de JournalSystem.bookBlocks()
 * paginado acá. No lee el estado del juego: recibe los bloques y dibuja.
 *
 * El reloj lo da la escena (tick(now)): así anda igual en el juego y en las
 * pruebas que avanzan cuadro a cuadro.
 */

/** medidas del cuaderno (unidades de mundo): hoja, alto, lomo de hojas, tapa, sobresale */
const W = 1;
const H = 1.45;
const PT = 0.1;
const CT = 0.024;
const OV = 0.03;
/** textura de cada hoja (px); misma proporción que la hoja */
const TW = 640;
const TH = Math.round(TW * (H / W));

const SERIF = '"IM Fell English", Georgia, "Times New Roman", serif';
const PIXEL = '"Press Start 2P", ui-monospace, monospace';
const INK = '#2B2118';
const INK_RED = '#7A3B22';

interface Style {
  font: string;
  color: string;
  lh: number;
  before: number;
  indent?: number;
  align?: 'left' | 'center';
  upper?: boolean;
  /** se queda con lo que sigue (no termina sola al pie de una hoja) */
  keep?: boolean;
}

const STYLE: Record<BookBlock['kind'], Style> = {
  title: { font: `54px ${SERIF}`, color: '#3A2418', lh: 64, before: 0, align: 'center' },
  subtitle: { font: `italic 27px ${SERIF}`, color: '#6B4A36', lh: 38, before: 18, align: 'center' },
  chapter: { font: `52px ${SERIF}`, color: '#5C3022', lh: 62, before: 40, align: 'center', keep: true },
  day: { font: `34px ${SERIF}`, color: INK_RED, lh: 44, before: 28, keep: true },
  line: { font: `29px ${SERIF}`, color: INK, lh: 39, before: 12 },
  thought: { font: `italic 27px ${SERIF}`, color: '#8A4A2E', lh: 36, before: 4, indent: 26 },
  note: { font: `italic 26px ${SERIF}`, color: '#6B5A48', lh: 36, before: 20, align: 'center' },
  'codex-title': { font: `33px ${SERIF}`, color: '#5C3022', lh: 42, before: 30, keep: true },
  'codex-label': { font: `14px ${PIXEL}`, color: '#8A7A5E', lh: 30, before: 12, upper: true, keep: true },
  'codex-text': { font: `27px ${SERIF}`, color: INK, lh: 36, before: 2 },
};

const MARGIN = { left: 62, right: 50, top: 78, bottom: 96 };

interface Row {
  kind: BookBlock['kind'];
  text: string;
  y: number;
  /** de qué bloque sale (para volver a armar la hoja con otra letra) */
  block: number;
}

export interface BookPage {
  rows: Row[];
  /** tamaño de la letra de esta hoja (1 = normal): una hoja con poco texto lo agranda */
  scale?: number;
}

/** Una hoja con menos de esto ocupado agranda la letra, hasta `max`, sin pasar de `fill`. */
const SPARSE = { below: 0.45, max: 1.5, step: 0.05, fill: 0.72 };
/** Lo que no se agranda: la portada y las hojas de capítulo tienen su propia composición. */
const FIXED_KINDS: ReadonlyArray<BookBlock['kind']> = ['title', 'chapter'];

/** La letra de un estilo a otro tamaño. */
const fontAt = (st: Style, scale = 1): string => (scale === 1 ? st.font : st.font.replace(/(\d+)px/, (_, n: string) => `${Math.round(Number(n) * scale)}px`));

/** Arma las hojas: corta el texto en renglones con las medidas reales de la letra. */
export function paginate(blocks: BookBlock[], measure: (font: string, text: string) => number): { pages: BookPage[]; anchors: Record<string, number> } {
  const pages: BookPage[] = [];
  const anchors: Record<string, number> = {};
  const bottom = TH - MARGIN.bottom;
  let cur: Row[] = [];
  let y = MARGIN.top;
  const flush = (): void => {
    pages.push({ rows: cur });
    cur = [];
    y = MARGIN.top;
  };
  blocks.forEach((b, bi) => {
    const st = STYLE[b.kind];
    if (b.pageBreak && cur.length) flush();
    if (b.anchor) anchors[b.anchor] = pages.length;
    const text = st.upper ? b.text.toUpperCase() : b.text;
    const maxW = TW - MARGIN.left - MARGIN.right - (st.indent ?? 0);
    const rows = wrap(text, (t) => measure(st.font, t), maxW);
    // el capítulo arranca más abajo en su hoja; la portada, en el medio
    if (b.kind === 'chapter' && !cur.length) y = MARGIN.top + 110;
    if (b.kind === 'title' && !cur.length && bi === 0) y = TH * 0.3;
    let before = cur.length ? st.before : 0;
    // un título no queda solo al pie: necesita lugar para un par de renglones de lo que sigue
    const need = before + rows.length * st.lh + (st.keep ? 2 * STYLE.line.lh + STYLE.line.before : 0);
    if (cur.length && y + need > bottom && rows.length * st.lh < bottom - MARGIN.top) {
      flush();
      before = 0;
    }
    y += before;
    for (const r of rows) {
      if (y + st.lh > bottom && cur.length) flush();
      cur.push({ kind: b.kind, text: r, y, block: bi });
      y += st.lh;
    }
  });
  if (cur.length || !pages.length) flush();
  for (const p of pages) enlargeIfSparse(p, measure);
  return { pages, anchors };
}

/** Lo ocupado de una hoja (0..1), de la primera línea al pie. */
function fillOf(rows: Row[], scale: number): number {
  const last = rows[rows.length - 1];
  if (!last) return 0;
  return (last.y + STYLE[last.kind].lh * scale - MARGIN.top) / (TH - MARGIN.bottom - MARGIN.top);
}

/**
 * Una hoja con poco texto (el último pensamiento de una jornada, antes de un
 * capítulo nuevo) quedaba casi vacía con la letra chica: se vuelve a armar con
 * la letra más grande, la mayor que entra sin llenar la hoja.
 */
function enlargeIfSparse(page: BookPage, measure: (font: string, text: string) => number): void {
  const rows = page.rows;
  if (!rows.length || rows.some((r) => FIXED_KINDS.includes(r.kind)) || fillOf(rows, 1) >= SPARSE.below) return;
  // el texto de cada bloque que cae en esta hoja (un bloque puede venir cortado de la anterior)
  const parts: Array<{ kind: BookBlock['kind']; text: string; block: number }> = [];
  for (const r of rows) {
    const last = parts[parts.length - 1];
    if (last?.block === r.block) last.text += ` ${r.text}`;
    else parts.push({ kind: r.kind, text: r.text, block: r.block });
  }
  const layout = (scale: number): Row[] => {
    const out: Row[] = [];
    let y = MARGIN.top;
    for (const part of parts) {
      const st = STYLE[part.kind];
      if (out.length) y += st.before * scale;
      const maxW = TW - MARGIN.left - MARGIN.right - (st.indent ?? 0);
      for (const t of wrap(part.text, (x) => measure(fontAt(st, scale), x), maxW)) {
        out.push({ kind: part.kind, text: t, y, block: part.block });
        y += st.lh * scale;
      }
    }
    return out;
  };
  for (let scale = SPARSE.max; scale > 1; scale = Math.round((scale - SPARSE.step) * 100) / 100) {
    const out = layout(scale);
    if (fillOf(out, scale) <= SPARSE.fill) {
      page.rows = out;
      page.scale = scale;
      return;
    }
  }
}

/** Corta un texto en renglones que entran en `maxW`. */
function wrap(text: string, width: (t: string) => number, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next) > maxW) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inCubic: (t: number) => t * t * t,
};

interface Anim {
  t0: number;
  dur: number;
  step: (k: number) => void;
  done?: () => void;
}

export class BookView3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  /** contenedor que respira apenas: el cuaderno está en la mano, no apoyado */
  private readonly float = new THREE.Group();
  private readonly coverPivot = new THREE.Group();
  private readonly flipPivot = new THREE.Group();
  private readonly rightPage: THREE.Mesh;
  private readonly leftPage: THREE.Mesh;
  private readonly leafFront: THREE.Mesh;
  private readonly leafBack: THREE.Mesh;
  private readonly leafGeo: THREE.PlaneGeometry;
  private readonly paper: THREE.CanvasTexture;
  private readonly textures = new Map<number, THREE.CanvasTexture>();
  private readonly measureCtx: CanvasRenderingContext2D;
  private pages: BookPage[] = [];
  private anchors: Record<string, number> = {};
  private anims: Anim[] = [];
  /** hoja que se ve a la derecha */
  index = 0;
  private aspect: number;
  private camClosed = new THREE.Vector3();
  private camOpen = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    cssW: number,
    cssH: number,
    pixelRatio: number,
    blocks: BookBlock[],
    private readonly title: string,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(cssW, cssH, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.aspect = cssW / cssH;
    this.camera = new THREE.PerspectiveCamera(28, this.aspect, 0.1, 50);

    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a1d14, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.4);
    key.position.set(-1.5, 2.2, 3);
    this.scene.add(key);

    this.measureCtx = document.createElement('canvas').getContext('2d')!;
    const laid = paginate(blocks, (font, t) => {
      this.measureCtx.font = font;
      return this.measureCtx.measureText(t).width;
    });
    this.pages = laid.pages;
    this.anchors = laid.anchors;

    // ---- el cuaderno: tapa de atrás, hojas, lomo, tapa de adelante (que se abre)
    const leather = new THREE.MeshStandardMaterial({ map: leatherTexture(), roughness: 0.85, metalness: 0 });
    const edges = new THREE.MeshStandardMaterial({ map: edgeTexture(), roughness: 1 });
    this.paper = paperTexture(null, -1, this.title);
    const paperMat = new THREE.MeshBasicMaterial({ map: this.paper });

    const back = new THREE.Mesh(new THREE.BoxGeometry(W + OV, H + 2 * OV, CT), leather);
    back.position.set((W + OV) / 2, 0, -PT / 2 - CT / 2);
    const block = new THREE.Mesh(new THREE.BoxGeometry(W, H, PT), [edges, edges, edges, edges, paperMat, paperMat]);
    block.position.set(W / 2, 0, 0);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(CT * 1.6, H + 2 * OV, PT + 2 * CT), leather);
    spine.position.set(-CT * 0.8, 0, 0);

    const coverFace = new THREE.MeshStandardMaterial({ map: coverTexture(this.title), roughness: 0.8 });
    const endpaper = new THREE.MeshStandardMaterial({ map: endpaperTexture(), roughness: 1 });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(W + OV, H + 2 * OV, CT), [leather, leather, leather, leather, coverFace, endpaper]);
    cover.position.set((W + OV) / 2, 0, 0);
    this.coverPivot.position.set(0, 0, PT / 2 + CT / 2);
    this.coverPivot.add(cover);

    this.rightPage = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.pageTexture(0) }));
    this.rightPage.position.set(W / 2, 0, PT / 2 + 0.002);
    // del lado izquierdo, ya abierta: la hoja de atrás de la anterior (papel)
    this.leftPage = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.paper }));
    this.leftPage.position.set(-W / 2, 0, PT / 2 + CT + 0.004);
    this.leftPage.visible = false;

    // la hoja que se da vuelta: dos caras sobre la misma malla, que se curva
    this.leafGeo = new THREE.PlaneGeometry(W, H, 24, 1);
    this.leafFront = new THREE.Mesh(this.leafGeo, new THREE.MeshBasicMaterial({ map: this.pageTexture(0), side: THREE.FrontSide }));
    this.leafBack = new THREE.Mesh(this.leafGeo, new THREE.MeshBasicMaterial({ map: this.paper, side: THREE.BackSide }));
    this.flipPivot.position.set(0, 0, PT / 2 + 0.006);
    this.flipPivot.add(this.leafFront, this.leafBack);
    this.flipPivot.visible = false;
    this.curl(0);

    this.root.add(back, block, spine, this.coverPivot, this.rightPage, this.leftPage, this.flipPivot);
    this.float.add(this.root);
    this.scene.add(this.float);

    // cámaras: el cuaderno cerrado entero, y la hoja de la derecha llenando la pantalla
    this.camClosed.set(W / 2, 0, this.fitDistance((W + OV) * 1.55, (H + 2 * OV) * 1.3));
    this.camOpen.set(W / 2, 0, this.fitDistance(W * 1.05, H * 1.03));
    this.camera.position.copy(this.camClosed);
    this.camera.lookAt(this.camClosed.x, 0, 0);
    this.root.scale.setScalar(0.001);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** ¿Hay una animación andando? (mientras tanto no se aceptan toques) */
  get busy(): boolean {
    return this.anims.length > 0;
  }

  anchor(id: string): number {
    return this.anchors[id] ?? 0;
  }

  /** Distancia de cámara para que entren `w` × `h` (unidades de mundo). */
  private fitDistance(w: number, h: number): number {
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max(h / (2 * t), w / (2 * t * this.aspect));
  }

  // ---------------------------------------------------------------- animaciones

  private play(dur: number, step: (k: number) => void, done?: () => void): void {
    this.anims.push({ t0: -1, dur, step, done });
  }

  /** Llega volando desde arriba a la derecha (el botón de la libreta) y se abre en la primera hoja. */
  open(onOpened: () => void): void {
    const from = { p: new THREE.Vector3(1.25, 1.7, 0.6), r: new THREE.Euler(-0.6, 0.9, -0.5), s: 0.12 };
    this.play(
      720,
      (k) => {
        const e = ease.outCubic(k);
        this.root.position.lerpVectors(from.p, new THREE.Vector3(0, 0, 0), e);
        this.root.rotation.set(from.r.x * (1 - e), from.r.y * (1 - e), from.r.z * (1 - e));
        this.root.scale.setScalar(from.s + (1 - from.s) * e);
      },
      () =>
        this.play(
          760,
          (k) => {
            const e = ease.inOutCubic(k);
            this.coverPivot.rotation.y = -Math.PI * e;
            this.leftPage.visible = e > 0.5;
            this.camera.position.lerpVectors(this.camClosed, this.camOpen, ease.inOutCubic(Math.max(0, (k - 0.25) / 0.75)));
          },
          onOpened,
        ),
    );
  }

  /** Se cierra y vuelve volando a la esquina. */
  close(onClosed: () => void): void {
    this.anims = [];
    const start = { cam: this.camera.position.clone(), cover: this.coverPivot.rotation.y };
    this.flipPivot.visible = false;
    this.play(
      420,
      (k) => {
        const e = ease.inOutCubic(k);
        this.coverPivot.rotation.y = start.cover * (1 - e);
        this.leftPage.visible = this.coverPivot.rotation.y < -Math.PI / 2;
        this.camera.position.lerpVectors(start.cam, this.camClosed, e);
      },
      () =>
        this.play(
          380,
          (k) => {
            const e = ease.inCubic(k);
            this.root.position.lerpVectors(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.25, 1.7, 0.6), e);
            this.root.rotation.set(-0.6 * e, 0.9 * e, -0.5 * e);
            this.root.scale.setScalar(1 - 0.88 * e);
          },
          onClosed,
        ),
    );
  }

  /** Pasa a la hoja `target` con una hoja que se da vuelta (una sola, aunque salte varias). */
  goTo(target: number, onDone?: () => void): boolean {
    const to = Math.max(0, Math.min(this.pages.length - 1, target));
    if (to === this.index || this.busy) return false;
    const forward = to > this.index;
    const leafMat = this.leafFront.material as THREE.MeshBasicMaterial;
    const rightMat = this.rightPage.material as THREE.MeshBasicMaterial;
    this.flipPivot.visible = true;
    if (forward) {
      // la hoja de ahora se va a la izquierda y deja ver la siguiente
      leafMat.map = this.pageTexture(this.index);
      rightMat.map = this.pageTexture(to);
    } else {
      // la anterior vuelve de la izquierda y tapa la de ahora
      leafMat.map = this.pageTexture(to);
    }
    leafMat.needsUpdate = true;
    rightMat.needsUpdate = true;
    const dur = Math.abs(to - this.index) > 1 ? 520 : 460;
    this.play(
      dur,
      (k) => this.curl(forward ? ease.inOutCubic(k) : 1 - ease.inOutCubic(k)),
      () => {
        if (!forward) {
          rightMat.map = this.pageTexture(to);
          rightMat.needsUpdate = true;
        }
        this.flipPivot.visible = false;
        this.index = to;
        this.prefetch();
        onDone?.();
      },
    );
    return true;
  }

  /**
   * Curva la hoja que se da vuelta: `t` 0 = apoyada a la derecha, 1 = a la
   * izquierda. Cada franja de la hoja gira un poco más que la anterior, como el
   * papel cuando se lo levanta de la punta.
   */
  private curl(t: number): void {
    const pos = this.leafGeo.attributes.position as THREE.BufferAttribute;
    const cols = 25;
    const dx = W / (cols - 1);
    const bend = 0.9 * Math.sin(Math.PI * t);
    let x = 0;
    let z = 0;
    const xs: number[] = [0];
    const zs: number[] = [0];
    for (let j = 1; j < cols; j++) {
      const th = -Math.PI * t - bend * (j / (cols - 1));
      x += Math.cos(th) * dx;
      z += -Math.sin(th) * dx;
      xs.push(x);
      zs.push(z);
    }
    for (let i = 0; i < pos.count; i++) {
      const j = i % cols;
      pos.setX(i, xs[j]!);
      pos.setZ(i, zs[j]! + 0.002 * Math.sin(Math.PI * t));
    }
    pos.needsUpdate = true;
    this.leafGeo.computeBoundingSphere();
  }

  /** Un cuadro: avanza las animaciones y dibuja. `now` en ms (el reloj de la escena). */
  tick(now: number): void {
    const a = this.anims[0];
    if (a) {
      if (a.t0 < 0) a.t0 = now;
      const k = Math.min(1, (now - a.t0) / a.dur);
      a.step(k);
      if (k >= 1) {
        this.anims.shift();
        a.done?.();
      }
    }
    this.float.position.y = Math.sin(now / 900) * 0.006;
    this.float.rotation.z = Math.sin(now / 1300) * 0.004;
    this.camera.lookAt(this.camera.position.x, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- hojas

  private pageTexture(i: number): THREE.CanvasTexture {
    let t = this.textures.get(i);
    if (!t) {
      t = paperTexture(this.pages[i] ?? null, i, this.title);
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.textures.set(i, t);
    }
    return t;
  }

  /** Dibuja de antemano las vecinas, para que el pase de hoja no frene. */
  private prefetch(): void {
    this.pageTexture(this.index + 1);
    if (this.index > 0) this.pageTexture(this.index - 1);
  }

  destroy(): void {
    this.anims = [];
    for (const t of this.textures.values()) t.dispose();
    this.paper.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------- texturas (canvas)

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

/** Grano fijo (no Math.random: la hoja se ve igual cada vez que se abre). */
function grain(c: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, seed: number): void {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const b = Math.sin((i + 1) * 39.3468 + seed * 11.135) * 24634.6345;
    c.fillRect((a - Math.floor(a)) * w, (b - Math.floor(b)) * h, 2, 2);
  }
}

/** Una hoja: papel viejo, la línea del margen y su texto. `page` null = papel en blanco. */
function paperTexture(page: BookPage | null, index: number, _title: string): THREE.CanvasTexture {
  return canvasTex(TW, TH, (c) => {
    c.fillStyle = '#E9DFC7';
    c.fillRect(0, 0, TW, TH);
    grain(c, TW, TH, 2600, 'rgba(120,96,60,0.07)', index + 3);
    // sombra hacia el lomo (izquierda) y bordes gastados
    const g = c.createLinearGradient(0, 0, 70, 0);
    g.addColorStop(0, 'rgba(70,50,30,0.28)');
    g.addColorStop(1, 'rgba(70,50,30,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 70, TH);
    const v = c.createRadialGradient(TW / 2, TH / 2, TH * 0.35, TW / 2, TH / 2, TH * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(90,60,30,0.18)');
    c.fillStyle = v;
    c.fillRect(0, 0, TW, TH);
    if (!page) return;
    // la línea roja del margen
    c.strokeStyle = 'rgba(156,58,36,0.28)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(MARGIN.left - 18, 30);
    c.lineTo(MARGIN.left - 18, TH - 30);
    c.stroke();
    c.textBaseline = 'alphabetic';
    const k = page.scale ?? 1;
    for (const r of page.rows) {
      const st = STYLE[r.kind];
      const lh = st.lh * k;
      c.font = fontAt(st, k);
      c.fillStyle = st.color;
      const baseline = r.y + lh * 0.78;
      const x0 = MARGIN.left + (st.indent ?? 0);
      if (st.align === 'center') {
        c.textAlign = 'center';
        c.fillText(r.text, TW / 2 + (MARGIN.left - MARGIN.right) / 4, baseline);
        c.textAlign = 'left';
      } else c.fillText(r.text, x0, baseline);
      if (r.kind === 'thought') {
        // lo que el personaje cree: con otra tinta y una raya al costado
        c.fillStyle = 'rgba(138,74,46,0.45)';
        c.fillRect(MARGIN.left + 6, r.y + 6, 3, lh - 6);
      }
      if (r.kind === 'day') {
        c.fillStyle = 'rgba(122,59,34,0.35)';
        c.fillRect(MARGIN.left, r.y + lh - 4, TW - MARGIN.left - MARGIN.right, 2);
      }
      if (r.kind === 'chapter') {
        // filete con rombo, como la portada del juego
        const cx = TW / 2 + (MARGIN.left - MARGIN.right) / 4;
        const y = r.y + st.lh + 16;
        c.fillStyle = 'rgba(122,59,34,0.5)';
        c.fillRect(cx - 120, y, 100, 2);
        c.fillRect(cx + 20, y, 100, 2);
        c.save();
        c.translate(cx, y + 1);
        c.rotate(Math.PI / 4);
        c.fillStyle = '#9C3A24';
        c.fillRect(-6, -6, 12, 12);
        c.restore();
      }
    }
    // número de hoja
    c.font = `italic 22px ${SERIF}`;
    c.fillStyle = '#8A7A5E';
    c.textAlign = 'center';
    c.fillText(`— ${index + 1} —`, TW / 2, TH - 44);
    c.textAlign = 'left';
  });
}

function leatherTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#5C3022';
    c.fillRect(0, 0, 256, 256);
    grain(c, 256, 256, 1800, 'rgba(20,8,4,0.18)', 7);
    grain(c, 256, 256, 600, 'rgba(176,122,82,0.10)', 9);
  });
}

function coverTexture(title: string): THREE.CanvasTexture {
  const w = 512;
  const h = Math.round(w * ((H + 2 * OV) / (W + OV)));
  return canvasTex(w, h, (c) => {
    c.fillStyle = '#5C3022';
    c.fillRect(0, 0, w, h);
    grain(c, w, h, 5200, 'rgba(20,8,4,0.2)', 3);
    grain(c, w, h, 1600, 'rgba(176,122,82,0.12)', 5);
    // marco gofrado y dorado gastado
    c.strokeStyle = 'rgba(201,162,90,0.55)';
    c.lineWidth = 3;
    c.strokeRect(34, 34, w - 68, h - 68);
    c.strokeStyle = 'rgba(201,162,90,0.3)';
    c.lineWidth = 1.5;
    c.strokeRect(46, 46, w - 92, h - 92);
    // el elástico que la cierra
    c.fillStyle = 'rgba(24,14,10,0.85)';
    c.fillRect(w - 64, 0, 14, h);
    c.fillStyle = 'rgba(201,162,90,0.85)';
    c.textAlign = 'center';
    c.font = `64px ${SERIF}`;
    c.fillText('Libreta', w / 2 - 10, h * 0.42);
    c.font = `italic 30px ${SERIF}`;
    c.fillText(title, w / 2 - 10, h * 0.42 + 54);
    c.save();
    c.translate(w / 2 - 10, h * 0.42 + 92);
    c.rotate(Math.PI / 4);
    c.fillStyle = '#9C3A24';
    c.fillRect(-7, -7, 14, 14);
    c.restore();
    c.font = `26px ${SERIF}`;
    c.fillStyle = 'rgba(201,162,90,0.6)';
    c.fillText('1865', w / 2 - 10, h - 90);
  });
}

function endpaperTexture(): THREE.CanvasTexture {
  return canvasTex(256, 360, (c) => {
    c.fillStyle = '#C9B48E';
    c.fillRect(0, 0, 256, 360);
    // jaspeado de guarda, apagado
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = `rgba(92,48,34,${0.08 + (i % 5) * 0.02})`;
      c.lineWidth = 2;
      c.beginPath();
      for (let x = 0; x <= 256; x += 16) c.lineTo(x, i * 9 + Math.sin(x * 0.05 + i) * 6);
      c.stroke();
    }
  });
}

function edgeTexture(): THREE.CanvasTexture {
  return canvasTex(64, 256, (c) => {
    c.fillStyle = '#DCD0B4';
    c.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 3) {
      c.fillStyle = y % 6 ? 'rgba(120,96,60,0.12)' : 'rgba(255,255,255,0.15)';
      c.fillRect(0, y, 64, 1);
    }
    for (let x = 0; x < 64; x += 3) {
      c.fillStyle = 'rgba(120,96,60,0.12)';
      c.fillRect(x, 0, 1, 256);
    }
  });
}
