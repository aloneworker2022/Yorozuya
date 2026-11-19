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
def eyeAt(x,y,s,IC=IC):   # IC 可以另外給（45° 近側黑眼珠往內移）
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
# 眼睛、眉毛的高度（參考圖像素 y）：EYEY 眼睛中心、BRY 眉毛；EH 眼睛縱向再放大
# 山田式量：頭頂→下巴當 1，眉 0.41、眼中心 0.61、眼睛高 0.16（我們原本眉 0.50、眼 0.64、眼高 0.10）
EYEY=float(os.environ.get('EYEY','545'));BRY=float(os.environ.get('BRY','523'));EH=float(os.environ.get('EH','1'))
BROW=(118,80,62);BROWL=(160,114,90)
def brow_px():
  o={}
  for s in(1,-1):
    for k in range(401):
      u=k/400;x=(14.5+32*u)*S;y=Y(BRY)-5*math.sin(math.pi*u*.9)+1.5*u;w=2.4+(1.0-2.4)*u;r=w/2
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
    ex=CXF+s*30;ey=Y(EYEY)
    for yy in range(math.floor(ey-16*ES*EH),math.ceil(ey+10*ES*EH)):
      for xx in range(math.floor(ex-20*ES),math.ceil(ex+20*ES)):
        ch=eyeAt(s*(xx+.5-ex)/ES,(yy+.5-ey)/(ES*EH),s)
        if ch:o[(xx,yy)]=(EPAL[ch],0)
  return o
NOSE=nose_px()
EYES=eye_px()
LAYERS=[brow_px(),EYES,NOSE,mouth_px()]
def isface(img,X,Yp):
  return 0<=X<N and 0<=Yp<N and tuple(img[Yp,X])!=(255,255,255) and tuple(img[Yp,X])!=DK
def paint_front(img):
  for L in LAYERS:
    for (X,Yp),(c,_) in L.items():
      if isface(img,X,Yp):img[Yp,X]=c
def paint_turn(img,deg,cx):
  a=math.radians(deg);ca,sa=math.cos(a),math.sin(a);zbuf={}
  for L in LAYERS:
    if L is NOSE:continue          # 轉過去的鼻子另外畫（正面那條線投影過去會被壓扁）
    if L is EYES:continue   # 轉過去的眼睛另外畫（45°：近側菱形、遠側三角形；側臉：三角形）
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
  if 0<deg<90:eyes_turn(img,ca,sa,cx);nose_turn(img,sa,cx)
  if deg>=90:side_eye(img,cx)
SHG=float(os.environ.get('SHG','0'))   # 山根往外（往前凸）幾格（使用者 2026-11-19：遠側眼睛往內 3 格後，山根要往外一點）
NX=float(os.environ.get('NX','6'))   # 斜臉整個鼻子（形狀不變）往前（畫面左）平移幾格（使用者 2026-11-19）
def bridge_pts(sa,cx):
  # 鼻樑線每一列的 X：側臉中線投影；山根那段再往外推 SHG 格，到鼻頭前收回 0
  from shape3d import zc,znose
  pts={}
  for k in range(400):
    y=528+k*(567-528)/399;w=1 if y<=545 else max(0,1-(y-545)/17)
    X=cx-(zc(y)+znose(y))*sa*S-SHG*w-NX;pts.setdefault(round(Y(y)),[]).append(round(X))
  return pts
