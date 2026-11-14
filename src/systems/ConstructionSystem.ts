/**
 * Construcción (sistema nuevo del Nivel 3, GDD §5.10): ranchos, corrales, la zanja
 * de riego y sus compuertas, sobre una grilla con alturas. Lógica pura (R1): no
 * sabe de Phaser ni de Three; la escena le pregunta qué se puede poner, lo pone y
 * le pide por dónde corre el agua. Los números salen de balance.json (R3).
 *
 * El agua (lo que se mira y lo que pesa):
 * - entra por la **toma**, la primera casilla de zanja pegada al río, con la altura
 *   del río; cada casilla de zanja que recorre le resta un poco (`headLossPerCell`);
 * - avanza por la zanja mientras el fondo de la zanja (alto del terreno menos la
 *   profundidad) quede **por debajo** del nivel del agua: si el terreno sube, no llega;
 * - donde la zanja pasa al lado de una chacra con una **compuerta**, la riega; sin
 *   compuerta, si la chacra está bastante más baja que el agua, se desborda y la
 *   **inunda** (GDD: un canal mal trazado no falla, inunda al vecino).
 *
 * La crecida: el río sube hasta un nivel y se lleva lo que esté más abajo. Sin azar.
 */

export type CellKind = 'rio' | 'orilla' | 'llano' | 'barda' | 'fuerte';
export type PieceKind = 'rancho' | 'corral' | 'zanja' | 'compuerta';

export interface Cell {
  /** alto del terreno */
  h: number;
  kind: CellKind;
  /** si es parte de una chacra: de quién (id de la parcela) */
  chacra?: string;
}

export interface ValleyGrid {
  w: number;
  h: number;
  /** fila por fila: cells[y * w + x] */
  cells: Cell[];
  /** nivel del agua del río en la toma */
  riverLevel: number;
}

export interface PieceDef {
  /** ancho × alto en casillas */
  size: [number, number];
  materiales: number;
  /** turnos de trabajo */
  turnos: number;
  /** sobre qué terreno se puede poner */
  on: CellKind[];
}

export interface ConstructionConfig {
  pieces: Record<PieceKind, PieceDef>;
  /** cuánto se hunde la zanja bajo el terreno */
  zanjaDepth: number;
  /** cuánto baja el nivel del agua por casilla de zanja recorrida */
  headLossPerCell: number;
  /** cuánto más baja que el agua tiene que estar una chacra para que se desborde */
  floodMargin: number;
  /** el barro sale del río: cuanto más lejos se construye, más turnos de acarreo (cada `tilesPerTurno` casillas, uno más) */
  acarreo: { tilesPerTurno: number; pieces: PieceKind[] };
  /** lo que pesa de lo que quedó en Punta Cuevas (items.json → ifLeft) */
  mods: {
    /** sin clavos, hierro ni sierra: el trabajo rinde la mitad (multiplica los turnos) */
    sinHierroFactor: number;
    /** sin herramientas de labranza: jornadas de más para la zanja */
    sinLabranzaZanjaJornadas: number;
  };
}

export interface Placed {
  kind: PieceKind;
  x: number;
  y: number;
}

export interface Cost {
  materiales: number;
  turnos: number;
}

export interface WaterResult {
  /** casillas de zanja con agua (índices de la grilla) */
  wet: Set<number>;
  /** la zanja no está conectada a ninguna toma */
  noToma: boolean;
  /** casillas de zanja donde el agua no llega (el terreno sube) */
  dry: Set<number>;
  /** chacras regadas (por compuerta) */
  irrigated: Set<string>;
  /** chacras inundadas (agua desbordada sin compuerta) */
  flooded: Set<string>;
}

export class ConstructionSystem {
  readonly placed: Placed[] = [];
  /** casilla → índice en `placed` (las piezas grandes ocupan varias) */
  private occupied = new Map<number, number>();
  /** distancia (casillas, caminando en cruz) de cada casilla al río */
  private readonly riverDist: Int32Array;

