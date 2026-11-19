# 臉模 v2：長直髮＋分線（使用者 2026-11-19 給的教學圖，照它的步驟）
#   1. 頭頂先畫分線（分け目）：從前額髮際往後到頭頂後面，偏她右邊一點
#   2. 前髮寬度＝兩邊眉尾；從分線前端往下散開，尖尖的髮尾停在眼睛上緣附近，長短不一
#   3. 主要髮束：頭髮比頭殼高一層（有份量）；從分線往兩邊順著頭的圓弧下來，再直直垂到胸口，
#      臉旁邊的幾束在耳朵前面框住臉，中間那段塞到耳朵後面（耳朵露出來），後腦從頭頂後面散開往下垂；髮尾尖、微微往外翹
#   4. 片和片之間的邊（背光側暗、疊在上面的投影子）
#   5. 遊び毛：離開主要髮束、飄在外面的幾根細毛
# 做法：每一束＝3D 空間裡的一條帶子（中心線＋寬度），貼在比頭大一層的殼上，垂下來的部分直直往下；
#       取樣成很多點，每點記住屬於哪一束；三個角度都從同一份 3D 投影（z-buffer），所以正面／斜臉／側面一致
# 用法：python3 hair_long.py <資料夾（front_f／turn45_f／side_f）> <步驟圖.png> <三面圖.png>
import os,sys,math,random
import numpy as np
from PIL import Image,ImageDraw,ImageFont
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from hair3d import head_depth
N=256;CY=112;R=72;RO=79;BACK=1.08
C=dict(hi=(246,228,170),li=(222,192,124),mid=(190,152,90),ms=(170,133,77),sh=(150,114,64),dk=(112,82,48))
TONE=['li','mid','ms','sh','dk']   # 明暗五階（使用者 2026-11-19：頭髮很假、沒有層次感）
SKSH=(222,178,152)
XP=-5                                   # 分線在她右邊一點（正面看畫面左邊）
PHF,PHC=math.radians(46),math.radians(-30)   # 分線：從頭頂往前 46°（前額髮際）到往後 30°（頭頂後面）
BROW=36                                 # 眉尾：中心左右 36 格 → 前髮寬度
def part_pt(ph,r=RO):
  rp=math.sqrt(r*r-XP*XP);return np.array([XP,CY-rp*math.cos(ph),rp*math.sin(ph)])
def sm(t):t=np.clip(t,0,1);return t*t*(3-2*t)
class Strand:
  def __init__(s,kind,sid,layer,f,L,hw):
    # f(l)→(x,y,z)（l＝沿中心線的長度，向量化）；hw(l)→半寬
    s.kind,s.sid,s.layer,s.f,s.L,s.hw=kind,sid,layer,f,L,hw
    # 大塊（使用者 2026-11-19：①前髮＝分線左右兩半 ②兩邊各一大片長髮 ③後髮 ④遊び毛）
    s.mass={'curtain':'side','lock':'side'}.get(kind,kind)+(str(sid[1]) if kind in('curtain','lock') else '')
def shell_r(y,layer):
  # 殼的半徑：頭頂＝RO（比頭大一層）；赤道以下往臉那邊收到 R+4（前髮貼著額頭，不要飄太遠）
  r0=RO+.8*layer
  return np.where(y<CY,r0,r0+(R+4-r0)*sm((y-CY)/24))
def push_out(x,y,z,layer):
  # 不能跑進頭裡面：頭（球）＋一點點空隙；只管前半（後面另外有 BACK）
  rr=R+3+.8*layer
  inside=(y<CY+40)&(z>0)&(x*x+(y-CY)**2+z*z<rr*rr)
  z2=np.sqrt(np.maximum(0,rr*rr-x*x-(y-CY)**2))
  return np.where(inside,z2,z)