def nose_turn(img,sa,cx):
  # 45° 鼻子（使用者：山根要畫出來、要立體）：沿著側臉中線（x＝0、z＝zp）投影出鼻樑線——
  # 從眉頭下面（山根，先往內凹）一路到鼻頭；鼻樑右邊（背光那面，光從左上）一條淡影；鼻頭深色、鼻底往右一小段影子
  pts=bridge_pts(sa,cx)
  tipY=round(Y(567));tipX=min(pts[tipY])
  # 鼻子平移後跑出臉的輪廓：中間補肉色，跑出去的那段當輪廓（外框不描線，一律肉色）
  out=set()
  rows=dict(pts);rows.update({tipY+dy:rows.get(tipY+dy,[])+[tipX+dx] for dx,dy in((-1,0),(0,-1),(0,1),(1,1))})
  for Yp,xs in rows.items():
    if not xs:continue
    row=img[Yp];edge=next((X for X in range(N) if tuple(row[X])!=(255,255,255)),None)
    if edge is None:continue
    for X in range(min(xs),edge):img[Yp,X]=SK;out.add((X,Yp))
  put=lambda X,Yp,c:isface(img,X,Yp) and img.__setitem__((Yp,X),SK if (X,Yp) in out else c)
  for Yp,xs in sorted(pts.items()):
    y=CYR+(Yp-CY)/S
    for X in set(xs):put(X,Yp,LT if y<538 else SH)
    if 549<=y<568:                                         # 鼻子右邊那一面（背光）：越往下越寬的影子，靠鼻樑那格深
      wid=round(1+3.2*(y-549)/18)
      for d in range(1,wid+1):put(max(xs)+d,Yp,SH if d==1 and y>=553 else LT)
  # 鼻頭：深色尖角朝左（翹頭尖鼻），底下往右一小段鼻底影子
  for dx,dy,c in[(1,-2,SH),(0,-1,DK),(-1,0,DK),(0,0,DK),(0,1,DK),(1,1,DK),(2,1,DK),(3,1,SH),(4,1,SH),(5,0,SH),(5,-1,LT),(2,2,LT),(3,2,LT),(4,2,LT)]:put(tipX+dx,tipY+dy,c)   # 鼻底＋鼻翼

# ── 45° 的眼睛（使用者給的教學）──
# 近側：正面那隻往橫向壓窄（菱形往外拉），黑眼珠往內（鼻子那邊）靠，看的方向兩眼一致
# 遠側：臉是圓的，轉過去變三角形——用側臉那隻左右鏡射、橫向再壓窄；內眼角藏在鼻樑後面，外側被臉的輪廓切掉
def eyes_turn(img,ca,sa,cx):
  # 2026-11-19 改（使用者給山田式教學：斜臉兩隻眼睛都還是橢圓，遠側那隻比較窄、在臉的輪廓和中線中間，不會被切掉）
  # 兩隻都用正面那隻眼睛，橫向壓的倍率＝臉表面在那裡的縮短量（ca－斜率×sa），黑眼珠往臉朝的那邊（左）靠一點
  BR=bridge_pts(sa,cx)
  for s in(1,-1):
    xr=s*30/S;yr=EYEY;z=surf(xr,yr)
    Xc=cx+(xr*ca-z*sa)*S;Yc=Y(yr)
    if s<0:Xc+=float(os.environ.get('FARIN','3'))   # 遠側眼睛往鼻子那邊移幾格（外側留空）
    zx=(surf(xr+.5,yr)-surf(xr-.5,yr))
    kx=max(.35,min(1,ca-zx*sa))
    ic=(-1.3,.3) if s==1 else (1.3*kx,.3)     # 往畫面左邊（她看的方向）
    for Yp in range(math.floor(Yc-16*ES*EH),math.ceil(Yc+10*ES*EH)):
      for X in range(math.floor(Xc-20*ES),math.ceil(Xc+20*ES)):
        if s<0 and Yp in BR and X>=min(BR[Yp]):continue   # 遠側內眼角藏在鼻樑後面
        ch=eyeAt(s*(X+.5-Xc)/(ES*kx),(Yp+.5-Yc)/(ES*EH),s,IC=ic)
        if ch and isface(img,X,Yp):img[Yp,X]=EPAL[ch]
