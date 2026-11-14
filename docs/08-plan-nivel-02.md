# Plan del Nivel 2 — «La travesía: del golfo al río»

> Documento de planificación, no spec cerrada. Lo que acá figura como **decisión a confirmar**
> o `TODO(historia)` no se implementa hasta que esté resuelto.
> Base: `00-GDD.md` §4-§6, `01-nivel-01.md`, `04-guia-historica.md`, y el estado real del
> código al cerrar el Nivel 1.

---

## 1. Qué es el nivel

| | |
|---|---|
| **Tramo** | De Punta Cuevas al río Chubut. 65 km a pie (`d_n1_anuncio_marcha`) |
| **Fecha** | Agosto de 1865, después del cierre del Nivel 1 (1-VIII-1865) |
| **Sistema nuevo** | **Marcha, ruta, extravío** (GDD §6). Uno solo, como pide la regla de estructura |
| **Duración** | 30 min (GDD §6) |
| **Pilar que defiende** | **P1 · La distancia es el enemigo.** Es el primer nivel donde caminar *cuesta* |
| **Qué aprende el jugador** | Que avanzar gasta agua y días, que orientarse es parte del juego y que el grupo va a su ritmo, no al tuyo |

En el Nivel 1 el reloj avanza solo cuando hacés algo. En el Nivel 2 **avanza con la distancia**:
cada tramo recorrido por la columna consume turno y agua. Esa es la única regla nueva; todo lo
demás (turnos, recursos, carga, fogón, diálogos, diario) ya existe.

---

## 2. Qué hereda del Nivel 1

El nivel arranca con el estado de salida (`exit.carryOver`: recursos, inventario, grupo, flags,
idiomas, diario, códice). Lo que el jugador decidió tiene que **notarse en la primera media hora**:

| Viene de | Efecto en el Nivel 2 | Fuente |
|---|---|---|
| Dejó **libros y biblias** | −moral la primera noche | `items.json` → `ifLeft` |
| Dejó **ropa de abrigo** | Enfermedad recurrente: alguien amanece con fiebre y la columna va más lenta | `items.json` |
| Dejó **harina y galleta** | Hambre: comida crítica desde la jornada 2 | `items.json` |
| Agua: 30 L (manantial) o 12 L (lo encontró Berwyn) | Margen de sed en el primer tramo | `n1_encontro_manantial` / `n1_agua_tardia` |
| Salud de Mari | Si viene baja, no puede sostener el ritmo: obliga a elegir entre apurar o esperar | `party.npc_mari.health` |
| Vínculos del fogón | Con vínculo, alguien se queda atrás con vos cuando te perdés («Nadie te espera cuando te quedás atrás», `01` §8) | `party.<npc>.bond` |
| Entrada firme en la cueva, tarea elegida, etc. | Solo líneas de diario y de diálogo. No inventar consecuencias nuevas | — |

Regla: **ninguna consecuencia nueva que no esté ya prometida en los datos del Nivel 1.**

---

## 3. Marco histórico

### Lo que ya está en los documentos del proyecto
- La marcha es de 65 km, del golfo al río (`d_n1_anuncio_marcha`, `d_n1_final`).
- 15-IX-1865: el comandante Julián Murga iza la bandera argentina y funda Trerawson (`04` §cronología). **Es el cierre natural del Nivel 2 o la apertura del 3.**
- Los tehuelches (aonikenk y gününa küne) habitaban el valle y la meseta; la relación fue de intercambio pacífico (`04` R1, ficha `cod_tehuelches`, que se desbloquea en este nivel).
- El primer texto con bloques `▓` (idioma que el jugador no domina) aparece recién acá (GDD §14).

### Resuelto (ver `04-guia-historica.md` §1.1, con fuentes)

