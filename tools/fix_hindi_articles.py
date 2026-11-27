import json,glob,urllib.request,urllib.parse,time
from pathlib import Path
ROOT=Path('/root/idrive/app/data/articles')
def trans(vals):
 out={}
 for i in range(0,len(vals),5):
  batch=vals[i:i+5];q=' '.join(f'[X{j}] {v}' for j,v in enumerate(batch))+f' [X{len(batch)}]'
  url='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=hi&q='+urllib.parse.quote(q)
  for n in range(5):
   try:
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'});raw=json.loads(urllib.request.urlopen(req,timeout=20).read().decode())[0]
    parts=raw.split('[X')[1:];got={int(v.split(']',1)[0]):v.split(']',1)[1].strip() for v in parts if ']' in v and v.split(']',1)[0].isdigit() and int(v.split(']',1)[0])<len(batch)}
    if len(got)==len(batch):out.update({v:got[j] for j,v in enumerate(batch)});break
   except Exception:pass
   time.sleep(n+1)
  else:out.update({v:v for v in batch})
 return out
def collect(x,refs):
 if isinstance(x,list):
  if len(x)>=4 and all(isinstance(v,str) for v in x[:4]):
   if x[3]==x[0] and x[0].strip():refs.append(x)
  else:
   for v in x:collect(v,refs)
 elif isinstance(x,dict):
  for v in x.values():collect(v,refs)
for p in ROOT.glob('*.json'):
 d=json.loads(p.read_text());refs=[];collect(d,refs)
 if refs:
  m=trans([x[0] for x in refs])
  for x in refs:x[3]=m.get(x[0],x[0])
  p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
  print(p.name,len(refs))
