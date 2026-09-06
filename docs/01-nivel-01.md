# Nivel 01 — «Las cuevas»
## Especificación completa de nivel · v0.1

> **Punta Cuevas, Golfo Nuevo. 28 al 31 de julio de 1865.**
> Nivel tutorial. Duración objetivo: **35–45 minutos**. Presupuesto: **3 jornadas × 4 turnos = 12 turnos**.

---

## 1. Objetivo del nivel

**Para el jugador:** sobrevivir tres noches en la playa y salir hacia el sur con el grupo entero.

**Para el diseño:** enseñar los cuatro sistemas base sin decir nunca la palabra "tutorial", y
cerrar con la primera **decisión irreversible** del juego (qué se abandona en la playa),
que el jugador va a seguir sintiendo diez horas después.

### Qué enseña, en orden
| # | Sistema | Se enseña en | Se comprueba en |
|---|---|---|---|
| 1 | Movimiento e interacción | T1 (playa) | Bajar los cajones |
| 2 | Turnos y jornada | T1 → T2 | El sol baja solo cuando actuás |
| 3 | Recursos y consumo nocturno | Noche J1 | La cena consume agua y raciones a la vista |
| 4 | Carga y peso | T2 (subir cajones) | Subir dos veces por ir sobrecargado |
| 5 | Diálogo y vínculo | T3 (fogón) | Elegir a quién escuchar |
| 6 | Exploración sin marcadores | J2 completa | Encontrar el manantial sin flecha |
| 7 | Decisión irreversible | J3 T1 | El reparto de carga |

---

## 2. Mapa

**Dimensiones:** 64 × 112 tiles (1024 × 1792 px) · tile 16 px · cámara **270 × 352 px** (~17 × 22 tiles).

El mapa es **vertical y se sube**. El jugador arranca abajo en la playa y todo el nivel es una
ascensión: playa → barranca → monte y meseta → cañadón. En 9:16 eso significa que el progreso
del nivel coincide con el eje natural de scroll del teléfono, y que la barranca se lee como lo que
es: una pared que hay que trepar.

```
   y 0    ┌───────────────────────────────┐   ↑ N
          │ Z5 CAÑADÓN SECO │ Z4 MESETA   │   viento del oeste →→→
          │ (agua · oculto) │ (vigía)     │
   y 40   ├─────────────────┼─────────────┤
          │ Z3 MONTE        │ Z2 BARRANCA │
          │ (leña · caza)   │ ★ LAS CUEVAS│   HUB · fogón · guardado
   y 70   ├─────────────────┴──────┬──────┤
          │                        │ Z6   │
          │                        │PUNTA │   mirador
   y 92   ├────────────────────────┴──────┤
          │   Z1 PLAYA  ·  SPAWN ▼        │   cajones · botes · el Mimosa
   y 112  └───────────────────────────────┘
              MAR ~~~~~~~~~~~~~~~~~~~
             x 0                      x 64
```

### 2.1 Zonas

| ID | Nombre | Tiles (x,y → w,h) | Rol |
|---|---|---|---|
| `z1_playa` | La playa | 6,92 → 44×18 | Spawn. Cajones, botes, el capitán. Tutorial de movimiento y carga |
| `z6_punta` | La punta | 48,70 → 15×26 | Mirador. Escena de apertura y de cierre. Sin recursos |
| `z2_barranca` | Las cuevas | 24,40 → 36×30 | **Hub.** Tres cuevas elegibles, el fogón, todos los NPCs, guardado |
| `z3_monte` | El monte | 2,44 → 21×34 | Leña (jarilla), rastro de guanaco, arbusto de fruto |
| `z4_meseta` | La meseta | 30,4 → 32×34 | Viento fuerte (−30 % velocidad). Punto de vigía. Vista del golfo |
| `z5_canadon` | El cañadón seco | 2,2 → 26×40 | **El manantial.** Sin señalizar. Solo se llega leyendo el terreno |

