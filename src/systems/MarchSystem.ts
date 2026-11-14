/**
 * La marcha (sistema nuevo del Nivel 2, GDD §6): el reloj avanza con el
 * tiempo. Lógica pura, sin Phaser (R1): la escena le pasa el tiempo y lee el
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
 * - Un camino puede esquivar una zona (`avoid`): la rastrillada rodea el médano.
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
  start: { agua: number; comida: number; mariStamina: number; mariHealth: number; morale: number };
  /** la noche sin las raciones completas: cuánta salud pierde Mari por ración que falta, y la moral */
  hunger: { healthPerRation: number; morale: number };
  /** racionar baja la moral del grupo */
  rationMorale: number;
  /** lo que se dejó en Punta Cuevas (Nivel 1, items.json → ifLeft) */
  carga: {
    /** sin ropa de abrigo: la noche abriga menos y enferma */
    abrigo: { nightStaminaFactor: number; nightHealth: number };
    /** sin libros ni biblias: −moral la primera noche */
    libros: { firstNightMorale: number };
  };
  /** con alguien de vínculo, perderse cuesta menos: sale a buscarte */
  bondLostFactor: number;
  /** caminar con Mari sin aire la enferma: por debajo de `belowStamina`, salud por tile */
  exhaust: { belowStamina: number; healthPerTile: number };
  /** la moral: por debajo de `slowBelow` el grupo camina más lento (y se queja). Las opciones arriesgadas piden moral (`requiresMorale`) */
  morale: { slowBelow: number; speedFactor: number };
}

/**
 * Con qué arranca la marcha: lo que hereda del Nivel 1. Todo opcional: sin esto
 * (el prototipo suelto) arranca con `cfg.start`.
 */
export interface MarchStart {
  agua?: number;
  comida?: number;
  mariHealth?: number;
  mariStamina?: number;
  morale?: number;
  /** bultos que quedaron en Punta Cuevas (ids de items.json → bultos_nivel01) */
  left?: string[];
  /** quién del grupo tiene vínculo con vos (sale a buscarte si te perdés) */
  bondHelper?: string | null;
  /** fija las variantes de la partida (la aguada con agua o seca): mismas en toda la partida, nunca una tirada al elegir */
  seed?: number;
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
  /** zona (por id) que este camino esquiva: su efecto no rige (ej. la rastrillada rodea el médano) */
  avoid?: string;
  /** moral del grupo (+/−) */
  morale?: number;
  /** vínculo con quien aconsejó esto (npc → +/−) */
  bond?: Record<string, number>;
  /** solo se puede elegir con la moral por encima de esto (si no, nadie quiere arriesgarse) */
  requiresMorale?: number;
  /** caballo: dejar algo en la estepa; cuál, lo elige el jugador (raciones o un bulto del Nivel 1) */
  drop?: boolean;
  /** noche: caminar con la luna en vez de dormir; cuánto se avanza (sin pasar el próximo obstáculo) */
  nightWalkTiles?: number;
}

