# 臉模 v2：髮型——照使用者給的「畫頭髮步驟」教學先做一種：長直髮＋齊瀏海（正面）
# 教學的步驟：
#   1 找髮旋（頭頂偏後）  2 從髮旋往外分三區：瀏海（前）、兩側（鬢）、後髮  3 填底色、分髮束
#   4 瀏海加細節（髮束之間露出一點點額頭）  5 加亮  6 被擋住的地方加暗（瀏海下、兩側靠臉、後髮）
#   7 亮的地方加髮絲  8 加高光（天使環，一條條斷開）  9 最後整體色調
# 頭髮比頭蓋厚一層（外緣＝頭蓋圓＋7）；外框不描線（v1 規則）
# 用法：python3 hair_one.py <有 front_f.png 的資料夾> <輸出.png>   → 一張圖：分區／底色／完成
import os,sys,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont
N=256;CX,CY,R=128,112,72
W=(128,38)                                  # 髮旋（正面看在頭頂中間偏上）
C=dict(hi=(246,228,170),li=(222,192,124),mid=(190,152,90),sh=(150,114,64),dk=(112,82,48),ln=(128,96,56))
SKSH=(222,178,152)                          # 瀏海投在額頭上的影子
def pm(pts):
  m=Image.new('L',(N,N),0);ImageDraw.Draw(m).polygon([(round(x),round(y)) for x,y in pts],fill=1);return np.array(m).astype(bool)
def arc(r,a0,a1,n=80):return [(CX+r*math.cos(a0+(a1-a0)*k/n),CY+r*math.sin(a0+(a1-a0)*k/n)) for k in range(n+1)]
RO=R+7
HS=os.environ.get('HS','hime')   # 髮型：hime 長直髮齊瀏海、bob 鮑伯
BANG_Y=136 if os.environ.get('HS','hime')!='bob' else 133   # 瀏海下緣（剛好在眼睛上面、蓋到眉毛）
def mer_x(phi,y):
  # 經線：髮旋在球頂，phi＝往左右的角度；y 在赤道以上照球面算，赤道以下（瀏海垂下來）就直直往下
  c=max(-1,min(1,(CY-y)/RO));th=math.acos(c)
  if y>CY:th=math.pi/2
  return CX+RO*.96*math.sin(th)*math.sin(math.radians(phi))