- **Caminaron todos** (decisión del proyecto). Mari va en la columna.
- Salieron en **grupos de 15 a 20 con un par de caballos de carga**: la columna del jugador es uno de esos grupos, no las ciento cincuenta personas a la vez. Eso resuelve también *con qué iban* (no hace falta dibujar carros).
- Unos **55 km de estepa sin agua en unos dos días**.
- Llegaron a **un fuerte viejo abandonado** junto al río, de 1854. El nombre varía según la fuente (Caer Antur, «la vieja fortaleza», Fortín Viejo): el juego tiene que elegir uno.
- Casi sin agua ni comida al llegar; hubo muertes en esas semanas (sin detalle: no se dramatizan casos puntuales).

### Resuelto (noviembre 2026)

1. **Distancia y días: 65 km, «tres días si el viento afloja, cuatro si no»**, como anuncia Lewis en el Nivel 1. Se elige por coherencia entre niveles; la fuente (~55 km, ~2 días) queda declarada en la guía y en el Códice como lo documentado. En el prototipo: jugando bien se llega el tercer día, a lo seguro el cuarto.
2. **Nombre del fuerte:** el juego dice «el fuerte viejo», sin nombre propio (no importa para el nivel y las fuentes no coinciden).
3. **Tehuelches: sin encuentro en la marcha.** El trato empieza cuando la colonia ya está instalada. En la marcha la columna ve de lejos un campamento (humo y toldos) y cruza una rastrillada: tomarla rodea el arenal. Es dramatizado y se declara así en el Códice.
4. **Los accidentes del camino** (cañadón, bifurcación, cerro chato, arenal, viento) son inventados para el juego: suman decisiones, no afirman geografía.

Fuentes a revisar todavía: Abraham Matthews, *Crónica de la colonia galesa de la Patagonia*; Lewis Jones, *Una nueva Gales en Sudamérica*.

---

## 4. Diseño

### 4.1 Estructura: tres tramos, tres o cuatro jornadas

«Tres días si el viento afloja, cuatro si no» (Lewis, `am1`). Eso deja de ser una frase y pasa a ser
el sistema: **si marchás bien son tres jornadas; si te perdés o hay que esperar a alguien, cuatro**,
y la cuarta se paga con agua y comida.

| Jornada | Tramo | Beat | Qué enseña |
|---|---|---|---|
| **J1 Amanecer** | Salida de Punta Cuevas | Se arma la columna. Aparecen las consecuencias de la carga (lo que falta, quién tose). Lectura del cielo | Herencia del N1 |
| **J1 Mañana-Tarde** | **Tramo 1: la costa** | Tutorial de marcha: vos vas adelante, la columna te sigue. Caminar gasta turno y agua. Primer hito para orientarse | La regla nueva |
| **J1 Noche** | Fogón a cielo abierto | Primera noche sin cuevas: el viento apaga el fuego chico. Vínculos | Noche (ya conocida) |
| **J2 Amanecer** | — | **Elegís ruta**: por la costa (larga, segura, sin agua) o por la meseta (corta, con viento y sin referencias). Sin deshacer | Avanzar vs. sostener |
| **J2 Mañana-Tarde** | **Tramo 2: la meseta o la costa** | Sin sendero ni marcador. Si te salís del rumbo, **te perdés**: se pierde un turno y la columna espera. Las señales son el sol, el viento del oeste y los hitos | Extravío |
| **J2 Tarde** | — | Alguien no puede seguir (Mari si viene débil; si no, otro). Elegís: aflojar el paso (cuesta la cuarta jornada) o repartir su carga (te sobrecargás) | Decisión del nivel |
| **J2 Noche** | Fogón sin leña suficiente | Se quema algo de lo que se trajo, o se pasa frío. Depende de la carga del N1 | P2: todo se decide |
| **J3 Mañana** | **Tramo 3: la bajada al valle** | Señales de que hay gente: un campamento visto de lejos, una rastrillada. Ficha `cod_tehuelches`. Sin encuentro (§3, resuelto 3) | Códice, atmósfera |
| **J3 Tarde** | El río | **Primera vista del río Chubut.** El primer verde apagado del juego. Clímax | Pago emocional |
| **J3/J4 Noche** | Llegada | Cierre: primera línea con `▓` (ver decisión D3). Balance de salida y diario | Idiomas (anuncio, no sistema) |

