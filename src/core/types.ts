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
  hub?: boolean;
  saveHere?: boolean;
  speedModifier?: number;
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
  title: string;
  subtitle: string;
  date: string;
  next: string | null;
  map: { widthTiles: number; heightTiles: number; tileSize: number };
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
      /** Una reubicación programada: a partir de este día/turno, aparece en x,y en vez de la posición base. */
      movesTo?: { day: number; turn: TurnId; x: number; y: number };
      /** Una vez que este flag está, el NPC deja de mostrarse en el mapa (ya se despidió y se fue). */
      hiddenAfterFlag?: string;
    }>;
    gatherNodes: Array<{ id: string; type: ResourceId; x: number; y: number }>;
    cajones: Array<{ x: number; y: number }>;
    cuevas: Array<{ id: string; x: number; y: number }>;
    fogon: { x: number; y: number };
    pasajes: PasajeDef[];
  };
  objectives: Array<{ day: number; id: string; label: string; quest: string }>;
  triggers: TriggerDef[];
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
  options: Array<{ id: string; text: string; effects?: DialogueEffect[] }>;
}

export interface TutorialDef {
  id: string;
  title: string;
  text: string;
}
