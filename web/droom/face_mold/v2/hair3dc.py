# 臉模 v2：一片片髮束的頭髮轉到斜臉、側臉（2026-11-19）
# 正面的片（hair_clumps.py）放回 3D：
#   瀏海片＝頭頂球殼前面那部分＋垂到額頭前；頭頂其他地方＝從髮旋往後、往兩邊的經線片（寬窄不一）
#   兩側片＝直立的厚片（左右照正面的片分、前後再切幾刀，側面看也是一條條）；後髮＝頭後面往下垂的片
# 每個點記住自己屬於哪一片；投影後：片的背光側（畫面右）一格暗、疊在別片上的那片在下面投影子（右下）、
# 片的下面平的；高光＝球殼上一圈（前面往下彎），畫在每片上、各片錯開；近側鬢髮一定在臉前面；不畫黑框
# 用法：HS=hime|bob python3 hair3dc.py <資料夾（front_f／turn45_f／side_f）> <輸出.png>
import os,sys,math,random
import numpy as np
from PIL import Image,ImageDraw
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import hair_clumps as HC
from hair3d import head_depth
N=256;CY=HC.CY;RO=HC.RO;C=HC.C;BACK=1.08
def samples():
  cap,bangs,sides,backs=HC.build()
  rnd=random.Random(17)
  # 頭頂其他地方的經線片：照經度分（寬窄不一）
  bins=[];a=-180
  while a<180:bins.append(a);a+=rnd.choice([20,26,32,40])   # 頭頂其他地方的片寬一點（線不要太多）
  def lon_id(x,z):
    ang=math.degrees(math.atan2(x,z));k=sum(1 for b in bins if b<=ang)
    return ('lon',k)
  bang_of=np.full((N,N),-1)
  for cl in sorted(bangs,key=lambda c:c.layer):bang_of[cl.mask]=cl.rid
  bang_layer={cl.rid:cl.layer for cl in bangs}
  bcuts=[-14];zz=-14
  while zz>-100:zz-=rnd.choice([18,22,26]);bcuts.append(zz)
  P=[]
  for y in np.arange(CY-RO+.25,CY+48,.5):
    dy=y-CY;r=math.sqrt(max(0,RO*RO-dy*dy))
    if r<1:continue
    n=int(2*math.pi*r/.45)
    for k in range(n):
      t=k/n*2*math.pi;x,z=r*math.cos(t),r*math.sin(t)
      zz=z*BACK if z<0 else z
      if not(y<CY+8 or z<-14 or (abs(x)>48 and y<CY+34)):continue
      X,Yp=int(round(128+x)),int(y)
      if z>0 and 0<=X<N and bang_of[Yp,X]>=0:
        b=bang_of[Yp,X];P.append((x,y,zz,('bang',b),bang_layer[b]))
      elif zz<-14 and y>CY-14:P.append((x,y,zz,('back',sum(1 for c in bcuts if c>=zz)),0))   # 後腦勺下半＝後髮的上端（同一片，接縫不畫線）
      else:P.append((x,y,zz,lon_id(x,z),0))
  for cl in bangs:                                  # 瀏海垂下來那段（赤道以下）
    for Yp,X in zip(*np.nonzero(cl.mask)):
      if Yp<CY+8:continue
      x=X-128;z=math.sqrt(max(0,RO*RO-x*x))
      for o in(0,.5):P.append((x+o,Yp,z+cl.layer*.6,('bang',cl.rid),cl.layer));P.append((x+o,Yp+.5,z+cl.layer*.6,('bang',cl.rid),cl.layer))
  zcuts=[-12];zz=-12
  while zz<22:zz+=rnd.choice([11,13,15]);zcuts.append(min(22,zz))
  for cl in sides:                                  # 兩側：直立厚片，前後再切幾刀
    for Yp,X in zip(*np.nonzero(cl.mask)):
      x=X-128
      for zf in np.arange(-12,22.1,.8):
        if Yp<CY+8 and x*x+(Yp-CY)**2+zf*zf<(RO-1)**2:continue   # 在頭頂那圈裡面＝被蓋住，不取（側面看上端才順著頭的圓）
        zb=sum(1 for c in zcuts if c<=zf)
        sid=('side',zb,1 if x>0 else -1)               # 轉過去看到的是前後那幾刀（左右照片分會在每格跳來跳去、變成雜線）
        P.append((x,Yp,zf,sid,cl.layer));P.append((x+.5,Yp+.5,zf,sid,cl.layer))
  for cl in backs:                                  # 後髮：頭後面往下垂，前後也切
    rows=np.nonzero(cl.mask.any(1))[0]
    for Yp in rows:
      if Yp<CY-10:continue
      xs=np.nonzero(cl.mask[Yp])[0]
      for X in range(xs.min(),xs.max()+1):
        x=X-128;zo=-math.sqrt(max(0,(RO+2)**2-x*x))*BACK
        for f in(1,.8,.6,.4):
          bid=('back',sum(1 for c in bcuts if c>=zo*f))   # 後髮也照前後深度切（照片分的話側面看每一格都換片、變成一堆直線）
          for o in(0,.5):P.append((x+o,Yp,zo*f,bid,0));P.append((x+o,Yp+.5,zo*f,bid,0))
  return P
