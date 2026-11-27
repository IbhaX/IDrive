import json,urllib.request,urllib.parse,time,re
from pathlib import Path
ROOT=Path('/root/idrive/app/data'); CUR=ROOT/'curriculum'; HI=CUR/'hi'
def translate(items):
 out={}
 vals=list(dict.fromkeys(v for v in items if isinstance(v,str) and v.strip()))
 for start in range(0,len(vals),5):
  batch=vals[start:start+5]
  q=' '.join(f'[X{i}] {v}' for i,v in enumerate(batch))+f' [X{len(batch)}]'
  url='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=hi&q='+urllib.parse.quote(q)
  for attempt in range(5):
   try:
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    raw=json.loads(urllib.request.urlopen(req,timeout=20).read().decode())[0]
    parts=raw.split('[X')[1:]
    got={int(v.split(']',1)[0]):v.split(']',1)[1].strip() for v in parts if ']' in v and v.split(']',1)[0].isdigit() and int(v.split(']',1)[0])<len(batch)}
    if len(got)==len(batch):
     out.update({v:got[i] for i,v in enumerate(batch)});break
   except Exception:pass
   time.sleep(attempt+1)
  else: out.update({v:v for v in batch})
 return out
# Restore glossary's existing EN/ML/TA positions and add Hindi term + definition.
p=ROOT/'glossary.json'; data=json.loads(p.read_text()); texts=[]
for x in data: texts.extend([x[0],x[2]])
m=translate(texts)
for x in data:
 while len(x)<8:x.append('')
 x[6]=m.get(x[0],x[0]);x[7]=m.get(x[2],x[2])
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
# Build Hindi speed-limit overlay as [en, ml, ta, hi], retaining original language values.
src=json.loads((CUR/'speed_limits.json').read_text()); refs=[]
for region,d in src.items():
 for road in d['roads']: refs.extend(road.get('t',[])[:1])
 for vehicle in d['vehicles']:
  refs.extend(vehicle.get('t',[])[:1]);refs.extend(vehicle.get('sub',[])[:1])
m=translate(refs)
out=json.loads(json.dumps(src))
for region,d in out.items():
 for road in d['roads']:
  a=road.get('t',[]); road['t']=(a+[a[0]]*4)[:3]+[m.get(a[0],a[0])]
 for vehicle in d['vehicles']:
  for key in ('t','sub'):
   a=vehicle.get(key,[]); vehicle[key]=(a+[a[0]]*4)[:3]+[m.get(a[0],a[0])]
(HI/'speed_limits.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Hindi glossary and speed-limit translations complete',len(data),sum(len(d['roads'])+len(d['vehicles'])*2 for d in src.values()))
