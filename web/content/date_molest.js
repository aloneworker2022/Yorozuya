/** 約會猥褻（按鈕）劇本：接近 testword 劇本模式單景編輯。一定圖生圖。 */

import { fillBinds, bindHint, uid, normalizeSlot } from "./script_mode.js";

export { fillBinds, bindHint };

export function emptyMolestPack(name = "猥褻劇本") {
  return {
    id: uid(),
    name: String(name || "猥褻劇本").slice(0, 40),
    attitude: "依關係：陌生驚怒擋開、朋友羞怒、女友又羞又受、妻子默許享受。不要自己演成口交或做愛。",
    playerAct: "你從後面把手伸向 [name] 的 [waist]。",
    narrPrompt: "寫 1～2 句旁白：玩家對 [name] 動手猥褻的現場（體態、視線、周圍人潮）。不要寫成口交或做愛，不要寫台詞。",
    feelPrompt: "這一拍身體感覺：被碰到的部位、緊張／羞恥／快感（依關係）。只影響台詞口氣，不要自己描述肢體。",
    imgMode: "ref",
    slot: {
      prompt: "",
      negative: "looking at viewer, text, watermark, ugly, extra fingers",
      ref: "",
      url: "",
    },
    updated: Date.now(),
  };
}

export function normalizeMolestPack(raw) {
  const base = emptyMolestPack();
  const s = raw && typeof raw === "object" ? raw : {};
  const slot = normalizeSlot(s.slot || {
    prompt: s.prompt,
    negative: s.negative,
    ref: s.ref,
    url: s.url,
  });
  return {
    id: String(s.id || base.id).slice(0, 24) || base.id,
    name: String(s.name || base.name).slice(0, 40) || base.name,
    attitude: String(s.attitude ?? base.attitude),
    playerAct: String(s.playerAct ?? s.player ?? base.playerAct),
    narrPrompt: String(s.narrPrompt ?? s.narr ?? base.narrPrompt),
    feelPrompt: String(s.feelPrompt ?? base.feelPrompt),
    // 猥褻產圖一律圖生圖
    imgMode: "ref",
    slot,
    updated: Number(s.updated) || Date.now(),
  };
}

/** 舊 acts.molest {narr,player} → 猥褻包 */
export function packsFromLegacyActs(list) {
  const src = Array.isArray(list) ? list : [];
  return src
    .map((x, i) => {
      const narr = String(x?.narr || "").trim();
      const player = String(x?.player || "").trim();
      if (!narr && !player) return null;
      const p = emptyMolestPack(`猥褻 ${i + 1}`);
      p.playerAct = player || p.playerAct;
      p.narrPrompt = narr
        ? `依這句方向寫旁白（可改寫通順，勿加口交／做愛）：${narr}`
        : p.narrPrompt;
      return p;
    })
    .filter(Boolean);
}

export function normalizeMolestPacks(rawList, legacyActs) {
  const list = Array.isArray(rawList) ? rawList.map(normalizeMolestPack).filter((p) => p.id) : [];
  if (list.length) return list;
  const migrated = packsFromLegacyActs(legacyActs);
  return migrated.length ? migrated : [emptyMolestPack("預設猥褻")];
}

export function filledPack(pack, girl, playerName = "你") {
  const p = normalizeMolestPack(pack);
  return {
    ...p,
    attitude: fillBinds(p.attitude, girl, playerName),
    playerAct: fillBinds(p.playerAct, girl, playerName),
    narrPrompt: fillBinds(p.narrPrompt, girl, playerName),
    feelPrompt: fillBinds(p.feelPrompt, girl, playerName),
    slot: {
      ...p.slot,
      prompt: fillBinds(p.slot.prompt, girl, playerName),
      negative: fillBinds(p.slot.negative, girl, playerName),
    },
  };
}

export function joinPromptParts(...parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const bit of String(part || "").split(",")) {
      const s = bit.trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.join(", ");
}

