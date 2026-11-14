import type { MarchState, MarchTrack } from '@/systems/MarchSystem';
export type TurnId = 'amanecer' | 'manana' | 'tarde' | 'noche';
export type ResourceId = 'agua' | 'comida' | 'forraje' | 'lena' | 'municion' | 'materiales';
export type LangId = 'cym' | 'spa' | 'aon';
export type LangLevel = 0 | 1 | 2 | 3;
export type FactionId = 'colonia' | 'tehuelche' | 'estado' | 'criollos';
export type Facing = 'north' | 'south' | 'east' | 'west';

export type FlagValue = boolean | number | string | string[] | null;

export interface InventoryEntry {
  itemId: string;
  qty: number;
}

export interface PartyMember {
  id: string;
  name: string;
  health: number;
  morale: number;
  stamina: number;
  bond: number;
  trade: string;
}

export interface JournalEntry {
  /** nivel de la entrada: los días vuelven a empezar en cada nivel */
  level?: string;
  day: number;
  title: string;
  lines: string[];
}

export interface GameState {
  meta: { version: string; seed: number; createdAt: number; playtimeMs: number };
  player: { name: string; gender: 'f' | 'm'; capacityKg: number; carriedKg: number };
  progress: { level: string; day: number; turn: TurnId; zone: string };
  resources: Record<ResourceId, number>;
  inventory: InventoryEntry[];
  party: PartyMember[];
  morale: number;
  languages: Record<LangId, LangLevel>;
  factions: Record<FactionId, { trust: number }>;
  flags: Record<string, FlagValue>;
  map: { discovered: string[]; registered: string[] };
  journal: JournalEntry[];
  codex: string[];
  /** Ids de trigger `once` ya disparados — sin esto, cargar una partida repite cutscenes. */
  triggersFired: string[];
  /** Nivel de marcha a medio camino: la columna guardada a la noche (MarchSystem.snapshot) */
  march?: MarchState;
}

/* ---------- datos de diseño (data/*.json) ---------- */

export interface ResourceDef {
  id: ResourceId;
  label: string;
  unit: string;
  icon: string;
  min: number;
  max: number;
  criticalBelow: number;
}

export interface ItemDef {
  id: string;
  label: string;
  desc?: string;
  category: string;
  weightKg: number;
  stackable?: boolean;
  icon?: string;
  questItem?: boolean;
  unlocks?: string[];
}

/** Uno de los 8 bultos de la decisión de carga (docs/01-nivel-01.md §5). */
export interface BultoDef {
  id: string;
  label: string;
  kg: number;
  slots: number;
  icon?: string;
  /** Flag que se pone en true si el jugador lo lleva. */
  ifTaken?: string;
  /** Texto de la consecuencia de dejarlo — lo usa el diario/códice, no la escena. */
  ifLeft: string;
  grants?: Record<string, number>;
}

export interface NpcDef {
  id: string;
  name: string;
  historical: boolean;
  role: string;
  sprite: string;
  portrait: string;
  languages: Record<LangId, LangLevel>;
  trade: string;
  bond: number;
  stats: { health: number; morale: number; stamina: number };
  note?: string;
  voiceNote?: string;
}

export interface ZoneDef {
  id: string;
  label: string;
  rect: [number, number, number, number];
  music: string | null;
  ambient: string[];
  /** sonido de fondo de la zona (0..1) */
  ambience?: { wind?: number; sea?: number };
  hub?: boolean;
  saveHere?: boolean;
  speedModifier?: number;
}

/** Mudanza de un NPC. `exitDir`: si la mudanza pasa a la vista, sale caminando
 * para ese lado (un indicio de adónde fue), no derecho hacia el destino. */
export interface NpcMove {
  day: number;
  turn: TurnId;
  x: number;
  y: number;
  exitDir?: 'north' | 'south' | 'east' | 'west';
  /** condición (FlagSystem.eval): la parada solo vale si se cumple */
  requires?: string;
  note?: string;
}

export interface TriggerDef {
  id: string;
  type: string;
  zone?: string;
  rect?: [number, number, number, number];
  event?: string;
  match?: Record<string, unknown>;
  requires?: string;
  /** No dispara solo al cumplirse `requires`: solo se llega hablándole al NPC (WorldScene.talkTo). */
  manual?: boolean;
  once: boolean;
  turnCost: number;
  action: Record<string, any>;
}

export interface PasajeDef {
  id: string;
  from: string;
  to: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Condición de FlagSystem.eval; sin ella el pasaje está abierto desde el arranque. */
  requires?: string;
}

