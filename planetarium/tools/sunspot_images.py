import subprocess,json,datetime,sys
from concurrent.futures import ThreadPoolExecutor
def get(d,size=4096,times=('000000','001500','003000','010000','020000','234500','230000','120000','220000','030000','060000','180000')):
    for hms in times:
        dd=d if int(hms)<200000 else d-datetime.timedelta(1)
        u=f"https://sdo.gsfc.nasa.gov/assets/img/browse/{dd:%Y/%m/%d}/{dd:%Y%m%d}_{hms}_{size}_HMIIF.jpg"; o=f"img/{dd:%Y%m%d}_{hms}_{size}.jpg"
        r=subprocess.run(['/usr/bin/curl','-s','-f','-m','120','-o',o,u])
        if r.returncode==0: return o
    return None
if __name__=='__main__':
    sel=json.load(open('cand.json')); ds=[datetime.date.fromisoformat(s[2]) for s in sel]
    with ThreadPoolExecutor(6) as ex: fs=list(ex.map(get,ds))
    for s,f in zip(sel,fs): print(s[0],s[2],f)
    json.dump([s+[f] for s,f in zip(sel,fs)],open('cand2.json','w'))