### 2.1.b Consecuencias de diseño del formato vertical

- **La cámara ve 17 tiles de ancho.** Ningún elemento importante puede estar a más de 8 tiles del centro horizontal de su zona, o el jugador no lo ve nunca.
- **El scroll vertical es el progreso.** La cámara sigue al jugador con `lerp` más suelto en Y (0.08) que en X (0.15): en vertical la sensación de subir importa más que la precisión lateral.
- **Los pasajes entre zonas son cuellos de botella verticales** de 3–5 tiles de ancho, para que la transición se lea como un cambio de acto.
- **Nada de contenido crítico en las 2 filas de tiles del borde superior o inferior del viewport:** quedan tapadas por el HUD y la franja de controles en las pantallas más altas que 9:16.

### 2.2 Capas del tilemap (Tiled → JSON)

```
0  ground          tile layer   terreno base, siempre pintado
1  ground_detail   tile layer   piedras, matas, marcas de agua
2  objects_low     tile layer   por debajo del jugador (cajones bajos, huellas)
3  collision       tile layer   invisible en runtime, property `collides: true`
4  objects_high    tile layer   por encima del jugador (borde superior de cueva, copas)
5  spawns          object layer  puntos de aparición: player, npc_*, item_*
6  triggers        object layer  áreas rectangulares con `trigger_id`
7  zones           object layer  polígonos de zona con `zone_id` (para clima y música)
```

**Convención de propiedades de objeto en Tiled:**
```
name       → id único, ej. "trig_primera_vista"
type       → "trigger" | "spawn" | "zone" | "interactable"
props:
  id            string   id lógico que busca el código
  once          bool     dispara una sola vez
  requires      string   id de flag necesaria, vacío = sin requisito
  turn_cost     int      turnos que consume, 0 = gratis
```

### 2.3 Terrenos y coste de movimiento

| Terreno | Tile set | Vel. | Notas |
|---|---|---|---|
| Arena seca | `beach_dry` | 0.85 | Sonido de paso propio |
| Arena húmeda | `beach_wet` | 1.00 | Marca huellas que se borran |
| Canto rodado | `pebble` | 0.75 | Ruidoso |
| Arcilla de barranca | `clay` | 0.90 | |
| Sendero pisado | `path` | 1.15 | Aparece solo donde el jugador caminó 3+ veces |
| Coirón / jarilla | `scrub` | 0.80 | Oculta ítems del suelo |
| Roca de meseta | `rock` | 0.95 | Con viento: 0.70 |

> **Detalle que vale mucho y cuesta poco:** el `path` que se dibuja solo. La huella del jugador es literalmente el título del juego.

---

## 3. Elenco del nivel

| ID | Personaje | Real / ficticio | Rol en el nivel | Ubicación |
|---|---|---|---|---|
| `pc` | **Idris / Elin Vaughan** | ficticio | Jugador | z1 → z2 |
| `npc_lewis` | **Lewis Jones** | real | El que prometió. Da los objetivos. Optimismo defensivo | z2 fogón |
| `npc_edwyn` | **Edwyn C. Roberts** | real | El que preparó los depósitos y falló. Culpa y competencia | z1 → z2 |
| `npc_matthews` | **Rev. Abraham Matthews** | real | Moral del grupo. Voz que sostiene | z2 fogón |
| `npc_berwyn` | **Richard Jones Berwyn** | real | Maestro y escribiente. Introduce el **Diario** y el **Códice** | z2 cueva 3 |
| `npc_pepperell` | **Cap. George Pepperell** | real | Capitán del *Mimosa*. Impone el límite de carga | z1 botes |
| `npc_mari` | **Mari Vaughan** | ficticia | Madre del PC. Enferma en J2. Vínculo emocional | z2 cueva 1 |
| `npc_dafydd` | **Dafydd**, 9 años | ficticio | Se pierde en J2. Es cómo se enseña a explorar | z2 → z5 |

