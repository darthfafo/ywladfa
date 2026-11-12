/**
 * La marcha (sistema nuevo del Nivel 2, GDD §6): el reloj avanza con la
 * distancia. Lógica pura, sin Phaser (R1): la escena le pasa el tiempo y lee el
 * estado; los números salen de balance.json (nivel02.marcha) y el tramo de
 * data/proto/marcha.json.
 *
 * Prototipo: tiene su propio estado (no toca GameState ni la partida guardada).
 *
 * Reglas:
 * - La columna avanza a tres pasos: aflojar, normal, apurar. Más rápido gasta más
 *   agua por tramo y cansa a Mari.
 * - El reloj es la distancia: cada `tilesPerTurn` recorridos pasa un turno.
 *   Esperar también gasta reloj (el sol no espera) pero no acerca.
 * - Si Mari se cansa, se queda atrás; si se queda muy atrás, la columna para.
 * - Los obstáculos frenan la columna hasta que el jugador decide.
 * - Al caer la noche se acampa: se come, se bebe y Mari descansa.
 * - Sin agua, la columna va más lenta y Mari pierde salud. Nunca se pierde (R7):
 *   se llega igual, peor.
 */

export type Pace = 'aflojar' | 'normal' | 'apurar';
const TURNS = ['amanecer', 'manana', 'tarde', 'noche'] as const;
export type Turn = (typeof TURNS)[number];

export interface MarchConfig {
  startTurn: Turn;
  tilesPerTurn: number;
  paces: Record<Pace, { speedTilesPerSec: number; waterPerTile: number; mariStaminaPerTile: number }>;
  waitTilesPerSec: number;
  waitStaminaPerSec: number;
  mariLagBelowStamina: number;
  mariLagTilesPerSec: number;
  mariCatchUpTilesPerSec: number;
  mariMaxLagTiles: number;
  thirstSpeedFactor: number;
  thirstHealthPerTile: number;
  night: { agua: number; comida: number; staminaRecover: number };
  start: { agua: number; comida: number; mariStamina: number; mariHealth: number };
}

export interface MarchOption {
  id: string;
  text: string;
  detail?: string;
  slowFactor?: number;
  extraTiles?: number;
  water?: number;
}

export interface MarchObstacle {
  id: string;
  type: 'canadon' | 'aguada' | 'medano';
  at?: number;
  width?: number;
  depth?: number;
  from?: number;
  to?: number;
  slowFactor?: number;
  staminaFactor?: number;
  prompt?: string;
  options?: MarchOption[];
}

export interface MarchTrack {
  lengthTiles: number;
  from: string;
  to: string;
  /** [x, alto] en tiles: el perfil del terreno a lo largo del camino */
  profile: Array<[number, number]>;
  obstacles: MarchObstacle[];
  lines: Array<{ at: number; speaker: string; text: string }>;
}

export interface MarchState {
  day: number;
  turn: Turn;
  /** posición de la cabeza de la columna (tiles desde la salida) */
  pos: number;
  /** reloj en tiles equivalentes recorridos desde el arranque del turno actual */
  clock: number;
  pace: Pace;
  waiting: boolean;
  agua: number;
  comida: number;
  mariStamina: number;
  mariHealth: number;
  /** cuánto se quedó atrás Mari (tiles) */
  mariLag: number;
  /** obstáculo que frena la columna hasta que se elija qué hacer */
  blocked: MarchObstacle | null;
  /** obstáculos ya resueltos → opción elegida */
  resolved: Record<string, string>;
  /** líneas ya dichas */
  said: number[];
  arrived: boolean;
  /** tiles recorridos de más (rodeos, desvíos) */
  extraTiles: number;
}

export type MarchEvent =
  | { type: 'obstacle'; obstacle: MarchObstacle }
  | { type: 'line'; speaker: string; text: string }
  | { type: 'turn'; day: number; turn: Turn }
  | { type: 'night'; day: number }
  | { type: 'mariBehind' }
  | { type: 'thirst' }
  | { type: 'skip'; tiles: number; label: string }
  | { type: 'arrived' };

