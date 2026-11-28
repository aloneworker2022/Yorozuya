// Daily generated artwork uses the server's persistent generation queue.
export const KEEPERS = [
  { id:'rustic', name:'小春', place:'鄰家雜貨店', lines:['早安，今天也慢慢挑就好。','門口那隻貓，又睡在進貨箱上了。','我剛擦過玻璃，現在能照到你的臉。','今天的風很舒服，差點忘了開店。','不買也沒關係，進來歇一下吧。'] },
  { id:'elegant', name:'紫苑', place:'華麗香氛店', lines:['歡迎。今天想替自己挑點什麼？','這瓶香氣讓我想到下過雨的花園。','整理緞帶比盤點還花時間呢。','窗邊的位置最好看，我每天都忍不住重擺。','偶爾給自己一份小禮物，也很好。'] },
  { id:'tea', name:'穗香', place:'庭院茶屋', lines:['茶剛泡好，先坐一會兒吧。','今天的茶梗，居然直直站起來了。','院子裡的麻雀比我還準時。','忙的時候，也要記得喝點水。','剛才偷吃了一塊點心……只是一小塊。'] },
  { id:'gothic', name:'月白', place:'暮色古物店', lines:['歡迎，今天店裡的鐘都走得很準。','那本書只是有點舊，沒有詛咒。大概。','燭火晃了一下……應該是門縫的風。','這個小盒子，我也忘記鑰匙放哪了。','安靜的下午，很適合找一件有故事的東西。'] },
  { id:'wagashi', name:'千代', place:'花見和菓子店', lines:['歡迎！今天的櫥窗可是我親手排的。','糟糕，包裝紙又折歪了。假裝沒看到！','你說櫻花粉跟抹茶綠，是不是很搭？','剛數好的零錢，聊著聊著又忘了。','今天也辛苦了，給自己一點甜頭吧。'] },
];

export function validBannerUrl(url) { return typeof url==='string' && /^\/assets\/shop\/day-\d+\.png$/.test(url); }

let controller;
function createController() {
  const scene=document.querySelector('.shop-keeper-scene'), line=document.querySelector('#merchant-line');
  if(!scene||!line)return null;
  const photo=scene.querySelector('img'), label=document.querySelector('#shop-keeper-name');
  const statusLabel=document.querySelector('#shop-banner-status'), retry=document.querySelector('#shop-banner-retry');
  const store=document.querySelector('.shop-storefront'), reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const breath=document.createElement('span');breath.className='shop-keeper-layer keeper-breath';breath.setAttribute('aria-hidden','true');scene.appendChild(breath);
  let active=false,visible=false,day=-1,getDay=null,settings={},timer=null,request=null,epoch=0;
  let response=null,nextPoll=0,nextLine=0,lineIndex=0,profile=KEEPERS[0],displayedUrl='',loadingUrl='',imageToken=0;
  function showLine(){line.textContent=`「${profile.lines[lineIndex]}」`;line.setAttribute('aria-label',`${profile.name}：${profile.lines[lineIndex]} 點一下再聊一句`);}
  function chatter(){lineIndex=(lineIndex+1)%profile.lines.length;showLine();nextLine=Date.now()+14000+Math.random()*8000;}
  showLine();label.textContent='櫃檯店員';
  function setStatus(text){if(statusLabel.textContent!==text)statusLabel.textContent=text;}
  function present(data){
    if(!validBannerUrl(data?.url)||data.url===displayedUrl||data.url===loadingUrl)return;
    const token=++imageToken, img=new Image();loadingUrl=data.url;
    img.onload=()=>{
      if(token!==imageToken)return;
      loadingUrl='';displayedUrl=data.url;photo.src=data.url;photo.alt=`${data.name}站在${data.place}的櫃檯後`;
      breath.style.backgroundImage=`url("${data.url}")`;scene.classList.add('keeper-ready');
      scene.dataset.bannerDay=String(data.day);scene.setAttribute('aria-label',photo.alt);
      const theme=KEEPERS.find(k=>k.id===data.theme)||KEEPERS[0];profile={...theme,name:data.name||theme.name};
      store.dataset.keeper=theme.id;label.textContent=`${profile.name} · ${data.place||theme.place}`;
      lineIndex=0;showLine();nextLine=Date.now()+14000;
      if(data.day===day)setStatus('今日店員');
    };
    img.onerror=()=>{if(token===imageToken){loadingUrl='';setStatus('橫幅載入失敗');retry.hidden=false;}};
    img.src=data.url;
  }
  function updateDay(n){
    if(!Number.isFinite(n)||n===day)return;
    day=n;epoch++;request?.abort();request=null;response=null;nextPoll=0;imageToken++;loadingUrl='';retry.hidden=true;
  }
  async function load(force=false){
    if(request||day<0)return;
    const token=epoch,requestedDay=day,abort=new AbortController();request=abort;
    const timeout=setTimeout(()=>abort.abort(),20000);
    try{
      const poll=!force&&['pending','running'].includes(response?.status);
      const r=await fetch(poll?`/api/shop-banner?day=${day}`:'/api/shop-banner',poll?
        {signal:abort.signal,cache:'no-store'}:
        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({day,comfy_url:settings.comfyUrl||'',retry:force}),signal:abort.signal});
      if(!r.ok)throw Error(`HTTP ${r.status}`);
      const data=await r.json();if(token!==epoch||requestedDay!==day)return;
      if(data.day!==day||!['idle','pending','running','done','error','unavailable'].includes(data.status))throw Error('Invalid banner response');
      response=data;retry.hidden=!['error','unavailable'].includes(data.status);
      if(data.status==='done'&&validBannerUrl(data.url)){
        present(data);nextPoll=Infinity;
        if(displayedUrl===data.url)setStatus('今日店員');
      }else{
        if(data.fallback)present(data.fallback);
        setStatus(data.status==='error'||data.status==='unavailable'?'今日橫幅暫未完成':'今日橫幅準備中…');
        nextPoll=data.status==='error'?Infinity:Date.now()+(data.status==='unavailable'?60000:5000);
      }
    }catch(e){
      if(token!==epoch)return;
      setStatus('今日橫幅暫未完成');retry.hidden=false;nextPoll=Date.now()+60000;
    }finally{clearTimeout(timeout);if(request===abort)request=null;}
  }
  function tick(){
    if(getDay)updateDay(getDay());
    if(Date.now()>=nextPoll)void load();
    if(nextLine&&Date.now()>=nextLine)chatter();
  }
  function reconcile(){
    const running=active&&visible&&!document.hidden;
    scene.classList.toggle('keeper-running',running&&!reduce.matches);
    clearInterval(timer);timer=null;
    if(running){tick();timer=setInterval(tick,1000);}else{epoch++;request?.abort();request=null;}
  }
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reconcile();},{threshold:.05}).observe(scene);
  document.addEventListener('visibilitychange',reconcile);reduce.addEventListener('change',reconcile);
  line.addEventListener('click',()=>{if(active)chatter();});
  retry.addEventListener('click',()=>{if(active){nextPoll=0;void load(true);}});
  return {sync(n,opts){settings=opts||settings;updateDay(n);},active(value,provider){active=value;if(provider)getDay=provider;reconcile();}};
}
export function syncShopKeeper(day,settings) {controller ||= createController();controller?.sync(day,settings);}
export function setShopKeeperActive(active,getDay) {controller ||= createController();controller?.active(active,getDay);}
