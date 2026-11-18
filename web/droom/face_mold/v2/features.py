# 臉模 v2：五官一次貼上去（眼睛、眉毛、鼻子、嘴巴），正面／左轉 45°／側臉
# 五官先畫在正面（256 畫布的像素），45° 和側臉把每個像素切 4×4 貼到臉的表面（shape3d.surf）再轉過去投影
# 眼睛、鼻子、嘴巴沿用舊臉模的畫法（../eye.cjs、../mold6.cjs、../mouth.cjs），位置照參考圖的線
# 用法：先 GUIDE=0 跑 outline.py、turn45.py 出底圖到同一個資料夾，再 python3 features.py 那個資料夾
#   NT=std|up|round 鼻子、MT=closed|open 嘴巴
import os,sys,math,re
import numpy as np
from PIL import Image
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from outline import N,SK,SH,DK,CY,S,Y
from shape3d import surf,CYR
D=sys.argv[1] if len(sys.argv)>1 else '.'
HERE=os.path.dirname(os.path.abspath(__file__))
LT=(229,185,158)
CXF=128
# ── 眼睛（照舊 eye.cjs，第一版使用者說先不用改）──
EPAL=dict(K=(58,36,36),k=(110,70,62),W=(250,247,244),w=(214,206,214),I=(84,52,44),i=(140,88,62),j=(190,132,88),P=(38,22,22),H=(255,255,255),L=DK,c=SH)
IN,OUT=-12,13
tt=lambda x:(x-IN)/(OUT-IN)
def yu(x):
  t=tt(x);return 0 if t<=0 or t>=1 else -7.5*math.sin(math.pi*t**.8)**.75
def yl(x):
  t=tt(x);return 0 if t<=0 or t>=1 else 5.5*math.sin(math.pi*t**1.25)**.9
IC=(.5,.3);IRX,IRY=6.2,7
def eyeAt(x,y,s):
  t=tt(x);u=yu(x);l=yl(x)
  if .18<t<.88 and abs(y-(u-4.6-1.2*t))<.55:return 'c'
  if OUT-1<=x<=OUT+3.5:
    yy=-1.2-(x-OUT)*.7
    if yy-1.1<y<yy+.6:return 'k' if x>OUT+2 else 'K'
  if t<=0 or t>=1:return None
  th=1.6+1.6*t
  if u-th<=y<u+.6:return 'k' if t<.08 else 'K'
  if l<=y<l+1:return 'L' if t>.32 else None
  if y<u+.6 or y>=l:return None
  dx=(x-IC[0])/IRX;dy=(y-IC[1])/IRY;r=math.hypot(dx,dy)
  if r<1:
    hx=s*(x-IC[0])+IC[0]
    if math.hypot((hx+2.6)/1.4,(y+2.6)/1.6)<1:return 'H'
    if math.hypot((hx-2.8)/.8,(y-3)/.8)<1:return 'H'
    if math.hypot((x-IC[0])/2.3,(y-IC[1]+.3)/3.4)<1:return 'P'
    if r>.86:return 'I'
    v=(y-u)/(l-u);return 'I' if v<.4 else 'i' if v<.72 else 'j'
  return 'w' if y<u+2.4 else 'W'
# ── 眉毛：參考圖眉頭在中線外 14.5、眉尾 46.5（參考圖像素），眉線上微微拱 ──
BROW=(118,80,62);BROWL=(160,114,90)
def brow_px():
  o={}
  for s in(1,-1):
    for k in range(401):
      u=k/400;x=(14.5+32*u)*S;y=Y(523)-5*math.sin(math.pi*u*.9)+1.5*u;w=2.4+(1.0-2.4)*u;r=w/2
      for yy in range(math.floor(y-r),math.ceil(y+r)+1):
        for xx in range(math.floor(CXF+s*x-r),math.ceil(CXF+s*x+r)+1):
          if math.hypot(xx+.5-(CXF+s*x),yy+.5-y)<=r+.05 and (xx,yy) not in o:o[(xx,yy)]=(BROWL if u>.72 else BROW,0)
  return o
