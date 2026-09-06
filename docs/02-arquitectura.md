# Arquitectura técnica
## Phaser 3 · TypeScript · Vite · v0.1

---

## 1. Stack

| Capa | Elección | Por qué |
|---|---|---|
| Motor | **Phaser 3.80+** | Tilemaps de Tiled nativos, arcade physics suficiente (no hay combate), buen soporte pixel art |
| Lenguaje | **TypeScript 5.5** (`strict: true`) | Los datos del juego son mucho JSON tipado; sin tipos esto se rompe en el nivel 4 |
| Bundler | **Vite 5** | HMR instantáneo, cero config |
| Mapas | **Tiled** → export `.tmj` (JSON) | Estándar, editable a mano, versionable |
| Estado | Store propio + **mitt** (event bus) | No hace falta Redux para esto |
| Tests | **Vitest** | Solo para `systems/` — la lógica pura se testea, las escenas no |
| Lint | ESLint + Prettier | |
| Persistencia | `localStorage` (v0.1) → IndexedDB (v0.2) | Un solo slot, según GDD §12 |

**Sin dependencias de UI (React/Vue).** La UI del juego se dibuja en Phaser con contenedores y bitmap text. Meter un framework de DOM encima trae más problemas de escalado de pixel art de los que resuelve.

---

## 2. Estructura de carpetas

```
wladfa/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── CLAUDE.md                   ← instrucciones para la sesión de código
│
├── public/
│   └── assets/
│       ├── tilesets/           punta-cuevas.png, ui.png
│       ├── sprites/            pc.png, npc_*.png, props.png
│       ├── portraits/          48×48 por personaje
│       ├── maps/               nivel-01.tmj
│       ├── fonts/              wladfa8.png + wladfa8.xml (bitmap font)
│       └── audio/              sfx/, music/
│
├── data/                       ← JSON de diseño, importado como módulo
│   ├── config/
│   │   ├── game.json           constantes globales
│   │   └── balance.json        números tuneables
│   ├── items.json
│   ├── npcs.json
│   ├── codex.json
│   ├── levels/nivel-01.json
│   ├── dialogues/nivel-01.json
│   ├── quests/nivel-01.json
│   └── schemas/*.schema.json   JSON Schema para validar en build
│
└── src/
    ├── main.ts                 arranque de Phaser
    ├── config.ts               config del juego (resolución, escala, física)
    │
    ├── core/
    │   ├── EventBus.ts         mitt tipado — el único canal entre sistemas y escenas
    │   ├── GameState.ts        el estado serializable completo
    │   ├── Registry.ts         acceso tipado a los JSON de /data
    │   └── types.ts            todos los tipos compartidos
    │
    ├── systems/                ← LÓGICA PURA. Sin Phaser importado acá. Testeable.
    │   ├── TimeSystem.ts
    │   ├── ResourceSystem.ts
    │   ├── InventorySystem.ts
    │   ├── PartySystem.ts
    │   ├── DialogueSystem.ts
    │   ├── LanguageSystem.ts
    │   ├── FlagSystem.ts
    │   ├── TriggerSystem.ts
    │   ├── JournalSystem.ts
    │   └── SaveSystem.ts
    │
    ├── scenes/
    │   ├── BootScene.ts
    │   ├── PreloadScene.ts
    │   ├── TitleScene.ts
    │   ├── WorldScene.ts       el mapa jugable
    │   ├── HudScene.ts         overlay permanente
    │   ├── DialogueScene.ts    overlay modal
    │   ├── CampScene.ts        el fogón nocturno
    │   ├── CargoScene.ts       la decisión de carga
    │   ├── JournalScene.ts     diario + códice
    │   └── TransitionScene.ts  tarjetas entre niveles
    │
    ├── entities/
    │   ├── Player.ts
    │   ├── Npc.ts
    │   └── Interactable.ts
    │
    ├── ui/
    │   ├── ResourceBar.ts
    │   ├── TurnIndicator.ts
    │   ├── DialogueBox.ts
    │   ├── ChoiceList.ts
    │   ├── TouchControls.ts    joystick flotante + botón de acción contextual
    │   └── Toast.ts
    │
    └── util/
        ├── grid.ts             helpers de tiles ↔ píxeles
        ├── scale.ts            zoom entero en resize (9:16)
        ├── input.ts            teclado + touch unificados en un solo vector
        ├── trail.ts            sendero emergente
        └── rng.ts              PRNG con semilla (partidas reproducibles)
```

### Regla arquitectónica única
> **`src/systems/` no importa Phaser. Nunca.**
> Los sistemas reciben y devuelven datos planos y emiten eventos. Las escenas escuchan y dibujan.
> Esto permite testear todo el balance con Vitest sin abrir un navegador, y es lo que hace que el juego
> se pueda seguir extendiendo en el nivel 7 sin reescribirlo.