def render(img,deg,cx):
  a=math.radians(deg);ca,sa=math.cos(a),math.sin(a)
  HD=head_depth(deg,cx);white=(img==255).all(2)
  zb={};info={}
  for x,y,z,cid,layer in samples():
    X=int(math.floor(cx+x*ca-z*sa));Yp=int(math.floor(y));d=x*sa+z*ca
    if not(0<=X<N and 0<=Yp<N):continue
    k=(X,Yp);db=d+{'bang':2,'side':3,'lon':0,'back':-5}[cid[0]]   # 前後差不多時：瀏海、鬢髮在前，後髮在後（不然每格跳來跳去變雜線）
    if k not in zb or db>zb[k][0]:zb[k]=(db,d);info[k]=(cid,layer,x,y,z)
  out=img.copy();vis={}
  for k,(db,d) in zb.items():
    X,Yp=k;cid,layer,x,y,z=info[k]
    near=cid[0]=='side' and x*sa>0            # 近側鬢髮一定在臉前面
    if white[Yp,X] or near or d>=HD[Yp,X]-1.5:
      out[Yp,X]=C['mid'];vis[k]=info[k]
  # 片的邊：背光側（右）一格暗；疊在別片上 → 在下面那片投影子（右下）
  # 跟正面一樣：只有約 45% 的分界一路到頭頂，其他只畫中下段；孤立的點不畫（取樣跳動造成的雜點）
  rf=random.Random(13);full={}
  E={}
  for (X,Yp),(cid,layer,x,y,z) in vis.items():
    r=vis.get((X+1,Yp))
    if r is None or r[0]==cid:continue
    key=tuple(sorted([str(cid),str(r[0])]))
    f=full.setdefault(key,rf.random()<.45)
    if not f and y<CY-46:continue
    E[(X,Yp)]=(r[1]<layer)
  def run(X,Yp,dy):                                 # 往上／往下連續幾格是邊（左右可以偏一格）
    n=0
    while True:
      Yp+=dy
      nx=next((X+dx for dx in(0,-1,1) if (X+dx,Yp) in E),None)
      if nx is None:return n
      X=nx;n+=1
  for (X,Yp),cast in E.items():
    if run(X,Yp,-1)+run(X,Yp,1)<5:continue          # 短短一截的不畫（取樣跳動造成的雜線）
    out[Yp,X]=C['sh']
    if cast and (X+1,Yp+1) in vis:out[Yp+1,X+1]=C['sh']   # 影子緊貼著邊（隔一格會變兩條細線）
  # 瀏海下緣投在額頭的影子
  for (X,Yp),(cid,layer,x,y,z) in vis.items():
    if cid[0]=='bang' and (X,Yp+1) not in vis and Yp+1<N and not white[Yp+1,X]:out[Yp+1,X]=HC.SKSH
  # 高光：球殼上一圈、前面往下彎，畫在每片上（各片上下錯開），在片的邊上斷開
  rnd=random.Random(3);off={}
  for (X,Yp),(cid,layer,x,y,z) in vis.items():
    if cid[0] not in('bang','lon') or z<-RO*.2:continue
    o=off.setdefault(cid,rnd.uniform(-2,2))
    ring=CY-34+15*(max(0,z)/RO)**2+o
    dd=y-ring
    same=vis.get((X-1,Yp),(None,))[0]==cid and vis.get((X+1,Yp),(None,))[0]==cid
    if abs(dd)<1.3 and same:out[Yp,X]=C['hi']
    elif abs(dd)<2.6 and tuple(out[Yp,X])==C['mid']:out[Yp,X]=C['li']
  return out
if __name__=='__main__':
  D=sys.argv[1]
  front=np.array(Image.open(f'{D}/front_f.png').convert('RGB'))
  turn=np.array(Image.open(f'{D}/turn45_f.png').convert('RGB'))
  side=np.array(Image.open(f'{D}/side_f.png').convert('RGB'))
  DEG=float(os.environ.get('DEG','30'))
  imgs=[HC.render(front,'final'),render(turn,DEG,126),render(side,90,140)]
  c=Image.new('RGB',(3*400,440),'white')
  for k,im in enumerate(imgs):c.paste(Image.fromarray(im).crop((18,14,238,256)).resize((366,402),Image.NEAREST),(k*400+17,30))
  c.save(sys.argv[2])
