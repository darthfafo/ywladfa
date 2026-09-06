# Y Wladfa — La Huella de los Rifleros

RPG de supervivencia y expedición, **sin combate**, sobre la colonización galesa del Chubut
entre 1865 y 1902: desde el desembarco del *Mimosa* en Punta Cuevas hasta la fundación de Trevelin.

Top-down pixel art 16-bit · **vertical 9:16, mobile-first** · Phaser 3 · TypeScript · Vite

> *Julio de 1865. Ciento cincuenta galeses desembarcan en una playa de la Patagonia a la que
> les dijeron que era verde. No lo es.*

---

## Estado

**Prototipo jugable.** Se camina por la playa y la barranca, se bajan los cajones, se habla con los
NPCs y corren los diálogos con ramas. Faltan las tres escenas que cierran el nivel.

```
✔ docs/    diseño completo
✔ data/    contenido en JSON + 8 schemas de validación
✔ src/     core + 7 sistemas + 3 escenas + UI táctil (commits 1-8 de 12)
✔ tests/   20 tests en verde
◐ assets/  arte generado por código, con los tamaños finales
```

## Correrlo

```bash
npm install
npm run dev            # http://localhost:5173
npm test
npm run validate:data
npm run build:single   # dist/index.html autocontenido
```

La pantalla es **270 × 480 (9:16) fija**. En el navegador de escritorio conviene abrirlo con el
emulador de móvil activado; se juega con WASD/flechas + Espacio, o con el joystick táctil.

---

## Estructura

```
CLAUDE.md                    ← empezar acá si venís a programar
docs/
  00-GDD.md                  documento de diseño: pilares, loops, sistemas, los 10 niveles
  01-nivel-01.md             spec del Nivel 1 minuto a minuto
  02-arquitectura.md         stack, carpetas, sistemas y plan de 12 commits
  03-assets.md               paleta, tilesets, sprites, audio, orden de producción
  04-guia-historica.md       cronología, toponimia y reglas de representación
data/
  config/game.json           constantes globales
  config/balance.json        todos los números tuneables
  items.json                 12 ítems + los 8 bultos de la decisión del Nivel 1
  npcs.json                  7 personajes del Nivel 1 (5 reales, 2 ficticios)
  codex.json                 13 fichas históricas, cada una con lo documentado y lo dramatizado
  levels/nivel-01.json       zonas, spawns, objetivos y 24 triggers
  dialogues/nivel-01.json    10 diálogos con ramas + 2 pantallas de elección + 4 tutoriales
  quests/nivel-01.json       6 quests con fracaso suave
  schemas/                   8 JSON Schema para validar todo lo anterior
```

---

## Los cuatro pilares

1. **La distancia es el enemigo.** No hay combate. El conflicto es agua, peso, días y gente.
2. **Nada se destruye, todo se decide.** Lo que dejás en la playa del Nivel 1 sigue faltando en el Nivel 7.
3. **Entender es un recurso.** Galés, castellano y aonikenk. Sin intérprete, los diálogos tienen huecos literales.
4. **Historia real, no fantasía patagónica.** Cada topónimo, fecha y persona existió, y el Códice declara qué está dramatizado.

---

## El Nivel 1 en una línea

Tres jornadas en Punta Cuevas: bajar los cajones, encontrar agua y elegir cinco de ocho bultos
para el viaje al sur. La última decisión no se puede deshacer, y el juego no te pregunta si estás seguro.

---

## Cómo seguir

1. Leer `CLAUDE.md`.
2. Leer `docs/00-GDD.md` §3 (los pilares) y `docs/01-nivel-01.md` completo.
3. Seguir por los commits 9-12 del plan de `docs/02-arquitectura.md` §10: `CampScene`, `CargoScene`, guardado y transición.

---

*Preproducción · septiembre 2026 · v0.1*
