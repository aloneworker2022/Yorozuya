/* 2026-10-21 換妻 step：「開始換妻」→ 選一對夫妻（樣式跟日租選客人一樣）→ 確認 → 存成目前的換妻場次，顯示「下一步：問妻子」。
 * 名冊＝伺服器存的對方夫妻（/api/swap/cafe 的 couples，當熟客一直留著），不足 4 對就新抽（各自不同的 Comfy 模型）。
 * 2026-10-21 改順序：先問妻子（openSwapStart，照日租「拜託她」），她答應才開名冊。還沒做：扣錢、場景。場次先存在 localStorage（SESSION_KEY），不用重啟伺服器。 */
import { api, BZH, pickBackdrop, genPortrait, rollCouple, rollCkpts, usableCkpts, ensureSwapMeta } from "./swap_cafe_gen.js?v=11";
import { askChanceFor, canRental, stageKeyOf } from "./rental.js?v=7";
import { familyOf } from "./girl_voice.js?v=1";
import { openBar } from "./swap_bar.js?v=3";

export const SESSION_KEY = "yorozuya.swap.session";
const ROSTER_MIN = 4;
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
const hLooks = (h) => `體型${BZH[h.build] || h.build || "普通"}`;
const wLooks = (w) => [w.look?.hair, w.look?.build, w.look?.cup && `${w.look.cup}罩杯`, w.look?.height_cm && `${w.look.height_cm}cm`, w.look?.style].filter(Boolean).join("・");
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

/** 讀名冊；舊夫妻補類型／價錢／模型，不足 ROSTER_MIN 對就新抽並存（不動面板原本選的那對）。 */
export async function loadRoster() {
  let S = await api.state();
  const keep = S.current, ck = await usableCkpts();
  const save = async (c) => { S = await api.put("couple", { couple: c }); };
  for (const c of Object.values(S.couples)) {
    const a = ensureSwapMeta(c), b = ck.length && (!c.husband?.ckpt || !c.wife?.ckpt) ? (rollCkpts(c, ck), true) : false;
    if (a || b) await save(c);
  }
  while (Object.keys(S.couples).length < ROSTER_MIN) { const c = rollCouple(); rollCkpts(c, ck); await save(c); await new Promise((r) => setTimeout(r, 3)); }
  if (keep && S.current !== keep && S.couples[keep]) await save(S.couples[keep]);
  return S;
}

export function openSwapSelect(ctx = {}) {
  if (!document.getElementById("swp-css")) { const s = document.createElement("style"); s.id = "swp-css"; s.textContent = CSS; document.head.append(s); }
  document.getElementById("swp-ov")?.remove();
  const ov = document.createElement("div"); ov.className = "swp-ov"; ov.id = "swp-ov";
  ov.innerHTML = `<div class="swp-hd"><b></b><button type="button" aria-label="關閉">×</button></div><div class="swp-body" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>`;
  ov.querySelector(".swp-hd button").addEventListener("click", () => ov.remove());
  document.body.append(ov);
  const title = (t) => { ov.querySelector(".swp-hd b").textContent = t; }, body = ov.querySelector(".swp-body");
  let S = null;
  const roster = () => {
    title("換妻・今天的夫妻（選一對）");
    const list = document.createElement("div"); list.className = "swp-pick";
    const cs = Object.values(S.couples).sort((a, b) => (b.at || 0) - (a.at || 0));
    for (const c of cs) {
      const h = c.husband, w = c.wife, b = document.createElement("button");
      b.type = "button"; b.className = "swp-card"; b.dataset.couple = c.id;
      b.innerHTML = `<div class="swp-top"><span class="swp-nm">${esc(h.name)} ＆ ${esc(w.name)}</span><span class="pr">${h.swapPrice} 金</span></div>
        <div class="swp-p">丈夫 ${esc(h.age)} 歲・妻子 ${esc(w.age)} 歲</div>`;
      b.addEventListener("click", () => confirm(c));
      list.append(b);
    }
    body.replaceChildren(list);
  };
  const big = (S, c) => {
    const f = [["husband", c.husband.name], ["other", c.wife.name]].filter(([k]) => faceUrl(S, c, k)).map(([k, n]) => `<figure>${face(S, c, k)}<figcaption>${esc(n)}</figcaption></figure>`).join("");
    return f ? `<div class="swp-big">${f}</div>` : "";
  };
  const confirm = (c) => {
    const h = c.husband, w = c.wife;
    title(`${h.name} ＆ ${w.name}`);
    body.innerHTML = `<div class="swp-pick"><div class="swp-card" style="cursor:default">
      <div class="swp-p"><b>丈夫・${esc(h.name)}</b> ${esc(h.age)} 歲</div>
      <div class="swp-p"><b>妻子・${esc(w.name)}</b> ${esc(w.age)} 歲</div>
      <div class="swp-p"><b>費用</b> ${h.swapPrice} 金</div></div></div>
      <div class="swp-act"><button type="button" class="back">返回</button><button type="button" class="pri go">選這對</button></div>`;
    body.querySelector(".back").addEventListener("click", roster);
    body.querySelector(".go").addEventListener("click", () => {
      const sess = { coupleId: c.id, price: h.swapPrice, at: Date.now(), phase: "bar", wifeId: ctx.girl?.()?.id || "", wifeAgreed: true };
      localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      ctx.debug?.(`換妻：選了 ${h.name} ＆ ${w.name}（${h.swapPrice} 金）→ 酒吧`);
      ov.remove(); void openSwapDrive(ctx, c, S).then((S2) => openSwapBar(ctx, c, S2));
    });
  };
  body.innerHTML = `<div class="swp-next">讀取名冊中…</div>`;
  loadRoster().then((s) => { S = s; roster(); }).catch((e) => { body.innerHTML = `<div class="swp-next">${esc(e?.message || e)}</div>`; });
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
export async function openSwapDrive(ctx = {}, c, S = {}) {
  const ov = document.createElement("div"); ov.id = "swp-drive";
  ov.style.cssText = "position:fixed;inset:0;z-index:8800;background:#000;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font:600 17px system-ui,sans-serif";
  ov.innerHTML = `<div>正在驅車前往約會場地<span class="d" style="display:inline-block;width:1.6em;text-align:left"></span></div><div class="n" style="font:400 13px system-ui,sans-serif;color:#888"></div>`;
  document.body.append(ov);
  let k = 0; const dots = setInterval(() => { ov.querySelector(".d").textContent = ".".repeat(k++ % 4); }, 400);
  const wife = ctx.girl?.() || null, gen = ctx.genPortrait || genPortrait;
  const jobs = [];
  for (const ch of ["wife", "husband", "other"]) for (const ex of ["normal", "shy"]) {
    const owner = ch === "wife" ? wife?.id : c.id;
    if (!owner) continue;
    if ((S.images?.[owner] || {})[`${ch}~${ex}`]?.cut) continue;   // 已經有了：沿用
    jobs.push([ch, ex, owner]);
  }
  let done = 0, fail = 0;
  const n = ov.querySelector(".n"), tick = () => { n.textContent = jobs.length ? `${done}/${jobs.length}${fail ? `（失敗 ${fail}）` : ""}` : ""; };
  tick();
  for (const [ch, ex] of jobs) {   // 一張一張來（Comfy 排隊一樣是一張一張）
    try { const imgs = await gen(ch, ex, wife, c, S, () => {}); if (imgs) S = { ...S, images: imgs }; }
    catch (e) { fail++; ctx.debug?.(`換妻：立繪 ${ch}・${ex} 失敗：${e?.message || e}`); }
    done++; tick();
  }
  clearInterval(dots); ov.remove();
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
