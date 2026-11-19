# 臉模 v2：大波浪長髮（使用者 2026-11-19 給的 Super-Wavy 教學圖），只有正面
# 照教學圖一步一步：這一版只做到「輪廓黑線」（使用者：先畫輪廓黑邊，到那一步我看看）
#   頭頂：圓頂，比頭殼大一點、往兩側份量變大
#   外輪廓：頭的一半（眼睛那一層）開始有波浪，往下慢慢往外散，到肩膀下面
#   內側那束：從太陽穴下來，蓋到臉頰邊緣（Inner strands overlap the face），過了下巴往外、波浪往下
#   前髮：眉毛高度一條線，寬到兩邊太陽穴
#   髮尾：底下幾個捲起來的尖
# 用法：python3 hair_wavy.py <有 front_f.png 的資料夾> <第2步輸出.png> [第3步輸出.png] [前髮輸出.png]
import os,sys,math
import numpy as np
from PIL import Image
N=256;H=320;CX,CY=128,112
INK=(0,0,0)
def crom(pts,n=24):
  # Catmull-Rom：通過每個控制點的平滑曲線
  P=[pts[0]]+list(pts)+[pts[-1]];out=[]
  for i in range(1,len(P)-2):
    p0,p1,p2,p3=map(np.array,(P[i-1],P[i],P[i+1],P[i+2]))
    for t in np.linspace(0,1,n,endpoint=False):
      out.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
  out.append(np.array(P[-2]));return out
def pixels(pts):
  # 曲線 → 一格寬的像素路徑（去掉 L 形轉角的多餘那格）
  path=[]
  for p in pts:
    q=(int(round(p[0])),int(round(p[1])))
    if not path or q!=path[-1]:
      if path:                                           # 中間跳格的補起來
        x0,y0=path[-1];n=max(abs(q[0]-x0),abs(q[1]-y0))
        for k in range(1,n):path.append((round(x0+(q[0]-x0)*k/n),round(y0+(q[1]-y0)*k/n)))
      path.append(q)
  out=[];i=0
  while i<len(path):
    if 0<i<len(path)-1 and out:
      a,b,c=out[-1],path[i],path[i+1]
      if abs(a[0]-c[0])==1 and abs(a[1]-c[1])==1 and (a[0]==b[0] or a[1]==b[1]):i+=1;continue
    out.append(path[i]);i+=1
  return out
def mirror(pts,dx=0,dy=0):return [(2*CX-x+dx,y+dy) for x,y in pts]
def wave(y,y0=148,per=54,ph=0):return math.sin(2*math.pi*(y-y0+ph)/per)
def curves():
  # 使用者 2026-11-19 第二次修正（在圖上畫紅線）：不夠飄逸；內側有幾束是「一段一段」獨立的
  #   外輪廓：波浪大、少，往外甩更開，髮尾往外再往內勾
  #   內側：一段段獨立的 S 形髮束，從前面方塊的角（眼尾附近）開始，蓋過臉頰往下，尾巴往內收；左 1 束、右 2 束交叉
  # 下面的點＝使用者畫的紅線（768×960 的圖 ÷3 → 畫布座標）
  C=[]
  domeL=[(CX+86*math.cos(math.radians(a)),CY+1-84*math.sin(math.radians(a))) for a in np.linspace(90,154,9)]
  domeR=[(2*CX-x,y) for x,y in domeL]
  C.append(domeL+[(43,97),(47,127),(37,153),(23,180),(15,207),(18,233),(25,260),(23,283),(15,303),(33,313)])     # 左外輪廓
  C.append(domeR+[(213,100),(213,130),(233,150),(245,180),(242,213),(238,233),(245,260),(245,293),(228,312)])   # 右外輪廓
  C.append([(70,143),(58,157),(60,170),(80,187),(78,203),(68,227),(65,247),(72,267),(83,288)])                # 左內側一束
  C.append([(188,135),(172,167),(180,183),(173,213),(182,233),(185,257),(165,287)])                          # 右內側第一束
  C.append([(202,138),(190,173),(205,187),(212,207),(200,233),(182,260),(173,280)])                          # 右內側第二束
  # 前面的方塊：左右兩條線從頭頂下到太陽穴＋眉毛高度橫線（不變）
  blk=[(CX-30,40),(CX-48,52),(CX-58,72),(CX-62,96),(CX-63,118),(CX-63,132)]
  C.append(blk);C.append([(2*CX-x,y) for x,y in blk])
  C.append([(CX-63,132),(CX-30,134),(CX,135),(CX+30,134),(CX+64,132)])
  return C
