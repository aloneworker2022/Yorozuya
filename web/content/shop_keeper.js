// Presentation only: rotating attendants never modify stock, gold or inventory.
export const KEEPERS = [
  { id:'rustic', name:'小春', place:'鄰家雜貨店', lines:['早安，今天也慢慢挑就好。','門口那隻貓，又睡在進貨箱上了。','我剛擦過玻璃，現在能照到你的臉。','今天的風很舒服，差點忘了開店。','不買也沒關係，進來歇一下吧。'] },
  { id:'elegant', name:'紫苑', place:'華麗香氛店', lines:['歡迎。今天想替自己挑點什麼？','這瓶香氣讓我想到下過雨的花園。','整理緞帶比盤點還花時間呢。','窗邊的位置最好看，我每天都忍不住重擺。','偶爾給自己一份小禮物，也很好。'] },
  { id:'tea', name:'穗香', place:'庭院茶屋', lines:['茶剛泡好，先坐一會兒吧。','今天的茶梗，居然直直站起來了。','院子裡的麻雀比我還準時。','忙的時候，也要記得喝點水。','剛才偷吃了一塊點心……只是一小塊。'] },
  { id:'gothic', name:'月白', place:'暮色古物店', lines:['歡迎，今天店裡的鐘都走得很準。','那本書只是有點舊，沒有詛咒。大概。','燭火晃了一下……應該是門縫的風。','這個小盒子，我也忘記鑰匙放哪了。','安靜的下午，很適合找一件有故事的東西。'] },
  { id:'wagashi', name:'千代', place:'花見和菓子店', lines:['歡迎！今天的櫥窗可是我親手排的。','糟糕，包裝紙又折歪了。假裝沒看到！','你說櫻花粉跟抹茶綠，是不是很搭？','剛數好的零錢，聊著聊著又忘了。','今天也辛苦了，給自己一點甜頭吧。'] },
];

export function keeperForDay(day) {
  const n = Number.isFinite(day) ? Math.trunc(day) : 0;
  return KEEPERS[((n % KEEPERS.length) + KEEPERS.length) % KEEPERS.length];
}

let controller;
function createController() {
  const scene = document.querySelector('.shop-keeper-scene');
  const line = document.querySelector('#merchant-line');
  if (!scene || !line) return null;
  const store = document.querySelector('.shop-storefront');
  const label = document.querySelector('#shop-keeper-name');
  const fallback = scene.querySelector('img');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let active=false, visible=false, day=0, getDay=null, current=null, timer=null;
  let lineIndex=0, nextLine=0, nextBlink=0, blinkEnd=0, generation=0, ready=false;
  const layers = ['still','breath','blink'].map(type=>{
    const el=document.createElement('span'); el.className=`shop-keeper-layer keeper-${type}`;
    el.setAttribute('aria-hidden','true');scene.appendChild(el);return el;
  });
  const showLine=()=>{ if(current) { line.textContent=`「${current.lines[lineIndex]}」`;line.setAttribute('aria-label',`${current.name}：${current.lines[lineIndex]} 點一下再聊一句`); } };
  function chatter() {
    if(!current) return;
    lineIndex=(lineIndex+1)%current.lines.length;showLine();nextLine=Date.now()+14000+Math.random()*8000;
  }
  function select() {
    const selected=keeperForDay(day);
    if(current?.id===selected.id) return;
    current=selected;lineIndex=0;showLine();
    label.textContent=`${selected.name} · ${selected.place}`;
    store.dataset.keeper=selected.id;
    scene.setAttribute('aria-label',`${selected.name}站在${selected.place}的櫃檯後`);
    scene.classList.remove('keeper-ready','is-blinking');ready=false;
    const token=++generation, img=new Image();
    const url=new URL(`../img/shop-${selected.id}-blink.png`,import.meta.url).href;
    img.onload=()=>{
      if(token!==generation)return;
      layers.forEach(el=>el.style.backgroundImage=`url("${url}")`);
      scene.classList.add('keeper-ready');ready=true;
    };
    img.onerror=()=>{if(token===generation){ready=false;scene.classList.remove('keeper-ready');}};
    img.src=url;
    nextBlink=Date.now()+2200+Math.random()*2600;nextLine=Date.now()+14000;
    if(fallback)fallback.alt='櫃檯店員';
  }
  function tick() {
    const now=Date.now();
    if(getDay)day=getDay();
    select();
    if(!reduce.matches&&ready){
      if(blinkEnd&&now>=blinkEnd){scene.classList.remove('is-blinking');blinkEnd=0;nextBlink=now+3000+Math.random()*3500;}
      else if(!blinkEnd&&now>=nextBlink){scene.classList.add('is-blinking');blinkEnd=now+160;}
    }
    if(now>=nextLine)chatter();
  }
  function reconcile() {
    const running=active&&visible&&!document.hidden;
    scene.classList.toggle('keeper-running',running&&!reduce.matches);
    if(timer){clearInterval(timer);timer=null;}
    scene.classList.remove('is-blinking');blinkEnd=0;
    if(running){tick();timer=setInterval(tick,reduce.matches?1000:80);}
  }
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reconcile();},{threshold:0.05}).observe(scene);
  document.addEventListener('visibilitychange',reconcile);
  reduce.addEventListener('change',reconcile);
  line.addEventListener('click',()=>{if(active)chatter();});
  return {
    sync(n){day=n;if(active)select();},
    active(value,provider){active=value;if(provider)getDay=provider;if(active&&getDay)day=getDay();reconcile();},
  };
}
export function syncShopKeeper(day) { controller ||= createController();controller?.sync(day); }
export function setShopKeeperActive(active,getDay) { controller ||= createController();controller?.active(active,getDay); }
