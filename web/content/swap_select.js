/* 2026-10-21 換妻 step：先問妻子 → 選對方夫妻 → 確認 → 開車生立繪 → 約會。
 * 2026-10-23：候選夫妻＝進選單時用 generateGirl＋husband_gen 現場抽（swap_candidates），只存 localStorage 當日清單；
 * 不延用咖啡廳「換一對」／/api/swap/cafe 測試名冊。選中後才 put 那一對並在 drive 黑畫面生 一般／害羞立繪。 */
import { api, BZH, pickBackdrop, genPortrait, rollCouple, rollCkpts, usableCkpts, ensureSwapMeta, enrichCouple } from "./swap_cafe_gen.js?v=38";
import { askChanceFor, canRental, stageKeyOf } from "./rental.js?v=7";
import { familyOf } from "./girl_voice.js?v=1";
import { openBar } from "./swap_bar.js?v=61";
import { dateOutfitOf } from "./swap_outfit.js?v=8";
import { SCENE_ZH as FLOW_ZH, pairSlotsFor, hotelMode } from "./swap_flow_rules.js?v=12";
import { loadCandidates, CANDIDATES_MIN } from "./swap_candidates.js?v=2";
import { queuePortraits } from "./swap_pregen.js?v=2";
import { rememberScene } from "./swap_bookmark.js?v=1";

export const SESSION_KEY = "yorozuya.swap.session";
const ROSTER_MIN = 4;   // 僅 loadRoster（咖啡廳測試工具）用
export function swapSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
const CSS = `
.swp-ov{position:fixed;inset:0;z-index:8600;background:#e9edf2;display:flex;flex-direction:column;font:15px/1.45 system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#1d2330}
.swp-ov button{font:inherit;box-shadow:none;text-shadow:none;image-rendering:auto;min-height:0;letter-spacing:0;transform:none;cursor:pointer}
.swp-ov button::before,.swp-ov button::after{content:none}
.swp-hd{background:#06c755;color:#fff;padding:10px 14px 8px;display:flex;align-items:center;gap:10px}
.swp-hd b{font-size:16px;flex:1}.swp-hd button{background:none!important;border:0!important;color:#fff;font-size:24px;line-height:1;padding:2px 6px;width:auto}
.swp-pick{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.swp-card{background:#fff!important;border-radius:14px!important;padding:12px 14px;border:2px solid transparent!important;width:100%;text-align:left;color:inherit;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.swp-card{height:auto!important;max-height:none!important;overflow:visible!important;padding-bottom:14px!important}
.swp-hd button{outline:0!important;box-shadow:none!important}
.swp-card:active{border-color:#06c755}
.swp-top{display:flex;align-items:center;gap:8px}.swp-top .pr{margin-left:auto;font-weight:700;color:#c07a00;white-space:nowrap}
.swp-faces{display:flex;gap:4px;flex:none}.swp-faces img{width:44px;height:56px;object-fit:cover;object-position:top;border-radius:8px;background:#dfe5ec}
.swp-faces:empty{display:none}
.swp-nm{font-weight:700;font-size:15px}
.swp-p{margin-top:6px;font-size:13px}.swp-p b{font-weight:600}
.tg{display:inline-block;font-size:12px;background:#eef2f6;border-radius:8px;padding:1px 7px;margin:4px 4px 0 0}.tg.h{background:#e3efff;color:#1d4f9a}.tg.w{background:#f6e6ff;color:#7a2a9a}
.swp-p q{display:block;color:#5b6475;font-size:13px;quotes:none}
.swp-big{display:flex;gap:10px;justify-content:center}.swp-big figure{margin:0;text-align:center;flex:1}.swp-big img{width:100%;max-width:170px;aspect-ratio:3/4;object-fit:cover;object-position:top;border-radius:12px;background:#dfe5ec}
.swp-act{display:flex;gap:8px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e3e7ec}
.swp-act button{flex:1;border-radius:12px!important;padding:12px;font-size:15px;border:1px solid #c9d0da!important;background:#fff!important;color:#1d2330}
.swp-act button.pri{background:#06c755!important;border-color:#06c755!important;color:#fff}
.swp-next{margin:auto;text-align:center;color:#4b5363;padding:24px}.swp-next b{display:block;font-size:20px;color:#1d2330;margin-bottom:8px}`;

