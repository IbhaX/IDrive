import json,urllib.request,urllib.parse,time
from pathlib import Path
ROOT=Path('/root/idrive/app/data')
def trans(vals):
 vals=list(dict.fromkeys(v for v in vals if v))
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
p=ROOT/'signs.json'; signs=json.loads(p.read_text()); strings=[]
for x in signs:strings.extend([x['name'],x['meaning'],x['action']])
p2=ROOT/'categories.json'; cats=json.loads(p2.read_text())
for x in cats:strings.extend([x['name'],x.get('blurb','')])
m=trans(strings)
for x in signs:x['hi']=[m.get(x['name'],x['name']),m.get(x['meaning'],x['meaning']),m.get(x['action'],x['action'])]
for x in cats:x['hi']=[m.get(x['name'],x['name']),m.get(x.get('blurb',''),x.get('blurb',''))]
p.write_text(json.dumps(signs,ensure_ascii=False,indent=2)+'\n')
p2.write_text(json.dumps(cats,ensure_ascii=False,indent=2)+'\n')
print('Hindi signs/categories complete',len(signs),len(cats))