# ── 鼻子（照舊 mold6.cjs：鼻樑一條線＋鼻頭），鼻頭在鼻線 ──
def nose_px():
  NT=os.environ.get('NT','up');ny=round(Y(577));L0=20;p=[]
  n=L0-(4 if NT=='std' else 5);ex=0
  for k in range(n+1):
    t=k/n;dx=round(-5+1.6*math.sin(math.pi*t*.9)-1.4*t*t);ex=dx;p.append((dx,-L0+k,LT if t<.2 else SH))
  if NT=='std':p+=[(ex+a,b,c) for a,b,c in[(0,-3,SH),(0,-2,DK),(0,-1,DK),(1,0,DK),(2,0,DK),(3,-1,SH)]]
  if NT=='up':p+=[(-6,-4,DK),(-6,-3,DK),(-5,-3,DK),(-6,-2,SH),(-4,-2,DK),(-5,-1,SH),(-4,-1,DK),(-3,-1,DK),(-3,0,DK),(-2,0,DK)]
  if NT=='round':
    cx=ex+1;p.append((ex,-4,SH));p+=[(cx+a,b,c) for a,b,c in[(-1,-3,SH),(0,-3,SH),(1,-3,SH),(-2,-2,SH),(2,-2,SH),(-2,-1,DK),(2,-1,DK),(-1,0,DK),(0,0,DK),(1,0,DK)]]
  return {(CXF+dx,ny+dy):(c,0) for dx,dy,c in p}
# ── 嘴巴（照舊 mouth.cjs 的像素圖），嘴縫在嘴線 ──
def mouth_px():
  src=open(os.path.join(HERE,'..','mouth.cjs'),encoding='utf8').read()
  PAL={k:tuple(map(int,v.split(','))) for k,v in re.findall(r"(\w):\[(\d+,\d+,\d+)\]",src.split('\n')[1])}
  def arr(name):return re.findall(r'"([^"]+)"',re.search(name+r'=\[(.*?)\];',src,re.S).group(1))
  def nums(name):return [float(v) for v in re.search(name+r'=\[(.*?)\]',src).group(1).split(',')]
  MT=os.environ.get('MT','closed')
  SP,DZ=(arr('OPEN'),nums('DZ1')) if MT=='open' else (arr('LIPS'),nums('DZ0'))
  LINE=[i for i,r in enumerate(SP) if 'C' in r][0];SC=(len(SP[0])-1)//2;y0=round(Y(588))
  o={}
  for r,row in enumerate(SP):
    for c,ch in enumerate(row):
      if ch!='.':o[(CXF+c-SC,y0+r-LINE)]=(PAL[ch],DZ[r])
  return o
ES=float(os.environ.get('ES','1.35'))   # 眼睛放大倍率（使用者：眼睛大一點）
def eye_px():
  o={}
  for s in(1,-1):
    ex=CXF+s*30;ey=Y(545)
    for yy in range(math.floor(ey-16*ES),math.ceil(ey+10*ES)):
      for xx in range(math.floor(ex-20*ES),math.ceil(ex+20*ES)):
        ch=eyeAt(s*(xx+.5-ex)/ES,(yy+.5-ey)/ES,s)
        if ch:o[(xx,yy)]=(EPAL[ch],0)
  return o
LAYERS=[brow_px(),eye_px(),nose_px(),mouth_px()]
def isface(img,X,Yp):
  return 0<=X<N and 0<=Yp<N and tuple(img[Yp,X])!=(255,255,255) and tuple(img[Yp,X])!=DK
def paint_front(img):
  for L in LAYERS:
    for (X,Yp),(c,_) in L.items():
      if isface(img,X,Yp):img[Yp,X]=c
def paint_turn(img,deg,cx):
  a=math.radians(deg);ca,sa=math.cos(a),math.sin(a);zbuf={}
  for L in LAYERS:
    for (X,Yp),(c,dz) in L.items():
      for i in range(4):
        for j in range(4):
          fx=X+(i+.5)/4;fy=Yp+(j+.5)/4
          x=(fx-CXF)/S;y=CYR+(fy-CY)/S
          z=surf(x,y)
          if z<-1e8:continue
          zx=(surf(x+.5,y)-surf(x-.5,y))
          if -zx*sa+ca<.12:continue                      # 背對（轉過去看不到的那一面）
          z+=dz/S
          PX=math.floor(cx+(x*ca-z*sa)*S);PY=math.floor(fy)
          d=x*sa+z*ca
          k=(PX,PY)
          if k not in zbuf or zbuf[k][0]<d:zbuf[k]=(d,c)
  for (PX,PY),(d,c) in zbuf.items():
    if isface(img,PX,PY):img[PY,PX]=c
out=os.environ.get('OUT',D)
f=np.array(Image.open(f'{D}/front.png').convert('RGB'));paint_front(f);Image.fromarray(f).save(f'{out}/front_f.png')
t=np.array(Image.open(f'{D}/turn45.png').convert('RGB'));paint_turn(t,45,126);Image.fromarray(t).save(f'{out}/turn45_f.png')
s=np.array(Image.open(f'{D}/side.png').convert('RGB'));paint_turn(s,90,140);Image.fromarray(s).save(f'{out}/side_f.png')