const faceUrl = (S, c, who) => (S.images?.[c.id] || {})[`${who}~normal`]?.cut || "";
/** 有立繪就放圖；沒有就什麼都不放（版面收起來）。 */
const face = (S, c, who) => { const u = faceUrl(S, c, who); return u ? `<img alt="" src="${esc(u)}">` : ""; };
const hLooks = (h) => {
  const b = h.look?.build_zh || BZH[h.build] || h.build || "普通";
  const ht = h.height_cm || h.look?.height_cm;
  return [h.look?.hair || h.look?.hair_color, `體型${b}`, ht && `${ht}cm`].filter(Boolean).join("・");
};
const wLooks = (w) => {
  const cup = w.look?.cup, cupS = cup ? (/罩杯/.test(cup) ? cup : `${cup}罩杯`) : "";
  return [w.look?.hair_color || w.look?.hair, w.look?.build, cupS, w.look?.height_cm && `${w.look.height_cm}cm`, w.look?.style].filter(Boolean).join("・");
};
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

/** 咖啡廳測試面板用：讀／補 /api/swap/cafe 名冊。正式選夫妻請用 loadCandidates，不要叫這個。 */
export async function loadRoster() {
  let S = await api.state();
  const keep = S.current, ck = await usableCkpts();
  const save = async (c) => { S = await api.put("couple", { couple: c }); };
  for (const c of Object.values(S.couples)) {
    const a = await enrichCouple(c);
    const b = ck.length && (!c.husband?.ckpt || !c.wife?.ckpt) ? (rollCkpts(c, ck), true) : false;
    if (a || b || ensureSwapMeta(c)) await save(c);
  }
  while (Object.keys(S.couples).length < ROSTER_MIN) { const c = await rollCouple(); rollCkpts(c, ck); await save(c); await new Promise((r) => setTimeout(r, 3)); }
  if (keep && S.current !== keep && S.couples[keep]) await save(S.couples[keep]);
  return S;
}

/** 正式流程：今日候選（localStorage，不碰咖啡廳名冊）。 */
export async function loadGameCandidates({ force = false } = {}) {
  return loadCandidates({
    force,
    min: CANDIDATES_MIN,
    store: localStorage,
    rollCouple,
    rollCkpts,
    usableCkpts,
  });
}

