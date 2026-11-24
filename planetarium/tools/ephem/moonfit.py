import os
import numpy as np, json, itertools
from aeres import de
rng=np.random.default_rng(3); N=12000
tt=np.sort(rng.uniform(-1826700,366000,N)); T=tt/36525; U=tt/1e6   # U scaled
AS=np.pi/648000
def prec(T):  # EQJ -> mean ecliptic of date  (P03, as in astronomy-engine)
    t=T; e0=84381.406
    psi=(((((-0.0000000951*t+0.000132851)*t-0.00114045)*t-1.0790069)*t+5038.481507)*t)
    om=(((((0.0000003337*t-0.000000467)*t-0.00772503)*t+0.0512623)*t-0.025754)*t+e0)
    chi=(((((-0.0000000560*t+0.000170663)*t-0.00121197)*t-2.3814292)*t+10.556403)*t)
    eps=(((((-0.0000000434*t-0.000000576)*t+0.00200340)*t-0.0001831)*t-46.836769)*t+84381.406)
    return [x*AS for x in (e0+0*t,psi,om,chi,eps)]
def to_ecd(P,T):
    e0,psi,om,chi,eps=prec(T)
    sa,ca=np.sin(e0),np.cos(e0);sb,cb=np.sin(-psi),np.cos(-psi);sc,cc=np.sin(-om),np.cos(-om);sd,cd=np.sin(chi),np.cos(chi)
    xx=cd*cb-sb*sd*cc;yx=cd*sb*ca+sd*cc*cb*ca-sa*sd*sc;zx=cd*sb*sa+sd*cc*cb*sa+ca*sd*sc
    xy=-sd*cb-sb*cd*cc;yy=-sd*sb*ca+cd*cc*cb*ca-sa*cd*sc;zy=-sd*sb*sa+cd*cc*cb*sa+ca*cd*sc
    xz=sb*sc;yz=-sc*cb*ca-sa*cc;zz=-sc*cb*sa+cc*ca
    x,y,z=P.T
    X=xx*x+yx*y+zx*z; Y=xy*x+yy*y+zy*z; Z=xz*x+yz*y+zz*z
    ce,se=np.cos(eps),np.sin(eps)
    return np.stack([X,Y*ce+Z*se,-Y*se+Z*ce],-1)
P=to_ecd(de('Moon',tt),T); R=np.linalg.norm(P,axis=1); LON=np.arctan2(P[:,1],P[:,0]); LAT=np.arcsin(P[:,2]/R)
d2=np.pi/180
pol={'L':[218.3164477,481267.88123421,-0.0015786,1/538841,-1/65194000],'D':[297.8501921,445267.1114034,-0.0018819,1/545868,-1/113065000],'M':[357.5291092,35999.0502909,-0.0001536,1/24490000,0],'l':[134.9633964,477198.8675055,0.0087414,1/69699,-1/14712000],'F':[93.2720950,483202.0175233,-0.0036539,-1/3526000,1/863310000]}
pl={'Ve':[181.979801,58519.21304,0.0003,0,0],'Ju':[34.351484,3036.30277,0.0002,0,0],'Ea':[100.466457,36000.76983,.0003,0,0],'Ma':[355.433,19141.69647,.0003,0,0],'Sa':[50.077444,1223.51106,.0005,0,0]}
for k in pol: pol[k]=np.array(pol[k]+[0.,0.])*d2
for k in pl: pl[k]=np.array(pl[k]+[0.,0.])*d2
TP=np.stack([T**k for k in range(7)],-1)
def args(): return {k:TP@pol[k] for k in pol}|{k:TP@pl[k] for k in pl}
wrap=lambda x:(x+np.pi)%(2*np.pi)-np.pi
# candidates
KEY=['D','M','l','F','Ve','Ju','Ea','Ma','Sa','L']
def cand(parF):
    out=[]
    for d,m,l,f in itertools.product(range(-6,7),range(-3,4),range(-5,6),range(-4,5)):
        if abs(f)%2!=parF: continue
        v=(d,m,l,f)
        nz=[x for x in v if x]; 
        if not nz or nz[0]<0 or sum(map(abs,v))>9: continue
        out.append(v+(0,0,0,0,0,0))
    return out
plan=[]
for (a,b,c,e,g) in [(1,0,0,0,0),(2,0,0,0,0),(3,0,0,0,0),(4,0,0,0,0),(5,0,0,0,0),(8,0,0,0,0),(18,0,0,0,0),(10,0,0,0,0),(13,0,0,0,0),(0,1,0,0,0),(0,2,0,0,0),(0,3,0,0,0),(0,0,0,2,0),(0,0,0,1,0),(0,0,0,4,0),(0,0,0,0,1),(0,0,0,0,2),(0,0,0,8,0),(0,0,0,15,0)]:
    for ee in range(-20,21):
        s=a+b+e+g+ee
        for d,l,f in itertools.product((-2,0,2),(-2,-1,0,1,2),(-2,-1,0,1,2)):
            if abs(s)<=4 or True:
                if abs(a+b+e+g+ee)<=3: plan.append((d,0,l,f,a,b,ee,e,g,0))
