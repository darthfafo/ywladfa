"""
Redimensiona props/íconos reales UNA VEZ al tamaño final que se muestra en
el juego, en vez de dejar que Phaser los reescale en tiempo real (setScale)
a un tamaño arbitrario — eso es lo que los "rompía": son imágenes de pixel
art hechas a mano, e interpolar (NEAREST o LINEAR, cualquiera de los dos)
a un factor no entero les deforma los bordes igual que le pasaba a los
sprites de personaje. Mismo criterio que scripts/compose-sprites.py: resize
limpio, sin ningún procesamiento de color, directo al tamaño final.

Los originales en alta resolución quedan en props-raw/ e icons-raw/ — este
script SIEMPRE parte de ahí, nunca de los ya redimensionados en props/.
"""
import os
from PIL import Image

ROOT = '/Users/fede/wladfa/src/assets'

# tamaño = lado mayor final, el mismo que ya se usaba como `size` en
# addPropImage()/addIconImage() — ver WorldScene.ts / CargoScene.ts.
PROP_SIZES = {
    'bote_menor': 60,
    'coiron': 38,
    'guanaco': 48,
    'manantial': 108,
    'mimosa': 110,
    'restos_costa': 34,
}
# Los íconos de CargoScene ahora son el FONDO de cada tarjeta (126x99 - padding),
# no un ícono chico arriba del texto — necesitan bastante más tamaño que antes
# (28px de lado mayor) para leerse como ilustración, no como un sello. Frame
# NO cuadrado: se corresponde con la tarjeta (126x99), que tampoco lo es —
# CargoScene.CARD_W/CARD_H. Si se cambia acá, cambiar ahí también.
ICON_FRAME = (116, 89)
ICON_MARGIN = 4

def resize_to(src_path, dst_path, max_side):
    im = Image.open(src_path).convert('RGBA')
    w, h = im.size
    scale = max_side / max(w, h)
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    resized = im.resize((new_w, new_h), Image.LANCZOS)
    resized.save(dst_path)
    print(f'{os.path.basename(dst_path)}: {w}x{h} -> {new_w}x{new_h}')

def fit_icon(src_path, dst_path, frame, margin):
    im = Image.open(src_path).convert('RGBA')
    # recorta al contenido real ANTES de escalar: las fuentes (1254x1254, IA)
    # traen el objeto pegado a uno o más bordes de su propio lienzo, no
    # centrado — escalar el lienzo entero sin recortar primero arrastra ese
    # descentrado al ícono final (ej. bulto_labranza quedaba pegado
    # arriba-a-la-derecha en la tarjeta). Mismo criterio que fit_frame() en
    # compose-sprites.py, pero centrado en los dos ejes (ahí un personaje
    # apoya los pies abajo; acá es un objeto suelto, no tiene "piso").
    bbox = im.getbbox()
    cropped = im.crop(bbox)
    w, h = cropped.size
    frame_w, frame_h = frame
    max_w, max_h = frame_w - 2 * margin, frame_h - 2 * margin
    scale = min(max_w / w, max_h / h)
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new('RGBA', (frame_w, frame_h), (0, 0, 0, 0))
    x = (frame_w - new_w) // 2
    y = (frame_h - new_h) // 2
    canvas.paste(resized, (x, y), resized)
    canvas.save(dst_path)
    print(f'{os.path.basename(dst_path)}: {im.size} (bbox {bbox}) -> {frame_w}x{frame_h}, objeto {new_w}x{new_h} centrado')

for name, size in PROP_SIZES.items():
    resize_to(os.path.join(ROOT, 'props-raw', f'{name}.png'), os.path.join(ROOT, 'props', f'{name}.png'), size)

for name in os.listdir(os.path.join(ROOT, 'icons-raw')):
    if name.endswith('.png'):
        fit_icon(os.path.join(ROOT, 'icons-raw', name), os.path.join(ROOT, 'icons', name), ICON_FRAME, ICON_MARGIN)

# gaviotas.png es una hoja de 3 cuadros — se achica cuadro por cuadro para no
# romper el recorte del spritesheet. OJO: GAVIOTA_TARGET tiene que coincidir
# SIEMPRE con PROP_SPRITESHEETS.gaviotas.frameSize en src/util/assets.ts — ya
# se rompió una vez por cambiar acá sin actualizar allá (Phaser corta el PNG
# en cuadrados de ESE tamaño a ciegas; si no coincide con el archivo real,
# .play() tira "Cannot read properties of undefined (reading 'duration')"
# apenas alguna escena intenta animar las gaviotas — un crash silencioso en
# WorldScene.create(), no acá).
GAVIOTA_FRAME = 64
GAVIOTA_TARGET = 22
src = Image.open(os.path.join(ROOT, 'props-raw', 'gaviotas.png')).convert('RGBA')
frames = src.width // GAVIOTA_FRAME
sheet = Image.new('RGBA', (GAVIOTA_TARGET * frames, GAVIOTA_TARGET), (0, 0, 0, 0))
for i in range(frames):
    frame = src.crop((i * GAVIOTA_FRAME, 0, (i + 1) * GAVIOTA_FRAME, GAVIOTA_FRAME))
    frame = frame.resize((GAVIOTA_TARGET, GAVIOTA_TARGET), Image.LANCZOS)
    sheet.paste(frame, (i * GAVIOTA_TARGET, 0), frame)
sheet.save(os.path.join(ROOT, 'props', 'gaviotas.png'))
print(f'gaviotas.png: {frames} cuadros de {GAVIOTA_FRAME}x{GAVIOTA_FRAME} -> {GAVIOTA_TARGET}x{GAVIOTA_TARGET}')
