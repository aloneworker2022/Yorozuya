# 臉模 v2：頭髮改成「一片一片的髮束」組起來（使用者 2026-11-19：先加一片片、再畫邊，不是先一大片再畫線）
# 每一片＝一個有寬度的帶子：從髮旋附近出發、沿著頭的圓弧（經線）往下，到髮尾收尖或收鈍；
# 片和片會疊在一起：先畫後面的（大片），再畫前面的（小片），上面那片在下面那片投一道影子（光從左上，影子落在右下）；
# 片自己的邊：亮的那側（左）不畫線，背光那側（右）一格暗；沒有黑色外框。
# 高光（光環）畫在每一片上，各片稍微錯開，在片的邊上自然斷開。
# 目前只有正面；用法：HS=hime|bob python3 hair_clumps.py <有 front_f.png 的資料夾> <輸出.png>
import os,sys,math,random
import numpy as np
from PIL import Image,ImageDraw,ImageFont
N=256;CX,CY,R=128,112,72;RO=R+7
HS=os.environ.get('HS','hime')
C=dict(hi=(246,228,170),li=(222,192,124),mid=(190,152,90),sh=(150,114,64),dk=(112,82,48))
SKSH=(222,178,152)
W=(128,36)
BANG_Y=136 if HS!='bob' else 133
def pm(pts):
  m=Image.new('L',(N,N),0);ImageDraw.Draw(m).polygon([(round(x),round(y)) for x,y in pts],fill=1);return np.array(m).astype(bool)
def mer(phi,y):
  # 經線：從髮旋沿著頭的圓弧往下；赤道以下直直垂
  c=max(-1,min(1,(CY-y)/RO));th=math.acos(c)
  if y>CY:th=math.pi/2
  return CX+RO*.97*math.sin(th)*math.sin(math.radians(phi))
class Clump:
  def __init__(s,kind,pts,layer,rid):
    s.kind,s.pts,s.layer,s.rid=kind,pts,layer,rid
    s.mask=pm(pts)
def bang_clumps(rnd):
  # 瀏海：一片片，左右邊界各自是一條經線（稍微往內縮、和隔壁有一點點疊）；寬度在中段最寬、往髮旋收窄、往髮尾收尖
  out=[];p=-58;big=rnd.random()<.5;i=0
  while p<58:
    w=rnd.uniform(15,20) if big else rnd.uniform(6,9)
    a,b=p-(1.2 if big else .6),min(60,p+w+(1.2 if big else .6))
    L=(rnd.choice([1,2,3,4,5]) if big else rnd.choice([-2,-1,0,1,2]))   # 不要垂到眼睛
    tipy=BANG_Y-2+L;pointed=rnd.random()<(.7 if big else .5);lean=rnd.uniform(-.25,.25)
    top=CY-RO*.93
    left=[];right=[]
    for k in range(25):
      t=k/24;y=top+(tipy-top)*t
      pinch=.35+.65*math.sin(min(1,t*1.15)*math.pi/2)        # 往髮旋那頭收窄
      m=(a+b)/2;hw=(b-a)/2*pinch
      if t>.82 and pointed:hw*=max(.05,(1-t)/.18)            # 髮尾收尖
      left.append((mer(m-hw,y),y));right.append((mer(m+hw,y),y))
    tipx=mer((a+b)/2+lean*(b-a),tipy+(3 if pointed else 0))
    pts=left+[(tipx,tipy+(3 if pointed else 1))]+right[::-1]
    out.append(Clump('bang',pts,0 if big else 1,i));p+=w;big=(not big) if rnd.random()<.8 else big;i+=1
  return out
def side_clumps(rnd):
  out=[];bottom=240 if HS!='bob' else 216
  for s in(-1,1):
    x=CX+s*53;i=0
    while abs(x-CX)<RO-1:
      w=min(rnd.uniform(8,13),RO+1-abs(x-CX));xa,xb=(x,x+s*w) if s>0 else (x+s*w,x)
      ex=max(abs(xa-CX),abs(xb-CX))
      top=CY-math.sqrt(max(0,RO*RO-ex*ex))+6+rnd.uniform(0,3)   # 從頭頂那圈的邊緣下面長出來（不要在頭外面多出一個方角）
      tip=bottom+rnd.uniform(-6,6);pointed=rnd.random()<.6
      bulge=(4*math.sin(math.pi*(top-104)/130) if HS=='bob' else 0)
      lx=[(xa-.8,top)];rx=[(xb+.8,top)]
      for k in range(1,20):
        t=k/19;y=top+(tip-top)*t
        ob=s*(5*math.sin(math.pi*t*.85) if HS=='bob' else 0)       # 鮑伯：往外鼓
        cur=s*(-4*max(0,t-.8)/.2 if HS=='bob' else 0)               # 鮑伯：髮尾往內捲
        nar=(1-max(0,t-.85)/.15*.8) if pointed else 1
        cx=(xa+xb)/2+ob*abs(((xa+xb)/2-CX))/RO+cur;hw=(xb-xa)/2*nar
        lx.append((cx-hw,y));rx.append((cx+hw,y))
      pts=lx+[((xa+xb)/2+cur,tip+(3 if pointed else 0))]+rx[::-1]
      out.append(Clump('side',pts,0 if i%2==0 else 1,i));x+=s*w*.85;i+=1
  return out