  constructor(
    private readonly cfg: ConstructionConfig,
    readonly grid: ValleyGrid,
    private readonly mods: { sinHierro?: boolean; sinLabranza?: boolean } = {},
  ) {
    // distancia al río de todas las casillas a la vez (BFS desde el agua)
    const { w, h, cells } = grid;
    this.riverDist = new Int32Array(w * h).fill(-1);
    const q: number[] = [];
    cells.forEach((c, i) => {
      if (c.kind === 'rio') {
        this.riverDist[i] = 0;
        q.push(i);
      }
    });
    for (let k = 0; k < q.length; k++) {
      const i = q[k]!;
      const x = i % w;
      const y = Math.floor(i / w);
      for (const [a, b] of this.neighbors(x, y)) {
        if (a < 0 || b < 0 || a >= w || b >= h) continue;
        const j = b * w + a;
        if (this.riverDist[j] !== -1) continue;
        this.riverDist[j] = this.riverDist[i]! + 1;
        q.push(j);
      }
    }
  }

  /** Casillas hasta el río desde (x, y) (−1 si no hay río). */
  distanceToRiver(x: number, y: number): number {
    const c = this.cell(x, y);
    return c ? this.riverDist[y * this.grid.w + x]! : -1;
  }

  cell(x: number, y: number): Cell | null {
    if (x < 0 || y < 0 || x >= this.grid.w || y >= this.grid.h) return null;
    return this.grid.cells[y * this.grid.w + x]!;
  }

  private idx(x: number, y: number): number {
    return y * this.grid.w + x;
  }

  pieceAt(x: number, y: number): Placed | null {
    const i = this.occupied.get(this.idx(x, y));
    return i === undefined ? null : this.placed[i]!;
  }

  /**
   * Lo que cuesta una pieza, con lo que pesa de lo que quedó atrás. Con lugar
   * (x, y), suma el acarreo del barro desde el río.
   */
  cost(kind: PieceKind, x?: number, y?: number): Cost {
    const d = this.cfg.pieces[kind];
    const f = this.mods.sinHierro ? this.cfg.mods.sinHierroFactor : 1;
    let turnos = Math.ceil(d.turnos * f);
    if (x !== undefined && y !== undefined && this.cfg.acarreo.pieces.includes(kind)) {
      const dist = Math.max(0, this.distanceToRiver(x, y));
      turnos += Math.floor(dist / this.cfg.acarreo.tilesPerTurno);
    }
    return { materiales: d.materiales, turnos };
  }

  /** Jornadas de más que lleva el riego entero (sin herramientas de labranza). */
  get extraJornadasZanja(): number {
    return this.mods.sinLabranza && this.placed.some((p) => p.kind === 'zanja') ? this.cfg.mods.sinLabranzaZanjaJornadas : 0;
  }

  /** ¿Se puede poner `kind` con la esquina en (x, y)? Si no, por qué (para mostrarlo). */
  canPlace(kind: PieceKind, x: number, y: number): { ok: boolean; reason?: string } {
    const d = this.cfg.pieces[kind];
    const [sw, sh] = d.size;
    for (let j = 0; j < sh; j++)
      for (let i = 0; i < sw; i++) {
        const c = this.cell(x + i, y + j);
        if (!c) return { ok: false, reason: 'Fuera del valle.' };
        const there = this.pieceAt(x + i, y + j);
        // la compuerta va arriba de una zanja; lo demás, en terreno libre
        if (kind === 'compuerta') {
          if (there?.kind !== 'zanja') return { ok: false, reason: 'La compuerta va sobre la zanja.' };
          if (this.placed.some((p) => p.kind === 'compuerta' && p.x === x && p.y === y)) return { ok: false, reason: 'Ya hay una compuerta.' };
          continue;
        }
        if (there) return { ok: false, reason: 'Ya hay algo ahí.' };
        if (c.chacra) return { ok: false, reason: 'Es una chacra.' };
        if (!d.on.includes(c.kind)) return { ok: false, reason: c.kind === 'rio' ? 'Es el río.' : 'Ese terreno no sirve para esto.' };
      }
    if (kind === 'zanja') {
      // la zanja crece de a una: pegada al río (la toma) o a otra zanja
      const n = this.neighbors(x, y);
      const touchesRiver = n.some(([a, b]) => this.cell(a, b)?.kind === 'rio');
      const touchesZanja = n.some(([a, b]) => this.pieceAt(a, b)?.kind === 'zanja');
      if (!touchesRiver && !touchesZanja) return { ok: false, reason: 'La zanja tiene que salir del río o seguir otra zanja.' };
    }
    return { ok: true };
  }

  place(kind: PieceKind, x: number, y: number): { ok: boolean; reason?: string; cost?: Cost } {
    const can = this.canPlace(kind, x, y);
    if (!can.ok) return can;
    const i = this.placed.length;
    this.placed.push({ kind, x, y });
    if (kind !== 'compuerta') {
      const [sw, sh] = this.cfg.pieces[kind].size;
      for (let j = 0; j < sh; j++) for (let k = 0; k < sw; k++) this.occupied.set(this.idx(x + k, y + j), i);
    }
    return { ok: true, cost: this.cost(kind, x, y) };
  }