export interface MarchObstacle {
  id: string;
  type: 'canadon' | 'aguada' | 'medano' | 'fork' | 'landmark' | 'storm' | 'horse' | 'night' | 'trail' | 'camp' | 'cross';
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
  /** zonas: salud de Mari por tile mientras rige (el polvo, la arena) */
  healthPerTile?: number;
  /** caballo: qué se puede dejar en la estepa (raciones, o un bulto que se trajo del Nivel 1) y lo que cuesta */
  dropItems?: Record<string, { label?: string; detail: string; comida?: number }>;
  /** si esta decisión te pierde: lo que dice Lewis cuando vuelven a encontrar el camino */
  lostLine?: string;
  /** variantes fijas por partida (por `seed`): cambian el texto y las opciones, y el jugador las lee */
  variants?: Array<{ id: string; prompt: string; options: MarchOption[] }>;
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
  lines: Array<{ at: number; speaker: string; text: string; requiresRoute?: string; skipIfAvoided?: string }>;
  /** ilustraciones (src/assets/scenes/<id>.png) que se muestran al pasar por `at`; sin el PNG, nada */
  scenes?: Array<{ at: number; id: string; text: string; requiresRoute?: string }>;
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
  /** zonas esquivadas por el camino elegido */
  avoided: string[];
  /** moral del grupo (0..100) */
  morale: number;
  /** noches en las que no alcanzó la comida */
  hungryNights: number;
  /** en qué jornada se resolvió cada decisión (para el diario) */
  dayOf: Record<string, number>;
  /** lo que pesa del Nivel 1 */
  left: string[];
  bondHelper: string | null;
  /** ilustraciones ya mostradas */
  seen: string[];
  /** lo que se dejó en la estepa (raciones o bultos del Nivel 1) */
  dropped: string[];
  /** vínculo ganado o perdido en la marcha (npc → delta), se vuelca al llegar */
  bondDelta: Record<string, number>;
  /** noches caminadas con la luna */
  nightWalks: number;
  /** variante de cada obstáculo que la tiene (fija por partida) */
  variant: Record<string, string>;
  /** ya se avisó que el grupo está sin ánimo */
  lowMoraleSaid: boolean;
}