MER=[]
def regions():
  # 瀏海：頭髮外緣的上半圈，往下到 BANG_Y；兩邊在太陽穴收進去
  top=pm(arc(RO,math.pi*1.06,math.pi*1.94)+[(CX+60,BANG_Y-4),(CX-60,BANG_Y-4)])
  bang=np.zeros((N,N),bool)
  # 瀏海（使用者 2026-11-19：頭髮從頭頂的髮旋往下、沿著頭的圓弧，不是像卡牌那樣直的）
  # 髮束的分界＝球上的經線（從髮旋出發、往兩邊鼓出去再往下），分界的間隔不一樣；
  # 每兩條經線中間是一束，尾巴有尖有鈍、長短不一
  global MER
  import random
  rnd=random.Random(7 if HS!='bob' else 11)
  # 大塊、小塊交錯（使用者 2026-11-19）：大塊 14～19°、小塊 4～7°，大概一大一小、偶爾連兩個小的
  MER=[];p=-56;big=rnd.random()<.5;SIZES=[]
  while p<56:
    MER.append(p);w=rnd.uniform(14,19) if big else rnd.uniform(4,7);SIZES.append(big);p+=w
    big=(not big) if rnd.random()<.8 else big
  MER.append(56)
  tips={}
  for i in range(len(MER)-1):
    x0,x1=mer_x(MER[i],BANG_Y),mer_x(MER[i+1],BANG_Y)
    L=(rnd.choice([2,3,4,5,6]) if SIZES[i] else rnd.choice([-1,0,1,2]));L+=3 if (SIZES[i] and rnd.random()<.2) else 0   # 大塊長、小塊短
    pointed=rnd.random()<(.75 if SIZES[i] else .5);lean=rnd.choice([-1,0,0,1])
    for x in range(int(math.floor(x0)),int(math.ceil(x1))+1):
      u=(x+.5-x0)/max(1,x1-x0);u=min(1,max(0,u))
      drop=L+(3.5*(1-abs(2*u-1-lean*.4)) if pointed else 1.2)
      tips[x]=max(tips.get(x,0),BANG_Y-2+drop)
  for x in range(CX-62,CX+63):
    tip=tips.get(x,BANG_Y-2)
    if abs(x-CX)>52:tip-=int((abs(x-CX)-52)*.9)          # 兩端往上收、接到鬢角
    for y in range(int(CY-RO*0.6),int(tip)):bang[y,x]=True
  cap=pm(arc(RO,math.pi,2*math.pi)+[(CX+RO,CY),(CX-RO,CY)])
  bang&=cap|(np.arange(N)[:,None]>CY-30)
  front_top=cap&(np.arange(N)[:,None]<CY-28)
  yy,xx=np.mgrid[0:N,0:N]
  temple=cap&(np.abs(xx-CX)>50)&(yy<CY+8)                 # 太陽穴：瀏海兩端收上去的地方也要蓋滿，不能露頭皮
  bangs=(bang|front_top|temple)
  sides=np.zeros((N,N),bool)
  if HS=='bob':
    # 鮑伯：兩側到下巴，外緣有蓬度（往外鼓），髮尾往內捲（下緣往臉收）
    for s in(-1,1):
      xin=CX+s*54;p=[(xin,108),(CX+s*(RO+3),104)]
      for y in range(110,212,4):p.append((CX+s*(RO+3+5*math.sin(math.pi*(y-110)/130)),y))
      p+=[(CX+s*(RO+2),214),(CX+s*72,220),(CX+s*64,222),(CX+s*58,218),(CX+s*55,212),(xin+s*1,180),(xin,150)]
      sides|=pm(p)
    back=pm(arc(RO,math.pi,2*math.pi)+[(CX+RO+8,200),(CX+RO+2,216),(CX+46,222),(CX-46,222),(CX-RO-2,216),(CX-RO-8,200)])
  else:
    # 長直髮：兩側從太陽穴直直往下，內緣貼著臉頰外側、外緣在耳朵外面，尾端一束束
    for s in(-1,1):
      xin=CX+s*54;xout=CX+s*(RO+3)
      p=[(xin,108),(xout,104)]
      for y in range(110,240,6):p.append((xout+s*(1 if y>200 else 0),y))
      tips=[(CX+s*(RO+2),246),(CX+s*72,238),(CX+s*66,244),(CX+s*60,236)]
      p+=tips+[(xin+s*2,226),(xin,150)]
      sides|=pm(p)
    # 後髮：頭的後面一大片，比肩膀寬一點，一路到畫面下面
    back=pm(arc(RO,math.pi,2*math.pi)+[(CX+RO+10,256),(CX-RO-10,256)])
  return bangs,sides,back
