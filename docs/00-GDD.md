# Y Wladfa — La Huella de los Rifleros
## Documento de Diseño de Juego (GDD) · v0.1

> **Estado:** preproducción cerrada. Este documento es la fuente de verdad del diseño.
> Todo lo que esté en `/data/*.json` debe coincidir con lo que dice acá; si hay conflicto, manda el JSON y se corrige el GDD.

---

## 1. Ficha técnica

| Campo | Valor |
|---|---|
| Título de trabajo | **Y Wladfa — La Huella de los Rifleros** |
| Género | RPG de supervivencia y expedición, sin combate |
| Perspectiva | Top-down 2D, pixel art 16-bit |
| Motor | Phaser 3.80+ · TypeScript · Vite |
| Plataforma | **Web mobile-first** (vertical). Desktop corre la misma pantalla centrada |
| Orientación | **9:16 vertical, fija.** No hay modo horizontal |
| Resolución interna | **270 × 480 px** (escala entera ×1 / ×2 / ×3 / ×4) |
| Tile | 16 × 16 px |
| Duración objetivo | 8–12 h la campaña completa · 35–45 min el Nivel 1 |
| Idioma | Español rioplatense, con galés y tehuelche como capa diegética |
| Público | 14+ · jugadores de RPG narrativo, público patagónico y educativo |
| Marco histórico | Chubut, 1865–1902 |

---

## 2. Pitch

> Julio de 1865. Ciento cincuenta galeses desembarcan en una playa de la Patagonia
> a la que les dijeron que era verde. No lo es. Sos uno de ellos, y tenés que llegar
> vivo desde esa playa hasta un valle en la cordillera del que todavía nadie sabe
> que existe: mil kilómetros de meseta, veinte años de historia y un solo mapa,
> que vas dibujando vos.

**Y Wladfa** es un RPG de expedición sin combate. El enemigo es la distancia, el agua,
el viento y las decisiones que no se pueden deshacer. Cada nombre, fecha, río y persona
del juego existió.

---

## 3. Pilares de diseño

Cuatro reglas que resuelven cualquier discusión de diseño. Si una feature no defiende
un pilar, no entra.

**P1 · La distancia es el enemigo.**
No hay combate. Todo el conflicto es logístico y humano: cuánta agua llevás, cuánto pesa,
cuántos días te quedan, quién se enferma. La tensión viene de un mapa que no perdona,
no de una barra de vida enemiga.

**P2 · Nada se destruye, todo se decide.**
El inventario es finito y pesa. Dejar algo atrás es la mecánica central, y lo que dejás
en la playa del Nivel 1 sigue faltando en el Nivel 7. No hay "cofre de reserva" ni
retroceso: el juego guarda una sola partida y no permite deshacer.

**P3 · Entender es un recurso.**
Tres lenguas conviven en pantalla — galés, castellano, aonikenk. Sin intérprete los
diálogos se ven con huecos literales. Ganar comprensión es progresión, igual que
ganar equipo.

**P4 · Historia real, no fantasía patagónica.**
Ningún cacique genérico, ningún tesoro perdido, ninguna criatura. Los topónimos, fechas,
personas y objetos son los documentados. Lo inventado son los protagonistas jugables
y el detalle de los diálogos, y el juego lo declara en su propio Códice.

---

## 4. Loops de juego

### 4.1 Loop macro — la campaña
```
PREPARAR  →  MARCHAR  →  ACAMPAR  →  DECIDIR  →  (nuevo tramo)
   ↑                                                 │
   └─────────────── lo que decidiste ────────────────┘
```

### 4.2 Loop micro — la jornada
Una jornada = **4 turnos** (Amanecer · Mañana · Tarde · Noche). Cada acción cuesta turnos.

```
1. AMANECER   Ves clima, estado del grupo y objetivos. Planificás la jornada.
2. MAÑANA     Acción larga: marchar, cazar, cavar, explorar, negociar.
3. TARDE      Segunda acción larga. Los eventos de camino disparan acá.
4. NOCHE      Campamento: cocinar, curar, reparar, hablar con el grupo, escribir el diario.
              Se consumen raciones y agua. Se recupera (o no) moral y salud.
```