def extend(img):
  # 畫布往下加長到 H（頭髮到肩膀下面）：脖子照最後一列往下延
  out=np.full((H,N,3),255,np.uint8);out[:N]=img;out[N:]=img[N-1]
  return out
def outline(img):
  out=extend(img)
  for c in curves():
    for x,y in pixels(crom(c)):
      if 0<=x<N and 0<=y<H:out[y,x]=INK
  return out
if __name__=='__main__':
  D=sys.argv[1];img=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  o=outline(img)
  Image.fromarray(o).resize((N*3,H*3),Image.NEAREST).save(sys.argv[2])
# ---------------- 第 3 步：髮流線（教學圖：Draw streaks — they show the direction the hair is combed） ----------------
# 頭髮從頭頂的髮旋往下梳 → 髮流線從髮旋沿著頭的圓弧往下散開；前髮下緣一束束（剪齊、束和束之間小缺口）；
# 兩側的髮流線跟著外輪廓的波浪一段一段；內側髮束加第二條邊（有寬度）；頭髮蓋住的地方塗白（耳朵、額頭、脖子後面）
from PIL import ImageDraw
import random
W=(CX-2,36)                                              # 髮旋（頭頂）
RO2=86
def mer(phi,y):
  # 從髮旋沿著頭的圓弧往下的經線：在正面看到的 x
  c=max(-1,min(1,(CY-y)/RO2));th=math.acos(c) if y<CY else math.pi/2
  return CX+RO2*.97*math.sin(th)*math.sin(math.radians(phi))
def phi_at(x,y):
  c=max(-1,min(1,(CY-y)/RO2));th=math.acos(c) if y<CY else math.pi/2
  return math.degrees(math.asin(max(-1,min(1,(x-CX)/(RO2*.97*math.sin(th))))))
def offset(pts,d,lo,hi):
  # 一條線往內（往臉中間）平移 d 格，只取 y 在 lo～hi 那段
  P=np.array(crom(pts,12));out=[]
  for k in range(1,len(P)-1):
    t=P[k+1]-P[k-1];t/=np.linalg.norm(t)+1e-9;n=np.array([t[1],-t[0]])
    if (n[0]*(CX-P[k,0]))<0:n=-n
    q=P[k]+n*d
    if lo<=q[1]<=hi:out.append(tuple(q))
  return out[::3]
