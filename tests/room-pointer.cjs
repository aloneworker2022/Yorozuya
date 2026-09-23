// Serve web/ first. Requires Playwright and Edge; NODE_PATH can locate Playwright.
// node tests/room-pointer.cjs [http://127.0.0.1:8765]
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.argv[2]||'http://127.0.0.1:8765';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    for(const width of [390,320,1000]){
      const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      // AI is stubbed: verify gestures without spending generation credits.
      await page.route('**/content/test_room_summon.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.opens=0;window.RoomPortrait={open(){window.opens++}};'}));
      await page.route('**/content/test_room.js*',async route=>{
        const response=await route.fetch(),source=await response.text();
        await route.fulfill({response,body:source.replace(/\}\)\(\);\s*$/,
          'window.__room={actor,items,camera,hitActor,hitItem,hitTarget,project,draw,canvas};})();')});
      });
      await page.goto(base+'/test_room.html');
      await page.waitForFunction(()=>window.__room&&window.RoomPortrait);
      await page.locator('#actor-toggle').click();
      const room=page.locator('#room'),menu=page.locator('#actor-menu');
      await room.scrollIntoViewIfNeeded();
      const cdp=await context.newCDPSession(page);
      const touch=async(type,points)=>{
        await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p.x,y:p.y,id:i+1}))});
        await page.waitForTimeout(35);
      };
      const snapshot=()=>page.evaluate(()=>({items:structuredClone(__room.items),camera:{...__room.camera},opens:window.opens}));
      async function point(kind,near=false){
        await room.scrollIntoViewIfNeeded();
        return page.evaluate(({kind,near})=>{
          const r=__room,b=r.canvas.getBoundingClientRect();
          for(let y=0;y<r.canvas.height;y++)for(let x=0;x<r.canvas.width;x++){
            const p={x,y},actor=r.hitActor(p),item=r.hitItem(p);
            if(near&&(actor||item))continue;
            if(kind==='actor'?(near?r.hitTarget(p,'touch')?.actor:actor):(!actor&&item?.id===1))
              return {x:b.left+x*b.width/r.canvas.width,y:b.top+y*b.height/r.canvas.height};
          }
          throw Error('No visible '+kind);
        },{kind,near});
      }
      const reset=async()=>{await page.locator('#reset-view').click();await room.scrollIntoViewIfNeeded();};
      let start=await snapshot(),p=await point('item');
      assert.equal(await page.locator('.inventory').isVisible(),false);
      assert.equal(await page.locator('.furniture-panel').isVisible(),false);
      await touch('touchStart',[p]);await touch('touchMove',[{x:p.x-24,y:p.y+12}]);await touch('touchEnd',[]);
      assert.deepEqual((await snapshot()).items,start.items,'Normal mode moved furniture');
      assert.notDeepEqual((await snapshot()).camera,start.camera,'Normal mode failed to pan over furniture');
      await page.locator('[data-add]').first().evaluate(button=>button.click());
      assert.deepEqual((await snapshot()).items,start.items,'Hidden catalog mutated room');
      await reset();p=await point('actor');
      await touch('touchStart',[p]);await touch('touchEnd',[]);await page.waitForTimeout(550);
      assert.equal(await menu.isVisible(),false,'Quick tap opened menu');
      assert.equal((await snapshot()).opens,0,'Quick tap opened chat');
      p=await point('actor',true);
      await touch('touchStart',[p]);await touch('touchMove',[{x:p.x+3,y:p.y}]);await page.waitForTimeout(550);
      assert.equal(await menu.isVisible(),true,'Long press near actor missed');
      await touch('touchEnd',[]);
      assert.equal(await menu.isVisible(),true,'Release dismissed menu');
      if(process.env.ROOM_SCREENSHOTS)await page.screenshot({path:process.env.ROOM_SCREENSHOTS+'/room-interaction-'+width+'.png'});
      await page.locator('#actor-chat').click();
      assert.equal((await snapshot()).opens,1,'Chat action did not open portrait');
      assert.equal(await menu.isVisible(),false);
      p=await point('actor');
      await touch('touchStart',[p]);await touch('touchMove',[{x:p.x+24,y:p.y+12}]);await page.waitForTimeout(550);await touch('touchEnd',[]);
      assert.equal(await menu.isVisible(),false,'Drag triggered long press');
      await reset();p=await point('actor');
      await touch('touchStart',[p]);await touch('touchCancel',[]);await page.waitForTimeout(550);
      assert.equal(await menu.isVisible(),false,'Cancelled touch triggered long press');
      p=await point('actor');const second={x:p.x+50,y:p.y+20};
      await touch('touchStart',[p]);await touch('touchStart',[p,second]);
      await touch('touchMove',[{x:p.x-15,y:p.y},{x:second.x+15,y:second.y}]);
      await touch('touchEnd',[{x:p.x-15,y:p.y}]);await touch('touchEnd',[]);await page.waitForTimeout(550);
      assert.equal(await menu.isVisible(),false,'Pinch triggered menu');
      assert.ok((await snapshot()).camera.scale>1);
      p=await point('actor',true);await touch('touchStart',[p]);await page.waitForTimeout(550);await touch('touchEnd',[]);
      assert.equal(await menu.isVisible(),true,'Zoomed long press missed');
      await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);
      await reset();await page.locator('#edit-room').click();
      assert.equal(await page.locator('.inventory').isVisible(),true);
      assert.equal(await page.locator('#actor-interact').isDisabled(),true);
      p=await point('item');start=await snapshot();
      await touch('touchStart',[p]);await touch('touchMove',[{x:p.x+3,y:p.y+3}]);await touch('touchEnd',[]);
      assert.deepEqual((await snapshot()).items,start.items,'Selection jitter moved furniture');
      const bounds=await room.boundingBox();
      await page.mouse.move(p.x,p.y);await page.mouse.down();
      await page.mouse.move(p.x-32*bounds.width/416,p.y+16*bounds.height/328,{steps:5});await page.mouse.up();
      assert.equal((await snapshot()).items[0].v,start.items[0].v+1,'Edit drag failed');
      p=await point('item');start=await snapshot();
      await touch('touchStart',[p]);await touch('touchMove',[{x:p.x-24,y:p.y+12}]);await touch('touchCancel',[]);
      assert.deepEqual((await snapshot()).items,start.items,'Cancelled edit committed');
      await page.locator('#edit-room').click();
      assert.equal(await page.locator('.inventory').isVisible(),false);
      await reset();p=await point('item');start=await snapshot();
      await touch('touchStart',[p]);await touch('touchMove',[{x:p.x+24,y:p.y}]);await touch('touchEnd',[]);
      assert.deepEqual((await snapshot()).items,start.items,'Done failed to lock room');
      await page.locator('#actor-interact').click();await page.locator('#actor-sit').click();
      assert.equal(await menu.isVisible(),false);
      await page.locator('#actor-toggle').click();
      await page.evaluate(()=>{
        const r=__room;
        for(let i=0;i<300&&r.actor.state.mode!=='sitting';i++)r.actor.update(.05,false);
        if(r.actor.state.mode!=='sitting')throw Error('Did not sit');r.draw();
      });
      p=await point('actor');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(550);await page.mouse.up();
      assert.equal(await menu.isVisible(),true,'Mouse hold on seated actor missed');
      assert.equal(await page.locator('#actor-sit').isDisabled(),true);
      await page.locator('#actor-stand').click();
      assert.notEqual(await page.evaluate(()=>__room.actor.state.mode),'sitting');
      assert.equal(await menu.isVisible(),false);
      assert.deepEqual(errors,[]);
      console.log('PASS edit mode and long-press interactions at '+width+'px');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