**Regla de oro del ritmo:** el jugador siempre elige entre *avanzar* y *sostener*.
Avanzar gasta; sostener no acerca al objetivo. Nunca alcanza para las dos cosas.

### 4.3 Loop de recompensa
```
Explorar → Registrar en el mapa → El mapa desbloquea rutas → Rutas más cortas → Más días de margen
Hablar   → Ganar comprensión    → Más diálogo legible     → Mejores tratos    → Más recursos
```

---

## 5. Sistemas

### 5.1 Tiempo
- Unidad mínima: **turno** (¼ de jornada). Unidad de campaña: **jornada**.
- Cada nivel tiene un presupuesto de jornadas. Excederlo no es *game over*: degrada el estado con el que arrancás el nivel siguiente.
- El reloj avanza solo con acciones, nunca en tiempo real. Explorar el mapa a pie es gratis dentro de un turno; las acciones marcadas como *largas* lo consumen.

### 5.2 Recursos
| Recurso | Unidad | Se gasta con | Se consigue con |
|---|---|---|---|
| `agua` | litros | noche, marcha, calor | aguadas, lluvia, nieve, río |
| `comida` | raciones | noche (1 por persona) | caza, pesca, trueque, cultivo |
| `forraje` | fardos | noche (caballada) | mallines, pastura de río |
| `leña` | haces | cocinar, calentar | jarilla, monte de ribera |
| `munición` | tiros | cazar | trueque, depósito |
| `materiales` | unidades | construir, reparar | restos del barco, madera, cuero |

**Regla:** ningún recurso es dinero. No hay compra/venta con moneda hasta el Nivel 3.

### 5.3 Carga
- Cada personaje tiene **capacidad en kg**. Los carros y cargueros suman capacidad, y también consumen.
- Sobrepasar la capacidad no bloquea: **baja la velocidad de marcha** y **sube el desgaste**. Nunca un cartel de "inventario lleno".
- Todo ítem tiene `peso`. El pan pesa. La imprenta pesa 90 kg.

### 5.4 Personajes del grupo
Cada miembro tiene:
```
salud (0-100) · moral (0-100) · resistencia (0-100) · oficio · idiomas · vínculo con el jugador (0-5)
```
- **Oficio** desbloquea acciones: *baqueano* (leer rastros), *herrero* (reparar), *agricultor* (canales), *tirador* (caza eficiente), *agrimensor* (registrar mapa), *intérprete* (idioma), *predicador* (moral), *médico* (salud).
- Un personaje con moral < 20 **discute** en el campamento y puede negarse a una acción.
- La gente no muere por barra de vida: muere por enfermedad no atendida, frío o abandono, y siempre con aviso previo de dos jornadas.

### 5.5 Comprensión de idiomas (P3)
Tres idiomas: `cym` (galés), `spa` (castellano), `aon` (aonikenk/tehuelche).
Nivel del jugador por idioma: `0 ninguno · 1 básico · 2 funcional · 3 fluido`.

Renderizado en pantalla según nivel:
```
0 → "▓▓▓▓ ▓▓▓ ▓▓▓▓▓▓."                    (bloques, ni sabés de qué habla)
1 → "▓▓▓▓ agua ▓▓▓ tres ▓▓▓."             (palabras sueltas)
2 → "Hay agua tres ▓▓▓ hacia el sur."      (casi todo, falta el matiz)
3 → "Hay agua a tres días hacia el sur."   (completo)
```
- Sube por: escuchar (pasivo, lento), un intérprete en el grupo (+1 temporal), enseñar/aprender en el campamento (acción de noche), objetos (diccionario, libro de himnos).
- **No hay subtítulo mágico.** Si el jugador no invirtió en idioma, pierde información y toma peores decisiones. Eso es el sistema.