def back_clumps(rnd):
  out=[];bottom=256 if HS!='bob' else 222
  for s in(-1,1):
    x=CX+s*20
    while abs(x-CX)<RO+4:
      w=rnd.uniform(9,14);xa,xb=sorted([x,x+s*w])
      xb=min(xb,CX+RO+4);xa=max(xa,CX-RO-4)
      tip=bottom-rnd.uniform(0,10)
      cy=lambda X:CY-math.sqrt(max(0,RO*RO-min(RO,abs(X-CX))**2))+3     # 從頭頂那圈裡面長出來，不在頭外面多一個方角
      pts=[(xa-1,cy(xa)),(xb+1,cy(xb)),(xb+1+s*2,tip-6),((xa+xb)/2,tip),(xa-1+s*2,tip-6)]
      out.append(Clump('back',pts,0,len(out)));x+=s*w*.8
  return out
def build():
  rnd=random.Random(7 if HS!='bob' else 11)
  cap=pm([(CX+RO*math.cos(a),CY+RO*math.sin(a)) for a in np.linspace(math.pi,2*math.pi,90)]+[(CX+RO,CY+8),(CX-RO,CY+8)])
  return cap,bang_clumps(rnd),side_clumps(rnd),back_clumps(rnd)
def render(img,stage):
  white=(img==255).all(2);out=img.copy()
  cap,bangs,sides,backs=build()
  yy,xx=np.mgrid[0:N,0:N]
  if stage=='pieces':        # 一片片用不同顏色看清楚
    pal=[(240,190,80),(230,120,90),(150,200,120),(120,160,230),(200,130,220),(240,220,120),(120,210,210)]
    for cl in backs:out[cl.mask&white]=pal[cl.rid%7]
    out[cap]=(205,170,110)
    for cl in sorted(sides+bangs,key=lambda c:c.layer):out[cl.mask]=pal[(cl.rid+cl.layer*3)%7]
    return out
  # 後髮（只露在白底的地方）
  for cl in backs:
    m=cl.mask&white;out[m]=C['mid']
    edge=m&~np.roll(cl.mask,-1,1);out[edge]=C['sh']          # 每片右邊一格暗
  out[cap]=C['mid']
  hairmask=cap.copy()
  for cl in sorted(sides+bangs,key=lambda c:c.layer):
    m=cl.mask
    # 這片蓋上去之前：它在下面那層頭髮上投一道影子（往右下偏 1～2 格）
    sh=np.roll(np.roll(m,1,0),2 if cl.kind=='bang' else 1,1)&~m&hairmask&(yy>CY-46)   # 影子只在中下段（頭頂不要一堆線）
    out[sh]=C['sh']
    out[m]=C['mid'];hairmask|=m
    redge=m&~np.roll(m,-1,1)&~np.roll(m,-2,1)
    out[redge&(yy>CY-50)]=C['sh']                            # 背光那側一格暗（只在中下段）
  # 瀏海投在額頭的影子
  allb=np.zeros((N,N),bool)
  for cl in bangs:allb|=cl.mask
  shadow=np.roll(allb,1,0)&~allb&~white&~hairmask
  out[shadow]=SKSH
  if stage=='base':return out
  # 高光：每一片上一段（前面往下彎的光環），各片上下錯開一點，在片的邊上斷開
  rnd=random.Random(3)
  for cl in sorted(bangs,key=lambda c:c.layer):
    off=rnd.uniform(-2,2)
    for y in range(N):
      for x in range(N):
        if not cl.mask[y,x]:continue
        ring=CY-34+15*(1-((x-CX)/RO)**2)+off
        d=y-ring
        if abs(d)<1.3 and cl.mask[y,x-1] and cl.mask[y,min(N-1,x+1)]:out[y,x]=C['hi']
        elif -2.6<d<2.6 and tuple(out[y,x])==C['mid']:out[y,x]=C['li']
  return out
if __name__=='__main__':
  D=sys.argv[1];img=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',26)
  c=Image.new('RGB',(3*400,460),'white');d=ImageDraw.Draw(c)
  for k,(st,lab) in enumerate([('pieces','一片片的髮束（顏色分開看）'),('base','填色＋片和片之間的影子'),('final','加高光')]):
    d.text((k*400+6,4),lab,fill='black',font=F)
    c.paste(Image.fromarray(render(img,st)).crop((28,20,228,256)).resize((338,400),Image.NEAREST),(k*400+30,44))
  c.save(sys.argv[2])
  if len(sys.argv)>3:Image.fromarray(render(img,'final')).save(sys.argv[3])
