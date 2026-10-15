/* 日租女友畫面（2026-10-13）：選客人 → 行程 → 約會中（雙邊 LINE＋時鐘＋決定）→ 旅館（在場／門外）→ 回家結算。
 * 規則全在 rental.js；這裡只管畫面和時間。房間那邊（test_room_summon.js）用 createRental(api) 接上：
 * api：{ who(), inRoom(), say(who, ask, fallback) → Promise<string>, typeLine(name, text), goOut(who), comeBack(who),
 *        gold(), earn(n, why), hunger(who), mood(who), applyEffects(who, eff), persist(), debug(msg), peek(opts), ai?(kind, ctx) → Promise<string> }
 * 她的約會存在 who.rentalMine.active（關掉 App 再開照時間接著走；決定點會停住）。 */
import * as R from "./rental.js?v=7";
import { openEntry, openRoom, hasRoom } from "./rental_entry.js?v=11";
import * as L from "./rental_lines.js?v=7";
import { familyOf } from "./girl_voice.js?v=1";

const BUILD_ZH = { average: "普通", slim: "瘦", muscular: "壯", fat: "胖", tall: "高", short: "矮", old: "中年" };
const POSE_FOR = { kiss: "kiss", oral: "kiss", sex: ["missionary", "doggy", "cowgirl", "reverse"] };
const CSS = `
.rgf-ov{position:fixed;inset:0;z-index:8600;background:#e9edf2;display:flex;flex-direction:column;font:15px/1.45 system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#1d2330}
.rgf-ov[hidden],.rgf-ov [hidden]{display:none!important}
.rgf-ov button{font:inherit;box-shadow:none;text-shadow:none;image-rendering:auto;min-height:0;letter-spacing:0;transform:none;cursor:pointer}
.rgf-ov button::before,.rgf-ov button::after{content:none}
.rgf-hd{background:#06c755;color:#fff;padding:10px 14px 8px;display:flex;align-items:center;gap:10px}
.rgf-hd b{font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rgf-hd button{background:none!important;border:0!important;outline:0;box-shadow:none!important;color:#fff;font-size:24px;line-height:1;padding:2px 6px;width:auto}
.rgf-clock{background:#05a647;color:#eafff1;padding:4px 14px;font-size:13px;display:flex;gap:10px;align-items:center}
.rgf-clock .bar{flex:1;height:5px;background:#0b8a3d;border-radius:3px;overflow:hidden}.rgf-clock .bar i{display:block;height:100%;background:#bff5d3}
.rgf-list{flex:1;overflow-y:auto;background:#fff}
.rgf-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px!important;border:0!important;border-bottom:1px solid #eef1f4!important;border-radius:0!important;background:#fff!important;text-align:left;color:#1d2330}
.rgf-av{flex:none;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#fff}
.rgf-row .mid{flex:1;min-width:0}.rgf-row .nm{font-weight:700;font-size:15px}.rgf-row .pv{color:#7a8291;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rgf-row .rt{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:11px;color:#9aa1ad}
.rgf-row .ub{background:#06c755;color:#fff;border-radius:10px;padding:0 6px;font-size:11px;min-width:18px;text-align:center}
.rgf-back{font-size:26px!important}
.rgf-msgs{flex:1;overflow-y:auto;padding:12px 12px 4px;display:flex;flex-direction:column;gap:8px}
.rgf-m{max-width:78%;padding:7px 11px;border-radius:16px;background:#fff;align-self:flex-start;box-shadow:0 1px 1px rgba(0,0,0,.06);word-break:break-word}
.rgf-m.me{align-self:flex-end;background:#8de07f}
.rgf-m small{display:block;font-size:10px;color:#8a92a0;margin-top:2px}
.rgf-sys{align-self:center;font-size:12px;color:#6b7383;background:rgba(0,0,0,.06);padding:3px 10px;border-radius:10px}
.rgf-in{display:flex;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #d5dbe3}
.rgf-in input{flex:1;min-width:0;border:1px solid #d5dbe3;border-radius:18px;padding:8px 12px;font-size:15px}
.rgf-in button{border:0!important;background:#06c755!important;color:#fff;border-radius:18px;padding:0 14px;font-size:14px}
.rgf-act{display:flex;gap:8px;padding:6px 10px;background:#f7f9fb;border-top:1px solid #e3e7ec;flex-wrap:wrap}
.rgf-act button{flex:1;min-width:120px;border:1px solid #06c755!important;background:#fff!important;color:#05a647;border-radius:10px;padding:8px;font-size:14px}
.rgf-modal{position:absolute;inset:0;background:rgba(10,15,25,.5);display:flex;align-items:flex-end}
.rgf-sheet{background:#fff;width:100%;border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px}
.rgf-sheet h3{margin:0;font-size:16px}.rgf-sheet p{margin:0;color:#4b5363;font-size:14px}
.rgf-sheet button{border:0!important;border-radius:12px!important;padding:12px;font-size:15px;background:#eef2f6!important;color:#1d2330;text-align:left;width:100%}
.rgf-sheet button.pri{background:#06c755!important;color:#fff}
.rgf-sheet button small{display:block;color:inherit;opacity:.75;font-size:12px}
.rgf-pick{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.rgf-card{background:#fff!important;border-radius:14px!important;padding:12px 14px;border:2px solid transparent!important;width:100%;text-align:left;font:inherit;color:inherit;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.rgf-card:active{border-color:#06c755}
.rgf-card .nm{font-weight:700;font-size:16px}.rgf-card .tg{display:inline-block;font-size:12px;background:#eef2f6;border-radius:8px;padding:1px 7px;margin:4px 4px 0 0}
.rgf-card .reg{background:#ffe9a8;color:#7a5600}.rgf-card q{display:block;color:#5b6475;font-size:13px;margin-top:6px}
.rgf-rcpt{background:#fff;border-radius:14px;padding:14px;margin:14px;display:flex;flex-direction:column;gap:6px}
.rgf-rcpt div{display:flex;justify-content:space-between}.rgf-rcpt .tot{border-top:1px dashed #c9d0da;padding-top:6px;font-weight:700}
.rgf-chip{position:fixed;left:50%;top:calc(8px + env(safe-area-inset-top));transform:translateX(-50%)!important;z-index:8400;background:#06c755!important;color:#fff!important;border:0!important;border-radius:18px!important;box-shadow:0 2px 8px rgba(0,0,0,.25)!important;
  padding:6px 14px;font:600 13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);max-width:92vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rgf-chip .dot{background:#ff3b30;border-radius:8px;padding:0 5px;margin-left:6px;font-size:11px}`;

