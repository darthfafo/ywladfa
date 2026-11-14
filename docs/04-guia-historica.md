# Guía histórica y de representación
## Marco documental del proyecto · v0.1

Este documento hace dos cosas: **fija los hechos** que el juego usa como base, y **fija las reglas
de representación** que el equipo se compromete a respetar. La segunda parte no es opcional.

---

## 1. Cronología de referencia

| Fecha | Hecho |
|---|---|
| 1863 | Lewis Jones y Love Jones-Parry exploran el Golfo Nuevo. Le ponen **Madryn** por la estancia galesa de Jones-Parry |
| 28-V-1865 | El **Mimosa** zarpa de Liverpool con ~150 colonos (fuentes: 153 a 162) |
| 28-VII-1865 | **Desembarco en Punta Cuevas**. Refugio en cuevas, sin agua dulce cerca |
| VIII-IX-1865 | **La marcha al río.** Los colonos salen de la bahía en grupos de 15 a 20, con un par de caballos de carga, y cruzan unos 55 km de estepa sin agua en unos dos días. Llegan a un fuerte viejo abandonado junto al río. Para fines de septiembre están todos instalados ahí (ver §1.1) |
| 15-IX-1865 | El comandante **Julián Murga** iza la bandera argentina y funda **Trerawson** (Rawson) |
| 1866-67 | Hambruna. Trueque sostenido con los tehuelches: pan, harina, yerba y tela por carne y cuero |
| ~1867 | **Aaron y Rachel Jenkins** abren la primera zanja de riego desde el río Chubut |
| 1874-75 | Se funda **Gaiman**. Primer **eisteddfod** del valle |
| 1879-85 | **Conquista del Desierto**: el Ejército ocupa la Patagonia norte y central |
| 4-III-1884 | **Emboscada del Valle de los Mártires**. Mueren John Hughes, John Parry y Richard Davies. **John Daniel Evans** escapa a caballo (**Malacara**) |
| 16-X-1884 | Ley de Territorios Nacionales. **Luis Jorge Fontana** asume como gobernador del Chubut |
| X-1885 | Parten los **Rifleros del Chubut** desde Rawson: 28-30 hombres, 260 caballos, 30 Remington |
| 25-XI-1885 | Avistan el **Cwm Hyfryd** desde la Sierra Colorada. Fontana lo bautiza **Valle 16 de Octubre** |
| II-1886 | Regreso a Rawson por lagos Fontana, Musters y Colhué Huapi. Circuito de ~1.200 km. Primer mapa oficial del Chubut |
| 1886-88 | Una legua cuadrada por riflero. Se funda **Trelew**; llega el ferrocarril a Madryn. Desde 1888 se puebla el Valle 16 de Octubre |
| 30-IV-1902 | **Plebiscito** en la Escuela N.º 18 de Río Corintos ante el árbitro Thomas Holdich: los colonos votan ser argentinos |
| 1909 | Muere **Malacara** a los 31 años. Evans lo entierra en Trevelin con lápida |
| ~1918 | Evans levanta su molino harinero. Alrededor se consolida **Trevelin** — *tre* (pueblo) + *felin* (molino) |

### Cifras que varían según la fuente
Elegir una versión y sostenerla en todo el juego. Las adoptadas por este proyecto van en **negrita**.

| Dato | Rango en fuentes | Adoptado |
|---|---|---|
| Colonos del Mimosa | 153 / 155 / 162 | **~150** |
| Rifleros | 28 / 29 / 30 | **28 jinetes, 30 hombres con apoyo** |
| Circuito de la expedición | 750 km (ida) / 1.200 km (circuito) | **~750 km a Trevelin, ~1.200 km el circuito completo** |
| Profundidad del salto del Malacara | 3 a 5 m; algunas fuentes lo discuten como leyenda | **~4 m, declarado como discutido en el Códice** |
| Distancia de la marcha al río | ~55 km (MercoPress) / 65 km (Nivel 1) | **65 km** en el juego, por coherencia entre niveles; el Códice declara los ~55 km de la fuente — ver §1.1 |
| Duración de la marcha | ~2 días (MercoPress) / «tres días si el viento afloja, cuatro si no» (Lewis, Nivel 1) | **tres o cuatro días** en el juego, según cómo se juegue; el Códice declara los ~2 días de la fuente — ver §1.1 |