def curtain(s,z0,hw0,layer,tip,rnd):
  # 從分線往 s 那邊、在 z=z0 這個平面上順著殼的圓弧下來，然後直直垂下；耳朵那段塞到耳後
  rl=RO+.8*layer;rz=math.sqrt(rl*rl-z0*z0)
  xh=min(rz,64) if z0>30 else rz                         # 耳朵前面的幾束：垂在臉旁邊（不蓋耳朵）
  p0=math.asin(max(-1,min(1,XP/rz)));p1=s*math.asin(min(1,xh/rz))
  ye=CY-rz*math.cos(p1);La=rz*abs(p1-p0);L=La+(tip-ye)
  tuck=-24 if -28<z0<=30 else None   # 使用者教學圖：近側那大片從耳朵後面過去，耳朵露出來
  fl=rnd.uniform(3,7)
  def f(l):
    l=np.asarray(l,float);a=np.clip(l/La,0,1);ps=p0+(p1-p0)*a
    xa=rz*np.sin(ps);ya=CY-rz*np.cos(ps)
    yh=ye+np.maximum(0,l-La);hang=l>La
    flare=s*fl*np.clip((yh-150)/(tip-150),0,1)**2       # 髮尾微微往外翹
    x=np.where(hang,s*xh+flare,xa);y=np.where(hang,yh,ya)
    z=np.full_like(x,z0)
    if tuck is not None:z=z0+(tuck-z0)*sm((y-(CY-34))/46)   # 耳朵上面就開始往後塞，順一點
    else:z=z0+(min(z0,18)-z0)*sm((y-CY)/80)                # 耳朵前面那幾束：往下慢慢往後退（側面看不會擋在臉前面）
    z=push_out(x,y,z,layer)
    return x,y,z
  pt=rnd.random()<.35
  hw=lambda l:hw0*(np.clip((L-l)/18,.12,1) if pt else np.clip((L-l)/6,.6,1))   # 髮尾：大多剪齊，少數收尖
  return Strand('curtain',('c',s,round(z0)),layer,f,L,hw)
def bang(xt,yt,hw0,layer,i):
  # 前髮：從分線前端散開往下，尖尖的髮尾
  P=part_pt(PHF-.04,RO+.8*layer);y0=P[1];L=(yt-y0)*1.08
  def f(l):
    u=np.clip(np.asarray(l,float)/L,0,1)
    x=XP+(xt-XP)*(1-(1-u)**2.2);y=y0+(yt-y0)*u
    r=shell_r(y,layer);z=np.sqrt(np.maximum(0,r*r-x*x-(y-CY)**2))
    return x,y,z
  def hw(l):
    u=np.asarray(l,float)/L
    return hw0*(.3+.7*sm(u/.45))*np.clip((1-u)/.3,.06,1)
  st=Strand('bang',('b',i),layer,f,L,hw);st.mass='bangL' if xt<XP else 'bangR';return st
def lock(s,xs,hw0,layer,tip,rnd,i,dx=12):
  # 鬢髮：從分線前段斜斜下來，到眉尾高度在眉尾外面（蓋住太陽穴）→ 沿著臉的輪廓往外、往後滑到眼睛後面 → 垂下（耳朵前面），髮尾往外一點
  P=part_pt(PHF-.12-.1*i,RO+.8*layer);y0=P[1]
  y1=CY+4;y2=CY+34;x2=xs+s*dx
  L1=math.hypot(xs-XP,y1-y0)*1.15;L2=math.hypot(x2-xs,y2-y1)*1.1;L=L1+L2+(tip-y2);fl=rnd.uniform(3,6)
  rr=R+4+.8*layer
  def f(l):
    l=np.asarray(l,float);u=np.clip(l/L1,0,1);v=np.clip((l-L1)/L2,0,1)
    x=np.where(l<=L1,XP+(xs-XP)*(1-(1-u)**1.8),xs+(x2-xs)*sm(v)*1.0)
    y=np.where(l<=L1,y0+(y1-y0)*u,y1+(y2-y1)*v)
    r=shell_r(y,layer);z=np.sqrt(np.maximum(0,np.where(l<=L1,r*r,rr*rr)-x*x-(y-CY)**2))
    yh=y2+np.maximum(0,l-L1-L2);hang=l>L1+L2;g=sm((yh-y2)/50)
    zh2=math.sqrt(max(0,rr*rr-x2*x2-(y2-CY)**2))
    xh=x2+s*(-4*g+fl*np.clip((yh-150)/(tip-150),0,1)**2)
    zh=zh2+(26-zh2)*g                                    # 往下慢慢退到耳朵前面
    x=np.where(hang,xh,x);y=np.where(hang,yh,y);z=np.where(hang,zh,z)
    return x,y,push_out(x,y,z,layer)
  def hw(l):
    l=np.asarray(l,float)
    return hw0*(.35+.65*sm(l/(L1*.5)))*np.clip((L-l)/18,.12,1)
  return Strand('lock',('l',s,i),layer,f,L,hw)