### 4.2 La marcha (el sistema nuevo)

- **La columna.** El grupo (y los carros, si se confirman) te sigue por tu propio rastro, con retraso. Es la misma técnica que ya usa Dafydd al volver del manantial (`updateDafyddFollow`), generalizada.
- **El reloj es la distancia.** El tramo tiene un largo en tiles; cada cuarto recorrido **por la columna** (no por vos) gasta un turno y agua según el tamaño del grupo. Adelantarte a explorar es gratis; alejarte demasiado hace que la columna se detenga a esperarte.
- **El ritmo.** Tres pasos: *aflojar* (menos agua, más turnos), *normal*, *apurar* (menos turnos, baja la salud de los más débiles). Se elige al amanecer y se puede cambiar hablando con Lewis.
- **Orientarse sin marcadores** (GDD §8: ni minimapa ni flechas):
  - el **viento del oeste** es permanente (GDD §5.9): las briznas cruzan siempre de oeste a este. Es la brújula del nivel, y ya existe como efecto;
  - la **sombra** de los personajes apunta según el turno (la luz por turno ya existe);
  - **hitos**: cerros, un cañadón, una laguna seca. El personaje los comenta la primera vez («Ese cerro tiene que quedar a la derecha»), como ya hace con las pistas del Nivel 1.
- **Extravío, siempre suave (R7).** Salir del corredor del tramo no mata ni frena: el personaje dice que no reconoce nada, la columna espera, se pierde un turno y un poco de agua. Con vínculo, alguien sale a buscarte y el costo es menor. Perderse dos veces lleva a la cuarta jornada.
- **Aguadas.** Una por tramo, fuera del camino directo. Desviarse a buscarla cuesta distancia: la decisión de siempre entre avanzar y sostener.
- **Nada de esto es azar.** El viento, las aguadas y los hitos son fijos por partida. El jugador se pierde por no mirar, no por una tirada de dados.

### 4.3 Fracaso suave (R7 se mantiene)

| Situación | Respuesta |
|---|---|
| Te perdés | Un turno y agua. Nunca pantalla de derrota |
| Se acaba el agua | La columna entra en *sed*: va a paso lento y baja la salud. Se llega igual, peor |
| Nunca encontrás una aguada | Llegás al río en la cuarta jornada, con la salud baja. El río es agua: el nivel se cierra solo |
| Dejaste a alguien esperando | Llega después, y lo dice en el fogón |

### 4.4 Qué **no** entra (para no romper la regla de un sistema por nivel)

Caza, trueque, cartografía con registro de hitos, toponimia y el sistema de idiomas completo quedan
para sus niveles (GDD §6). Acá los hitos se *ven* y se *comentan*, no se registran.

---

## 5. Trabajo técnico

### 5.1 Deuda a pagar antes de empezar (el código hoy está atado al Nivel 1)

Medido sobre el código actual:

