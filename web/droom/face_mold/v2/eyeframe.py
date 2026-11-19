# 眼眶的種類（2026-11-19，使用者給的「チビキャラの目の形デザイン」：つり目 4 種、たれ目 4 種）
# 每一種用幾條線定義（眼睛自己的座標：x 往外眼角為正、y 往下；寬約 25、和舊眼睛同一個單位，畫的時候再乘 ES）：
#   up   上眼線（從內眼角到外眼角）、upw 上眼線粗細（內、中、外）
#   hooks 上眼線兩端的小勾（線段，粗細）
#   lo   下緣（圍出眼睛開口用；從內到外）、lod 下眼線實際畫出來的那段（0～1）、low 粗細
#   side 外側的直線（つり目・四角那種，畫粗線、也當開口的邊）
#   iris 黑眼珠中心的位移；crease 雙眼皮線畫不畫
import math
# 2026-11-19 使用者：下眼眶太明顯 → 下眼線改淡色（陰影色 c）、細；四角的下眼線不要；眼角的勾、外側直線改細
import os
LINE=os.environ.get('LINE')=='1'
LOWC='c';HOOKK=.7
PT=os.environ.get('PT','1')   # 瞳孔類型：1 平塗＋弧形陰影＋直瞳孔、2 漸層＋光暈＋圓瞳孔、3 色相漸層＋大亮點（0＝舊的，使用者說不要用了）
IRUP=float(os.environ.get('IRUP','0'))   # 黑眼珠往上提多少（直半徑的比例）
IRSC=float(os.environ.get('IRSC','1'))   # 黑眼珠再放大倍率
IRCENTER=os.environ.get('IRCENTER','1')=='1';IRIN=float(os.environ.get('IRIN','.6'))
# 2026-11-19 第二本教學（普通／つり目／たれ目各 6 個）：上眼線外半段長出一根根細睫毛、下眼線外側幾根小短毛、
# 雙眼皮線拉長貼著上眼線、黑眼珠改成直的橢圓（比較高、比較窄）
LASHN=4;LASHL=3.0;IRISW,IRISH=5.6,7.8
TYPES={
 # ── 2026-11-19 第二本教學「普通」那 6 個，照圖量的（眼寬當 27，原點在開口中央）──
 # 上眼線比較細、雙眼皮線貼得很近（cro）、下眼線整條畫、黑眼珠大而且上緣藏在上眼線下（ir＝中心 x,y、橫半徑、直半徑）
 # 2026-11-19 重量（使用者：黑眼球太小、要偏上）：把教學圖對到同一格子（眼寬 27）一點一點讀出來
 'A1':dict(name='普通1',up=[(-14,-.5),(-10,-3.4),(-4,-4.8),(2,-4.8),(8,-3.8),(11,-2.5),(14,-1.5)],upw=(1.0,1.8,1.2),
   hooks=[([(-14,-.5),(-13.6,.6)],1.0)],crease_pts=[(-15,-1.5),(-10,-4.6),(-2,-5.8),(6,-5.3),(10,-4)],
   lo=[(-12,2),(-6,3.5),(-2,4),(3,3.6),(6,2.6),(8,.6)],lod=(0,1),low=1.0,ir=(.4,-.75,5.6,4.8),crease=True,lash=5),
 'A2':dict(name='普通2',up=[(-14,.5),(-12,-3),(-8,-4.6),(-2,-5),(4,-4.6),(8,-3),(11,-.5),(14,.5)],upw=(1.0,2.0,1.4),
   hooks=[],crease_pts=[(-15,-3.5),(-10,-6.4),(-4,-7),(2,-6.6),(5,-5.6)],
   lo=[(-11.5,3.5),(-6,5),(0,5.5),(5,5),(8,4),(11,2.5)],lod=(0,1),low=1.0,ir=(1.6,.1,6.4,5.4),crease=True,lash=5,lolashn=6),
 'A3':dict(name='普通3',up=[(-13.5,.5),(-13,-3),(-10,-6),(-5,-8),(0,-8.3),(4,-7.5),(8,-5),(10,-2.5),(9.3,.5)],upw=(1.4,2.2,1.6),
   hooks=[([(9.6,-2),(12.6,-3.4)],1.2)],crease_pts=[(-14,-5),(-10,-8.6),(-4,-10),(2,-9.5),(7,-7.4),(10,-4.5)],
   lo=[(-12,3.8),(-8,6.5),(-3,7.7),(0,7.8),(4,7),(7,5),(9,2.5)],lod=(0,1),low=1.0,ir=(1.2,-.2,7.8,8.0),crease=True,lash=2),
 'A4':dict(name='普通4',up=[(-13.5,2),(-13,-2),(-11,-5.5),(-7,-8),(-2,-8.8),(3,-8.4),(7,-6),(9.5,-2),(10,1.5)],upw=(1.2,2.2,1.6),
   hooks=[([(10,1.5),(12.2,1.2)],1.2)],crease_pts=[(-14,-5),(-10,-8.6),(-4,-10.3),(2,-9.6),(7,-6.6),(10.5,-.5)],
   lo=[(-7.5,7.6),(-1,7.6),(5,7.4)],lod=(0,1),low=1.0,ir=(0,-.5,6.0,8.0),crease=True,lash=0),
 'A5':dict(name='普通5',up=[(-12,0),(-11,-4),(-8,-7),(-3,-8.3),(2,-8.4),(6,-7),(9,-4.5),(9.6,0)],upw=(1.6,2.4,2.0),
   hooks=[],crease_pts=[(-13,-5),(-9,-8.4),(-2,-9.8),(4,-9.6),(8,-7.6)],
   lo=[(-9.5,5.5),(-5,7),(0,7.3),(4,6.5),(7,4.5),(9,2)],lod=(0,1),low=1.0,ir=(1.3,-.4,6.9,7.7),crease=True,lash=7,lolashn=6),
 'A6':dict(name='普通6',up=[(-13.5,-6.5),(-12,-9.5),(-9,-12),(-4,-13.8),(0,-13.6),(4,-11),(7,-6.5),(9,-3.5),(9.5,-1)],upw=(1.4,2.2,1.6),
   hooks=[([(9.4,-2.5),(12.5,-2)],1.2)],crease_pts=[(-9,-14.8),(-2,-14.8),(4,-12),(8,-7.4),(10,-4.5)],
   lo=[(-8,12.2),(-2,11.9),(3,11),(6,10)],lod=(0,1),low=1.0,ir=(.4,-.3,7.6,11.9),crease=True,lash=2,lolashn=3),
 # ── つり目 6 個（教學中間那格）──
 'B1':dict(name='つり目1',up=[(-12.5,3),(-8,1),(-4,-1.6),(0,-4),(3,-4.4),(6,-3.6),(8.4,-1.4),(9,1)],upw=(2.0,1.8,1.4),
   hooks=[],crease_pts=[(-13,-1.5),(-11,-5),(-6,-6.5),(0,-6.5),(3,-5.5)],
   lo=[(-10,5.5),(-6,6.2),(-2,6.2),(2,5.6),(6,4),(8.4,2)],lod=(0,1),low=1.0,ir=(2.2,0,5.2,4.3),crease=True,lash=6,lolashn=6),
 'B2':dict(name='つり目2',up=[(-14,4),(-12,1),(-8,-1.5),(-2,-3.5),(4,-4.3),(10,-4.5),(13,-5),(15,-7)],upw=(2.4,2.0,1.2),
   hooks=[],side=[(9.5,-4),(8.6,1),(8.6,2.5)],sidew=1.0,crease_pts=[(-14,-1),(-10,-3.5),(-4,-4.8),(2,-5.2)],
   lo=[(-12,5),(-6,4),(0,3.6),(6,3),(8.6,2.5)],lod=(0,1),low=1.0,lotail=([(8.6,2.5),(10.4,4)],1.0),ir=(1.5,-.5,6,4.3),crease=True,lash=0),
 'B3':dict(name='つり目3',up=[(-12,3),(-10,-1),(-6,-3.6),(0,-4.8),(6,-4.6),(9,-3.6),(12,-6.5)],upw=(2.2,2.0,1.2),
   hooks=[],side=[(7,-4.2),(6.4,0)],sidew=1.0,crease_pts=[(-14,-.5),(-10,-4),(-4,-5.2),(2,-5.2),(6,-4.5)],
   lo=[(-10,5.2),(-4,5.4),(0,5.2),(4,4.2),(7,3)],lod=(0,1),low=1.0,ir=(.4,.2,5.2,5.0),crease=True,lash=0),
 'B4':dict(name='つり目4',up=[(-14,0),(-10,-1.2),(-6,-2.5),(0,-3.6),(6,-4),(9,-4),(13,-2.5)],upw=(1.4,2.2,1.6),
   hooks=[],crease_pts=[(-13,0),(-11,-3.5),(-6,-5.5),(0,-6),(6,-5.6),(10,-4.5)],
   lo=[(-9,4),(-4,4.2),(0,4.2),(4,3.8),(7,3),(9,1)],lod=(0,1),low=1.0,ir=(.3,0,5.3,4.3),crease=True,lash=5,lolashn=5),
 'B5':dict(name='つり目5',up=[(-13,3),(-10,.5),(-6,-2.6),(0,-4),(6,-4.2),(9,-3.8),(13,-4.5)],upw=(1.6,1.6,1.4),
   hooks=[],crease_pts=[(-13,-1.5),(-8,-3.8),(0,-4.8),(5,-4.4)],
   lo=[(-10,5.6),(-6,6),(-2,6.2),(2,5.8),(5,4.5),(8,1),(8.6,-.5)],lod=(0,1),low=1.0,ir=(.8,-.4,5.2,3.8),crease=True,lash=5),
 'B6':dict(name='つり目6',up=[(-13.5,4.5),(-12,1.5),(-9,-.5),(-4,-2.5),(2,-4),(8,-4.6),(10,-4.8),(13,-7.5)],upw=(2.6,2.2,1.4),
   hooks=[],side=[(10,-4.5),(9.3,0),(8.6,3),(7,5.5)],sidew=1.0,crease_pts=[(-14,-.5),(-10,-3),(-4,-5),(2,-6),(9,-6.2)],
   lo=[(-9,7.6),(-4,8),(0,7.8),(4,7),(7,5.5)],lod=(0,1),low=1.0,ir=(-3,.2,5.1,4.4),crease=True,lash=0,lolashn=6),
 # ── たれ目 6 個（教學下面那格）──
 'C1':dict(name='たれ目1',up=[(-12,-4.6),(-11,-6.6),(-8,-7.6),(-5,-7.3),(-2,-5),(2,-1.5),(6,2),(9,4),(13.5,5.6)],upw=(2.0,2.0,1.2),
   hooks=[],crease_pts=[(-14,-8.6),(-12,-9.8),(-8,-9.6),(-2,-5.8),(4,-.6),(8,2.8)],
   lo=[(-11,3.5),(-8,6),(-4,7.6),(0,8.2),(4,8),(7,8.6)],lod=(0,1),low=1.0,ir=(0,.6,6.0,7.6),crease=True,lash=0),
 'C2':dict(name='たれ目2',up=[(-13,-2.5),(-10,-4.2),(-6,-5),(-2,-4),(2,-2),(6,0),(10,1.8),(13,3)],upw=(1.6,2.2,1.4),
   hooks=[],crease_pts=[(-11,-7.6),(-6,-8.6),(0,-6.8),(6,-3.2),(10,-.3)],
   lo=[(-11,2),(-8,4),(-5,5.5),(0,7.2),(4,7.5),(8,7),(9.4,5.6)],lod=(0,1),low=1.0,ir=(2.3,1.4,6.3,5.9),crease=True,lash=1),
 'C3':dict(name='たれ目3',up=[(-13,-3),(-10,-5.4),(-6,-5.4),(-2,-3.6),(2,-1.6),(6,.4),(8,1.6),(12,1.5)],upw=(1.6,2.2,1.6),
   hooks=[],crease_pts=[(-13,-6),(-9,-7.6),(-4,-6.8),(2,-4),(6,-2.4)],
   lo=[(-12,1.8),(-8,4),(-4,5.8),(0,6.2),(4,5.6),(6,4.4)],lod=(0,1),low=1.0,ir=(.3,.5,5.9,5.6),crease=True,lash=6),
 'C4':dict(name='たれ目4',up=[(-13,-3.5),(-10,-4.8),(-6,-5),(-2,-3.6),(2,-1.6),(6,.2),(10,1.6),(13,3)],upw=(1.6,2.2,1.4),
   hooks=[],crease_pts=[(-13,-8.6),(-8,-10.3),(-2,-9.4),(4,-6),(9,-1.5)],
   lo=[(-11,2),(-8,4),(-4,5.6),(0,6),(4,6.4),(9,5.4)],lod=(0,1),low=1.0,ir=(2.2,1.1,6.8,5.2),crease=True,lash=3,lolashn=6),
 'C5':dict(name='たれ目5',up=[(-12.5,-3.5),(-10,-7.6),(-6,-8.6),(-3,-7),(0,-4.4),(3,-1.6),(5,.6),(6,4),(6.5,7)],upw=(1.8,1.8,1.4),
   hooks=[],crease_pts=[(-13,-11.6),(-6,-12.6),(-2,-10.6),(2,-6.2),(5,-2.5)],
   lo=[(-8,7.6),(-4,9.5),(0,10.6),(3,10.8),(5,9.6),(6.5,7)],lod=(0,.9),low=1.0,ir=(.7,1,5.3,9.6),crease=True,lash=6,lolashn=3),
 'C6':dict(name='たれ目6',up=[(-13.5,-4),(-12,-8),(-8,-10.2),(-5,-10.8),(-2,-9.6),(2,-6.6),(6,-2.6),(8,0),(9.5,5),(9.5,8)],upw=(2.2,2.4,1.6),
   hooks=[([(9.5,5),(12,4)],1.2)],crease_pts=[(-12,-11.6),(-8,-13.4),(-3,-13),(2,-9.6),(6,-4.6)],
   lo=[(-10,4.6),(-8,8.4),(-4,11.2),(0,12.6),(3,12.4),(6,10.8),(8.6,8)],lod=(0,1),low=1.0,ir=(.6,1.2,7.0,11.4),crease=True,lash=0),
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
    s.up=_cr(T['up']);s.lo=_cr(T['lo']);s.crease=_cr(T['crease_pts']) if 'crease_pts' in T else []
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
      nn=T.get('lolashn',3);a0=.5 if nn<=3 else .3
      for t in[a0+(.88-a0)*q/max(1,nn-1) for q in range(nn)]:
        i=min(n2-2,int(t*(n2-1)))
        if not(T['lod'][0]<=t<=T['lod'][1]):continue
        (x0,y0),(x1,y1)=lo[i],lo[i+1];tx,ty=x1-x0,y1-y0;L=math.hypot(tx,ty) or 1;tx/=L;ty/=L
        nx,ny=-ty,tx;dx,dy=nx*.8+tx*.5,ny*.8+ty*.5;D=math.hypot(dx,dy)
        s.lolash.append([(x0,y0),(x0+dx/D*1.5,y0+dy/D*1.5)])
    # 黑眼珠橫向放在眼睛開口（黑眼珠中心那一列）的正中間，再往內眼角偏 IRIN（使用者 2026-11-19：眼珠太外面了；
    # 教學是單眼示範，黑眼珠常常偏外眼角，兩眼放到臉上會像往外看）
    s.irx=None
    if 'ir' in T:
      cy=T['ir'][1];xs=[]
      for i in range(len(s.poly)):
        (x1,y1),(x2,y2)=s.poly[i-1],s.poly[i]
        if (y1-cy)*(y2-cy)<=0 and y1!=y2:xs.append(x1+(x2-x1)*(cy-y1)/(y2-y1))
      if len(xs)>=2:s.irx=(min(xs)+max(xs))/2-IRIN
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
    if 'crease_pts' in T:
      if s._near(x,y,s.crease,.9):return 'K' if LINE else 'c'
    elif T.get('crease'):
      for i in range(len(s.up)//8,len(s.up)*9//10):
        ux,uy=s.up[i]
        if abs(x-ux)<.5 and abs(y-(uy-T.get('cro',3.6)))<.5:return 'c'
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
      if LINE:w=[min(a,1.0) for a in w] if isinstance(w,list) else min(w,1.0)   # 線稿：下眼線用 1 格深色線，看得出眼眶的形
      if s._near(x,y,seg,w):return 'K' if LINE else LOWC
    for key in('lohook','lotail'):
      if key in T and s._near(x,y,T[key][0],T[key][1]*HOOKK):return LOWC
    for seg in s.lolash:
      if s._near(x,y,seg,.7):return 'K' if LINE else LOWC
    if not _inpoly(x,y,s.poly):return None
    # 眼睛裡面（同舊眼睛的配色）
    if 'ir' in T:   # 照教學量的黑眼珠：中心、橫半徑、直半徑（大、上緣藏在上眼線下面）
      ic=((s.irx if (s.irx is not None and IRCENTER) else T['ir'][0])+idx,T['ir'][1]);IRX,IRY=T['ir'][2]*IRSC,T['ir'][3]*IRSC;k=min(IRX/IRISW,IRY/IRISH)
      ic=(ic[0],ic[1]-IRUP*IRY)   # 黑眼珠往上提（下面露出眼白的版本，使用者 2026-11-19）
    else:ic=(.5+T['iris'][0]+idx,.3+T['iris'][1]);k=T.get('irs',1);IRX,IRY=IRISW*k,IRISH*k
    r=math.hypot((x-ic[0])/IRX,(y-ic[1])/IRY)
    if LINE:   # 線稿模式（使用者：先只看眼眶和瞳孔、不要著色）：黑眼珠只畫一圈外框
      return 'K' if 1-.9/min(IRX,IRY)<=r<1 else None
    uy=min((p[1] for p in s.up if abs(p[0]-x)<.6),default=-9)
    if r<1 and PT=='1':
      # 瞳孔類型 1（使用者給的第一張）：平塗；黑眼珠外框深、上半一塊弧形陰影（上眼皮蓋下來）、裡面一圈細線、
      # 中間直立的小橢圓瞳孔（深色框、裡面淺、正中一條深色直線）；沒有亮點
      dx,dy=x-ic[0],y-ic[1]
      if r>1-.9/min(IRX,IRY):return 'O'   # 外框用黑眼珠的深色、不用黑（使用者 2026-11-19）
      pr=math.hypot(dx/(IRX*.2),dy/(IRY*.42))
      if pr<1:
        if pr>1-.9/(IRX*.2) or abs(dx)<.45:return 'P'
        return 'j'
      if abs(r-.66)<.55/min(IRX,IRY):return 'I'
      if math.hypot((x-(ic[0]+.35*IRX))/(1.15*IRX),(y-(ic[1]-1.0*IRY))/(.95*IRY))<1:return 'I'
      return 'i'
    if r<1 and PT=='3':
      # 瞳孔類型 3（使用者給的第三張）：上紫紅→粉→橘→下面黃的色相漸層、沒有黑瞳孔（中間一圈深粉細環＋下面一道淺色笑弧）、
      # 上面兩塊大白亮點（左大右小）；外框用黑眼珠的深色、細
      dx,dy=x-ic[0],y-ic[1];hx=sgn*dx;m=min(IRX,IRY)
      if math.hypot((hx+.34*IRX)/(.28*IRX+.4),(dy+.52*IRY)/(.2*IRY+.4))<1:return 'H'
      if math.hypot((hx-.36*IRX)/(.15*IRX+.3),(dy+.5*IRY)/(.13*IRY+.3))<1:return 'H'
      if r>1-.9/m:return 'O'
      pr=math.hypot(dx,dy*IRX/IRY)/(.3*IRX)
      if abs(pr-1)<.9/(.3*IRX):return 'g1'
      if 1.25<pr<1.25+1.1/(.3*IRX) and dy>.15*IRY*.3:return 'g4'
      v=(y-ic[1]+IRY)/(2*IRY);return 'g1' if v<.3 else 'g2' if v<.52 else 'g3' if v<.76 else 'g4'
    if r<1 and PT=='2':
      # 瞳孔類型 2（使用者給的第二張）：外框一圈深色、上面暗下面亮的漸層、瞳孔周圍一圈亮的光暈、圓的黑瞳孔、左上一個白亮點
      dx,dy=x-ic[0],y-ic[1];hx=sgn*dx
      pr=math.hypot(dx,dy)/(.3*min(IRX,IRY))
      if math.hypot((hx+.42*min(IRX,IRY)*.6)/(.13*min(IRX,IRY)+.5),(dy+.42*min(IRX,IRY)*.6)/(.13*min(IRX,IRY)+.5))<1:return 'H'
      if pr<1:return 'P'
      if r>1-1.2/min(IRX,IRY):return 'O'
      if pr<1.75:return 'j'
      v=(y-ic[1]+IRY)/(2*IRY);return 'I' if v<.36 else 'i' if v<.7 else 'j'
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