/** Alto del terreno en x (tiles): interpolación suave del perfil, con el cañadón hundido. */
export function profileHeight(track: MarchTrack, x: number): number {
  const p = track.profile;
  let h = p[p.length - 1]![1];
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, h0] = p[i]!;
    const [x1, h1] = p[i + 1]!;
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      const e = t * t * (3 - 2 * t);
      h = h0 + (h1 - h0) * e;
      break;
    }
  }
  if (x < p[0]![0]) h = p[0]![1];
  for (const o of track.obstacles) {
    if (o.type !== 'canadon' || o.at === undefined) continue;
    const w = o.width ?? 10;
    const u = (x - o.at) / w; // 0..1 dentro del cañadón
    if (u > 0 && u < 1) {
      // paredes empinadas y fondo plano: un cañadón, no una hondonada
      const wall = Math.min(1, Math.min(u, 1 - u) / 0.22);
      h -= (o.depth ?? 2) * (1 - Math.pow(1 - wall, 2));
    }
  }
  return h;
}

export class MarchSystem {
  readonly state: MarchState;

  constructor(
    private readonly cfg: MarchConfig,
    readonly track: MarchTrack,
  ) {
    this.state = {
      day: 1,
      turn: cfg.startTurn,
      pos: 0,
      clock: 0,
      pace: 'normal',
      waiting: false,
      agua: cfg.start.agua,
      comida: cfg.start.comida,
      mariStamina: cfg.start.mariStamina,
      mariHealth: cfg.start.mariHealth,
      mariLag: 0,
      blocked: null,
      resolved: {},
      said: [],
      arrived: false,
      extraTiles: 0,
    };
  }

  setPace(p: Pace): void {
    this.state.pace = p;
  }

  setWaiting(w: boolean): void {
    this.state.waiting = w;
  }

  /** Cuánto falta (0..1) para llegar. */
  get progress(): number {
    return Math.min(1, this.state.pos / this.track.lengthTiles);
  }

  /** Velocidad real de la cabeza de la columna ahora (tiles/s). */
  speed(): number {
    const s = this.state;
    if (s.arrived || s.blocked || s.waiting) return 0;
    // Mari muy atrás: la columna la espera sola
    if (s.mariLag >= this.cfg.mariMaxLagTiles) return 0;
    let v = this.cfg.paces[s.pace].speedTilesPerSec;
    for (const o of this.track.obstacles) {
      if (o.type === 'medano' && o.from !== undefined && o.to !== undefined && s.pos >= o.from && s.pos <= o.to) v *= o.slowFactor ?? 1;
      if (o.type === 'canadon' && s.resolved[o.id] === 'bajar' && o.at !== undefined && s.pos >= o.at && s.pos <= o.at + (o.width ?? 10)) {
        const opt = o.options?.find((x) => x.id === 'bajar');
        v *= opt?.slowFactor ?? 1;
      }
    }
    if (s.agua <= 0) v *= this.cfg.thirstSpeedFactor;
    return v;
  }

