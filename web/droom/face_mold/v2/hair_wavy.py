# 臉模 v2：大波浪長髮（使用者 2026-11-19 給的 Super-Wavy 教學圖），只有正面
# 照教學圖一步一步：這一版只做到「輪廓黑線」（使用者：先畫輪廓黑邊，到那一步我看看）
#   頭頂：圓頂，比頭殼大一點、往兩側份量變大
#   外輪廓：頭的一半（眼睛那一層）開始有波浪，往下慢慢往外散，到肩膀下面
#   內側那束：從太陽穴下來，蓋到臉頰邊緣（Inner strands overlap the face），過了下巴往外、波浪往下
#   前髮：眉毛高度一條線，寬到兩邊太陽穴
#   髮尾：底下幾個捲起來的尖
# 用法：python3 hair_wavy.py <有 front_f.png 的資料夾> <輸出.png>
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