export function openSwapSelect(ctx = {}) {
  if (!document.getElementById("swp-css")) { const s = document.createElement("style"); s.id = "swp-css"; s.textContent = CSS; document.head.append(s); }
  document.getElementById("swp-ov")?.remove();
  const ov = document.createElement("div"); ov.className = "swp-ov"; ov.id = "swp-ov";
  ov.innerHTML = `<div class="swp-hd"><b></b><button type="button" aria-label="關閉">×</button></div><div class="swp-body" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>`;
  ov.querySelector(".swp-hd button").addEventListener("click", () => ov.remove());
  document.body.append(ov);
  const title = (t) => { ov.querySelector(".swp-hd b").textContent = t; }, body = ov.querySelector(".swp-body");
  let pack = { day: "", candidates: [] };
  const persW = (w) => Array.isArray(w?.personality) ? w.personality.join("、") : String(w?.personality || "");
  const showList = () => {
    title("換妻・今天的夫妻（選一對）");
    const list = document.createElement("div"); list.className = "swp-pick";
    // 候選卡＝純文字資訊（不預先生立繪）
    for (const c of pack.candidates) {
      const h = c.husband, w = c.wife, b = document.createElement("button");
      b.type = "button"; b.className = "swp-card"; b.dataset.couple = c.id;
      b.innerHTML = `<div class="swp-top"><span class="swp-nm">${esc(h.name)} ＆ ${esc(w.name)}</span><span class="pr">${h.swapPrice} 金</span></div>
        <div class="swp-p">丈夫 ${esc(h.age)} 歲・妻子 ${esc(w.age)} 歲</div>
        <div><span class="tg h">${esc(h.swapType || "")}</span><span class="tg w">${esc(w.swapType || "")}</span></div>
        <div class="swp-p"><b>他</b> ${esc(hLooks(h))}${h.personality ? `・${esc(h.personality)}` : ""}</div>
        <div class="swp-p"><b>她</b> ${esc(wLooks(w))}${persW(w) ? `・${esc(persW(w))}` : ""}</div>`;
      b.addEventListener("click", () => confirm(c));
      list.append(b);
    }
    body.replaceChildren(list);
    const act = document.createElement("div"); act.className = "swp-act";
    act.innerHTML = `<button type="button" class="reroll">換一批</button><button type="button" class="back">關閉</button>`;
    act.querySelector(".back").addEventListener("click", () => ov.remove());
    act.querySelector(".reroll").addEventListener("click", () => { void reload(true); });
    body.append(act);
  };
  const confirm = (c) => {
    const h = c.husband, w = c.wife;
    title(`${h.name} ＆ ${w.name}`);
    body.innerHTML = `<div class="swp-pick"><div class="swp-card" style="cursor:default">
      <div class="swp-p"><b>丈夫・${esc(h.name)}</b> ${esc(h.age)} 歲・${esc(h.swapType || "")}</div>
      <div class="swp-p">${esc(hLooks(h))}${h.personality ? `・${esc(h.personality)}` : ""}</div>
      <div class="swp-p"><b>妻子・${esc(w.name)}</b> ${esc(w.age)} 歲・${esc(w.swapType || "")}</div>
      <div class="swp-p">${esc(wLooks(w))}${persW(w) ? `・${esc(persW(w))}` : ""}</div>
      <div class="swp-p"><b>費用</b> ${h.swapPrice} 金</div>
      <div class="swp-p" style="color:#8a92a0;font-size:12px">選了之後開始產立繪。產完不會馬上進場，左邊會出現書籤，你再決定什麼時候赴約。關掉網頁，圖也會繼續生。</div></div></div>
      <div class="swp-act"><button type="button" class="back">返回</button><button type="button" class="pri go">選這對</button></div>`;
    body.querySelector(".back").addEventListener("click", showList);
    body.querySelector(".go").addEventListener("click", () => { void pick(c); });
  };
  const pick = async (c) => {
    const h = c.husband, w = c.wife;
    const startScene = ctx.testScene || "bar";
    body.innerHTML = `<div class="swp-next">正在把立繪交給伺服器…</div>`;
    try {
      await api.put("couple", { couple: c });
      await queuePortraits("date", ctx.girl?.(), c);
    } catch (e) {
      body.innerHTML = `<div class="swp-next">${esc(e?.message || e)}</div><div class="swp-act"><button type="button" class="back">返回</button></div>`;
      body.querySelector(".back").addEventListener("click", showList);
      return;
    }
    rememberScene(c.id, startScene);
    ctx.debug?.(`換妻：選了 ${h.name} ＆ ${w.name}（${h.swapPrice} 金）→ 伺服器產圖，書籤好了再赴約（${startScene}）`);
    ov.remove();
  };
  const reload = async (force) => {
    body.innerHTML = `<div class="swp-next">${force ? "重抽候選夫妻…" : "抽新的夫妻…"}</div>`;
    try {
      pack = await loadGameCandidates({ force: !!force });
      ctx.debug?.(`換妻：候選 ${pack.candidates.length} 對（${pack.reused ? "沿用今日" : "新抽"}・${pack.day}）`);
      showList();
    } catch (e) { body.innerHTML = `<div class="swp-next">${esc(e?.message || e)}</div>`; }
  };
  void reload(false);
  return ov;
}

// ------------------------------------------------------------ 先問妻子（照日租 rental_ui.ask）
/** 答應機率：日租的 askChanceFor（妻子階段 0.5／貼心 0.7／順從 0.85／病態 0.6＋家族＋(忠誠−60)/200−生氣受傷），
 * 換妻比日租更難開口 −0.15（你也要跟別的女人）；感情 +(感情−60)/300；飢渴 ≥85 +0.15、≥60 +0.08。夾在 5%–90%。 */
