/* 老婆還債偷看：共用「中央對話框 → 圖淡入、對話框下移」元件（遊戲與 /wifepay 編輯頁同一套）。
 * 對話順序：門後傳來聲音…… → 旁白 → 男子 → 老婆。圖庫空或生圖失敗只留對話，不退回人偶、不改文生圖。 */
const CSS_ID = "wifepay-reveal-css";
const CSS = `
.wp-reveal{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;background:rgba(8,6,12,.28)}
.wp-reveal.page{position:relative;inset:auto;min-height:28rem;height:min(86dvh,40rem);background:#120e18;border-radius:12px;overflow:hidden;pointer-events:auto}
.wp-pics{position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;transition:opacity 1.8s ease;background:#0c0912}
.wp-pics.show{opacity:1}
.wp-pics img{flex:1 1 0;width:100%;height:0;object-fit:cover;display:block}
.wp-dialog{position:relative;z-index:2;width:86%;max-width:22rem;margin:0 auto;padding:.85rem .95rem .95rem;border-radius:14px;background:rgba(22,16,30,.92);border:1px solid rgba(232,138,180,.35);color:#f2e9ff;font:600 15px/1.55 system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.4);pointer-events:auto;transition:transform 1.15s ease,margin 1.15s ease}
.wp-reveal.has-pics .wp-dialog{transform:translateY(0);margin-top:auto;margin-bottom:7%}
.wp-wait{margin:0;text-align:center;color:#e6be8c}
.wp-nar,.wp-man,.wp-wife{margin:.55rem 0 0;opacity:0;transform:translateY(6px);transition:opacity .45s,transform .45s}
.wp-nar.on,.wp-man.on,.wp-wife.on{opacity:1;transform:none}
.wp-nar{color:#d8d0c0;font-weight:500}
.wp-man{color:#8fb2ff}
.wp-wife{color:#ffb0cf}
.wp-note{margin:.6rem 0 0;font-size:.82em;color:#a99bbd;text-align:center}
.wp-k{display:inline-block;min-width:2.2em;opacity:.75;font-size:.85em}
`;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = CSS;
  document.head.append(s);
}

