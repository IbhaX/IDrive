import json,re,urllib.parse,urllib.request,time,concurrent.futures
from pathlib import Path
ROOT=Path('/root/idrive/app/data'); CUR=ROOT/'curriculum'; HI=CUR/'hi'; HI.mkdir(exist_ok=True)
def split_text(s,limit=330):
 if len(s)<=limit:return [s]
 out=[];cur=''
 for sentence in re.split(r'(?<=[.!?।])\\s+',s):
  while len(sentence)>limit:
   cut=sentence.rfind(' ',0,limit)
   if cut<80:cut=limit
   out.append(sentence[:cut].strip());sentence=sentence[cut:].strip()
  if cur and len(cur)+1+len(sentence)>limit:out.append(cur);cur=sentence
  else:cur=(cur+' '+sentence).strip()
 if cur:out.append(cur)
 return out
def request_batch(items):
 q=' '.join(f'[X{i}] {v}' for i,v in enumerate(items))+f' [X{len(items)}]'
 url='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=hi&q='+urllib.parse.quote(q)
 for attempt in range(5):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
   data=json.loads(urllib.request.urlopen(req,timeout=25).read().decode())
   out=data[0] if isinstance(data,list) and data else ''
   parts=out.split('[X')[1:]
   got={int(v.split(']',1)[0]):v.split(']',1)[1].strip() for v in parts if ']' in v and v.split(']',1)[0].isdigit() and int(v.split(']',1)[0])<len(items)}
   if len(got)==len(items):return [got[i] for i in range(len(items))]
  except Exception:pass
  time.sleep(1.5*(attempt+1))
 return items
def translate_all(strings):
 uniq=list(dict.fromkeys(s for s in strings if isinstance(s,str) and s.strip()))
 chunks=[];owners=[]
 for s in uniq:
  parts=split_text(s);owners.append((s,len(parts)));chunks.extend(parts)
 batches=[];cur=[]
 for part in chunks:
  cand=cur+[part];packed=' '.join(f'[X{i}] {v}' for i,v in enumerate(cand))+f' [X{len(cand)}]'
  if cur and len(packed)>455:batches.append(cur);cur=[part]
  else:cur=cand
 if cur:batches.append(cur)
 print('strings',len(uniq),'chunks',len(chunks),'batches',len(batches),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:results=list(ex.map(request_batch,batches))
 it=iter(v for b in results for v in b);return {s:' '.join(next(it) for _ in range(n)) for s,n in owners}
SKIP={'id','slug','level','minutes','a','related','refs','verified','lab','scenario','kind','sign','colour','severity','group','x','y','layout','cat','mood','duration','actors','hazard','ok','lesson','dot','svg','url','href','icon','code','key','type','version','date','source','status'}
def collect(x,strings,key=''):
 if isinstance(x,str):
  if key not in SKIP and not key.endswith('_id') and not key.endswith('_url') and not (x.lstrip().startswith('<svg') or x.startswith('#')):strings.append(x)
 elif isinstance(x,list):
  if len(x)>=3 and all(isinstance(v,str) for v in x[:3]):
   strings.append(x[0])
  else:
   for v in x:collect(v,strings,key)
 elif isinstance(x,dict):
  for k,v in x.items():collect(v,strings,k)
def translate(x,m):
 if isinstance(x,str):return m.get(x,x)
 if isinstance(x,list):
  if len(x)>=3 and all(isinstance(v,str) for v in x[:3]):
   while len(x)<4:x.append('')
   x[3]=m.get(x[0],x[3] or x[0]);return x
  return [translate(v,m) for v in x]
 if isinstance(x,dict):return {k:(v if k in SKIP else translate(v,m)) for k,v in x.items()}
 return x
files=[]
for p in list(ROOT.glob('*.json'))+list((ROOT/'articles').glob('*.json')):
 if p.name in ('meta.json','primer.json','sign_svgs.json'):continue
 try:d=json.loads(p.read_text())
 except:continue
 files.append((p,d))
strings=[]
for p,d in files:collect(d,strings)
# Include English source of every curriculum module, library, sign details.
for p in list((CUR/'modules').glob('m*.json'))+[CUR/'warning_lights.json',CUR/'vehicle_parts.json',CUR/'scenarios.json',CUR/'sign_details.json',CUR/'speed_limits.json']:
 d=json.loads(p.read_text());collect(d,strings)
mapping=translate_all(strings)
# Persist index-3 Hindi pairs and standalone Hindi curriculum overlays.
for p,d in files:
 translate(d,mapping)
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
 print('updated',p.name,flush=True)
def tr(x):
 if isinstance(x,str):return mapping.get(x,x)
 if isinstance(x,list):return [tr(v) for v in x]
 if isinstance(x,dict):return {k:(v if k in SKIP else tr(v)) for k,v in x.items()}
 return x
for p in sorted((CUR/'modules').glob('m*.json')):
 d=json.loads(p.read_text()); out={'module':tr({'title':d['title'],'summary':d['summary']}),'chapters':tr({c['id']:c['title'] for c in d.get('chapters',[])}),'lessons':{l['id']:tr({k:v for k,v in l.items() if k not in SKIP}) for l in d.get('lessons',[])}}
 (HI/p.name).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('module',p.name,flush=True)
lib={}
for fname,key in [('warning_lights.json','lights'),('vehicle_parts.json','parts'),('scenarios.json','scenarios')]:
 d=json.loads((CUR/fname).read_text());lib[key]={x['id']:tr({k:v for k,v in x.items() if k not in SKIP}) for x in d}
(HI/'library.json').write_text(json.dumps(lib,ensure_ascii=False,indent=2)+'\n')
(HI/'sign_details.json').write_text(json.dumps(tr(json.loads((CUR/'sign_details.json').read_text())),ensure_ascii=False,indent=2)+'\n')
(HI/'speed_limits.json').write_text(json.dumps(tr(json.loads((CUR/'speed_limits.json').read_text())),ensure_ascii=False,indent=2)+'\n')
(HI/'fixed.json').write_text(json.dumps({},ensure_ascii=False)+'\n')
print('HINDI_TRANSLATION_COMPLETE',flush=True)
