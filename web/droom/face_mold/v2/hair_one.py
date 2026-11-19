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
BANG_Y=136                                  # 瀏海下緣（剛好在眼睛上面、蓋到眉毛）
def regions():
  # 瀏海：頭髮外緣的上半圈，往下到 BANG_Y；兩邊在太陽穴收進去
  top=pm(arc(RO,math.pi*1.06,math.pi*1.94)+[(CX+60,BANG_Y-4),(CX-60,BANG_Y-4)])
  bang=np.zeros((N,N),bool)
  for x in range(CX-62,CX+63):
    # 下緣一束束的：每 7 格一束，尖端上下錯開 0～3 格
    k=(x-(CX-62))//7;tip=BANG_Y+[0,2,1,3,0,2,1][k%7]-(1 if (x-(CX-62))%7 in(0,6) else 0)
    if abs(x-CX)>52:tip-=int((abs(x-CX)-52)*.9)          # 兩端往上收、接到鬢角
    for y in range(int(CY-RO*0.6),tip):bang[y,x]=True
  cap=pm(arc(RO,math.pi,2*math.pi)+[(CX+RO,CY),(CX-RO,CY)])
  bang&=cap|(np.arange(N)[:,None]>CY-30)
  front_top=cap&(np.arange(N)[:,None]<CY-28)
  yy,xx=np.mgrid[0:N,0:N]
  temple=cap&(np.abs(xx-CX)>50)&(yy<CY+8)                 # 太陽穴：瀏海兩端收上去的地方也要蓋滿，不能露頭皮
  bangs=(bang|front_top|temple)
  # 兩側（鬢）：從太陽穴直直往下，內緣貼著臉頰外側、外緣在耳朵外面，尾端一束束
  sides=np.zeros((N,N),bool)
  for s in(-1,1):
    xin=CX+s*54;xout=CX+s*(RO+3)
    p=[(xin,108),(xout,104)]
    for y in range(110,240,6):p.append((xout+s*(1 if y>200 else 0),y))
    tips=[(CX+s*(RO+2),246),(CX+s*72,238),(CX+s*66,244),(CX+s*60,236)]
    p+=tips+[(xin+s*2,226),(xin,150)]
    sides|=pm(p)
  # 後髮：頭的後面一大片，比肩膀寬一點，一路到畫面下面
  back=pm(arc(RO+2,math.pi,2*math.pi)+[(CX+RO+10,256),(CX-RO-10,256)])
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
    inner=sides&(np.abs(xx-(CX+s*55))<=2)&(yy>118);out[inner]=C['sh']
  bot=bangs&~np.roll(bangs,-1,0);out[bot]=C['sh']
  # 瀏海在額頭上的影子（瀏海下緣下面一格）
  shadow=np.roll(bangs,1,0)&~bangs&~white&~sides&~back
  out[shadow]=SKSH
  if stage=='base':return out
  # 4 瀏海細節：幾條細縫露出額頭（從下緣往上 7～9 格）
  for x,h in((CX-34,8),(CX-8,6),(CX+19,9),(CX+41,7)):
    for y in range(BANG_Y-h,BANG_Y+3):
      if bangs[y,x]:out[y,x]=(242,204,177) if y>BANG_Y-h+2 else C['sh']
  # 7 髮絲：從髮旋放射到瀏海下緣、兩側直直往下（暗色細線，只畫中下段，上面讓亮的帶子乾淨）
  for x in range(CX-54,CX+55,9):
    for t in np.linspace(.68,1,40):
      px=round(W[0]+(x-W[0])*t);py=round(W[1]+(BANG_Y-2-W[1])*t)
      if bangs[py,px] and tuple(out[py,px])==C['mid']:out[py,px]=C['ln']
  for s in(-1,1):
    for x in(CX+s*62,CX+s*70):
      for y in range(140,232):
        if sides[y,x] and (y//9)%3!=0:out[y,x]=C['ln']
  # 5＋8 亮：頭頂一圈寬的亮帶（光從左上，左邊亮一點），帶子裡再一條條白色高光（天使環，跟著髮束斷開）
  for y in range(N):
    for x in range(N):
      if not bangs[y,x] or y>CY:continue
      r=math.hypot(x-CX,y-CY);a=math.degrees(math.atan2(y-CY,x-CX))%360
      if 49<=r<=62 and 200<a<340:
        # 亮帶（光從左上，左邊寬右邊窄），帶子中間一條條直的白色高光，跟著髮束斷開
        if a>290 and r<52+ (340-a)/10:continue
        streak=(x//3)%3!=0 and 53<=r<=58 and (a<300 or (x//3)%2==0)
        if tuple(out[y,x])==C['ln']:continue
        out[y,x]=C['hi'] if streak else C['li']
  for s in(-1,1):                                          # 兩側上段也帶一點亮
    for y in range(120,150):
      for x in range(N):
        if sides[y,x] and abs(x-(CX+s*66))<=2 and (y//5)%2==0:out[y,x]=C['li']
  return out
if __name__=='__main__':
  D=sys.argv[1];img=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',26)
  c=Image.new('RGB',(3*400,460),'white');d=ImageDraw.Draw(c)
  for k,(st,lab) in enumerate([('regions','分區：黃瀏海 紅兩側 紫後髮'),('base','底色＋暗'),('final','細節＋亮＋高光')]):
    d.text((k*400+6,4),lab,fill='black',font=F)
    c.paste(Image.fromarray(render(img,st)).crop((28,20,228,256)).resize((338,400),Image.NEAREST),(k*400+30,44))
  c.save(sys.argv[2])