export function swapAskChance(who, { mood = null, hunger = 0 } = {}) {
  let p = askChanceFor(who, mood);
  if (!p) return 0;
  p -= 0.15;
  p += ((Number(who?.stats?.affection ?? 60) || 0) - 60) / 300;
  if (hunger >= 85) p += 0.15; else if (hunger >= 60) p += 0.08;
  return Math.max(0.05, Math.min(0.9, Math.round(p * 100) / 100));
}
const ACT_NO = { 冷淡: "（別過頭，雙手抱胸）", 溫柔: "（低下頭，手指絞著衣角）", 熱絡: "（嘟起嘴，用力搖頭）", 佔有: "（一把抓住你的手臂）", 反差: "（臉一下子紅透，猛搖頭）" };
const NO = { 冷淡: "不要。這種事你自己想就好。", 溫柔: "……我不想跟別的男人那樣，可以不要嗎？", 熱絡: "欸～不要啦，我只想跟你約會！", 佔有: "你想跟別的女人？想都別想。", 反差: "不、不行啦……太丟臉了……" };
const ACT_OK = { 冷淡: "（沉默了一下，輕輕點頭）", 溫柔: "（臉紅著小聲答應）", 熱絡: "（眼睛一亮，拍拍你的肩）", 佔有: "（瞇起眼睛盯著你）", 反差: "（耳根發紅，聲音越來越小）" };
const OK = { 冷淡: "……好吧，就一次。", 溫柔: "好……如果你想的話，我陪你去。", 熱絡: "好啊～聽起來好刺激！", 佔有: "可以。但你要是太投入，回家有你好看的。", 反差: "嗯……我、我去就是了……" };
/** AI 回的句子整理成「（動作）台詞」；沒有動作就補一個。 */
export function actLine(text, act) {
  let t = String(text || "").replace(/^["「『]+|["」』]+$/g, "").replace(/\(/g, "（").replace(/\)/g, "）").trim();
  if (!t) return "";
  if (!/^（[^）]{1,30}）/.test(t)) t = act + t;
  return t.slice(0, 120);
}
const SPEAK = "老婆……我想找另一對夫妻，四個人一起約會、交換伴侶，你願意嗎？";

/** 「開始換妻」：確認有妻子 → 問她 → 答應才開名冊（openSwapSelect）。
 * ctx：{ girl(), say?(who, ask, fallback) → Promise<string>, mood?(who), hunger?(who), debug?(msg) } */