> **Nota de escritura:** los seis personajes reales están dramatizados. Sus posturas siguen lo documentado
> (Roberts fue el responsable de una preparación insuficiente; Matthews era el capellán; Berwyn llevó
> los registros de la colonia), pero los diálogos son inventados. El Códice lo dice en cada ficha.

---

## 4. Estructura minuto a minuto

### JORNADA 1 — «Bajar» (≈15 min)

| Turno | Beat | Sistema | Duración |
|---|---|---|---|
| — | **Cold open.** Cámara sobre el mar, sin HUD. El PC en el bote. Voz en off de una carta: *"Nos dijeron que era verde."* | — | 40 s |
| **T1 Amanecer** | Pisás la playa. Control libre. El HUD aparece de a un elemento cuando lo necesitás | Movimiento | 3 min |
| T1 | **Pepperell** te para: hay que bajar los cajones antes de la marea. Levantás cajones → aparece la barra de **carga** | Carga | 4 min |
| **T2 Mañana** | Sobrecargarte hace el segundo viaje obligatorio. Nadie te reta: simplemente tardás más | Peso | 3 min |
| T2 | **Edwyn Roberts** aparece con la mala noticia: el depósito que él preparó tiene un tercio de lo prometido | Diálogo | 2 min |
| **T3 Tarde** | Subida a la barranca. Elegís **qué cueva ocupa tu familia** entre tres (mejor abrigo / más seca / más cerca del fogón). Decisión con consecuencia en J2 | Elección | 4 min |
| T3 | Cavar y apuntalar: minijuego simple de colocación de maderos | Construcción base | 3 min |
| **T4 Noche** | **Primer fogón.** El HUD muestra el consumo nocturno en vivo: −1 ración por persona, −2 L agua. Quedan **4 días de agua** | Recursos | 2 min |
| T4 | Rueda de diálogo en el fogón: Lewis, Matthews, Edwyn. Elegís a quién escuchar. Sube vínculo con uno | Vínculo | 3 min |
| T4 | **Autoguardado.** Entrada de diario escrita sola | Guardado | 20 s |

### JORNADA 2 — «Agua» (≈18 min)

| Turno | Beat | Sistema | Duración |
|---|---|---|---|
| **T1 Amanecer** | Lectura del cielo: viento en aumento. **Mari tose.** Objetivo del día: agua | Clima / salud | 2 min |
| T1 | Lewis reparte tareas. Elegís **una** de tres: buscar agua (meseta), juntar leña (monte), ayudar en las cuevas. Solo alcanza para una | Coste de oportunidad | 2 min |
| **T2 Mañana** | Exploración libre. **Sin marcador.** Las pistas son ambientales: matas verdes en fila, vuelo de palomas al amanecer, una huella de guanaco que baja al cañadón | Exploración | 6 min |
| T2 | Si vas a la meseta: viento fuerte, velocidad −30 %, se ve el *Mimosa* levando ancla desde el vigía. Momento de "ya no hay vuelta" | Atmósfera | 2 min |
| **T3 Tarde** | **Dafydd desapareció.** Todos paran. Lo buscás siguiendo huellas pequeñas en la arena hacia el cañadón | Rastros | 4 min |
| T3 | **Encontrás a Dafydd sentado al lado de un hilo de agua.** El chico encontró lo que los adultos no. Manantial desbloqueado: +30 L, renovable 8 L/jornada | **Clímax del nivel** | 2 min |
| **T4 Noche** | Segundo fogón. Si trajiste leña, el fuego es grande y Mari mejora. Si no, el fuego es chico y Mari empeora | Consecuencia | 3 min |
| T4 | Berwyn te da su libreta: se desbloquean **Diario** y **Códice**. Primera ficha: *El Mimosa* | Meta-sistemas | 2 min |

### JORNADA 3 — «Dejar» (≈12 min)