def render(img,stage):
  white=(img==255).all(2);out=img.copy()
  bangs,sides,back=regions()
  if stage=='regions':
    out[back&white]=(160,110,220);out[sides]=(232,90,110);out[bangs]=(240,196,70)
    for t in np.linspace(0,1,40):                         # 從髮旋放射出去的箭頭方向（示意）
      for a in(-1.2,0,1.2):
        x=W[0]+a*30*t;y=W[1]+t*60
        if 0<=int(y)<N:out[int(y),int(x)]=(40,40,40)
    out[W[1]-1:W[1]+2,W[0]-1:W[0]+2]=(220,30,30)
    return out
  # 3 底色＋分髮束
  out[back&white]=C['sh'];out[sides]=C['mid'];out[bangs]=C['mid']
  yy,xx=np.mgrid[0:N,0:N]
  # 6 暗：後髮靠脖子／肩膀那段更暗；兩側靠臉那條暗；瀏海最下面一格暗
  out[back&white&(np.abs(xx-CX)<RO-6)&(yy>CY+40)]=C['dk']
  for s in(-1,1):
    inner=sides&(np.abs(xx-(CX+s*56))<=1)&(yy>124);out[inner]=C['sh']   # 兩側靠臉一點點暗（不是描邊）
  bot=bangs&~np.roll(bangs,-1,0)&(np.abs(xx-CX)<=54);out[bot]=C['sh']   # 只在瀏海那段（不要在太陽穴畫出一條橫的黑邊）
  if HS=='bob':
    curl=sides&~np.roll(sides,-6,0);out[curl&(yy>190)]=C['sh']
    out[back&white&(yy>200)]=C['dk']
  # 瀏海在額頭上的影子（瀏海下緣下面一格）
  shadow=np.roll(bangs,1,0)&~bangs&~white&~sides&~back
  out[shadow]=SKSH
  if stage=='base':return out
  # 4 瀏海細節：幾條細縫露出額頭（從下緣往上 7～9 格）
  for x,h in((CX-34,8),(CX-8,6),(CX+19,9),(CX+41,7)):
    for y in range(BANG_Y-h,BANG_Y+3):
      if bangs[y,x]:out[y,x]=(242,204,177) if y>BANG_Y-h+2 else C['sh']
  # 7 髮絲：沿著經線（從髮旋順著頭的圓弧往下，到瀏海下緣），只畫中下段
  # 使用者 2026-11-19：分界線不是每條都有——有的沒畫、有的細、有的是比較粗的陰影；長短也不一樣
  import random
  rl=random.Random(5 if HS!='bob' else 9)
  ytop,ybot=int(CY-RO*.86),BANG_Y+6
  for ph in MER[1:-1]:
    kind=rl.choices(['none','thin','thick'],[.3,.42,.28])[0]
    if kind=='none':continue
    y0=rl.randint(ytop,int(CY-RO*.35));y1=ybot if rl.random()<.7 else rl.randint(int(CY-RO*.1),ybot)
    side=rl.choice([-1,1])                                  # 粗陰影長在分界的哪一邊（被另一束壓住的那邊）
    for y in range(y0,y1):
      x=round(mer_x(ph,y))
      if not bangs[y,x]:continue
      t=(y-y0)/max(1,y1-y0)
      if tuple(out[y,x])==C['mid']:out[y,x]=C['ln']
      if kind=='thick':                                     # 越往髮尾越寬（1→3 格），外側用陰影色
        w=1+int(2.2*t)
        for k in range(1,w+1):
          xx=x+side*k
          if 0<=xx<N and bangs[y,xx] and tuple(out[y,xx])==C['mid']:out[y,xx]=C['sh']
  for s in(-1,1):
    for x in(CX+s*62,CX+s*70):
      for y in range(140,232 if HS!='bob' else 210):
        if sides[y,x] and (y//9)%3!=0:out[y,x]=C['ln']
  # 5＋8 亮（使用者：反光是一條白的、兩邊沿著頭髮的邊緣，不是一塊方塊）：
  # 一條細的白色光環繞過頭——兩端貼著頭髮外緣、中間往下彎；在髮束分界的地方斷開；上下各一格淡亮；兩端再沿著外緣往下帶一段
  RY0,RD=CY-34,15
  ring=lambda x:RY0+RD*(1-((x-CX)/RO)**2)
  mx=[round(mer_x(ph,ring(CX+RO*.96*math.sin(math.radians(ph))))) for ph in MER]
  for x in range(CX-RO,CX+RO+1):
    yc=ring(x);w=1+1.6*(1-abs(x-CX)/RO)            # 中間粗、兩邊細
    for y in range(int(yc-w-1),int(yc+w+2)):
      if not (0<=y<N) or not (bangs[y,x] or sides[y,x]):continue
      d=abs(y-yc)
      gap=any(abs(x-m)<=1 for m in mx)
      if d<=w and not gap:out[y,x]=C['hi']
      elif d<=w+1.2 and tuple(out[y,x])!=C['hi']:out[y,x]=C['li']
  import random
  rr=random.Random(3)
  for x in range(CX-RO+6,CX+RO-5):                          # 光環上下拉出幾條短短的亮絲（順著髮束），看起來不是一條死板的帶子
    if rr.random()<.28 and not any(abs(x-m)<=1 for m in mx):
      yc=ring(x);up=rr.randint(2,5);dn=rr.randint(1,4)
      for y in range(int(yc-up-1),int(yc+dn+2)):
        if 0<=y<N and (bangs[y,x] or sides[y,x]) and tuple(out[y,x])!=C['hi']:out[y,x]=C['li']
  for s in(-1,1):                                          # 兩端沿著頭髮外緣往下帶一段亮
    for y in range(int(RY0)-2,int(RY0)+34):
      row=bangs[y]|sides[y]
      xs=[x for x in range(N) if row[x]]
      if not xs:continue
      xe=max(xs) if s>0 else min(xs)
      for k in(1,2):
        x=xe-s*k
        if row[x]:out[y,x]=C['hi'] if (k==1 and y<RY0+18) else C['li']
  return out
if __name__=='__main__':
  D=sys.argv[1];img=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',26)
  c=Image.new('RGB',(3*400,460),'white');d=ImageDraw.Draw(c)
  for k,(st,lab) in enumerate([('regions','分區：黃瀏海 紅兩側 紫後髮'),('base','底色＋暗'),('final','細節＋亮＋高光')]):
    d.text((k*400+6,4),lab,fill='black',font=F)
    c.paste(Image.fromarray(render(img,st)).crop((28,20,228,256)).resize((338,400),Image.NEAREST),(k*400+30,44))
  c.save(sys.argv[2])
  if len(sys.argv)>3:Image.fromarray(render(img,'final')).save(sys.argv[3])
