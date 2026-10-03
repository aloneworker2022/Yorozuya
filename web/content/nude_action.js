/**
 * 動作圖組「裸體版」（undress.stage===3 時用）。
 *
 * 同一個圖組（同 id、同 pose_ref／denoise）多一套裸體欄位：
 *   nudePrompt／nudeNegative（留空＝由穿衣版自動轉換）、nudeRef（留空＝沿用穿衣版參考圖）、nudeUrl（編輯器試生預覽）。
 * 每位魅子的快取：portraits.<packsKey 去 _packs>_nude_packs[packId]，例如 tease_nipple_lick_nude_packs。
 * 伺服器 shot：<shot>_nude（例 tease_nipple_lick_nude）→ garment=nude，不套生涯服裝、不覆寫穿衣版檔案。
 *
 * 閘門：只有頁面標了 <html data-nude-action-packs="1">（目前僅 test_room.html）才啟用；主房間 index.html 不受影響。
 */

/** 這 9 個動作 shot 有裸體版（伺服器 comfy.ACTION_NUDE_BASES 要同步）。 */
export const NUDE_ACTION_SHOTS = Object.freeze([
  "tease_butt", "tease_waist", "tease_breast", "tease_breast_knead", "tease_breast_suck",
  "tease_nipple_lick", "tease_labia", "tease_labia_rub", "tease_finger_in",
]);

/** 全身通用的全裸 tags。 */
export const NUDE_ACTION_TAGS = "nude, completely nude, naked, no clothes, bare skin";

/** 依部位補一句（同動作、同構圖，只是沒穿）。 */
const NUDE_BODY_TAGS = {
  tease_butt: "bare ass, bare buttocks, no panties",
  tease_waist: "bare waist, bare hips, navel, no panties",
  tease_breast: "bare breasts, nipples, no bra",
  tease_breast_knead: "bare breasts, nipples, no bra",
  tease_breast_suck: "bare breasts, nipples, no bra",
  tease_nipple_lick: "bare breasts, nipples, no bra",
  tease_labia: "bare pussy, no panties, pubic area",
  tease_labia_rub: "bare pussy, no panties, pubic area",
  tease_finger_in: "bare pussy, no panties, pubic area",
};

/** 裸體版負向：擋衣物被畫回來。不要寫 nude／naked（伺服器 garment=nude 也會濾掉）。 */
export const NUDE_ACTION_NEG = "clothes, clothing, shirt, blouse, dress, skirt, bra, panties, underwear, lingerie, bikini, swimsuit, uniform, jacket, coat, pantyhose, stockings";

/** 穿衣版 prompt 裡和衣服有關的片語：轉裸體版時剔掉（同動作、同構圖保留）。 */
const CLOTHING_RE = /\b(skirt|panties|panty|pantsu|bra|underwear|lingerie|clothes|clothed|clothing|shirt|blouse|dress|uniform|jacket|coat|sweater|cardigan|pantyhose|stockings|tights|bikini|swimsuit|leotard|apron|fabric)\b/i;
/** 「隔著衣服」這類尾巴：只剪掉片語，動作本身留下。 */
const CLOTHING_PHRASE_RE = /\s*\b(over|through|under|beneath|inside)\s+(the\s+|her\s+)?(clothes|clothing|fabric|shirt|skirt|panties|bra|underwear|dress|uniform)\b/gi;
const NUDE_WORD_RE = /^(nude|naked|completely nude|completely naked|topless|bottomless|nipples?|areola[e]?|bare [a-z ]+)$/i;

function joinTags(...parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const bit of String(part || "").split(",")) {
      const s = bit.trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out.join(", ");
}

export function isNudeActionShot(shot) {
  return NUDE_ACTION_SHOTS.includes(String(shot || ""));
}

/** tease_nipple_lick → tease_nipple_lick_nude（伺服器登記的裸體 shot）。 */
export function nudeShot(shot) {
  const s = String(shot || "");
  return s.endsWith("_nude") ? s : s + "_nude";
}

/** tease_nipple_lick_packs → tease_nipple_lick_nude_packs（魅子 portraits 快取鍵）。 */
export function nudePacksKey(packsKey) {
  const s = String(packsKey || "");
  if (s.endsWith("_nude_packs")) return s;
  return s.endsWith("_packs") ? s.slice(0, -"_packs".length) + "_nude_packs" : s + "_nude";
}

/** 穿衣版 prompt → 裸體版：剔衣物片語，補全裸＋部位 tags。動作／裁切／POV 原樣保留。 */
export function deriveNudePrompt(prompt, shot = "") {
  const kept = String(prompt || "")
    .split(",")
    .map((s) => s.replace(CLOTHING_PHRASE_RE, "").trim())
    .filter((s) => s && !CLOTHING_RE.test(s));
  return joinTags(kept.join(", "), NUDE_BODY_TAGS[String(shot || "")] || "", NUDE_ACTION_TAGS);
}

/** 穿衣版負向 → 裸體版：拿掉 nude 類字（否則衣服會被畫回去），補衣物負向。 */
export function deriveNudeNegative(negative) {
  const kept = String(negative || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !NUDE_WORD_RE.test(s));
  return joinTags(kept.join(", "), NUDE_ACTION_NEG);
}

/** 圖組的裸體正向：自訂優先，留空自動轉。 */
export function nudeActionPrompt(pack, shot = "") {
  const own = String(pack?.nudePrompt || "").trim();
  return own || deriveNudePrompt(pack?.prompt || "", shot);
}

