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
 * - El reloj corre con el tiempo, al mismo ritmo camine como camine la columna
 *   (`clockTilesPerSec`): apurar cubre más camino por turno, aflojar menos, y
 *   todo lo que frena (la carga repartida, la tormenta, el médano) cuesta horas.
 *   Esperar también gasta reloj (el sol no espera) pero no acerca.
 * - Si Mari se cansa, se queda atrás; si se queda muy atrás, la columna para.
 * - Los obstáculos frenan la columna hasta que el jugador decide. Cada opción
 *   cuesta algo distinto: tiempo, agua, comida, el paso del resto del camino o a
 *   Mari. Ninguna es gratis, ninguna es azar.
 * - Una bifurcación elige el camino (`route`); algunos obstáculos solo aparecen
 *   en uno de los dos.
 * - Al caer la noche se decide cómo repartir el agua y la comida.
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
  /** cuánto avanza el reloj por segundo (en tiles de paso normal), se camine o se espere */
  clockTilesPerSec: number;
  waitStaminaPerSec: number;
  /** agua que se gasta esperando, por tile de reloj */
  waitWaterPerTile: number;
  mariLagBelowStamina: number;
  mariLagTilesPerSec: number;
  mariCatchUpTilesPerSec: number;
  mariMaxLagTiles: number;
  thirstSpeedFactor: number;
  thirstHealthPerTile: number;
  start: { agua: number; comida: number; mariStamina: number; mariHealth: number };
}

/** Una opción frente a un obstáculo. Todos los campos son opcionales y se suman. */
export interface MarchOption {
  id: string;
  text: string;
  detail?: string;
  /** cañadón: velocidad mientras se lo cruza */
  slowFactor?: number;
  /** más camino: el reloj, el agua y el cansancio corren como si se caminara */
  extraTiles?: number;
  /** perderse: igual que extraTiles, pero cuenta como extravío */
  lostTiles?: number;
  /** esperar a resguardo: el reloj corre, se gasta poca agua, Mari descansa */
  shelterTiles?: number;
  /** cambios directos */
  water?: number;
  comida?: number;
  mariStamina?: number;
  mariHealth?: number;
  /** multiplica la velocidad de acá al final (ej. repartir la carga de un caballo) */
  loadFactor?: number;
  /** bifurcación: qué camino se toma */
  route?: string;
}

export interface MarchObstacle {
  id: string;
  type: 'canadon' | 'aguada' | 'medano' | 'fork' | 'landmark' | 'storm' | 'horse' | 'night';
  title?: string;
  at?: number;
  width?: number;
  depth?: number;
  /** zonas (médano, tormenta): de dónde a dónde rige el efecto */
  from?: number;
  to?: number;
  slowFactor?: number;
  staminaFactor?: number;
  prompt?: string;
  options?: MarchOption[];
  /** solo aparece si se tomó este camino en la bifurcación */
  requiresRoute?: string;
  /** bifurcación: dónde vuelven a juntarse los dos caminos */
  rejoinAt?: number;
  /** tormenta: con qué opción se la enfrenta (si se elige otra, se espera a que pase) */
  braveOption?: string;
}

export interface MarchTrack {
  lengthTiles: number;
  from: string;
  to: string;
  /** [x, alto] en tiles: el perfil del terreno a lo largo del camino */
  profile: Array<[number, number]>;
  obstacles: MarchObstacle[];
  /** la decisión de cada noche */
  night: { title: string; prompt: string; options: MarchOption[] };
  lines: Array<{ at: number; speaker: string; text: string; requiresRoute?: string }>;
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
  /** tiles recorridos de más (rodeos, desvíos, extravíos) */
  extraTiles: number;
  /** camino tomado en la bifurcación */
  route: string | null;
  /** velocidad del resto del camino (1 = normal) */
  loadFactor: number;
  /** veces que la columna se perdió */
  lostCount: number;
  /** noches en las que se racionó */
  rationedNights: number;
}

