# CLAUDE.md — instrucciones para la sesión de código

Este repo es **Chubut 1865 — La Huella de los Rifleros** (antes "Y Wladfa": ese es el nombre de la colonia, no del juego), un RPG de supervivencia sin combate
sobre la colonización galesa del Chubut (1865–1902), en Phaser 3 + TypeScript.

Pantalla **vertical 9:16 (270×480), mobile-first**. El repo ya tiene los documentos de diseño,
los datos y **tres niveles jugables encadenados**: el desembarco (1), la marcha (2) y el valle (3).

---

## Antes de escribir código, leer en este orden

1. `docs/00-GDD.md` — qué es el juego y por qué. Los **cuatro pilares** de §3 resuelven cualquier duda de diseño.
2. `docs/01-nivel-01.md` — la spec del nivel a implementar, minuto a minuto.
3. `docs/02-arquitectura.md` — stack, carpetas, sistemas, contratos y el **plan de 12 commits** de §10.
4. `docs/03-assets.md` — qué arte hace falta y qué se puede reemplazar por placeholder.
5. `docs/04-guia-historica.md` — el marco histórico y las reglas de representación. **No es opcional.**
6. `docs/08-plan-nivel-02.md` y `docs/10-plan-nivel-03.md` — el plan y el estado de los Niveles 2 y 3.

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
✔ docs/           GDD, spec del Nivel 1, arquitectura, assets, guía histórica, planes de los Niveles 2 y 3, arte
✔ data/           config, items, npcs, niveles 01-03, diálogos, quests, códice, schemas
✔ src/            core + 12 sistemas + 8 escenas + guiones por nivel (src/levels) + UI táctil + mundo HD-2D (render3d)
✔ tests/          112 tests en verde: sistemas, recorridos, marcha, decisiones, libreta, los tres actos del valle, la zanja y el guardado
✔ scripts/        validate-data.mjs (integridad referencial)
◐ arte            ilustraciones, retratos y sprites reales donde existen; el resto, por código
✘ maps/           no hay .tmj de Tiled: el mapa se genera en src/util/mapgen.ts
```

**El Nivel 1 se juega completo**, de la portada al cierre: desembarco y cajones, la barranca y
la elección de cueva, el minijuego de apuntalar, los dos fogones (`CampScene`), la tarea de la
mañana del J2, Dafydd y el manantial (si no lo encontrás, Lewis te dice para dónde ir), la decisión de la carga
(`CargoScene`), la libreta con Diario y Códice (`JournalSystem`, `JournalScene`), el menú de pausa
con el recordatorio de qué hacer (`level.goals`) y el cierre con el balance de salida
(`level.exit.computeGrade`). Guarda sola al cerrar cada jornada (`SaveSystem`).

**El Nivel 2 — «La travesía»** es una marcha en vista lateral (`MarchScene` + `MarchSystem`, nivel
con `kind: "march"` en `data/levels/nivel-02.json`): 65 km del golfo al río, tres días si el viento
afloja, cuatro si no. Se entra con «Seguir viaje» al cerrar el Nivel 1 y hereda agua, comida, la
salud de Mari, la moral, la carga (sin abrigo, noches frías; sin libros, menos moral; sin harina,
hambre) y los vínculos (alguien sale a buscarte si te perdés). Decisiones, cada una con su costo
(`tests/march-decisions.test.ts` verifica que ninguna sea de adorno): el paso, todo el tiempo (apurar
sin aire enferma a tu madre); el caballo (repartir, o elegir qué se deja: raciones o un bulto del
Nivel 1); el cañadón; la costa o el atajo (Edwyn o Lewis: vínculo, y el atajo pide moral); la aguada
(verde o seca según la partida: se lee); el campamento tehuelche visto de lejos y la rastrillada; el
viento del oeste; la huella borrada (la brújula es el viento); y cada noche (repartir, racionar o
caminar con la luna). La llegada cambia según el día y cómo viene tu madre. Guarda cada noche (`Game.saveMarch`), «Continuar» la
retoma, y al llegar al Fuerte Paz / Caer Antur vuelca todo a la partida (`Game.finishMarch`): diario
por jornada, Códice, balance de salida. `?marcha` en la URL la abre suelta, sin tocar la partida.

**La libreta** (desde que Berwyn la da, Nivel 1 día 3) es un cuaderno 3D (`render3d/BookView3D.ts`,
`JournalScene`): llega volando desde la esquina, se abre en la primera hoja y se hojea con hojas que se
curvan. Es la bitácora del viaje: un capítulo por nivel, cada jornada con lo que pasó y, debajo de cada
decisión, en otra tinta, lo que el personaje cree que va a traer (`journalThought` en las quests). Al
final, el Códice. El contenido sale de `JournalSystem.bookBlocks()`; el paginado, de `paginate()`.

**El Nivel 3 — «El valle»** (`WorldScene` + guion `src/levels/nivel03.ts` + `ConstructionSystem`, mapa
generado `valle_chubut`): se entra al llegar a Caer Antur. Acto I (IX-1865): la bandera de Murga, el
rancho de barro (dónde: río o barda), los víveres, la crecida y qué se rehace. Acto II (1866): el
invierno, el toldo junto al fuerte, el trato sobre la manta (aonikenk en `▓`), Gwilym si quedó la
harina (el coro, si muere), tu madre si quedó el abrigo. Acto III (1867-68): Madryn, la idea de Rachel
Jenkins, la zanja cavada de a un tramo (el agua corre, la compuerta riega, la chacra baja de los
vecinos se inunda) y la cosecha. El cierre es «Continuará…».

**Guardado:** un slot en `localStorage` (`SaveSystem`), al cerrar cada jornada; nunca en medio de una
escena (`Game.holdSaves`/`releaseSaves`). La pantalla de cierre de nivel también queda guardada. En la
portada: exportar/importar la partida a un archivo (se valida en `migrateState`; versión `SAVE_VERSION`).

**Lo que falta:** la viñeta de 1875 (Gaiman) y el Nivel 4; la compra de la semilla; arte de los
personajes nuevos del Nivel 3 (`docs/11-arte-nivel-03.txt`); ciclo de caminata dibujado y texto en bitmap font.

## Cómo correrlo

```bash
npm install
npm run dev            # http://localhost:5173  (abrilo angosto o con el emulador de móvil)
npm test               # 112 tests (sistemas, recorridos, niveles, marcha, libreta, valle, guardado), sin navegador
npm run validate:data  # integridad referencial de todo /data
npm run build:single   # dist/index.html autocontenido, se abre con doble clic
```

Para probarlo como se va a jugar: DevTools → *toggle device toolbar* → iPhone 12/13/14.
La pantalla es **270×480 (9:16) fija**; en desktop se centra con banda a los costados.

## Próximo objetivo

Pasada completa N1 → N2 → N3 en celular; la viñeta de 1875 (Gaiman, el eisteddfod, el coro) que cierra
el Nivel 3; la compra de la semilla. Pendientes históricos en `docs/10-plan-nivel-03.md` (`TODO(historia)`).
`?nivel=nivel-03` (solo en `npm run dev`) arranca directo en un nivel.

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