async function apiJson(url, method, body) {
  const r = await fetch(url, {
    method: method || "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
  return j;
}

export async function fetchGallery() {
  const j = await apiJson("/api/wifepay/gallery");
  return Array.isArray(j.items) ? j.items : [];
}

export async function pickGallery(pose, count) {
  const body = { pose: pose || "" };
  if (count === 1 || count === 2) body.count = count;
  return apiJson("/api/wifepay/pick", "POST", body);
}

export async function fetchDialog(info) {
  const j = await apiJson("/api/wifepay/dialog", "POST", info || {});
  return {
    narration: String(j.narration || ""),
    man: String(j.man || ""),
    wife: String(j.wife || ""),
    ai: !!j.ai,
  };
}

/** 輪詢既有 /api/imggen；成功回圖 URL，失敗丟錯。 */
export async function waitImg(body, ms = 360000, onTick) {
  let key = body.key;
  let r = await apiJson("/api/imggen", "POST", { ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done") return r;
    if (r.status === "error") throw new Error(r.error || r.message || "生圖失敗");
    if (onTick) onTick(Math.round((Date.now() - t0) / 1000), r);
    await new Promise((x) => setTimeout(x, 1500));
    r = await apiJson("/api/imggen", "POST", { ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  throw new Error("生圖逾時");
}

export async function generateFromItem(item, opts = {}, onTick) {
  if (!item?.id) throw new Error("沒有底圖");
  const body = {
    item_id: item.id,
    character: opts.character || null,
    name: opts.name || opts.character?.name || "",
    pose: opts.pose || "",
    build: opts.build || opts.man || "average",
    family: opts.family || "",
    voice: opts.voice || "",
    stage: opts.stage || opts.character?.roomStage || opts.character?.stage || "",
    regular: !!opts.regular,
    guestName: opts.guestName || "",
    prompt: opts.prompt,
    negative: opts.negative,
    denoise: opts.denoise,
    seed: opts.seed || 0,
    ckpt: opts.ckpt || "",
    comfy_url: opts.comfy_url || "",
    key: opts.key || `wifepay:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    retry: true,
  };
  const r = await apiJson("/api/wifepay/gen", "POST", body);
  const key = r.key || body.key;
  const done = await waitImg({ ...body, key, provider: "comfy", retry: false }, opts.timeout || 360000, onTick);
  const url = String(done.result || done.url || "");
  if (!url) throw new Error("生圖沒有網址");
  return url;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * 在 host 裡掛上揭示畫面。
 * opts.dialog = 已有 {narration,man,wife} 或 ()=>Promise
 * opts.images = 已有 url[] 或 ()=>Promise<url[]>（空陣列＝只留對話）
 * opts.emptyMessage 圖庫空時的說明
 * 回 { el, close, setDialog, setImages, setNote }
 */
export function mountWifepayReveal(host, opts = {}) {
  ensureCss();
  if (!host) throw new Error("沒有容器");
  const prev = host.querySelector(":scope > .wp-reveal");
  if (prev) prev.remove();
  const el = document.createElement("div");
  el.className = "wp-reveal" + (opts.page ? " page" : "");
  el.innerHTML = `<div class="wp-pics" hidden></div>
    <div class="wp-dialog">
      <p class="wp-wait">${opts.waitText || "門後傳來聲音……"}</p>
      <p class="wp-nar"><span class="wp-k">旁白</span><span class="wp-t"></span></p>
      <p class="wp-man"><span class="wp-k">男</span><span class="wp-t"></span></p>
      <p class="wp-wife"><span class="wp-k">她</span><span class="wp-t"></span></p>
      <p class="wp-note"></p>
    </div>`;
  host.append(el);
  const pics = el.querySelector(".wp-pics");
  const wait = el.querySelector(".wp-wait");
  const note = el.querySelector(".wp-note");
  const closed = { yes: false };
  const api = {
    el,
    close() {
      if (closed.yes) return;
      closed.yes = true;
      el.remove();
      try { opts.onClose?.(); } catch { /* */ }
    },
    setNote(text) { note.textContent = text || ""; },
    async setDialog(row) {
      if (!row || closed.yes) return;
      wait.style.display = "none";
      const parts = [
        [el.querySelector(".wp-nar"), row.narration],
        [el.querySelector(".wp-man"), row.man],
        [el.querySelector(".wp-wife"), row.wife],
      ];
      for (const [node, text] of parts) {
        if (closed.yes) return;
        node.querySelector(".wp-t").textContent = text ? " " + text : "";
        node.classList.add("on");
        await sleep(420);
      }
    },
    setImages(urls) {
      const list = (urls || []).map((u) => String(u || "")).filter(Boolean);
      if (!list.length || closed.yes) return;
      pics.hidden = false;
      pics.innerHTML = list.map((u) => `<img alt="" src="${u.replace(/"/g, "")}">`).join("");
      requestAnimationFrame(() => {
        pics.classList.add("show");
        el.classList.add("has-pics");
      });
    },
  };
  const run = async () => {
    try {
      if (opts.emptyMessage) api.setNote(opts.emptyMessage);
      const dlgP = typeof opts.dialog === "function" ? opts.dialog() : Promise.resolve(opts.dialog);
      const imgP = typeof opts.images === "function" ? opts.images() : Promise.resolve(opts.images);
      const dlg = await Promise.resolve(dlgP).catch(() => null);
      if (dlg && (dlg.narration || dlg.man || dlg.wife)) await api.setDialog(dlg);
      else wait.textContent = opts.waitText || "門後傳來聲音……";
      try {
        const urls = await Promise.resolve(imgP);
        if (Array.isArray(urls) && urls.length) {
          api.setNote("");
          api.setImages(urls);
        }
      } catch (err) {
        api.setNote(String(err?.message || err || "圖片沒有產出，只留對話"));
      }
    } catch (err) {
      api.setNote(String(err?.message || err || "出錯了"));
    }
  };
  run();
  return api;
}

/** 遊戲／全部測試：抽 1～2 張、生對話、生圖，掛到 host。空圖庫不清文生圖。 */
export function startWifepayPeek(host, opts = {}) {
  const info = {
    character: opts.character || null,
    name: opts.name || opts.character?.name || opts.who?.name || "",
    pose: opts.pose || "",
    build: opts.build || opts.man || "average",
    family: opts.family || "",
    voice: opts.voice || "",
    stage: opts.stage || opts.character?.roomStage || opts.who?.roomStage || opts.character?.stage || "",
    regular: !!opts.regular,
    guestName: opts.guestName || opts.guest?.name || "",
  };
  const genOpts = {
    ...info,
    ckpt: opts.ckpt || opts.character?.comfyCkpt || "",
    comfy_url: opts.comfy_url || "",
    seed: opts.seed || 0,
    denoise: opts.denoise,
    timeout: opts.timeout,
  };
  let emptyMessage = "";
  const images = async () => {
    if (typeof opts.onStatus === "function") opts.onStatus("抽圖庫…");
    const picked = await pickGallery(info.pose, opts.count);
    if (picked.empty || !picked.items?.length) {
      emptyMessage = "圖庫是空的。請先到 /wifepay 上傳底圖（不會改走文生圖）。";
      return [];
    }
    if (typeof opts.onStatus === "function") opts.onStatus(`正在生成 ${picked.items.length} 張圖…`);
    const urls = [];
    await Promise.all(picked.items.map(async (item, i) => {
      try {
        const url = await generateFromItem(item, { ...genOpts, key: `wifepay:${Date.now().toString(36)}:${i}` }, (sec) => {
          if (typeof opts.onStatus === "function") opts.onStatus(`生圖中… ${sec}s（${picked.items.length} 張）`);
        });
        if (url) urls.push(url);
      } catch (err) {
        console.warn("[wifepay]", err);
      }
    }));
    if (!urls.length) throw new Error("圖片沒有產出，只留對話");
    return urls;
  };
  const dialog = async () => {
    try { return await fetchDialog(info); } catch { return null; }
  };
  const ui = mountWifepayReveal(host, {
    page: !!opts.page,
    waitText: opts.waitText || "門後傳來聲音……",
    dialog,
    images: async () => {
      const urls = await images();
      if (emptyMessage) ui.setNote(emptyMessage);
      return urls;
    },
    onClose: opts.onClose,
  });
  return ui;
}

export { apiJson };
