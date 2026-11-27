// 主畫面改版（2026-11-27 使用者）：箱庭（像素房間）＋子彈筆記，兩個主角上下兩塊。
// 資料：任務＝state.quests（沿用委託），事件／筆記＝state.bujo.items，今天做完的＝state.bujo.done，
// 專注＝state.bujo.focusId；日誌頁＝state.notebook（連寫金照舊）。app.js 給 api（存檔、金幣、完成、番茄鐘…）。
// 規則（PLAN 主畫面改版那列）：新增任務 0～2（伺服器擲）、事件／筆記 0～1（每天前 10 筆）、完成 1～3、
// 專注 +5、她在家心情好 +1；延到明天不扣錢；任務放了 24 小時沒動 → 畫面中央跳卡要你處理。

const SIG = { task: "•", ev: "○", note: "—" };
const KIND_ZH = { task: "待辦", ev: "事件", note: "記事" };
const PAGES = ["today", "month", "future", "diary"];
const STALE_MS = 24 * 3600 * 1000;
const WEEK = "日一二三四五六";
const WARM = new Set(["close_friend", "girlfriend", "passionate", "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife"]);

let api = null;
let curPage = "today";
let flipping = false;
let tagFilter = "";
let diaryOff = 0;          // 日誌頁：0＝今天，負的＝往前第幾篇
let mode = "focus";        // 打開一律專注模式（2026-11-27 使用者），不記上次
let staleShownId = "";
let fitTimer = 0;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clean = (t) => String(t || "").replace(/#\S+\s?/g, "").trim() || String(t || "");
const ymdOf = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
const md = (day) => { const d = new Date(day * 86400000); return `${d.getUTCMonth() + 1}／${d.getUTCDate()}`; };
const wk = (day) => WEEK[new Date(day * 86400000).getUTCDay()];
const monthOf = (day) => { const d = new Date(day * 86400000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };

function S() { return api?.state?.() || null; }
function today() { return api.dayNum(); }
function bj() {
  const s = S();
  s.bujo ??= {};
  const b = s.bujo;
  if (!Array.isArray(b.items)) b.items = [];
  if (!Array.isArray(b.done)) b.done = [];
  return b;
}
function save() { api.save(); }

/** 舊存檔：每件委託補上「哪天做、什麼時候建的、最後動過的時間」（從現在算 24 小時，不會一打開就全部跳出來）。 */
export function migrate() {
  const s = S();
  if (!s) return false;
  const b = bj();
  let ch = false;
  const now = Date.now(), t = today();
  for (const q of s.quests || []) {
    if (q.day == null) { q.day = t; ch = true; }
    if (!q.at) { q.at = now; ch = true; }
    if (!q.touched) { q.touched = now; ch = true; }
    if (q.lv === 0) { q.lv = 1; ch = true; }   // 發現池沒了：寫下來就是今天的任務
  }
  // 做完的紀錄留 62 天（本月頁看得到）
  const keep = t - 62;
  const n0 = b.done.length, n1 = b.items.length;
  b.done = b.done.filter((d) => d && d.day >= keep);
  b.items = b.items.filter((d) => d && (d.day >= keep));
  if (b.done.length !== n0 || b.items.length !== n1) ch = true;
  if (b.focusId && !(s.quests || []).some((q) => q.id === b.focusId)) { b.focusId = null; ch = true; }
  return ch;
}

// ---------------------------------------------------------------- 她的反應
function her() { try { return api.her(); } catch { return null; } }
function say(warmText, coldText) {
  const h = her();
  if (!h || !h.present) return;
  const text = h.stage && WARM.has(h.stage) ? warmText : (coldText || warmText);
  try { window.RoomActor?.tip?.(`${h.name}：「${text}」`, 3200); } catch { /* 房間沒接上 */ }
}
function coin(n) {
  if (!n) return;
  const room = $("main-room-stage");
  if (!room) return;
  const c = document.createElement("span");
  c.className = "bj-coin";
  c.textContent = `+${n} ⟡`;
  c.style.left = (38 + Math.random() * 20) + "%";
  c.style.top = "50%";
  room.appendChild(c);
  setTimeout(() => c.remove(), 1000);
}

// ---------------------------------------------------------------- 今日清單
function todayRows() {
  const s = S(), b = bj(), t = today();
  const rows = [];
  for (const q of s.quests || []) {
    const day = q.day ?? t;
    if (day <= t) rows.push({ k: "task", id: q.id, t: q.text, at: q.at || 0, q, state: "open", late: t - day });
    else if (q.movedDay === t) rows.push({ k: "task", id: q.id, t: q.text, at: q.at || 0, q, state: "moved" });
  }
  for (const it of b.items) if (it.day === t) rows.push({ k: it.k, id: it.id, t: it.t, at: it.at || 0, it });
  for (const d of b.done) if (d.day === t) rows.push({ k: "task", id: d.id, t: d.t, at: d.at || 0, d, state: "done" });
  rows.sort((a, z) => a.at - z.at);
  return rows;
}
function openTasks() {
  const t = today();
  return (S().quests || []).filter((q) => (q.day ?? t) <= t);
}
function focusQuest() {
  const b = bj();
  const q = b.focusId ? openTasks().find((x) => x.id === b.focusId) : null;
  if (q) return q;
  if (b.noFocus) return null;
  // 沒選過：最早那件就是專注的
  const first = openTasks().sort((a, z) => (a.at || 0) - (z.at || 0))[0] || null;
  b.focusId = first ? first.id : null;
  return first;
}

function linkify(el, text) {
  el.textContent = "";
  for (const part of String(text).split(/(#[^\s#，。、]+|https?:\/\/\S+)/)) {
    if (!part) continue;
    if (part[0] === "#") {
      const b = document.createElement("button");
      b.type = "button"; b.className = "bj-tag"; b.textContent = part;
      b.onclick = (e) => { e.stopPropagation(); setFilter(part); };
      el.appendChild(b);
    } else if (/^https?:/.test(part)) {
      const a = document.createElement("a");
      a.href = part; a.target = "_blank"; a.rel = "noopener"; a.className = "bj-url";
      a.textContent = "🔗" + part.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
      a.onclick = (e) => e.stopPropagation();
      el.appendChild(a);
    } else el.appendChild(document.createTextNode(part));
  }
}
function setFilter(tag) {
  tagFilter = tagFilter === tag ? "" : tag;
  renderToday();
  if (tagFilter) {
    const n = todayRows().filter((r) => r.t.includes(tagFilter)).length;
    say(`跟「${tagFilter.slice(1)}」有關的有 ${n} 筆喔。`, `「${tagFilter.slice(1)}」的有 ${n} 筆。`);
  }
}

function renderToday() {
  const log = $("bj-log");
  if (!log) return;
  const t = today();
  $("bj-today-title").innerHTML = `${md(t)}<small>（${wk(t)}）今日</small>`;
  const fb = $("bj-filter");
  fb.hidden = !tagFilter;
  if (tagFilter) fb.querySelector("b").textContent = tagFilter;
  const fq = focusQuest();
  const rows = todayRows();
  // 正在專注的那筆自動排到最上面（2026-11-27 使用者），其他照時間
  const ci = fq ? rows.findIndex((r) => r.k === "task" && r.state === "open" && r.id === fq.id) : -1;
  if (ci > 0) rows.unshift(rows.splice(ci, 1)[0]);
  const prevTop = log.firstElementChild?.dataset.id || "";
  log.innerHTML = "";
  let shown = 0;
  for (const r of rows) {
    if (tagFilter && !r.t.includes(tagFilter)) continue;
    shown++;
    const li = document.createElement("li");
    const isCur = r.k === "task" && r.state === "open" && fq && fq.id === r.id;
    li.className = r.k + (r.state === "done" ? " done" : "") + (r.state === "moved" ? " moved" : "") + (isCur ? " cur" : "");
    const sig = r.state === "done" ? "✕" : r.state === "moved" ? "&gt;" : SIG[r.k];
    const meta = r.state === "moved" ? "明天" : r.state === "open" && r.late > 0 ? `延了 ${r.late} 天` : r.state === "open" && r.q?.lv === 2 && api.onPomo(r.id) ? "專注中" : "";
    li.innerHTML = `<button class="sig" type="button" aria-label="${r.k === "task" ? "切換狀態" : KIND_ZH[r.k]}">${sig}</button><span class="txt"></span>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}`
      + (isCur ? `<button class="curchip" type="button">專注中 ▾</button>` : "")
      + (r.k === "task" && r.state === "open" && !isCur ? `<button class="pick" type="button" aria-label="改成專注這一筆" title="改成專注這一筆">◎</button>` : "")
      + (r.it?.unsorted ? `<button class="kchip" type="button" data-k="note">記事</button><button class="kchip" type="button" data-k="task">待辦</button>` : "");
    li.dataset.id = r.id;
    linkify(li.querySelector(".txt"), r.t);
    li.querySelector(".sig").onclick = () => cycle(r);
    const cc = li.querySelector(".curchip");
    if (cc) cc.onclick = (e) => { e.stopPropagation(); openFocusMenu(); };
    const pk = li.querySelector(".pick");
    if (pk) pk.onclick = (e) => { e.stopPropagation(); setFocus(r.id); };
    // 剛記下的事件：在本子裡選它是記事還是待辦（2026-11-27 使用者）
    li.querySelectorAll(".kchip").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); convert(r, b.dataset.k); }));
    // 長按一筆：選單（改成專注／延到明天／刪掉）
    let lt = 0;
    li.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, a")) return;
      lt = setTimeout(() => { lt = 0; rowMenu(r); }, 550);
    });
    const cancel = () => { if (lt) clearTimeout(lt); lt = 0; };
    li.addEventListener("pointerup", cancel); li.addEventListener("pointerleave", cancel); li.addEventListener("pointercancel", cancel);
    li.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); rowMenu(r); });
    log.appendChild(li);
  }
  $("bj-empty").hidden = shown > 0 || !!tagFilter;
  // 換了專注的那筆：今日頁捲回最上面，看得到它
  if (fq && prevTop && prevTop !== fq.id && curPage === "today") { const pg = log.closest(".bj-page"); if (pg) pg.scrollTop = 0; }
  renderNow();
}