### 1.1 La marcha del golfo al río (base del Nivel 2)

| Hecho | Estado | Fuente |
|---|---|---|
| Caminaron todos: el contingente entero hizo la marcha por tierra | **Adoptado** (decisión del proyecto, noviembre 2026) | — |
| Salieron en grupos de 15 a 20 personas, con un par de caballos de carga cada uno | Documentado | MercoPress, 30-VII-2005 |
| Unos 55 km de estepa sin agua, en unos dos días | Documentado (una fuente) | MercoPress, 30-VII-2005 |
| Llegaron a las ruinas del **Fuerte Paz**, de 1854: una fortificación de barro y zanjas a orillas del río, dentro de lo que hoy es Rawson. Los galeses la llamaron **Caer Antur** («fuerte aventura») o Fuerte Viejo, y fue el refugio desde el que se fundó Rawson | Documentado. Otros nombres: *Yr Hen Amddiffynfa*, «la vieja fortaleza» (Wikipedia en inglés, que advierte que Caer Antur sería otro lugar), «Fortín Viejo» (CONICET). **El juego usa Fuerte Paz / Caer Antur / el fuerte viejo** (decisión del proyecto, noviembre 2026) | MercoPress; Wikipedia *Y Wladfa*; CONICET; aporte del proyecto |
| Para fines de septiembre de 1865 estaban todos instalados ahí | Documentado | MercoPress; CONICET |
| «Casi sin agua y comida, estuvieron por bajar los brazos cuando alcanzaron el río» | Documentado (prensa) | Infobae, 28-VII-2020 |
| Hubo muertes en esas semanas | Documentado sin detalle | Wikipedia *Y Wladfa* |
| La mayoría de las mujeres y los chicos fue semanas después por mar | Una sola fuente, sin nombrar el barco. **Descartado para el juego** por la decisión de arriba | La Nación |

**Decisiones del proyecto (noviembre 2026):**

- **65 km en tres o cuatro días**, lo que ya dicen `d_n1_anuncio_marcha` y `d_n1_final`. Es dramatizado frente a
  la fuente (~55 km, ~2 días) y la ficha del Códice de la marcha lo tiene que declarar en *dramatized*.
- **El fuerte:** las ruinas del Fuerte Paz (1854), de barro y zanjas. Los colonos le dicen «el fuerte viejo» y «Caer Antur».
- **Sin encuentro con los tehuelches durante la marcha.** El trato empieza con la colonia ya instalada: el primero
  en llegar fue Francisco, sobrino de Casimiro Bigua, cuya gente ocupaba las márgenes del Chubut (§1.2). En la marcha
  solo se ve de lejos un campamento (humo y toldos) y se cruza una rastrillada, que se puede seguir para rodear un
  arenal. Nada de eso está documentado para esta marcha: es dramatizado y se declara. Lo que sí es general y
  conocido es que las rastrilladas eran sendas marcadas por el paso repetido de gente y caballos.
- **Los accidentes del camino** (cañadón, bifurcación, cerro, arenal, viento) son inventados para el juego.

### 1.2 Galeses y tehuelches: conveniencia recíproca, no solo convivencia pacífica

Base: *De galeses y tehuelche. El pacto fundacional de la historia oficial chubutense* (ver §5), que discute el
modelo de «convivencia pacífica» (Gavirati) y propone hablar de **conveniencia recíproca**. Lo que el juego toma:

