/* 老婆還債偷看：共用「中央對話框 → 圖淡入、對話框下移」元件（遊戲與 /wifepay 編輯頁同一套）。
 * 對話：先出說話人標籤，停約 0.8 秒後打字機逐字出現；一段跑完按「下一句」才換人（旁白→男子→妻子），舊句往上留著。
 * 打字途中再點會一次跑完。圖庫空或生圖失敗只留對話，不退回人偶、不改文生圖。圖淡入不重設打字進度。 */
const CSS_ID = "wifepay-reveal-css-3";
const CSS = `
.wp-reveal{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;background:rgba(8,6,12,.28);overflow:hidden}
.wp-reveal.page{position:relative;inset:auto;width:100%;height:min(86dvh,44rem);min-height:28rem;background:#120e18;border-radius:12px;overflow:hidden;pointer-events:auto}
.wp-pics{display:none;flex:1 1 auto;min-height:0;width:100%;opacity:0;transition:opacity 1.8s ease;background:#0c0912;align-items:flex-end;justify-content:center;gap:.4rem;padding:.3rem .3rem 0;box-sizing:border-box}
.wp-pics.ready{display:flex}
.wp-pics.show{opacity:1}
.wp-pics.one{flex-direction:column}
.wp-pics.two{flex-direction:row;flex-wrap:nowrap}
.wp-pics img{flex:1 1 0;min-width:0;min-height:0;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center center;display:block}
.wp-dialog{position:relative;z-index:2;flex:0 0 auto;width:90%;max-width:24rem;max-height:42%;margin:0 auto;padding:.85rem .95rem .95rem;border-radius:14px;background:rgba(22,16,30,.96);border:1px solid rgba(232,138,180,.35);color:#f2e9ff;font:600 15px/1.55 system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.4);pointer-events:auto;cursor:pointer;overflow:auto;box-sizing:border-box}
.wp-reveal.has-pics{justify-content:flex-end;align-items:stretch}
.wp-reveal.has-pics .wp-dialog{margin:.4rem auto .55rem;max-height:36%}
.wp-wait{margin:0 0 .4rem;text-align:center;color:#e6be8c}
.wp-log{width:100%;max-height:14.5rem;overflow:auto;display:flex;flex-direction:column;justify-content:flex-end;gap:.55rem}
.wp-reveal.has-pics .wp-log{max-height:min(11rem,28dvh)}
.wp-line{margin:0;opacity:1}
.wp-line.hist{opacity:.7}
.wp-line.wp-nar{color:#d8d0c0;font-weight:500}
.wp-line.wp-man{color:#8fb2ff}
.wp-line.wp-wife{color:#ffb0cf}
.wp-k{display:block;margin-bottom:.12rem;opacity:.8;font-size:.85em;letter-spacing:.06em}
.wp-t{display:block;min-height:1.35em;white-space:pre-wrap;word-break:break-word}
.wp-t.waiting::after{content:"……";opacity:.55;animation:wpblink 1.1s steps(3,end) infinite}
@keyframes wpblink{50%{opacity:.15}}
.wp-next{display:block;margin:.7rem auto 0;padding:.32rem 1rem;border:1px solid rgba(232,138,180,.5);border-radius:999px;background:rgba(40,24,44,.92);color:#ffd0e4;font:600 13px/1.4 system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;cursor:pointer}
.wp-next[hidden]{display:none}
.wp-note{margin:.6rem 0 0;font-size:.82em;color:#a99bbd;text-align:center}
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
    script_id: String(j.script_id || ""),
    script_name: String(j.script_name || ""),
  };
}

export async function fetchScripts() {
  const j = await apiJson("/api/wifepay/scripts");
  return Array.isArray(j.scripts) ? j.scripts : [];
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

function typeDelay(mark) {
  if (/[。！？!?…]/.test(mark)) return 90;
  if (/[、，,．.]/.test(mark)) return 50;
  return 26;
}

function speakerLabels(opts, row) {
  const wife = String(opts.wifeName || row?.wifeName || opts.name || "").trim() || "妻子";
  const guest = String(opts.guestName || row?.guestName || "").trim();
  return {
    nar: "旁白",
    man: guest ? `男子（${guest}）` : "男子",
    wife,
  };
}

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
      <div class="wp-log"></div>
      <button type="button" class="wp-next" hidden>下一句</button>
      <p class="wp-note"></p>
    </div>`;
  host.append(el);
  const pics = el.querySelector(".wp-pics");
  const box = el.querySelector(".wp-dialog");
  const wait = el.querySelector(".wp-wait");
  const log = el.querySelector(".wp-log");
  const nextBtn = el.querySelector(".wp-next");
  const note = el.querySelector(".wp-note");
  const closed = { yes: false };
  const ctl = {
    phase: "idle", // pause | typing | await-next | done
    skipPause: null,
    skipType: null,
    goNext: null,
  };

  const hideWait = () => { wait.style.display = "none"; };
  const showNext = (on) => { nextBtn.hidden = !on; };
  const scrollLog = () => { log.scrollTop = log.scrollHeight; };

  function addLine(kind, label, waiting) {
    const node = document.createElement("p");
    node.className = `wp-line ${kind}`;
    node.innerHTML = `<span class="wp-k"></span><span class="wp-t"></span>`;
    node.querySelector(".wp-k").textContent = label;
    const body = node.querySelector(".wp-t");
    if (waiting) body.classList.add("waiting");
    log.append(node);
    scrollLog();
    return { node, body };
  }

  function markHist() {
    log.querySelectorAll(".wp-line:not(.hist)").forEach((n) => n.classList.add("hist"));
  }

  function advanceFromClick() {
    if (closed.yes) return;
    if (ctl.phase === "pause" && ctl.skipPause) ctl.skipPause();
    else if (ctl.phase === "typing" && ctl.skipType) ctl.skipType();
    else if (ctl.phase === "await-next" && ctl.goNext) ctl.goNext();
  }

  box.addEventListener("click", (ev) => {
    if (ev.target.closest(".wp-next")) return;
    advanceFromClick();
  });
  nextBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (ctl.phase === "await-next" && ctl.goNext) ctl.goNext();
  });

  function waitPause(ms) {
    return new Promise((resolve) => {
      if (closed.yes) return resolve();
      ctl.phase = "pause";
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        ctl.skipPause = null;
        if (ctl.phase === "pause") ctl.phase = "idle";
        resolve();
      }
      ctl.skipPause = done;
    });
  }

  function typeText(body, text) {
    return new Promise((resolve) => {
      const full = String(text || "");
      const chars = Array.from(full);
      body.classList.remove("waiting");
      if (!chars.length) {
        body.textContent = "";
        return resolve();
      }
      if (closed.yes) {
        body.textContent = full;
        return resolve();
      }
      ctl.phase = "typing";
      let i = 0;
      let timer = 0;
      const finish = () => {
        clearTimeout(timer);
        ctl.skipType = null;
        body.textContent = full;
        if (ctl.phase === "typing") ctl.phase = "idle";
        scrollLog();
        resolve();
      };
      ctl.skipType = finish;
      const tick = () => {
        if (closed.yes) return finish();
        i += 1;
        body.textContent = chars.slice(0, i).join("");
        scrollLog();
        if (i >= chars.length) return finish();
        timer = setTimeout(tick, typeDelay(chars[i - 1]));
      };
      tick();
    });
  }

  function waitNext() {
    return new Promise((resolve) => {
      if (closed.yes) return resolve();
      ctl.phase = "await-next";
      showNext(true);
      ctl.goNext = () => {
        ctl.goNext = null;
        showNext(false);
        if (ctl.phase === "await-next") ctl.phase = "idle";
        resolve();
      };
    });
  }

  const api = {
    el,
    close() {
      if (closed.yes) return;
      closed.yes = true;
      try { ctl.skipPause?.(); } catch { /* */ }
      try { ctl.skipType?.(); } catch { /* */ }
      try { ctl.goNext?.(); } catch { /* */ }
      el.remove();
      try { opts.onClose?.(); } catch { /* */ }
    },
    setNote(text) { note.textContent = text || ""; },
    async setDialog(row) {
      if (closed.yes) return;
      return playFrom(Promise.resolve(row));
    },
    setImages(urls) {
      const list = (urls || []).map((u) => String(u || "")).filter(Boolean);
      if (!list.length || closed.yes) return;
      pics.hidden = false;
      pics.classList.add("ready");
      pics.classList.toggle("two", list.length > 1);
      pics.classList.toggle("one", list.length <= 1);
      list.forEach((u, i) => {
        let img = pics.children[i];
        if (!img || img.tagName !== "IMG") {
          img = document.createElement("img");
          img.alt = "";
          pics.append(img);
        }
        if (img.getAttribute("src") !== u) img.src = u;
      });
      while (pics.children.length > list.length) pics.removeChild(pics.lastChild);
      el.classList.add("has-pics");
      requestAnimationFrame(() => { pics.classList.add("show"); });
    },
  };

  let playJob = 0;
  async function playFrom(dialogP) {
    const job = ++playJob;
    const first = addLine("wp-nar", "旁白", true);
    hideWait();
    let row = null;
    try {
      row = await Promise.resolve(dialogP);
    } catch {
      row = null;
    }
    if (closed.yes || job !== playJob) return;
    const labels = speakerLabels(opts, row);
    first.node.querySelector(".wp-k").textContent = labels.nar;
    if (!row || !(row.narration || row.man || row.wife)) {
      first.body.classList.remove("waiting");
      first.body.textContent = "聽不清楚裡面在說什麼。";
      api.setNote("對話沒有產出");
      return;
    }
    first.body.classList.remove("waiting");
    const instant = !!opts.instant;
    if (!instant) {
      await waitPause(800);
      if (closed.yes || job !== playJob) return;
    }
    if (row.narration) {
      if (instant) first.body.textContent = row.narration;
      else await typeText(first.body, row.narration);
    } else {
      first.node.remove();
    }
    if (closed.yes || job !== playJob) return;
    const rest = [];
    if (row.man) rest.push(["wp-man", labels.man, row.man]);
    if (row.wife) rest.push(["wp-wife", labels.wife, row.wife]);
    for (let i = 0; i < rest.length; i++) {
      if (!instant) {
        await waitNext();
        if (closed.yes || job !== playJob) return;
      }
      markHist();
      const [kind, label, text] = rest[i];
      const line = addLine(kind, label, false);
      if (instant) {
        line.body.textContent = text;
      } else {
        await waitPause(800);
        if (closed.yes || job !== playJob) return;
        await typeText(line.body, text);
      }
    }
    ctl.phase = "done";
    showNext(false);
  }

  const run = async () => {
    try {
      if (opts.emptyMessage) api.setNote(opts.emptyMessage);
      const dlgP = typeof opts.dialog === "function" ? opts.dialog() : Promise.resolve(opts.dialog);
      const imgP = typeof opts.images === "function" ? opts.images() : Promise.resolve(opts.images);
      Promise.resolve(imgP).then((urls) => {
        if (closed.yes) return;
        if (Array.isArray(urls) && urls.length) {
          api.setNote("");
          api.setImages(urls);
        }
      }).catch((err) => {
        if (!closed.yes) api.setNote(String(err?.message || err || "圖片沒有產出，只留對話"));
      });
      await playFrom(dlgP);
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
    script_id: opts.script_id || opts.script || "random",
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
  const pickP = (async () => {
    if (typeof opts.onStatus === "function") opts.onStatus("抽圖庫…");
    return pickGallery(info.pose, opts.count);
  })();
  const images = async () => {
    const picked = await pickP;
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
        if (url) {
          urls.push(url);
          // 任一張先好就立刻顯現、把對話往下推，不等全部生完、也不等對話打完
          try { ui.setImages(urls.slice()); } catch { /* */ }
        }
      } catch (err) {
        console.warn("[wifepay]", err);
      }
    }));
    if (!urls.length) throw new Error("圖片沒有產出，只留對話");
    return urls;
  };
  const dialog = async () => {
    let tags = [info.pose, ...(opts.tags || [])].filter(Boolean);
    try {
      const picked = await pickP;
      for (const it of picked.items || []) {
        for (const tag of it.tags || []) if (tag) tags.push(tag);
      }
    } catch { /* 圖庫空也還是能生對話 */ }
    try { return await fetchDialog({ ...info, tags }); } catch { return null; }
  };
  const ui = mountWifepayReveal(host, {
    page: !!opts.page,
    instant: !!opts.instant,
    waitText: opts.waitText || "門後傳來聲音……",
    wifeName: info.name,
    guestName: info.guestName,
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