export function openSwapStart(ctx = {}) {
  if (!document.getElementById("swp-css")) { const st = document.createElement("style"); st.id = "swp-css"; st.textContent = CSS; document.head.append(st); }
  document.getElementById("swp-ov")?.remove();
  const ov = document.createElement("div"); ov.className = "swp-ov"; ov.id = "swp-ov";
  ov.innerHTML = `<div class="swp-hd"><b>換妻・先問老婆</b><button type="button" aria-label="關閉">×</button></div><div class="swp-body" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>`;
  ov.querySelector(".swp-hd button").addEventListener("click", () => ov.remove());
  document.body.append(ov);
  const body = ov.querySelector(".swp-body"), who = ctx.girl?.();
  const end = (msg) => { body.innerHTML = `<div class="swp-next">${msg}</div><div class="swp-act"><button type="button" class="back">關閉</button></div>`; body.querySelector(".back").addEventListener("click", () => ov.remove()); };
  if (!who) return end("<b>沒有老婆</b>先在房間裡選一位魅子。"), ov;
  if (!canRental(who)) return end(`<b>${esc(who.name)}還不是你的老婆</b>（要妻子階段以上才能換妻；現在：${esc(stageKeyOf(who))}）`), ov;
  const fam = (() => { try { return familyOf(who); } catch { return "溫柔"; } })();
  const mood = ctx.mood?.(who) || null, hunger = Number(ctx.hunger?.(who)) || 0;
  const p = swapAskChance(who, { mood, hunger }), yes = Math.random() < p;
  ctx.debug?.(`換妻：問${who.name}（答應機率 ${Math.round(p * 100)}%）→ ${yes ? "答應" : "拒絕"}`);
  body.innerHTML = `<div class="swp-pick"><div class="swp-big swp-wf" hidden></div>
    <div class="swp-card swp-me" style="cursor:default;background:#8de07f!important;align-self:flex-end;width:auto;max-width:85%"><div class="swp-p" style="margin:0">${esc(SPEAK)}</div></div>
    <div class="swp-card swp-her" style="cursor:default"><div class="swp-nm">${esc(who.name)}</div><div class="swp-p swp-line" style="min-height:2.6em;color:#8a92a0">（想了一下）……</div></div>
    <div class="swp-p swp-odds" style="color:#8a92a0;font-size:12px">答應機率 ${Math.round(p * 100)}%（忠誠 ${who.stats?.loyalty ?? 60}・感情 ${who.stats?.affection ?? 60}・飢渴 ${Math.round(hunger)}・${esc(fam)}）</div></div>
    <div class="swp-act" hidden></div>`;
  api.state().then((S) => { const u = (S.images?.[who.id] || {})["wife~" + (yes ? "shy" : "normal")]?.cut || (S.images?.[who.id] || {})["wife~normal"]?.cut; if (u) { const f = body.querySelector(".swp-wf"); f.innerHTML = `<figure><img alt="" src="${esc(u)}"></figure>`; f.hidden = false; } }).catch(() => {});
  const fallback = (yes ? ACT_OK : ACT_NO)[fam] + (yes ? OK : NO)[fam];
  const ask = yes
    ? "（你老公問你：要不要跟另一對夫妻四個人一起約會、交換伴侶——你陪對方的丈夫，他陪對方的妻子。你答應了，但心情複雜。用「（動作）台詞」的格式只寫一句：括號裡是你的動作神情，後面是你對他說的話。）"
    : "（你老公問你：要不要跟另一對夫妻四個人一起約會、交換伴侶——你陪對方的丈夫，他陪對方的妻子。你拒絕了。用「（動作）台詞」的格式只寫一句：括號裡是你的動作神情，後面是你拒絕他的話。）";
  (async () => {
    let line = "";
    try { line = actLine(ctx.say ? await ctx.say(who, ask, fallback) : fallback, (yes ? ACT_OK : ACT_NO)[fam]); } catch { /* 用句庫 */ }
    line = line || fallback;
    const el = body.querySelector(".swp-line"); el.style.color = "#1d2330"; el.textContent = "";
    for (const ch of line) { el.textContent += ch; await new Promise((r) => setTimeout(r, 38)); }
    const act = body.querySelector(".swp-act"); act.hidden = false;
    if (yes) {
      act.innerHTML = `<button type="button" class="pri go">她答應了，去找夫妻</button>`;
      act.querySelector(".go").addEventListener("click", () => { ov.remove(); openSwapSelect(ctx); });
    } else {
      act.innerHTML = `<button type="button" class="back">她拒絕了（結束）</button>`;
      act.querySelector(".back").addEventListener("click", () => ov.remove());
    }
  })();
  return ov;
}

// ------------------------------------------------------------ 開車去約會：黑畫面＋生 6 張立繪（2026-10-21）
/** 老婆／對方丈夫／對方妻子 × 一般／害羞。已經存過的那張就不重生（沒有的才生）；失敗就跳過（酒吧用名字卡）。
 * ctx.genPortrait 可以換掉生圖（測試用）。回最新的 S。 */