  /** Avanza `dt` segundos. Devuelve lo que pasó, para que la escena lo muestre. */
  update(dt: number): MarchEvent[] {
    const s = this.state;
    const ev: MarchEvent[] = [];
    if (s.arrived || s.blocked) return ev;

    const v = this.speed();
    const moved = v * dt;
    const cfg = this.cfg;

    if (s.waiting || (v === 0 && s.mariLag >= cfg.mariMaxLagTiles)) {
      // esperar: el reloj corre, Mari descansa y alcanza a la columna
      s.mariStamina = Math.min(100, s.mariStamina + cfg.waitStaminaPerSec * dt);
      s.mariLag = Math.max(0, s.mariLag - cfg.mariCatchUpTilesPerSec * dt);
      this.tick(cfg.waitTilesPerSec * dt, ev);
      return ev;
    }

    // la columna se acerca al próximo obstáculo sin pasarse
    const next = this.nextObstacle();
    let step = moved;
    if (next && next.at !== undefined && s.pos + step >= next.at - 1) {
      step = Math.max(0, next.at - 1 - s.pos);
      s.blocked = next;
      ev.push({ type: 'obstacle', obstacle: next });
    }
    s.pos += step;

    // agua y cansancio por distancia caminada
    const pace = cfg.paces[s.pace];
    s.agua = Math.max(0, s.agua - pace.waterPerTile * step);
    let fatigue = pace.mariStaminaPerTile * step;
    for (const o of this.track.obstacles) {
      if (o.type === 'medano' && o.from !== undefined && o.to !== undefined && s.pos >= o.from && s.pos <= o.to && fatigue > 0) {
        fatigue *= o.staminaFactor ?? 1;
      }
    }
    s.mariStamina = Math.max(0, Math.min(100, s.mariStamina - fatigue));
    if (s.agua <= 0) {
      s.mariHealth = Math.max(0, s.mariHealth - cfg.thirstHealthPerTile * step);
      if (step > 0 && !s.said.includes(-1)) {
        s.said.push(-1);
        ev.push({ type: 'thirst' });
      }
    }

    // Mari se queda atrás si no da más
    const wasFar = s.mariLag >= cfg.mariMaxLagTiles;
    if (s.mariStamina < cfg.mariLagBelowStamina) s.mariLag = Math.min(cfg.mariMaxLagTiles, s.mariLag + cfg.mariLagTilesPerSec * dt);
    else s.mariLag = Math.max(0, s.mariLag - cfg.mariCatchUpTilesPerSec * dt);
    if (!wasFar && s.mariLag >= cfg.mariMaxLagTiles) ev.push({ type: 'mariBehind' });

    // líneas del camino
    this.track.lines.forEach((l, i) => {
      if (!s.said.includes(i) && s.pos >= l.at) {
        s.said.push(i);
        ev.push({ type: 'line', speaker: l.speaker, text: l.text });
      }
    });

    this.tick(step, ev);

    if (s.pos >= this.track.lengthTiles) {
      s.pos = this.track.lengthTiles;
      s.arrived = true;
      ev.push({ type: 'arrived' });
    }
    return ev;
  }

  /** Elige qué hacer frente al obstáculo que frena la columna. */
  choose(optionId: string): MarchEvent[] {
    const s = this.state;
    const o = s.blocked;
    if (!o) return [];
    const opt = o.options?.find((x) => x.id === optionId);
    if (!opt) return [];
    s.resolved[o.id] = opt.id;
    s.blocked = null;
    const ev: MarchEvent[] = [];
    if (opt.water) s.agua += opt.water;
    if (opt.extraTiles) {
      // rodeo o desvío: el reloj y el agua corren como si se caminara, pero la
      // columna vuelve al mismo camino (y, si rodea un cañadón, del otro lado)
      s.extraTiles += opt.extraTiles;
      s.agua = Math.max(0, s.agua - this.cfg.paces[s.pace].waterPerTile * opt.extraTiles);
      s.mariStamina = Math.max(0, s.mariStamina - this.cfg.paces[s.pace].mariStaminaPerTile * opt.extraTiles * 0.5);
      if (o.type === 'canadon' && o.at !== undefined) s.pos = o.at + (o.width ?? 10) + 1;
      ev.push({ type: 'skip', tiles: opt.extraTiles, label: opt.text });
      this.tick(opt.extraTiles, ev);
    }
    return ev;
  }

  private nextObstacle(): MarchObstacle | null {
    const s = this.state;
    let best: MarchObstacle | null = null;
    for (const o of this.track.obstacles) {
      if (!o.options || o.at === undefined || s.resolved[o.id]) continue;
      if (o.at - 1 < s.pos - 0.001) continue;
      if (!best || o.at < best.at!) best = o;
    }
    return best;
  }

  /** El reloj avanza `tiles` equivalentes: turnos y, al llegar la noche, campamento. */
  private tick(tiles: number, ev: MarchEvent[]): void {
    const s = this.state;
    s.clock += tiles;
    while (s.clock >= this.cfg.tilesPerTurn) {
      s.clock -= this.cfg.tilesPerTurn;
      const i = TURNS.indexOf(s.turn);
      if (s.turn === 'tarde') {
        // cae la noche: se acampa, se come, se bebe, se descansa; amanece otro día
        ev.push({ type: 'night', day: s.day });
        s.agua = Math.max(0, s.agua - this.cfg.night.agua);
        s.comida = Math.max(0, s.comida - this.cfg.night.comida);
        s.mariStamina = Math.min(100, s.mariStamina + this.cfg.night.staminaRecover);
        s.mariLag = 0;
        s.day += 1;
        s.turn = 'amanecer';
      } else {
        s.turn = TURNS[i + 1]!;
      }
      ev.push({ type: 'turn', day: s.day, turn: s.turn });
    }
  }
}
