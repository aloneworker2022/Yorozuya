# 臉輪廓 v2（2026-11-18 重來）：照使用者給的參考圖「How to draw basic faces」量出來的比例
# 參考圖座標（原圖像素）直接換算到 256 畫布；只畫輪廓，不畫五官
# 用法：python3 outline.py [輸出資料夾]；GUIDE=0 拿掉輔助線
import os,sys,math
from PIL import Image,ImageDraw
import numpy as np
N=256;SK=(242,204,177);SH=(216,166,140);DK=(184,124,104);GL=(200,150,128)
R=72;CY=112                      # 頭蓋圓：半徑 72、圓心 y=112（頭頂 40，下巴 220）
S=R/75.5                         # 參考圖的圓半徑 75.5
G=os.environ.get('GUIDE','1')!='0'
out=sys.argv[1] if len(sys.argv)>1 else '.'
def cr(pts,closed=False,n=8):     # Catmull-Rom，讓手量的點連得順
  P=pts+pts[:3] if closed else [pts[0]]+pts+[pts[-1]];o=[]
  for i in range(len(P)-3):
    p0,p1,p2,p3=P[i:i+4]
    for k in range(n):
      t=k/n;t2=t*t;t3=t2*t
      o.append(tuple(.5*(2*p1[j]+(-p0[j]+p2[j])*t+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3) for j in (0,1)))
  if not closed:o.append(pts[-1])
  return o
def mask(poly):
  m=Image.new('L',(N,N),0);ImageDraw.Draw(m).polygon([(x,y) for x,y in poly],fill=1);return np.array(m).astype(bool)
def edge(m):
  e=np.zeros_like(m)
  for dy,dx in((1,0),(-1,0),(0,1),(0,-1)):e|=m&~np.roll(np.roll(m,dy,0),dx,1)
  return e
# 輔助線的高度（參考圖：圓頂 424、眉 519、眼 545、鼻 577＝圓底、嘴 588、下巴 614；圓心 499.5）
YREF=dict(brow=519,eye=545,nose=577,mouth=588,chin=614)
def Y(yr):return CY+(yr-499.5)*S
LINES={k:Y(v) for k,v in YREF.items()}

# ── 正面 ──
def front():
  cx=128;T=lambda hw,yr:(cx+hw*S,Y(yr))
  # 臉頰→下巴：參考圖左右量的半寬（平均）。眼線以下輪廓比圓還外面一點，往下收成 V，下巴留一小段平
  jaw=[(505,75.3),(530,72.5),(545,68),(560,61),(572,54),(582,47),(595,33),(607,17),(613,6),(614.5,1)]
  right=cr([T(h,y) for y,h in jaw],n=6)
  top=[]
  a0=math.asin((505-499.5)/75.5)
  for i in range(181):
    a=a0+(math.pi*2-2*a0-math.pi)*0+0
  # 圓：右邊 505 那點 → 經過頭頂 → 左邊 505
  th=[a0-(math.pi+2*a0)*i/180 for i in range(181)]
  arc=[(cx+R*math.cos(t),CY+R*math.sin(t)) for t in th]   # 從右往上繞到左
  left=[(2*cx-x,y) for x,y in right]
  poly=arc+left+right[::-1][1:]
  face=mask(poly)
  neck=mask([(cx-19,Y(590)),(cx-19,Y(650)),(cx-23,N+2),(cx+23,N+2),(cx+19,Y(650)),(cx+19,Y(590))])
  # 耳朵（左邊量的，右邊鏡射）：耳朵頂在眼線上面一點，底接在鼻線
  # 耳朵（參考圖：正面只露出細細一條）：上端在眼線上面一點、凸出臉 3～4 格，往下貼著臉收，尖端接在鼻線的下顎上
  hwat=lambda yr:next(h0+(h1-h0)*(yr-y0)/(y1-y0) for (y0,h0),(y1,h1) in zip(jaw,jaw[1:]) if y0<=yr<=y1)
  ear=[(134.5-hwat(536)+1,536),(134.5-hwat(536)-3,538),(134.5-hwat(545)-4,545),(134.5-hwat(556)-4,556),(134.5-hwat(567)-2.5,567),(134.5-hwat(578)+1,578),(134.5-hwat(565)+3,565),(134.5-hwat(545)+3,545)]
  img=np.full((N,N,3),255,np.uint8)
  img[neck]=SK
  # 下巴壓在脖子上：脖子上一條影子（不描線）
  sh=neck&~face&np.roll(face,3,0);img[sh]=SH
  for s in(1,-1):
    em=mask([(cx+s*(x-134.5)*S,Y(y)) for x,y in cr(ear[:6],False,6)+ear[6:]]);img[em]=SK;img[em&edge(em)&~face]=DK
  img[face]=SK
  return img,face,cx
