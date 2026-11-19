# 臉模 v2：髮型轉到斜臉、側臉（2026-11-19）
# 把正面的頭髮（hair_one.py 的三區）放回 3D：頭頂＝比頭大一層的球殼、瀏海垂下來的部分貼在額頭前面、
# 兩側＝太陽穴往下的兩片、後髮＝頭後面一大片往下垂；轉過去再投影，跟頭的深度比，被臉擋住的地方不畫
# 光環＝球殼上一圈（前面往下彎）；髮絲＝從髮旋出發的經線（跟正面同一組）
# 用法：HS=hime|bob python3 hair3d.py <資料夾（有 front_f／turn45_f／side_f）> <輸出.png>
import os,sys,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import hair_one as H
from outline import S,Y
from shape3d import RR,CYR,BACK,lerp_tab,JAW,zb,zw,zc,znose,NW
N=256;CY=112;RO=H.RO
C=H.C
def head_depth(deg,cx):
  # 頭在畫面每一格最靠近觀眾的深度（球＋下半臉＋脖子），單位＝畫面格
  a=math.radians(deg);ca,sa=math.cos(a),math.sin(a);D=np.full((N,N),-1e9)
  for Yp in range(N):
    y=CYR+(Yp+.5-CY)/S;P=[]
    dy=y-CYR
    if abs(dy)<RR:
      r=math.sqrt(RR*RR-dy*dy)
      for i in range(240):
        t=i/240*2*math.pi;x,z=r*math.cos(t),r*math.sin(t);P.append((x,z if z>0 else z*BACK))
    if 505<=y<=614.5:
      w=lerp_tab(JAW,y);z0=min(zb(y),zw(y));zm=zw(y);zf=zc(y);zn=znose(y)
      for i in range(241):
        t=i/240*2*math.pi;x=w*math.cos(t)
        z=zm+(zf-zm)*math.sin(t) if t<=math.pi else zm+(zm-z0)*math.sin(t)
        if t<=math.pi:z+=zn*max(0,1-abs(x)/NW)
        P.append((x,z))
    if y>=560:                                           # 脖子（圓柱）
      for i in range(120):
        t=i/120*2*math.pi;P.append((20/S*math.cos(t),-8/S+22/S*math.sin(t)))
    for x,z in P:
      X=int(math.floor(cx+(x*ca-z*sa)*S));d=(x*sa+z*ca)*S
      if 0<=X<N and d>D[Yp,X]:D[Yp,X]=d
    # 補洞：同一列左右之間取兩邊較小的（只是保守估計）
    xs=np.nonzero(D[Yp]>-1e8)[0]
    if len(xs):
      for X in range(xs.min(),xs.max()+1):
        if D[Yp,X]<-1e8:D[Yp,X]=min(D[Yp,X-1],D[Yp,min(N-1,X+1)] if D[Yp,min(N-1,X+1)]>-1e8 else D[Yp,X-1])
  return D
def samples():
  # 頭髮的 3D 取樣點：(x,y,z,類別)；x 往她左邊（正面畫面右）、z 往前，單位＝畫面格，原點＝頭蓋圓心
  bangs,sides,back=H.regions()
  P=[]
  # 頭頂球殼（後腦往後拉 1.08，跟頭一樣）
  for y in np.arange(CY-RO+.25,CY+48,.5):
    dy=y-CY;r=math.sqrt(max(0,RO*RO-dy*dy))
    if r<1:continue
    n=int(2*math.pi*r/.45)
    for k in range(n):
      t=k/n*2*math.pi;x,z=r*math.cos(t),r*math.sin(t)
      if z<0:z*=BACK
      if y<CY+8 or z<-14 or (abs(x)>48 and y<CY+34):P.append((x,y,z,'cap'))   # 耳朵上面、太陽穴那一圈也蓋到
  # 瀏海垂下來那段（赤道以下）：貼在額頭前面
  for Yp,X in zip(*np.nonzero(bangs)):
    if Yp<CY+8:continue
    x=X-128;z=math.sqrt(max(0,RO*RO-x*x))
    for o in(0,.5):P.append((x+o,Yp+.0,z,'bang'));P.append((x+o,Yp+.5,z,'bang'))
  # 兩側：從太陽穴垂下的兩片，靠臉那邊在前（z 大）、外側在耳朵那裡（z 小）
  for Yp,X in zip(*np.nonzero(sides)):
    # 使用者 2026-11-19：側臉看兩側的頭髮要直直垂下來（不是貼著下顎的形狀）→ 兩側是一塊直立的厚片，前緣在臉頰後面一點、
    # 每一列前後一樣深，側面看前緣就是一條直線
    x=X-128
    for zf in np.arange(-12,23,.8):
      P.append((x,Yp,zf,'side'));P.append((x+.5,Yp+.5,zf,'side'))
  # 後髮：頭後面一大片，從後腦一路垂下來（外層＋內層有厚度）
  rows=np.nonzero(back.any(1))[0]
  for Yp in rows:
    if Yp<CY-10:continue
    xs=np.nonzero(back[Yp])[0]
    for X in range(xs.min(),xs.max()+1):
      x=X-128;zo=-math.sqrt(max(0,(RO+2)**2-x*x))*BACK
      for f in(1,.8,.6,.4):P.append((x,Yp,zo*f,'back'));P.append((x,Yp+.5,zo*f,'back'))
  return P
