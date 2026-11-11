# CLAUDE.md — instrucciones para la sesión de código

Este repo es **Chubut 1865 — La Huella de los Rifleros** (antes "Y Wladfa": ese es el nombre de la colonia, no del juego), un RPG de supervivencia sin combate
sobre la colonización galesa del Chubut (1865–1902), en Phaser 3 + TypeScript.

Pantalla **vertical 9:16 (270×480), mobile-first**. El repo ya tiene los documentos de diseño,
los datos y el **Nivel 1 jugable de punta a punta**. El objetivo ahora es el Nivel 2.

---

## Antes de escribir código, leer en este orden

1. `docs/00-GDD.md` — qué es el juego y por qué. Los **cuatro pilares** de §3 resuelven cualquier duda de diseño.
2. `docs/01-nivel-01.md` — la spec del nivel a implementar, minuto a minuto.
3. `docs/02-arquitectura.md` — stack, carpetas, sistemas, contratos y el **plan de 12 commits** de §10.
4. `docs/03-assets.md` — qué arte hace falta y qué se puede reemplazar por placeholder.
5. `docs/04-guia-historica.md` — el marco histórico y las reglas de representación. **No es opcional.**
6. `docs/08-plan-nivel-02.md` — el plan del nivel siguiente y la deuda técnica previa.

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
El mundo es **HD-2D**: `src/render3d/World3D.ts` lo dibuja en 3D con Three.js debajo del canvas de
Phaser (transparente en la franja del mundo). `WorldScene` sigue siendo dueña de toda la lógica y
deja de dibujar; World3D copia sus objetos cada cuadro. Ahí sí hay perspectiva, rotación y escala
libre — la regla de escalas enteras vale para la UI de Phaser (HUD, bandeja, escenas a pantalla
completa). `?2d` en la URL vuelve al mundo 2D. Cámara, alturas y luz por turno: `src/config.ts`.
El texto hoy usa `Text` con `setResolution(4)`; falta migrarlo a bitmap font (`docs/03-assets.md` §6).

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
✔ docs/           GDD, spec del Nivel 1, arquitectura, assets, guía histórica, plan del Nivel 2
✔ data/           config, items, npcs, nivel-01, diálogos, quests, códice, schemas
✔ src/            core + 10 sistemas + 7 escenas + UI táctil + mundo HD-2D (render3d)
✔ tests/          38 tests en verde: sistemas, recorrido del nivel, caminos del mapa y encadenar niveles
✔ scripts/        validate-data.mjs (integridad referencial)
◐ arte            ilustraciones, retratos y sprites reales donde existen; el resto, por código
✘ maps/           no hay .tmj de Tiled: el mapa se genera en src/util/mapgen.ts
```

**El Nivel 1 se juega completo**, de la portada al cierre: desembarco y cajones, la barranca y
la elección de cueva, el minijuego de apuntalar, los dos fogones (`CampScene`), la tarea de la
mañana del J2, Dafydd y el manantial (con salida si no se lo encuentra), la decisión de la carga
(`CargoScene`), la libreta con Diario y Códice (`JournalSystem`, `JournalScene`), el menú de pausa
con el recordatorio de qué hacer (`level.goals`) y el cierre con el balance de salida
(`level.exit.computeGrade`). Guarda sola al cerrar cada jornada (`SaveSystem`).

**Lo que falta:** el Nivel 2. Hoy el cierre es una pantalla de «Continuará…».
Pendientes menores del Nivel 1: ciclo de caminata dibujado (hoy es procedural) y texto en bitmap font.

## Cómo correrlo

```bash
npm install
npm run dev            # http://localhost:5173  (abrilo angosto o con el emulador de móvil)
npm test               # 38 tests (sistemas, recorrido, caminos, encadenar niveles), sin navegador
npm run validate:data  # integridad referencial de todo /data
npm run build:single   # dist/index.html autocontenido, se abre con doble clic
```

Para probarlo como se va a jugar: DevTools → *toggle device toolbar* → iPhone 12/13/14.
La pantalla es **270×480 (9:16) fija**; en desktop se centra con banda a los costados.

## Próximo objetivo

El **Nivel 2 — «La travesía: del golfo al río»**. El plan está en `docs/08-plan-nivel-02.md`:
qué hereda del Nivel 1, el sistema nuevo (marcha, ruta, extravío), la deuda técnica a pagar
antes (el código del mundo está atado al Nivel 1) y el orden de trabajo.

Antes de escribir contenido del Nivel 2 hay que resolver los `TODO(historia)` y las decisiones
D1-D5 de ese documento. Los pasos 1 a 4 (separar el guion del Nivel 1, carga por nivel,
transición real, terreno por franjas) no dependen de eso y se pueden empezar.

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