### 5.6 Trueque
- Sin monedas. Cada facción tiene una **tabla de valor propia**: para los tehuelches el metal y la yerba valen mucho más que el pan; para el almacén de Buenos Aires, al revés.
- Modificador de **confianza** por facción (0–100), que sube con tratos justos y baja con regateo agresivo o promesas incumplidas.
- La confianza no compra ítems: desbloquea **información** (aguadas, pasos, avisos) que es lo verdaderamente escaso.

### 5.7 Cartografía (el mapa como entregable)
- El mapa del mundo arranca vacío. Cada **hito registrado** (aguada, paso, vado, cerro, valle) se dibuja al pasar por él *con un agrimensor en el grupo o con instrumento*.
- Hitos registrados = rutas rápidas desbloqueadas en tramos posteriores + puntaje final.
- Es la traducción jugable del mapa real que Fontana entregó a Roca en 1886.

### 5.8 Toponimia
- Al descubrir un accidente geográfico sin nombre, el jugador elige entre **nombre galés**, **nombre castellano** o **el nombre que ya tiene en lengua indígena**.
- Cada elección mueve el medidor de **Identidad de la colonia** (galesa ↔ argentina ↔ mestiza), que cambia diálogos, el epílogo y el resultado del plebiscito del Nivel 10.
- No hay opción "correcta". Hay consecuencias distintas.

### 5.9 Clima
- El **viento del oeste** es permanente, no aleatorio: es un modificador de fondo que baja precisión de caza, apaga fuegos, dispersa animales y drena moral.
- Eventos climáticos por nivel: helada, tormenta de tierra, creciente del río, nevada, seca.
- El clima se **anuncia al amanecer** con una lectura del cielo. Con un baqueano en el grupo, el pronóstico es confiable; sin él, es ambiguo.

### 5.10 Construcción (desde Nivel 3)
- Canales de riego, ranchos, corrales, molino. Se construye colocando piezas sobre la grilla con reglas de pendiente y distancia al río.
- Un canal mal trazado no "falla": inunda la chacra del vecino y **baja confianza social**.

### 5.11 Diario y Códice
- **Diario**: se escribe solo, en primera persona, con lo que pasó cada jornada. Es el resumen de partida y el save legible.
- **Códice**: fichas históricas reales que se desbloquean al tocar el tema en juego (el Mimosa, el riego, la Conquista del Desierto, el eisteddfod). Cada ficha marca explícitamente qué es **documentado** y qué es **dramatizado**.

---

## 6. Estructura de la campaña

Diez niveles, uno por etapa del recorrido real. Cada uno introduce **un** sistema nuevo.

| # | Nivel | Año | Sistema nuevo | Duración |
|---|---|---|---|---|
| **01** | **Las cuevas** — Punta Cuevas / Puerto Madryn | 1865 | Turnos, recursos, carga | 35–45 min |
| 02 | La travesía — del golfo al río | 1865 | Marcha, ruta, extravío | 30 min |
| 03 | El valle — Rawson, Gaiman, Dolavon | 1865-67 | Construcción, riego, hub | 90 min |
| 04 | Boca Toma — el borde | 1885 | Armado de expedición, party | 45 min |
| 05 | Valle de los Mártires — Las Plumas | 1884/85 | Flashback, huida, duelo | 60 min |
| 06 | Los Altares | 1885 | Caballada, reparación | 45 min |
| 07 | Paso de Indios — la meseta | 1885 | Rastrilladas, trueque, idioma pleno | 90 min |
| 08 | Tecka — el oro | 1885 | Facciones internas, disenso | 60 min |
| 09 | El Peñón — Sierra Colorada | 1885 | (ninguno: clímax) | 20 min |
| 10 | Cwm Hyfryd — Valle 16 de Octubre | 1885-1902 | Fundación, epílogo, plebiscito | 90 min |

**Regla de estructura:** ningún nivel introduce dos sistemas. El Nivel 9 no introduce ninguno a propósito — es el pago emocional.

