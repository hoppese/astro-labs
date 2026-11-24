import os
import sys; from spk import SPK
R=os.environ['JPL_RAW']+'/'
N='https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/'
Y=86400*365.25
for p,a,b in (('de441_part-1',-5010*Y,-30*Y),('de441_part-2',-32*Y,1010*Y)):
    k=SPK(R+p+'.bsp',N+p+'.bsp')
    print(p,{q:[(x[0]/Y,x[1]/Y,x[2]) for x in v] for q,v in k.segs.items()},flush=True)
    for q in k.segs:
        k.load(*q,a,b)
    print('ok',flush=True)
