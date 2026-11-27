import json,glob,urllib.request,urllib.parse,time
from pathlib import Path
ROOT=Path('/root/idrive/app/data')
def trans(vals):
 vals=list(dict.fromkeys(v for v in vals if isinstance(v,str) and v.strip() and not v.isdigit()))
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
# UI: fill any missed Hindi slots, including keys skipped by the broad translator.
ui_refs=[]
for fname in ('ui.json','ui_extra.json'):
 p=ROOT/fname;d=json.loads(p.read_text())
 for k,v in d.items():
  if isinstance(v,list) and len(v)>=3 and v[3:4] == [v[0]] and v[0].strip():ui_refs.append(v)
# Question q/r and option pairs; strip accidental fourth slot on plain-text option lists.
qpath=ROOT/'questions.json'; qs=json.loads(qpath.read_text()); qrefs=[]
for q in qs:
 for k in ('q','r'):
  v=q.get(k)
  if isinstance(v,list) and len(v)>=4 and v[3]==v[0] and v[0].strip():qrefs.append(v)
 opts=q.get('o',[])
 if isinstance(opts,list) and len(opts)==4 and all(isinstance(v,str) for v in opts) and opts[3]==opts[0]:
  opts.pop()
 for v in opts:
  if isinstance(v,list) and len(v)>=4 and v[3]==v[0] and v[0].strip():qrefs.append(v)
# Articles have a small number of missed translated slots.
art_refs=[]
def walk_pairs(x):
 if isinstance(x,list):
  if len(x)>=4 and all(isinstance(v,str) for v in x[:4]):
   if x[3]==x[0] and x[0].strip():art_refs.append(x)
  else:
   for v in x:walk_pairs(v)
 elif isinstance(x,dict):
  for v in x.values():walk_pairs(v)
for p in (ROOT/'articles').glob('*.json'):walk_pairs(json.loads(p.read_text()))
# One sign title came back empty because it was not translated in the first pass.
sign_path=ROOT/'signs.json'; signs=json.loads(sign_path.read_text()); sign_refs=[x for x in signs if not all(x.get('hi',[]))]
# Translate all missing source strings in one mapping.
strings=[]
for v in ui_refs+qrefs+art_refs: strings.append(v[0])
for x in sign_refs:strings.extend([x['name'],x['meaning'],x['action']])
m=trans(strings)
for v in ui_refs+qrefs+art_refs:v[3]=m.get(v[0],v[0])
for x in sign_refs:x['hi']=[m.get(x['name'],x['name']),m.get(x['meaning'],x['meaning']),m.get(x['action'],x['action'])]
for fname in ('ui.json','ui_extra.json'):
 p=ROOT/fname;d=json.loads(p.read_text());p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
qpath.write_text(json.dumps(qs,ensure_ascii=False,indent=2)+'\n')
for p in (ROOT/'articles').glob('*.json'):
 d=json.loads(p.read_text());walk_pairs(d);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
sign_path.write_text(json.dumps(signs,ensure_ascii=False,indent=2)+'\n')
# Acronyms in glossary use standard Hindi expansions.
p=ROOT/'glossary.json';g=json.loads(p.read_text())
for x in g:
 if x[0]=='RTO':x[6]='क्षेत्रीय परिवहन कार्यालय'
 if x[0]=='MVD':x[6]='मोटर वाहन विभाग'
p.write_text(json.dumps(g,ensure_ascii=False,indent=2)+'\n')
print('filled fallback translations',len(ui_refs),len(qrefs),len(art_refs),len(sign_refs))
