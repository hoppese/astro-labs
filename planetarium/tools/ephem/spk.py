import os
"""SPK type 2 reader (numpy), local file or ranged http to local sparse cache."""
import numpy as np, struct, subprocess, os
class SPK:
    def __init__(s, path, url=None):
        s.path=path; s.url=url
        if url and not os.path.exists(path+'.head'):
            subprocess.check_call(['/usr/bin/curl','-s','-r','0-65535','-o',path+'.head',url])
        f=open(path if not url else path+'.head','rb').read(65536)
        nd,ni=struct.unpack('<ii',f[8:16]); fwd,=struct.unpack('<i',f[76:80])
        s.segs={}
        rec=fwd
        while rec:
            r=f[(rec-1)*1024:rec*1024]; nxt,prev,n=struct.unpack('<ddd',r[:24])
            for i in range(int(n)):
                o=24+i*40; a,b=struct.unpack('<dd',r[o:o+16]); t,c,fr,ty,i0,i1=struct.unpack('<6i',r[o+16:o+40])
                s.segs.setdefault((c,t),[]).append((a,b,ty,i0,i1))
            rec=int(nxt)
        s.cache={}
    def words(s,i0,i1):      # 1-based inclusive
        if not s.url:
            with open(s.path,'rb') as f: f.seek((i0-1)*8); return np.frombuffer(f.read((i1-i0+1)*8),'<f8')
        fn=f'{s.path}.{i0}-{i1}'
        if not os.path.exists(fn): subprocess.check_call(['/usr/bin/curl','-s','-r',f'{(i0-1)*8}-{i1*8-1}','-o',fn,s.url])
        return np.fromfile(fn,'<f8')
    def load(s,c,t,et0=None,et1=None):
        out=[]
        for (a,b,ty,i0,i1) in s.segs[(c,t)]:
            init,intlen,rsize,n=s.words(i1-3,i1); rsize=int(rsize);n=int(n)
            k0=0;k1=n
            if et0 is not None: k0=max(0,int((et0-init)//intlen)-1)
            if et1 is not None: k1=min(n,int((et1-init)//intlen)+2)
            if k1<=k0: continue
            w=s.words(i0+k0*rsize,i0+k1*rsize-1).reshape(k1-k0,rsize)
            out.append((init+k0*intlen,intlen,w))
        s.cache[(c,t)]=out
    def pv(s,c,t,et,vel=False):
        """et: array seconds TDB past J2000 -> km (n,3)"""
        et=np.atleast_1d(et).astype(float); res=np.zeros((len(et),3)); rv=np.zeros((len(et),3)); done=np.zeros(len(et),bool)
        for (init,il,w) in s.cache[(c,t)]:
            k=np.floor((et-init)/il).astype(int)
            k=np.where((k==len(w))&(np.abs(et-init-len(w)*il)<1),len(w)-1,k)
            m=(k>=0)&(k<len(w))&~done
            if not m.any(): continue
            R=w[k[m]]; mid=R[:,0];rad=R[:,1]; nc=(w.shape[1]-2)//3; C=R[:,2:].reshape(-1,3,nc)
            x=(et[m]-mid)/rad
            T=np.empty((m.sum(),nc)); T[:,0]=1; T[:,1]=x
            for j in range(2,nc): T[:,j]=2*x*T[:,j-1]-T[:,j-2]
            res[m]=np.einsum('ikj,ij->ik',C,T)
            if vel:
                D=np.zeros_like(T); D[:,1]=1
                for j in range(2,nc): D[:,j]=2*T[:,j-1]+2*x*D[:,j-1]-D[:,j-2]
                rv[m]=np.einsum('ikj,ij->ik',C,D)/rad[:,None]
            done|=m
        assert done.all(), (c,t)
        return (res,rv) if vel else res
