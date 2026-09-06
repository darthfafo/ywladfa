# Lista de assets — Nivel 1
## v0.1 · lo mínimo para tener el Nivel 1 jugable

Convención de nombres: `snake_case`, sin acentos, sin espacios. PNG-8 con paleta indexada donde se pueda.

---

## 1. Paleta maestra (32 colores)

Todo el arte del juego sale de esta paleta. Guardarla como `assets/palette.gpl` y `palette.png`.

```
#0E1416  #18262A  #24363B  #2E464F  #3A6B78  #4E8A96  #7FB0B8  #BFD3D8   ← fríos / agua / cielo
#1A1A16  #2B2A22  #45412F  #5E5741  #7A7157  #A09472  #C6B896  #EAE8E0   ← tierra / bone
#3A2018  #5C3022  #7A4A2E  #9C3A24  #B07A52  #C89A6E  #DEB98E  #F0DCC0   ← arcilla / barranca
#1E2A18  #2F3E24  #465533  #586A46  #6E7A56  #8A9668  #A9791F  #D9A845   ← vegetacion / coiron
#7A2418  #F2F2EC  #B8B4A4  #6B6A5E                                       ← sangre / nieve / grises
```

**Regla cromática del juego:** los verdes saturados (`#8A9668` y superiores) están **reservados** para el Nivel 10. En el Nivel 1 no se usan.

---

## 2. Tilesets

| Archivo | Tamaño | Tiles | Contenido |
|---|---|---|---|
| `tilesets/punta_cuevas.png` | 256×512 | 16×32 = 512 | Terreno completo del Nivel 1 |
| `tilesets/ui.png` | 128×128 | — | Marcos, botones, iconos de recurso, cursor |

### Desglose de `punta_cuevas.png`

| Bloque | Tiles | Detalle |
|---|---|---|
| Arena seca | 16 | Base + 8 variantes de ruido + 4 con conchilla + 3 con piedra |
| Arena húmeda | 12 | Base + borde de agua animado (4 frames) + huellas |
| Agua / mar | 20 | Orilla animada 4 frames × 3 profundidades, espuma |
| Canto rodado | 12 | |
| Arcilla de barranca | 24 | Pared vertical, esquinas, cornisas, estratos |
| Boca de cueva | 18 | 6 cuevas × 3 estados (vacía / apuntalada / habitada con fuego) |
| Coirón y jarilla | 20 | 4 matas × 5 tamaños |
| Roca de meseta | 16 | |
| Cañadón | 18 | Paredes, fondo, marca de agua seca, **mata verde delatora** |
| Manantial | 6 | Hilo de agua animado 3 frames + charco |
| Sendero (`path`) | 9 | Auto-tile de 9 piezas — se dibuja solo al caminar |
| Props | 40 | Cajones, barriles, botes, carros, fogón (3 tamaños), maderos, cruces, sogas, faroles, tinajas |
| Detalle | 30 | Huesos, algas, plumas, huellas de guanaco, huellas de niño |
| Reservados | resto | |

> **Prioridad para un prototipo funcional:** arena seca, arcilla, boca de cueva, agua, coirón, props (cajón + fogón). Son 6 bloques y con eso el nivel ya se juega. El resto es pulido.

---

## 3. Sprites de personaje

**Formato:** 16 × 24 px. Hoja de 4 direcciones (S, N, E, O; el O es flip del E).
**Frames:** 4 de caminata + 2 de idle + 1 de cargar + 1 de agacharse = 8 por dirección.

| Archivo | Personaje | Prioridad |
|---|---|---|
| `sprites/pc_f.png` | Elin Vaughan | **P0** |
| `sprites/pc_m.png` | Idris Vaughan | **P0** |
| `sprites/npc_lewis.png` | Lewis Jones — sombrero de copa gastado | **P0** |
| `sprites/npc_edwyn.png` | Edwyn Roberts — abrigo largo, encorvado | **P0** |
| `sprites/npc_matthews.png` | Rev. Matthews — negro, cuello blanco | **P0** |
| `sprites/npc_berwyn.png` | Richard Berwyn — libreta bajo el brazo | **P1** |
| `sprites/npc_pepperell.png` | Cap. Pepperell — gorra de marino | **P1** |
| `sprites/npc_mari.png` | Mari Vaughan — chal, sentada en J2 | **P1** |
| `sprites/npc_dafydd.png` | Dafydd, 9 años — 16×18, más chico | **P0** |
| `sprites/crowd.png` | 6 colonos genéricos, solo idle | **P2** |

**Guía de silueta:** cada personaje se tiene que reconocer en 16×24 **por la silueta**, no por el color. Sombrero, chal, libreta, gorra. A esta resolución la cara no existe.

---

## 4. Retratos de diálogo

**Formato:** 48 × 48 px, 3 expresiones cada uno (neutral / tenso / cálido).

```
portraits/pc_f.png        portraits/lewis.png      portraits/matthews.png
portraits/pc_m.png        portraits/edwyn.png      portraits/berwyn.png
portraits/mari.png        portraits/dafydd.png     portraits/pepperell.png
```