| Dónde | Problema | Qué hacer |
|---|---|---|
| `WorldScene.ts` (1.400 líneas, 48 referencias a `n1_…`, `npc_dafydd`, cajones, cuevas) | La escena del mundo *es* el Nivel 1 | Separar en `WorldScene` genérica + un **guion por nivel** (`src/levels/nivel01.ts`) con las interacciones propias: cajones, cuevas, Dafydd, tareas |
| `mapgen.ts` | Arma el mapa a partir de las seis zonas del Nivel 1 | Generador por nivel elegido por datos (`map.generator`). El del Nivel 2 es un corredor largo con hitos |
| `Registry.ts` | Carga a mano los JSON de `nivel-01` | Cargar diálogos, quests y nivel por id (`import.meta.glob`) |
| `JournalSystem.fill()` | Los reemplazos `{cueva}`, `{dejados}` son del Nivel 1 | Reemplazos declarados en los datos de cada quest |
| `TransitionScene` | Es la pantalla de «Continuará…» | Transición real: aplicar `exit.carryOver`, cambiar `progress.level` y arrancar el nivel siguiente |
| `SaveSystem` | Sin versión de partida | Campo `meta.version` + migración: las partidas del Nivel 1 tienen que poder continuar |
| `CampScene` | Fondo fijo de la cueva | Fondo por dato del trigger (fogón a cielo abierto) |
| `World3D` | Construye toda la malla del terreno de una vez (64×121 tiles) | Un corredor de ~48×320 tiles necesita malla **por franjas** que se arman y descartan según la cámara |

Esto no agrega nada visible, pero sin esto el Nivel 2 se escribiría copiando y pegando el 1.
**Condición de salida:** los 33 tests actuales siguen en verde y el Nivel 1 se juega igual.

### 5.2 Lo nuevo

| Pieza | Tipo | Notas |
|---|---|---|
| `MarchSystem` | sistema puro (R1), con tests | Progreso de la columna, ritmo, consumo por distancia, estado *perdido* / *sed*. Emite `march:progress`, `march:lost`, `march:arrived` |
| `data/levels/nivel-02.json` | datos | Tramos, corredor, hitos, aguadas, triggers, `goals`, `exit.computeGrade` |
| `data/dialogues/nivel-02.json`, `data/quests/nivel-02.json` | datos | Diario con variantes según la ruta y si hubo extravío |
| `balance.json` → `nivel02` | datos (R3) | Largo de cada tramo, agua por turno de marcha, costo del extravío, ritmos |
| Guion `src/levels/nivel02.ts` | código | Columna, hitos, aguadas, elección de ruta |
| Pantalla de **elección de ruta** | UI | Reutiliza el cartel de decisión, con un croquis dibujado a mano (no un minimapa: es lo que Lewis sabe, no dónde estás) |
| Indicador de marcha en el HUD | UI | Los rombos de turno ya existen; se agrega el avance del tramo como una línea fina |
| Tests | `flow` + `reach` para el Nivel 2 | Recorrido completo por las dos rutas, con y sin extravío; el corredor siempre tiene salida |

### 5.3 Arte que hace falta (prompts en `05`/`06`/`07`)

- **Ilustraciones (5):** la partida, la meseta al mediodía, alguien que no puede seguir, el fogón a cielo abierto, la primera vista del río.
- **Sprites:** dos o tres colonos genéricos para la columna (4 direcciones, como los actuales); los carros, si se confirman (`TODO(historia)` 3).
- **Terreno 3D:** laguna seca / salitral, cañadón de bajada, el río con sus sauces. Regla cromática del GDD §9: el verde saturado se reserva para el Nivel 10; acá el verde es apagado.
- **Sonido:** viento con más peso (ya existe), agua corriendo (nuevo, para el río), pasos sobre salitre.

---

## 6. Orden de trabajo

Cada paso deja algo verificable y el juego publicado sigue funcionando.

