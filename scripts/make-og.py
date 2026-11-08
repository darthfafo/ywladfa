# Genera public/og.jpg (vista previa al compartir el link). Uso: python3 scripts/make-og.py public/og.jpg ruta/PressStart2P.ttf
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H=1200,630
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S=os.path.join(ROOT,'src/assets/scenes/')
out=Image.new('RGB',(W,H))
names=['travesia','cold_open','mimosa_zarpa']
pw=W//3
for i,n in enumerate(names):
    im=Image.open(S+n+'.png').convert('RGB')
    sc=H/im.height
    im=im.resize((round(im.width*sc),H),Image.LANCZOS)
    x0=(im.width-pw)//2
    out.paste(im.crop((x0,0,x0+pw,H)),(i*pw,0))
# separadores finos
d=ImageDraw.Draw(out)
for i in (1,2): d.rectangle((i*pw-1,0,i*pw+1,H),fill=(14,20,22))
# las ilustraciones quedan limpias en el medio (barco, bote, colona): el texto va
# arriba, sobre el cielo, y abajo, sobre el agua y el pasto, con degradés solo ahí
ov=Image.new('RGBA',(W,H),(0,0,0,0))
od=ImageDraw.Draw(ov)
TOP,BOT=215,110
for y in range(H):
    a=0
    if y<TOP: a=max(a,215*(1-y/TOP)**1.3)
    if y>H-BOT: a=max(a,225*((y-(H-BOT))/BOT)**1.2)
    od.line((0,y,W,y),fill=(14,20,22,int(a)))
out=Image.alpha_composite(out.convert('RGBA'),ov)
d=ImageDraw.Draw(out)
F=sys.argv[2] if len(sys.argv)>2 else 'PressStart2P.ttf'  # https://fonts.google.com/specimen/Press+Start+2P
def ctext(txt,size,y,fill,shadow=(14,20,22),sh=6):
    f=ImageFont.truetype(F,size)
    w=d.textlength(txt,font=f)
    x=(W-w)/2
    d.text((x+sh,y+sh),txt,font=f,fill=shadow)
    d.text((x,y),txt,font=f,fill=fill)
# en la fuente pixel el espacio ocupa una letra entera: el título se arma con
# un hueco más chico entre CHUBUT y 1865
def title(words,size,y,fill,gap,sh):
    f=ImageFont.truetype(F,size)
    ws=[d.textlength(t,font=f) for t in words]
    x=(W-sum(ws)-gap*(len(words)-1))/2
    for t,w in zip(words,ws):
        d.text((x+sh,y+sh),t,font=f,fill=(14,20,22))
        d.text((x,y),t,font=f,fill=fill)
        x+=w+gap
title(['CHUBUT','1865'],76,30,(217,168,69),gap=34,sh=6)
d.rectangle((W/2-230,124,W/2+230,127),fill=(156,58,36))
ctext('LA HUELLA DE LOS RIFLEROS',24,142,(234,232,224),sh=3)
ctext('El juego histórico de la colonia galesa en Chubut',17,H-46,(234,232,224),sh=2)
out.convert('RGB').save(sys.argv[1],'JPEG',quality=86,optimize=True,progressive=True)