export interface LevelDef {
  id: string;
  /** 'world': mapa recorrible (WorldScene). 'march': la marcha en vista lateral
   * (MarchScene), sin mapa ni zonas. Sin el campo: 'world'. */
  kind?: 'world' | 'march';
  /** solo 'march': quiénes van en la columna */
  party?: string[];
  /** solo 'march': el tramo que recorre MarchSystem */
  march?: MarchTrack;
  /** solo 'march': fichas del Códice que se abren al llegar */
  codexOnArrive?: string[];
  /** solo 'march': el texto de la llegada según la jornada (el primero cuyo maxDay alcanza) y si tu madre llega enferma */
  arrival?: { byDay: Array<{ maxDay?: number; text: string }>; sick: string };
  title: string;
  subtitle: string;
  date: string;
  next: string | null;
  map: { widthTiles: number; heightTiles: number; tileSize: number; /** generador de src/util/mapgen.ts */ generator?: string };
  schedule: { days: number; turnsPerDay: number };
  zones: ZoneDef[];
  camera: { follow: { lerpX: number; lerpY: number } };
  spawns: {
    player: { x: number; y: number; facing: Facing };
    npcs: Array<{
      id: string;
      x: number;
      y: number;
      day: number | number[] | '*';
      afterFlag?: string;
      /** Una reubicación programada: a partir de este día/turno, aparece en x,y en vez
       * de la posición base. Puede ser una sola parada o una lista (varias mudanzas a
       * lo largo del nivel) — se usa la última cuyo umbral ya pasó. */
      movesTo?: NpcMove | NpcMove[];
      /** Una vez que este flag está, el NPC deja de mostrarse en el mapa (ya se despidió y se fue). */
      hiddenAfterFlag?: string;
    }>;
    /** `window`: solo existe en ese turno (ej. los mejillones, con la marea baja de la mañana del J2) */
    gatherNodes: Array<{
      id: string;
      type: ResourceId;
      x: number;
      y: number;
      /** dibujo (src/assets/props/<prop>.png o prop_<prop> de código) */
      prop?: string;
      /** entrada de balance.json (nivelNN.gains) con la cantidad */
      gain?: string;
      /** nombre para el aviso ("+2 raciones: fruto de molle") */
      name?: string;
      /** vuelve a crecer cada jornada (la jarilla) */
      regrows?: boolean;
      window?: { day: number; turn: TurnId };
    }>;
    /** el barco anclado frente a la costa, hasta que zarpa */
    ship?: { prop: string; x: number; y: number; hideAfterFlag?: string; goneFrom?: { day: number; turn: TurnId } };
    /** paisaje: con `look` se puede mirar; `fallback` = tiene dibujo de código si falta el PNG */
    decor?: Array<{ prop: string; x: number; y: number; id?: string; solid?: 'animal' | 'hull'; look?: string; depth?: number; fallback?: boolean }>;
    /** pájaros que cruzan la pantalla */
    birds?: Array<{ prop: string; y: number; offsetPx: number; speedPxPerSec: number }>;
    cajones: Array<{ x: number; y: number }>;
    /** dónde se dejan los cajones (nivel 1: la pila) */
    deposit?: { x: number; y: number };
    cuevas: Array<{ id: string; x: number; y: number }>;
    fogon: { x: number; y: number };
    /** dónde aparece el jugador al despertar / volver al campamento (no ENCIMA del fogón, que es sólido) */
    campamento?: { x: number; y: number };
    pasajes: PasajeDef[];
  };
  objectives: Array<{ day: number; id: string; label: string; quest: string }>;
  /** Recordatorio de qué hacer ahora (menú de pausa): el primero cuyo `requires` se cumple. */
  goals?: Array<{ requires?: string; text: string }>;
  triggers: TriggerDef[];
  /** Estado de salida del nivel: cada renglón se califica contra dos umbrales. */
  exit?: {
    carryOver?: string[];
    computeGrade?: Record<string, { field: string; good: number; ok: number }>;
    /** la pantalla de cierre: el rótulo, el título del balance y la ilustración de fondo */
    closing?: { kicker: string; gradeTitle: string; image?: string };
  };
}

/** Un renglón del balance de salida (Game.exitGrade). */
export interface ExitGradeRow {
  id: string;
  value: number;
  grade: 'good' | 'ok' | 'bad';
}

/* ---------- diálogos ---------- */

export interface DialogueEffect {
  setFlag?: Record<string, FlagValue>;
  bond?: { npc: string; delta: number };
  resource?: { id: ResourceId; delta: number; reason?: string };
  partyStat?: { npc: string; health?: number; morale?: number };
  morale?: number;
  giveItem?: string;
  unlock?: string[];
  codex?: string;
  objective?: string;
  unlockHint?: string;
}

export interface DialogueChoice {
  id: string;
  text: string;
  next?: string;
  condition?: string;
  effects?: DialogueEffect[];
}

export interface DialogueNode {
  speaker: string;
  portrait?: 'neutral' | 'tenso' | 'calido';
  text?: string;
  broken?: boolean;
  condition?: string;
  next?: string;
  end?: boolean;
  effects?: DialogueEffect[];
  choices?: DialogueChoice[];
}

export interface DialogueDef {
  id: string;
  npc?: string;
  context?: string;
  lang: LangId | 'none';
  start: string;
  nodes: Record<string, DialogueNode>;
}

export interface ChoiceScreenDef {
  id: string;
  prompt: string;
  turnCost: number;
  /** `detail`: qué implica la opción (adónde vas, qué te deja), en letra chica debajo */
  options: Array<{ id: string; text: string; detail?: string; effects?: DialogueEffect[] }>;
  /** Aclaración técnica sobre la decisión (consecuencias no obvias en el texto de
   * las opciones) — va en el pie del panel, ver UiScene.openOverlay. */
  hint?: string;
}

export interface TutorialDef {
  id: string;
  title: string;
  text: string;
  /** Consejo de juego breve, en el pie del panel — ver UiScene.openOverlay. */
  hint?: string;
}