# ── 側臉的眼睛（使用者給的教學：臉是圓的，側面看眼睛是三角形）──
# 上眼線厚、橫的、眼尾往後收成一個尖角（下面一小撇）；前緣斜斜往後下到底下的尖；黑眼珠是窄窄的直橢圓、貼在前緣；
# 前面幾根睫毛往前刺出去（トゲトゲ）；雙眼皮線往前淡掉；眼睛前緣離鼻樑往後縮
def side_eye_at(u,v,flip=False):   # flip：左右鏡射時亮點仍放在左上
  # u 往後（往右）、v 往下，單位＝格（再乘 ES）；原點＝上眼線前端
  def lb(u):return .5-1.4*math.sin(math.pi*max(0,min(u,20))/22)     # 上眼線的下緣（＝眼睛開口上緣）
  def th(u):return 1.8+1.4*math.sin(math.pi*min(max(u,0),18)/20)    # 上眼線粗細
  # 雙眼皮線（往前淡掉）
  if 6<=u<=18 and abs(v-(lb(u)-th(u)-2.4))<.5:return 'c'
  # 上眼線＋眼尾尖角
  if 0<=u<=18 and lb(u)-th(u)<=v<lb(u):return 'K'
  if 18<u<=23:
    f=(u-18)/5;top=lb(18)-th(18)+f*.6;bot=lb(18)-f*(th(18)-.6)
    if top<=v<bot:return 'K' if f<.7 else 'k'
  # 眼尾下面一小撇
  if 16.5<=u<=18.5 and lb(u)<=v<lb(u)+2.8 and abs(u-(16.8+(v-lb(u))*.55))<.6:return 'K'
  # 前面的睫毛（往前刺）
  for (ex,ey) in((-3.6,-2.8),(-4.2,-.8),(-3.2,1.1)):
    t=(u*ex+(v-(lb(0)-1))*ey)/(ex*ex+ey*ey)
    if 0<t<1 and math.hypot(u-t*ex,v-(lb(0)-1)-t*ey)<.45:return 'K' if t<.5 else 'k'
  v0=lb(0);AX,AY=6.5,10.5
  if v<=lb(u) or v>AY:return None
  uf=(v-v0)/(AY-v0)*AX                             # 前緣
  ub=AX+11*((AY-v)/(AY-1.2))**.75                    # 後緣（下眼瞼）
  if u<uf-.6 or u>ub:return None
  if u<uf:return 'k'                                 # 前緣細線
  if v>AY-1.2 or (u>ub-.9 and v>AY-4.5):return 'L'   # 下眼瞼（只在底下那一段）
  dx=(u-5.4)/3.4;dy=(v-4.8)/5.0;r=math.hypot(dx,dy)
  if r<1:
    hu=2*5.4-u if flip else u
    if math.hypot((hu-4.2)/1.1,(v-2.5)/1.3)<1:return 'H'
    if math.hypot((hu-6.6)/.6,(v-7.6)/.6)<1:return 'H'
    if math.hypot((u-5.6)/1.0,(v-5.0)/3.0)<1:return 'P'
    if r>.82:return 'I'
    w=(v-lb(u))/(AY-lb(u));return 'I' if w<.38 else 'i' if w<.7 else 'j'
  return 'w' if v<lb(u)+1.8 else 'W'
def side_eye(img,cx):
  from shape3d import zp
  X0=cx-zp(545)*S+7;Y0=Y(EYEY-4)               # 眼睛前端：鼻樑往後 7 格、眼線上面一點
  for Yp in range(math.floor(Y0-8*ES*EH),math.ceil(Y0+13*ES*EH)):
    for X in range(math.floor(X0-6*ES),math.ceil(X0+25*ES)):
      ch=side_eye_at((X+.5-X0)/ES,(Yp+.5-Y0)/(ES*EH))
      if ch and isface(img,X,Yp):img[Yp,X]=EPAL[ch]

out=os.environ.get('OUT',D)
f=np.array(Image.open(f'{D}/front.png').convert('RGB'));paint_front(f);Image.fromarray(f).save(f'{out}/front_f.png')
DEG=float(os.environ.get('DEG','30'))   # 斜臉預設 30°（山田式教學量出來的中線位置）
t=np.array(Image.open(f'{D}/turn45.png').convert('RGB'));paint_turn(t,DEG,126);Image.fromarray(t).save(f'{out}/turn45_f.png')
s=np.array(Image.open(f'{D}/side.png').convert('RGB'));paint_turn(s,90,140);Image.fromarray(s).save(f'{out}/side_f.png')