export type MarchEvent =
  | { type: 'obstacle'; obstacle: MarchObstacle }
  | { type: 'line'; speaker: string; text: string }
  | { type: 'turn'; day: number; turn: Turn }
  | { type: 'night'; day: number; option: MarchOption }
  | { type: 'mariBehind' }
  | { type: 'thirst' }
  | { type: 'skip'; tiles: number; label: string; kind: 'detour' | 'lost' | 'shelter' }
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
  private nightObstacle: MarchObstacle;

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
      route: null,
      loadFactor: 1,
      lostCount: 0,
      rationedNights: 0,
    };
    this.nightObstacle = { id: 'noche', type: 'night', title: track.night.title, prompt: track.night.prompt, options: track.night.options };
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

  /** ¿El obstáculo corresponde al camino tomado? */
  private onRoute(o: { requiresRoute?: string }): boolean {
    return !o.requiresRoute || o.requiresRoute === this.state.route;
  }

  /** ¿Está la columna adentro de la zona de este obstáculo (médano, tormenta)? */
  private inZone(o: MarchObstacle): boolean {
    const from = o.from ?? o.at;
    const to = o.to;
    return from !== undefined && to !== undefined && this.state.pos >= from && this.state.pos <= to;
  }

  /** ¿La tormenta está pegando ahora? (se eligió enfrentarla y se está adentro) */
  stormHere(): MarchObstacle | null {
    for (const o of this.track.obstacles) {
      if (o.type === 'storm' && this.state.resolved[o.id] === o.braveOption && this.inZone(o)) return o;
    }
    return null;
  }

  /** ¿Va la columna por adentro, sin el mar a la vista? (0..1, con rampas en los extremos) */
  inland(): number {
    const f = this.track.obstacles.find((o) => o.type === 'fork');
    if (!f || f.at === undefined || f.rejoinAt === undefined || this.state.route !== 'adentro') return 0;
    const ramp = 8;
    const x = this.state.pos;
    if (x < f.at || x > f.rejoinAt) return 0;
    return Math.min(1, (x - f.at) / ramp, (f.rejoinAt - x) / ramp);
  }

  /** Velocidad real de la cabeza de la columna ahora (tiles/s). */
  speed(): number {
    const s = this.state;
    if (s.arrived || s.blocked || s.waiting) return 0;
    // Mari muy atrás: la columna la espera sola
    if (s.mariLag >= this.cfg.mariMaxLagTiles) return 0;
    let v = this.cfg.paces[s.pace].speedTilesPerSec * s.loadFactor;
    for (const o of this.track.obstacles) {
      if (o.type === 'medano' && this.inZone(o)) v *= o.slowFactor ?? 1;
      if (o.type === 'canadon' && s.resolved[o.id] === 'bajar' && o.at !== undefined && s.pos >= o.at && s.pos <= o.at + (o.width ?? 10)) {
        v *= o.options?.find((x) => x.id === 'bajar')?.slowFactor ?? 1;
      }
    }
    const storm = this.stormHere();
    if (storm) v *= storm.slowFactor ?? 1;
    if (s.agua <= 0) v *= this.cfg.thirstSpeedFactor;
    return v;
  }

  /** Avanza `dt` segundos. Devuelve lo que pasó, para que la escena lo muestre. */
  update(dt: number): MarchEvent[] {
    const s = this.state;
    const ev: MarchEvent[] = [];
    if (s.arrived || s.blocked) return ev;

    const v = this.speed();
    const cfg = this.cfg;

    if (s.waiting || (v === 0 && s.mariLag >= cfg.mariMaxLagTiles)) {
      // esperar: el reloj corre, Mari descansa y alcanza a la columna
      s.mariStamina = Math.min(100, s.mariStamina + cfg.waitStaminaPerSec * dt);
      s.mariLag = Math.max(0, s.mariLag - cfg.mariCatchUpTilesPerSec * dt);
      s.agua = Math.max(0, s.agua - cfg.waitWaterPerTile * cfg.clockTilesPerSec * dt);
      this.tick(cfg.clockTilesPerSec * dt, ev);
      return ev;
    }

    // la columna se acerca al próximo obstáculo sin pasarse
    let step = v * dt;
    const next = this.nextObstacle();
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
    if (fatigue > 0) {
      for (const o of this.track.obstacles) if (o.type === 'medano' && this.inZone(o)) fatigue *= o.staminaFactor ?? 1;
      const storm = this.stormHere();
      if (storm) fatigue *= storm.staminaFactor ?? 1;
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
      if (!s.said.includes(i) && s.pos >= l.at && this.onRoute(l)) {
        s.said.push(i);
        ev.push({ type: 'line', speaker: l.speaker, text: l.text });
      }
    });

    // el reloj corre con el tiempo, no con la distancia (si se frenó contra un
    // obstáculo en este cuadro, solo el tramo que se caminó)
    this.tick(v > 0 ? (step / v) * cfg.clockTilesPerSec : 0, ev);

    if (s.pos >= this.track.lengthTiles && !s.blocked) {
      s.pos = this.track.lengthTiles;
      s.arrived = true;
      ev.push({ type: 'arrived' });
    }
    return ev;
  }

  /** Elige qué hacer frente a lo que frena la columna (obstáculo o noche). */
  choose(optionId: string): MarchEvent[] {
    const s = this.state;
    const o = s.blocked;
    if (!o) return [];
    const opt = o.options?.find((x) => x.id === optionId);
    if (!opt) return [];
    s.blocked = null;
    const ev: MarchEvent[] = [];

    if (o.type === 'night') {
      this.camp(opt, ev);
      return ev;
    }

    s.resolved[o.id] = opt.id;
    this.apply(opt);
    if (opt.route) s.route = opt.route;
    if (o.type === 'canadon' && opt.extraTiles && o.at !== undefined) s.pos = o.at + (o.width ?? 10) + 1;

    const pace = this.cfg.paces[s.pace];
    const walk = (tiles: number, kind: 'detour' | 'lost'): void => {
      // más camino: el reloj, el agua y el cansancio corren como si se caminara
      s.extraTiles += tiles;
      s.agua = Math.max(0, s.agua - pace.waterPerTile * tiles);
      s.mariStamina = Math.max(0, s.mariStamina - Math.max(0, pace.mariStaminaPerTile) * tiles * 0.5);
      ev.push({ type: 'skip', tiles, label: opt.text, kind });
      this.tick(tiles, ev);
    };
    if (opt.extraTiles) walk(opt.extraTiles, 'detour');
    if (opt.lostTiles) {
      s.lostCount += 1;
      walk(opt.lostTiles, 'lost');
    }
    if (opt.shelterTiles) {
      // a resguardo: el reloj corre, se gasta poca agua, Mari descansa
      s.agua = Math.max(0, s.agua - this.cfg.waitWaterPerTile * opt.shelterTiles);
      ev.push({ type: 'skip', tiles: opt.shelterTiles, label: opt.text, kind: 'shelter' });
      this.tick(opt.shelterTiles, ev);
    }
    return ev;
  }

  /** Cambios directos de una opción. */
  private apply(opt: MarchOption): void {
    const s = this.state;
    if (opt.water) s.agua = Math.max(0, s.agua + opt.water);
    if (opt.comida) s.comida = Math.max(0, s.comida + opt.comida);
    if (opt.mariStamina) s.mariStamina = Math.max(0, Math.min(100, s.mariStamina + opt.mariStamina));
    if (opt.mariHealth) s.mariHealth = Math.max(0, Math.min(100, s.mariHealth + opt.mariHealth));
    if (opt.loadFactor) s.loadFactor *= opt.loadFactor;
  }

  /** La noche: se reparte (o se raciona) y amanece otro día. */
  private camp(opt: MarchOption, ev: MarchEvent[]): void {
    const s = this.state;
    this.apply(opt);
    if (opt.id === 'racionar') s.rationedNights += 1;
    s.mariLag = 0;
    ev.push({ type: 'night', day: s.day, option: opt });
    s.day += 1;
    s.turn = 'amanecer';
    ev.push({ type: 'turn', day: s.day, turn: s.turn });
    // si quedaba reloj de más (un rodeo que cruzó la noche), sigue corriendo
    this.tick(0, ev);
  }

  private nextObstacle(): MarchObstacle | null {
    const s = this.state;
    let best: MarchObstacle | null = null;
    for (const o of this.track.obstacles) {
      if (!o.options || o.at === undefined || s.resolved[o.id] || !this.onRoute(o)) continue;
      if (o.at - 1 < s.pos - 0.001) continue;
      if (!best || o.at < best.at!) best = o;
    }
    return best;
  }

  /** El reloj avanza `tiles` equivalentes: turnos y, al terminar la tarde, la noche. */
  private tick(tiles: number, ev: MarchEvent[]): void {
    const s = this.state;
    s.clock += tiles;
    while (s.clock >= this.cfg.tilesPerTurn && !s.blocked) {
      s.clock -= this.cfg.tilesPerTurn;
      if (s.turn === 'tarde') {
        // cae la noche: la columna para y hay que decidir cómo repartir
        s.turn = 'noche';
        ev.push({ type: 'turn', day: s.day, turn: s.turn });
        s.blocked = this.nightObstacle;
        ev.push({ type: 'obstacle', obstacle: this.nightObstacle });
        return;
      }
      s.turn = TURNS[TURNS.indexOf(s.turn) + 1]!;
      ev.push({ type: 'turn', day: s.day, turn: s.turn });
    }
  }
}