---

## 3. Estado del juego

```ts
// src/core/GameState.ts
export interface GameState {
  meta: {
    version: string;
    seed: number;
    createdAt: number;
    playtimeMs: number;
  };
  player: {
    name: string;
    gender: 'f' | 'm';
    capacityKg: number;
  };
  progress: {
    level: string;          // 'nivel-01'
    day: number;            // 1..3 en N1
    turn: TurnId;           // 'amanecer' | 'manana' | 'tarde' | 'noche'
    zone: string;           // 'z2_barranca'
  };
  resources: Record<ResourceId, number>;
  inventory: InventoryEntry[];
  party: PartyMember[];
  languages: Record<LangId, 0 | 1 | 2 | 3>;
  factions: Record<FactionId, { trust: number }>;
  flags: Record<string, boolean | number | string | string[]>;
  map: { discovered: string[]; registered: string[] };
  journal: JournalEntry[];
  codex: string[];          // ids desbloqueados
}
```

**Reglas:**
- `GameState` es **serializable puro**: nada de referencias a objetos de Phaser, funciones ni `Map`/`Set`.
- Todo cambio pasa por un sistema. **Ninguna escena escribe `state` directo.**
- `flags` es el pegamento de la narrativa: `n1_carga`, `n1_encontro_manantial`, `n1_vinculo_edwyn`, etc.

---

## 4. Bus de eventos

Canal único, tipado. Nombres en `dominio:accion`.

```ts
export type GameEvents = {
  // tiempo
  'time:turn-advanced':   { day: number; turn: TurnId; prevTurn: TurnId };
  'time:day-ended':       { day: number };
  // recursos
  'resource:changed':     { id: ResourceId; from: number; to: number; reason: string };
  'resource:depleted':    { id: ResourceId };
  // inventario
  'inventory:added':      { itemId: string; qty: number };
  'inventory:overloaded': { current: number; capacity: number };
  // diálogo
  'dialogue:start':       { dialogueId: string };
  'dialogue:choice':      { nodeId: string; choiceId: string };
  'dialogue:end':         { dialogueId: string };
  // triggers y mundo
  'trigger:fired':        { triggerId: string };
  'zone:entered':         { zoneId: string };
  // party
  'party:health-changed': { memberId: string; from: number; to: number };
  'party:bond-changed':   { memberId: string; level: number };
  // meta
  'flag:set':             { key: string; value: unknown };
  'journal:entry':        { entry: JournalEntry };
  'save:written':         { slot: number };
  'ui:toast':             { text: string; icon?: string };
};
```

---

## 5. Sistemas — contrato de cada uno

| Sistema | Responsabilidad | Entrada | Emite |
|---|---|---|---|
| `TimeSystem` | Turnos y jornadas. Único que puede avanzar el reloj | `advance(cost)` | `time:*` |
| `ResourceSystem` | Suma/resta con clamp. Aplica el consumo nocturno | `add/spend(id, n, reason)` | `resource:*` |
| `InventorySystem` | Ítems, peso, capacidad, penalidad de velocidad | `add/remove/canCarry` | `inventory:*` |
| `PartySystem` | Salud, moral, resistencia, vínculos, oficios | `tickNight()`, `bond(id,+1)` | `party:*` |
| `LanguageSystem` | Enmascarado `▓` de las líneas según nivel de idioma | `render(line, lang)` | — |
| `DialogueSystem` | Grafo de nodos, condiciones, efectos | `start(id)`, `choose(id)` | `dialogue:*` |
| `FlagSystem` | Almacén de flags + evaluador de condiciones | `set/get/eval(expr)` | `flag:set` |
| `TriggerSystem` | Lee la object layer y decide qué dispara | `check(x, y, ctx)` | `trigger:fired` |
| `JournalSystem` | Redacta la entrada de la jornada a partir de los eventos del día | escucha el bus | `journal:entry` |
| `SaveSystem` | Serializa/deserializa `GameState`, versión y migración | `save()/load()` | `save:written` |

### Evaluador de condiciones
Un mini-lenguaje de una línea, para no meter `eval` ni una dependencia:
```
"flags.n1_encontro_manantial == true"
"resources.agua >= 12 && party.mari.health > 40"
"languages.aon >= 1"
"flags.n1_carga includes 'imprenta'"
```
Operadores soportados: `== != > >= < <= && || ! includes`. Se parsea con un tokenizador de ~80 líneas.

---

## 6. Escenas y su ciclo

```
BootScene ─→ PreloadScene ─→ TitleScene ─→ WorldScene ⇄ HudScene (paralela, siempre viva)
                                                │
                                                ├─ launch → DialogueScene  (modal, pausa World)
                                                ├─ launch → CampScene      (noche)
                                                ├─ launch → CargoScene     (decisión)
                                                └─ launch → JournalScene   (tecla D / C)
```

