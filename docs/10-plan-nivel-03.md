# Propuesta del Nivel 3 — «El valle»

> Documento de propuesta, no spec cerrada. Lo marcado **D#** es una decisión a tomar y lo marcado
> `TODO(historia)` no se implementa hasta resolverlo (CLAUDE.md). Base: `00-GDD.md` §5.10 y §6,
> `04-guia-historica.md` §1, lo que dejan prometido los Niveles 1 y 2 en sus datos, y lo aprendido
> armando la marcha (`08-plan-nivel-02.md`).

---

## 1. Qué es el nivel

| | |
|---|---|
| **Dónde** | El valle inferior del Chubut, alrededor de Caer Antur / Trerawson (hoy Rawson) |
| **Cuándo** | Del 15-IX-1865 a marzo de 1868 (ver D1) |
| **Sistema nuevo** | **Construcción** (GDD §5.10): ranchos, corrales y, sobre todo, **la zanja de riego**. Uno solo, como pide la regla de estructura |
| **Vista** | Mapa recorrible, HD-2D, como el Nivel 1 (`WorldScene` + `World3D`). El valle es el **hub** al que se vuelve en niveles posteriores |
| **Duración** | 60–75 min, en tres actos (el GDD dice 90; ver D7) |
| **Pilar que defiende** | **P2 · Nada se destruye, todo se decide** y **P4 · Historia real, no fantasía patagónica**: la colonia casi se va en 1867 y se queda por una zanja. El jugador no cambia eso; cambia **cómo** llega su familia a ese momento |
| **Qué aprende el jugador** | Que construir cuesta jornadas y materiales, que el agua hay que llevarla (pendiente, toma, compuerta), y que sin los tehuelches no se pasa el invierno |

### El arco en una línea
Llegan a un fuerte en ruinas → se funda un pueblo que no es suyo → la crecida se lleva lo construido →
el hambre y el trato con los tehuelches → la decisión de irse → una zanja abierta a mano lo cambia todo.

---

## 2. Qué hereda de los Niveles 1 y 2

Regla de siempre: **ninguna consecuencia nueva que no esté prometida en los datos**. Esto es lo que ya
está escrito y el Nivel 3 tiene que cumplir:

| Viene de | Promesa (texto de los datos) | Cómo se juega en el Nivel 3 |
|---|---|---|
| Dejaron **harina y galleta** (N1 playa o N2 estepa) | «Primera muerte posible en el Nivel 3» (`items.json`) | El invierno de 1866 con hambre: alguien del grupo se enferma con **dos jornadas de aviso** (GDD §5.4) y se puede evitar con comida del trato con los tehuelches. Quién: **D5** |
| Dejaron **herramientas de labranza** | «El riego del Nivel 3 cuesta 4 jornadas extra» | La zanja se cava a mano con lo que haya: +4 jornadas (dato en `balance.json`) |
| Dejaron **la semilla** | «Hay que comprar semilla en el Nivel 3, al precio de otros dos bultos» | Primera compra del juego (GDD §5.2: no hay compra hasta el Nivel 3): se paga con lo que valga dos bultos |
| Dejaron **clavos, hierro y sierra** | «Toda construcción va a la mitad de velocidad» | Multiplicador en la construcción |
| Dejaron **la imprenta** | «Sin periódico ni eisteddfod. Berwyn no te lo perdona» | *Y Brut* (enero de 1868) no sale; Berwyn pierde vínculo. El eisteddfod: ver D1 |
| Dejaron **el órgano** | «Matthews pierde vínculo. El coro del epílogo suena a una sola voz» | Vínculo con Matthews; el coro queda para el epílogo (N10) |
| Dejaron **la ropa de abrigo** | «Enfermedad recurrente desde el Nivel 2» | El primer invierno en el valle: tu madre (o quien sea) recae |
| Dejaron **los libros** | «−moral la primera noche del Nivel 2» | Ya cumplida; en el N3 solo diario |
| **Tu madre llegó enferma** (`n2_mari_enferma`) | — (flag del N2) | Arranca en cama: los primeros días hay que cuidarla (comida, abrigo, no dejarla sola) |
| **Consejo seguido** en la bifurcación (vínculo con Lewis o Edwyn) | vínculo | Quién te ayuda a levantar el primer rancho; quién te pide ayuda a vos |
| **Moral** y **balance de salida** del N2 | `exit.computeGrade` | Estado de arranque |

