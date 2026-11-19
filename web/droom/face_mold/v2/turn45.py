# 臉輪廓 v2：左轉 45°（臉朝畫面左）
# 用正面（每列半寬）＋側臉（中線前緣、下顎、後腦）做一個簡單的 3D，轉 45° 再正交投影，各段高度和正面、側臉一樣
# 座標都用參考圖的像素（x＝往她左邊為正、y 往下、z＝往前為正，原點在頭蓋圓心），最後才換到 256 畫布
# 用法：python3 turn45.py [輸出資料夾]；GUIDE=0 拿掉輔助線；DEG= 改角度
import os,sys,math
import numpy as np
from PIL import Image
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from outline import N,SK,SH,DK,GL,R,CY,S,G,Y,LINES,cr,mask,edge
DEG=float(os.environ.get('DEG','30'));A=math.radians(DEG);CA,SA=math.cos(A),math.sin(A)
CX=126
out=sys.argv[1] if len(sys.argv)>1 else '.'
from shape3d import *
def rowpts(y):
  P=[]
  dy=y-CYR
  if abs(dy)<RR:   # 頭蓋（球，後腦往後拉 1.08）
    r=math.sqrt(RR*RR-dy*dy)
    for i in range(360):
      t=i/360*2*math.pi;x,z=r*math.cos(t),r*math.sin(t)
      P.append((x,z if z>0 else z*BACK))
  if 505<=y<=614.5:   # 下半臉：前半是橢圓（中間＝中線、兩邊＝正面半寬），後緣＝下顎
    w=lerp_tab(JAW,y);z0=min(zb(y),zw(y));zm=zw(y);zf=zc(y);zn=znose(y)
    for i in range(361):
      t=i/360*2*math.pi;x=w*math.cos(t)
      z=zm+(zf-zm)*math.sin(t) if t<=math.pi else zm+(zm-z0)*math.sin(t)   # 前半到中線、後半到下顎
      if t<=math.pi:z+=zn*max(0,1-abs(x)/NW)          # 鼻子只在中間 4 格
      P.append((x,z))
  return P
def scr(x,y,z):return (CX+(x*CA-z*SA)*S, Y(y))
img=np.full((N,N,3),255,np.uint8)
head=np.zeros((N,N),bool)
for Yp in range(N):
  y=CYR+(Yp+.5-CY)/S
  P=rowpts(y)
  if not P:continue
  xs=[CX+(x*CA-z*SA)*S for x,z in P]
  for X in range(int(math.floor(min(xs)+.5)),int(math.floor(max(xs)-.5))+1):
    if 0<=X<N:head[Yp,X]=True
# 脖子：橢圓柱，前後從側臉量、左右從正面（半寬 19→23）
NF=[(530,40),(575,26),(590,23),(605,17),(620,11),(640,2),(660,-6),(680,-15)]
NB=[(530,-45),(575,-47),(580,-47),(595,-49),(653,-56.5),(700,-60)]
neck=np.zeros((N,N),bool)
for Yp in range(N):
  y=CYR+(Yp+.5-CY)/S
  if y<530:continue
  zf,zbk=lerp_tab(NF,y),lerp_tab(NB,y);hw=(19 if Yp<Y(650) else 19+4*(Yp-Y(650))/(N-Y(650)))/S
  hw=max(hw,lerp_tab([(530,44),(575,38),(600,26),(620,20)],y) if y<620 else 0)   # 後頸接到後腦：上面寬
  zm,zh=(zf+zbk)/2,(zf-zbk)/2
  xs=[CX+(hw*math.cos(t)*CA-(zm+zh*math.sin(t))*SA)*S for t in np.linspace(0,2*math.pi,180)]
  for X in range(int(min(xs)+.5),int(max(xs)-.5)+1):
    if 0<=X<N:neck[Yp,X]=True
img[neck]=SK
sh=neck&~head&np.roll(head,3,0);img[sh]=SH      # 下巴壓在脖子上：影子（不描線）
img[head]=SK
# 近側耳朵（側臉的耳朵貼在頭的側面 x≈球半徑，轉 45° 投影）
EAR=[(329,546),(336,540),(345,539),(352,547),(352,560),(346,572),(337,580),(327,584),(324,575),(326,560)]
EDZ=float(os.environ.get("EDZ",str(20*max(0,min(1,(DEG-30)/15)))))   # 45° 才往前收 20；30° 以下照側臉位置（山田式：斜臉耳朵在頭的輪廓邊上）
def earpt(xs,y):
  return scr(54,y,322-xs+EDZ)   # 耳朵貼在頭的側面（x＝54）；45° 往前移 EDZ，整個收進頭裡（使用者 2026-11-18）
em=mask([earpt(x,y) for x,y in cr([(x,y) for x,y in EAR],True,6)])
img[em]=SK;img[em&edge(em)]=DK
for x,y in cr([earpt(333,547),earpt(343,545),earpt(347,553),earpt(344,566)],n=6):img[round(y),round(x)]=SH
# 輔助線
if G:
  m=head
  def dot(X,Yp):
    X,Yp=round(X),round(Yp)
    if 0<=X<N and 0<=Yp<N and m[Yp,X] and not em[Yp,X]:img[Yp,X]=GL
  # 中線沿著臉的表面（頭頂 → 額 → 鼻 → 嘴 → 下巴）
  for k in range(800):
    y=CYR-RR+k*(614.5-CYR+RR)/800
    dy=y-CYR;z=math.sqrt(max(0,RR*RR-dy*dy))
    if y>=520:z=max(z,zp(y))
    dot(*scr(0,y,z))
  for k,yy in LINES.items():
    for X in range(N):
      if (X//2)%2==0 or k=='eye':dot(X,yy)
  # 頭蓋圓（球的輪廓）
  for i in range(720):
    if (i//6)%2:continue
    a=i/720*2*math.pi;X,Yp=round(CX+R*math.cos(a)),round(CY+R*math.sin(a))
    if 0<=X<N and 0<=Yp<N:img[Yp,X]=GL if head[Yp,X] else (225,180,160)
Image.fromarray(img).save(f'{out}/turn45.png')
