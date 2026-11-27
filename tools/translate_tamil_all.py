import json, re, urllib.parse, urllib.request, time, concurrent.futures
from pathlib import Path
ROOT=Path('/root/idrive/app/data')
CUR=ROOT/'curriculum'
TA=CUR/'ta'; TA.mkdir(exist_ok=True)
def split_text(s, limit=330):
    if len(s)<=limit: return [s]
    out=[]; cur=''
    for sentence in re.split(r'(?<=[.!?])\s+',s):
        while len(sentence)>limit:
            cut=sentence.rfind(' ',0,limit)
            if cut<80: cut=limit
            out.append(sentence[:cut].strip()); sentence=sentence[cut:].strip()
        if cur and len(cur)+1+len(sentence)>limit:
            out.append(cur); cur=sentence
        else: cur=(cur+' '+sentence).strip()
    if cur: out.append(cur)
    return out
def request_batch(items):
    # items are <=330 characters, packed into one Google Translate request
    q=' '.join(f'[X{i}] {v}' for i,v in enumerate(items)) + f' [X{len(items)}]'
    url='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ta&q='+urllib.parse.quote(q)
    for attempt in range(5):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(req,timeout=25) as r: data=json.loads(r.read().decode())
            out=data[0] if isinstance(data,list) and data else ''
            matches=list(re.finditer(r'\[X(\d+)\]\s*(.*?)(?=\s*\[X\d+\]|$)',out,re.S))
            got={int(m.group(1)):m.group(2).strip() for m in matches if int(m.group(1)) < len(items)}
            if len(got)!=len(items): raise RuntimeError('translation markers lost')
            return [got[i] for i in range(len(items))]
        except Exception:
            if attempt==4: return items
            time.sleep(1.5*(attempt+1))