const PORTRAIT_TAG_KEY = "yorozuya.swap.portraitOutfit";
const portraitTag = (owner, ch, ex) => { try { return (JSON.parse(localStorage.getItem(PORTRAIT_TAG_KEY) || "{}") || {})[`${owner}|${ch}~${ex}`] || ""; } catch { return ""; } };
const setPortraitTag = (owner, ch, ex, v) => { try { const m = JSON.parse(localStorage.getItem(PORTRAIT_TAG_KEY) || "{}") || {}; m[`${owner}|${ch}~${ex}`] = v; localStorage.setItem(PORTRAIT_TAG_KEY, JSON.stringify(m)); } catch { /* */ } };
export async function openSwapDrive(ctx = {}, c, S = {}) {
  const ov = document.createElement("div"); ov.id = "swp-drive";
  ov.style.cssText = "position:fixed;inset:0;z-index:8800;background:#000;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font:600 17px system-ui,sans-serif";
  ov.innerHTML = `<div><span class="ttl">正在驅車前往約會場地</span><span class="d" style="display:inline-block;width:1.6em;text-align:left"></span></div><div class="n" style="font:400 13px system-ui,sans-serif;color:#888"></div>`;
  document.body.append(ov);
  let k = 0; const dots = setInterval(() => { ov.querySelector(".d").textContent = ".".repeat(k++ % 4); }, 400);
  const wife = ctx.girl?.() || null, gen = ctx.genPortrait || genPortrait;
  // pt260u：標題一開始就對（以前先顯示「約會場地」）；旅館房間↔浴室＝用走的，進旅館時已經全產過 → 不再生任何圖、不卡黑畫面
  const scene = ctx.scene || "park";
  const dest = FLOW_ZH[scene] || "約會場地";
  const hotelGo = String(scene).startsWith("hotel");
  const ttl = ov.querySelector(".ttl");
  if (ttl) ttl.textContent = ctx.walk ? `正在移動到${dest}` : hotelGo ? "正在驅車前往旅館（房間＋浴室的圖一次準備好）" : `正在驅車前往${dest}`;
  if (ctx.walk && hotelGo) { await new Promise((r) => setTimeout(r, 600)); clearInterval(dots); ov.remove(); return S; }
  const jobs = [];
  for (const ch of ["wife", "husband", "other"]) for (const ex of hotelGo ? ["normal", "shy", "nude", ...(ch === "other" ? ["climax", "creampie"] : [])] : ["normal", "shy"]) {   // pt283u：對方妻子多兩張做愛後全身立繪
    const owner = ch === "wife" ? wife?.id : c.id;
    if (!owner) continue;
    // 2026-10-24：妻子立繪記下「用哪套外出服生的」——換了衣服（或舊版沒記錄＝當時穿 T 恤／內衣）就重生
    const want = ch === "husband" || ex === "nude" || ex === "climax" || ex === "creampie" ? "" : dateOutfitOf(ch === "wife" ? wife : c.wife, ch === "wife" ? "wife" : "other");
    if ((S.images?.[owner] || {})[`${ch}~${ex}`]?.cut && (!want || portraitTag(owner, ch, ex) === want)) continue;   // 已經有了：沿用
    jobs.push([ch, ex, owner, want]);
  }
  let done = 0, fail = 0;
  const n = ov.querySelector(".n"), tick = () => { n.textContent = jobs.length ? `準備立繪 ${done}/${jobs.length}${fail ? `（失敗 ${fail}）` : ""}` : ""; };
  tick();
  for (const [ch, ex, owner, want] of jobs) {   // 一張一張來（Comfy 排隊一樣是一張一張）
    try { const imgs = await gen(ch, ex, wife, c, S, () => {}); if (imgs) { S = { ...S, images: imgs }; if (want) setPortraitTag(owner, ch, ex, want); } }
    catch (e) { fail++; ctx.debug?.(`換妻：立繪 ${ch}・${ex} 失敗：${e?.message || e}`); }
    done++; tick();
  }
  // 依場景預產：KTV／飯店的動作圖＋你老婆×對方丈夫雙人圖（缺的才生）
  let sess = {}; try { sess = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}") || {}; } catch { /* */ }
  const watchHotel = String(scene).startsWith("hotel") && hotelMode(sess) === "watch";   // 只能看：不用你的動作圖
  if ((scene === "bar" || scene === "ktv" || String(scene).startsWith("hotel")) && !watchHotel) {
    const { pregenTease } = await import("./swap_tease.js?v=12");
    S = await pregenTease(c, scene, S, { debug: (m) => ctx.debug?.(m), onTick: (d, t, f) => { n.textContent = t ? `準備動作 ${d}/${t}${f ? `（失敗 ${f}）` : ""}` : ""; } }).catch((e) => { ctx.debug?.(`換妻：動作預產失敗 ${e?.message || e}`); return S; });
  }
  if ((scene === "bar" || scene === "ktv" || String(scene).startsWith("hotel")) && wife) {
    try {
      const pair = await import("./swap_pair_gen.js?v=28");
      const slots = pairSlotsFor(scene, pair.PAIR_ACTS, pair.PAIR_FRAMES, pair.PAIR_EJAC);
      const have = S.images?.[pair.pairOwner(wife, c)] || {};
      // 2026-10-24：半身舊圖不算；第 1 格要重生的話第 2 格也跟著重生（同 seed）
      const miss = slots.filter((k) => !pair.pairCut(have, k) || (/~2$/.test(k) && !pair.pairCut(have, k.replace(/~2$/, "~1"))));
      const runSeeds = {};
      let d = 0, f = 0;
      for (const slot of miss) {
        n.textContent = `準備雙人圖 ${++d}/${miss.length}${f ? `（失敗 ${f}）` : ""}`;
        try {
          // genPair 回 { images, sec, how, seed }——以前把整包當 images 塞進 S，立繪全部不見（2026-10-24 修）
          const { act, frame } = pair.slotOf(slot);
          const r = await pair.genPair(slot, wife, c, (m) => ctx.debug?.(`換妻：雙人 ${slot} ${m}`), pair.seedFor(slot, S.images?.[pair.pairOwner(wife, c)] || {}, runSeeds));
          if (frame === 1 && r?.seed) runSeeds[act] = r.seed;   // 第 2 格沿用這個 seed
          if (r?.images && typeof r.images === "object") S = { ...S, images: r.images };
        } catch (e) { f++; ctx.debug?.(`換妻：雙人圖 ${slot} 失敗：${e?.message || e}`); }
      }
    } catch (e) { ctx.debug?.(`換妻：雙人預產失敗 ${e?.message || e}`); }
  }
  clearInterval(dots); ov.remove();
  return S;
}

