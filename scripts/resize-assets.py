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
ICON_SIZE = 28

def resize_to(src_path, dst_path, max_side):
    im = Image.open(src_path).convert('RGBA')
    w, h = im.size
    scale = max_side / max(w, h)
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    resized = im.resize((new_w, new_h), Image.LANCZOS)
    resized.save(dst_path)
    print(f'{os.path.basename(dst_path)}: {w}x{h} -> {new_w}x{new_h}')

for name, size in PROP_SIZES.items():
    resize_to(os.path.join(ROOT, 'props-raw', f'{name}.png'), os.path.join(ROOT, 'props', f'{name}.png'), size)

for name in os.listdir(os.path.join(ROOT, 'icons-raw')):
    if name.endswith('.png'):
        resize_to(os.path.join(ROOT, 'icons-raw', name), os.path.join(ROOT, 'icons', name), ICON_SIZE)

# gaviotas.png es una hoja de 3 cuadros de 64x64 (PROP_SPRITESHEETS en
# assets.ts) mostrados a 22x22 (setDisplaySize en WorldScene.ts) — se achica
# cuadro por cuadro para no romper el recorte de frames del spritesheet.
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
