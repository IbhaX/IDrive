import json,urllib.request,urllib.parse,time,concurrent.futures,glob,sys
from pathlib import Path
ROOT=Path('/root/idrive/app/data'); LANG=sys.argv[1] if len(sys.argv)>1 else 'kn'; IDX=4 if LANG=='kn' else 5; NL=chr(10)
def request_batch(items):
 q=' '.join(f'[X{i}] {v}' for i,v in enumerate(items))+f' [X{len(items)}]'
 url='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl='+LANG+'&q='+urllib.parse.quote(q)
 for attempt in range(4):
  try:
   raw=json.loads(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=15).read().decode())[0]
   parts=raw.split('[X')[1:]
   got={int(v.split(']',1)[0]):v.split(']',1)[1].strip() for v in parts if ']' in v and v.split(']',1)[0].isdigit() and int(v.split(']',1)[0])<len(items)}
   if len(got)==len(items) and all(got[i] for i in range(len(items))):return [got[i] for i in range(len(items))]
  except Exception:pass
  time.sleep(1+attempt)
 return items
def translate(vals):
 vals=list(dict.fromkeys(v for v in vals if isinstance(v,str) and v.strip()))
 batches=[vals[i:i+5] for i in range(0,len(vals),5)]
 print('fallback strings',len(vals),'batches',len(batches),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: results=list(pool.map(request_batch,batches))
 out={}
 for batch,res in zip(batches,results):out.update(zip(batch,res))
 return out
files=[]
for p in list(ROOT.glob('*.json'))+list((ROOT/'articles').glob('*.json')):
 if p.name in ('meta.json','primer.json','sign_svgs.json','signs.json','categories.json','glossary.json'):continue
 d=json.loads(p.read_text(encoding='utf-8'));refs=[]
 def scan(x,key=''):
  leaf=key.rsplit('.',1)[-1].replace('[]','')
  if isinstance(x,list):
   if key.endswith('.o') and all(isinstance(v,str) for v in x):return
   if len(x)>IDX and all(isinstance(v,str) for v in x[:3]) and (x[IDX]==x[0] or not x[IDX]):refs.append(x)
   else:
    for v in x:scan(v,key+'[]')
  elif isinstance(x,dict):
   for k,v in x.items():scan(v,(key+'.' if key else '')+k)
 scan(d);files.append((p,d,refs))
signs=json.loads((ROOT/'signs.json').read_text(encoding='utf-8'));cats=json.loads((ROOT/'categories.json').read_text(encoding='utf-8'));gl=json.loads((ROOT/'glossary.json').read_text(encoding='utf-8'))
refs_s=[(x,['name','meaning','action']) for x in signs if not x.get(LANG) or any(x[LANG][i]==x[k] for i,k in enumerate(['name','meaning','action']))]
refs_c=[(x,['name','blurb']) for x in cats if not x.get(LANG) or any(x[LANG][i]==x.get(k,'') for i,k in enumerate(['name','blurb']))]
strings=[a[0] for _,_,refs in files for a in refs]
for x,keys in refs_s+refs_c:strings.extend(x.get(k,'') for k in keys)
for x in gl:
 base=8 if LANG=='kn' else 10
 if len(x)<=base+1 or x[base]==x[0] or x[base+1]==x[2]:strings.extend([x[0],x[2]])
m=translate(strings)
for p,d,refs in files:
 for a in refs:a[IDX]=m.get(a[0],a[IDX] or a[0])
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+NL,encoding='utf-8')
for x,keys in refs_s+refs_c:x[LANG]=[m.get(x.get(k,''),x.get(k,'')) for k in keys]
(ROOT/'signs.json').write_text(json.dumps(signs,ensure_ascii=False,indent=2)+NL,encoding='utf-8')
(ROOT/'categories.json').write_text(json.dumps(cats,ensure_ascii=False,indent=2)+NL,encoding='utf-8')
for x in gl:
 base=8 if LANG=='kn' else 10
 while len(x)<=base+1:x.append('')
 if x[base]==x[0] or not x[base]:x[base]=m.get(x[0],x[0])
 if x[base+1]==x[2] or not x[base+1]:x[base+1]=m.get(x[2],x[2])
(ROOT/'glossary.json').write_text(json.dumps(gl,ensure_ascii=False,indent=2)+NL,encoding='utf-8')
print(LANG.upper()+'_FALLBACK_COMPLETE',flush=True)