| # | Paso | Se verifica con |
|---|---|---|
| 0 | ~~Resolver los `TODO(historia)` abiertos~~ (hecho, §3) y las decisiones D1, D3-D5 | Guía histórica actualizada; este plan pasa a ser spec (`docs/09-nivel-02.md`) |
| 1 | Separar `WorldScene` genérica + guion del Nivel 1 | Tests en verde; el Nivel 1 se juega igual de punta a punta |
| 2 | `Registry`, diario y generador de mapa por nivel; versión de partida y migración | Una partida vieja del Nivel 1 continúa sin errores |
| 3 | Transición real entre niveles con `carryOver` | Al cerrar el Nivel 1 se entra a un Nivel 2 vacío con el estado correcto |
| 4 | Malla del terreno por franjas | Un corredor de 320 tiles a 60 cuadros por segundo en un celular |
| 5 | `MarchSystem` + tests | Tres tramos, ritmos, consumo y extravío probados sin navegador |
| 6 | Tramo 1 jugable: columna que sigue, reloj por distancia, primer hito | Se camina el primer tramo y cae la noche sola |
| 7 | Elección de ruta + Tramo 2 con extravío y aguada | Las dos rutas se terminan; perderse cuesta y no traba |
| 8 | Consecuencias de la carga del Nivel 1 + la decisión de la tarde del J2 | Cada bulto dejado cambia algo visible |
| 9 | Tramo 3, el río, cierre, diario y balance de salida | Nivel 2 completo de punta a punta |
| 10 | Arte final, sonido y pasada de pulido en celular | Partida completa N1 → N2 en un teléfono |

Los pasos 1 a 4 son base y no dependen de la investigación histórica: se pueden empezar ya.

**Hecho (noviembre 2026):**
- Paso 1, en parte: el paisaje, el barco anclado, los pájaros, el sonido por zona y lo que se junta salieron del código y son datos del nivel (`spawns.decor`, `ship`, `birds`, `gatherNodes[].prop/gain`, `zones[].ambience`); la pila y el fogón son opcionales. Quedan en `WorldScene` las mecánicas propias del Nivel 1 (cajones, cuevas, Dafydd), que no molestan a otro nivel porque solo actúan si sus datos existen.
- Paso 2: `Registry` carga todos los niveles de `data/levels`, `data/dialogues` y `data/quests` por nombre de archivo; el mapa sale del generador que pide `map.generator`; la partida guardada tiene versión (`0.2.0`) y migración.
- Paso 3: `stateForNextLevel` arma el estado del nivel siguiente según `exit.carryOver`, el diario guarda de qué nivel es cada entrada, y el cierre ofrece «Seguir viaje» en cuanto exista `data/levels/nivel-02.json`. Las escenas sueltan sus suscripciones al cerrarse y vuelven a cero al reiniciarse, así se pueden encadenar niveles sin recargar la página (probado encadenando el Nivel 1 consigo mismo).
- Pendiente: paso 4 (terreno por franjas), que conviene hacer con el mapa del Nivel 2 ya definido.
Los pasos 6 a 9 dependen del paso 0.

---

## 7. Decisiones a confirmar

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| **D1** | Orientación del mapa. La marcha va al sur, y en el Nivel 1 el norte está arriba | (a) sur arriba: se avanza hacia arriba de la pantalla, como en el Nivel 1 · (b) norte arriba: se avanza hacia abajo | **(a)**. En vertical, avanzar es subir; una línea de Lewis al salir lo aclara. El viento del oeste pasa a cruzar de derecha a izquierda |
| **D2** | Quién va en la columna | — | **Resuelto: caminaron todos.** La columna es uno de los grupos de 15 a 20 con caballos de carga; van el jugador, Mari, Lewis y los personajes del Nivel 1 |
| **D3** | Con quién es el primer `▓` | (a) castellano, al llegar al río · (b) aonikenk, una voz a lo lejos · (c) ninguno todavía | Depende de `TODO(historia)` 4 y 5. No inventar un encuentro que no ocurrió |
| **D4** | Cierre del nivel | (a) la llegada al río · (b) el 15-IX-1865, con Murga y la bandera | **(a)**, y el 15-IX abre el Nivel 3: es el arranque natural de «El valle» |
| **D5** | Mapa | (a) generado por datos · (b) dibujado en Tiled | **(a)**: el terreno 3D ya se arma desde una grilla y un corredor con hitos se describe bien con datos |

---

*Plan del Nivel 2 · v0.1 · noviembre 2026*
