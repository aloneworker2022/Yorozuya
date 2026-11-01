const {chromium,devices}=require('playwright');const tag=process.argv[2];
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});const p=await c.newPage();
const logs=[];p.on('console',m=>m.type()=='error'&&logs.push(m.text()));p.on('pageerror',e=>logs.push('ERR '+e.message));
await p.goto('http://localhost:8765/droom/index.html?hd=1');await p.waitForTimeout(1500);
const set=async(id,v)=>{await p.selectOption('#'+id,v);await p.waitForTimeout(300)};
await set('B','balanced');await set('S','round');await set('C','D');await set('A','medium');await set('BH',process.argv[3]||'short');await set('FH',process.argv[4]||'side');await set('H','black');await set('CL','none');await set('BF','none');await set('NS',process.argv[5]||'small');
await p.click('#pp');await p.waitForTimeout(2000);
for(const d of ['front','front_right','right','front_left','left','back_right']){await set('Dd',d);await p.waitForTimeout(1500);await (await p.$('#v')).screenshot({path:`/tmp/shots/${tag}_${d}.png`});}
console.log(logs.join('\n')||'no errors');await b.close();})();