def back(th,hw0,layer,tip,rnd,i):
  # 後腦：從頭頂後面（分線尾端）散開，順著殼下來再垂下
  rl=RO+.8*layer;P=part_pt(PHC,rl);Q=np.array([rl*math.sin(th),CY,rl*math.cos(th)])
  c=np.array([0,CY,0]);a=(P-c)/rl;b=(Q-c)/rl;om=math.acos(np.clip(a@b,-1,1))
  La=rl*om;L=La+(tip-CY);fl=rnd.uniform(6,12)             # 後髮髮尾往外散開，從兩邊長髮外面露出來
  def f(l):
    l=np.asarray(l,float);t=np.clip(l/La,0,1)[:,None]
    d=(np.sin((1-t)*om)*a+np.sin(t*om)*b)/math.sin(om)
    p=c+rl*d
    yh=CY+np.maximum(0,l-La);hang=l>La
    fx=math.sin(th);fz=math.cos(th)
    flare=fl*np.clip((yh-150)/(tip-150),0,1)**2
    x=np.where(hang,Q[0]+fx*flare,p[:,0]);y=np.where(hang,yh,p[:,1]);z=np.where(hang,Q[2]+fz*flare,p[:,2])
    return x,y,z
  pt=rnd.random()<.35
  def hw(l):
    l=np.asarray(l,float)
    return hw0*(.25+.75*sm(l/(La*.7)))*(np.clip((L-l)/18,.12,1) if pt else np.clip((L-l)/6,.6,1))
  return Strand('back',('k',i),layer,f,L,hw)
def build(seed=7):
  rnd=random.Random(seed);S=[]
  # 前髮：寬到兩邊眉尾，大片小片交錯，長短不一（髮尾停在眼睛上緣附近）
  x=-BROW-2;big=True;i=0
  while x<BROW+2:
    w=rnd.uniform(11,14) if big else rnd.uniform(6,8)
    xt=x+w/2;yt=rnd.uniform(134,142) if big else rnd.uniform(128,138)
    S.append(bang(xt,yt,w/2+1,0 if big else 1,i));x+=w;big=not big if rnd.random()<.8 else big;i+=1
  # 兩側：z0 從前額旁（55）到頭頂後面（-34），一束束
  for s in(-1,1):
    z=55;k=0
    while z>-36:
      w=rnd.uniform(10,15);tip=rnd.uniform(236,248)
      S.append(curtain(s,z,w/2+1,k%2,tip,rnd));z-=w*.8;k+=1
  # 鬢髮：每邊兩束
  for s in(-1,1):
    # 使用者 2026-11-19：鬢髮太細、蓋不住臉 → 加寬（半寬 10），垂下來對準臉的輪廓，往下蓋住臉頰邊
    for i,(xs,dx,hw) in enumerate(((42,14,10.5),(49,13,9.5))):S.append(lock(s,s*xs,hw,1-i%2,rnd.uniform(220,244),rnd,i,dx))
  # 後腦
  th=math.radians(108);i=0
  while th<math.radians(252):
    w=rnd.uniform(12,17);S.append(back(th,w/2+1,i%2,rnd.uniform(232,252),rnd,i));th+=w*.8/RO;i+=1
  return S
