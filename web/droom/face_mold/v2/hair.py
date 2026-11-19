# 臉模 v2：髮型（2026-11-19 第一版，只有正面）
# 每種髮型由三塊組成：後髮（畫在頭和脖子後面，只蓋白底）、頭頂（蓋住頭蓋到髮際線）、前髮（瀏海＋鬢角，蓋在臉上）
# 顏色：HAIR_COLORS 三階（亮、中、暗）＋髮絲線；外框不描線（照 v1 規則），只在前髮下緣、髮束之間畫暗色
# 用法：python3 hair.py <有 front_f.png 的資料夾> <輸出.png>（HS=1..6 只畫一種；不給就六種排一張）
import os,sys,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont
N=256;CX,CY,R=128,112,72
HAIR=dict(hi=(170,116,80),mid=(128,82,58),sh=(92,58,42),ln=(62,38,30))
def poly_mask(pts):
  m=Image.new('L',(N,N),0);ImageDraw.Draw(m).polygon([(round(x),round(y)) for x,y in pts],fill=1);return np.array(m).astype(bool)
def circle_pts(cx,cy,r,a0,a1,n=60):
  return [(cx+r*math.cos(a0+(a1-a0)*k/n),cy+r*math.sin(a0+(a1-a0)*k/n)) for k in range(n+1)]
def cap(r=R+5,hl=None):
  # 頭頂：頭蓋圓放大一點；髮際線以上（hl(x) 回傳那一欄的髮際線 y）
  m=poly_mask(circle_pts(CX,CY,r,math.pi,2*math.pi)+[(CX+r,CY+8),(CX-r,CY+8)])
  if hl:
    for x in range(N):
      y0=hl(x)
      m[int(max(0,y0)):,x]=False
  return m
def bangs_strands(xs,top,tips,widths):
  # 一排髮束：每束從 top 往下到 tips[i]，寬 widths[i]，尖尖的尾巴
  out=np.zeros((N,N),bool);lines=[]
  for x,t,w in zip(xs,tips,widths):
    pts=[(x-w/2,top),(x+w/2,top),(x+w*.35,t-4),(x+w*.05,t),(x-w*.25,t-3)]
    out|=poly_mask(pts);lines.append([(x-w*.1,top+6),(x+w*.02,t-5)])
  return out,lines
