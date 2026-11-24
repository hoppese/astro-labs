import os
import numpy as np
from scipy.optimize import least_squares
AU=149597870.7
def kep(p,tt,tm):
    """p: a(km), lam0, n, h,k,p,q, dh,dk,dp,dq (rates per 10000 d) ; h=e sin(varpi), k=e cos(varpi), p=sin(i/2) sin Om, q=.. cos ; returns EQJ km (elements on J2000 equator axes directly)"""
    a,l0,n,h0,k0,P0,Q0,dh,dk,dP,dQ=p; d=tt-tm; u=d/10000.
    h=h0+dh*u;k=k0+dk*u;P=P0+dP*u;Q=Q0+dQ*u
    lam=l0+n*d
    F=lam+0.
    for _ in range(12):
        F=F-(F+h*np.cos(F)-k*np.sin(F)-lam)/(1-h*np.sin(F)-k*np.cos(F))
    b=1/(1+np.sqrt(1-h*h-k*k))
    cF,sF=np.cos(F),np.sin(F)
    X=a*((1-h*h*b)*cF+h*k*b*sF-k); Y=a*((1-k*k*b)*sF+h*k*b*cF-h)
    s=np.sqrt(1-P*P-Q*Q)
    fx=1-2*P*P; fy=2*P*Q; fz=-2*P*s
    gx=2*P*Q; gy=1-2*Q*Q; gz=2*Q*s
    return np.stack([X*fx+Y*gx,X*fy+Y*gy,X*fz+Y*gz],-1)
A0={'Mercury':.38709893,'Venus':.72333199,'EMB':1.00000011,'Mars':1.52366231}
PER={'Mercury':87.9691,'Venus':224.7008,'EMB':365.2564,'Mars':686.9796}
def fitell(body,n,t0,L):
    tt=t0+L*(np.arange(1600)+.5)/1600; tm=t0+L/2; D=body(n,tt)
    n0=2*np.pi/PER[n]
    # initial from angular momentum & eccentricity vector at middle
    m=800; tv=np.array([tm-.5,tm+.5]); r2=body(n,np.array([tm-.5,tm,tm+.5])); r=r2[1]; v=(r2[2]-r2[0])
    mu=n0*n0*(A0[n]*AU)**3; hv=np.cross(r,v); e=np.cross(v,hv)/mu-r/np.linalg.norm(r); w=hv/np.linalg.norm(hv)
    inc=np.arccos(w[2]); Om=np.arctan2(w[0],-w[1]); P=np.sin(inc/2)*np.sin(Om);Q=np.sin(inc/2)*np.cos(Om)
    f=np.array([1-2*P*P,2*P*Q,-2*P*np.sqrt(1-P*P-Q*Q)]); g=np.array([2*P*Q,1-2*Q*Q,2*Q*np.sqrt(1-P*P-Q*Q)])
    k=e@f;h=e@g
    # lam: from F
    X=r@f;Y=r@g; a=A0[n]*AU; b=1/(1+np.sqrt(1-h*h-k*k)); d=a*np.sqrt(1-h*h-k*k)
    cF=k+((1-k*k*b)*X-h*k*b*Y)/d; sF=h+((1-h*h*b)*Y-h*k*b*X)/d; F=np.arctan2(sF,cF); l0=F+h*np.cos(F)-k*np.sin(F)
    x0=np.array([1.,l0,1.,h,k,P,Q,0,0,0,0]); sc=np.array([a,1,n0]+[1]*8)
    fun=lambda x:((kep(x*sc,tt,tm)-D)/a*1e5).ravel()
    # widen window progressively for the phase
    for frac in (.02,.1,.4,1):
        mm=abs(tt-tm)<L/2*frac+1
        fu=lambda x:((kep(x*sc,tt[mm],tm)-D[mm])/a*1e5).ravel()
        x0=least_squares(fu,x0,x_scale=np.array([1e-5,1e-5,1e-5/(L*n0)*10]+[1e-5]*8),max_nfev=60).x
    p=x0*sc; return p