def base_cap(S):
  # 底層：一束束底下的頭髮（殼小一點），髮際線形狀；束和束之間的縫看到的是頭髮不是頭皮
  st=Strand('base',('base',),-1,None,0,None);S.append(st);k=len(S)-1
  P=[];r=RO-1.4
  for y in np.arange(CY-r+.2,CY+44,.4):
    rr=math.sqrt(max(0,r*r-(y-CY)**2)) if y<CY else r
    n=max(8,int(2*math.pi*rr/.4))
    t=np.linspace(0,2*math.pi,n,endpoint=False);x=rr*np.sin(t);z=rr*np.cos(t)
    hl=np.where(z>0,CY-42+90*(np.abs(x)/RO)**1.4,CY+40)    # 髮際線：額頭中間高、往太陽穴下來；後面到後頸
    keep=(y<hl)&((y<CY)|(z<-6)|((np.abs(x)>66)&(y<CY+14)))   # 耳朵上面那圈也有頭髮
    for xx,zz in zip(x[keep],z[keep]):P.append((xx,y,zz))
  P=np.array(P);NN=P-np.array([0,CY,0]);NN[:,1]=np.where(P[:,1]>CY,0,NN[:,1]);NN/=np.linalg.norm(NN,axis=1,keepdims=True)
  return np.asarray(P),np.concatenate([NN,np.zeros((len(NN),4))],1),np.full(len(P),k)
def samples(S,step=.4):
  out=[]
  S[:]=[st for st in S if st.kind!='base']
  for k,st in enumerate(S):
    n=int(st.L/step)+2;l=np.linspace(0,st.L,n)
    x,y,z=st.f(l);P=np.stack([x,y,z],1)
    t=np.gradient(P,axis=0);t/=np.linalg.norm(t,axis=1,keepdims=True)+1e-9
    c=np.array([0,CY,0]);nr=P-c
    nr[:,1]=np.where(P[:,1]>CY,0,nr[:,1])                 # 垂下來的部分：法線水平
    nr/=np.linalg.norm(nr,axis=1,keepdims=True)+1e-9
    b=np.cross(t,nr);b/=np.linalg.norm(b,axis=1,keepdims=True)+1e-9
    b[:,1]*=1-sm((P[:,1]-(CY-40))/20)                     # 往下垂的部分：寬度一律水平（不然往後塞的地方會轉成一塊平台）
    b/=np.linalg.norm(b,axis=1,keepdims=True)+1e-9
    hw=st.hw(l);K=int(2*hw.max()/.35)+2;w=np.linspace(-1,1,K)[None,:]*hw[:,None]
    Q=P[:,None,:]+b[:,None,:]*w[...,None]
    NN=np.concatenate([np.repeat(nr[:,None,:],K,1),np.repeat(np.linspace(-1,1,K)[None,:,None],len(P),0),np.repeat(b[:,None,:],K,1)],2)
    Q=Q.reshape(-1,3);NN=NN.reshape(-1,7)                # 每點：法線、在這束橫向的位置（-1～1）、橫向方向
    out.append((Q,NN,np.full(len(Q),k)))
  if any(st.kind=='bang' for st in S) and len(S)>12:out.append(base_cap(S))
  Q=np.concatenate([o[0] for o in out]);NN=np.concatenate([o[1] for o in out]);ID=np.concatenate([o[2] for o in out])
  Q[:,2]=np.where(Q[:,2]<0,Q[:,2]*BACK,Q[:,2])
  return Q,NN,ID