---

## 3. Marco histórico

### Documentado (agregado a `04-guia-historica.md` §1.3, con fuentes)
- **15-IX-1865**: el comandante **Julián Murga** iza la bandera argentina y funda **Trerawson**, por el ministro Guillermo Rawson.
- **1865**: una crecida se lleva las primeras casas de barro y lo sembrado (papa, maíz). Se rehacen mejor.
- **Lluvia mucho menor que la prometida**: las cosechas fallan.
- Los víveres, semillas y dinero del gobierno llegan **irregulares**, por la distancia y el mar.
- **8-XII-1865**: carta de un cacique al superintendente Jones (estudiada por Liliana Pérez). **Abril de 1866**: cuatro personas se acercan y arman un toldo junto al fuerte; se entienden por señas, un diccionario y lenguas mezcladas. Más tarde, en 1866, unos 80-90 tehuelches se instalan en la otra orilla.
- **Francisco**, sobrino de Casimiro Bigua, es el primer cacique que trata con la colonia (§1.2).
- **1866-67**: el trato (carne, cueros, caballos por pan, harina, yerba, tela) sostiene a la colonia; es desigual y hay miedo de los dos lados (§1.2).
- **1867**: falta comida y los colonos **deciden retirarse a Madryn**; los tehuelches se enojan porque pierden el comercio (artículo «De galeses y tehuelche», citando a Dumrauf). Algunos colonos habían pedido al gobierno británico que los mudara a **Malvinas** (sin fecha).
- **Noviembre de 1867**: **Aaron Jenkins** riega un campo de trigo abriendo un hueco en la orilla del río; la idea del riego sistemático se atribuye a **Rachel Jenkins**. **Marzo de 1868**: «una cosecha espléndida».
- **Enero de 1868**: sale *Y Brut*, el primer periódico de la colonia (seis números).

### `TODO(historia)` — a resolver antes del contenido
1. **Qué hizo Murga el 15-IX-1865 además de la bandera** (¿reparto de chacras?, ¿quién estaba?). Hoy solo tenemos la bandera y el nombre.
2. **Quiénes fueron los cuatro de abril de 1866**: ¿gente de Francisco? Las fuentes no lo dicen. Hasta saberlo, el juego no les pone nombre.
3. **El episodio de los ~80 «pampas» que rodearon una casa durante un oficio (1866)**: si entra, con causa explicada (R2) y sin convertirlo en amenaza gratuita. Recomiendo dejarlo afuera o como rumor.
4. **La retirada a Madryn de 1867**: cuántos, cuánto duró, por qué se volvió. Una sola fuente (secundaria).
5. **Muertes de esos años**: documentadas sin detalle (§1.1). No se dramatizan casos reales con nombre.

---

## 4. Diseño

### 4.1 Tres actos

| Acto | Cuándo | Qué pasa | Qué se juega |
|---|---|---|---|
| **I · La bandera y el barro** | IX-XII 1865 | Llegada a Caer Antur. Murga iza la bandera: discurso en **castellano** (primer `▓` del juego, ver D6). Se levanta el primer rancho. **La crecida** se lleva lo hecho | **Tutorial de construcción**: rancho de barro (pared, techo, puerta). Elegir **dónde**: cerca del río (agua, riesgo de crecida) o en la barda (seguro, lejos). La crecida castiga lo que se puso abajo, sin azar: el río marca hasta dónde llega |
| **II · El invierno** | IV-VIII 1866 | El hambre. Llegan cuatro personas y arman un toldo junto al fuerte. **El trato**: carne y cueros por pan, yerba y tela, sobre una manta (GDD: «el trueque se hace con objetos sobre una manta»), con señas (`▓` en aonikenk). La recaída por el frío | **Lo que cuesta sostener a la familia**: compartir pan con los que llegan o guardarlo; el trato justo o el que te conviene (vínculo y confianza, no plata). La enfermedad con aviso de dos jornadas |
| **III · La zanja** | 1867 → III-1868 | La cosecha vuelve a fallar. La colonia **decide irse a Madryn**. Rachel Jenkins tiene una idea; Aaron abre la orilla. Vos ayudás a cavar | **El sistema entero**: trazar la zanja desde la toma hasta las chacras con **pendiente** (el agua baja o no llega), la compuerta, y **no inundar al vecino** (GDD §5.10: confianza social). La zanja **se cava en pantalla**. Si llega el agua, la cosecha de marzo |

