import sys
from PIL import Image
import numpy as np
DK=(184,124,104);SK=(242,204,177)
def noline(p):
  a=np.array(Image.open(p).convert('RGB')).astype(int)
  white=(a==255).all(2);dk=(a==DK).all(2);nb=np.zeros_like(white)
  for dy in(-1,0,1):
    for dx in(-1,0,1):nb|=np.roll(np.roll(white,dy,0),dx,1)
  a[dk&nb]=SK;return Image.fromarray(a.astype('uint8'))
fs=sys.argv[1:4];out=sys.argv[4]
ims=[noline(p) for p in fs]
c=Image.new('RGB',(2304,768),'white')
for i,im in enumerate(ims):c.paste(im.resize((768,768),Image.NEAREST),(768*i,0))
c.save(out)
if len(sys.argv)>5:
  z=Image.new('RGB',(3*320+40,320),'white')
  for i,(im,(x,y)) in enumerate(zip(ims,[(108,160),(66,160),(52,160)])):z.paste(im.crop((x,y,x+40,y+40)).resize((320,320),Image.NEAREST),(i*340,0))
  z.save(sys.argv[5])