export function nudeActionNegative(pack) {
  const own = String(pack?.nudeNegative || "").trim();
  return own || deriveNudeNegative(pack?.negative || "");
}

/** 只有 test_room（<html data-nude-action-packs="1">）開。 */
export function nudeActionPacksOn() {
  try {
    if (globalThis.YORO_NUDE_ACTION_PACKS === false) return false;
    if (globalThis.YORO_NUDE_ACTION_PACKS === true) return true;
    return globalThis.document?.documentElement?.dataset?.nudeActionPacks === "1";
  } catch {
    return false;
  }
}

/**
 * 執行時選圖：要裸體且有裸體版 → 裸體；否則穿衣版（可能空字串＝都沒有）。
 * @returns {{ url: string, nude: boolean, fallback: boolean, clothed: string }}
 */
export function pickActionPackUrl(portraits, packsKey, packId, wantNude) {
  const p = portraits && typeof portraits === "object" ? portraits : {};
  const id = String(packId || "");
  const clothed = String((id && p[packsKey]?.[id]) || "");
  if (!wantNude) return { url: clothed, nude: false, fallback: false, clothed };
  const nude = String((id && p[nudePacksKey(packsKey)]?.[id]) || "");
  if (nude) return { url: nude, nude: true, fallback: false, clothed };
  return { url: clothed, nude: false, fallback: true, clothed };
}

/** 讀取裸體欄位（normalize 共用）。 */
export function nudeFields(s) {
  const src = s && typeof s === "object" ? s : {};
  return {
    nudePrompt: String(src.nudePrompt ?? ""),
    nudeNegative: String(src.nudeNegative ?? ""),
    nudeRef: String(src.nudeRef ?? "").trim(),
    nudeUrl: String(src.nudeUrl ?? "").trim(),
  };
}

/**
 * 編輯器：在面板「正向」上方插一列「穿衣版｜裸體版」切換。
 * @param {HTMLElement} panel 例：#lick-pack-editor
 * @param {string} pfx 例：lk（欄位 id 前綴）
 * @param {string} shot 例：tease_nipple_lick
 * @param {{ before?: () => void, after?: () => void }} hooks before＝用舊 variant 收表單；after＝用新 variant 重畫
 */
export function mountNudeVariantToggle(panel, pfx, shot, hooks = {}) {
  const doc = panel?.ownerDocument || globalThis.document;
  const pos = doc?.getElementById(pfx + "-pos");
  let variant = "clothed";
  let hint = null;
  const api = {
    get variant() { return variant; },
    /** 正向／負向 placeholder：裸體版顯示自動轉換結果。 */
    decorate(pack) {
      const posEl = doc?.getElementById(pfx + "-pos");
      const negEl = doc?.getElementById(pfx + "-neg");
      if (posEl && !posEl.dataset.clothedPh) posEl.dataset.clothedPh = posEl.getAttribute("placeholder") || "";
      if (negEl && !negEl.dataset.clothedPh) negEl.dataset.clothedPh = negEl.getAttribute("placeholder") || "";
      if (variant === "nude") {
        if (posEl) posEl.setAttribute("placeholder", "留空＝自動：" + deriveNudePrompt(pack?.prompt || "", shot));
        if (negEl) negEl.setAttribute("placeholder", "留空＝自動：" + deriveNudeNegative(pack?.negative || ""));
      } else {
        if (posEl) posEl.setAttribute("placeholder", posEl.dataset.clothedPh || "");
        if (negEl) negEl.setAttribute("placeholder", negEl.dataset.clothedPh || "");
      }
      if (hint) {
        hint.textContent = variant === "nude"
          ? "裸體版：她全裸（脫衣第 3 段）時用；正向／負向／參考圖留空會自動沿用穿衣版並轉成全裸。"
          : "穿衣版：平常用。";
      }
    },
  };
  if (!panel || !pos || panel.querySelector(".nude-variant-row")) return api;
  const row = doc.createElement("div");
  row.className = pfx + "-row nude-variant-row";
  row.setAttribute("role", "tablist");
  row.innerHTML = `<button type="button" role="tab" class="nv-tab on" data-variant="clothed" id="${pfx}-var-clothed" aria-selected="true">穿衣版</button>`
    + `<button type="button" role="tab" class="nv-tab" data-variant="nude" id="${pfx}-var-nude" aria-selected="false">裸體版</button>`;
  hint = doc.createElement("div");
  hint.className = "mini nude-variant-hint";
  hint.id = pfx + "-var-hint";
  hint.textContent = "穿衣版：平常用。";
  // 插在「正向」label 前
  const anchor = pos.previousElementSibling && pos.previousElementSibling.tagName === "LABEL"
    ? pos.previousElementSibling
    : pos;
  anchor.parentNode.insertBefore(row, anchor);
  anchor.parentNode.insertBefore(hint, anchor);
  row.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".nv-tab");
    if (!btn) return;
    const next = btn.dataset.variant === "nude" ? "nude" : "clothed";
    if (next === variant) return;
    for (const b of row.querySelectorAll(".nv-tab")) {
      const on = b.dataset.variant === next;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (typeof hooks.before === "function") hooks.before();
    variant = next;
    if (typeof hooks.after === "function") hooks.after();
  });
  return api;
}