**Cierre (D1):** la cosecha de marzo de 1868 y *Y Brut* (o su ausencia, si quedó la imprenta). Opcional: una
viñeta «diez años después», Gaiman y el primer eisteddfod, con el coro.

### 4.2 Construcción (el sistema nuevo)
- **Piezas**: rancho (pared de barro, techo de junco, puerta), corral, **zanja** (tramos), **compuerta**, chacra (parcela a sembrar).
- **Reglas, todas con números en `balance.json`** (R3): cada pieza cuesta materiales y jornadas de trabajo; la zanja tiene que **bajar** desde la toma (alto del terreno por casilla); distancia máxima al río para la toma; el agua sigue la pendiente y, si un tramo queda más bajo que la chacra del vecino, **la inunda**.
- **Modificadores heredados**: sin hierro, la mitad de velocidad; sin labranza, +4 jornadas a la zanja.
- **Se mira, no se planilla** (GDD, tabla de riesgos: «la zanja se cava en pantalla»): poner piezas en el mundo 3D con una vista fantasma, y la zanja cavada pala a pala (minijuego corto, como apuntalar en el N1).
- `ConstructionSystem` puro, con tests: grilla, alturas, validez de un trazado, flujo del agua, inundación.

### 4.3 Decisiones con peso (lo aprendido en la marcha)
Cada una con un costo propio y **un test que verifique que cambia el resultado**:
- **Dónde va el rancho** (río o barda): agua cerca contra crecida.
- **Qué se rehace después de la crecida** primero: el techo de tu familia o el corral comunal (moral, vínculos).
- **El pan con los recién llegados**: compartir (confianza, comida) o guardar (comida, miedo).
- **El trato sobre la manta**: justo o conveniente (confianza; la confianza destraba información, no objetos, GDD §5.6).
- **La enfermedad**: quién cuida, con qué comida (aviso de dos jornadas).
- **En 1867, antes de la zanja**: empezar a empacar para Madryn o quedarse a ayudar a los Jenkins (vínculo, moral; la historia sigue igual).
- **El trazado de la zanja**: la ruta más corta (cruza la chacra de un vecino) o la larga (más jornadas).

### 4.4 Fracaso suave (R7)
Nada se pierde: la crecida se lleva el rancho y se rehace; el hambre degrada salud y moral; la zanja mal
trazada inunda y baja la confianza, pero se corrige. La colonia **se queda**, como en la historia; lo que
cambia es con qué llega tu familia al Nivel 4 (1885, veinte años después).

---

## 5. Trabajo técnico

| Pieza | Notas |
|---|---|
| `WorldScene` genérica | Deuda del plan del N2 (paso 1): hoy las mecánicas del N1 (cajones, cuevas, Dafydd) viven en la escena. Hay que pasarlas a un guion por nivel antes de sumar otro mapa |
| Generador de mapa `valle_chubut` | El río con meandros, la barda, el fuerte, chacras. Alturas por casilla (las usa la zanja) |
| `ConstructionSystem` + tests | Puro (R1). Grilla, piezas, costos, pendiente, flujo, inundación |
| Vista de construcción | Fantasma de la pieza en World3D, casillas válidas e inválidas, la zanja con agua que avanza |
| Minijuego de la zanja | Reutiliza el patrón del de apuntalar (N1) |
| Saltos de tiempo entre actos | Tarjeta con la fecha y una ilustración; el diario cuenta lo que pasó en el medio |
| `LanguageSystem` en pantalla | El `▓` (GDD §5.5): castellano con Murga, aonikenk en el toldo |
| Datos | `data/levels/nivel-03.json`, diálogos, quests con `journalThought`, balance `nivel03`, fichas del Códice (`cod_riego` ya existe; nuevas: Trerawson y Murga, *Y Brut*) |
| Tests | Recorrido de los tres actos, construcción, «ninguna decisión de adorno», herencia de N1 y N2 |