def stage3(img):
  base=extend(img);out=base.copy()
  C=curves()
  outerL,outerR,lockL,lockR1,lockR2=C[0],C[1],C[2],C[3],C[4]
  # 前髮下緣：一束約 14 格，剪齊；束和束之間往上缺一小口；兩邊最外那束稍長
  xs=[65,79,93,107,121,135,149,163,177,191]
  bang=[];rb=random.Random(3);yb={}
  for k in range(len(xs)-1):
    a,b=xs[k],xs[k+1];y=134+rb.choice([0,0,1,2])+(3 if k in(0,len(xs)-2) else 0)
    yb[k]=y;bang+=[(a,y-4),(a+2,y),(b-2,y),(b,y-4)]
  # 填白：整個頭髮的範圍；再把沒被頭髮蓋住的臉、脖子放回來
  m=Image.new('L',(N,H),0);d=ImageDraw.Draw(m)
  sil=crom(outerL,12)+[(50,317),(80,318),(109,317),(147,317),(180,318),(212,317)]+crom(outerR,12)[::-1]
  d.polygon([(round(x),round(y)) for x,y in sil],fill=1);M=np.array(m).astype(bool)
  fl=lambda y:np.interp(y,[p[1] for p in crom(lockL,12)],[p[0] for p in crom(lockL,12)])
  r1=crom(lockR1,12);r2=crom(lockR2,12)
  fr=lambda y:min(np.interp(y,[p[1] for p in r1],[p[0] for p in r1]),np.interp(y,[p[1] for p in r2],[p[0] for p in r2]))
  out[M]=255
  orig=extend(img);skin=~(orig==255).all(2)
  for y in range(134,H):
    for x in range(N):
      if not skin[y,x]:continue
      inside=(y>=137 and fl(y)<x<fr(y)) or (y<137 and 66<=x<=190) or (y>212 and 109<=x<=147)
      if inside:out[y,x]=orig[y,x]
  L=[]
  L+=[outerL,outerR]
  blk=C[5];L+=[blk[:-1]+[(CX-63,130)],C[6][:-1]+[(CX+64,130)]]       # 前面方塊的兩條邊＝前髮外緣
  L.append(bang)
  # 前髮的髮流線：從缺口往上，沿頭的圓弧朝髮旋收；長短不一
  rl=random.Random(9)
  for k in(1,3,4,6,8):                                   # 不是每個缺口都拉線（太整齊像柵欄）
    x=xs[k];ph=phi_at(x,130);y0=rl.choice([48,60,72,86]);y1=yb[k]-4-rl.choice([0,4,10])
    L.append([(mer(ph,y),y) for y in np.linspace(y0,y1,8)])
  # 頭頂兩側：從髮旋順著圓頂往兩側下來（在方塊外面）
  for ph,y0,y1 in((-58,50,104),(-72,58,118),(60,52,108),(73,60,120)):
    L.append([(mer(ph,y),y) for y in np.linspace(y0,y1,8)])
  # 兩側長髮的髮流線：跟著外輪廓的波浪，一段一段
  for o,(dd,lo,hi) in ((outerL,(11,150,215)),(outerL,(21,170,262)),(outerL,(10,232,290)),
                      (outerR,(11,155,222)),(outerR,(20,175,268)),(outerR,(10,238,290))):
    seg=offset(o,dd,lo,hi)
    if len(seg)>2:L.append(seg)
  # 內側髮束：加第二條邊（往外 5 格，兩頭收尖）
  L.append(lockR1)
  for lk in(lockL,lockR2):                               # 右邊兩束交叉：只給外面那束第二條邊（不然交叉處很亂）
    P=crom(lk,12);n=len(P);sec=[]
    sgn=-1 if lk[0][0]<CX else 1
    for k in range(0,n,3):
      w=4*math.sin(math.pi*k/(n-1));x,y=P[k];sec.append((x+sgn*w,y))
    L+=[lk,sec]
  # 髮尾下緣（後髮）：外輪廓尾巴到脖子
  L+=[[(33,313),(50,317),(66,312),(82,317),(96,313),(109,316)],[(228,312),(212,316),(196,311),(180,316),(164,312),(147,316)]]
  for c in L:
    for x,y in pixels(crom(c,12)):
      if 0<=x<N and 0<=y<H:out[y,x]=INK
  return out
if __name__=='__main__' and len(sys.argv)>3:
  o=stage3(img);Image.fromarray(o).resize((N*3,H*3),Image.NEAREST).save(sys.argv[3])
# ---------------- 第 3 步之一：前髮（使用者 2026-11-19 在圖上畫紅線） ----------------
# 前髮的線從額頭中間才開始（不是從頭頂），短短的；有的分成「Λ」（一束分成兩撮）；
# 尾端超過方塊的橫線往下垂 → 前髮下緣在那幾個地方是往下尖的髮尾，不是一條直線
BANG_LINES=[[(97,98),(99,120),(100,140)],[(97,98),(92,112),(88,125)],      # 左：Λ
            [(127,98),(130,120),(133,142)],                               # 中：一條
            [(155,98),(157,118),(158,137)],[(155,98),(165,118),(175,137)]] # 右：Λ
BANG_TIPS=[(100,140),(133,142),(158,137),(175,137)]                       # 往下尖的髮尾
def bang_edge():
  # 前髮下緣：方塊的橫線，在每個髮尾的地方往下拉成尖
  y0=lambda x:132+2*(1-((x-CX)/64)**2)
  pts=[(CX-63,132)]
  for tx,ty in BANG_TIPS:
    pts+=[(tx-5,y0(tx-5)),(tx,ty),(tx+4,y0(tx+4))]
  pts.append((CX+64,132))
  return pts
def stage3_bangs(img):
  out=extend(img)
  C=curves()[:-1]+[bang_edge()]+BANG_LINES
  for c in C:
    for x,y in pixels(crom(c,12)):
      if 0<=x<N and 0<=y<H:out[y,x]=INK
  return out
if __name__=='__main__' and len(sys.argv)>4:
  o=stage3_bangs(img);Image.fromarray(o).resize((N*3,H*3),Image.NEAREST).save(sys.argv[4])
