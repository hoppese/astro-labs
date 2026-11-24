import sys; sys.argv=['x','/private/tmp/claude-502/-Users-hoppese-Documents-GitHub-Intro-physics-sims/c432533a-7dd0-4e44-b7df-bc7c2e489f02/scratchpad/planetarium/raw/sun','/tmp/nouse']
import importlib.util,os,datetime,collections,random
sp=importlib.util.spec_from_file_location('b',os.path.expanduser('~/Documents/GitHub/astro-labs/planetarium/tools/build_sunspots.py')); b=importlib.util.module_from_spec(sp); sp.loader.exec_module(b)
rows,_=b.parse(); day=collections.defaultdict(list)
for r in rows:
    if r[1]>3800: day[r[1]].append(r)
C=[]
for t,v in day.items():
    for r in v:
        if abs(r[6])>18 or abs(r[2])>30: continue
        if any(o is not r and abs(o[6]-r[6])<15 and abs(o[2]-r[2])<9 for o in v): continue
        d=datetime.date(2000,1,1)+datetime.timedelta(t+.5); C.append((r[4],r[5],d.isoformat(),r[0],r[2],r[6],r[3]))
C.sort()
random.seed(11)
bins=[(10,10,3),(20,30,3),(40,60,3),(70,100,5),(110,160,5),(170,240,4),(250,340,2),(350,480,4),(500,700,3),(750,3000,7)]
sel=[]
for a,z,n in bins:
    q=[c for c in C if a<=c[0]<=z and c[2]>'2017']
    used=set(); random.shuffle(q)
    if a>=700: q.sort(key=lambda c:-c[0])
    for c in q:
        if c[3] in used: continue
        used.add(c[3]); sel.append(c); 
        if len(used)>=n: break
for s in sel: print(*s)
import json; json.dump(sel,open('cand.json','w'))
