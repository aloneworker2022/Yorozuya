import sqlite3
import ast
import asyncio
import contextlib
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import shop_banner as B

def api_smoke():
    """Load the exact endpoint AST without importing unrelated Python-3.12 modules."""
    import httpx
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
    from types import SimpleNamespace
    with tempfile.TemporaryDirectory() as temp:
        assets=Path(temp);dbfile=assets/'test.db'
        @contextlib.contextmanager
        def db():
            con=sqlite3.connect(dbfile)
            con.execute('CREATE TABLE IF NOT EXISTS gen_tasks(key TEXT PRIMARY KEY,endpoint TEXT,model TEXT,messages TEXT,options TEXT,status TEXT,prio INTEGER,created REAL,updated REAL,result TEXT,error TEXT)')
            try:
                with con:yield con
            finally:con.close()
        async def checkpoints(base):return ['a','b']
        app=FastAPI()
        ns=dict(app=app,BaseModel=BaseModel,HTTPException=HTTPException,asyncio=asyncio,
                shop_banner=B,db=db,ASSETS_DIR=assets,GEN_WAKE=asyncio.Event(),
                comfy=SimpleNamespace(checkpoints=checkpoints,bad_ckpts=lambda:[]))
        source=ast.parse((Path(__file__).resolve().parents[1]/'server/main.py').read_text(encoding='utf-8'))
        names={'ShopBannerIn','shop_banner_status','shop_banner_submit'}
        nodes=[n for n in source.body if getattr(n,'name',None) in names or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SHOP_BANNER_LOCK' for t in n.targets)]
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'main.py endpoint AST','exec'),ns)
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
                assert (await c.post('/api/shop-banner',json={'day':-1})).status_code==400
                a,b=await asyncio.gather(c.post('/api/shop-banner',json={'day':20}),c.post('/api/shop-banner',json={'day':20}))
                assert a.json()['key']==b.json()['key']
                assert a.json()['status']=='pending'
                with db() as conn:assert conn.execute('SELECT count(*) FROM gen_tasks').fetchone()[0]==1
                p=B.image_path(assets,20);p.parent.mkdir();p.write_bytes(b'PNG')
                assert (await c.get('/api/shop-banner?day=20')).json()['status']=='done'
                async def offline(base):return []
                ns['comfy'].checkpoints=offline
                result=(await c.post('/api/shop-banner',json={'day':21})).json()
                assert result['status']=='unavailable' and result['fallback']['day']==20
        asyncio.run(run())

class BannerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.assets=Path(self.tmp.name)
        self.conn=sqlite3.connect(':memory:')
        self.conn.execute('CREATE TABLE gen_tasks(key TEXT PRIMARY KEY,endpoint TEXT,model TEXT,messages TEXT,options TEXT,status TEXT,prio INTEGER,created REAL,updated REAL,result TEXT,error TEXT)')
    def tearDown(self):
        self.conn.close();self.tmp.cleanup()
    def test_different_models_and_identities(self):
        prev='';prompts=set()
        for day in range(30):
            opts=B.build_order(day,['a.safetensors','b.safetensors'],prev)
            self.assertNotEqual(prev,opts['ckpt']);prev=opts['ckpt'];prompts.add(opts['prompt'])
            self.assertEqual(opts['ref'],'');self.assertFalse(opts['lock_identity'])
            self.assertGreater(opts['width'],opts['height'])
        self.assertEqual(len(prompts),30)
    def test_single_model_and_exclusions(self):
        self.assertEqual(B.build_order(10,['a'],'a')['ckpt'],'a')
        self.assertEqual(B.usable_models(['a','bad','animij_v10.safetensors'],['bad']),['a'])
    def test_idempotent_persistent_order(self):
        a=B.enqueue(self.conn,self.assets,20,['a','b'])
        b=B.enqueue(self.conn,self.assets,20,['c'])
        self.assertEqual(a['checkpoint'],b['checkpoint']);self.assertEqual(a['seed'],b['seed'])
        self.assertEqual(self.conn.execute('SELECT count(*) FROM gen_tasks').fetchone()[0],1)
    def test_done_survives_queue_cleanup_and_is_fallback(self):
        B.enqueue(self.conn,self.assets,20,['a'])
        p=B.image_path(self.assets,20);p.parent.mkdir();p.write_bytes(b'PNG')
        self.conn.execute('DELETE FROM gen_tasks')
        self.assertEqual(B.status(self.conn,self.assets,20)['status'],'done')
        self.assertEqual(B.status(self.conn,self.assets,21)['fallback']['day'],20)
    def test_retry_is_explicit_and_preserves_identity(self):
        a=B.enqueue(self.conn,self.assets,20,['a','b'])
        self.conn.execute("UPDATE gen_tasks SET status='error',error='offline'")
        self.assertEqual(B.enqueue(self.conn,self.assets,20,['a','b'])['status'],'error')
        b=B.enqueue(self.conn,self.assets,20,['a','b'],base='http://new-host:8188',retry=True)
        self.assertEqual(b['status'],'pending');self.assertEqual(b['prompt'],a['prompt']);self.assertEqual(b['seed'],a['seed'])
    def test_deleted_image_requeues_saved_order(self):
        a=B.enqueue(self.conn,self.assets,20,['a'])
        self.conn.execute("UPDATE gen_tasks SET status='done',result='/assets/shop/day-20.png'")
        b=B.enqueue(self.conn,self.assets,20,['b'])
        self.assertEqual(b['status'],'pending');self.assertEqual(a['checkpoint'],b['checkpoint'])

if __name__=='__main__':
    api_smoke()
    print('FastAPI endpoint contracts: passed')
    unittest.main()