/** 整段約會：公園 → 酒吧 →（配對）→ KTV → 飯店。每一場結束靠 openBar 的 onEnd。 */
export async function playSwapDate(ctx = {}, c, S = {}, startScene = "park") {
  let scene = startScene || "park", walk = false;
  while (scene) {
    const together = ctx.together ?? (scene === "park" || scene === "bar" || scene === "ktv");
    S = await openSwapDrive({ ...ctx, scene, walk: !!walk }, c, S);
    const result = await new Promise((resolve) => {
      openBar({ ...ctx, scene, together, onEnd: resolve }, c, S);
    });
    if (result?.S?.images) S = { ...S, images: result.S.images };
    if (result?.kind === "advance" && result.next) {
      walk = String(scene).startsWith("hotel") && String(result.next).startsWith("hotel");
      scene = result.next;
      ctx.debug?.(`換妻：前進 → ${FLOW_ZH[scene] || scene}`);
      continue;
    }
    // leave / end：回到平常遊戲
    ctx.debug?.(`換妻：約會結束（${result?.kind || "?"} ${result?.title || result?.who || ""}）`);
    break;
  }
  return S;
}

// ------------------------------------------------------------ 第一個場景：酒吧（2026-10-21；還沒有對話／提議）
/** 全螢幕酒吧背景（bar1–3 隨機）＋VN 舞台：對方丈夫、對方妻子、你老婆（沒立繪＝名字卡）。玩家第一人稱不畫。 */
/** 酒吧（2026-10-22 v2）：版面／CD／卡牌／醉度都在 swap_bar.js。 */
export function openSwapBar(ctx = {}, c, S = {}) { return openBar(ctx, c, S); }

/** 聊天觸發（2026-10-21）：玩家打字提換妻。 */
export const SWAP_ASK_RE = /換妻|交換伴侶|交換夫妻|交換老婆|換老婆|夫妻交換|互換老婆/;
export function isSwapAsk(text) { return SWAP_ASK_RE.test(String(text || "")); }
/** 擲她答不答應，回 { p, yes, fam, ask（給 AI 的指示）, fallback, act（補動作用） }。 */
export function swapDecide(who, { mood = null, hunger = 0 } = {}) {
  const fam = (() => { try { return familyOf(who); } catch { return "溫柔"; } })();
  const p = swapAskChance(who, { mood, hunger }), yes = Math.random() < p, act = (yes ? ACT_OK : ACT_NO)[fam];
  const ask = `（你老公問你要不要跟另一對夫妻四個人一起約會、交換伴侶——你陪對方的丈夫，他陪對方的妻子。你${yes ? "答應了，但心情複雜" : "拒絕了"}。用「（動作）台詞」的格式只寫一句：括號裡是你的動作神情，後面是你${yes ? "" : "拒絕"}對他說的話。）`;
  return { p, yes, fam, ask, fallback: act + (yes ? OK : NO)[fam], act };
}
