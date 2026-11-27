import json,urllib.request,urllib.parse,time
from pathlib import Path
ROOT=Path('/root/idrive/app/data')
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
for fname in ('ui.json','ui_extra.json'):
 p=ROOT/fname;d=json.loads(p.read_text());refs=[]
 for v in d.values():
  if isinstance(v,list) and len(v)>=3:
   while len(v)<4:v.append('')
   if v[0].strip() and (not v[3] or v[3]==v[0]):refs.append(v)
 m=trans([v[0] for v in refs])
 for v in refs:v[3]=m.get(v[0],v[0])
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
 print(fname,'translated',len(refs))