def style(n):
  back=np.zeros((N,N),bool);front=np.zeros((N,N),bool);lines=[]
  hairline=lambda x:96+((x-CX)/60)**2*26          # 髮際線（額頭中間 96，往兩邊下來）
  top=cap(hl=lambda x:hairline(x)+6)
  if n==1:   # 長直髮＋齊瀏海＋公主切
    back=poly_mask(circle_pts(CX,CY,R+6,math.pi,2*math.pi)+[(CX+R+8,256),(CX-R-8,256)])
    xs=list(range(70,190,10));b,l=bangs_strands(xs,92,[130+(i%2)*2 for i in range(len(xs))],[12]*len(xs));front|=b;lines+=l
    for s in(-1,1):
      x0=CX+s*58;front|=poly_mask([(x0-s*2,118),(x0+s*18,112),(x0+s*20,206),(x0+s*4,210),(x0,206)])
      lines.append([(x0+s*9,124),(x0+s*10,200)])
  if n==2:   # 鮑伯短髮
    back=poly_mask(circle_pts(CX,CY,R+7,math.pi*.9,math.pi*2.1)+[(CX+R+4,196),(CX+R-8,206),(CX-R+8,206),(CX-R-4,196)])
    xs=list(range(74,186,14));b,l=bangs_strands(xs,92,[124,128,122,130,124,128,122,126][:len(xs)],[16]*len(xs));front|=b;lines+=l
    for s in(-1,1):
      x0=CX+s*60;front|=poly_mask([(x0-s*4,112),(x0+s*17,108),(x0+s*16,190),(x0+s*4,204),(x0-s*8,198),(x0-s*2,170)])
      lines.append([(x0+s*6,120),(x0+s*4,196)])
  if n==3:   # 雙馬尾（中分、兩邊高高綁起）
    xs=[86,100,114,142,156,170];b,l=bangs_strands(xs,94,[126,132,122,122,132,126],[15]*6);front|=b;lines+=l
    for s in(-1,1):
      tx=CX+s*70;back|=poly_mask([(tx-s*6,62),(tx+s*14,58),(tx+s*30,120),(tx+s*34,190),(tx+s*24,250),(tx+s*14,200),(tx+s*4,120)])
      front|=poly_mask([(CX+s*58,112),(CX+s*72,108),(CX+s*74,160),(CX+s*66,170),(CX+s*60,150)])
      lines.append([(tx+s*14,80),(tx+s*24,190)])
    lines.append([(CX,46),(CX,92)])                 # 中分線
  if n==4:   # 高馬尾（頭髮往後梳、額頭露出來、側邊兩撮）
    top=cap(hl=lambda x:hairline(x)-6)
    back=poly_mask([(CX+30,46),(CX+56,30),(CX+72,60),(CX+86,140),(CX+80,230),(CX+66,150),(CX+50,70)])
    for s in(-1,1):
      front|=poly_mask([(CX+s*54,104),(CX+s*64,100),(CX+s*62,160),(CX+s*56,176),(CX+s*52,140)])
      lines.append([(CX+s*58,108),(CX+s*57,168)])
    b,l=bangs_strands([118,132],88,[112,108],[12,10]);front|=b;lines+=l
    lines+=[[(CX-30,52),(CX-8,88)],[(CX+20,48),(CX+4,86)]]   # 往後梳的紋路
  if n==5:   # 長捲髮＋斜瀏海
    pts=circle_pts(CX,CY,R+8,math.pi,2*math.pi)
    for y in range(120,252,4):pts.append((CX+R+12+6*math.sin(y/9),y))
    for y in range(252,120,-4):pts.append((CX-R-12-6*math.sin(y/9+1),y))
    back=poly_mask(pts)
    front|=poly_mask([(CX-56,98),(CX+40,90),(CX+58,104),(CX+20,112),(CX-10,126),(CX-40,138),(CX-58,132)])
    lines+=[[(CX-40,104),(CX+30,96)],[(CX-48,124),(CX+10,108)]]
    for s in(-1,1):
      p=[(CX+s*56,112),(CX+s*72,108)]
      for y in range(112,230,6):p.append((CX+s*(76+5*math.sin(y/8)),y))
      for y in range(230,112,-6):p.append((CX+s*(62+5*math.sin(y/8+1.5)),y))
      front|=poly_mask(p);lines.append([(CX+s*68,120),(CX+s*70,222)])
  if n==6:   # 短髮（俐落、耳上）
    top=cap(r=R+4,hl=lambda x:hairline(x)+4)
    xs=list(range(76,184,12));b,l=bangs_strands(xs,90,[116,120,114,122,116,120,114,118,116][:len(xs)],[14]*len(xs));front|=b;lines+=l
    for s in(-1,1):
      front|=poly_mask([(CX+s*60,104),(CX+s*76,100),(CX+s*74,140),(CX+s*66,150),(CX+s*62,132)])
  return back,top|front,lines
def paint(img,n):
  base=img.copy();white=(base==255).all(2)
  back,front,lines=style(n)
  out=img.copy()
  out[back&white]=HAIR['mid']
  # 後髮靠頭那側暗一點
  out[back&white&np.roll(~white,0,1)]=HAIR['sh']
  out[front]=HAIR['mid']
  # 光從左上：前髮上面亮一圈（天使環）、下緣暗
  hy=np.zeros((N,N),bool)
  for x in range(N):
    for y in range(N):
      if front[y,x] and y<CY:
        a=math.degrees(math.atan2(y-CY+12,x-CX+8))%360;rr=math.hypot(x-CX+8,y-CY+12)
        # 天使環：只在左上那段（光從左上），一段一段的、跟著髮束斷開
        if 200<a<300 and 60<rr<63.5 and (int(a/7)%3)!=2:hy[y,x]=True
  out[hy]=HAIR['hi']
  edge=front&~np.roll(front,-2,0)
  out[edge&~white]=HAIR['sh']
  for seg in lines:
    (x0,y0),(x1,y1)=seg;n2=int(max(abs(x1-x0),abs(y1-y0)))+1
    for k in range(n2):
      x=round(x0+(x1-x0)*k/n2);y=round(y0+(y1-y0)*k/n2)
      if 0<=x<N and 0<=y<N and (front[y,x] or back[y,x]):out[y,x]=HAIR['ln']
  return out
if __name__=='__main__':
  D=sys.argv[1];img=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  ns=[int(os.environ['HS'])] if 'HS' in os.environ else [1,2,3,4,5,6]
  names={1:'長直髮・齊瀏海',2:'鮑伯',3:'雙馬尾',4:'高馬尾',5:'長捲髮・斜瀏海',6:'短髮'}
  F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',26)
  c=Image.new('RGB',(3*400,((len(ns)+2)//3)*440),'white');d=ImageDraw.Draw(c)
  for i,n in enumerate(ns):
    r,col=divmod(i,3)
    d.text((col*400+8,r*440+4),f'{n}. {names[n]}',fill='black',font=F)
    c.paste(Image.fromarray(paint(img,n)).crop((28,20,228,256)).resize((338,400),Image.NEAREST),(col*400+30,r*440+38))
  c.save(sys.argv[2])