| Turno | Beat | Sistema | Duración |
|---|---|---|---|
| **T1 Amanecer** | Lewis anuncia la marcha al sur, 65 km a pie. Pepperell: **los carros llevan 5 bultos. Hay 8.** | Set-up | 2 min |
| **T1** | **LA DECISIÓN.** Pantalla dedicada. Elegís 5 de 8. Sin deshacer, sin confirmación doble, sin volver | **Núcleo del nivel** | 5 min |
| **T2 Mañana** | Se arma la caravana. Cada NPC comenta lo que dejaste. Nadie te felicita | Reacción | 2 min |
| **T3 Tarde** | Última subida a la punta (Z6). Mirás las cuevas vacías desde arriba. El *Mimosa* ya no está | Cierre | 2 min |
| **T4** | Fundido. Tarjeta: *«28 de julio – 1 de agosto de 1865. Ciento cincuenta personas caminaron sesenta y cinco kilómetros hasta el río.»* → Nivel 2 | Transición | 1 min |

---

## 5. La decisión de carga (J3 T1)

Ocho bultos, capacidad para cinco. **Esta es la pantalla más importante del nivel.**

| Bulto | Peso | Si lo llevás | Si lo dejás |
|---|---|---|---|
| **Harina y galleta** (200 kg) | 3 | +12 raciones al Nivel 2 | Hambre en N2, primera muerte posible en N3 |
| **Herramientas de labranza** (140 kg) | 3 | Habilita el riego en N3 sin penalidad | El riego del N3 cuesta 4 jornadas extra |
| **La imprenta** (90 kg) | 2 | Desbloquea periódico, eisteddfod y +moral en N3 | Se pierde el hilo cultural. Berwyn no te lo perdona |
| **Semilla de trigo** (60 kg) | 1 | Cosecha de N3 posible | Hay que comprar semilla, cuesta 2 bultos de otra cosa |
| **Órgano de la capilla** (110 kg) | 2 | +moral permanente, habilita las escenas de canto | Matthews pierde vínculo. El coro del epílogo suena a una sola voz |
| **Ropa de abrigo** (70 kg) | 2 | Sin penalidad de frío hasta N6 | Enfermedad recurrente desde N2 |
| **Clavos, hierro y sierra** (95 kg) | 2 | Construcción de ranchos y carros en N3 | Todo se construye a la mitad de velocidad |
| **Libros y biblias** (55 kg) | 1 | +vínculo con Matthews y Berwyn, sube `cym` a nivel 3 | −moral general la primera noche del N2 |

**Reglas de la pantalla:**
- La capacidad es **5 bultos**, no 5 pesos. El "peso" de la tabla es solo la etiqueta que ve el jugador.
- No hay opción óptima. Cada set de 5 abre y cierra cosas distintas.
- **Sin confirmación doble.** Se elige, se cierra, se sigue. La brutalidad es el punto.
- El resultado se guarda como `flags.n1_carga = [ids]` y lo lee toda la campaña.

---

## 6. Triggers del nivel

