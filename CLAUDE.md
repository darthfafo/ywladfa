# CLAUDE.md — instrucciones para la sesión de código

Este repo es **Y Wladfa — La Huella de los Rifleros**, un RPG de supervivencia sin combate
sobre la colonización galesa del Chubut (1865–1902), en Phaser 3 + TypeScript.

Pantalla **vertical 9:16 (270×480), mobile-first**. El repo ya tiene los documentos de diseño,
los datos y un **prototipo jugable** (commits 1-8 del plan). El objetivo ahora es cerrar el Nivel 1.

---

## Antes de escribir código, leer en este orden

1. `docs/00-GDD.md` — qué es el juego y por qué. Los **cuatro pilares** de §3 resuelven cualquier duda de diseño.
2. `docs/01-nivel-01.md` — la spec del nivel a implementar, minuto a minuto.
3. `docs/02-arquitectura.md` — stack, carpetas, sistemas, contratos y el **plan de 12 commits** de §10.
4. `docs/03-assets.md` — qué arte hace falta y qué se puede reemplazar por placeholder.
5. `docs/04-guia-historica.md` — el marco histórico y las reglas de representación. **No es opcional.**

Los datos de `/data/*.json` son la fuente de verdad del contenido. Si un número de balance
está en `data/config/balance.json`, **no se hardcodea en `src/`**.

---

## Reglas duras del proyecto

**R1 · `src/systems/` no importa Phaser.**
Los sistemas son lógica pura sobre datos planos, se comunican por el EventBus y se testean
con Vitest sin navegador. Si un sistema necesita algo de Phaser, el diseño está mal.

**R2 · Ninguna escena escribe `GameState` directo.**
Todo cambio pasa por el sistema correspondiente, que emite el evento correspondiente.

**R3 · Cero números mágicos.**
Velocidades, consumos, umbrales y capacidades salen de `data/config/balance.json`.
Un `if (agua < 6)` en el código es un bug aunque funcione.

**R4 · Pantalla 9:16 fija, en tres franjas.**
270×480 internos: HUD 32 px arriba, mundo 352 px (viewport recortado de la cámara), bandeja 96 px abajo.
La bandeja es la misma para los controles táctiles y para el diálogo: no aparece ni desaparece nada.
Nada de rotaciones ni escalas no enteras en el mundo. El texto hoy usa `Text` con `setResolution(4)`;
falta migrarlo a bitmap font (`docs/03-assets.md` §6).

**R5 · Integridad referencial validada en build.**
`npm run validate:data` valida contra los JSON Schema de `data/schemas/` y verifica que todo
`npcId` / `itemId` / `dialogueId` / `triggerId` / `flag` mencionado exista. Correrlo antes de commitear.

**R6 · Español rioplatense en todo el contenido de cara al jugador.**
Voseo. "Vos elegís", no "tú eliges". Los comentarios de código pueden ser en el idioma que sea,
pero los strings del juego y los ids de diseño están en español.

**R7 · El Nivel 1 no se puede perder.**
Cualquier fracaso es *suave*: degrada el estado de salida, nunca muestra pantalla de derrota
ni bloquea el avance. Ver `docs/01-nivel-01.md` §8.

---

## Estado actual

```
✔ docs/           GDD, spec del Nivel 1, arquitectura, assets, guía histórica
✔ data/           config, items, npcs, nivel-01, diálogos, quests, códice, schemas
✔ src/            core + 7 sistemas + 3 escenas + UI táctil  (commits 1-8 del plan)
✔ tests/          20 tests de sistemas en verde
✔ scripts/        validate-data.mjs (integridad referencial)
◐ public/assets/  arte generado por código en src/util/textures.ts, con los tamaños finales
✘ maps/           falta el nivel-01.tmj de Tiled — hoy el mapa se genera en src/util/mapgen.ts
```

**Lo que ya se juega:** portada, playa, mapa vertical de 64×112 con las 6 zonas y los pasajes,
movimiento con joystick táctil y teclado, cámara con viewport recortado, HUD de jornada/turno/recursos/carga,
levantar y depositar cajones con peso y sobrecarga, cortar jarilla, diálogos con ramas y efectos,
pantallas de elección, toasts, y los triggers del cold open, el manantial y los dos fogones.

**Lo que falta para cerrar el Nivel 1** (commits 9-12):
`CampScene` real, `CargoScene` (la decisión de 5 de 8), `SaveSystem`, `JournalSystem`,
el minijuego de apuntalar, el movimiento de Dafydd en la jornada 2 y la transición al Nivel 2.

## Cómo correrlo

```bash
npm install
npm run dev            # http://localhost:5173  (abrilo angosto o con el emulador de móvil)
npm test               # 20 tests de sistemas, sin navegador
npm run validate:data  # integridad referencial de todo /data
npm run build:single   # dist/index.html autocontenido, se abre con doble clic
```

Para probarlo como se va a jugar: DevTools → *toggle device toolbar* → iPhone 12/13/14.
La pantalla es **270×480 (9:16) fija**; en desktop se centra con banda a los costados.

## Próximo objetivo

Commits 9 a 12 del plan de `docs/02-arquitectura.md` §10, en este orden:

1. **`CampScene`** — el fogón nocturno como escena propia, no como diálogo suelto.
2. **`CargoScene`** — la decisión de 5 bultos de 8. Es el corazón del nivel: pantalla completa,
   sin deshacer, sin confirmación doble. Guarda `flags.n1_carga` como array de ids.
3. **`SaveSystem` + `JournalSystem`** — un solo slot en localStorage, autoguardado al cerrar jornada.
4. **`TransitionScene`** — tarjeta de cierre y salto al Nivel 2.

---

## Convenciones

```
ids de diseño     snake_case en español     n1_encontro_manantial, trig_manantial, npc_edwyn
archivos TS       PascalCase para clases    TimeSystem.ts, WorldScene.ts
archivos de datos kebab-case                nivel-01.json
eventos           dominio:accion            resource:changed, dialogue:start
flags de nivel    n{N}_{descripcion}        n1_carga, n1_bond_edwyn
commits           es, imperativo, con scope feat(systems): agregar TimeSystem con 4 turnos
```

---

## Lo que NO hay que hacer

- No agregar React, Vue ni ningún framework de DOM. La UI se dibuja en Phaser.
- No agregar combate, enemigos ni barras de vida enemigas. El juego no tiene combate por diseño (Pilar P1).
- No poner marcadores de quest flotantes ni minimapa. La orientación es parte del desafío (GDD §8).
- No inventar hechos históricos nuevos. Si hace falta contenido histórico que no está en los docs, marcarlo como `TODO(historia)` y preguntar.
- No representar a ninguna facción indígena como hostil por naturaleza. Ver `docs/04-guia-historica.md`.
