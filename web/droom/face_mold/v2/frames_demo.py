# 眼眶 8 種的樣品圖：python3 frames_demo.py <有 front.png 的資料夾> <輸出.png>（只畫正面、只有眼睛）
import sys,math,os
sys.path.insert(0,'/home/user/Yorozuya/web/droom/face_mold/v2')
import numpy as np
from PIL import Image,ImageDraw,ImageFont
os.environ.setdefault('GUIDE','0')
from eyeframe import Frame,TYPES
from outline import Y,S,N
EPAL=dict(K=(58,36,36),k=(110,70,62),W=(250,247,244),w=(214,206,214),I=(84,52,44),i=(140,88,62),j=(190,132,88),P=(38,22,22),O=(112,66,50),g1=(176,64,116),g2=(228,112,140),g3=(244,156,118),g4=(250,204,140),H=(255,255,255),L=(184,124,104),c=(216,166,140))
from eyeframe import IRIS_COLORS,ICOL
EPAL.update(IRIS_COLORS[ICOL])   # 黑眼珠顏色（ICOL=橘／水藍／亮綠／金黃／紅／粉紅／黑／棕）
D=sys.argv[1];ES=1.35
base=np.array(Image.open(D+'/front.png').convert('RGB'))
F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',30)
tiles=[];zooms=[]
KEYS=os.environ.get('KEYS','N1,N2,N3,T1,T2,T3,T4,R1,R2,R3,R4').split(',')
for key in KEYS:
  fr=Frame(key);img=base.copy()
  for s in(1,-1):
    ex=128+s*float(os.environ.get('EYEX','30'));ey=Y(539)
    x0,x1,y0,y1=fr.box
    for Yp in range(math.floor(ey+y0*ES),math.ceil(ey+y1*ES)):
      for X in range(math.floor(ex-x1*ES) if s<0 else math.floor(ex+x0*ES),math.ceil(ex-x0*ES) if s<0 else math.ceil(ex+x1*ES)):
        ch=fr.at(s*(X+.5-ex)/ES,(Yp+.5-ey)/ES,s)
        if ch and tuple(img[Yp,X])!=(255,255,255):img[Yp,X]=EPAL[ch]
  im=Image.fromarray(img)
  tiles.append((TYPES[key]['name'],im.crop((40,80,216,230)).resize((352,300),Image.NEAREST)))
  zooms.append((TYPES[key]['name'],im.crop((122,122,194,178)).resize((432,336),Image.NEAREST)))
NC=3 if len(KEYS) in(11,18) else 2;NR=4 if len(KEYS)==11 else 6 if len(KEYS)==18 else (len(KEYS)+1)//2
c=Image.new('RGB',(NC*(352+476+20)+20,NR*350+20),'white');d=ImageDraw.Draw(c)
for i,((n,t),(_,z)) in enumerate(zip(tiles,zooms)):
  if len(KEYS)==11:col,r=(0,i) if i<3 else divmod(i-3,4);col=col+(1 if i>=3 and len(KEYS)==11 else 0)
  else:col,r=divmod(i,NR)
  x=col*(828+20);y=r*350
  d.text((x+10,y+2),n,fill='black',font=F);c.paste(t,(x,y+38));c.paste(z,(x+352,y+30))
c.save(sys.argv[2])