export type MarchEvent =
  | { type: 'obstacle'; obstacle: MarchObstacle }
  | { type: 'line'; speaker: string; text: string }
  | { type: 'scene'; id: string; text: string }
  | { type: 'turn'; day: number; turn: Turn }
  | { type: 'night'; day: number; option: MarchOption }
  | { type: 'mariBehind' }
  | { type: 'lowMorale' }
  | { type: 'thirst' }
  | { type: 'skip'; tiles: number; label: string; kind: 'detour' | 'lost' | 'shelter'; helper?: string | null }
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

  /**
   * `start`: lo que hereda del Nivel 1. `resume`: una marcha guardada a la noche
   * (snapshot()), que sigue tal cual.
   */
  constructor(
    private readonly cfg: MarchConfig,
    readonly track: MarchTrack,
    start: MarchStart = {},
    resume?: MarchState,
  ) {
    const mariHealth = start.mariHealth ?? cfg.start.mariHealth;
    this.state = resume ? structuredClone(resume) : {
      day: 1,
      turn: cfg.startTurn,
      pos: 0,
      clock: 0,
      pace: 'normal',
      waiting: false,
      agua: start.agua ?? cfg.start.agua,
      comida: start.comida ?? cfg.start.comida,
      // con la salud baja no hay aire para sostener el paso
      mariStamina: start.mariStamina ?? Math.min(cfg.start.mariStamina, mariHealth + 10),
      mariHealth,
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
      avoided: [],
      morale: start.morale ?? cfg.start.morale,
      hungryNights: 0,
      dayOf: {},
      left: start.left ?? [],
      bondHelper: start.bondHelper ?? null,
      seen: [],
      dropped: [],
      bondDelta: {},
      nightWalks: 0,
      variant: {},
      lowMoraleSaid: false,
    };
    // marchas guardadas antes de que existieran estos campos
    const st = this.state;
    st.seen ??= [];
    st.dropped ??= [];
    st.bondDelta ??= {};
    st.nightWalks ??= 0;
    st.variant ??= {};
    st.lowMoraleSaid ??= false;
    // las variantes se fijan una vez por partida, con la semilla: no son una tirada al elegir
    const seed = start.seed ?? 0;
    track.obstacles.forEach((o, i) => {
      if (!o.variants?.length || st.variant[o.id]) return;
      st.variant[o.id] = o.variants[Math.floor(seedHash(seed, i) * o.variants.length)]!.id;
    });
    this.nightObstacle = { id: 'noche', type: 'night', title: track.night.title, prompt: track.night.prompt, options: track.night.options };
  }

  /** Copia del estado para guardar la partida (se retoma con `resume`). */
  snapshot(): MarchState {
    return structuredClone({ ...this.state, waiting: false });
  }

  /** El obstáculo con su variante de la partida aplicada (texto y opciones). */
  resolve(o: MarchObstacle): MarchObstacle {
    const v = o.variants?.find((x) => x.id === this.state.variant[o.id]);
    return v ? { ...o, prompt: v.prompt, options: v.options } : o;
  }

  /** ¿Se puede elegir esta opción ahora? (la moral alcanza) */
  available(opt: MarchOption): boolean {
    return opt.requiresMorale === undefined || this.state.morale >= opt.requiresMorale;
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

  /** ¿Rige ahora el efecto de esta zona? (se está adentro y el camino no la esquiva) */
  private zoneOn(o: MarchObstacle): boolean {
    return this.inZone(o) && !this.state.avoided.includes(o.id);
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
      if (o.type === 'medano' && this.zoneOn(o)) v *= o.slowFactor ?? 1;
      if (o.type === 'canadon' && s.resolved[o.id] === 'bajar' && o.at !== undefined && s.pos >= o.at && s.pos <= o.at + (o.width ?? 10)) {
        v *= o.options?.find((x) => x.id === 'bajar')?.slowFactor ?? 1;
      }
    }
    const storm = this.stormHere();
    if (storm) v *= storm.slowFactor ?? 1;
    if (s.agua <= 0) v *= this.cfg.thirstSpeedFactor;
    // sin ánimo el grupo camina más lento
    if (s.morale < this.cfg.morale.slowBelow) v *= this.cfg.morale.speedFactor;
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
      s.blocked = this.resolve(next);
      ev.push({ type: 'obstacle', obstacle: s.blocked });
    }
    s.pos += step;

    // agua y cansancio por distancia caminada
    const pace = cfg.paces[s.pace];
    s.agua = Math.max(0, s.agua - pace.waterPerTile * step);
    let fatigue = pace.mariStaminaPerTile * step;
    if (fatigue > 0) {
      for (const o of this.track.obstacles) if (o.type === 'medano' && this.zoneOn(o)) fatigue *= o.staminaFactor ?? 1;
      const storm = this.stormHere();
      if (storm) fatigue *= storm.staminaFactor ?? 1;
    }
    s.mariStamina = Math.max(0, Math.min(100, s.mariStamina - fatigue));
    // lo que enferma al caminar: el polvo de la tormenta, la arena, y caminar sin aire
    let hurt = 0;
    for (const o of this.track.obstacles) if (o.type === 'medano' && this.zoneOn(o)) hurt += o.healthPerTile ?? 0;
    const storm = this.stormHere();
    if (storm) hurt += storm.healthPerTile ?? 0;
    if (s.mariStamina < cfg.exhaust.belowStamina && pace.mariStaminaPerTile > 0) hurt += cfg.exhaust.healthPerTile;
    if (hurt > 0) s.mariHealth = Math.max(0, s.mariHealth - hurt * step);
    if (!s.lowMoraleSaid && s.morale < cfg.morale.slowBelow) {
      s.lowMoraleSaid = true;
      ev.push({ type: 'lowMorale' });
    }
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
      if (!s.said.includes(i) && s.pos >= l.at && this.onRoute(l) && !(l.skipIfAvoided && s.avoided.includes(l.skipIfAvoided))) {
        s.said.push(i);
        ev.push({ type: 'line', speaker: l.speaker, text: l.text });
      }
    });

    // ilustraciones del camino
    for (const sc of this.track.scenes ?? []) {
      if (!s.seen.includes(sc.id) && s.pos >= sc.at && this.onRoute(sc)) {
        s.seen.push(sc.id);
        ev.push({ type: 'scene', id: sc.id, text: sc.text });
      }
    }

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
  choose(optionId: string, dropId?: string): MarchEvent[] {
    const s = this.state;
    const o = s.blocked;
    if (!o) return [];
    const opt = o.options?.find((x) => x.id === optionId);
    if (!opt || !this.available(opt)) return [];
    // dejar algo: hay que decir qué
    if (opt.drop && !dropId) return [];
    s.blocked = null;
    const ev: MarchEvent[] = [];

    if (o.type === 'night') {
      this.camp(opt, ev);
      return ev;
    }

    s.resolved[o.id] = opt.id;
    s.dayOf[o.id] = s.day;
    this.apply(opt);
    if (opt.drop && dropId) {
      s.dropped.push(dropId);
      const cost = o.dropItems?.[dropId]?.comida;
      if (cost) s.comida = Math.max(0, s.comida + cost);
    }
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
      // con vínculo, alguien sale a buscarte y la vuelta es más corta
      const helper = s.bondHelper;
      walk(Math.round(opt.lostTiles * (helper ? this.cfg.bondLostFactor : 1)), 'lost');
      const sk = ev.find((x) => x.type === 'skip');
      if (sk && sk.type === 'skip') sk.helper = helper;
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
    if (opt.avoid && !s.avoided.includes(opt.avoid)) s.avoided.push(opt.avoid);
    if (opt.morale) s.morale = clamp(s.morale + opt.morale);
    for (const [npc, d] of Object.entries(opt.bond ?? {})) s.bondDelta[npc] = (s.bondDelta[npc] ?? 0) + d;
  }

  /** La noche: se reparte (o se raciona) y amanece otro día. */
  private camp(opt: MarchOption, ev: MarchEvent[]): void {
    const s = this.state;
    const cfg = this.cfg;
    // lo que no alcanza: cada ración que falta la paga Mari
    const missing = Math.max(0, -(opt.comida ?? 0) - s.comida);
    const stamina0 = s.mariStamina;
    this.apply(opt);
    if (missing > 0) {
      s.hungryNights += 1;
      s.mariHealth = Math.max(0, s.mariHealth - missing * cfg.hunger.healthPerRation);
      s.morale = clamp(s.morale + cfg.hunger.morale);
    }
    if (opt.id === 'racionar') {
      s.rationedNights += 1;
      s.morale = clamp(s.morale + cfg.rationMorale);
    }
    // sin ropa de abrigo la noche abriga menos y enferma (Nivel 1: el bulto que quedó)
    if (s.left.includes('abrigo')) {
      if (s.mariStamina > stamina0) s.mariStamina = stamina0 + (s.mariStamina - stamina0) * cfg.carga.abrigo.nightStaminaFactor;
      s.mariHealth = Math.max(0, s.mariHealth + cfg.carga.abrigo.nightHealth);
    }
    // sin libros nadie lee en voz alta la primera noche
    if (s.day === 1 && s.left.includes('libros')) s.morale = clamp(s.morale + cfg.carga.libros.firstNightMorale);
    // caminar con la luna: se avanza de noche, hasta el próximo obstáculo como mucho
    // (que espera al amanecer). Lo que se pasa de noche no se ve ni se oye.
    if (opt.nightWalkTiles) {
      s.nightWalks += 1;
      const next = this.nextObstacle();
      const limit = Math.min(next?.at !== undefined ? next.at - 1.5 : Infinity, this.track.lengthTiles - 1);
      s.pos = Math.max(s.pos, Math.min(s.pos + opt.nightWalkTiles, limit));
      this.track.lines.forEach((l, i) => {
        if (l.at <= s.pos && !s.said.includes(i)) s.said.push(i);
      });
      for (const sc of this.track.scenes ?? []) if (sc.at <= s.pos && !s.seen.includes(sc.id)) s.seen.push(sc.id);
    }
    s.resolved[`noche_${s.day}`] = opt.id;
    s.dayOf[`noche_${s.day}`] = s.day;
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
      if (!(o.options || o.variants) || o.at === undefined || s.resolved[o.id] || !this.onRoute(o)) continue;
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

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** 0..1 estable a partir de la semilla de la partida y un índice. */
function seedHash(seed: number, i: number): number {
  const h = Math.sin(seed * 12.9898 + (i + 1) * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