  private neighbors(x: number, y: number): Array<[number, number]> {
    return [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
  }

  private hasCompuerta(x: number, y: number): boolean {
    return this.placed.some((p) => p.kind === 'compuerta' && p.x === x && p.y === y);
  }

  /**
   * Por dónde corre el agua: desde cada toma (zanja pegada al río), recorriendo la
   * zanja mientras el fondo quede por debajo del nivel del agua, que baja un poco
   * por casilla. Devuelve lo mojado, lo seco, y qué chacras se riegan o se inundan.
   */
  water(): WaterResult {
    const res: WaterResult = { wet: new Set(), dry: new Set(), noToma: false, irrigated: new Set(), flooded: new Set() };
    const zanjas = this.placed.filter((p) => p.kind === 'zanja');
    if (!zanjas.length) return res;
    const tomas = zanjas.filter((p) => this.neighbors(p.x, p.y).some(([a, b]) => this.cell(a, b)?.kind === 'rio'));
    if (!tomas.length) {
      res.noToma = true;
      return res;
    }
    // el mejor nivel de agua que llega a cada casilla (como un camino más corto)
    const head = new Map<number, number>();
    const queue: Array<[number, number, number]> = [];
    for (const t of tomas) {
      const c = this.cell(t.x, t.y)!;
      const h = this.grid.riverLevel;
      if (c.h - this.cfg.zanjaDepth < h) {
        head.set(this.idx(t.x, t.y), h);
        queue.push([t.x, t.y, h]);
      }
    }
    while (queue.length) {
      queue.sort((a, b) => b[2] - a[2]);
      const [x, y, h] = queue.shift()!;
      if ((head.get(this.idx(x, y)) ?? -Infinity) > h) continue;
      for (const [a, b] of this.neighbors(x, y)) {
        if (this.pieceAt(a, b)?.kind !== 'zanja') continue;
        const nh = h - this.cfg.headLossPerCell;
        const bed = this.cell(a, b)!.h - this.cfg.zanjaDepth;
        if (bed >= nh) continue; // el terreno sube: el agua no pasa
        const k = this.idx(a, b);
        if ((head.get(k) ?? -Infinity) >= nh) continue;
        head.set(k, nh);
        queue.push([a, b, nh]);
      }
    }
    for (const z of zanjas) {
      const k = this.idx(z.x, z.y);
      if (head.has(k)) res.wet.add(k);
      else res.dry.add(k);
    }
    // las chacras al costado del agua: con compuerta se riegan; sin, si están bajas, se inundan
    for (const k of res.wet) {
      const x = k % this.grid.w;
      const y = Math.floor(k / this.grid.w);
      const h = head.get(k)!;
      for (const [a, b] of this.neighbors(x, y)) {
        const c = this.cell(a, b);
        if (!c?.chacra) continue;
        if (this.hasCompuerta(x, y)) res.irrigated.add(c.chacra);
        else if (c.h < h - this.cfg.floodMargin) res.flooded.add(c.chacra);
      }
    }
    // una chacra regada a propósito no cuenta como inundada
    for (const c of res.irrigated) res.flooded.delete(c);
    return res;
  }

  /** La crecida: el río sube a `level` y se lleva ranchos y corrales que estén más abajo. Devuelve lo perdido. */
  flood(level: number): Placed[] {
    const lost: Placed[] = [];
    const keep: Placed[] = [];
    for (const p of this.placed) {
      if (p.kind !== 'rancho' && p.kind !== 'corral') {
        keep.push(p);
        continue;
      }
      const [sw, sh] = this.cfg.pieces[p.kind].size;
      let low = false;
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) if (this.cell(p.x + i, p.y + j)!.h < level) low = true;
      (low ? lost : keep).push(p);
    }
    this.placed.length = 0;
    this.occupied.clear();
    for (const p of keep) {
      const i = this.placed.length;
      this.placed.push(p);
      if (p.kind !== 'compuerta') {
        const [sw, sh] = this.cfg.pieces[p.kind].size;
        for (let j = 0; j < sh; j++) for (let k = 0; k < sw; k++) this.occupied.set(this.idx(p.x + k, p.y + j), i);
      }
    }
    return lost;
  }
}
