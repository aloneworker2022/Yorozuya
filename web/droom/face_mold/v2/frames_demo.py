# 眼眶 8 種的樣品圖：python3 frames_demo.py <有 front.png 的資料夾> <輸出.png>（只畫正面、只有眼睛）
import sys,math,os
sys.path.insert(0,'/home/user/Yorozuya/web/droom/face_mold/v2')
import numpy as np
from PIL import Image,ImageDraw,ImageFont
os.environ.setdefault('GUIDE','0')
from eyeframe import Frame,TYPES
from outline import Y,S,N
EPAL=dict(K=(58,36,36),k=(110,70,62),W=(250,247,244),w=(214,206,214),I=(84,52,44),i=(140,88,62),j=(190,132,88),P=(38,22,22),H=(255,255,255),L=(184,124,104),c=(216,166,140))
D=sys.argv[1];ES=1.35
base=np.array(Image.open(D+'/front.png').convert('RGB'))
F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',30)
tiles=[];zooms=[]
for key in ['N1','N2','N3','T1','T2','T3','T4','R1','R2','R3','R4']:
  fr=Frame(key);img=base.copy()
  for s in(1,-1):
    ex=128+s*30;ey=Y(539)
    x0,x1,y0,y1=fr.box
    for Yp in range(math.floor(ey+y0*ES),math.ceil(ey+y1*ES)):
      for X in range(math.floor(ex-x1*ES) if s<0 else math.floor(ex+x0*ES),math.ceil(ex-x0*ES) if s<0 else math.ceil(ex+x1*ES)):
        ch=fr.at(s*(X+.5-ex)/ES,(Yp+.5-ey)/ES,s)
        if ch and tuple(img[Yp,X])!=(255,255,255):img[Yp,X]=EPAL[ch]
  im=Image.fromarray(img)
  tiles.append((TYPES[key]['name'],im.crop((40,80,216,230)).resize((352,300),Image.NEAREST)))
  zooms.append((TYPES[key]['name'],im.crop((124,116,192,160)).resize((476,308),Image.NEAREST)))
c=Image.new('RGB',(3*(352+476)+40,4*350+20),'white');d=ImageDraw.Draw(c)
for i,((n,t),(_,z)) in enumerate(zip(tiles,zooms)):
  col,r=(0,i) if i<3 else divmod(i-3,4);col=col+ (1 if i>=3 else 0);x=col*(828+20);y=r*350
  d.text((x+10,y+2),n,fill='black',font=F);c.paste(t,(x,y+38));c.paste(z,(x+352,y+30))
c.save(sys.argv[2])
