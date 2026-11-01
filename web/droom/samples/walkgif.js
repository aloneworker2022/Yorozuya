const {chromium,devices}=require('playwright');
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});const p=await c.newPage();
const logs=[];p.on('console',m=>m.type()=='error'&&!m.text().includes('404')&&logs.push(m.text()));p.on('pageerror',e=>logs.push('ERR '+e.message));
await p.goto('http://localhost:8765/droom/index.html?hd=1');await p.waitForTimeout(1500);
const set=async(id,v)=>{await p.selectOption('#'+id,v);await p.waitForTimeout(250)};
for(const[k,v] of [['B','balanced'],['S','round'],['C','D'],['A','medium'],['BH','long'],['FH','curtain'],['H',process.env.HC||'black'],['N','pink'],['CL','none'],['BF','none'],['NS','small'],['EY','none'],['MO','line'],['BW','natural'],['PU','triangle'],['LB','line'],['PA','none']])await set(k,v);
await p.click('#pp');await p.waitForTimeout(800);
for(const d of ['front','front_right','right','back']){await set('Dd',d);await p.waitForTimeout(1500);
 for(let k=0;k<8;k++){await p.evaluate(k=>{i=k;draw()},k);await p.waitForTimeout(150);await (await p.$('#v')).screenshot({path:`/tmp/shots/wk_${d}_${k}.png`})}}
console.log(logs.join('\n')||'no errors');await b.close();})();
