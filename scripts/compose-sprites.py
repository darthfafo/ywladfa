import os
from PIL import Image

RAW = '/Users/fede/wladfa/src/assets/sprites-raw'
OUT = '/Users/fede/wladfa/src/assets/sprites'

MARGIN = 1
DEFAULT_FRAME = (24, 32)
PALETTE_COLORS = 16

def load_view(char_raw_key, view, aliases=None):
    aliases = aliases or [f"{char_raw_key}_{view}.png"]
    for name in aliases:
        p = os.path.join(RAW, name)
        if os.path.exists(p):
            return Image.open(p).convert('RGBA')
    raise FileNotFoundError(aliases)

def flatten_colors(im, colors=PALETTE_COLORS):
    """Funde los degradés de 1px del recorte/resize en bloques planos de
    verdad — sin esto cada pixel del PNG final tiene un tono ligeramente
    distinto al de al lado (un mini-thumbnail suavizado, no pixel art real),
    y ESE es el motivo de que se vea "sucio" sin importar el filtro
    (NEAREST/LINEAR) que use el motor después: el problema está en los datos
    del archivo, no en cómo se escala en el juego."""
    alpha = im.split()[3]
    rgb = im.convert('RGB')
    quantized = rgb.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    result = quantized.convert('RGBA')
    result.putalpha(alpha)
    return result

def fit_frame(im, frame_w, frame_h):
    bbox = im.getbbox()
    cropped = im.crop(bbox)
    w, h = cropped.size
    max_w, max_h = frame_w - 2 * MARGIN, frame_h - 2 * MARGIN
    scale = min(max_w / w, max_h / h)
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)
    flat = flatten_colors(resized)
    canvas = Image.new('RGBA', (frame_w, frame_h), (0, 0, 0, 0))
    x = (frame_w - new_w) // 2
    y = frame_h - MARGIN - new_h
    canvas.paste(flat, (x, y), flat)
    return canvas

def build_character(out_key, char_raw_key, aliases_by_view=None, frame=DEFAULT_FRAME):
    aliases_by_view = aliases_by_view or {}
    frame_w, frame_h = frame
    sur = fit_frame(load_view(char_raw_key, 'sur', aliases_by_view.get('sur')), frame_w, frame_h)
    norte = fit_frame(load_view(char_raw_key, 'norte', aliases_by_view.get('norte')), frame_w, frame_h)
    este = fit_frame(load_view(char_raw_key, 'este', aliases_by_view.get('este')), frame_w, frame_h)
    oeste = este.transpose(Image.FLIP_LEFT_RIGHT)

    sheet = Image.new('RGBA', (frame_w * 4, frame_h), (0, 0, 0, 0))
    for i, fr in enumerate([sur, norte, este, oeste]):
        sheet.paste(fr, (i * frame_w, 0), fr)

    out_path = os.path.join(OUT, f'{out_key}.png')
    sheet.save(out_path)
    print('wrote', out_path, sheet.size)

os.makedirs(OUT, exist_ok=True)
build_character('pc_m', 'pc_m')
build_character('pc_f', 'pc_f')
build_character('npc_lewis', 'lewis', aliases_by_view={'norte': ['lewis_norte.png', 'lewsi_norte.png']})
build_character('npc_edwyn', 'edwin')
build_character('npc_dafydd', 'dafydd', frame=(20, 26))
