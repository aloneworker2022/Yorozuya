# 眼眶的種類（2026-11-19，使用者給的「チビキャラの目の形デザイン」：つり目 4 種、たれ目 4 種）
# 每一種用幾條線定義（眼睛自己的座標：x 往外眼角為正、y 往下；寬約 25、和舊眼睛同一個單位，畫的時候再乘 ES）：
#   up   上眼線（從內眼角到外眼角）、upw 上眼線粗細（內、中、外）
#   hooks 上眼線兩端的小勾（線段，粗細）
#   lo   下緣（圍出眼睛開口用；從內到外）、lod 下眼線實際畫出來的那段（0～1）、low 粗細
#   side 外側的直線（つり目・四角那種，畫粗線、也當開口的邊）
#   iris 黑眼珠中心的位移；crease 雙眼皮線畫不畫
import math
# 2026-11-19 使用者：下眼眶太明顯 → 下眼線改淡色（陰影色 c）、細；四角的下眼線不要；眼角的勾、外側直線改細
LOWC='c';HOOKK=.7
# 2026-11-19 第二本教學（普通／つり目／たれ目各 6 個）：上眼線外半段長出一根根細睫毛、下眼線外側幾根小短毛、
# 雙眼皮線拉長貼著上眼線、黑眼珠改成直的橢圓（比較高、比較窄）
LASHN=4;LASHL=3.0;IRISW,IRISH=5.6,7.8
TYPES={
 'N1':dict(name='普通・杏仁',
   up=[(-12,0),(-7,-4.5),(0,-6.2),(7,-5.6),(12.5,-2.6),(14.2,-1.6)],upw=(1.2,2.8,1.6),
   hooks=[([(-12,0),(-13.2,1.4)],1.0)],
   lo=[(-12,0),(-6,4),(2,5),(9,3.6),(13,.4),(14.2,-1.6)],lod=(.3,.9),low=1.0,iris=(0,-.2),crease=True),
 'N2':dict(name='普通・大きい',
   up=[(-11,1),(-9,-5),(-2,-8.4),(6,-8),(11,-4.2),(13.2,-1)],upw=(1.4,3.0,1.8),
   hooks=[([(-11,1),(-12.2,2.6)],1.0)],
   lo=[(-11,1),(-8,5.6),(0,7),(8,6),(12,2.2),(13.2,-1)],lod=(.2,.85),low=1.0,iris=(0,.4),irs=1.08,crease=True),
 'N3':dict(name='普通・横長',
   up=[(-14,0),(-8,-4.2),(0,-5.4),(8,-5),(13,-3),(15.8,-2)],upw=(1.0,2.6,1.4),
   hooks=[([(-14,0),(-15.2,1.2)],1.0)],
   lo=[(-14,0),(-6,3.6),(4,4.2),(11,2.6),(15.8,-2)],lod=(.25,.9),low=1.0,iris=(0,-.6),crease=True),
 'T1':dict(name='つり目・杏仁',
   up=[(-12,1),(-8,-4),(-2,-7),(5,-7.5),(11,-6.2),(14,-5.6)],upw=(1.2,2.8,2.2),
   hooks=[([(14,-5.6),(13.2,-3.4)],1.4),([(-12,1),(-13.6,2.6)],1.0)],
   lo=[(-12,1),(-6,4.6),(2,5.6),(8,4.2),(12,.8),(14,-5.6)],lod=(.28,.86),low=1.0,iris=(0,0),crease=True),
 'T2':dict(name='つり目・四角',
   up=[(-12,-2),(-8,-6),(0,-7.6),(8,-7.2),(15,-6.8)],upw=(1.6,3.0,2.6),
   hooks=[([(-12,-2),(-12.6,1.2)],1.6),([(15,-6.8),(17,-7.6)],1.2)],
   side=[(13.6,-6.4),(12.6,-.5),(9.5,5)],sidew=1.1,
   lo=[(-12,4),(-6,5.6),(4,5.6),(9.5,5)],lod=(0,0),low=1.0,iris=(0,0),crease=True),
 'T3':dict(name='つり目・切れ長',
   up=[(-13,-1),(-6,-4.6),(4,-5.6),(12,-6.2),(17.5,-7.8)],upw=(1.0,3.0,1.0),
   hooks=[([(-13,-1),(-14.2,1)],1.0)],
   lo=[(-13,-1),(-6,3),(4,3.6),(10,1.6),(13.2,-3.2)],lod=(.18,1),low=1.0,lotip=1.2,iris=(.5,-.6),crease=True),
 'T4':dict(name='つり目・細い',
   up=[(-9,.5),(0,-2.4),(9.5,-5.2)],upw=(.8,2.4,.8),hooks=[],lash=0,
   lo=[(-9,.5),(-4,3.2),(3,3.2),(7.5,1.4),(9.5,-5.2)],lod=(.25,.8),low=1.0,iris=(0,-1.2),crease=False),
 'R1':dict(name='たれ目・まる',
   up=[(-11,1.2),(-9.5,-4.6),(-3,-8.6),(4,-8),(9.6,-3.4),(12,3)],upw=(1.4,2.8,2.0),
   hooks=[([(-11,1.2),(-12,2.4)],1.0)],
   lo=[(-11,1.2),(-8,5.4),(0,6.6),(6,6.2),(12,3)],lod=(.12,.72),low=1.2,iris=(-.5,0),crease=True),
 'R2':dict(name='たれ目・ねむい',
   up=[(-13,-3),(-6,-5),(2,-4.6),(9,-2.4),(15.5,1.8)],upw=(1.0,3.0,1.2),
   hooks=[([(-13,-3),(-14.4,-2.4)],1.0)],
   lo=[(-13,-3),(-9,3.6),(0,4.6),(7,5),(11,3.6),(15.5,1.8)],lod=(.12,.8),low=1.3,lotail=([(11,3.6),(12.6,2.4)],1.2),iris=(0,1.2),crease=True),
 'R3':dict(name='たれ目・小さい',
   up=[(-7,-.5),(-4.5,-5.6),(.5,-7),(5,-4.2),(7,1.2)],upw=(1.2,2.4,1.6),
   hooks=[([(7,1.2),(8.4,.4)],1.0)],
   lo=[(-7,-.5),(-4,4.6),(0,5),(4,4.6),(7,1.2)],lod=(.3,.7),low=1.0,iris=(0,.2),irs=.72,crease=False),
 'R4':dict(name='たれ目・半目',
   up=[(-13,-1),(-6,-5),(2,-5.6),(10,-3.2),(16.5,.8)],upw=(1.0,2.8,1.0),
   hooks=[([(-13,-1),(-14.2,-.2)],1.0)],
   lo=[(-11.5,2.6),(-2,4.6),(6,4.6),(12.5,2.4),(16.5,.8)],lod=(0,.85),low=1.1,lashes=True,iris=(0,.8),crease=True),
}
def _cr(pts,n=10):
  P=[pts[0]]+pts+[pts[-1]];o=[]
  for i in range(len(P)-3):
    p0,p1,p2,p3=P[i:i+4]
    for k in range(n):
      t=k/n;t2=t*t;t3=t2*t
      o.append(tuple(.5*(2*p1[j]+(-p0[j]+p2[j])*t+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3) for j in (0,1)))
  o.append(pts[-1]);return o