# ── 側臉（面向左）──
def side():
  cx=140;T=lambda x,y:(cx+(x-322)*S,Y(y+0.5))
  cyr=498
  def circ(a,back=1.08):   # 圓（後腦往後拉一點＝參考圖第 3 步）
    dx=75.5*math.cos(a);dy=75.5*math.sin(a)
    if dx>0:dx*=back
    return T(322+dx,cyr+dy)
  # 臉的前緣（參考圖量的點）：額→眉骨→眼窩→鼻樑→鼻頭→人中→上唇→嘴角→下唇→下巴凹→下巴→下巴底
  prof=[(250,520),(253,532),(256,545),(250,554),(242,562),(238,567),(243,573),(246,577),(244,582),(249,588),(249,593),(254,598),(256,604),(258,610),(264,613),(276,612),(290,609),(305,605)]
  af=math.atan2(520-cyr,250-322)          # 額頭接上圓的角度
  arc=[circ(af+(2*math.pi-af+math.radians(52))*0+ (math.radians(52)+2*math.pi-af)*i/120 ) for i in range(121)]
  # 上面那行：從額頭（左上）順時針繞過頭頂、後腦，到後下方 52°
  bx,by=arc[-1]
  nape=[(bx,by),(bx-2,by+10),(bx-3,by+22),(bx-1,by+36),(bx+6,N+2)]
  neckf=[T(328,660),T(320,640),T(311,620),T(305,605)]
  body=arc+cr(nape,n=6)[1:]+[T(337,680)]+cr([T(337,680)]+neckf,n=6)[1:]+cr([T(x,y) for x,y in prof],n=5)[1:]
  head=mask(body)
  img=np.full((N,N,3),255,np.uint8);img[head]=SK
  # 下顎：下巴底 → 下顎角 → 耳朵下面，用陰影（下巴下面脖子上一塊，前寬後窄）
  jl=cr([T(266,613),T(290,609),T(310,601),T(318,593),T(321,585)],n=8)
  for i,(x,y) in enumerate(jl):
    w=max(1,round(4-3*i/len(jl)))
    for k in range(1,w+1):
      xi,yi=round(x),round(y)+k
      if head[yi,xi]:img[yi,xi]=SH
  ear=[(329,546),(336,540),(345,539),(352,547),(352,560),(346,572),(337,580),(327,584),(324,575),(326,560)]
  em=mask([T(x,y) for x,y in cr(ear[:6],False,6)+ear[6:]]);img[em]=SK;img[em&edge(em)]=DK
  for x,y in cr([T(333,547),T(343,545),T(347,553),T(344,566)],n=6):img[round(y),round(x)]=SH
  return img,head,cx
def guides(img,m,cx,front_):
  if not G:return
  def dot(x,y,c=GL):
    x,y=round(x),round(y)
    if 0<=x<N and 0<=y<N and m[y,x]:img[y,x]=c
  for y in range(N):dot(cx,y) if front_ else None
  for k,y in LINES.items():
    for x in range(N):
      if (x//2)%2==0 or k=='eye':dot(x,y)
  n=0
  for i in range(720):
    a=i/720*2*math.pi
    if (i//6)%2==0:
      x,y=cx+R*math.cos(a),CY+R*math.sin(a)
      xi,yi=round(x),round(y)
      if 0<=xi<N and 0<=yi<N:img[yi,xi]=GL if m[yi,xi] else (225,180,160)
fi,fm,fc=front();guides(fi,fm,fc,True)
si,sm,sc=side();guides(si,sm,sc,False)
Image.fromarray(fi).save(f'{out}/front.png');Image.fromarray(si).save(f'{out}/side.png')
