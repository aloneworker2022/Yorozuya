const {chromium,devices}=require('playwright');
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});const p=await c.newPage();
const logs=[];p.on('console',m=>m.type()=='error'&&logs.push(m.text()));p.on('pageerror',e=>logs.push('ERR '+e.message));
await p.goto('http://localhost:8765/droom/index.html?hd=1');await p.waitForTimeout(1500);
const set=async(id,v)=>{await p.selectOption('#'+id,v);await p.waitForTimeout(250)};
for(const[k,v] of [['B','balanced'],['S','round'],['C','D'],['A','medium'],['BH','short'],['FH','side'],['H','black'],['CL','none'],['BF','none']])await set(k,v);
await p.click('#pp');await p.waitForTimeout(1500);
for(const ns of (process.argv[2]||'small').split(',')){await set('NS',ns);
 for(const d of ['front','front_right','right']){await set('Dd',d);await p.waitForTimeout(1200);await (await p.$('#v')).screenshot({path:`/tmp/shots/s9_${ns}_${d}.png`});}}
console.log(logs.join('\n')||'no errors');await b.close();})();
