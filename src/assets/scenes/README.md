# Escenas cinemáticas (fondos narrativos)

Poner acá los PNG 3:4 exportados (ver docs/05-prompts-arte.txt §2 para los prompts).

Nombre de archivo: `<id>.png`

```
mimosa_puerto.png       — la Mimosa amarrada en el puerto, pantalla de género del arranque
enlistamiento_m.png     — enlistándose con Pepperell, variante jugador varón
enlistamiento_f.png     — enlistándose con Pepperell, variante jugadora mujer
cold_open.png
fogon_grande.png
fogon_chico.png
manantial.png
decision_carga.png
punta_final.png
subida_barranca.png
```

Nivel 2 (prompts y dónde aparece cada una en `docs/09-arte-nivel-02.txt`):

```
marcha_partida.png      marcha_noche.png        marcha_toldos.png
marcha_rio.png          marcha_caer_antur.png   (imprescindibles)
marcha_caballo.png      marcha_tormenta.png     marcha_perdidos.png
marcha_mari.png                                 (recomendadas)
```

Las del Nivel 2 no tienen placeholder: si el PNG no está, la marcha sigue sin ilustración.

Si un archivo todavía no existe, esa pantalla usa el fondo de color placeholder
en vez de romperse (`src/util/assets.ts`).
