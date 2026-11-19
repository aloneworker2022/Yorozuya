# 臉模 v2：大波浪長髮（使用者 2026-11-19 給的 Super-Wavy 教學圖），只有正面
# 照教學圖一步一步：這一版只做到「輪廓黑線」（使用者：先畫輪廓黑邊，到那一步我看看）
#   頭頂：圓頂，比頭殼大一點、往兩側份量變大
#   外輪廓：頭的一半（眼睛那一層）開始有波浪，往下慢慢往外散，到肩膀下面
#   內側那束：從太陽穴下來，蓋到臉頰邊緣（Inner strands overlap the face），過了下巴往外、波浪往下
#   前髮：眉毛高度一條線，寬到兩邊太陽穴
#   髮尾：底下幾個捲起來的尖
# 用法：python3 hair_wavy.py <有 front_f.png 的資料夾> <第2步輸出.png> [第3步輸出.png]
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
def curves():
  C=[]
  # 頭頂圓頂（左右兩半，從頭頂中間往兩邊下來）
  domeL=[(CX+80*math.cos(a),CY-1+79*math.sin(a)) for a in np.radians(np.linspace(-90,-178,10))]   # a=-90 頭頂、-178 左邊
  # 外輪廓（左）：從太陽穴下來，眼睛那層開始波浪（大而柔的 S 形，一個起伏約 60 格），往下往外散
  outerL=domeL[-1:]+[(46,128),(42,145),(33,166),(32,186),(39,203),(34,222),(24,242),(25,262),(33,280),(27,296),(22,304)]
  # 內側那束（左）：太陽穴→蓋到臉頰邊→過下巴往外→跟外輪廓同步擺動往下
  innerL=[(60,128),(62,146),(67,164),(76,186),(83,204),(84,214),(79,230),(70,250),(73,268),(82,284),(80,298),(74,306)]
  # 髮尾（左）：兩三個圓圓捲起來的尾巴（不是尖的）
  tipsL=[(22,304),(26,311),(35,313),(42,307),(46,312),(55,315),(63,310),(68,314),(74,306)]
  # 後髮的下緣（左）：內側那束後面到脖子
  backL=[(80,298),(90,304),(100,300),(109,305)]
  for c in(domeL,outerL,innerL,tipsL,backL):
    C.append(c);C.append(mirror(c,dx=1))
  # 前髮：眉毛高度一條線（中間稍微低一點），寬到兩邊太陽穴
  C.append([(60,128),(80,132),(104,134),(128,135),(152,134),(176,132),(197,128)])
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
# ---------------- 第 3 步：前髮一束束、髮流線、兩側分束（還是只有黑線；頭髮蓋住的地方塗白） ----------------
from PIL import ImageDraw
def xfun(pts):
  P=np.array(crom(pts));o=np.argsort(P[:,1]);return lambda y:np.interp(y,P[o,1],P[o,0])
