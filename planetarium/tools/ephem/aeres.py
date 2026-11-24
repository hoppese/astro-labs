import os
import numpy as np
from spk import SPK
R=os.environ['JPL_RAW']+'/'
N='https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/'
Y=86400*365.25
class Full:
    def __init__(s):
        s.a=SPK(R+'de441_part-1.bsp',N+'de441_part-1.bsp'); s.b=SPK(R+'de441_part-2.bsp',N+'de441_part-2.bsp')
        for k,x,y in ((s.a,-5010*Y,-30*Y),(s.b,-32*Y,1010*Y)):
            for q in k.segs: k.load(*q,x,y)
    def pv(s,c,t,et):
        et=np.asarray(et,float); m=et<-30.46*Y; r=np.zeros((len(et),3))
        if m.any(): r[m]=s.a.pv(c,t,et[m])
        if (~m).any(): r[~m]=s.b.pv(c,t,et[~m])
        return r
F=Full(); AU=149597870.7
def de(n,tt):
    p=lambda c,t:F.pv(c,t,tt*86400.)
    if n=='Moon': return p(3,301)-p(3,399)
    return p(0,{'Mercury':1,'Venus':2,'EMB':3,'Mars':4}[n])-p(0,10)
def sph(P):
    e=np.deg2rad(84381.406/3600); x,y,z=P.T; Yv=y*np.cos(e)+z*np.sin(e); Zv=-y*np.sin(e)+z*np.cos(e); r=np.sqrt(x*x+y*y+z*z)
    return np.arctan2(Yv,x),np.arcsin(Zv/r),r
if __name__=='__main__':
    d=np.fromfile('aedump.bin').reshape(-1,16); o=np.argsort(d[:,0]); d=d[o]; tt=d[:,0]
    res={}
    for i,n in enumerate(['Mercury','Venus','EMB','Mars','Moon']):
        P=d[:,1+3*i:4+3*i]*AU; D=de(n,tt); l,b,r=sph(P); L,B,Rr=sph(D)
        dl=((L-l+np.pi)%(2*np.pi)-np.pi)*206265; db=(B-b)*206265; dr=Rr/r-1
        res[n]=(dl,db,dr)
        print(n)
        for a in range(-3000,3000,500):
            m=(tt>(a-2000)*365.25)&(tt<(a+500-2000)*365.25)
            print('  %5d  lon mean %8.2f sd %6.2f max %7.2f | lat mean %6.2f sd %6.2f | dr sd %.2e'%(a,dl[m].mean(),dl[m].std(),abs(dl[m]).max(),db[m].mean(),db[m].std(),dr[m].std()))
    np.savez('aeres.npz',tt=tt,**{n+k:v for n in res for k,v in zip(('l','b','r'),res[n])})