---

## 7. Personaje jugable

**Idris / Elin Vaughan**, 24 años, de Merthyr Tydfil. Minero (o hilandera) sin experiencia agrícola,
como la mayoría real de los colonos. El jugador elige género y nombre al inicio; el resto del
diseño es idéntico.

- **Es personaje ficticio a propósito.** Los personajes históricos reales del juego (Lewis Jones, Fontana, Evans, los Jenkins) son NPCs: el jugador acompaña la historia, no la reemplaza.
- Empieza con `cym 3 · spa 0 · aon 0`. Termina la campaña con lo que haya invertido.
- Vive los cuarenta años de la campaña: en el Nivel 10 tiene sesenta y pico y el juego lo muestra.

---

## 8. Interfaz — vertical 9:16

La pantalla es **270 × 480** y se divide en tres franjas fijas. Ninguna se mueve nunca.

```
┌─────────────────────────┐  y 0
│  HUD  32px              │   turno (4 puntos) · clima · 3 recursos
├─────────────────────────┤  y 32
│                         │
│                         │
│   MUNDO  270 × 352      │   cámara del juego · 16.9 × 22 tiles
│                         │
│                         │
├─────────────────────────┤  y 384
│  CONTROLES / DIÁLOGO    │   96px · joystick + acción, o la caja de diálogo
└─────────────────────────┘  y 480
```

**Por qué esta división.** En vertical la caja de diálogo no puede taparle la cara al mundo: si
ocupara el 40 % inferior de una pantalla apaisada sería un tercio; acá sería la mitad. Reservando
la franja de abajo de entrada, el mundo nunca se achica y el jugador nunca pierde contexto.

- **HUD (32 px):** turno del día (4 puntos con el sol moviéndose), icono de clima, y los tres recursos críticos del nivel. Nada más. Nunca crece.
- **Mundo (352 px):** la cámara. 22 tiles de alto por ~17 de ancho. Los mapas se diseñan **verticales** para aprovecharlo.
- **Franja inferior (96 px):** en exploración muestra los controles táctiles; en conversación se convierte en la caja de diálogo con retrato de 48×48 a la izquierda. **Es la misma franja**: no aparece ni desaparece nada, solo cambia de contenido.
- **Paneles completos** (jornada, mapa, diario, códice) abren a pantalla completa, no en ventanas. En vertical las ventanas flotantes no entran.
- **Sin minimapa. Sin marcadores de quest flotantes.** La orientación se resuelve con el mapa y con lo que te dicen los NPCs. Es parte de P1.

### Controles táctiles
- **Joystick fijo**, abajo a la derecha de la franja inferior (la posición más cercana al pulgar): base y agarre siempre en el mismo lugar, no floating. Se arrastra desde ahí, con una zona de agarre más generosa que el círculo visual.
- **Botón de acción** apilado arriba del joystick, mismo lado (40 px — no más grande que la base del joystick), contextual: cambia de icono según lo que tengas cerca (hablar / levantar / cavar / entrar).
- Los dos controles quedan del mismo lado a propósito: el resto de la franja queda libre para el texto que guía al jugador.
- **Tap en el mundo** = caminar hacia ahí, como alternativa al joystick.
- **Teclado en desktop:** WASD/flechas + Espacio, idénticos. El juego no detecta plataforma: soporta las dos entradas siempre.
- **Regla de tamaño:** ningún objetivo táctil por debajo de 44 px de pantalla real. A escala ×3 eso son 15 px internos: el botón de acción de 48 px internos sobra, los ítems de lista van a 20 px internos mínimo.

---

## 9. Dirección de arte

