"""Daily shop artwork: persisted text-to-image orders using the shared GPU queue."""
import hashlib
import json
import random
import time
from pathlib import Path

COMPOSITION = (
    "masterpiece, high quality, solo adult woman, shopkeeper, waist-up portrait, "
    "landscape composition, eye-level view, looking at viewer, entire head in frame, "
    "standing behind a wooden shop counter, hands resting on countertop, "
    "countertop along bottom edge, detailed shop interior behind her, "
    "fully clothed, modest neckline, natural anatomy, mature facial features, "
    "detailed irises, natural-sized eyes, welcoming expression, soft lighting"
)
NEGATIVE = (
    "low quality, blurry, bad anatomy, extra fingers, extra arms, duplicate person, "
    "multiple people, collage, panels, text, watermark, logo, cropped head, "
    "full body, child, teenager, young-looking, nude, naked, topless, nipples, "
    "see-through clothing, lingerie, cleavage, erotic pose, chibi, oversized eyes, "
    "cartoon eyes, googly eyes, simple face, dot eyes"
)
THEMES = [
    ('rustic','鄰家雜貨店','linen shirt, indigo apron, rustic Japanese grocery, ceramic jars, afternoon sunlight'),
    ('elegant','華麗香氛店','high-neck plum dress, gold jewelry, perfume boutique, amber bottles, velvet curtains'),
    ('tea','庭院茶屋','cream blouse, sage apron, Japanese tea shop, bamboo baskets, garden window'),
    ('gothic','暮色古物店','high-neck navy Victorian dress, lace collar, antique shop, old clocks, candlelight'),
    ('wagashi','花見和菓子店','modest coral kimono, mint apron, Japanese sweet shop, pastel boxes, cherry blossoms'),
]
FACES = ['angular face, defined cheekbones, narrow eyes','round face, soft cheeks, balanced facial proportions',
         'oval face, straight eyebrows, almond eyes','square face, strong jaw, thick eyebrows',
         'heart-shaped face, freckles, gently arched eyebrows','long face, prominent nose, deep-set eyes']
HAIRS = ['short black pixie haircut','long silver braid over one shoulder','curly auburn bob',
         'dark blue hair in a high ponytail','wavy blonde shoulder-length hair','straight chestnut blunt bob',
         'long black hair in a low bun','short wavy copper hair','dark brown braided updo','long ash-brown loose curls']
SKINS = ['fair skin','warm olive skin','deep brown skin','medium tan skin','light brown skin']
BUILDS = ['slender build','broad shoulders, athletic build','soft full figure','average build','tall sturdy build']
NAMES = ['凜','晴子','真琴','紗月','美咲','椿','玲奈','千尋','香澄','沙羅','葵','澪','文香','詩織','杏奈']

def usable_models(models, bad=()):
    # animij v10 uses Anima rather than this project's SDXL checkpoint workflow.
    return sorted({m for m in models if m and m not in bad and 'animij_v10' not in m.lower()})