RANK={'bangL':3,'bangR':3,'side-1':2,'side1':2,'back':1,'base':0}
MCOL={'bangL':(240,150,150),'bangR':(150,190,240),'side-1':(240,200,110),'side1':(150,210,140),'back':(190,150,220),'base':(205,170,110)}
BIAS={'bang':2.5,'lock':1.5,'curtain':0,'back':-3,'base':-4}
def project(S,Q,NN,ID,img,deg,cx):
  a=math.radians(deg);ca,sa=math.cos(a),math.sin(a)
  HD=head_depth(deg,cx);white=(img==255).all(2)
  X=np.floor(cx+Q[:,0]*ca-Q[:,2]*sa).astype(int);Yp=np.floor(Q[:,1]).astype(int);d=Q[:,0]*sa+Q[:,2]*ca
  lay=np.array([S[i].layer for i in ID]);kb=np.array([BIAS[S[i].kind] for i in range(len(S))])[ID]
  db=d+kb+lay*.5
  ok=(X>=0)&(X<N)&(Yp>=0)&(Yp<N)
  X,Yp,d,db,ID2,NN2,Q2=X[ok],Yp[ok],d[ok],db[ok],ID[ok],NN[ok],Q[ok]
  idx=Yp*N+X;o=np.lexsort((-db,idx));u,first=np.unique(idx[o],return_index=True);sel=o[first]
  vis={}
  for j in sel:
    Xj,Yj=X[j],Yp[j];hd=HD[Yj,Xj]
    ear=(not white[Yj,Xj]) and hd<-1e8                   # 頭的形狀外面、不是白底＝耳朵
    if ear and Q2[j,2]<-6:continue                        # 塞在耳後的頭髮不蓋耳朵
    if white[Yj,Xj] or ear or d[j]>=hd-1.5:
      inside=(NN2[j,0]*sa+NN2[j,2]*ca)<-.15               # 看到的是頭髮內面（後髮從前面看）
      bxs=NN2[j,4]*ca-NN2[j,6]*sa                          # 這束的橫向在畫面上往右還是往左
      lft=-NN2[j,3]*np.sign(bxs) if abs(bxs)>.2 else 0.  # >0＝這束的左邊（受光）、<0＝右邊（背光）
      vis[(Xj,Yj)]=(ID2[j],S[ID2[j]].layer,Q2[j,0],Q2[j,1],Q2[j,2],inside,lft)
  return vis
