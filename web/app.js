// 魅魔萬事屋 遊戲核心(M0:委託狀態機 + 金幣 + 違約結算 + 伺服器存檔)

const REWARDS = [1, 2, 3, 4, 6, 8, 12, 24]; // 24 的因數;期限 = 24/G 小時
const HOUR = 3600 * 1000;
const MAX_EXEC = 3;

const TAUNTS = [
  "哼,金幣呢?空著手就想召喚魅魔?",
  "先去做點委託吧,窮鬼。",
  "祭品。沒有祭品,一切免談。",
  "你的錢包比夢境還要空。",
  "急什麼。書頁翻爛了她們也不會出來。",
];

let state = null;
let version = 0;
let dirty = false;
let saveTimer = null;
let chooserFor = null; // 展開報酬選擇的委託 id

// ---------- 存檔 ----------

function defaultState() {
  return {
    gold: 0,
    quests: [], // {id, text, lv:0|1|2, reward?, startedAt?, deadline?}
    log: [],
    settings: { player: "", sleepStart: "01:00", sleepEnd: "06:00" },
  };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function load() {
  try {
    const j = await fetch("/api/save").then(r => r.json());
    version = j.version;
    state = j.data ?? defaultState();
    state.quests ??= []; state.log ??= []; state.settings ??= defaultState().settings;
    document.getElementById("set-srv").textContent = "OK";
  } catch (e) {
    state = defaultState();
    document.getElementById("set-srv").textContent = "連線失敗(離線模式,進度不會保存)";
  }
  settleOffline();
  renderAll();
}

function scheduleSave() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

async function saveNow(keepalive = false) {
  if (!dirty || !state) return;
  dirty = false;
  try {
    const r = await fetch("/api/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_version: version, data: state }),
      keepalive,
    });
    if (r.status === 409) {
      // 別的裝置寫過:採用伺服器版
      const j = await fetch("/api/save").then(x => x.json());
      version = j.version;
      state = j.data ?? defaultState();
      toast("存檔衝突:已載入伺服器上較新的進度", "bad");
      renderAll();
      return;
    }
    const j = await r.json();
    version = j.version;
    document.getElementById("set-ver").textContent = "v" + version;
  } catch (e) {
    dirty = true; // 下次再試
  }
}

window.addEventListener("beforeunload", () => { if (dirty) saveNow(true); });

// ---------- 委託邏輯 ----------

function penaltyOf(g) { return Math.max(1, Math.floor(g / 2)); }
function execQuests() { return state.quests.filter(q => q.lv === 2); }

function addQuest(text) {
  text = text.trim();
  if (!text) return;
  state.quests.push({ id: uid(), text, lv: 0 });
  scheduleSave(); renderAll();
}

function accept(id, g) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  q.lv = 1; q.reward = g; chooserFor = null;
  scheduleSave(); renderAll();
}

function start(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q || execQuests().length >= MAX_EXEC) return;
  q.lv = 2;
  q.startedAt = Date.now();
  q.deadline = q.startedAt + (24 / q.reward) * HOUR;
  log(`開始執行「${q.text}」(${q.reward} 金/${24 / q.reward}h)`);
  scheduleSave(); renderAll();
}

function complete(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  state.gold += q.reward;
  state.quests = state.quests.filter(x => x.id !== id);
  log(`完成「${q.text}」 +${q.reward} 金`);
  toast(`委託完成!+${q.reward} 金`, "good");
  scheduleSave(); renderAll();
}

function fail(q, silent = false) {
  const pen = penaltyOf(q.reward);
  state.gold -= pen;
  state.quests = state.quests.filter(x => x.id !== q.id);
  log(`「${q.text}」超時,違約金 -${pen} 金`);
  if (!silent) toast(`委託超時!違約金 -${pen} 金`, "bad");
}

function drop(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  state.quests = state.quests.filter(x => x.id !== id);
  scheduleSave(); renderAll();
}

function demote(id) { // 執行前退回 Lv0 重新編輯
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  q.lv = 0; delete q.reward;
  scheduleSave(); renderAll();
}