**Paleta base (32 colores, derivada del paisaje real):**
```
Bone     #EAE8E0   Arcilla   #B07A52   Barranca  #9C3A24   Coirón    #A9791F
Jarilla  #6E7A56   Musgo     #586A46   Pizarra   #2E464F   Tinta     #18262A
Mar      #3A6B78   Cielo     #BFD3D8   Nieve     #F2F2EC   Sangre    #7A2418
```
- **Regla cromática:** los actos I–II (valle y meseta) van saturados de ocre y gris; el Nivel 10 es el único momento en que aparece **verde saturado** en pantalla. El color es la recompensa.
- Sprites de personaje: 16 × 24 px, 4 direcciones, 4 frames de caminata, 2 de idle.
- Sin contorno negro duro: contorno con el color oscuro de la propia paleta local (estilo *selective outline*).
- Tipografía: pixel font de 8 px con set completo de acentos españoles **y** de galés (`ŵ ŷ â ê î ô û`). Sin esto no se puede escribir "Cwm Hyfryd" ni "Y Wladfa".

## 10. Sonido

- **Sin música de combate.** Loop ambiental por bioma: viento (siempre), mar, río, fuego.
- Melodía principal: arreglo mínimo a una voz de himno galés tradicional de dominio público (`Ar Hyd y Nos`, `Calon Lân`), tocado con instrumento único.
- El **canto coral aparece solo tres veces** en toda la campaña: al enterrar a alguien, en el eisteddfod del Nivel 3 y en el epílogo. Es el recurso emocional más caro del juego; no se gasta.
- SFX prioritarios: pasos por superficie (arena, piedra, pasto, agua), viento por intensidad, caballos, herramienta, página del diario.

---

## 11. Progresión y economía

- **No hay niveles de experiencia ni estadísticas que suban por repetición.** La progresión es: *conocimiento* (mapa, idioma, códice), *vínculos* (grupo, facciones) y *equipo*.
- Los recursos **no escalan**: una ración de comida vale lo mismo en el Nivel 1 que en el 10. Lo que escala es cuánta gente depende de vos.
- Curva de dificultad: Nivel 1–3 tolerante (nadie muere), 4–8 severa (se puede perder gente), 9–10 resolución.

## 12. Condiciones de fin

- **No hay game over por muerte del jugador.** El juego no termina: termina *peor*.
- Estados de fracaso posibles: la colonia se disuelve y vuelve a Gales (final histórico alternativo real, estuvo cerca de pasar en 1867), la expedición abandona antes de la cordillera, el valle se pierde en el arbitraje de 1902.
- **Final canónico:** llegar al Cwm Hyfryd y fundar. Los finales se diferencian por *con quiénes* llegaste y *con qué identidad*.

---

## 13. Alcance de la v0.1 jugable (lo que va a la sesión de código)

**En alcance:**
- Nivel 1 completo y jugable de punta a punta.
- Sistemas: tiempo/turnos, recursos, carga, inventario, diálogo con idiomas, triggers, guardado.
- 1 tileset, 1 personaje jugable, 5 NPCs, 12 ítems.

**Fuera de alcance en la v0.1:**
- Construcción, trueque, cartografía, clima dinámico, caballada, toponimia, códice completo, audio final, soporte touch.
- Están diseñados en este documento para que el código de la v0.1 no los bloquee, no para implementarlos ahora.

---

## 14. Riesgos de diseño

| Riesgo | Mitigación |
|---|---|
| Un juego sin combate se vuelve una planilla | Cada sistema tiene una escena que se *mira*, no solo números: la zanja se cava en pantalla, el trueque se hace con objetos sobre una manta |
| El sistema de idiomas frustra en vez de intrigar | El Nivel 1 es 100 % en galés (idioma que el jugador domina). El primer `▓` aparece recién en el Nivel 2, ya con el juego entendido |
| El tema histórico se vuelve solemne y aburrido | Los NPCs discuten, se equivocan y tienen humor. La solemnidad se reserva para el Nivel 5 y el 9 |
| Representación de los pueblos originarios | Ver `docs/04-guia-historica.md`. Regla dura: ninguna facción indígena es hostil por diseño; toda hostilidad tiene causa explicada y anterior al jugador |

---

*Documento generado en preproducción · septiembre 2026 · v0.1*