| ID | Zona | Tipo | Dispara | Una vez | Turnos |
|---|---|---|---|---|---|
| `trig_desembarco` | z1 | cutscene | Al spawnear | ✔ | 0 |
| `trig_pepperell_cajones` | z1 | dialogue | Entrar al radio de los botes | ✔ | 0 |
| `trig_carga_primera` | z1 | tutorial | Primer `pickup` de cajón | ✔ | 0 |
| `trig_sobrecarga` | z1 | tutorial | `carga > capacidad` | ✔ | 0 |
| `trig_edwyn_deposito` | z1 | dialogue | `cajones_bajados >= 6` | ✔ | 1 |
| `trig_subida_barranca` | z2 | zone | Entrar a z2 por primera vez | ✔ | 0 |
| `trig_eleccion_cueva` | z2 | choice | Interactuar con cueva 1, 2 o 3 | ✔ | 1 |
| `trig_apuntalar` | z2 | minigame | Tras elegir cueva | ✔ | 1 |
| `trig_fogon_j1` | z2 | scene | `turno == noche && jornada == 1` | ✔ | 1 |
| `trig_amanecer_j2` | z2 | scene | `jornada == 2 && turno == amanecer` | ✔ | 0 |
| `trig_reparto_tareas` | z2 | choice | Tras `trig_amanecer_j2` | ✔ | 0 |
| `trig_viento_meseta` | z4 | modifier | Entrar a z4 | ✘ | 0 |
| `trig_vigia_mimosa` | z4 | cutscene | Llegar al punto de vigía en J2 | ✔ | 0 |
| `trig_pista_palomas` | z4/z5 | ambient | Estar en z4 o z5 al amanecer | ✘ | 0 |
| `trig_dafydd_perdido` | z2 | scene | `jornada == 2 && turno == tarde` | ✔ | 0 |
| `trig_huellas_dafydd` | z3 | trail | Interactuar con huella pequeña | ✘ | 0 |
| `trig_manantial` | z5 | **key** | Llegar al fondo del cañadón | ✔ | 1 |
| `trig_lena_jarilla` | z3 | gather | Interactuar con mata de jarilla | ✘ | 0 |
| `trig_fogon_j2` | z2 | scene | `turno == noche && jornada == 2` | ✔ | 1 |
| `trig_berwyn_libreta` | z2 | unlock | Tras `trig_fogon_j2` | ✔ | 0 |
| `trig_anuncio_marcha` | z2 | scene | `jornada == 3 && turno == amanecer` | ✔ | 0 |
| `trig_pantalla_carga` | z2 | **decision** | Tras `trig_anuncio_marcha` | ✔ | 1 |
| `trig_reacciones_carga` | z2 | dialogue | Tras `trig_pantalla_carga` | ✔ | 1 |
| `trig_punta_final` | z6 | cutscene | Entrar a z6 en J3 | ✔ | 1 |

---

## 7. Balance del nivel

### Estado inicial
```
agua        18 L        (grupo de 9 en escena · consumo 2 L/noche/grupo)
comida      14 raciones
leña         2 haces
materiales   0
munición     6 tiros     (no se usan en N1: se muestran para que existan)
carga PC    12 / 20 kg
```

### Consumo nocturno
```
Noche J1:  −3 raciones  −2 L agua  −1 haz leña
Noche J2:  −3 raciones  −2 L agua  −1 haz leña   (−2 si hace frío y no juntaste)
Noche J3:  no hay: se parte al mediodía
```

### Ganancias posibles
```
Manantial (z5)          +30 L, renovable  ← objetivo real del nivel
Jarilla (z3, 6 matas)   +1 haz c/u, máx 6
Fruto de molle (z3)     +2 raciones, 1 sola vez
Mejillones (z1, marea)  +3 raciones, solo J2 T2
Depósito de Roberts     +5 raciones  ← automático, guionado
```

### Umbrales de salida (lo que se lleva al Nivel 2)
| Métrica | Bueno | Aceptable | Malo |
|---|---|---|---|
| Agua | ≥ 24 L | 12–23 L | < 12 L |
| Comida | ≥ 12 raciones | 6–11 | < 6 |
| Salud de Mari | ≥ 70 | 40–69 | < 40 → cae enferma en N2 |
| Moral del grupo | ≥ 60 | 35–59 | < 35 → un NPC habla de volverse |
| Vínculos | ≥ 1 en nivel 2 | 1 en nivel 1 | ninguno |

> **Nadie muere en el Nivel 1.** Es la única promesa que el juego hace y después rompe.

---

## 8. Estados de fracaso suave

El nivel no se puede perder. Puede salir mal, que es distinto.

