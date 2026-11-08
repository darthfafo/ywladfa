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
# viñeta + franja oscura central para el título
ov=Image.new('RGBA',(W,H),(0,0,0,0))
od=ImageDraw.Draw(ov)
cy=H//2+10
for y in range(H):
    dist=abs(y-cy)/(H/2)
    a1=225*min(1,max(0,1.25-dist*1.6))
    a2=110*max(0,(abs(y-H/2)/(H/2)-0.6)/0.4)
    od.line((0,y,W,y),fill=(14,20,22,int(max(a1,a2))))
out=Image.alpha_composite(out.convert('RGBA'),ov)
d=ImageDraw.Draw(out)
F=sys.argv[2] if len(sys.argv)>2 else 'PressStart2P.ttf'  # https://fonts.google.com/specimen/Press+Start+2P
def ctext(txt,size,y,fill,shadow=(14,20,22),sh=6):
    f=ImageFont.truetype(F,size)
    w=d.textlength(txt,font=f)
    x=(W-w)/2
    d.text((x+sh,y+sh),txt,font=f,fill=shadow)
    d.text((x,y),txt,font=f,fill=fill)
ctext('CHUBUT 1865',84,cy-92,(217,168,69),sh=7)
# línea
d.rectangle((W/2-260,cy+12,W/2+260,cy+15),fill=(156,58,36))
ctext('LA HUELLA DE LOS RIFLEROS',26,cy+38,(234,232,224),sh=3)
ctext('Jugalo en el celu · Y Wladfa, 1865',16,cy+92,(191,211,216),sh=2)
out.convert('RGB').save(sys.argv[1],'JPEG',quality=86,optimize=True,progressive=True)
