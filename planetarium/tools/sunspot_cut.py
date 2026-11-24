import numpy as np, json, math, datetime, glob, os
from PIL import Image
from scipy import ndimage as ndi
from getimg import get
src=open(os.path.expanduser('~/Documents/GitHub/astro-labs/planetarium/tools/build_bodies.py')).read()
i=src.index('def sun_angles'); j=src.index('def sun_map'); exec(src[i:j])
DPP=0.03
def disc(a):
    on=a>60; ys,xs=np.where(on); cx,cy=(np.percentile(xs,.01)+np.percentile(xs,99.99))/2,(np.percentile(ys,.01)+np.percentile(ys,99.99))/2
    c=np.where(on[int(cy)])[0]; R=(c[-1]-c[0]+1)/2; cx=(c[-1]+c[0])/2; c=np.where(on[:,int(cx)])[0]; cy=(c[-1]+c[0])/2
    return cx,cy,R
def patch(a,geo,lat,cmd,B0,w,h):
    cx,cy,R=geo; n=lambda x:x*math.pi/180
    X=(np.arange(w)-(w-1)/2)*DPP; Y=((h-1)/2-np.arange(h))*DPP
    tx,ty=np.meshgrid(np.sin(n(X)),np.sin(n(Y))); z=np.sqrt(np.maximum(0,1-tx**2-ty**2))
    # group frame -> heliographic (central meridian toward us), axes: W, N, out
    cl,sl=math.cos(n(lat)),math.sin(n(lat)); cm,sm=math.cos(n(cmd)),math.sin(n(cmd))
    o=np.array([cl*sm,sl,cl*cm]); e=np.array([cm,0,-sm]); no=np.array([-sl*sm,cl,-sl*cm])
    P=tx[...,None]*e+ty[...,None]*no+z[...,None]*o
    b=n(B0); y=P[...,1]*math.cos(b)-P[...,2]*math.sin(b); zz=P[...,1]*math.sin(b)+P[...,2]*math.cos(b)
    px=cx+R*P[...,0]; py=cy-R*y
    return ndi.map_coordinates(a,[py,px],order=1,mode='nearest'), zz
if __name__=='__main__':
    sel=json.load(open('cand2.json')); extra=[(2400,14,'2024-05-10','13664',-18.,0,0),(2700,14,'2017-09-06','12673',-9.,0,0),(1060,14,'2017-09-04','12673',-9.,0,0),(1300,14,'2024-10-01','13842',-14,0,0)]
    items=[s for s in sel if s[7]]
    for e in extra:
        f=get(datetime.date.fromisoformat(e[2])); print(e[2],f); items.append(list(e)+[f])
    seen=set(); out=[]
    for s in items:
        if (s[3],s[2]) in seen: continue
        seen.add((s[3],s[2])); f=s[7]
        a=np.asarray(Image.open(f).convert('L'),float); st=os.path.basename(f); t=datetime.datetime.strptime(st[:15],'%Y%m%d_%H%M%S'); jd=t.toordinal()+1721424.5+(t.hour*60+t.minute)/1440
        P,B0,L0=sun_angles(jd); geo=disc(a); t0=datetime.datetime.fromisoformat(s[2]); dtd=(t-t0).total_seconds()/86400
        lat=s[4]; cmd=s[5]+13.2*dtd
        if s[6]: cmd=((s[6]-L0+180)%360)-180
        if s[3] in('13664','12673','13842'):
            # find the darkest large thing near that latitude
            best=None
            for c in range(-50,56,2):
                p,_=patch(a,geo,lat,c,B0,300,240); d=np.clip(1-p/np.median(p),0,1); v=(d>.15).sum()
                if best is None or v>best[0]: best=(v,c)
            cmd=best[1]
        for it in range(2):
            p,_=patch(a,geo,lat,cmd,B0,600,400); bg=ndi.median_filter(ndi.zoom(p,.1,order=1),size=25); bg=ndi.zoom(bg,10,order=1)[:400,:600]; T=p/np.median(p)
            d=np.where(ndi.gaussian_filter(T,2)<.90,1-T,0); 
            if d.sum()<3: break
            yy,xx=np.mgrid[0:400,0:600]; cy_,cx_=(d*yy).sum()/d.sum(),(d*xx).sum()/d.sum()
            lat+=(199.5-cy_)*DPP; cmd+=(cx_-299.5)*DPP/math.cos(math.radians(lat))
        w,h=(900,600); p,z=patch(a,geo,lat,cmd,B0,w,h)
        out.append((s,p,lat,cmd)); np.save(f'p_{s[3]}_{s[2]}.npy',p.astype(np.float32))
        print(s[0],s[2],s[3],round(lat,1),round(cmd,1),'min/med',round(p.min()/np.median(p),2),flush=True)
    json.dump([[*o[0],o[2],o[3]] for o in out],open('patches.json','w'))
    W=6; Hh=-(-len(out)//W); sh=Image.new('L',(W*300,Hh*200))
    for k,o in enumerate(out): sh.paste(Image.fromarray(np.clip(o[1]/np.median(o[1])*170,0,255).astype(np.uint8)).resize((298,198)),((k%W)*300,(k//W)*200))
    sh.save('sheet.png')