### Arte (prompts en un `11-arte-nivel-03.txt`)
Ilustraciones: la bandera de Murga, la crecida, el toldo junto al fuerte, la manta del trato, la decisión de
irse, Rachel y Aaron en la orilla, el agua entrando a la zanja, la cosecha. Modelos 3D por código: ranchos de
barro, corral, zanja, compuerta, trigo.

---

## 6. Decisiones a tomar

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| **D1** | **Fechas y lugares.** El GDD dice «Rawson, Gaiman, Dolavon, 1865-67» y pone el eisteddfod en este nivel, pero Gaiman y el primer eisteddfod son de 1874-75 y Dolavon es posterior (fecha a confirmar) | (a) 1865 → III-1868 en Trerawson, sin Gaiman ni Dolavon · (b) lo mismo + viñeta «diez años después» en Gaiman con el eisteddfod · (c) estirar el nivel hasta 1875 | **(b)**: el nivel es 1865-68 y el cierre salta a 1875 para pagar el coro y la imprenta |
| **D2** | **Vista** | (a) mapa recorrible como el N1 · (b) vista lateral como la marcha | **(a)**: construir pide grilla y mirar desde arriba |
| **D3** | **Alcance de la construcción** | (a) rancho + zanja · (b) + corral y compuerta · (c) + chacras con siembra y cosecha | **(b)** para el N3; la siembra queda en la cosecha de marzo como resultado, no como sistema |
| **D4** | **El trato con los tehuelches** (el trueque es el sistema del N7) | (a) escena guionada sobre la manta, con dos o tres decisiones · (b) un trueque chico ya con tabla de valores | **(a)**: anuncio del sistema, como el `▓`; el sistema completo en el N7 |
| **D5** | **«Primera muerte posible»** (si quedó la harina): quién | (a) tu madre · (b) alguien ficticio del grupo, con nombre · (c) se cambia la promesa: enfermedad grave, no muerte | Tuya: es la decisión más sensible del nivel. Siempre con dos jornadas de aviso y evitable |
| **D6** | **El primer `▓`** | (a) Murga en castellano (acto I) · (b) el toldo en aonikenk (acto II) · (c) los dos | **(c)**: dos lenguas que no se entienden, en el mismo nivel en que se funda el pueblo |
| **D7** | **Duración** | 90 min (GDD) · 60-75 | **60-75**: tres actos con saltos de tiempo |
| **D8** | **1867: la retirada a Madryn** | (a) se muestra como decisión de la colonia (el jugador no la cambia) · (b) se deja como mención en el diario | **(a)**, con la decisión personal de empacar o ayudar a los Jenkins |

### Decidido (noviembre 2026)
- **D1 → (b)**: el nivel va del 15-IX-1865 a la cosecha de marzo de 1868; el cierre salta «diez años después» a Gaiman, con el primer eisteddfod y el coro (ahí se pagan la imprenta y el órgano).
- **D3 → (b)**: rancho, corral, zanja y compuerta. La siembra y la cosecha son el resultado de la zanja, no un sistema.
- **D4 → (a)**: el trato en el toldo es una escena guionada sobre la manta, con señas y el `▓` en aonikenk; dos o tres decisiones que mueven confianza y vínculos.
- **D5 → (b)**: si quedó la harina, el que corre riesgo es **un personaje ficticio del grupo, con nombre** (a definir), con dos jornadas de aviso y evitable con comida del trato. Tu madre no muere en el Nivel 3.
- **D2, D6, D7, D8 → confirmadas**: mapa recorrible; el `▓` en castellano (Murga) y en aonikenk (el toldo); 60-75 min; la retirada a Madryn como decisión de la colonia, con la decisión personal de empacar o ayudar a los Jenkins.
- **Pendiente**: el nombre del personaje ficticio de D5.