def build_order(day, models, previous=''):
    if not models:
        raise ValueError('沒有可用的 ComfyUI checkpoint')
    seed = int.from_bytes(hashlib.sha256(f'shop-banner-v1:{day}'.encode()).digest()[:4], 'big') % 2147483646 + 1
    rng = random.Random(seed)
    choices = [m for m in sorted(set(models)) if m != previous] or sorted(set(models))
    theme, place, outfit = THEMES[day % len(THEMES)]
    # Separate strides prevent the same five women simply wearing new clothes.
    identity = ', '.join([f'adult woman age {rng.randint(26, 44)}',FACES[day % len(FACES)],
                          HAIRS[day % len(HAIRS)],SKINS[(day // 2) % len(SKINS)],rng.choice(BUILDS)])
    ckpt = rng.choice(choices)
    quality = 'score_9, score_8_up, score_7_up, ' if 'pony' in ckpt.lower() else ''
    return dict(kind='girl_image',scene_kind='shop_banner',shop_day=day,raw_prompt=True,
                prompt=quality+identity+', '+COMPOSITION+', '+outfit,negative=NEGATIVE,
                ckpt=ckpt,seed=seed,width=1216,height=832,cutout=False,flat_bg=False,
                ref='',pose_ref='',lock_identity=False,vary=False,rating='sfw',
                theme=theme,place=place,name=NAMES[day % len(NAMES)])

def init(conn):
    conn.execute('CREATE TABLE IF NOT EXISTS shop_banners (day INTEGER PRIMARY KEY, options TEXT NOT NULL)')

def key_for(day):
    return f'shop-banner:v1:{int(day)}'

def image_path(assets, day):
    return Path(assets)/'shop'/f'day-{int(day)}.png'

def last_ready(conn, assets, before):
    init(conn)
    for day, raw in conn.execute('SELECT day, options FROM shop_banners WHERE day < ? ORDER BY day DESC LIMIT 90',(before,)):
        if image_path(assets,day).is_file():
            opts=json.loads(raw)
            return dict(day=day,url=f'/assets/shop/day-{day}.png',name=opts['name'],place=opts['place'],theme=opts['theme'])
    return None

def status(conn, assets, day):
    init(conn)
    row=conn.execute('SELECT options FROM shop_banners WHERE day=?',(day,)).fetchone()
    fallback=last_ready(conn,assets,day)
    if not row:
        return dict(day=day,status='idle',fallback=fallback)
    opts=json.loads(row[0])
    result=dict(day=day,key=key_for(day),name=opts['name'],place=opts['place'],theme=opts['theme'],
                checkpoint=opts['ckpt'],prompt=opts['prompt'],negative=opts['negative'],seed=opts['seed'],fallback=fallback)
    if image_path(assets,day).is_file():
        return dict(result,status='done',url=f'/assets/shop/day-{day}.png')
    task=conn.execute('SELECT status,error FROM gen_tasks WHERE key=?',(key_for(day),)).fetchone()
    # A deleted image or a pruned queue record can be rebuilt from saved options.
    state=task[0] if task and task[0] != 'done' else 'idle'
    return dict(result,status=state,error=task[1] if task else None)

def enqueue(conn, assets, day, models, base='', retry=False):
    init(conn)
    prior=conn.execute('SELECT options FROM shop_banners WHERE day < ? ORDER BY day DESC LIMIT 1',(day,)).fetchone()
    previous=json.loads(prior[0]).get('ckpt','') if prior else ''
    row=conn.execute('SELECT options FROM shop_banners WHERE day=?',(day,)).fetchone()
    if not row:
        opts=build_order(day,models,previous)
        opts['comfy_url']=base
        conn.execute('INSERT OR IGNORE INTO shop_banners(day,options) VALUES (?,?)',(day,json.dumps(opts,ensure_ascii=False)))
    opts=json.loads(conn.execute('SELECT options FROM shop_banners WHERE day=?',(day,)).fetchone()[0])
    current=status(conn,assets,day)
    if current['status'] in ('done','pending','running') or (current['status']=='error' and not retry):
        return current
    if retry:
        opts['comfy_url']=base
        if models and opts['ckpt'] not in models:
            opts['ckpt']=build_order(day,models,previous)['ckpt']
        conn.execute('UPDATE shop_banners SET options=? WHERE day=?',(json.dumps(opts,ensure_ascii=False),day))
    now=time.time()
    conn.execute("INSERT INTO gen_tasks(key,endpoint,model,messages,options,status,prio,created,updated) "
                 "VALUES (?,'comfy-img','','[]',?,'pending',0,?,?) "
                 "ON CONFLICT(key) DO UPDATE SET status='pending',result=NULL,error=NULL,options=excluded.options,updated=excluded.updated",
                 (key_for(day),json.dumps(opts,ensure_ascii=False),now,now))
    return status(conn,assets,day)