export function createRental(api) {
  if (!document.getElementById("rgf-css")) { const s = document.createElement("style"); s.id = "rgf-css"; s.textContent = CSS; document.head.append(s); }
  let ov = null, tab = "wife", view = "list", timer = 0, scene = null;   // view：list（聊天列表）／chat（點進某個人）
  const mineOf = (who) => { who.rentalMine = who.rentalMine && typeof who.rentalMine === "object" ? who.rentalMine : {}; return who.rentalMine; };
  const active = (who = api.who()) => who?.rentalMine?.active || null;
  const famOf = (who) => { try { return familyOf(who); } catch { return "溫柔"; } };

  // ------------------------------------------------------------ 拜託她
  function canAsk(who = api.who()) {
    if (!who || !api.inRoom() || !R.canRental(who) || active(who)) return false;
    return R.limitOk(mineOf(who), Date.now()).ok;
  }
  async function ask() {
    const who = api.who();
    if (!canAsk(who)) return;
    const p = R.askChanceFor(who, api.mood(who)), yes = Math.random() < p;
    api.debug(`日租女友：拜託她（答應機率 ${Math.round(p * 100)}%）→ ${yes ? "答應" : "拒絕"}`);
    if (!yes) {
      mineOf(who).askCoolUntil = Date.now() + R.ASK_COOL_MS;
      const no = { 冷淡: "今天不想。", 溫柔: "……今天可以不要嗎？", 熱絡: "今天好累喔，改天啦～", 佔有: "我只想陪你，不要。", 反差: "不、不要啦……今天不行。" }[famOf(who)];
      api.persist();
      await api.typeLine(who.name, await api.say(who, "（他請你去當一天的日租女友陪別的男人約會，你今天不想去。只寫你拒絕他的一句話，不要旁白。）", no));
      return;
    }
    const okLine = { 冷淡: "……知道了，我去。", 溫柔: "好……我去。你不要胡思亂想喔。", 熱絡: "好啊！我去賺錢回來～", 佔有: "……為了你我才去的，記住。", 反差: "嗯……我、我去就是了。" }[famOf(who)];
    await api.typeLine(who.name, await api.say(who, "（他請你去當一天的日租女友，陪客人吃飯逛街約會，你答應了。只寫你答應他的一句話，不要旁白。）", okLine));
    openPicker(who);
  }

  // ------------------------------------------------------------ 選客人
  function shell(title) {
    close();
    ov = document.createElement("div");
    ov.className = "rgf-ov"; ov.id = "rgf-ov";
    ov.innerHTML = `<div class="rgf-hd"><b></b><button type="button" aria-label="關閉">×</button></div>`;
    ov.querySelector("b").textContent = title;
    ov.querySelector(".rgf-hd button").addEventListener("click", close);
    document.body.append(ov);
    return ov;
  }
  function openPicker(who) {
    const mine = mineOf(who);
    mine.offer = mine.offer && Date.now() - mine.offer.at < 3600e3 ? mine.offer : { at: Date.now(), clients: R.rollClients(mine.regulars || [], Date.now()) };
    api.persist();
    const el = shell("今天的客人（選一位）"), list = document.createElement("div");
    list.className = "rgf-pick";
    for (const c of mine.offer.clients) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "rgf-card"; b.dataset.client = c.id;
      const star = "★".repeat(c.skill) + "☆".repeat(5 - c.skill);
      b.innerHTML = `<div class="nm"></div><span class="tg"></span><span class="tg"></span><span class="tg"></span>${c.regular ? '<span class="tg reg">熟客・收入雙倍</span>' : ""}`;
      b.querySelector(".nm").textContent = `${c.name}　${c.age} 歲`;
      const tg = b.querySelectorAll(".tg");
      tg[0].textContent = L.PERSONA_ZH[c.persona]; tg[1].textContent = `手腕 ${star}`; tg[2].textContent = `體型 ${BUILD_ZH[c.build] || ""}`;
      b.addEventListener("click", () => start(who, c));
      list.append(b);
    }
    el.append(list);
  }

  // ------------------------------------------------------------ 出發
  function start(who, client) {
    if (active(who)) return;
    const mine = mineOf(who), now = Date.now();
    const date = R.planDate({ who, client, hunger: api.hunger(who), mood: api.mood(who), now });   // 骨架；場景互動到了才擲
    date.chat = { wife: [], client: [] }; date.seen = {}; date.unread = { wife: 0, client: 0 }; date.honesty = R.honesty(who).level;
    mine.active = date; mine.offer = null;
    mine.starts = [...(mine.starts || []).filter((t) => now - t < 2 * R.DAY_MS), now].slice(-6);
    api.debug(`日租女友：客人 ${client.name}（${L.PERSONA_ZH[client.persona]}・手腕 ${client.skill}${client.regular ? "・熟客" : ""}），行程 ${date.spots.map((s) => R.SPOTS[s.key].zh).join("→")}`);
    api.goOut(who);
    api.persist();
    view = "list";
    openPanel();
    tick();
  }

  // ------------------------------------------------------------ 約會中：LINE 面板
  /** at：這則訊息「該發生」的遊戲時間（AI 晚回來也照這個時間插進去，順序不會亂）；沒給就是現在。 */
  function push(date, side, from, text, at = null) {
    if (!text) return;
    const t = Math.round((at ?? R.elapsedHours(date)) * 100) / 100, list = date.chat[side];
    let k = list.length;
    while (k > 0 && list[k - 1].at > t) k--;
    list.splice(k, 0, { from, text, at: t });
    if (from === "them" && !(ov && ov.dataset.open === side)) date.unread[side] = (date.unread[side] || 0) + 1;
  }
  async function line(date, side, kind, ctx, fallback) {
    if (api.ai) {
      try { const t = await Promise.race([api.ai(kind, { ...ctx, date, side }), new Promise((r) => setTimeout(() => r(""), 22000))]); if (t) return t; } catch { /* 句庫 */ }
    }
    return fallback;
  }
  function emit(who, date, ev) {
    const fam = famOf(who), lvl = date.hotel?.result ? R.honesty(who, date.hotel.result).level : date.honesty;
    if (ev.kind === "cr") push(date, "client", "them", L.clientRefusedLine(date, ev.i, ev.j), ev.at);
    else if (ev.kind === "ino") push(date, "client", "them", L.clientInviteNoLine(date, ev.i), ev.at);
    else if (ev.kind === "cs") void line(date, "client", "spot", { i: ev.i }, L.clientSpotLine(date, ev.i)).then((t) => { push(date, "client", "them", t, ev.at); render(); api.persist(); });
    else if (ev.kind === "ws") void line(date, "wife", "spot", { i: ev.i, level: lvl }, L.wifeSpotLine(date, ev.i, { level: lvl, family: fam })).then((t) => { push(date, "wife", "them", t, ev.at); render(); api.persist(); });
    else if (ev.kind === "bye") push(date, "client", "them", L.clientByeLine(date));
    else if (ev.kind === "wh") push(date, "wife", "them", L.wifeHotelLine(date, lvl));
    else if (ev.kind === "hd") {
      const t = L.clientHotelDone(date);
      if (/射|做了/.test(t)) date.bragged = t;
      push(date, "client", "them", t);
    } else if (ev.kind === "end") finish(who);
  }
  function tick() {
    const who = api.who(), date = active(who);
    clearTimeout(timer);
    if (!who || !date) { renderChip(); return; }
    const now = Date.now();
    if (R.advance(date, R.elapsedHours(date, now))) {   // 到了的場景擲互動、到了就擲邀請（把 LINE 的鼓勵／勸阻算進去）
      if (date.invite.resolved && !date._inviteLogged) { date._inviteLogged = 1; api.debug(`日租女友：邀請去休息 ${Math.round(date.invite.p * 100)}% → ${date.invite.yes ? "答應" : "沒答應"}${date.invite.mid ? "（中途，後面行程取消）" : ""}`); }
      api.persist();
    }
    const dec = R.dueDecision(date, now);
    if (dec) { R.pauseAtDecision(date, dec); askDecision(who, date, dec); }
    const e = R.elapsedHours(date, now);
    for (const ev of R.timeline(date)) {
      if (ev.decide || date.seen[ev.id] || ev.at > e + 1e-9) continue;
      date.seen[ev.id] = 1;
      emit(who, date, ev);
      if (!active(who)) return;
    }
    render(); renderChip();
    timer = setTimeout(tick, 1000);
  }
  function askDecision(who, date, ev) {
    if (!ov || ov.dataset.kind !== "date") openPanel();
    if (ov.querySelector(".rgf-modal")) return;
    tab = "client"; view = "chat"; render();
    const m = document.createElement("div");
    m.className = "rgf-modal";
    const sheet = document.createElement("div");
    sheet.className = "rgf-sheet";
    m.append(sheet); ov.append(m);
    const btn = (label, sub, fn, pri = false) => {
      const b = document.createElement("button"); b.type = "button"; if (pri) b.className = "pri";
      b.innerHTML = `<span></span><small></small>`; b.firstChild.textContent = label; b.lastChild.textContent = sub || "";
      b.addEventListener("click", () => { fn(); }); sheet.append(b);
    };
    const done = () => { m.remove(); api.persist(); render(); tick(); };
    if (ev.kind === "ext") {
      const ask = L.clientExtLine(date, ev.i);
      if (!date.seen[`${ev.id}:ask`]) { date.seen[`${ev.id}:ask`] = 1; push(date, "client", "them", ask); }
      sheet.insertAdjacentHTML("afterbegin", `<h3></h3><p>時間暫停中</p>`); sheet.querySelector("h3").textContent = ask;
      btn("同意延長", `+${R.EXT_PAY} 金・多 1 小時`, () => { R.decide(date, ev.id, true); push(date, "client", "me", "好，可以。"); push(date, "client", "them", L.clientExtReply(date, true)); done(); }, true);
      btn("拒絕", "照原定時間（評價可能下降）", () => { R.decide(date, ev.id, false); push(date, "client", "me", "抱歉，今天時間就到這裡。"); push(date, "client", "them", L.clientExtReply(date, false)); done(); });
      return;
    }
    // 去休息：客人只是告知（她已經答應了）；玩家只能選開車送／付房錢／在場或門外
    const note = L.clientInviteLine(date), stay = date.invite.stay;
    if (!date.seen["invite:ask"]) { date.seen["invite:ask"] = 1; push(date, "client", "them", note); }
    sheet.insertAdjacentHTML("afterbegin", `<h3></h3><p>她已經答應了。你能做的只有……</p>`); sheet.querySelector("h3").textContent = note;
    const fee = R.ROOM_FEE[stay];
    const choose = (v) => {   // v：{ drive, paidRoom, presence, venue?, room? }
      R.decide(date, "invite", v);
      date.hotel.result = R.rollHotel({ who, client: date.client, hunger: api.hunger(who), stay, presence: date.hotel.presence });
      api.debug(`日租女友：旅館（${stay === "stay" ? "住宿" : "休息"}・${{ in: "在場", door: "門外", away: "沒開車" }[date.hotel.presence]}）→ ${R.hotelText(date.hotel.result)}`);
      if (v.paidRoom) { api.earn(-fee, "日租女友房錢"); push(date, "client", "them", "房錢您付了？謝啦。"); }
      push(date, "client", "me", v.drive ? "我開車送你們。" : "……知道了。");
      done();
      if (date.hotel.presence === "in" && hasRoom(v?.venue)) {
        // 2026-10-15：進去先看到房間（目前只有日式主臥室）；白天／晚上照約會時鐘
        const h = R.where(date).hour % 24;
        openRoom({ venue: v.venue, room: v.room, night: h >= 18 || h < 6, clientName: date.client.name, look: who.look || {}, doll: window.RoomDoll?.lookToDoll(who.look || null) || null,
          onContinue: () => openScene(who, date) });
      } else if (date.hotel.presence !== "away") openScene(who, date);
    };
    // 2026-10-15：開車送到了 → 直接站在旅館玄關（日式拉門／旅館房門／汽車旅館車庫），在玄關決定進不進去。
    // 時鐘在玄關時還停著（decide 之後才走）。
    const step2 = (paid) => {
      m.style.display = "none";   // 先藏著（不拿掉：計時器看到沒有決定框會再開一個），選完 done() 才移除
      const v = R.venueOf(date);
      api.debug(`日租女友：到了旅館玄關（${R.VENUES[v.key].zh}・${v.room}）`);
      openEntry({ venue: v.key, room: v.room, venues: R.VENUES, stayZh: stay === "stay" ? "住宿一晚" : "休息", clientName: date.client.name,
        onChoose: (presence) => choose({ drive: true, paidRoom: paid, presence, venue: v.key, room: v.room }) });
    };
    const step1 = () => {
      sheet.innerHTML = `<h3>開車送他們？</h3><p>${stay === "stay" ? "住宿一晚" : "休息 3 小時"}</p>`;
      btn(`付房錢（−${fee} 金）`, "你出錢讓他們開房間", () => step2(true), true);
      btn("不付，客人自己付", "", () => step2(false));
    };
    btn("開車送他們去", `司機 +${R.DRIVER_TIP} 金；可以跟進去或在門外等`, step1, true);
    btn("不送，在家等", "他們自己去；你不知道是哪間旅館", () => choose({ drive: false }));
  }
  function openScene(who, date) {
    const h = date.hotel;
    if (!h?.result || h.presence === "away") return;
    const lv = h.result.level, pool = POSE_FOR[lv], pose = Array.isArray(pool) ? pool[Math.floor(Math.random() * pool.length)] : pool;
    const stayZh = h.stay === "stay" ? "住宿" : "休息";
    scene = api.peek({ who, mode: h.presence === "in" ? "room" : "door", pose, man: date.client.build,
      title: h.presence === "in" ? `旅館・${stayZh}中` : "旅館・門外",
      status: h.presence === "in" ? `${date.client.name}不知道你是她老公` : "", hint: h.presence === "in" ? "" : "門後傳來聲音……",
      onClose: () => { scene = null; render(); } });
  }
  /** 約會行程玩家事先不知道：客人或她在那一站傳了訊息才算「知道」。 */
  const knownSpot = (date, i) => !!(date.seen?.[`cs:${i}`] || date.seen?.[`ws:${i}`]);
  function placeText(date, seg) {
    if (date.pauseAt) return "（等你回覆）";
    if (seg?.kind === "hotel") return `旅館・${date.hotel.stay === "stay" ? "住宿" : "休息"}`;
    return seg && knownSpot(date, seg.i) ? R.SPOTS[seg.key].zh : "約會中";
  }
  function openPanel() {
    const who = api.who(), date = active(who);
    if (!who || !date) return;
    const el = shell("LINE");
    el.dataset.kind = "date";
    el.insertAdjacentHTML("beforeend", `<div class="rgf-clock"><span class="t"></span><span class="w"></span><span class="bar"><i></i></span></div>
      <div class="rgf-list"></div><div class="rgf-msgs" hidden></div><div class="rgf-act" hidden></div>
      <form class="rgf-in" hidden><input placeholder="輸入訊息" maxlength="120"><button type="submit">傳送</button></form>`);
    const hd = el.querySelector(".rgf-hd");
    const back = document.createElement("button");
    back.type = "button"; back.className = "rgf-back"; back.textContent = "‹"; back.setAttribute("aria-label", "回聊天列表");
    back.addEventListener("click", () => { view = "list"; render(); });
    hd.prepend(back);
    el.querySelector(".rgf-in").addEventListener("submit", (e) => { e.preventDefault(); const i = el.querySelector(".rgf-in input"); const t = i.value.trim(); if (t) { i.value = ""; void send(t); } });
    render();
  }
  const nameOf = (who, date, side) => (side === "wife" ? who.name : `(客戶) ${date.client.name}`);
  async function classify(side, text) {
    if (api.intent) {
      try { const t = await Promise.race([api.intent(side, text), new Promise((r) => setTimeout(() => r(""), 8000))]); if (["encourage", "restrain", "none"].includes(t)) return t; } catch { /* 關鍵字 */ }
    }
    return R.intentByWords(text);
  }
  async function send(text) {
    const who = api.who(), date = active(who);
    if (!date) return;
    const side = tab, phase = R.where(date).seg?.kind === "hotel" ? "hotel" : "date";
    push(date, side, "me", text);
    render(); api.persist();
    // 你這句是鼓勵／勸阻／普通？（AI 判斷，失敗用關鍵字）→ 一點點影響後面的場景
    void classify(side, text).then((intent) => {
      if (active(who) === date && R.applyIntent(date, side, intent)) { api.debug(`日租女友：你對${side === "wife" ? "她" : "客人"}${intent === "encourage" ? "鼓勵" : "勸阻"}（${JSON.stringify(date.influence)}）`); api.persist(); }
    });
    // 回得快慢：她在旅館很慢或不回；客人在做的時候沒空
    const busy = phase === "hotel";
    if (busy && Math.random() < 0.4) return;
    const wait = (busy ? 8000 + Math.random() * 20000 : 1500 + Math.random() * 3500);
    const fb = side === "wife" ? L.wifeReply(date, phase, { family: famOf(who) }) : L.clientReply(date, phase);
    const t = await line(date, side, "reply", { text, phase }, fb);
    setTimeout(() => { if (active(who) !== date) return; push(date, side, "them", t); if (side === "client" && /騷|叫|射|身材/.test(t)) date.bragged = t; render(); api.persist(); }, wait);
  }
  function render() {
    const who = api.who(), date = active(who);
    if (!ov || ov.dataset.kind !== "date" || !date) return;
    const inChat = view === "chat";
    ov.dataset.open = inChat ? tab : "";
    if (inChat) date.unread[tab] = 0;
    const w = R.where(date), seg = w.seg;
    ov.querySelector(".rgf-hd b").textContent = inChat ? nameOf(who, date, tab) : "LINE";
    ov.querySelector(".rgf-back").hidden = !inChat;
    ov.querySelector(".rgf-clock .t").textContent = R.clockText(w.hour);
    ov.querySelector(".rgf-clock .w").textContent = placeText(date, seg);
    ov.querySelector(".rgf-clock .bar i").style.width = `${Math.min(100, (w.e / Math.max(1, w.total)) * 100)}%`;
    const list = ov.querySelector(".rgf-list"), box = ov.querySelector(".rgf-msgs");
    list.hidden = inChat; box.hidden = !inChat; ov.querySelector(".rgf-in").hidden = !inChat;
    if (!inChat) {
      // 聊天列表：頭像＋名字＋最後一則＋時間＋未讀
      const key = ["wife", "client"].map((sd) => `${date.chat[sd].length}:${date.unread[sd] || 0}`).join("|");
      if (list.dataset.key !== key) {
        list.dataset.key = key; list.textContent = "";
        for (const sd of ["wife", "client"]) {
          const last = date.chat[sd].at(-1), row = document.createElement("button");
          row.type = "button"; row.className = "rgf-row"; row.dataset.side = sd;
          row.innerHTML = `<span class="rgf-av"></span><span class="mid"><div class="nm"></div><div class="pv"></div></span><span class="rt"><span class="tm"></span></span>`;
          const av = row.querySelector(".rgf-av");
          av.textContent = (sd === "wife" ? who.name : date.client.name).slice(0, 1);
          av.style.background = sd === "wife" ? "#ff7aa8" : "#5b7fd6";
          row.querySelector(".nm").textContent = nameOf(who, date, sd);
          row.querySelector(".pv").textContent = last ? `${last.from === "me" ? "你：" : ""}${last.text}` : sd === "wife" ? "她正在約會中" : "客人以為你是她的經紀人";
          row.querySelector(".tm").textContent = last ? R.clockText((date.startHour || 13) + last.at) : "";
          if (date.unread[sd]) { const u = document.createElement("span"); u.className = "ub"; u.textContent = date.unread[sd]; row.querySelector(".rt").append(u); }
          row.addEventListener("click", () => { tab = sd; view = "chat"; render(); });
          list.append(row);
        }
      }
    } else {
      const key = `${tab}|${date.chat[tab].length}`;
      if (box.dataset.key !== key) {
        box.dataset.key = key; box.textContent = "";
        if (!date.chat[tab].length) box.innerHTML = `<div class="rgf-sys">${tab === "client" ? "客人以為你是她的經紀人" : "她正在約會中"}</div>`;
        for (const m of date.chat[tab]) {
          const d = document.createElement("div"); d.className = `rgf-m${m.from === "me" ? " me" : ""}`;
          d.textContent = m.text; const sm = document.createElement("small"); sm.textContent = R.clockText((date.startHour || 13) + m.at); d.append(sm); box.append(d);
        }
        box.scrollTop = box.scrollHeight;
      }
    }
    const act = ov.querySelector(".rgf-act"), h = date.hotel;
    act.textContent = "";
    if (seg?.kind === "hotel" && h?.presence !== "away" && !scene) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = h.presence === "in" ? "回到房間裡" : "回到門外";
      b.addEventListener("click", () => openScene(who, date)); act.append(b);
    }
    if (seg?.kind === "hotel" && h?.presence === "away" && h.stay === "stay" && !date.skipped) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = "快轉到早上（會錯過中間的訊息）";
      b.addEventListener("click", () => { R.fastForward(date); api.persist(); tick(); }); act.append(b);
    }
    act.hidden = !act.children.length;
  }

  // ------------------------------------------------------------ 結束：回家＋結算
  function finish(who) {
    const date = active(who);
    if (!date) return;
    try { scene?.close?.(); } catch { /* */ }
    scene = null;
    const mood = api.mood(who), eff = R.effectsOf(who, date), bill = R.settle(who, date, mood);
    const h = date.hotel?.result ? R.honesty(who, date.hotel.result) : { level: "honest" };
    api.applyEffects(who, { ...eff, hotel: date.hotel, client: date.client });
    api.earn(bill.income, `日租女友（${date.client.name}）`);
    const mine = mineOf(who);
    if (bill.becomeRegular && !date.client.regular) mine.regulars = [...(mine.regulars || []).filter((c) => c.id !== date.client.id), { ...date.client, regular: false }].slice(-8);
    mine.last = { endAt: Date.now(), clientName: date.client.name, persona: date.client.persona, spots: date.spots.map((s) => ({ key: s.key, item: s.item, act: s.act, cancelled: !!s.cancelled, beats: (s.beats || []).map((b) => ({ scene: b.scene, t: b.t, lv: b.lv, ok: b.ok })) })),
      hotel: date.hotel?.result ? { ...date.hotel.result, stay: date.hotel.stay } : null, presence: date.hotel?.presence || "", honesty: h.level, bragged: date.bragged || "", stars: bill.stars };
    mine.active = null;
    api.debug(`日租女友：結束，${bill.stars} 星，收入 ${bill.income}${bill.roomFee ? `（房錢 −${bill.roomFee} 已付）` : ""}${bill.becomeRegular && !date.client.regular ? "，變成熟客" : ""}；誠實度 ${h.level}`);
    api.comeBack(who);
    api.persist();
    receipt(who, date, bill);
    renderChip();
  }
  function receipt(who, date, bill) {
    const el = shell(`${date.client.name} 的評價`);
    el.dataset.kind = "receipt";
    const box = document.createElement("div");
    box.className = "rgf-rcpt";
    const row = (a, b, cls = "") => { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = "<span></span><span></span>"; d.firstChild.textContent = a; d.lastChild.textContent = b; box.append(d); };
    row("評價", "★".repeat(bill.stars) + "☆".repeat(5 - bill.stars));
    row("行程", `+${bill.base}`);
    if (bill.ext) row("延長", `+${bill.ext}`);
    if (bill.tip) row("小費", `+${bill.tip}`);
    if (bill.driver) row("司機", `+${bill.driver}`);
    row("女友感", `${"★".repeat(bill.gfe)}${"☆".repeat(5 - bill.gfe)} +${bill.gfe}`);
    if (date.client.regular) row("熟客", "×2");
    row("收入", `+${bill.income} 金`, "tot");
    if (bill.roomFee) row("房錢（已付）", `−${bill.roomFee} 金`);
    if (bill.becomeRegular && !date.client.regular) row(`${date.client.name}想再約她`, "變成熟客");
    el.append(box);
    const p = document.createElement("p");
    p.style.cssText = "margin:0 16px;color:#4b5363;font-size:14px";
    p.textContent = `${who.name}回到房間了。想知道今天發生什麼，就跟她聊聊吧。`;
    el.append(p);
  }

  // ------------------------------------------------------------ 房間上方的小條
  function renderChip() {
    const who = api.who(), date = active(who);
    let chip = document.getElementById("rgf-chip");
    if (!date) { chip?.remove(); return; }
    if (!chip) {
      chip = document.createElement("button"); chip.type = "button"; chip.id = "rgf-chip"; chip.className = "rgf-chip";
      chip.addEventListener("click", () => openPanel()); document.body.append(chip);
    }
    const w = R.where(date), seg = w.seg, unread = (date.unread?.wife || 0) + (date.unread?.client || 0);
    const place = seg?.kind === "hotel" ? "旅館" : seg && knownSpot(date, seg.i) ? R.SPOTS[seg.key].zh : "約會中";
    chip.innerHTML = `💕 ${who.name}日租中・${place} ${R.clockText(w.hour)}${date.pauseAt ? "・等你回覆" : ""}${unread ? `<span class="dot">${unread}</span>` : ""}`;
    chip.hidden = !!ov;
  }
  function close() { ov?.remove(); ov = null; renderChip(); }

  return { canAsk, ask, tick, openPanel, active, close, openPicker: () => { const w = api.who(); if (w) openPicker(w); }, _start: start, _finish: finish };
}