lin=[(0,0,0,1,0,0,0,0,0,-1),(0,0,0,0,0,0,0,0,0,1),(0,0,1,0,0,0,0,0,0,1),(0,0,-1,0,0,0,0,0,0,1),(0,0,0,2,0,0,0,0,0,-1),(0,0,0,1,0,0,0,0,0,1)]
CL=[c for c in cand(0)]+[p for p in plan if p[3]%2==0]+lin; CB=[c for c in cand(1)]+[p for p in plan if p[3]%2]+lin
print(len(CL),len(CB))
def argmat(terms,A):
    M=np.stack([A[k] for k in KEY],0); return np.array(terms,float)@M   # nterm x N
sel={'lon':[(0,0,1,0)+(0,)*6],'lat':[(0,0,0,1)+(0,)*6],'r':[(0,0,1,0)+(0,)*6]}
NT={'lon':30,'lat':20,'r':20}
amp={}
def model(A):
    out={}
    for w in ('lon','lat','r'):
        B=argmat(sel[w],A); s,c=np.sin(B),np.cos(B); out[w]=(s,c)
    return out
def residual_fit(it):
    """Gauss-Newton on arguments + amplitudes"""
    A=args(); mo=model(A); cols={}; 
    res={}
    for w in ('lon','lat','r'):
        s,c=mo[w]; n=len(sel[w])
        h=min(12,len(s)); X=np.concatenate([s,c,s*U,c*U,s*U*U,c*U*U]+[q[:h]*U**j for j in (3,4,5) for q in (s,c)],0).T
        y={'lon':wrap(LON-A['L']),'lat':LAT,'r':R/385000.-1}[w]
        if w=='r': X=np.concatenate([np.ones((N,1)),U[:,None],X],1)
        if w!='r': X=np.concatenate([X],1)
        co,*_=np.linalg.lstsq(X,y,rcond=1e-12); res[w]=(y-X@co,X,co)
    return A,mo,res
for it in range(6):
    A,mo,res=residual_fit(it)
    # argument update: derivative columns
    rows=[]; D=[]
    cl=res['lon'][2]; n=len(sel['lon']); s,c=mo['lon']; amps=cl[:n]+0*cl[:n]; ampc=cl[n:2*n]
    cb=res['lat'][2]; nb=len(sel['lat']); sb,cbm=mo['lat']
    names=["L"] ; colL=[];colB=[]
    for k in names:
        if k=='L': dl=np.ones(N); db=np.zeros(N)
        else:
            ci=KEY.index(k); cf=np.array([t[ci] for t in sel['lon']],float); dl=(cf*amps)@c-(cf*ampc)@s
            cf=np.array([t[ci] for t in sel['lat']],float); db=(cf*cb[:nb])@cbm-(cf*cb[nb:2*nb])@sb
        for j in range(7):
            if k=='M' and j>3: continue
            if k!='L' and j==0 and False: continue
            colL.append(dl*U**j); colB.append(db*U**j)
    Xa=np.concatenate([np.stack(colL,-1),np.stack(colB,-1)],0); 
    # project out amplitude columns
    Ql,_=np.linalg.qr(res['lon'][1]); Qb,_=np.linalg.qr(res['lat'][1])
    Xa[:N]-=Ql@(Ql.T@Xa[:N]); Xa[N:]-=Qb@(Qb.T@Xa[N:])
    y=np.concatenate([res['lon'][0],res['lat'][0]]); sc=np.linalg.norm(Xa,axis=0)+1e-30
    co,*_=np.linalg.lstsq(Xa/sc,y,rcond=1e-9); co/=sc; i=0
    for k in names:
        for j in range(7):
            if k=='M' and j>3: continue
            pol[k][j]+=co[i]*(36525/1e6)**j; i+=1
    A,mo,res=residual_fit(it)
    print(it,{w:(len(sel[w]),float(np.round(res[w][0].std()/ (AS if w!='r' else 1e-6),3)),float(np.round(abs(res[w][0]).max()/(AS if w!='r' else 1e-6),2))) for w in res},flush=True)
    if it==5: break
    for w,C in (('lon',CL),('lat',CB),('r',CL)):
        B=argmat(C,A).astype(np.float32); e=np.exp(1j*B); pr=abs(e@res[w][0].astype(np.float32))/N*2
        have=set(sel[w]); o=np.argsort(-pr); add=[]
        for i in o:
            if C[i] not in have: add.append(C[i])
            if len(add)>=NT[w]: break
        sel[w]+=add
import pickle; pickle.dump(dict(pol=pol,pl=pl,sel=sel,co={w:res[w][2] for w in res}),open('moonfit.pkl','wb'))
for w in res:
    r=res[w][0]/(AS if w!='r' else 1e-6)
    print(w,[ (y,round(float(r[(T*100>y)&(T*100<y+500)].std()),2)) for y in range(-5000,1000,500)])