def paint(S,vis,img,stage):
  out=img.copy();white=(img==255).all(2)
  if stage=='mass':
    for (X,Y),(i,*_) in vis.items():out[Y,X]=MCOL[S[i].mass]
    return out
  if stage=='pieces':
    rp=random.Random(1);pal={}
    for (X,Y),(i,*_) in vis.items():
      out[Y,X]=pal.setdefault(i,tuple(rp.randint(60,240) for _ in range(3)))
    return out
  # 明暗（層次）：每一束左亮右暗（有體積）；疊在下面那層暗一階；後髮暗一階；看到內面更暗
  tone={}
  for (X,Y),(i,layer,x,y,z,ins,lft) in vis.items():
    st=S[i];t=1.
    if ins:t=3
    else:
      if st.mass=='back':t+=1
      if st.kind in('curtain','lock','back') and layer==0:t+=.6
      if lft<-.45:t+=1
      elif lft>.5 and y<CY+24 and st.mass!='back':t-=1
    tone[(X,Y)]=t
  T={k:int(min(4,max(0,round(v)))) for k,v in tone.items()}
  for (X,Y),t in T.items():out[Y,X]=C[TONE[t]]
  # 片的邊：右邊或下面換片 → 這格暗；疊在別片上 → 右下投影子；分線兩邊一定畫；約 45% 一路到分線，其他只畫中下段
  rf=random.Random(13);full={};E={}
  for (X,Y),(i,layer,x,y,z,ins,*_) in vis.items():
    for nb in((X+1,Y),(X,Y+1)):
      r=vis.get(nb)
      if r is None or r[0]==i:continue
      a,b=S[i],S[r[0]]
      if 'base' in(a.kind,b.kind):continue                # 底層和束之間不畫線
      if a.mass!=b.mass:                                  # 大塊和大塊之間：一定畫；上面那塊在下面那塊投影子
        E[(X,Y)]=RANK[a.mass]>RANK[b.mass];continue
      key=tuple(sorted([i,r[0]]))                         # 同一大塊裡面：只挑一些當髮絲（約 35%），有的到分線、有的只在中下段
      g=full.setdefault(key,(rf.random()<.35,rf.random()<.4))
      if not g[0]:continue
      if not g[1] and y<CY-30:continue
      E[(X,Y)]=False
  # 連起來不到 5 格的不畫（取樣跳動的雜點）
  seen={};comp=[]
  for p in E:
    if p in seen:continue
    st=[p];seen[p]=1;cc=[]
    while st:
      q=st.pop();cc.append(q)
      for dx in(-1,0,1):
        for dy in(-1,0,1):
          nq=(q[0]+dx,q[1]+dy)
          if nq in E and nq not in seen:seen[nq]=1;st.append(nq)
    comp.append(cc)
  for cc in comp:
    if len(cc)<5:continue
    for (X,Y) in cc:
      out[Y,X]=C['dk'] if vis[(X,Y)][5] else C['sh']
      if E[(X,Y)]:                                       # 上面那塊投在下面那塊的影子：2～3 格寬、越遠越淡
        m=S[vis[(X,Y)][0]].mass
        for dx,dy,tt in((1,1,3),(2,1,2),(1,2,2),(2,2,2),(3,1,2),(3,2,2)):
          q=(X+dx,Y+dy)
          if q in vis and S[vis[q][0]].mass!=m and T[q]<tt:T[q]=tt;out[q[1],q[0]]=C[TONE[tt]]
  # 前髮投在額頭的影子
  for (X,Y),(i,*_) in vis.items():
    if S[i].kind=='bang' and (X,Y+1) not in vis and Y+1<N and not white[Y+1,X]:out[Y+1,X]=SKSH
  if stage=='base':return out
  # 高光：殼上一圈（前面往下彎），每片上下錯開，在片的邊上斷開
  rnd=random.Random(3);off={}
  for (X,Y),(i,layer,x,y,z,ins,*_) in vis.items():
    if ins or y>CY or z<-RO*.25:continue
    o=off.setdefault(i,rnd.uniform(-2,2))
    ring=CY-34+15*(max(0,z)/RO)**2+o;dd=y-ring
    mm=S[i].mass;nl=vis.get((X-1,Y));nr=vis.get((X+1,Y))
    same=nl is not None and nr is not None and S[nl[0]].mass==mm and S[nr[0]].mass==mm   # 高光只在大塊的邊上斷開
    if abs(dd)<1.3 and same:out[Y,X]=C['hi']
    elif abs(dd)<2.6 and tuple(out[Y,X]) in(C['mid'],C['ms']):out[Y,X]=C['li']
  return out
def strays(rnd):
  # 遊び毛：幾根離開主要髮束、飄在外面的細毛（3D 曲線）
  L=[]
  for s,z0,y0,y1,amp in((1,8,CY-60,CY-20,4),(-1,-10,CY-50,CY-8,3),(1,-14,CY+10,CY+90,3),(-1,30,CY+30,CY+100,2.5)):
    t=np.linspace(0,1,300);y=y0+(y1-y0)*t
    r=math.sqrt(RO*RO-z0*z0)
    xs=np.where(y<CY,np.sqrt(np.maximum(0,r*r-(y-CY)**2)),r)
    if z0>20:xs=np.minimum(xs,64)
    xs=s*(xs+1+amp*np.sin(np.pi*t))                       # 中間離開主體 amp 格，兩頭接回去
    z=np.full_like(y,z0);L.append(np.stack([xs,y,z],1))
  for s in(-1,1):                                         # 髮尾分岔出來的一兩根
    t=np.linspace(0,1,200);y=200+46*t;r=math.sqrt(RO*RO-10*10)
    L.append(np.stack([s*(r+1+7*t**1.6),y,np.full_like(y,-8.)],1))
  return L
