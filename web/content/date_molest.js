/** 約會猥褻劇本：玩家包一定圖生圖；單男包文生圖（1girl 女孩基礎 → 1boy＋lookEn＋動作）。 */

import { fillBinds, bindHint, uid, normalizeSlot } from "./script_mode.js";
import { girlForDate, dateOutfitText, pickDateOutfit } from "./date_outfit.js";
import { placeOf, placeZh, placeEn, fillPlaceTokens } from "./date_place.js";

export { fillBinds, bindHint };

export function emptyMolestPack(name = "猥褻劇本") {
  return {
    id: uid(),
    name: String(name || "猥褻劇本").slice(0, 40),
    attitude: "依關係：陌生驚怒擋開、朋友羞怒、女友又羞又受、妻子默許享受。不要自己演成口交或做愛。",
    playerAct: "你從後面把手伸向 [name] 的 [waist]。",
    narrPrompt: "寫 1～2 句旁白：玩家對 [name] 動手猥褻的現場（體態、視線、周圍人潮）。不要寫成口交或做愛，不要寫台詞。",
    feelPrompt: "這一拍身體感覺：被碰到的部位、緊張／羞恥／快感（依關係）。只影響台詞口氣，不要自己描述肢體。",
    placeId: "plaza",
    imgMode: "ref",
    poseDenoise: 0.55,
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
  const mode = String(s.imgMode || base.imgMode || "ref").toLowerCase() === "txt" ? "txt" : "ref";
  return {
    id: String(s.id || base.id).slice(0, 24) || base.id,
    name: String(s.name || base.name).slice(0, 40) || base.name,
    attitude: String(s.attitude ?? base.attitude),
    // maleAct / male：單男猥褻包把男子動作寫在 playerAct
    playerAct: String(s.playerAct ?? s.maleAct ?? s.player ?? s.male ?? base.playerAct),
    narrPrompt: String(s.narrPrompt ?? s.narr ?? base.narrPrompt),
    feelPrompt: String(s.feelPrompt ?? base.feelPrompt),
    placeId: strPlace(s.placeId || s.place || base.placeId),
    // 玩家猥褻一律圖生圖；單男猥褻可用 txt（文生圖）
    imgMode: mode,
    poseDenoise: clampDenoise(s.poseDenoise ?? s.pose_denoise ?? base.poseDenoise),
    slot,
    updated: Number(s.updated) || Date.now(),
  };
}

function strPlace(id) {
  const p = placeOf(id);
  return p.id;
}

function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 舊 acts.molest {narr,player} → 猥褻包 */
export function packsFromLegacyActs(list) {
  const src = Array.isArray(list) ? list : [];
  return src
    .map((x, i) => {
      const narr = String(x?.narr || "").trim();
      // 玩家：player；單男舊池：male → 一律寫進 playerAct
      const player = String(x?.player || x?.male || x?.playerAct || x?.maleAct || "").trim();
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

export function filledPack(pack, girl, playerName = "你", placeId) {
  const p = normalizeMolestPack(pack);
  const pid = placeId || p.placeId || "plaza";
  const fill = (text) => fillPlaceTokens(fillBinds(text, girl, playerName), pid);
  return {
    ...p,
    placeId: pid,
    placeName: placeOf(pid).name,
    placeZh: placeZh(pid),
    attitude: fill(p.attitude),
    playerAct: fill(p.playerAct),
    narrPrompt: fill(p.narrPrompt),
    feelPrompt: fill(p.feelPrompt),
    slot: {
      ...p.slot,
      prompt: fill(p.slot.prompt),
      negative: fill(p.slot.negative),
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


/** 生圖用這位魅子自帶的 Comfy checkpoint（跟主遊戲立繪同一規則）。 */
function girlOwnCkpt(girl) {
  return String(girl?.comfyCkpt || "").trim();
}

/** 跟 testword 一樣：先抓人設基礎 prompt（空 extra），再給呼叫端疊加輸入。 */
export async function fetchMolestBasePrompt(girl, eng = {}, style = "anime", relStage = "stranger") {
  if (!girl) throw new Error("先選魅子");
  const dated = girlForDate(girl, pickDateOutfit(girl, relStage));
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const body = {
    key: `molest-base:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: comfy ? (eng.imgModel || eng.llmModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
    framing: "half",
    rating: "nsfw",
    style: style || "anime",
    character: dated,
    outfit: dateOutfitText(dated),
    extra: "",
    negative: "",
    prompt: "",
    cutout: false,
    lock_identity: true,
    scene_kind: "script",
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: girlOwnCkpt(dated) || girlOwnCkpt(girl) } : {}),
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
export async function buildMolestImgBody(pack, girl, eng = {}, style = "anime", relStage = "stranger", placeId) {
  const p = normalizeMolestPack(pack);
  const pid = placeId || p.placeId || "plaza";
  const ref = String(p.slot?.ref || "").trim();
  if (!ref) {
    throw new Error("猥褻產圖一定要圖生圖，請先上傳參考圖");
  }
  const outfitInfo = pickDateOutfit(girl, relStage);
  const dated = girlForDate(girl, outfitInfo);
  const userPos = fillPlaceTokens(fillBinds(p.slot.prompt, dated), pid);
  const userNeg = fillPlaceTokens(fillBinds(p.slot.negative, dated), pid);
  // 場所進正向：在哪裡發生
  const placePos = placeEn(pid);
  const base = await fetchMolestBasePrompt(girl, eng, style, relStage);
  const merged = mergeMolestPrompts(base, joinPromptParts(placePos, userPos), userNeg);
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  return {
    body: {
      key: `date-molest:${girl?.id || "x"}:${Date.now().toString(36)}`,
      provider: comfy ? "comfy" : "grok-img",
      model: comfy ? (eng.imgModel || eng.llmModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
      framing: "half",
      rating: "nsfw",
      style: style || "anime",
      character: dated,
      outfit: dateOutfitText(dated, outfitInfo),
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
      pose_denoise: clampDenoise(p.poseDenoise),
      ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: girlOwnCkpt(dated) || girlOwnCkpt(girl) } : {}),
    },
    merged,
    base,
    outfit: outfitInfo,
    dated,
    place: placeOf(pid),
  };
}

/** 同步輸出預覽用（已有 base 快取時） */
export function outputPromptOf(pack, girl, playerName = "你", base = null) {
  const f = filledPack(pack, girl, playerName);
  if (!base) return String(f.slot.prompt || "").trim();
  return mergeMolestPrompts(base, f.slot.prompt, f.slot.negative).positive;
}

/** 單男猥褻劇本包：文生圖，不需參考圖。男子動作仍寫在 playerAct。 */
export function emptyMaleMolestPack(name = "單男猥褻") {
  const p = emptyMolestPack(name);
  p.attitude = "依關係：陌生驚怒擋開、朋友羞怒、女友又羞又受、妻子默許。這是場上男子動手，不是玩家。不要自己演成口交或做愛。";
  p.playerAct = "男子從後面把手伸向 [name] 的 [waist]。";
  p.narrPrompt = "寫 1～2 句旁白：場上男子對 [name] 動手猥褻的現場（體態、視線、周圍人潮）。不要寫成口交或做愛，不要寫台詞。";
  p.feelPrompt = "這一拍身體感覺：被陌生／場上男子碰到的部位、緊張／羞恥／快感（依關係）。只影響台詞口氣，不要自己描述肢體。";
  p.imgMode = "txt";
  p.slot = {
    prompt: "1boy groping woman from behind, nsfw, public",
    negative: "looking at viewer, text, watermark, ugly, extra fingers, girl face focus",
    ref: "",
    url: "",
  };
  return p;
}

const MALE_MOLEST_FRAMING = "2people, 1girl, 1boy, hetero";
const MALE_MOLEST_ANTI_BLEED =
  "solo, 1girl only, one person, merged body, fused body, gender blend, masculine woman, girl with male physique, obese woman, fat woman as only subject";

/** Remove subject-count tags only when they lead an editor-supplied block. */
function stripLeadingSubjectTags(value) {
  let out = String(value || "").trim();
  while (/^(?:1boy|1girl)\b/i.test(out)) {
    out = out.replace(/^(?:1boy|1girl)\b\s*,?\s*/i, "").trim();
  }
  return out;
}

/**
 * 單男猥褻文生圖下單。不要求 pose_ref。
 * 正向固定分成【女孩】→BREAK→【男子】→BREAK→【場所／動作】；模型用女子 comfyCkpt。
 */
export async function buildMaleMolestImgBody(
  pack,
  maleType,
  girl,
  eng = {},
  style = "anime",
  placeId,
  customPlaces,
  relStage = "stranger",
) {
  if (!girl) throw new Error("先選魅子");
  const p = normalizeMolestPack({ ...pack, imgMode: "txt" });
  const pid = placeId || p.placeId || "plaza";
  const lookEn = String(maleType?.lookEn || "").trim();
  const userPos = String(p.slot?.prompt || "").trim();
  const userNeg = String(p.slot?.negative || "").trim();
  const customPlace = Array.isArray(customPlaces) ? customPlaces.find((x) => x?.id === pid) : null;
  const placePos = customPlace?.en || placeEn(pid);
  const outfitInfo = pickDateOutfit(girl, relStage);
  const dated = girlForDate(girl, outfitInfo);
  const base = await fetchMolestBasePrompt(girl, eng, style, relStage);
  const girlBlock = joinPromptParts("1girl", base.positive);
  const boyBlock = joinPromptParts("1boy", stripLeadingSubjectTags(lookEn));
  const sceneBlock = joinPromptParts(placePos, stripLeadingSubjectTags(userPos));
  // BREAK is for Comfy/anime tag parsers; the natural join is the Grok fallback.
  const positive = [
    MALE_MOLEST_FRAMING,
    girlBlock,
    "BREAK",
    boyBlock,
    "BREAK",
    sceneBlock,
  ].filter(Boolean).join(", ");
  const boyScene = [boyBlock, sceneBlock].filter(Boolean).join(". and ");
  const userNegative = joinPromptParts(userNeg, "looking at viewer, text, watermark, ugly, extra fingers");
  const negative = joinPromptParts(base.negative, userNegative, MALE_MOLEST_ANTI_BLEED);
  const merged = {
    positive,
    negative,
    framingPositive: MALE_MOLEST_FRAMING,
    girlBlock,
    boyBlock,
    sceneBlock,
    naturalPositive: [MALE_MOLEST_FRAMING, `${girlBlock}. and ${boyScene}`].filter(Boolean).join(", "),
    basePositive: girlBlock,
    baseNegative: String(base.negative || "").trim(),
    userPositive: boyScene,
    userNegative,
    antiBleedNegative: MALE_MOLEST_ANTI_BLEED,
  };
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  return {
    body: {
      key: `date-male-molest:${girl.id || "x"}:${maleType?.id || "male"}:${Date.now().toString(36)}`,
      provider: comfy ? "comfy" : "grok-img",
      model: comfy ? (eng.imgModel || eng.llmModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
      framing: "half",
      rating: "nsfw",
      style: style || "anime",
      character: dated,
      outfit: dateOutfitText(dated, outfitInfo),
      // Comfy 吃 BREAK 分隔的整份正向；Grok 仍由女子 character 打底，extra 用自然語法保留 1boy。
      prompt: comfy ? merged.positive : "",
      extra: comfy ? "" : boyScene,
      negative: merged.negative,
      visual_neg: merged.negative,
      cutout: false,
      lock_identity: true,
      retry: true,
      scene_kind: "script",
      ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: girlOwnCkpt(dated) || girlOwnCkpt(girl) } : {}),
    },
    merged,
    base: { ...base, positive: girlBlock },
    lookEn,
    place: customPlace || placeOf(pid),
    dated,
  };
}

/** 單男／旅館預覽：明列構圖、女孩、男子、場所／動作與實際合併字串。 */
export function formatMaleMolestOutputSheet(merged) {
  const m = merged || {};
  return [
    "【構圖】",
    m.framingPositive || MALE_MOLEST_FRAMING,
    "",
    "【1girl 女孩塊】",
    m.girlBlock || m.basePositive || "（尚未抓到／沒選魅子）",
    "",
    "【1boy 男子外觀塊】",
    m.boyBlock || "（空白）",
    "",
    "【場所／動作塊】",
    m.sceneBlock || "（空白）",
    "",
    "【Comfy 合併正向（BREAK 分隔）】",
    m.positive || "（空）",
    "",
    "【Grok extra（自然 . and 分隔）】",
    m.userPositive || "（空白）",
    "",
    "【基礎負向】",
    m.baseNegative || "（空）",
    "",
    "【＋輸入負向】",
    m.userNegative || "（空白）",
    "",
    "【固定防融合負向】",
    m.antiBleedNegative || MALE_MOLEST_ANTI_BLEED,
    "",
    "【合併負向 → 送出】",
    m.negative || "（空）",
  ].join("\n");
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