| Hecho | Estado | Fuente citada en el artículo |
|---|---|---|
| El Estado buscó acuerdos con los caciques del sur para que reconocieran su autoridad y no agredieran a la colonia. Casimiro Bigua, reconocido por Mitre en 1864; tratado firmado en 1866; raciones (ganado, yerba, azúcar, harina, tabaco, ropa) desde 1865, retiradas en Carmen de Patagones | Documentado | Dumrauf, *El último malón*; Coronato |
| Francisco, sobrino de Casimiro, fue el primer cacique en tener contacto con la colonia; su gente ocupaba las márgenes del Chubut | Documentado | Ídem |
| Los colonos sabían que ocupaban tierras ajenas, tenían miedo y dependían de esa amistad; estaban armados desde la llegada y Edwin Roberts les daba instrucción militar | Documentado (Matthews: «por el miedo que les teníamos, a causa de encontrarnos del todo indefensos») | Matthews, *Crónica*; Dumrauf |
| El intercambio (carne, cueros, plumas, caballos por pan, harina, yerba, tela) salvó a la colonia en los años malos, pero fue desigual: en 1866 «era posible comprar un caballo por unos pocos panes» | Documentado | Matthews; Gavirati |
| En 1865 Reuque, Sayhueque y Namuncurá se quedaron con unos 500 vacunos enviados desde Patagones a los colonos. Hubo robos de ganado y ataques a la colonia en 1871-1873, cuando Sarmiento cortó las raciones | Documentado | Carta de Williams Jones (1865); Dumrauf |
| Chiquichano le dijo a Musters que los colonos eran «intrusos en su territorio» | Documentado | Musters, *Vida entre los patagones* |

**Consecuencias para el juego:**
- La relación se muestra como **mutua conveniencia con miedo de por medio**, no como amistad natural. Sin
  hostilidad gratuita de nadie (R2): cuando hay tensión, se muestra su causa (raciones cortadas, tierra ajena, ganado).
- En la marcha, los colonos ven de lejos y tienen miedo (Edwyn: «Que nadie se aparte de la columna»); Lewis dice
  que la tierra es de ellos. Nada más: el contacto es del nivel siguiente.
- El artículo critica la tesis de la «araucanización» (tehuelches «autóctonos» frente a mapuches «extranjeros»).
  La regla R1 distingue pueblos; **no** presenta a los mapuches como invasores ni foráneos.

`TODO(historia)`: el artículo, sobre la muerte de los cuatro colonos en 1884, menciona que se les había advertido
de la actitud «belicosa de los tehuelche» y que la última batalla fue contra la gente de Foyel e Inacayal. R1
atribuye la emboscada a gente de Foyel (mapuche). Revisar con más fuentes antes del Nivel 5.

---

## 2. Toponimia y etimología

| Nombre | Origen | Significado |
|---|---|---|
| **Y Wladfa** | galés | "La Colonia" |
| **Cwm Hyfryd** | galés | "Valle hermoso" |
| **Trevelin** | galés | *tre* + *felin* = "pueblo del molino" |
| **Trelew** | galés | "Pueblo de Lew", por Lewis Jones |
| **Dolavon** | galés | *dôl* + *afon* = "vega junto al río" |
| **Gaiman** | tehuelche | "punta de piedra" |
| **Chubut / Chupat** | tehuelche | del río de curso sinuoso: "transparente" o "tortuoso" según la fuente |
| **Puerto Madryn** | galés (topónimo trasplantado) | por la estancia Madryn de Love Jones-Parry |
| **Rawson** | castellano | por Guillermo Rawson, ministro del Interior |

**Pronunciación galesa mínima para el equipo de audio y guion:**
`w` = u · `y` = i corta · `f` = v · `ff` = f · `dd` = z inglesa · `ll` = sonido lateral sordo, sin equivalente en español.
Así, *Cwm Hyfryd* ≈ "kum HÚV-rid" y *Trevelin* ≈ "tre-VE-lin".

---

## 3. Reglas de representación

Estas cinco reglas son vinculantes para guion, arte y código.

### R1 · Tehuelche ≠ mapuche
Son pueblos distintos y el juego los distingue siempre, en el guion y en el arte.
Los aliados históricos de la colonia en el valle fueron mayormente **tehuelches** (aonikenk y gününa küne).
El grupo de la emboscada de 1884 era **mapuche**, del cacique **Foyel**.
Confundirlos es el error más común sobre este tema y el juego no lo comete.

### R2 · Ninguna facción indígena es hostil por diseño
Toda hostilidad en el juego tiene **causa explicada y anterior al jugador**, y esa causa se puede
consultar en el Códice desde antes de que ocurra el hecho. En 1884, los guerreros de Foyel
sospechaban que los cuatro galeses eran espías del Ejército, en medio de una guerra en curso
contra ese Ejército. Esa razón se muestra.