def paint_strays(out,vis,img,deg,cx):
  a=math.radians(deg);ca,sa=math.cos(a),math.sin(a);HD=head_depth(deg,cx);white=(img==255).all(2)
  for P in strays(random.Random(5)):
    z=np.where(P[:,2]<0,P[:,2]*BACK,P[:,2])
    X=np.floor(cx+P[:,0]*ca-z*sa).astype(int);Y=np.floor(P[:,1]).astype(int);d=P[:,0]*sa+z*ca
    for Xj,Yj,dj in zip(X,Y,d):
      if not(0<=Xj<N and 0<=Yj<N):continue
      if white[Yj,Xj] and (Xj,Yj) not in vis:out[Yj,Xj]=C['mid']
      elif (Xj,Yj) in vis:
        v=vis[(Xj,Yj)];dv=v[2]*sa+v[4]*ca
        if dj>=dv-1.5:out[Yj,Xj]=C['sh']
  return out
def render(img,deg,cx,stage='final',S=None,QNI=None):
  S=S or build();Q,NN,ID=QNI or samples(S)
  vis=project(S,Q,NN,ID,img,deg,cx);out=paint(S,vis,img,stage)
  if stage=='final':out=paint_strays(out,vis,img,deg,cx)
  return out
if __name__=='__main__':
  D=sys.argv[1];F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',24)
  front=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  turn=np.array(Image.open(f'{D}/turn45_f.png').convert('RGB'))
  side=np.array(Image.open(f'{D}/side_f.png').convert('RGB'))
  DEG=float(os.environ.get('DEG','30'))
  S=build();QNI=samples(S)
  # 步驟圖（斜臉，照教學圖的順序）
  a=math.radians(DEG);ca,sa=math.cos(a),math.sin(a)
  def proj(p):return int(math.floor(126+p[0]*ca-p[2]*sa)),int(math.floor(p[1]))
  s1=turn.copy()
  for ph in np.linspace(PHC,PHF,200):
    p=part_pt(ph,R);X,Y=proj(p)
    if p[0]*sa+p[2]*ca>-20:s1[Y,X]=(220,60,60)          # 1. 分線（畫在頭上）
  bangs=[st for st in S if st.kind=='bang'];sides=[st for st in S if st.kind in('bang','curtain','lock')]
  s2=render(turn,DEG,126,'mass',bangs,samples(bangs))
  def brow(img,deg,cx):
    al=math.radians(deg)
    for xx in np.linspace(-BROW,BROW,120):
      z=math.sqrt(R*R-xx*xx-14*14)+3;X=int(cx+xx*math.cos(al)-z*math.sin(al));img[CY+15:CY+17,X]=(230,40,40)
  brow(s2,DEG,126)
  s3=render(turn,DEG,126,'mass',sides,samples(sides))
  s4=render(turn,DEG,126,'mass',S,QNI);s5=render(turn,DEG,126,'final',S,QNI)
  labs=['1. 頭頂先畫分線','2. 前髮：分線左右兩半','3. 兩邊各一大片長髮','4. 後髮','5. 邊＋髮絲＋遊び毛＋高光']
  c=Image.new('RGB',(5*300,380),'white');d=ImageDraw.Draw(c)
  for k,(im,lab) in enumerate(zip([s1,s2,s3,s4,s5],labs)):
    d.text((k*300+6,4),lab,fill='black',font=F)
    c.paste(Image.fromarray(im).crop((20,20,236,256)).resize((290,317),Image.NEAREST),(k*300+5,40))
  c.save(sys.argv[2])
  imgs=[render(front,0,128,'final',S,QNI),s5,render(side,90,140,'final',S,QNI)]
  c=Image.new('RGB',(3*400,440),'white')
  for k,im in enumerate(imgs):c.paste(Image.fromarray(im).crop((18,14,238,256)).resize((366,402),Image.NEAREST),(k*400+17,30))
  c.save(sys.argv[3])