**P0:** pc, lewis, edwyn, dafydd. **P1:** el resto.

---

## 5. Interfaz

Pantalla **270 × 480 (9:16)**, en tres franjas: HUD 32 px · mundo 352 px · bandeja inferior 96 px.

| Asset | Tamaño | Notas |
|---|---|---|
| Franja de HUD | 270×32 | Fondo `#18262A`. Turno a la izquierda, clima al centro, 3 recursos a la derecha |
| Indicador de turno | 44×12 | 4 puntos: vacío / lleno. El sol se mueve entre ellos |
| Iconos de recurso | 8×8 ×6 | gota, pan, fardo, haz, bala, martillo |
| Bandeja inferior | 270×96 | 9-slice. Es la misma franja para controles y para diálogo |
| Retrato en diálogo | 48×48 | Esquina inferior izquierda de la bandeja |
| Joystick fijo | 40 base + 18 pulgar | Abajo a la derecha de la bandeja (más cerca del pulgar), posición fija, alpha 0.16 |
| Botón de acción | 40×40 | Apilado arriba del joystick, mismo lado. No más grande que la base del joystick. Icono contextual: hablar / levantar / cavar / entrar |
| Barra de carga | 56×6 | Verde → ámbar → rojo al pasar capacidad. Va en el HUD |
| Cursor de interacción | 16×16 | Sobre lo interactuable, animado 2 frames |
| Paneles completos (diario, mapa, códice) | 270×480 | **Pantalla completa**, no ventanas: en vertical no entran |
| Pantalla de carga (CargoScene) | 270×480 | 8 bultos en grilla 2×4, ilustrados a 56×56, con scroll si hace falta |
| Tarjetas de transición | 270×480 | Fondo negro + bitmap text, sin arte |

> **Regla táctil:** ningún objetivo por debajo de 44 px de pantalla real. A ×3 son 15 px internos;
> a ×4, 11. Los ítems de lista van a **20 px internos** de alto como mínimo.

---

## 6. Tipografía

`fonts/wladfa8.png` + `wladfa8.xml` — **bitmap font de 8 px**.

Set de caracteres obligatorio:
```
A-Z a-z 0-9
. , : ; ! ? ' " ( ) — – … / % + - = < > * &
á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡
ŵ ŷ â ê î ô û Ŵ Ŷ Â Ê Î Ô Û      ← galés · sin esto no se escribe "Cwm Hyfryd"
▓ ░ █                             ← bloques del sistema de idiomas
```

Segunda fuente `wladfa16.png` de 16 px solo para títulos y tarjetas.

---

## 7. Audio

### Música (4 pistas para el Nivel 1)
| Id | Uso | Instrumentación |
|---|---|---|
| `mus_titulo` | Menú | Arpa sola, arreglo mínimo de `Ar Hyd y Nos` (dominio público) |
| `mus_playa` | Z1, Z6 | Cuerda grave sostenida + mar |
| `mus_barranca` | Z2 de noche | Acordeón muy bajo, casi inaudible |
| `mus_silencio` | Escena del manantial | **Ninguna.** Solo el loop de agua. Está en la lista para que nadie lo "arregle" |

### Ambiente (loops)
`amb_viento_bajo`, `amb_viento_alto`, `amb_mar`, `amb_fuego`, `amb_agua_hilo`, `amb_noche`

### SFX
```
Pasos:   sfx_paso_arena, _piedra, _pasto, _agua, _madera   (4 variantes c/u, random pitch ±4 %)
Acción:  sfx_levantar, sfx_soltar, sfx_cavar, sfx_madera_golpe, sfx_soga
Fuego:   sfx_encender, sfx_chispa
UI:      sfx_ui_mover, sfx_ui_confirmar, sfx_ui_cancelar, sfx_pagina, sfx_recurso_gana, sfx_recurso_pierde
Voz:     sin voces. El diálogo usa un "blip" por personaje (6 tonos distintos)
```

---

## 8. Mapa

| Archivo | Herramienta | Notas |
|---|---|---|
| `maps/nivel-01.tmj` | Tiled 1.10+ | 100×70 tiles, 8 capas según `02-arquitectura.md` §2.2 |
| `maps/nivel-01.tsx` | Tiled | Tileset con propiedades `collides`, `terrain`, `speed` |

---

## 9. Orden de producción recomendado

```
Semana 1  Paleta + tileset P0 (6 bloques) + PC + mapa gris jugable en Tiled
Semana 2  NPCs P0 + retratos P0 + UI mínima (diálogo, turno, recursos)
Semana 3  Tileset completo + sendero emergente + props + animaciones de agua/fuego
Semana 4  Retratos P1 + pantalla de carga ilustrada + diario + tarjetas
Semana 5  Audio completo + pulido
```

**Placeholder válido para empezar hoy:** rectángulos de colores de la paleta maestra con el tamaño final exacto. El código no distingue, y evita bloquear la programación esperando arte.

---

*Lista de assets v0.1 · septiembre 2026*