### R3 · Las dos verdades a la vez
El juego sostiene simultáneamente que:
- la relación galés-tehuelche fue un caso real y poco frecuente de convivencia pacífica y de intercambio genuino; **y**
- los colonos se instalaron en territorio indígena y se beneficiaron materialmente de la campaña militar que lo despejó.

No se resuelve la tensión eligiendo una. Se muestran las dos.

### R4 · Documentado vs. dramatizado, siempre declarado
Toda ficha del Códice tiene los dos campos y los dos son obligatorios (lo fuerza
`data/schemas/codex.schema.json`). Si no hay nada dramatizado, el campo dice "Nada."
Esto es lo que permite usar el juego en aula sin advertencias externas.

### R5 · Los personajes reales no son avatares del jugador
El personaje jugable es **ficticio**. Lewis Jones, Fontana, Evans, los Jenkins, Matthews y Berwyn
son NPCs con diálogo dramatizado, declarado como tal. El jugador acompaña la historia; no la reemplaza
ni la reescribe. Ningún personaje histórico real dice en el juego algo que contradiga lo documentado
sobre su posición.

---

## 4. Sensibilidades locales

- **El Valle de los Mártires es un lugar real con nombre en uso**, y hay descendientes de todas las
  partes viviendo hoy en Chubut. La escena del Nivel 5 se trata como tragedia, nunca como set piece de acción.
- **El plebiscito de 1902 sigue siendo identitario** en la comarca andina. El juego lo presenta como
  una decisión con razones de ambos lados, no como una obviedad patriótica.
- **La palabra "colonización"** se usa en el juego con su carga completa, no como sinónimo neutro de "poblamiento".
- **Consulta recomendada antes de publicar:** Museo Regional de Puerto Madryn, Museo Cartref Taid
  y el Molino Viejo (Trevelin), Asociación Galesa de Puerto Madryn, y referentes de las comunidades
  tehuelche y mapuche-tehuelche de Chubut. Nada de esto es requisito legal; es lo que hace que el juego
  se defienda solo.

---

## 5. Fuentes usadas en preproducción

- *Rifleros del Chubut* — Wikipedia en español (composición, ruta y cronología de la expedición)
- *Colonización galesa en Argentina* — Wikipedia en español
- *Malacara (caballo)* — Wikipedia en español (expedición de 1883-84 y el salto)
- Infobae, «Galeses en la Patagonia: la lucha por sobrevivir, la matanza del Valle de los Mártires y su deseo de ser argentinos» (28-VII-2022)
- Galeses en Patagonia — «Rifleros de Fontana» (Cwm Hyfryd, 25 de noviembre, cabalgata conmemorativa)
- Canal 12 Web — «Un viaje a caballo desde Rawson a Trevelin»
- Asociación Galesa de Puerto Madryn — sección Historia
- SciELO Argentina — «Amigos, pero intrusos: los caciquillos del Chupat y sus negociaciones con el gobierno y la colonia galesa antes de la conquista (1865-1883)»

- *De galeses y tehuelche. El pacto fundacional de la historia oficial chubutense* (artículo; fuentes: Dumrauf, *El último malón*; Matthews, *Crónica de la colonia galesa*; Musters; Coronato, *Patagonia 1865*) — conveniencia recíproca, tratados y raciones, primer contacto (§1.2)
- MercoPress, «Welsh community mark 140 years in Patagonia» (30-VII-2005) — la marcha: grupos, distancia, días, el fuerte viejo
- Wikipedia en inglés, *Y Wladfa* — la marcha, «la vieja fortaleza», el nombre Caer Antur
- CONICET, «La colonización galesa del Chubut y la necesidad de un puerto» — el contingente reunido en el «Fortín Viejo» a fines de septiembre de 1865
- Infobae, «A 155 años de la llegada de los primeros galeses a la Patagonia» (28-VII-2020)
- La Nación, «Desde Gales hasta la Patagonia» — versión de que mujeres y niños fueron por mar (descartada)

**Pendiente para producción:** fuentes primarias. La crónica de Abraham Matthews (*Hanes y Wladfa Gymreig*),
los diarios de Fontana y los registros de Richard Jones Berwyn no se consultaron en preproducción y
deberían revisarse antes de cerrar el guion definitivo.

---

*Guía histórica v0.1 · septiembre 2026*
