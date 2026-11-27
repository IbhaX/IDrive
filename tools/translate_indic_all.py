import json, re, urllib.parse, urllib.request, time, concurrent.futures, sys
from pathlib import Path

TARGET = sys.argv[1]
INDEX = int(sys.argv[2])
ROOT = Path('/root/idrive/app/data')
CUR = ROOT / 'curriculum'
OUT = CUR / TARGET
OUT.mkdir(exist_ok=True)
NL = chr(10)

def split_text(s, limit=330):
    if len(s) <= limit:
        return [s]
    out, cur = [], ''
    for sentence in re.split(r'(?<=[.!?।])\\s+', s):
        while len(sentence) > limit:
            cut = sentence.rfind(' ', 0, limit)
            if cut < 80:
                cut = limit
            out.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if cur and len(cur) + 1 + len(sentence) > limit:
            out.append(cur)
            cur = sentence
        else:
            cur = (cur + ' ' + sentence).strip()
    if cur:
        out.append(cur)
    return out

def request_batch(items):
    q = ' '.join(f'[X{i}] {v}' for i, v in enumerate(items)) + f' [X{len(items)}]'
    url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=' + TARGET + '&q=' + urllib.parse.quote(q)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = json.loads(urllib.request.urlopen(req, timeout=25).read().decode())
            raw = data[0] if isinstance(data, list) and data else ''
            parts = raw.split('[X')[1:]
            got = {int(v.split(']', 1)[0]): v.split(']', 1)[1].strip()
                   for v in parts if ']' in v and v.split(']', 1)[0].isdigit()
                   and int(v.split(']', 1)[0]) < len(items)}
            if len(got) == len(items) and all(got[i] for i in range(len(items))):
                return [got[i] for i in range(len(items))]
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    return items

def translate_all(strings):
    uniq = list(dict.fromkeys(v for v in strings if isinstance(v, str) and v.strip()))
    chunks, owners = [], []
    for value in uniq:
        parts = split_text(value)
        owners.append((value, len(parts)))
        chunks.extend(parts)
    batches, current = [], []
    for part in chunks:
        candidate = current + [part]
        packed = ' '.join(f'[X{i}] {v}' for i, v in enumerate(candidate)) + f' [X{len(candidate)}]'
        if current and len(packed) > 455:
            batches.append(current)
            current = [part]
        else:
            current = candidate
    if current:
        batches.append(current)
    print('target', TARGET, 'strings', len(uniq), 'chunks', len(chunks), 'batches', len(batches), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(request_batch, batches))
    it = iter(v for batch in results for v in batch)
    return {value: ' '.join(next(it) for _ in range(count)) for value, count in owners}

SKIP = {'id','slug','level','minutes','a','related','refs','verified','lab','scenario','kind','sign','colour','severity','group','x','y','layout','cat','mood','duration','actors','hazard','ok','lesson','dot','svg','url','href','icon','code','key','type','version','date','source','status'}

def collect_pairs(obj, strings, key=''):
    leaf=key.rsplit('.',1)[-1].replace('[]','')
    if isinstance(obj, str):
        if leaf not in SKIP and not leaf.endswith('_id') and not leaf.endswith('_url') and not obj.lstrip().startswith('<svg') and not obj.startswith('#'):
            strings.append(obj)
    elif isinstance(obj, list):
        if key.endswith('.o') and all(isinstance(v,str) for v in obj):
            return
        if len(obj) >= 3 and all(isinstance(v, str) for v in obj[:3]):
            strings.append(obj[0])
        else:
            for value in obj:
                collect_pairs(value, strings, key+'[]')
    elif isinstance(obj, dict):
        for name, value in obj.items():
            collect_pairs(value, strings, (key+'.' if key else '')+name)


def collect_source(obj, strings, key=''):
    if isinstance(obj, str):
        if key not in SKIP and not key.endswith('_id') and not key.endswith('_url') and not obj.lstrip().startswith('<svg') and not obj.startswith('#'):
            strings.append(obj)
    elif isinstance(obj, list):
        for value in obj:
            collect_source(value, strings, key)
    elif isinstance(obj, dict):
        for name, value in obj.items():
            collect_source(value, strings, name)

