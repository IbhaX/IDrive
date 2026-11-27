import json,urllib.request,urllib.parse,time,concurrent.futures,sys
from pathlib import Path
from app.services.curriculum import modules
ROOT=Path('/root/idrive/app/data/curriculum'); LANG=sys.argv[1] if len(sys.argv)>1 else 'kn'; OUT=ROOT/LANG; NL=chr(10)
SKIP={'id','slug','level','minutes','a','related','refs','verified','lab','scenario','kind','sign','colour','severity','group','x','y','layout','cat','mood','duration','actors','hazard','ok','lesson','dot','svg','url','href','icon','code','key','type','version','date','source','status'}
def batch(items):
 q=' '.join(f'[X{i}] {v}' for i,v in enumerate(items))+f' [X{len(items)}]'
 u='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl='+LANG+'&q='+urllib.parse.quote(q)
 for n in range(4):
  try:
   raw=json.loads(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=15).read().decode())[0]
   parts=raw.split('[X')[1:];got={int(v.split(']',1)[0]):v.split(']',1)[1].strip() for v in parts if ']' in v and v.split(']',1)[0].isdigit() and int(v.split(']',1)[0])<len(items)}
   if len(got)==len(items):return [got[i] for i in range(len(items))]
  except Exception:pass
  time.sleep(1+n)
 return items
def translate(vals):
 vals=list(dict.fromkeys(v for v in vals if isinstance(v,str) and v.strip()))
 bs=[vals[i:i+5] for i in range(0,len(vals),5)]
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:rs=list(ex.map(batch,bs))
 out={}
 for a,b in zip(bs,rs):out.update(zip(a,b))
 return out
def collect(a,b,strings,key=''):
 if isinstance(a,str):
  if (a==b or not b) and key not in SKIP and len(a.strip())>1 and not a.lstrip().startswith('<svg') and not a.startswith('#'):strings.append(a)
 elif isinstance(a,list) and isinstance(b,list):
  for i,v in enumerate(a):
   if i<len(b):collect(v,b[i],strings,key)
 elif isinstance(a,dict) and isinstance(b,dict):
  for k,v in a.items():
   if k not in SKIP and k in b:collect(v,b[k],strings,k)
def patch(a,b,m,key=''):
 if isinstance(a,str):return m.get(a,b) if a==b or not b else b
 if isinstance(a,list) and isinstance(b,list):return [patch(v,b[i],m,key) for i,v in enumerate(a[:len(b)])]+b[len(a):]
 if isinstance(a,dict) and isinstance(b,dict):return {k:(patch(v,b[k],m,k) if k in b and k not in SKIP else b.get(k,v)) for k,v in b.items()}
 return b
pairs=[];strings=[]
files={p.stem.split('-',1)[0]:p for p in (ROOT/'modules').glob('m*.json')}
for mod in modules():
 src=json.loads(files[mod.id].read_text(encoding='utf-8'))
 ov=json.loads((OUT/files[mod.id].name).read_text(encoding='utf-8'))
 projection={'module':{'title':src['title'],'summary':src['summary']},'chapters':{c['id']:c['title'] for c in src.get('chapters',[])},'lessons':{l['id']:{k:v for k,v in l.items() if k not in SKIP} for l in src.get('lessons',[])}}
 collect(projection,ov,strings);pairs.append((OUT/files[mod.id].name,projection,ov))
libpath=OUT/'library.json';lib=json.loads(libpath.read_text(encoding='utf-8'))
for filename,key in [('warning_lights.json','lights'),('vehicle_parts.json','parts'),('scenarios.json','scenarios')]:
 src=json.loads((ROOT/filename).read_text(encoding='utf-8'))
 for item in src:
  proj={k:v for k,v in item.items() if k not in SKIP};ov=lib.get(key,{}).get(item['id'],{})
  collect(proj,ov,strings);pairs.append((libpath,proj,ov))
for filename in ('sign_details.json','speed_limits.json'):
 src=json.loads((ROOT/filename).read_text(encoding='utf-8'));ov=json.loads((OUT/filename).read_text(encoding='utf-8'))
 collect(src,ov,strings);pairs.append((OUT/filename,src,ov))
m=translate(strings)
print('overlay fallback strings',len(set(strings)),flush=True)
# Rebuild overlays by applying each source/overlay pair.
for path,src,ov in pairs:
 if path.name=='library.json':continue
 fixed=patch(src,ov,m)
 path.write_text(json.dumps(fixed,ensure_ascii=False,indent=2)+NL,encoding='utf-8')
lib=json.loads(libpath.read_text(encoding='utf-8'))
for filename,key in [('warning_lights.json','lights'),('vehicle_parts.json','parts'),('scenarios.json','scenarios')]:
 src=json.loads((ROOT/filename).read_text(encoding='utf-8'))
 for item in src:
  proj={k:v for k,v in item.items() if k not in SKIP}
  if item['id'] in lib.get(key,{}):lib[key][item['id']]=patch(proj,lib[key][item['id']],m)
libpath.write_text(json.dumps(lib,ensure_ascii=False,indent=2)+NL,encoding='utf-8')
print(LANG.upper()+'_OVERLAY_FALLBACK_COMPLETE',flush=True)