def render(img,deg,cx):
  a=math.radians(deg);ca,sa=math.cos(a),math.sin(a)
  HD=head_depth(deg,cx);white=(img==255).all(2)
  zb_={};cat={};pt={}
  for x,y,z,c in samples():
    X=int(math.floor(cx+x*ca-z*sa));Yp=int(math.floor(y));d=x*sa+z*ca
    if not(0<=X<N and 0<=Yp<N):continue
    k=(X,Yp)
    if k not in zb_ or d>zb_[k]:zb_[k]=d;cat[k]=c;pt[k]=(x,y,z)
  out=img.copy();vis={}
  for (X,Yp),d in zb_.items():
    if white[Yp,X] or d>=HD[Yp,X]-1.5:
      c=cat[(X,Yp)]
      col=C['mid'] if c in('cap','bang','side') else C['mid']
      x,y,z=pt[(X,Yp)]
      if c=='side' and z<-8:col=C['sh']                                 # 兩側最裡面那層暗
      out[Yp,X]=col;vis[(X,Yp)]=(c,x,y,z)
  # 後髮：只有貼著脖子／臉的那一兩格暗（不要整塊暗）
  for (X,Yp),(c,x,y,z) in vis.items():
    if c!='back' or y<CY+30:continue
    near=any(0<=X+dx<N and not white[Yp,X+dx] and (X+dx,Yp) not in vis for dx in(-2,-1,1,2))
    if near:out[Yp,X]=C['sh']
  # 瀏海下緣一格暗、投在額頭的影子
  for (X,Yp),(c,x,y,z) in vis.items():
    if c=='bang' and (X,Yp+1) not in vis and not white[min(N-1,Yp+1),X]:
      out[Yp,X]=C['sh']
      if Yp+1<N:out[Yp+1,X]=H.SKSH
  # 髮絲：經線（照正面同一組、同樣的有／細／粗規則）
  import random
  rl=random.Random(5 if H.HS!='bob' else 9)
  for ph in H.MER[1:-1]:
    kind=rl.choices(['none','thin','thick'],[.52,.26,.22])[0]
    y0=rl.randint(int(CY-RO*.6),int(CY-RO*.15));y1=H.BANG_Y+6 if rl.random()<.6 else rl.randint(int(CY-RO*.1),H.BANG_Y+6)
    side=rl.choice([-1,1])
    if kind=='none':continue
    for yy in np.arange(y0,y1,.4):
      xm=H.mer_x(ph,yy)-128
      zz=math.sqrt(max(0,RO*RO-xm*xm-(min(yy,CY)-CY)**2))
      X=int(math.floor(cx+xm*ca-zz*sa));Yp=int(yy)
      if (X,Yp) in vis and vis[(X,Yp)][0] in('cap','bang'):
        out[Yp,X]=C['ln']
        if kind=='thick' and (yy-y0)>(y1-y0)*.4 and (X+side,Yp) in vis:out[Yp,X+side]=C['sh']
  # 光環：球殼上一圈，前面往下彎（y＝RY0＋RD×(z/RO)²）
  RY0,RD=CY-34,15
  for k in range(1400):
    t=k/1400*2*math.pi
    for rr in(RO-.3,RO-1,RO-1.8,RO-2.6):
      x=rr*math.cos(t);z=rr*math.sin(t);y=RY0+RD*(max(0,z)/RO)**2
      if z<0:z*=BACK
      X=int(math.floor(cx+x*ca-z*sa));Yp=int(math.floor(y));d=x*sa+z*ca
      if (X,Yp) in vis and abs(zb_[(X,Yp)]-d)<4 and vis[(X,Yp)][0]=='cap':
        out[Yp,X]=C["hi"] if RO-2<rr else C["li"]
  return out
if __name__=='__main__':
  D=sys.argv[1];F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',26)
  front=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  turn=np.array(Image.open(f'{D}/turn45_f.png').convert('RGB'))
  side=np.array(Image.open(f'{D}/side_f.png').convert('RGB'))
  DEG=float(os.environ.get('DEG','30'))
  imgs=[H.render(front,'final'),render(turn,DEG,126),render(side,90,140)]
  c=Image.new('RGB',(3*400,440),'white')
  for k,im in enumerate(imgs):c.paste(Image.fromarray(im).crop((18,14,238,256)).resize((366,402),Image.NEAREST),(k*400+17,30))
  c.save(sys.argv[2])
