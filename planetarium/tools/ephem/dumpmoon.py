import os
import pickle,numpy as np,json
d=pickle.load(open('moonfit.pkl','rb')); KEY=['D','M','l','F','Ve','Ju','Ea','Ma','Sa','L']
AS=np.pi/648000; out={'args':[[float('%.14g'%x) for x in (d['pol'] if k in d['pol'] else d['pl'])[k]] for k in KEY]}
n=0
for w in ('lon','lat','r'):
    sel=d['sel'][w]; co=d['co'][w]; N=len(sel); u=AS if w!='r' else 1e-6; off=2 if w=='r' else 0
    c=co[off:]; h=min(12,N); rows=[]
    for i,t in enumerate(sel):
        v=[c[i],c[N+i],c[2*N+i],c[3*N+i],c[4*N+i],c[5*N+i]]
        for j in range(3):
            for q in range(2):
                v.append(c[6*N+(2*j+q)*h+i] if i<h else 0)
        # skip negligible
        v=[round(float(x/u),3) for x in v]
        while v and v[-1]==0: v.pop()
        rows.append([[int(x) for x in t],v]); n+=1
    out[w]=dict(c=[float('%.12g'%x) for x in (co[:2] if w=='r' else [0,0])],t=rows)
# mean longitude L' was fitted as args['L'] itself
s=json.dumps(out,separators=(',',':')); open('moon-far.json','w').write(s); print(n,len(s))