def translate_pairs(obj, mapping, key=''):
    leaf=key.rsplit('.',1)[-1].replace('[]','')
    if isinstance(obj, str):
        return obj
    if isinstance(obj, list):
        if key.endswith('.o') and all(isinstance(v,str) for v in obj):
            return obj
        if len(obj) >= 3 and all(isinstance(v, str) for v in obj[:3]):
            while len(obj) <= INDEX:
                obj.append('')
            obj[INDEX] = mapping.get(obj[0], obj[INDEX] or obj[0])
            return obj
        return [translate_pairs(value, mapping, key+'[]') for value in obj]
    if isinstance(obj, dict):
        return {k: (v if k in SKIP else translate_pairs(v, mapping, (key+'.' if key else '')+k)) for k, v in obj.items()}
    return obj


def translate_source(obj, mapping):
    if isinstance(obj, str):
        return mapping.get(obj, obj)
    if isinstance(obj, list):
        return [translate_source(value, mapping) for value in obj]
    if isinstance(obj, dict):
        return {k: (v if k in SKIP else translate_source(v, mapping)) for k, v in obj.items()}
    return obj

files = []
for path in list(ROOT.glob('*.json')) + list((ROOT / 'articles').glob('*.json')):
    if path.name in ('meta.json','primer.json','sign_svgs.json','signs.json','categories.json','glossary.json'):
        continue
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        continue
    files.append((path, data))

signs = json.loads((ROOT / 'signs.json').read_text(encoding='utf-8'))
categories = json.loads((ROOT / 'categories.json').read_text(encoding='utf-8'))
glossary = json.loads((ROOT / 'glossary.json').read_text(encoding='utf-8'))

strings = []
for path, data in files:
    collect_pairs(data, strings)
for sign in signs:
    strings.extend([sign['name'], sign['meaning'], sign['action']])
for category in categories:
    strings.extend([category['name'], category.get('blurb', '')])
for entry in glossary:
    strings.extend([entry[0], entry[2]])

source_paths = list((CUR / 'modules').glob('m*.json')) + [
    CUR / 'warning_lights.json', CUR / 'vehicle_parts.json', CUR / 'scenarios.json',
    CUR / 'sign_details.json', CUR / 'speed_limits.json'
]
source_data = []
for path in source_paths:
    data = json.loads(path.read_text(encoding='utf-8'))
    source_data.append((path, data))
    collect_source(data, strings)

mapping = translate_all(strings)

for path, data in files:
    translate_pairs(data, mapping)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + NL, encoding='utf-8')
    print('updated', path.name, flush=True)

for sign in signs:
    sign[TARGET] = [mapping.get(sign['name'], sign['name']),
                    mapping.get(sign['meaning'], sign['meaning']),
                    mapping.get(sign['action'], sign['action'])]
for category in categories:
    category[TARGET] = [mapping.get(category['name'], category['name']),
                         mapping.get(category.get('blurb', ''), category.get('blurb', ''))]
for entry in glossary:
    base = 8 if TARGET == 'kn' else 10
    while len(entry) <= base + 1:
        entry.append('')
    entry[base] = mapping.get(entry[0], entry[base] or entry[0])
    entry[base + 1] = mapping.get(entry[2], entry[base + 1] or entry[2])
for name, data in [('signs.json', signs), ('categories.json', categories), ('glossary.json', glossary)]:
    (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + NL, encoding='utf-8')

def tr(value):
    return translate_source(value, mapping)

for path, data in source_data:
    if path.parent == CUR / 'modules':
        overlay = {
            'module': tr({'title': data['title'], 'summary': data['summary']}),
            'chapters': tr({chapter['id']: chapter['title'] for chapter in data.get('chapters', [])}),
            'lessons': {lesson['id']: tr({k: v for k, v in lesson.items() if k not in SKIP})
                        for lesson in data.get('lessons', [])}
        }
        (OUT / path.name).write_text(json.dumps(overlay, ensure_ascii=False, indent=2) + NL, encoding='utf-8')
        print('module', path.name, flush=True)

lib = {}
for filename, key in [('warning_lights.json','lights'),('vehicle_parts.json','parts'),('scenarios.json','scenarios')]:
    data = json.loads((CUR / filename).read_text(encoding='utf-8'))
    lib[key] = {item['id']: tr({k: v for k, v in item.items() if k not in SKIP}) for item in data}
(OUT / 'library.json').write_text(json.dumps(lib, ensure_ascii=False, indent=2) + NL, encoding='utf-8')
for filename in ('sign_details.json','speed_limits.json'):
    data = json.loads((CUR / filename).read_text(encoding='utf-8'))
    (OUT / filename).write_text(json.dumps(tr(data), ensure_ascii=False, indent=2) + NL, encoding='utf-8')
(OUT / 'fixed.json').write_text('{}' + NL, encoding='utf-8')
print(TARGET.upper() + '_TRANSLATION_COMPLETE', flush=True)