---

## 7. Orden de trabajo

| # | Paso | Se verifica con |
|---|---|---|
| 0 | ~~Resolver D1-D8~~ (hecho). Quedan los `TODO(historia)` 1-5 | Este documento pasa a spec |
| 1 | ~~`WorldScene` genérica + guion del N1 aparte~~ (hecho: `src/levels/` con `LevelScript`, `WorldHost` y `Nivel01Script`) | El N1 se juega igual; tests en verde |
| 2 | ~~Generador `valle_chubut` con alturas~~ (hecho: `mapgen.ts` → `valleKind`, `valleHeight`, `valleyGrid`; `data/levels/nivel-03.json` en `draft`; `?nivel=nivel-03` en `npm run dev`) | Se camina el valle |
| 3 | ~~`ConstructionSystem` + tests~~ (hecho: `src/systems/ConstructionSystem.ts`, `tests/construction.test.ts`, balance `nivel03.construccion`) | Pendiente, flujo e inundación probados sin navegador |
| 4 | Acto I: llegada, bandera, rancho, crecida — **en buena parte hecho** (abajo) | Se construye y la crecida castiga lo que corresponde |
| 5 | Acto II: invierno, el toldo, la manta, la enfermedad | Las promesas del N1 (harina, abrigo) se cumplen |
| 6 | Acto III: la zanja y la cosecha | La zanja se traza, se cava y llega el agua (o inunda) |
| 7 | Cierre, diario, Códice, balance; encadenar con el N2 | Partida N1 → N2 → N3 de punta a punta |
| 8 | Arte, sonido, pasada en celular | En un teléfono |

---

## Estado del acto I (noviembre 2026)

Hecho, en `src/levels/nivel03.ts` y `data/*/nivel-03.json`:
- **La bandera**: Murga en castellano (`▓`: cada línea puede tener su idioma), Lewis traduce. Solo la bandera y el nombre Trerawson, lo documentado. Ficha `cod_trerawson`.
- **El rancho**: barro y junco en la orilla (materiales, vuelven al otro día); «Rancho acá» con vista previa verde o rojiza delante del jugador; cuesta materiales y turnos, más lejos del río más acarreo. Rancho de barro y junco en 3D.
- **La crecida** (día 3): se lleva lo construido abajo; la barda y las lomadas quedan. La pista: la marca de barro en las paredes del fuerte («Mirar»).
- **Rehacer**: el techo o el corral (si se perdió el rancho), el corral o ayudar (si quedó en pie).
- Diario con lo que pensó el personaje en cada paso.

Pendiente del acto I:
- **La comida**: con el consumo nocturno del Nivel 1 y lo que trae el Nivel 2, el grupo se queda sin comida en dos noches. Hay que decidir de dónde sale en el acto I (los víveres del gobierno llegaban irregulares, documentado en general).
- La bandera, visible en el mástil del fuerte después de la escena.
- El corral, construible (hoy la elección «el corral» solo deja el flag).

## Fuentes de esta propuesta
- MercoPress, «Welsh community mark 140 years in Patagonia» (30-VII-2005): Caer Antur; abril de 1866; los 80-90 tehuelches en la otra orilla; Aaron Jenkins en noviembre de 1867 y la cosecha de marzo.
- Wikipedia (en inglés), *Y Wladfa*: la crecida de 1865, las cosechas fallidas, el pedido de mudarse a Malvinas, Rachel Jenkins, *Y Brut* (enero de 1868).
- «De galeses y tehuelche. El pacto fundacional de una historia oficial chubutense»: Francisco, las raciones, la retirada a Madryn de 1867.
- Liliana Pérez (citada en la búsqueda; Dialnet): la carta del 8-XII-1865 de un cacique a Jones.

*Propuesta del Nivel 3 · v0.1 · noviembre 2026*