/** 跟 testword 一樣：先抓人設基礎 prompt（空 extra），再給呼叫端疊加輸入。 */
export async function fetchMolestBasePrompt(girl, eng = {}, style = "anime") {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const body = {
    key: `molest-base:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: comfy ? (eng.imgModel || eng.llmModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
    framing: "half",
    rating: "nsfw",
    style: style || "anime",
    character: girl,
    extra: "",
    negative: "",
    prompt: "",
    cutout: false,
    lock_identity: true,
    scene_kind: "script",
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: eng.comfyCkpt || "" } : {}),
  };
  const r = await fetch("/api/imggen/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || r.status);
  const tr = j.trace || {};
  return {
    positive: String(tr.comfy_prompt || "").trim(),
    negative: String(tr.comfy_negative || "").trim(),
    grokPrompt: String(tr.grok_prompt || "").trim(),
    provider: tr.provider || body.provider,
  };
}

export function mergeMolestPrompts(base, userPos, userNeg) {
  const b = base || { positive: "", negative: "" };
  return {
    positive: joinPromptParts(b.positive, userPos),
    negative: joinPromptParts(b.negative, userNeg),
    basePositive: String(b.positive || "").trim(),
    baseNegative: String(b.negative || "").trim(),
    userPositive: String(userPos || "").trim(),
    userNegative: String(userNeg || "").trim(),
  };
}

/** 輸出 prompt 說明字串（給編輯頁預覽） */
export function formatOutputPromptSheet(merged) {
  const m = merged || {};
  return [
    "【基礎正向】",
    m.basePositive || "（尚未抓到／沒選魅子）",
    "",
    "【＋輸入正向】",
    m.userPositive || "（空白）",
    "",
    "【合併正向 → 送出】",
    m.positive || "（空）",
    "",
    "【基礎負向】",
    m.baseNegative || "（空）",
    "",
    "【＋輸入負向】",
    m.userNegative || "（空白）",
    "",
    "【合併負向 → 送出】",
    m.negative || "（空）",
  ].join("\n");
}

/**
 * 組生圖下單。一定要有參考圖（圖生圖）。
 * Comfy：prompt = 基礎＋輸入（整份原樣送）；Grok：extra = 輸入正向（人設由伺服器打底）。
 */
export async function buildMolestImgBody(pack, girl, eng = {}, style = "anime") {
  const p = normalizeMolestPack(pack);
  const ref = String(p.slot?.ref || "").trim();
  if (!ref) {
    throw new Error("猥褻產圖一定要圖生圖，請先上傳參考圖");
  }
  const userPos = fillBinds(p.slot.prompt, girl);
  const userNeg = fillBinds(p.slot.negative, girl);
  const base = await fetchMolestBasePrompt(girl, eng, style);
  const merged = mergeMolestPrompts(base, userPos, userNeg);
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  return {
    body: {
      key: `date-molest:${girl?.id || "x"}:${Date.now().toString(36)}`,
      provider: comfy ? "comfy" : "grok-img",
      model: comfy ? (eng.imgModel || eng.llmModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
      framing: "half",
      rating: "nsfw",
      style: style || "anime",
      character: girl,
      outfit: "",
      // Comfy 吃整份合併 prompt；Grok 整張圖以 character 打底、extra 加輸入正向
      prompt: comfy ? merged.positive : "",
      extra: comfy ? "" : merged.userPositive,
      negative: merged.negative,
      visual_neg: merged.negative,
      cutout: false,
      lock_identity: true,
      retry: true,
      scene_kind: "script",
      pose_ref: ref,
      pose_denoise: 0.55,
      ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: eng.comfyCkpt || "" } : {}),
    },
    merged,
    base,
  };
}

/** 同步輸出預覽用（已有 base 快取時） */
export function outputPromptOf(pack, girl, playerName = "你", base = null) {
  const f = filledPack(pack, girl, playerName);
  if (!base) return String(f.slot.prompt || "").trim();
  return mergeMolestPrompts(base, f.slot.prompt, f.slot.negative).positive;
}

export function buildMolestReplyMsgs(girlName, attitude, feelPrompt, narr, playerAct, stage) {
  const who = girlName || "她";
  return [
    {
      role: "system",
      content: [
        `你是「${who}」。只輸出台詞，不要旁白、不要引號、不要寫身體畫面。`,
        "1～3 句繁中。旗標不要。",
        `關係階段：${stage || "stranger"}。`,
        attitude ? `這一景態度：${attitude}` : "",
        feelPrompt ? `身體感覺提示：${feelPrompt}` : "",
        "這是約會現場的猥褻拍，不要自己演成口交或做愛。",
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: [
        narr ? `（旁白：${narr}）` : "",
        playerAct ? `（他做了／說了：${playerAct}）` : "",
        "用口語接這一拍。",
      ].filter(Boolean).join("\n"),
    },
  ];
}

export function buildMolestNarrMsgs(narrPrompt, playerAct, girlName) {
  const who = girlName || "她";
  return [
    {
      role: "system",
      content: [
        "你是約會場景旁白。只寫 1～2 句繁中旁白：體態、神情、現場。",
        "不要寫人物台詞，不要下指令，不要口交或做愛，不要唸數值。",
        narrPrompt ? `設計者旁白方向：${narrPrompt}` : "",
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: `對「${who}」發生：${playerAct || "玩家動手猥褻"}。依方向寫旁白。`,
    },
  ];
}