def stage3(img):
  out=extend(img)
  domeL=[(CX+80*math.cos(a),CY-1+79*math.sin(a)) for a in np.radians(np.linspace(-90,-178,10))]
  oL=[(46,128),(42,145),(33,166),(32,186),(39,203),(34,222),(24,242),(25,262),(33,280),(27,296),(22,304)]
  iL=[(60,128),(62,146),(67,164),(76,186),(83,204),(84,214),(79,230),(70,250),(73,268),(82,284),(80,298),(74,306)]
  fo,fi=xfun(domeL[-1:]+oL),xfun(iL)
  # 前髮下緣：一束約 15 格，下緣剪齊、束和束之間往上缺一小口；兩側最外面那束長一點、往下框住臉
  xs=[60,74,89,103,117,131,145,159,172,185,197]
  yb=lambda x:134+.0*(x-CX)-(abs(x-CX)/68)**2*2
  bang=[]
  for k in range(len(xs)-1):
    a,b=xs[k],xs[k+1];ya=yb(a)-3.5;yc=yb((a+b)/2)
    if k==0:bang+=[(a,yb(a)+8),(a+5,yb(a)+5),(b-3,yc+1),(b,ya)]
    elif k==len(xs)-2:bang+=[(a,ya),(a+3,yc+1),(b-5,yb(b)+5),(b,yb(b)+8)]
    else:bang+=[(a,ya),(a+2,yc),(b-2,yc),(b,ya)] if k>0 else []
  # 填白：頭頂＋前髮、左右兩側（含耳朵、臉頰邊）
  m=Image.new('L',(N,H),0);d=ImageDraw.Draw(m)
  top=domeL[::-1][:-1]+[(CX+(CX-x),y) for x,y in domeL][::-1] if False else None
  arc=[(CX+80*math.cos(a),CY-1+79*math.sin(a)) for a in np.radians(np.linspace(-178,-2,60))]
  d.polygon([(round(x),round(y)) for x,y in arc+[(2*CX-46+1,128)]+[(round(x),round(y)) for x,y in bang[::-1]]+[(46,128)]],fill=1)
  ends={}
  rnd=__import__('random').Random(4)
  T=[0,.38,.7,1]
  for s in(-1,1):
    E=[300+rnd.uniform(-2,4) for _ in range(3)]
    ends[s]=E
    def X(t,y,s=s):
      v=fi(y)+t*(fo(y)-fi(y));return v if s<0 else 2*CX-v+1
    poly=[(X(1,y),y) for y in np.arange(124,E[2]-2,1)]+[(X(t,E[k]+2),E[k]+2) for k,t in((2,.85),(1,.55),(0,.2))]+[(X(0,y),y) for y in np.arange(E[0]-2,127,-1)]
    d.polygon([(round(x),round(y)) for x,y in poly],fill=1)
  M=np.array(m).astype(bool);out[M]=255
  L=[]
  # 頭頂圓頂
  L.append(domeL);L.append(mirror(domeL,dx=1))
  # 前髮
  L.append(bang)
  # 前髮的分束線：從每個缺口往上，往頭頂（髮旋在頭頂中間偏後）收；長短不一，不畫到頂
  W=(CX,40);rl=__import__('random').Random(9)
  for k in range(1,len(xs)-1):
    if rl.random()<.25:continue
    a=xs[k];y0=yb(a)-3.5;ln=rl.uniform(.35,.7)
    pts=[(a+(W[0]-a)*u*.55,y0+(W[1]-y0)*u) for u in np.linspace(0,ln,5)]
    L.append(pts)
  # 頭頂兩側的髮流線：從頭頂往兩邊順著圓頂下來
  for s in(-1,1):
    for r,a0,a1 in((70,-115,-160),(62,-125,-168),(74,-100,-140)):
      p=[(CX+s*-r*math.cos(math.radians(a)),CY-1+r*math.sin(math.radians(a))) for a in np.linspace(a0,a1,6)]
      L.append(p)
  # 兩側：外輪廓、內側、中間兩條分束線（跟著波浪），每束的尾巴圓圓收起來
  for s in(-1,1):
    E=ends[s]
    def X(t,y,s=s):
      v=fi(y)+t*(fo(y)-fi(y));return v if s<0 else 2*CX-v+1
    dome=domeL if s<0 else mirror(domeL,dx=1)
    L.append([(X(1,y),y) for y in np.arange(124,E[2]-3,2)])            # 外輪廓
    L.append([(X(0,y),y) for y in np.arange(128,E[0]-3,2)])            # 內側（蓋到臉頰）
    L.append([(X(.38,y),y) for y in np.arange(150,max(E[0],E[1])-3,2)])   # 分束線（從眼睛那層開始）
    L.append([(X(.7,y),y) for y in np.arange(176,max(E[1],E[2])-3,2)])
    for k in range(3):                                                  # 每束的尾巴：圓弧往內捲
      ta,tb=T[k],T[k+1];e=E[k]
      xa,xb=X(ta,e-3),X(tb,e-3)
      L.append([(xa,e-3),(xa+(xb-xa)*.3,e+2),(xa+(xb-xa)*.7,e+2),(xb,e-3)])
    # 脖子後面的後髮：一條波浪線＋下緣
    xn=109 if s<0 else 147
    L.append([(X(0,214)+(xn-X(0,214))*.45,216),(X(0,240)+(xn-X(0,240))*.5,240),(X(0,265)+(xn-X(0,265))*.4,265),(X(0,290)+(xn-X(0,290))*.5,292)])
    be=[(X(0,E[0]-3),E[0]-3),((X(0,E[0])+xn)/2,E[0]+1),(xn,E[0]-2)]
    L.append(be)
  for c in L:
    for x,y in pixels(crom(c,12)):
      if 0<=x<N and 0<=y<H:out[y,x]=INK
  return out
if __name__=='__main__' and len(sys.argv)>3:
  o=stage3(img);Image.fromarray(o).resize((N*3,H*3),Image.NEAREST).save(sys.argv[3])