function editText(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  const t = prompt("編輯委託內容:", q.text);
  if (t && t.trim()) { q.text = t.trim(); scheduleSave(); renderAll(); }
}

function log(msg) {
  state.log.unshift(`[${new Date().toLocaleString("zh-TW", { hour12: false })}] ${msg}`);
  state.log = state.log.slice(0, 50);
}

// 開頁結算離線期間的超時
function settleOffline() {
  const now = Date.now();
  const expired = execQuests().filter(q => now >= q.deadline);
  if (!expired.length) return;
  let total = 0;
  for (const q of expired) { total += penaltyOf(q.reward); fail(q, true); }
  toast(`離線結算:${expired.length} 件委託超時,違約金 -${total} 金`, "bad");
  scheduleSave();
}

// 每秒 tick:更新倒數條、處理超時
setInterval(() => {
  if (!state) return;
  const now = Date.now();
  let changed = false;
  for (const q of [...execQuests()]) {
    if (now >= q.deadline) { fail(q); changed = true; }
    else updateBar(q, now);
  }
  if (changed) { scheduleSave(); renderAll(); }
}, 1000);

// ---------- 渲染 ----------

const $ = s => document.querySelector(s);

function renderAll() {
  renderHud();
  renderQuests();
  renderSettings();
}

function renderHud() {
  const g = $("#hud-gold");
  g.textContent = "⟡ " + state.gold;
  g.classList.toggle("debt", state.gold < 0);
  $("#hud-debt").classList.toggle("hidden", state.gold >= 0);
}

