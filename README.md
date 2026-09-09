# Y Wladfa — La Huella de los Rifleros

RPG de supervivencia y expedición, **sin combate**, sobre la colonización galesa del Chubut
entre 1865 y 1902: desde el desembarco del *Mimosa* en Punta Cuevas hasta la fundación de Trevelin.

Top-down pixel art 16-bit · **vertical 9:16, mobile-first** · Phaser 3 · TypeScript · Vite

> *Julio de 1865. Ciento cincuenta galeses desembarcan en una playa de la Patagonia a la que
> les dijeron que era verde. No lo es.*

**🎮 Jugalo acá: [ywladfa.fede-puratich.workers.dev](https://ywladfa.fede-puratich.workers.dev)**

---

## Estado

**El Nivel 1 se juega de punta a punta**, desde el desembarco hasta la decisión de carga y la
salida hacia el sur: desembarco, bajar los ocho cajones, subir a la barranca, elegir cueva,
repartir tareas, encontrar el manantial, perder y reencontrar a Dafydd, dos noches de fogón con
diálogos propios, el diario y el códice de Berwyn, la pantalla de carga (5 de 8 bultos, sin
vuelta atrás) y el cierre en la punta.

```
✔ docs/    diseño completo (GDD, spec del nivel, arquitectura, guía histórica)
✔ data/    16 archivos JSON · 7 NPCs · 33 triggers · 24 diálogos · 13 fichas de códice
✔ src/     core + 7 sistemas + 6 escenas + UI táctil, las 12 etapas del plan original
✔ src/assets/  48 piezas de arte real (13 escenas, 27 retratos, 8 props) + resto generado por código
✔ tests/   20 tests en verde, sin navegador
```

Todos los NPCs (reales y ficticios) tienen algo que decir en cualquier momento del nivel, no solo
en su escena guionada — y varios dan pistas de hacia dónde seguir en vez de callarse.

## Correrlo

```bash
npm install
npm run dev            # http://localhost:5173
npm test                # 20 tests de sistemas
npm run validate:data   # integridad referencial de todo /data
npm run build:single    # dist/index.html autocontenido, se abre con doble clic
```

La pantalla es **270 × 480 (9:16) fija**. En el navegador de escritorio conviene abrirlo con el
emulador de móvil activado; se juega con WASD/flechas + Espacio, o con el joystick táctil
(aparece donde toques, no en un punto fijo).

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
  levels/nivel-01.json       zonas, spawns, objetivos y triggers
  dialogues/nivel-01.json    diálogos con ramas, pantallas de elección y tutoriales
  quests/nivel-01.json       6 quests con fracaso suave
  schemas/                   8 JSON Schema para validar todo lo anterior
src/
  systems/                   lógica pura sin Phaser (TimeSystem, ResourceSystem, DialogueSystem...)
  scenes/                    Boot, World, Ui, Camp, Cargo, Transition
  assets/                    arte real (escenas, retratos, props) — el resto cae en placeholders de código
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

El Nivel 1 está cerrado y jugable de punta a punta. Lo que sigue es Nivel 2 (`docs/00-GDD.md`),
más el arte que todavía cae en placeholder generado por código, y una pasada de guardado /
exportar-importar partida más robusta.

---

*Desarrollado junto con Claude (Anthropic) — Fede Puratich.*
