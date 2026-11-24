import numpy as np, json, math
from PIL import Image
from scipy import ndimage as ndi
P=json.load(open('patches.json')); DPP=.03; MSH=(DPP*math.pi/180)**2/(2*math.pi)*1e6
drop={'12958','12998'}; keep=[]
for s in P:
    if s[3] in drop: continue
    p=np.load(f'p_{s[3]}_{s[2]}.npy'); T=p/np.median(p); g=ndi.gaussian_filter(T,1.6)
    core=g<.86; lab,n=ndi.label(ndi.binary_dilation(core,iterations=20)); H,W=T.shape
    # keep the pieces that belong to this group: near the middle
    yy,xx=np.mgrid[0:H,0:W]; m=np.zeros_like(core)
    for k in range(1,n+1):
        q=(lab==k)&core
        if q.sum()*MSH<.4: continue
        cy,cx=yy[q].mean(),xx[q].mean()
        if math.hypot((cx-449.5)*DPP,(cy-299.5)*DPP*1.5)<(9.5 if s[0]>1000 else 7 if s[0]>300 else 5.5): m|=q
    if m.sum()<4: print('empty',s[3]); continue
    grow=ndi.binary_dilation(m,iterations=3)&(g<.97); grow=ndi.binary_dilation(grow,iterations=1)
    a=ndi.gaussian_filter(grow.astype(float),1.2); 
    R=.22+.78*np.clip(T,0,1.0)                      # the display scale of the SDO picture cuts off at about a quarter of the photosphere: umbra 0.22, penumbra 0.75-0.8
    R=ndi.gaussian_filter(R,.5); out=1-(1-R)*np.clip(a*1.15,0,1)
    out[out>.975]=1
    if s[4]<0: out=out[::-1]; m=m[::-1]
    ys,xs=np.where(out<1); y0,y1,x0,x1=ys.min()-6,ys.max()+7,xs.min()-6,xs.max()+7
    y0,x0=max(0,y0),max(0,x0); t=out[y0:y1,x0:x1]; mm=m[y0:y1,x0:x1]
    d=1-t; yy,xx=np.mgrid[0:t.shape[0],0:t.shape[1]]; w=d/d.sum(); my,mx=(w*yy).sum(),(w*xx).sum(); cxx,cyy,cxy=(w*(xx-mx)**2).sum(),(w*(yy-my)**2).sum(),(w*(xx-mx)*(yy-my)).sum()
    th=.5*math.atan2(2*cxy,cxx-cyy); ev=np.linalg.eigvalsh([[cxx,cxy],[cxy,cyy]]); ratio=math.sqrt(ev[1]/max(ev[0],1e-9))
    tilt=math.degrees(th)                            # image y down: positive = western (leading) end lower = nearer the equator (tile shown as northern)
    area=float((t<.93).sum()*MSH); keep.append(dict(id=s[3],date=s[2],cat=s[0],cls=s[1],area=round(area,1),tilt=round(tilt,1),ratio=round(ratio,2),cx=mx,cy=my,t=t))
keep.sort(key=lambda k:-k['t'].shape[0])
W=2048; x=y=sh=0; 
for k in keep:
    h,w=k['t'].shape
    if x+w+4>W: x=0;y+=sh+4;sh=0
    k['x'],k['y']=x,y; x+=w+4; sh=max(sh,h)
Ht=y+sh; HH=2048 if Ht>1024 else 1024; print('height',Ht,len(keep))
A=np.full((HH,W),255,np.uint8)
for k in keep: h,w=k['t'].shape; A[k['y']:k['y']+h,k['x']:k['x']+w]=np.round(k['t']*255)
Image.fromarray(A).save('spots.png',optimize=True); Image.fromarray(A).save('spots.webp',lossless=True,quality=90,method=6)
import os; print(os.path.getsize('spots.png'),os.path.getsize('spots.webp'))
meta=[[k['x'],k['y'],k['t'].shape[1],k['t'].shape[0],round(k['cx'],1),round(k['cy'],1),k['area'],k['tilt'],k['ratio'],k['id'],k['date']] for k in sorted(keep,key=lambda k:k['area'])]
json.dump(dict(dpp=DPP,w=W,h=HH,tiles=meta),open('spots.json','w'),separators=(',',':'))
for m in meta: print(m)
for k in keep: print(k['id'],k['cat'],k['area'],round(k['area']/k['cat'],2),end='; ')