def _inpoly(x,y,poly):
  ins=False
  for i in range(len(poly)):
    (xi,yi),(xj,yj)=poly[i],poly[i-1]
    if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:ins=not ins
  return ins
def _seg_d(px,py,a,b):
  ax,ay=a;bx,by=b;dx,dy=bx-ax,by-ay;L=dx*dx+dy*dy
  t=0 if L==0 else max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L))
  return math.hypot(px-ax-t*dx,py-ay-t*dy),t
class Frame:
  def __init__(s,key):
    T=TYPES[key];s.T=T
    s.up=_cr(T['up']);s.lo=_cr(T['lo'])
    side=_cr(T['side'],6) if 'side' in T else []
    s.side=side
    s.poly=s.up+side+s.lo[::-1]
    # 上眼線粗細：沿著線 0→1，內→中→外
    a,b,c=T['upw'];n=len(s.up);c=max(1.0,c*HOOKK)   # 外眼角那端也收細
    s.upw=[(a+(b-a)*(i/(n-1))*2) if i<n/2 else (b+(c-b)*((i/(n-1))-.5)*2) for i in range(n)]
    # 上睫毛：上眼線 55%～95% 的地方，往上偏外長出去，越外越長
    s.lashsegs=[]
    nl=T.get('lash',LASHN);n=len(s.up)
    for j in range(nl):
      t=.58+.36*j/max(1,nl-1);i=min(n-2,int(t*(n-1)))
      (x0,y0),(x1,y1)=s.up[i],s.up[i+1];tx,ty=x1-x0,y1-y0;L=math.hypot(tx,ty) or 1;tx/=L;ty/=L
      nx,ny=ty,-tx;dx,dy=nx*.75+tx*.65,ny*.75+ty*.65;D=math.hypot(dx,dy);dx/=D;dy/=D
      ln=LASHL*(.75+.45*j/max(1,nl-1));bx,by=x0-nx*.6,y0-ny*.6
      s.lashsegs.append([(bx,by),(bx+dx*ln,by+dy*ln)])
    # 下睫毛：下眼線外側 2～3 根小短毛（淡色）
    s.lolash=[]
    if T['lod'][1]>T['lod'][0]:
      lo=s.lo;n2=len(lo)
      for t in(.62,.72,.82):
        i=min(n2-2,int(t*(n2-1)))
        if not(T['lod'][0]<=t<=T['lod'][1]):continue
        (x0,y0),(x1,y1)=lo[i],lo[i+1];tx,ty=x1-x0,y1-y0;L=math.hypot(tx,ty) or 1;tx/=L;ty/=L
        nx,ny=-ty,tx;dx,dy=nx*.8+tx*.5,ny*.8+ty*.5;D=math.hypot(dx,dy)
        s.lolash.append([(x0,y0),(x0+dx/D*1.5,y0+dy/D*1.5)])
    s.box=(min(p[0] for p in s.poly)-5,max(p[0] for p in s.poly)+6,min(p[1] for p in s.poly)-8,max(p[1] for p in s.poly)+4)
  def _near(s,x,y,pts,w):
    best=None
    for i in range(len(pts)-1):
      d,t=_seg_d(x,y,pts[i],pts[i+1]);ww=w[i]+(w[i+1]-w[i])*t if isinstance(w,list) else w
      if d<=ww/2 and (best is None or d<best):best=d
    return best is not None
  def at(s,x,y,sgn=1,idx=0):
    T=s.T
    # 雙眼皮線：上眼線往上 3.6，只畫中段
    if T.get('crease'):
      for i in range(len(s.up)//8,len(s.up)*9//10):
        ux,uy=s.up[i]
        if abs(x-ux)<.5 and abs(y-(uy-3.6))<.5:return 'c'
    if s._near(x,y,s.up,s.upw):return 'K'
    for seg in s.lashsegs:
      if s._near(x,y,seg,.8):return 'K'
    for seg,w in T.get('hooks',[]):
      if s._near(x,y,seg,w*HOOKK):return 'K'
    if s.side and s._near(x,y,s.side,T['sidew']):return 'K'
    n=len(s.lo);i0,i1=int(T['lod'][0]*(n-1)),int(T['lod'][1]*(n-1))
    if i1>i0:
      seg=s.lo[i0:i1+1];lw=T['low']
      if 'lotip' in T:w=[lw+(T['lotip']-lw)*(k/(len(seg)-1))**2 for k in range(len(seg))]
      else:w=lw
      if s._near(x,y,seg,w):return LOWC
    for key in('lohook','lotail'):
      if key in T and s._near(x,y,T[key][0],T[key][1]*HOOKK):return LOWC
    for seg in s.lolash:
      if s._near(x,y,seg,.7):return LOWC
    if not _inpoly(x,y,s.poly):return None
    # 眼睛裡面（同舊眼睛的配色）
    ic=(.5+T['iris'][0]+idx,.3+T['iris'][1]);k=T.get('irs',1);IRX,IRY=IRISW*k,IRISH*k
    r=math.hypot((x-ic[0])/IRX,(y-ic[1])/IRY)
    uy=min((p[1] for p in s.up if abs(p[0]-x)<.6),default=-9)
    if r<1:
      hx=sgn*(x-ic[0])+ic[0]
      if math.hypot((hx-ic[0]+3.1*k)/(1.4*k),(y-ic[1]+2.9*k)/(1.6*k))<1:return 'H'
      if math.hypot((hx-ic[0]-2.3*k)/(.8*k),(y-ic[1]-2.7*k)/(.8*k))<1:return 'H'
      if math.hypot((x-ic[0])/(2.3*k),(y-ic[1]+.3)/(3.4*k))<1:return 'P'
      if r>.86:return 'I'
      v=(y-ic[1]+IRY)/(2*IRY);return 'I' if v<.42 else 'i' if v<.72 else 'j'
    return 'w' if y<uy+2.2 else 'W'

  # 側臉：只看得到黑眼珠前緣以後那一段（臉是圓的，內眼角那半轉到後面去），橫向壓成 KS；
  # 前緣斜斜往後下（教學：側面的眼睛是三角形），前緣畫一條細線，上眼線往前多伸一點（睫毛刺出去）
  def at_side(s,u,v,KS=.85):
    T=s.T;k=T.get('irs',1)
    xf=.5+T['iris'][0]-IRISW*k*.55
    x=xf+u/KS
    uy=min((p[1] for p in s.up if abs(p[0]-xf)<.7),default=v)
    cut=(v-uy)*.45
    if u<cut-.9/KS*.5:
      # 前緣前面：只留上眼線往前刺出去的那一小段
      if u>cut-1.6 and v<uy+.3 and v>uy-1.6 and u>-1.6:return 'K'
      return None
    ch=s.at(x,v,1,idx=-.8)
    if ch and u<cut+.35 and ch not in('K','c'):return 'k'
    return ch