| Situación | Respuesta del juego |
|---|---|
| No encontrás el manantial en J2 | Berwyn lo encuentra en la noche J2. Ganás **12 L** en vez de 30, y se ve que otro hizo tu trabajo |
| No juntaste leña | El fuego de la noche J2 es chico. Mari baja a 45. El sprite del fuego es visiblemente más chico |
| Nunca hablaste en el fogón | Empezás el Nivel 2 sin ningún vínculo. Nadie te espera cuando te quedás atrás |
| Te quedaste en la playa todo el nivel | A las 3 jornadas el juego avanza igual, con el peor estado de salida. No hay pantalla de derrota |

---

## 9. Guion de referencia — tres escenas clave

Los diálogos completos, con ramas e ids, están en `data/dialogues/nivel-01.json`.
Acá van las tres que definen el tono.

### 9.1 Edwyn Roberts, el depósito (J1 T2)

> **EDWYN.** Hay treinta bolsas.
> **PC.** ¿Treinta? Dijiste doscientas.
> **EDWYN.** Dije que iba a haber doscientas. Es distinto. *(pausa)* No me mires así, mirá el mar. De ahí venía el resto.
> **PC.** ¿Y ahora?
> **EDWYN.** Ahora contamos las treinta y no las contamos en voz alta delante de nadie.

*(Opción de respuesta: [Culparlo] · [Ayudarlo a contar] · [Callarse]. La segunda sube vínculo +1
y desbloquea que Edwyn te avise de la aguada en el Nivel 2.)*

### 9.2 El manantial (J2 T3) — sin diálogo

> Dafydd está sentado en el fondo del cañadón, con los pies en un hilo de agua de dos dedos de ancho.
> No dice nada. Señala.
> **Sin música.** Solo el viento, que acá abajo no llega, y el agua.
> El HUD muestra `+30 L` durante dos segundos y se apaga.

*(Regla: no hay diálogo, no hay logro, no hay fanfarria. El silencio es la recompensa.)*

### 9.3 El reparto (J3 T1)

> **LEWIS.** Cinco bultos por carro. Hay ocho.
> **MATTHEWS.** El órgano pesa lo que pesan cuatro personas.
> **BERWYN.** La imprenta también. Y sin ella en un año nadie se acuerda de por qué vinimos.
> **PEPPERELL.** Yo vuelvo a Liverpool con lo que dejen. Si quieren, se los guardo. *(no lo va a guardar)*
> **LEWIS.** *(al PC)* Elegí vos. Yo ya elegí bastante y miren dónde estamos.

---

## 10. Checklist de implementación del Nivel 1

```
[ ] Tilemap nivel-01.tmj exportado desde Tiled con las 8 capas
[ ] Tileset punta-cuevas.png (128 tiles) + json de propiedades
[ ] Sprite PC 16×24, 4 dir × 4 frames caminata + 2 idle
[ ] 6 sprites NPC + 8 retratos de diálogo 48×48
[ ] TimeSystem: 4 turnos, avance por acción, evento onTurnChange
[ ] ResourceSystem: 6 recursos, consumo nocturno, clamp a 0
[ ] InventorySystem + carga por peso, penalidad de velocidad
[ ] DialogueSystem: nodos, ramas, condiciones por flag, vínculo
[ ] TriggerSystem: lee object layer, respeta once/requires/turn_cost
[ ] Escena CargaDecision (pantalla dedicada, 8 bultos, elegir 5)
[ ] Escena Fogon (rueda de diálogo nocturna)
[ ] SaveSystem: localStorage, un solo slot, autoguardado en noche
[ ] HUD progresivo: elementos aparecen cuando el sistema se usa por primera vez
[ ] Sendero emergente: contador de pisadas por tile → cambia a tile `path`
[ ] Diario: generación automática de entrada al cerrar jornada
[ ] Códice con 4 fichas: Mimosa · Punta Cuevas · Michael D. Jones · Los tehuelches
```

---

*Spec de nivel · v0.1 · septiembre 2026*
