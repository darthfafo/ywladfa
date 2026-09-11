# Sprites en crudo (staging)

Acá van los PNG que salen del generador de imágenes, uno por vista, **antes** de
armar la hoja final de 4 direcciones. Yo me encargo de recortar/alinear y
componer el spritesheet definitivo en `src/assets/sprites/` — no hace falta que
los seas vos quien arma nada, solo soltar los archivos acá.

## Nombre de archivo

`<clave>_<vista>.png` — minúsculas, guion bajo, sin acentos.

- `<clave>`: la del personaje (ver tabla abajo).
- `<vista>`: `sur` (de frente), `norte` (de espaldas) o `este` (perfil). El
  `oeste` no se genera — sale de espejar el `este`.

Ejemplos: `pc_m_sur.png`, `npc_lewis_este.png`, `npc_dafydd_norte.png`.

## Claves por personaje

| Clave | Personaje | Lienzo |
|---|---|---|
| `pc_m` | Idris Vaughan (PC varón) | 24×32 |
| `pc_f` | Elin Vaughan (PC mujer) | 24×32 |
| `npc_lewis` | Lewis Jones | 24×32 |
| `npc_edwyn` | Edwyn Roberts | 24×32 |
| `npc_matthews` | Rev. Matthews | 24×32 |
| `npc_berwyn` | Richard Berwyn | 24×32 |
| `npc_pepperell` | Cap. George Pepperell | 24×32 |
| `npc_mari` | Mari Vaughan | 24×32 |
| `npc_dafydd` | Dafydd (9 años) | **20×26** — más chico que el resto |

Los prompts exactos para cada uno están en `docs/06-prompts-sprites.txt`.

Podés soltar solo 1 o 2 personajes primero (empezando por `pc_m` o
`npc_lewis`, son P0) — no hace falta esperar a tener los 9.
