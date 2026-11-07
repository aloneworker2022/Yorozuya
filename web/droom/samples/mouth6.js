const {chromium,devices}=require('playwright');
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});const p=await c.newPage();
const logs=[];p.on('console',m=>m.type()=='error'&&!m.text().includes('404')&&logs.push(m.text()));p.on('pageerror',e=>logs.push('ERR '+e.message));
await p.goto('http://localhost:8765/droom/index.html?hd=1');await p.waitForTimeout(1500);
const set=async(id,v)=>{await p.selectOption('#'+id,v);await p.waitForTimeout(250)};
for(const[k,v] of [['B','balanced'],['S','round'],['C','D'],['A','medium'],['BH','short'],['FH','side'],['H','black'],['CL','none'],['BF','none'],['NS','small'],['EY','none']])await set(k,v);
await p.click('#pp');await p.waitForTimeout(1500);
for(const mo of ['line','lip','smile','o','open','pout']){await set('MO',mo);
 for(const d of ['front','front_right','right']){await set('Dd',d);await p.waitForTimeout(1200);await (await p.$('#v')).screenshot({path:`/tmp/shots/m6_${mo}_${d}.png`});}}
console.log(logs.join('\n')||'no errors');await b.close();})();
