# 黑眼珠 8 色 × 瞳孔類型 3 種的樣品：python3 colors_demo.py <有 front.png 的資料夾> <輸出.png>（KEY= 眼眶種類）
import sys,os,math
sys.path.insert(0,'/home/user/Yorozuya/web/droom/face_mold/v2')
from PIL import Image,ImageDraw,ImageFont
import numpy as np
import importlib
S=sys.argv[1];F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',28)
base=np.array(Image.open(f'{S}/fh/front.png').convert('RGB'));ES=1.35
from outline import Y
COLS=['橘','水藍','亮綠','金黃','紅','粉紅','黑','棕']
KEY=os.environ.get('KEY','A3')
cells={}
for pt in '123':
  os.environ['PT']=pt
  import eyeframe;importlib.reload(eyeframe)
  fr=eyeframe.Frame(KEY);x0,x1,y0,y1=fr.box
  for col in COLS:
    EP=dict(K=(58,36,36),k=(110,70,62),W=(250,247,244),w=(214,206,214),P=(38,22,22),H=(255,255,255),L=(184,124,104),c=(216,166,140));EP.update(eyeframe.IRIS_COLORS[col])
    img=base.copy()
    for s in(1,-1):
      ex=128+s*30;ey=Y(539)
      for Yp in range(math.floor(ey+y0*ES),math.ceil(ey+y1*ES)):
        for X in range(math.floor(ex-x1*ES),math.ceil(ex+x1*ES)):
          ch=fr.at(s*(X+.5-ex)/ES,(Yp+.5-ey)/ES,s)
          if ch and tuple(img[Yp,X])!=(255,255,255):img[Yp,X]=EP[ch]
    cells[(pt,col)]=Image.fromarray(img).crop((128,126,186,172)).resize((290,230),Image.NEAREST)
c=Image.new('RGB',(90+3*300,len(COLS)*240+50),'white');d=ImageDraw.Draw(c)
for j,pt in enumerate('123'):d.text((90+j*300+100,8),'類型'+pt,fill='black',font=F)
for i,col in enumerate(COLS):
  d.text((6,50+i*240+100),col,fill='black',font=F)
  for j,pt in enumerate('123'):c.paste(cells[(pt,col)],(90+j*300,50+i*240))
c.save(sys.argv[2])
