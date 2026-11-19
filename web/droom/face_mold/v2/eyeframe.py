# 眼眶的種類（2026-11-19，使用者給的「チビキャラの目の形デザイン」：つり目 4 種、たれ目 4 種）
# 每一種用幾條線定義（眼睛自己的座標：x 往外眼角為正、y 往下；寬約 25、和舊眼睛同一個單位，畫的時候再乘 ES）：
#   up   上眼線（從內眼角到外眼角）、upw 上眼線粗細（內、中、外）
#   hooks 上眼線兩端的小勾（線段，粗細）
#   lo   下緣（圍出眼睛開口用；從內到外）、lod 下眼線實際畫出來的那段（0～1）、low 粗細
#   side 外側的直線（つり目・四角那種，畫粗線、也當開口的邊）
#   iris 黑眼珠中心的位移；crease 雙眼皮線畫不畫
import math
TYPES={
 'T1':dict(name='つり目・杏仁',
   up=[(-12,1),(-8,-4),(-2,-7),(5,-7.5),(11,-6.2),(14,-5.6)],upw=(1.2,2.8,2.2),
   hooks=[([(14,-5.6),(13.2,-3.4)],1.4),([(-12,1),(-13.6,2.6)],1.0)],
   lo=[(-12,1),(-6,4.6),(2,5.6),(8,4.2),(12,.8),(14,-5.6)],lod=(.28,.86),low=1.0,iris=(0,0),crease=True),
 'T2':dict(name='つり目・四角',
   up=[(-12,-2),(-8,-6),(0,-7.6),(8,-7.2),(15,-6.8)],upw=(1.6,3.0,2.6),
   hooks=[([(-12,-2),(-12.6,1.2)],1.6),([(15,-6.8),(17,-7.6)],1.2)],
   side=[(13.6,-6.4),(12.6,-.5),(9.5,5)],sidew=2.2,
   lo=[(-12,4),(-6,5.6),(4,5.6),(9.5,5)],lod=(0,1),low=1.6,lohook=([(-12,4),(-12.8,2.8)],1.2),iris=(0,0),crease=True),
 'T3':dict(name='つり目・切れ長',
   up=[(-13,-1),(-6,-4.6),(4,-5.6),(12,-6.2),(17.5,-7.8)],upw=(1.0,3.0,1.0),
   hooks=[([(-13,-1),(-14.2,1)],1.0)],
   lo=[(-13,-1),(-6,3),(4,3.6),(10,1.6),(13.2,-3.2)],lod=(.18,1),low=1.1,lotip=1.8,iris=(.5,-.6),crease=True),
 'T4':dict(name='つり目・細い',
   up=[(-9,.5),(0,-2.4),(9.5,-5.2)],upw=(.8,2.4,.8),hooks=[],
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
    a,b,c=T['upw'];n=len(s.up)
    s.upw=[(a+(b-a)*(i/(n-1))*2) if i<n/2 else (b+(c-b)*((i/(n-1))-.5)*2) for i in range(n)]
    s.box=(min(p[0] for p in s.poly)-4,max(p[0] for p in s.poly)+4,min(p[1] for p in s.poly)-6,max(p[1] for p in s.poly)+4)
  def _near(s,x,y,pts,w):
    best=None
    for i in range(len(pts)-1):
      d,t=_seg_d(x,y,pts[i],pts[i+1]);ww=w[i]+(w[i+1]-w[i])*t if isinstance(w,list) else w
      if d<=ww/2 and (best is None or d<best):best=d
    return best is not None
  def at(s,x,y,sgn=1):
    T=s.T
    # 雙眼皮線：上眼線往上 3.6，只畫中段
    if T.get('crease'):
      for i in range(len(s.up)//5,len(s.up)*4//5):
        ux,uy=s.up[i]
        if abs(x-ux)<.5 and abs(y-(uy-3.6))<.5:return 'c'
    if s._near(x,y,s.up,s.upw):return 'K'
    for seg,w in T.get('hooks',[]):
      if s._near(x,y,seg,w):return 'K'
    if s.side and s._near(x,y,s.side,T['sidew']):return 'K'
    n=len(s.lo);i0,i1=int(T['lod'][0]*(n-1)),int(T['lod'][1]*(n-1))
    if i1>i0:
      seg=s.lo[i0:i1+1];lw=T['low']
      if 'lotip' in T:w=[lw+(T['lotip']-lw)*(k/(len(seg)-1))**2 for k in range(len(seg))]
      else:w=lw
      if s._near(x,y,seg,w):return 'L' if lw<1.5 else 'K'
    for key in('lohook','lotail'):
      if key in T and s._near(x,y,*T[key]):return 'L'
    if T.get('lashes'):
      for k in range(3,len(s.lo)-3,6):
        lx,ly=s.lo[k]
        if abs(x-lx)<.45 and ly<y<ly+1.4:return 'L'
    if not _inpoly(x,y,s.poly):return None
    # 眼睛裡面（同舊眼睛的配色）
    ic=(.5+T['iris'][0],.3+T['iris'][1]);k=T.get('irs',1);IRX,IRY=6.2*k,7*k
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
