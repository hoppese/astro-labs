import os
import numpy as np
from spk import SPK
from numpy.polynomial import chebyshev as Ch
K=SPK(os.environ['JPL_RAW']+'/de440.bsp')
for q in K.segs: K.load(*q)
def body(n,tt):
    et=tt*86400.
    p=lambda c,t:K.pv(c,t,et)
    if n=='Mercury': return p(0,1)-p(0,10)
    if n=='Venus': return p(0,2)-p(0,10)
    if n=='EMB': return p(0,3)-p(0,10)
    if n=='Mars': return p(0,4)-p(0,10)
    if n=='Moon': return p(3,301)-p(3,399)
    if n=='Sun': return p(0,10)
    return p(0,{'Jupiter':5,'Saturn':6,'Uranus':7,'Neptune':8,'Pluto':9}[n])
TOL={'Mercury':6,'Venus':3,'EMB':3,'Mars':4,'Jupiter':40,'Saturn':80,'Uranus':150,'Neptune':250,'Pluto':250,'Sun':8,'Moon':25}
CAND={'Moon':[4,8,16,24,32],'Mercury':[16,32,48,96],'Venus':[32,48,96,152],'EMB':[32,48,96,152],'Mars':[48,96,152,304],'Sun':[48,96,152,304,608],'Jupiter':[304,608,1216,1824],'Saturn':[608,1216,1824,3648],'Uranus':[1216,1824,3648,6080],'Neptune':[1824,3648,6080,9120],'Pluto':[1824,3648,6080,9120]}
T0=-164300.;L=18240.
def fit(n,t0,L,seg,deg,q):
    ns=int(round(L/seg)); m=deg+9
    x=np.cos(np.pi*(np.arange(m)+.5)/m)[::-1]
    tm=t0+seg*(np.arange(ns)+.5)
    tt=(tm[:,None]+x[None,:]*seg/2).ravel()
    P=body(n,tt).reshape(ns,m,3)
    V=Ch.chebvander(x,deg); pinv=np.linalg.pinv(V)
    C=np.einsum('km,smj->skj',pinv,P)
    I=np.round(C/q).astype(np.int64)
    return I
def bits(I):
    # per coef & axis width (signed)
    mx=np.abs(I).max(0); w=np.where(mx>0,np.floor(np.log2(np.maximum(mx,1)))+2,0); return int(w.sum()*I.shape[0]), w
def err(n,t0,seg,I,q,N=6000):
    rng=np.random.default_rng(1); tt=t0+rng.random(N)*seg*I.shape[0]
    s=np.floor((tt-t0)/seg).astype(int); x=(tt-t0-seg*(s+.5))/(seg/2)
    V=Ch.chebvander(x,I.shape[1]-1); P=np.einsum('nk,nkj->nj',V,I[s]*q)
    return np.sqrt(((P-body(n,tt))**2).sum(1)).max()
if __name__=='__main__':
    tot=0
    for n in TOL:
        best=None
        for seg in CAND[n]:
            for deg in range(4,40):
                q=TOL[n]*0.25
                I=fit(n,T0+10*L,L,seg,deg,q)
                e=err(n,T0+10*L,seg,I,q,2000)
                if e<TOL[n]*1.0 or e<TOL[n]:
                    b,_=bits(I)
                    if best is None or b<best[0]: best=(b,seg,deg,e)
                    break
        print(n,best,best[0]/8/1000,'kB'); tot+=best[0]/8
    print(tot,'per chunk; x22',tot*22)
