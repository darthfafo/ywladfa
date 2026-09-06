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

**Pendiente para producción:** fuentes primarias. La crónica de Abraham Matthews (*Hanes y Wladfa Gymreig*),
los diarios de Fontana y los registros de Richard Jones Berwyn no se consultaron en preproducción y
deberían revisarse antes de cerrar el guion definitivo.

---

*Guía histórica v0.1 · septiembre 2026*