function renderNow() {
  const fq = focusQuest();
  const txt = $("home-now-text");
  if (!txt) return;
  txt.textContent = fq ? clean(fq.text) : openTasks().length ? "現在沒有專注的事（點「換」挑一筆）" : "今天的待辦都做完了";
  $("home-now-meta").textContent = fq && (fq.day ?? today()) < today() ? `延了 ${today() - fq.day} 天` : "";
  $("home-now-focus").hidden = !fq;
}

// ---------------------------------------------------------------- 動作
function cycle(r) {
  if (r.k !== "task") return rowMenu(r);
  const s = S(), b = bj(), t = today();
  if (r.state === "open") {
    const wasFocus = b.focusId === r.id;
    const g = api.complete(r.id);
    if (g == null) return;
    coin(g);
    if (wasFocus) {
      const nx = openTasks().sort((a, z) => (a.at || 0) - (z.at || 0))[0];
      b.focusId = nx ? nx.id : null;
      if (nx) setTimeout(() => say(`做得好～下一件「${clean(nx.text)}」。`, `下一件是「${clean(nx.text)}」。`), 900);
    }
    say(pick(["做得好～今天也很努力呢。", "又少一件了，辛苦了。", "做完了？過來休息一下嘛。"]), pick(["做完了？嗯。", "還算可以。", "喔，做完了啊。"]));
  } else if (r.state === "done") {
    // ✕ → >：改成延到明天（已經領過的錢不再發，做完不重複給）
    b.done = b.done.filter((d) => d !== r.d);
    if (!(s.quests || []).some((q) => q.id === r.id)) {
      s.quests.push({ id: r.id, text: r.t, lv: 1, at: r.at || Date.now(), day: t + 1, movedDay: t, touched: Date.now(), paid: true });
    }
    say("這件明天再做？好吧，我記下來了。", "明天？隨便你。");
    api.toast("延到明天（不扣錢）");
  } else if (r.state === "moved") {
    r.q.day = t; delete r.q.movedDay; r.q.touched = Date.now();
  }
  save();
  renderAllPages();
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function moveTomorrow(q, quiet) {
  const t = today(), b = bj();
  q.day = t + 1; q.movedDay = t; q.touched = Date.now();
  if (q.lv === 2) q.lv = 1;
  if (b.focusId === q.id) b.focusId = null;
  if (!quiet) { api.toast("延到明天（不扣錢，明天做完照樣拿）"); say("好吧，明天我再提醒你。", "明天記得做。"); }
  save(); renderAllPages();
}
function setFocus(id) {
  const b = bj();
  b.focusId = id || null;
  b.noFocus = !id;
  const q = id ? (S().quests || []).find((x) => x.id === id) : null;
  if (q) { q.touched = Date.now(); say(`好，先做「${clean(q.text)}」。`, `「${clean(q.text)}」是吧。`); }
  save(); renderAllPages();
}
function startFocus(q) {
  q = q || focusQuest();
  if (!q) return openPicker();
  q.touched = Date.now();
  bj().focusId = q.id; bj().noFocus = false;
  save();
  api.startPomo(q.id);
  renderAllPages();
}

function closeSheet() { $("bj-sheet").hidden = true; $("bj-scrim").hidden = true; }
function openSheet(title, sub, opts) {
  $("bj-sheet-t").textContent = title;
  $("bj-sheet-sub").textContent = sub;
  const box = $("bj-sheet-opts");
  box.innerHTML = "";
  for (const o of opts) {
    const b = document.createElement("button");
    b.type = "button";
    if (o.pri) b.className = "pri";
    b.innerHTML = esc(o.label) + (o.hint ? `<small>${esc(o.hint)}</small>` : "");
    b.onclick = () => { closeSheet(); o.go(); };
    box.appendChild(b);
  }
  $("bj-scrim").hidden = false;
  $("bj-sheet").hidden = false;
}
function openFocusMenu() {
  const q = focusQuest();
  if (!q) return openPicker();
  openSheet(`「${clean(q.text)}」`, "現在不想做這件？", [
    { label: "開始專注", hint: "番茄鐘：她在房間就會陪你，做完 +5 ⟡", pri: true, go: () => startFocus(q) },
    { label: "換一件", hint: "從今天還沒做的挑一筆", go: openPicker },
    { label: "先放著", hint: "留在今天的清單，只是先不專注", go: () => { setFocusQuiet(null); api.toast("先放著，還在今天的清單"); say("嗯，那要做別的嗎？", "那你要做什麼？"); } },
    { label: "延到明天", hint: "不扣錢，明天做完照樣拿", go: () => moveTomorrow(q) },
  ]);
}
function setFocusQuiet(id) { const b = bj(); b.focusId = id; b.noFocus = !id; save(); renderAllPages(); }
function openPicker() {
  const fq = focusQuest();
  const opts = openTasks().filter((q) => !fq || q.id !== fq.id).map((q) => ({ label: clean(q.text), hint: (q.day ?? today()) < today() ? `延了 ${today() - q.day} 天` : "", go: () => setFocus(q.id) }));
  opts.push({ label: "先不專注", hint: "休息一下，她就在房間陪你", go: () => { setFocusQuiet(null); api.toast("現在沒有專注的事"); say("休息一下也好，過來陪我？", "不做了？"); } });
  openSheet("換一件來專注", opts.length > 1 ? "今天還沒做的：" : "今天沒有別的待辦了", opts);
}
function rowMenu(r) {
  const s = S(), b = bj();
  if (r.k === "task" && r.state === "open") {
    openSheet(`「${clean(r.t)}」`, "這一筆要怎麼處理？", [
      { label: "改成現在專注這一筆", pri: true, go: () => setFocus(r.id) },
      { label: "延到明天", hint: "不扣錢", go: () => moveTomorrow(r.q) },
      { label: "改成記事", hint: "不是要做的事，只是記下來", go: () => convert(r, "note") },
      { label: "不做了", hint: "從清單拿掉（不扣錢）", go: () => { api.drop(r.id); if (b.focusId === r.id) b.focusId = null; save(); renderAllPages(); } },
    ]);
  } else if (r.k === "task" && r.state === "moved") {
    openSheet(`「${clean(r.t)}」`, "延到明天的這一筆", [
      { label: "改回今天做", pri: true, go: () => cycle(r) },
      { label: "不做了", hint: "從清單拿掉", go: () => { api.drop(r.id); save(); renderAllPages(); } },
    ]);
  } else if (r.it) {
    const to = ["task", "note", "ev"].filter((k) => k !== r.k).map((k) => ({
      label: `改成${KIND_ZH[k]}`, pri: k === "task",
      hint: k === "task" ? "要做的事：可以完成、延到明天、專注" : k === "note" ? "想法、資料，記下來就好" : "某天會發生的事（寫日期就排到那天）",
      go: () => convert(r, k),
    }));
    openSheet(`${SIG[r.k]} ${clean(r.t)}`, `現在是${KIND_ZH[r.k]}`, [
      ...to,
      { label: "刪掉這一筆", go: () => { b.items = b.items.filter((x) => x !== r.it); save(); renderAllPages(); } },
    ]);
  }
  void s;
}

// ---------------------------------------------------------------- 快速紀錄
export function parseDay(text, t = today()) {
  if (/明天/.test(text)) return t + 1;
  if (/後天/.test(text)) return t + 2;
  const m = text.match(/(\d{1,2})\s*[\/／月]\s*(\d{1,2})/);
  if (!m) return t;
  const mo = +m[1], d = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return t;
  const y = new Date(t * 86400000).getUTCFullYear();
  let day = Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
  if (day < t - 31) day = Math.floor(Date.UTC(y + 1, mo - 1, d) / 86400000);   // 已經過很久了＝明年的
  return day;
}
/** 快速紀錄：輸入框打的一律先記成 ○ 事件（2026-11-27 使用者），在本子裡再選是記事還是待辦。
 *  金幣：記一筆 0～1（每天前 10 筆）；第一次改成待辦再 0～1（待辦合起來 0～2）。 */
async function capture() {
  const inp = $("quest-input");
  const v = String(inp?.value || "").trim();
  if (!v || inp.dataset.sending === "1") return;
  if (api.talkCommand(v)) { inp.value = ""; return; }   // 打她的名字＝叫她過來
  inp.dataset.sending = "1";
  try {
    const day = parseDay(v);
    const r = await api.record(v, day);
    if (!r) return;
    inp.value = "";
    coin(r.gold);
    if (day !== today()) api.toast(`記到 ${md(day)}（在「未來」那頁）${r.gold ? `　+${r.gold} ⟡` : ""}`, r.gold ? "good" : "");   // 今天的直接出現在清單（金幣從房間飄上來），不另外跳提示蓋住它
    say("記下來了。是要做的事嗎？", "記下來了。");
    renderAllPages();
    if (curPage !== "today") flipTo(day > today() ? "future" : "today");
    const last = $("bj-log")?.lastElementChild;
    if (last && mode === "focus" && day === today()) last.scrollIntoView({ block: "nearest" });
  } finally { delete inp.dataset.sending; inp.focus(); }
}

/** 一筆改成 待辦（task，進 state.quests）／記事（note）／事件（ev）。 */
function convert(r, k) {
  const s = S(), b = bj(), t = today();
  if (r.k === k && !r.it?.unsorted) return;
  if (r.it) {
    if (k === "task") {
      b.items = b.items.filter((x) => x !== r.it);
      const q = { id: r.it.id.replace(/^bj/, "bq"), text: r.it.t, lv: 1, day: Math.max(r.it.day ?? t, t), at: r.it.at || Date.now(), touched: Date.now() };
      if (r.it.day > t) q.day = r.it.day;
      s.quests.push(q);
      if (!r.it.todoPaid && r.it.inCap) { const g = Math.random() < 0.5 ? 1 : 0; if (g) api.earn(g, `記成待辦「${r.it.t}」`); coin(g); }
      say("要做的事啊，要我提醒你嗎？", "記成待辦了。");
    } else {
      r.it.k = k;
      delete r.it.unsorted;
    }
  } else if (r.q && k !== "task") {
    // 待辦 → 記事／事件：從清單拿掉（不扣錢），留成一筆，之後再改回待辦不會再給錢
    api.drop(r.q.id);
    if (b.focusId === r.q.id) b.focusId = null;
    b.items.push({ id: /^bq/.test(r.q.id) ? r.q.id.replace(/^bq/, "bj") : "bj" + r.q.id, k, t: r.q.text, day: Math.max(r.q.day ?? t, t), at: r.q.at || Date.now(), todoPaid: true });
  }
  save();
  renderAllPages();
}

// ---------------------------------------------------------------- 本月／未來
function renderMonth() {
  const box = $("bj-month");
  if (!box) return;
  const s = S(), b = bj(), t = today(), mo = monthOf(t);
  $("bj-month-title").innerHTML = `${new Date(t * 86400000).getUTCMonth() + 1} 月<small>本月</small>`;
  const rows = [];
  for (const d of b.done) if (monthOf(d.day) === mo) rows.push({ day: d.day, sig: "✕", t: d.t, at: d.at });
  for (const it of b.items) if (monthOf(it.day) === mo) rows.push({ day: it.day, sig: SIG[it.k], t: it.t, at: it.at });
  for (const q of s.quests || []) { const day = Math.max(q.day ?? t, t); if (monthOf(day) === mo) rows.push({ day, sig: "•", t: q.text, at: q.at }); }
  rows.sort((a, z) => a.day - z.day || (a.at || 0) - (z.at || 0));
  box.innerHTML = rows.length ? "" : `<li><span class="txt" style="color:var(--paper-mute);font-size:12px">這個月還沒有紀錄。</span></li>`;
  let last = null;
  for (const r of rows) {
    const li = document.createElement("li");
    if (r.day === t) li.className = "today";
    li.innerHTML = `<span class="d">${r.day !== last ? `${new Date(r.day * 86400000).getUTCDate()} ${wk(r.day)}` : ""}</span><span class="txt">${esc(r.sig)} ${esc(clean(r.t))}</span>`;
    last = r.day;
    box.appendChild(li);
  }
}
function renderFuture() {
  const box = $("bj-future");
  if (!box) return;
  const s = S(), b = bj(), t = today();
  const rows = [];
  for (const q of s.quests || []) if ((q.day ?? t) > t) rows.push({ day: q.day, sig: "•", t: q.text });
  for (const it of b.items) if (it.day > t) rows.push({ day: it.day, sig: SIG[it.k], t: it.t });
  rows.sort((a, z) => a.day - z.day);
  if (!rows.length) { box.innerHTML = `<p class="bj-empty">還沒有之後的事。事件寫日期（例如「○ 12/24 聖誕節」）就會排到那天。</p>`; return; }
  let html = "", lastMo = null;
  for (const r of rows) {
    const mo = monthOf(r.day);
    if (mo !== lastMo) { if (lastMo != null) html += "</ul>"; html += `<h4>${new Date(r.day * 86400000).getUTCMonth() + 1} 月</h4><ul class="bj-log">`; lastMo = mo; }
    const dated = /\d{1,2}\s*[\/／月]\s*\d{1,2}|明天|後天/.test(r.t);   // 自己寫了日期就不再補
    html += `<li><span class="sig" style="cursor:default">${esc(r.sig)}</span><span class="txt">${dated ? "" : esc(md(r.day)) + " "}${esc(clean(r.t))}</span></li>`;
  }
  box.innerHTML = html + "</ul>";
}

// ---------------------------------------------------------------- 日誌頁（state.notebook）
function renderDiaryPage() {
  if (!$("bj-dtext")) return;
  const t = today();
  const past = api.notebook.pastDays();    // 寫過的舊頁，新到舊
  if (diaryOff < -past.length) diaryOff = -past.length;
  const isToday = diaryOff === 0;
  $("bj-dtoday").hidden = !isToday;
  $("bj-dpast").hidden = isToday;
  $("bj-dnext").disabled = isToday;
  $("bj-dprev").disabled = diaryOff <= -past.length;
  if (isToday) {
    $("bj-diary-title").innerHTML = `${md(t)}<small>（${wk(t)}）日誌</small>`;
    const ta = $("bj-dtext");
    if (document.activeElement !== ta) ta.value = api.notebook.today();
    paintDiaryFoot();
    const recs = todayRows().filter((r) => r.state === "done" || r.k === "ev").map((r) => `${r.state === "done" ? "✕" : "○"} ${clean(r.t)}`);
    $("bj-dfrom").textContent = recs.length ? `今天的紀錄：${recs.join("、")}（寫的時候可以參考）` : "";
  } else {
    const e = past[-diaryOff - 1];
    $("bj-diary-title").innerHTML = `${md(e.day)}<small>（${wk(e.day)}）日誌</small>`;
    const box = $("bj-dpast");
    box.innerHTML = "";
    for (const line of String(e.text).split("\n")) { const p = document.createElement("p"); p.textContent = line || " "; box.appendChild(p); }
    if (e.streak) { const p = document.createElement("p"); p.className = "sig2"; p.textContent = `當時連寫 ${e.streak} 天`; box.appendChild(p); }
  }
}
function paintDiaryFoot() {
  const n = api.notebook.today().replace(/\s/g, "").length;
  const min = api.notebook.min;
  const c = $("bj-dcount");
  c.textContent = n >= min ? `${n} 字 ✓` : `${n}／${min} 字`;
  c.classList.toggle("ok", n >= min);
  const st = api.notebook.streak();
  $("bj-dstreak").textContent = st.rewarded ? `連寫 ${st.count} 天　+${st.gold} ⟡（今天領了）` : st.prev ? `已經連寫 ${st.prev} 天，今天寫滿 +${st.next} ⟡` : `今天寫滿 +${st.next} ⟡`;
}

// ---------------------------------------------------------------- 換頁（整頁往上翻）
function flipTo(name) {
  if (flipping || name === curPage) return;
  const box = $("bj-pages");
  const from = box.querySelector(`.bj-page[data-page="${curPage}"]`), to = box.querySelector(`.bj-page[data-page="${name}"]`);
  const fwd = PAGES.indexOf(name) > PAGES.indexOf(curPage);
  flipping = true;
  if (name === "diary") diaryOff = 0;
  renderPage(name);
  if (fwd) {
    const ghost = from.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    ghost.classList.add("flip");
    box.appendChild(ghost);
    from.hidden = true; to.hidden = false; to.scrollTop = 0;
    setTimeout(() => { ghost.remove(); flipping = false; }, 560);
  } else {
    to.hidden = false; to.classList.add("flipBack");
    setTimeout(() => { to.classList.remove("flipBack"); from.hidden = true; flipping = false; }, 560);
  }
  curPage = name;
  document.querySelectorAll("#bj-nav button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.p === name)));
}
function renderPage(name) {
  if (name === "today") renderToday();
  else if (name === "month") renderMonth();
  else if (name === "future") renderFuture();
  else if (name === "diary") renderDiaryPage();
}
function renderAllPages() {
  if (!S()) return;
  renderToday();
  renderPage(curPage);
  renderHer();
  checkStale();
}

// ---------------------------------------------------------------- 重心（陪伴／專注）＋房間大小
const desk = () => matchMedia("(min-width:1024px) and (orientation:landscape)").matches;
const tablet = () => innerWidth >= 700;
function setMode(m) {
  mode = m === "companion" ? "companion" : "focus";
  const stage = $("home-stage");
  if (!stage) return;
  stage.classList.toggle("companion", mode === "companion");
  stage.classList.toggle("focus", mode === "focus");
  $("mode-companion")?.setAttribute("aria-pressed", String(mode === "companion"));
  $("mode-focus")?.setAttribute("aria-pressed", String(mode === "focus"));
  layout(mode === "companion" ? 1 : 0);
}
/** 設定的文字大小（:root --fs），房間一條的高度、陪伴那一行跟著放大。 */
function fs() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fs")) || 1; }
function roomHeights() {
  const H = $("home-stage").clientHeight;
  const k = fs();
  const handle = $("home-handle")?.offsetHeight || Math.round(34 * k);
  return { H, min: tablet() ? Math.round(H * 0.4) : 110, max: Math.max(120, H - handle - Math.round(42 * k)) };
}
function layout(f) {
  const room = $("main-room-stage");
  if (!room) return;
  if (desk()) { room.style.height = ""; fitRoom(); return; }
  const { min, max } = roomHeights();
  room.style.height = Math.round(min + (max - min) * f) + "px";
  fitRoom();
  setTimeout(fitRoom, 380);
}
/** 畫布照房間框放：大的時候整間塞進來；手機專注模式（一條）＝寬度撐滿、上下對準她。 */
function fitRoom() {
  const room = $("main-room-stage"), cv = $("room");
  if (!room || !cv || !room.clientWidth) return;
  const W = room.clientWidth, H = room.clientHeight, IW = cv.width || 416, IH = cv.height || 328;
  const phone = !desk() && !tablet();
  const strip = phone && H < 200;
  // 手機陪伴模式：放大一點（左右可以切掉一些），對準她；平板／電腦整間塞進來
  const s = strip ? W / IW : phone ? Math.max(W / IW * 1.3, Math.min(W / IW * 2, H / IH * 0.9)) : Math.min(W / IW, H / IH);
  const w = Math.round(IW * s), h = Math.round(IH * s);
  let fx = 0.5, fy = 0.55;
  try { const p = window.RoomView?.actorPoint?.(); if (p) { fx = p.x / p.w; fy = p.y / p.h; } } catch { /* */ }
  const place = (box, len, f) => (len <= box ? Math.round((box - len) / 2) : Math.round(Math.min(0, Math.max(box - len, box / 2 - f * len))));
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  cv.style.left = place(W, w, fx) + "px";
  cv.style.top = place(H, h, fy) + "px";
}
function wireHandle() {
  const handle = $("home-handle"), room = $("main-room-stage");
  if (!handle || !room) return;
  let drag = null;
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    drag = { y: e.clientY, h: room.clientHeight };
    handle.setPointerCapture(e.pointerId);
    room.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { min, max } = roomHeights();
    const h = Math.max(tablet() ? Math.round(min * 0.75) : min, Math.min(max, drag.h + e.clientY - drag.y));
    room.style.height = h + "px";
    fitRoom();
  });
  const end = () => {
    if (!drag) return;
    room.classList.remove("dragging");
    const { H } = roomHeights();
    setMode(room.clientHeight > H * (tablet() ? 0.6 : 0.45) ? "companion" : "focus");
    drag = null;
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  $("mode-companion").onclick = () => setMode("companion");
  $("mode-focus").onclick = () => setMode("focus");
}

// ---------------------------------------------------------------- 狀態列（她）＋LINE 新訊息
function renderHer() {
  const btn = $("hud-her");
  if (!btn) return;
  const h = her();
  btn.hidden = !h;
  if (h) {
    $("hud-her-name").textContent = h.name;
    $("hud-her-stage").textContent = h.stageZh || "";
    $("hud-her-aff").querySelector("i").style.width = Math.round(Math.max(0, Math.min(1, h.affPct)) * 100) + "%";
    $("hud-her-aff").setAttribute("aria-label", `感情 ${h.aff}${h.next ? `／${h.next}` : ""}`);
    $("hud-her-st").textContent = h.status || "";
    btn.title = `${h.name}・${h.stageZh}・感情 ${h.aff}${h.next ? `／${h.next}` : ""}（點開＝名冊）`;
  }
  const dot = document.querySelector("#hud-line .dot");
  if (dot) dot.hidden = !api.lineUnread();
}

// ---------------------------------------------------------------- 放了 24 小時：畫面中央跳出來
function staleTask() {
  const now = Date.now();
  return (S().quests || []).filter((q) => now - (q.touched || q.at || now) >= STALE_MS)
    .sort((a, z) => (a.touched || 0) - (z.touched || 0))[0] || null;
}
function checkStale() {
  const card = $("bj-stale");
  if (!card || !card.hidden) return;
  if (document.body.classList.contains("pomo-on") || !$("bj-sheet").hidden) return;
  if (document.body.dataset.tab !== "0") return;
  try { if (window.RoomCompanion?.busy?.() || !document.getElementById("portrait-sheet")?.hidden) return; } catch { /* */ }
  const q = staleTask();
  if (!q) return;
  staleShownId = q.id;
  $("bj-stale-t").textContent = clean(q.text);
  const days = Math.max(1, Math.floor((Date.now() - (q.touched || q.at)) / STALE_MS));
  $("bj-stale-why").textContent = q.movedDay != null ? `這筆延過之後${days > 1 ? days + " 天" : "一天"}沒動。要怎麼處理？` : `寫下來${days > 1 ? days + " 天" : "一天"}了，還沒動。要怎麼處理？`;
  const h = her(), herEl = $("bj-stale-her");
  herEl.hidden = !h?.present;
  if (h?.present) herEl.textContent = `${h.name}：「${WARM.has(h.stage) ? "這個放好久了喔……要我盯著你做嗎？" : "這件你是不是忘了？"}」`;
  card.hidden = false;
}
function staleQ() { return (S().quests || []).find((q) => q.id === staleShownId) || null; }
function staleClose(msg) { $("bj-stale").hidden = true; staleShownId = ""; if (msg) api.toast(msg); save(); renderAllPages(); }
function wireStale() {
  $("bj-s-now").onclick = () => {
    const q = staleQ();
    if (q) { q.day = today(); delete q.movedDay; q.touched = Date.now(); }
    staleClose("改成現在專注這一筆");
    if (q) startFocus(q);
  };
  $("bj-s-keep").onclick = () => { const q = staleQ(); if (q) moveTomorrow(q, true); staleClose("延續到明天，24 小時後會再問你"); say("好，明天我再提醒你。", "明天別再忘了。"); };
  $("bj-s-done").onclick = () => {
    const q = staleQ();
    $("bj-stale").hidden = true; staleShownId = "";
    if (q) { const g = api.complete(q.id); coin(g); say("原來早就做完了，不早說～", "早說嘛。"); }
    save(); renderAllPages();
  };
  $("bj-s-drop").onclick = () => { const q = staleQ(); if (q) api.drop(q.id); staleClose("拿掉了"); };
}

// ---------------------------------------------------------------- 初始化
export function render() {
  if (!api || !S()) return;
  if (migrate()) save();
  renderAllPages();
}

export function init(a) {
  api = a;
  if (!$("home-stage")) return;
  document.querySelectorAll("#bj-nav button").forEach((b) => (b.onclick = () => flipTo(b.dataset.p)));
  $("bj-filter-off").onclick = () => setFilter(tagFilter);
  $("bj-scrim").onclick = closeSheet;
  $("home-now-focus").onclick = () => startFocus();
  $("home-now-switch").onclick = () => (focusQuest() ? openFocusMenu() : openPicker());
  $("hud-her").onclick = () => api.openRoster();
  $("hud-line").onclick = () => { api.openLine(); renderHer(); };
  $("room-zin").onclick = () => { try { window.RoomView?.zoomBy?.(1.25); } catch { /* */ } };
  $("room-zout").onclick = () => { try { window.RoomView?.zoomBy?.(0.8); } catch { /* */ } };
  $("room")?.addEventListener("dblclick", () => { try { window.RoomView?.reset?.(); } catch { /* */ } });
  // 日誌：今天這頁直接寫，寫滿 12 字領連寫金（一天一次），她回一句
  $("bj-dtext").addEventListener("input", (e) => {
    const got = api.notebook.write(e.target.value);
    paintDiaryFoot();
    if (got > 0) { coin(got); say("寫好日誌了？我也想看～", "寫日誌啊……嗯。"); }
  });
  $("bj-dtext").addEventListener("blur", () => api.notebook.flush());
  $("bj-dprev").onclick = () => { diaryOff--; renderDiaryPage(); };
  $("bj-dnext").onclick = () => { diaryOff = Math.min(0, diaryOff + 1); renderDiaryPage(); };
  // 頁面上往上滑（到底）＝下一頁、往下滑（在頂）＝上一頁
  {
    let sy = null, st = 0;
    const box = $("bj-pages");
    box.addEventListener("touchstart", (e) => { const pg = e.target.closest(".bj-page"); sy = e.touches[0].clientY; st = pg ? pg.scrollTop : 0; }, { passive: true });
    box.addEventListener("touchend", (e) => {
      if (sy == null || e.target.closest("textarea")) { sy = null; return; }
      const dy = e.changedTouches[0].clientY - sy, pg = box.querySelector(`.bj-page[data-page="${curPage}"]`);
      sy = null;
      const atBottom = pg.scrollTop + pg.clientHeight >= pg.scrollHeight - 2, atTop = st <= 0;
      const i = PAGES.indexOf(curPage);
      if (dy < -70 && atBottom && i < PAGES.length - 1) flipTo(PAGES[i + 1]);
      else if (dy > 70 && atTop && i > 0) flipTo(PAGES[i - 1]);
    }, { passive: true });
  }
  wireHandle();
  wireStale();
  addEventListener("resize", () => setMode(mode));
  // 她走來走去：房間一條的時候跟著她（兩秒對一次）；狀態列、24 小時卡一分鐘看一次
  clearInterval(fitTimer);
  fitTimer = setInterval(() => { if (document.body.dataset.tab === "0" && !document.hidden) fitRoom(); }, 2000);
  setInterval(() => { if (S()) { renderHer(); checkStale(); } }, 30000);
  setMode("focus");
}

/** 快速紀錄送出（app.js 的輸入框 Enter／紙飛機都走這裡）。 */
export { capture };