def translate_all(strings):
    # Deduplicate repeated UI/technical strings, then translate compact batches.
    uniq=list(dict.fromkeys(s for s in strings if isinstance(s,str) and s.strip()))
    chunks=[]; owners=[]
    for s in uniq:
        parts=split_text(s)
        owners.append((s,len(parts)))
        chunks.extend(parts)
    batches=[]; cur=[]
    for part in chunks:
        candidate=cur+[part]
        packed=' '.join(f'[X{i}] {v}' for i,v in enumerate(candidate))+f' [X{len(candidate)}]'
        if cur and len(packed)>455:
            batches.append(cur); cur=[part]
        else: cur=candidate
    if cur: batches.append(cur)
    print('strings',len(uniq),'chunks',len(chunks),'batches',len(batches),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        results=list(ex.map(request_batch,batches))
    flat=[v for batch in results for v in batch]
    it=iter(flat); mapped={}
    for s,n in owners: mapped[s]=' '.join(next(it) for _ in range(n))
    return mapped
def translate_structure(x,mapping,skip=frozenset()):
    if isinstance(x,str): return mapping.get(x,x)
    if isinstance(x,list): return [translate_structure(v,mapping,skip) for v in x]
    if isinstance(x,dict): return {k:(v if k in skip else translate_structure(v,mapping,skip)) for k,v in x.items()}
    return x
def pairs_in(x,refs):
    if isinstance(x,list):
        if len(x)>=2 and isinstance(x[0],str) and isinstance(x[1],str):
            refs.append(x)
            return
        for v in x: pairs_in(v,refs)
    elif isinstance(x,dict):
        for v in x.values(): pairs_in(v,refs)
def save(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
# Main extracted datasets: signs, categories, topics, MCQs, glossary.
tasks=[]
for name in ['signs.json','categories.json','topics.json','questions.json','glossary.json']:
 p=ROOT/name; d=json.loads(p.read_text(encoding='utf8'))
 if name=='signs.json':
  for x in d: tasks.extend([x['name'],x['meaning'],x['action']])
 elif name=='categories.json':
  for x in d: tasks.extend([x['name'],x.get('blurb','')])
 elif name=='topics.json':
  for x in d:
   if isinstance(x.get('name'),list): tasks.append(x['name'][0])
   for v in x.get('lessons',[]):
    if isinstance(v,list): tasks.append(v[0])
 elif name=='questions.json':
  for x in d:
   for k in ('q','r'):
    if isinstance(x.get(k),list): tasks.append(x[k][0])
   for v in x.get('o',[]):
    if isinstance(v,list): tasks.append(v[0])
 elif name=='glossary.json':
  for x in d:
   if len(x)>=4: tasks.extend([x[0],x[2]])
# Existing English/Malayalam article pairs: translate every first element.
article_data={}
for p in sorted((ROOT/'articles').glob('*.json')):
 d=json.loads(p.read_text(encoding='utf8')); refs=[]; pairs_in(d,refs)
 tasks.extend(x[0] for x in refs); article_data[p]= (d,refs)
# Curriculum module mirrors and library.
module_sources={}
skip_lesson={'id','level','minutes','a','related','refs','verified','lab','scenario','kind'}
skip_light={'id','sign','colour','severity'}
skip_part={'id','group','x','y','related','lessons'}
skip_scen={'id','layout','cat','mood','duration','actors','hazard','ok','lesson'}
for p in sorted((CUR/'modules').glob('m*.json')):
 d=json.loads(p.read_text(encoding='utf8'))
 module={'title':d['title'],'summary':d['summary']}
 chapters={c['id']:c['title'] for c in d.get('chapters',[])}
 lessons={l['id']:{k:v for k,v in l.items() if k not in skip_lesson} for l in d.get('lessons',[])}
 module_sources[p.stem]=(module,chapters,lessons)
 tasks.extend([module['title'],module['summary'],*chapters.values()])
 for v in lessons.values(): tasks.extend([])
 def collect_text(x,skip):
  if isinstance(x,str): tasks.append(x)
  elif isinstance(x,list):
   for v in x: collect_text(v,skip)
  elif isinstance(x,dict):
   for k,v in x.items():
    if k not in skip: collect_text(v,skip)
 for v in lessons.values(): collect_text(v,skip_lesson)
lib_sources={}
for file,key,skip in [('warning_lights.json','lights',skip_light),('vehicle_parts.json','parts',skip_part),('scenarios.json','scenarios',skip_scen)]:
 data=json.loads((CUR/file).read_text(encoding='utf8'))
 objs={x['id']:{k:v for k,v in x.items() if k not in skip} for x in data}
 lib_sources[key]=(objs,skip)
 for v in objs.values(): collect_text(v,skip)
sign_detail=json.loads((CUR/'sign_details.json').read_text(encoding='utf8'))
for v in sign_detail.values(): collect_text(v,frozenset())
mapping=translate_all(tasks)
# Update extracted data pairs / fields.
for name in ['signs.json','categories.json','topics.json','questions.json','glossary.json']:
 p=ROOT/name; d=json.loads(p.read_text(encoding='utf8'))
 if name=='signs.json':
  for x in d: x['ta']=[mapping.get(x[k],x[k]) for k in ('name','meaning','action')]
 elif name=='categories.json':
  for x in d: x['ta']=[mapping.get(x['name'],x['name']),mapping.get(x.get('blurb',''),x.get('blurb',''))]
 elif name=='topics.json':
  for x in d:
   if isinstance(x.get('name'),list):
    en=x['name'][0]
    while len(x['name'])<3: x['name'].append(mapping.get(en,en))
    x['name'][2]=mapping.get(en,x['name'][2])
   for v in x.get('lessons',[]):
    if isinstance(v,list):
     en=v[0]
     while len(v)<3: v.append(mapping.get(en,en))
     v[2]=mapping.get(en,v[2])
 elif name=='questions.json':
  for x in d:
   for k in ('q','r'):
    v=x.get(k)
    if isinstance(v,list):
     en=v[0]
     while len(v)<3: v.append(mapping.get(en,en))
     v[2]=mapping.get(en,v[2])
   for v in x.get('o',[]):
    if isinstance(v,list):
     en=v[0]
     while len(v)<3: v.append(mapping.get(en,en))
     v[2]=mapping.get(en,v[2])
 elif name=='glossary.json':
  for x in d:
   if len(x)>=4:
    en1,en2=x[0],x[2]
    while len(x)<6: x.append('')
    x[4]=mapping.get(en1,en1); x[5]=mapping.get(en2,en2)
 save(p,d); print('saved',name,flush=True)
# Update articles
for p,(d,refs) in article_data.items():
 for a in refs:
  en=a[0]
  while len(a)<3: a.append(mapping.get(en,en))
  a[2]=mapping.get(en,a[2])
 save(p,d); print('saved article',p.name,flush=True)
# Build Tamil module overlays, preserving schema/control fields verbatim.
for mid,(module,chapters,lessons) in module_sources.items():
 out={'module':translate_structure(module,mapping),'chapters':translate_structure(chapters,mapping),
      'lessons':translate_structure(lessons,mapping,skip_lesson)}
 save(TA/(mid+'.json'),out); print('saved module',mid,flush=True)
lib={}
for key,(objs,skip) in lib_sources.items():
 lib[key]={i:translate_structure(v,mapping,skip) for i,v in objs.items()}
save(TA/'library.json',lib)
save(TA/'sign_details.json',translate_structure(sign_detail,mapping))
print('TAMIL_TRANSLATION_COMPLETE',flush=True)