- `WorldScene` y `HudScene` corren **en paralelo** (`scene.launch`), no una encima de otra.
- Las modales usan `scene.pause('World')` y devuelven el control con un evento, nunca con callbacks anidados.
- `TransitionScene` es la única que puede destruir `WorldScene` y cargar otro nivel.

---

## 7. Render y escalado (pixel art)

```ts
// src/config.ts
export const VIEW = {
  width: 270,        // 9:16 vertical
  height: 480,
  hudHeight: 32,     // franja superior
  worldHeight: 352,  // cámara del mundo (y 32 → 384)
  trayHeight: 96,    // franja inferior: controles o diálogo (y 384 → 480)
  tile: 16,
} as const;

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: VIEW.width,
  height: VIEW.height,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  input: { activePointers: 3 },   // joystick + botón + margen
  render: { powerPreference: 'low-power' },
};
```

### Escalado en pantallas reales

`FIT` mantiene el aspecto y deja banda arriba/abajo o a los lados. El escalado se fuerza a
**entero** desde `util/scale.ts`, que recalcula en `resize` y aplica el mayor `floor(zoom)` que entre:

| Dispositivo | CSS px | DPR | Zoom entero | Resultado |
|---|---|---|---|---|
| iPhone 13/14/15 | 390×844 | 3 | ×4 | 1080×1920, banda arriba y abajo |
| Android medio | 412×915 | 2.6 | ×3 | 810×1440 |
| Teléfono chico | 360×640 | 2 | ×2 | 540×960, casi exacto |
| Desktop | cualquiera | 1 | ×2 / ×3 | centrado con fondo `#0E1416` |

> Las bandas se pintan con el color más oscuro de la paleta y **no se decoran**. Un marco de teléfono
> dibujado alrededor envejece mal y roba píxeles.

**Reglas de pixel art que hay que respetar desde el primer commit:**
- Escala **solo entera**. Nunca ×2.5.
- La cámara del mundo es un **viewport recortado**: `camera.setViewport(0, 32, 270, 352)`, no la pantalla completa.
- `camera.setRoundPixels(true)`. Nada de rotaciones ni escalas no enteras en sprites del mundo.
- El texto es **bitmap font**, no webfont. Cualquier fuente vectorial se ve mal a esta resolución.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">` y `touch-action: none` en el canvas, o el navegador móvil hace zoom con el doble tap.

---

## 8. Pipeline de datos

```
Tiled (.tmj)  ──┐
JSON de /data ──┼──→ validación con JSON Schema (script de build) ──→ Registry tipado ──→ Sistemas
                │
                └──→ falla el build si un id no existe (ej. un diálogo apunta a un npc borrado)
```

Script `npm run validate:data`:
1. Valida cada JSON contra su schema.
2. Verifica **integridad referencial**: todo `npcId`, `itemId`, `dialogueId`, `flagId` mencionado existe.
3. Verifica que todo trigger del `.tmj` tenga su definición en `levels/nivel-01.json`.

> Esto atrapa el 90 % de los bugs de contenido antes de abrir el navegador. Correrlo en pre-commit.

---

## 9. Comandos

```bash
npm run dev        # Vite + HMR en localhost:5173
npm run build      # build de producción
npm run preview    # sirve el build
npm run test       # Vitest sobre src/systems
npm run validate:data
npm run lint
```

---

## 10. Plan de implementación sugerido (orden de commits)

| # | Commit | Entregable verificable |
|---|---|---|
| 1 | Scaffold Vite + Phaser + TS, config 9:16 + zoom entero | Pantalla 270×480 escalada y centrada en teléfono y desktop |
| 2 | `core/`: EventBus, GameState, Registry, types | Tests de Registry pasando |
| 3 | `TimeSystem` + `ResourceSystem` + tests | 12 turnos y consumo nocturno probados sin navegador |
| 4 | Tilemap de prueba + `WorldScene` + `Player` con colisiones | Se camina por el mapa |
| 5 | `HudScene` (franja 32px) + `TouchControls` (franja 96px) | Se juega con el pulgar en el teléfono y con teclado en desktop |
| 6 | `InventorySystem` + carga + penalidad de velocidad | Cajones de la playa funcionando |
| 7 | `DialogueSystem` + `DialogueScene` + `LanguageSystem` | Conversación con Pepperell completa |
| 8 | `TriggerSystem` leyendo la object layer | Jornada 1 jugable entera |
| 9 | `CampScene` (fogón) + `PartySystem` | Noche J1 y J2 |
| 10 | Exploración J2 + manantial + Dafydd | Jornada 2 jugable |
| 11 | `CargoScene` | La decisión funciona y persiste en flags |
| 12 | `SaveSystem` + `JournalSystem` + `TransitionScene` | **Nivel 1 completo de punta a punta** |

---

*Arquitectura v0.1 · septiembre 2026*