function fmtRemain(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function updateBar(q, now) {
  const bar = document.querySelector(`[data-bar="${q.id}"]`);
  const rem = document.querySelector(`[data-remain="${q.id}"]`);
  if (!bar) return;
  const frac = (q.deadline - now) / (q.deadline - q.startedAt);
  bar.style.width = Math.max(0, frac * 100) + "%";
  bar.classList.toggle("danger", frac <= 0.2);
  if (rem) rem.innerHTML = frac <= 0.2
    ? `剩 <span class="warn">${fmtRemain(q.deadline - now)}</span> — 違約金 <span class="warn">-${penaltyOf(q.reward)} 金</span>`
    : `剩 ${fmtRemain(q.deadline - now)}`;
}

function qcard(inner) { const d = document.createElement("div"); d.className = "qcard"; d.innerHTML = inner; return d; }
function esc(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function renderQuests() {
  const now = Date.now();
  const exec = execQuests();
  const accepted = state.quests.filter(q => q.lv === 1);
  const found = state.quests.filter(q => q.lv === 0);

  $("#exec-count").textContent = `(${exec.length}/${MAX_EXEC})`;

  const le = $("#list-exec"); le.innerHTML = "";
  for (const q of exec) {
    const el = qcard(`
      <div class="qtext">${esc(q.text)}</div>
      <div class="bar-wrap"><div class="bar" data-bar="${q.id}"></div></div>
      <div class="remain" data-remain="${q.id}"></div>
      <div class="qbtns"><button class="primary" data-act="complete">完成 +${q.reward} 金</button></div>`);
    el.querySelector("[data-act=complete]").onclick = () => complete(q.id);
    le.appendChild(el);
    updateBar(q, now);
  }
  if (!exec.length) le.innerHTML = `<div class="empty">沒有正在執行的委託。</div>`;

  const la = $("#list-accepted"); la.innerHTML = "";
  for (const q of accepted) {
    const full = exec.length >= MAX_EXEC;
    const el = qcard(`
      <div class="qtext">${esc(q.text)}</div>
      <div class="qmeta"><span class="reward">${q.reward} 金</span> / 期限 ${24 / q.reward} 小時 / 違約金 ${penaltyOf(q.reward)} 金</div>
      <div class="qbtns">
        <button class="go" data-act="start" ${full ? "disabled" : ""}>${full ? "執行中已滿" : "開始執行 ▶"}</button>
        <button data-act="demote">退回編輯</button>
        <button data-act="drop">推掉</button>
      </div>`);
    el.querySelector("[data-act=start]").onclick = () => start(q.id);
    el.querySelector("[data-act=demote]").onclick = () => demote(q.id);
    el.querySelector("[data-act=drop]").onclick = () => drop(q.id);
    la.appendChild(el);
  }
  if (!accepted.length) la.innerHTML = `<div class="empty">尚未承接任何委託。</div>`;

  const lf = $("#list-found"); lf.innerHTML = "";
  for (const q of found) {
    const el = qcard(`
      <div class="qtext editable" title="點擊編輯">${esc(q.text)}</div>
      <div class="qbtns">
        <button class="primary" data-act="accept">承接 ▾</button>
        <button data-act="drop">推掉</button>
      </div>
      ${chooserFor === q.id ? `<div class="chooser">${REWARDS.map(g =>
        `<button data-g="${g}">${g}金 <small>/${24 / g}h</small></button>`).join("")}</div>` : ""}`);
    el.querySelector(".qtext").onclick = () => editText(q.id);
    el.querySelector("[data-act=accept]").onclick = () => { chooserFor = chooserFor === q.id ? null : q.id; renderAll(); };
    el.querySelector("[data-act=drop]").onclick = () => drop(q.id);
    el.querySelectorAll(".chooser button").forEach(b => b.onclick = () => accept(q.id, +b.dataset.g));
    lf.appendChild(el);
  }
  if (!found.length) lf.innerHTML = `<div class="empty">輸入現實中的待辦,發現新委託。</div>`;
}

function renderSettings() {
  $("#set-player").value = state.settings.player || "";
  $("#set-sleep-start").value = state.settings.sleepStart;
  $("#set-sleep-end").value = state.settings.sleepEnd;
  $("#set-ver").textContent = version ? "v" + version : "(尚未寫入)";
  $("#log-list").innerHTML = state.log.length
    ? state.log.map(l => `<div>${esc(l)}</div>`).join("")
    : "還沒有任何記錄。";
}

// ---------- 分頁滑動 ----------

const tabButtons = document.querySelectorAll("#tabs button");
function switchTab(i) {
  document.getElementById("track").style.transform = `translateX(-${i * 25}%)`;
  tabButtons.forEach((b, j) => b.classList.toggle("active", j === i));
  document.body.dataset.tab = i;
}
tabButtons.forEach(b => b.onclick = () => switchTab(+b.dataset.tab));
switchTab(0);

// ---------- 事件綁定 ----------

$("#quest-add").onclick = () => { addQuest($("#quest-input").value); $("#quest-input").value = ""; };
$("#quest-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { addQuest(e.target.value); e.target.value = ""; }
});

$("#set-player").addEventListener("change", e => { state.settings.player = e.target.value.trim(); scheduleSave(); });
$("#set-sleep-start").addEventListener("change", e => { state.settings.sleepStart = e.target.value; scheduleSave(); });
$("#set-sleep-end").addEventListener("change", e => { state.settings.sleepEnd = e.target.value; scheduleSave(); });

$("#btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `yorozuya-save-v${version}.json`;
  a.click();
};
$("#btn-import").onclick = () => $("#import-file").click();
$("#import-file").addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (typeof j.gold !== "number" || !Array.isArray(j.quests)) throw new Error("格式不對");
    state = j;
    settleOffline();
    scheduleSave(); renderAll();
    toast("存檔已匯入", "good");
  } catch { toast("匯入失敗:不是有效的存檔", "bad"); }
  e.target.value = "";
});
$("#btn-reset").onclick = () => {
  if (!confirm("確定重置?金幣與委託將全部消失。")) return;
  state = defaultState();
  scheduleSave(); renderAll();
};

// 召喚書嘲諷
document.getElementById("book").onclick = () => {
  const b = document.getElementById("book-bubble");
  b.textContent = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
  b.classList.remove("hidden");
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.add("hidden"), 2800);
};

// ---------- Toast ----------

function toast(msg, cls = "") {
  const d = document.createElement("div");
  d.className = "toast " + cls;
  d.textContent = msg;
  document.getElementById("toasts").appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

// ---------- 啟動 ----------

load();
