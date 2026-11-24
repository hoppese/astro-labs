import os
import numpy as np, json, os, sys, pickle, fitscan as f, ell
from spk import SPK
from aeres import F as FAR
OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
K=SPK(os.environ['JPL_RAW']+'/de440.bsp')
for q in K.segs: K.load(*q)
IX={'Mercury':1,'Venus':2,'EMB':3,'Mars':4,'Jupiter':5,'Saturn':6,'Uranus':7,'Neptune':8,'Pluto':9}
def mk(src):
    def body(n,tt):
        et=np.asarray(tt)*86400.; p=lambda c,t:src.pv(c,t,et)
        if n=='Moon': return p(3,301)-p(3,399)
        if n=='Sun': return p(0,10)
        if n in ell.A0: return p(0,IX[n])-p(0,10)
        return p(0,IX[n])
    return body
NEAR=dict(t0=-164300,L=18240,n=14,bodies={'Moon':(32,27,0.1),'Mercury':(64,16,5),'Venus':(240,19,2.5),'EMB':(304,22,2.5),'Mars':(304,15,3),'Sun':(304,13,8),'Jupiter':(1824,13,40),'Saturn':(3648,15,80),'Uranus':(6080,14,150),'Neptune':(9120,14,250),'Pluto':(9120,8,250)})
FARR=dict(t0=-1826400,L=36480,n=60,bodies={'Mercury':(160,20,200),'Venus':(304,15,100),'EMB':(456,15,100),'Mars':(456,14,120),'Sun':(608,12,60),'Jupiter':(1824,12,200),'Saturn':(3648,15,400),'Uranus':(6080,11,800),'Neptune':(9120,8,1200),'Pluto':(9120,7,1200)})
def pack(I):
    ns,nc,_=I.shape; mx=np.abs(I).max(0); w=np.where(mx>0,np.floor(np.log2(np.maximum(mx,1)))+2,0).astype(int)
    head=bytes(w.ravel().tolist()); bits=[]
    U=np.zeros(0,np.uint8); out=[]
    for k in range(nc):
        for j in range(3):
            if w[k,j]==0: continue
            v=(I[:,k,j]+(1<<(w[k,j]-1))).astype(np.int64)
            b=((v[:,None]>>np.arange(w[k,j]-1,-1,-1))&1).astype(np.uint8); out.append(b.ravel())
    b=np.concatenate(out) if out else np.zeros(0,np.uint8)
    return head+np.packbits(b).tobytes()
manifest={'doc':'tools/build_ephemeris.py','sets':[]}; worst={}
for name,S,src in (('near',NEAR,K),('far',FARR,FAR)):
    base=mk(src); tot=0; skip=[]
    for c in range(S['n']):
        t0=S['t0']+c*S['L']
        if name=='far' and t0>=NEAR['t0'] and t0+S['L']<=NEAR['t0']+NEAR['n']*NEAR['L']: skip.append(c); continue
        blob=b''
        for n,(seg,deg,tol) in S['bodies'].items():
            q=tol*.25
            if n in ell.A0:
                p=ell.fitell(base,n,float(t0),float(S['L'])); f.body=lambda nn,tt:base(nn,tt)-ell.kep(p,tt,t0+S['L']/2); blob+=np.array(p,'<f8').tobytes()
            else: f.body=base
            # segments may stop short of L when seg does not divide it: pad
            ns=int(np.ceil(S['L']/seg-1e-9)); assert abs(ns*seg-S['L'])<1e-6,(n,seg)
            I=f.fit(n,float(t0),float(S['L']),seg,deg,q); e=f.err(n,float(t0),seg,I,q,3000); worst[name+n]=max(worst.get(name+n,0),e)
            blob+=pack(I)
        open(f'{OUT}/{name}-{c}.bin','wb').write(blob); tot+=len(blob)
        if c%5==0: print(name,c,len(blob),flush=True)
    print(name,'total',tot)
    manifest['sets'].append(dict(name=name,t0=S['t0'],L=S['L'],n=S['n'],skip=skip,bodies=[dict(id=n,seg=a,deg=b,q=t*.25,ell=n in ell.A0) for n,(a,b,t) in S['bodies'].items()]))
print({k:round(float(v),1) for k,v in worst.items()})
json.dump(manifest,open(f'{OUT}/index.json','w'),separators=(',',':'))
