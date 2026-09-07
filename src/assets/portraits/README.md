# Retratos de diálogo

Poner acá los PNG de 48×48 exportados con bordes duros (ver docs/03-assets.md §4
y docs/05-prompts-arte.txt §1 para los prompts).

Nombre de archivo: `<id>_<expresion>.png`

```
pc_m_neutral.png   pc_m_tenso.png   pc_m_calido.png
pc_f_neutral.png   pc_f_tenso.png   pc_f_calido.png
lewis_neutral.png  lewis_tenso.png  lewis_calido.png
edwyn_neutral.png  edwyn_tenso.png  edwyn_calido.png
matthews_neutral.png  matthews_tenso.png  matthews_calido.png
berwyn_neutral.png    berwyn_tenso.png    berwyn_calido.png
pepperell_neutral.png pepperell_tenso.png pepperell_calido.png
mari_neutral.png   mari_tenso.png   mari_calido.png
dafydd_neutral.png dafydd_tenso.png dafydd_calido.png
```

No hace falta tener las 27 imágenes para probar: el juego usa el rectángulo de
color placeholder para cualquier combinación de personaje/expresión que todavía
no tenga PNG (`src/util/assets.ts`), así que se puede ir cargando de a poco.
