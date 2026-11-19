# 臉模 v2：前髮專門練習（使用者 2026-11-19：前髮這塊需要特別學習；先不管後髮，只畫前髮）
#   ① 先做一整片剪齊的前髮（從頭頂垂下來的一塊，下緣在眉毛高度一條直線）
#   ② 再從下緣往上「剪掉」幾個細細長長的三角形（尖端朝上），剪掉的地方露出額頭
# 前髮填一個頭髮色，外框（含剪口的邊）畫黑線
# 用法：python3 hair_bangs.py <有 front_f.png 的資料夾> <輸出.png>
import os,sys,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont
N=256;CX,CY=128,112
HAIR=(190,152,90);INK=(0,0,0)
BOT=133                                                  # 前髮下緣（眉毛高度）
def piece():
  # 一整片：左右兩條邊從頭頂順著額頭下來到太陽穴，上面接頭頂的圓，下緣一條直線
  L=[(CX-30,38),(CX-48,50),(CX-58,70),(CX-62,94),(CX-63,116),(CX-63,BOT)]
  R=[(2*CX-x,y) for x,y in L]
  top=[(CX+30*math.cos(a),38-6*math.sin(a)) for a in np.linspace(math.pi,0,12)]   # 頭頂那段微微拱起
  return L[::-1]+[(CX-63,BOT),(CX+63,BOT)]+R+top[::-1][1:-1]
# 剪掉的三角形：(尖端 x, 尖端 y, 底邊中心 x, 底邊寬) —— 細細長長、長短不一，尖端稍微往中間（頭髮從頭頂梳下來）
CUTS=[(86,106,83,5),(100,96,98,6),(114,112,113,4),(128,94,130,6),(145,100,147,6),(160,110,162,4),(174,102,177,5)]
def mask(cut=True):
  m=Image.new('L',(N,N),0);d=ImageDraw.Draw(m)
  d.polygon([(round(x),round(y)) for x,y in piece()],fill=1)
  if cut:
    for ax,ay,bx,w in CUTS:d.polygon([(ax,ay),(bx-w/2,BOT+1),(bx+w/2,BOT+1)],fill=0)
  return np.array(m).astype(bool)
def render(img,cut=True):
  out=img.copy();M=mask(cut)
  out[M]=HAIR
  edge=M&~(np.roll(M,1,0)&np.roll(M,-1,0)&np.roll(M,1,1)&np.roll(M,-1,1))   # 外框（含剪口的邊）一格黑
  out[edge]=INK
  return out
if __name__=='__main__':
  D=sys.argv[1];img=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  F=ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',26)
  c=Image.new('RGB',(2*560,600),'white');dr=ImageDraw.Draw(c)
  for k,(cut,lab) in enumerate([(False,'① 一整片剪齊的前髮'),(True,'② 剪出幾個細長三角形')]):
    dr.text((k*560+10,6),lab,fill='black',font=F)
    c.paste(Image.fromarray(render(img,cut)).crop((40,20,216,200)).resize((528,540),Image.NEAREST),(k*560+16,50))
  c.save(sys.argv[2])
