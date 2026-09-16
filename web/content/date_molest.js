/** 約會猥褻（按鈕）劇本：接近 testword 劇本模式單景編輯。 */

import { fillBinds, bindHint, buildScriptImgBody, uid, normalizeSlot } from "./script_mode.js";

export { fillBinds, bindHint };

export function emptyMolestPack(name = "猥褻劇本") {
  return {
    id: uid(),
    name: String(name || "猥褻劇本").slice(0, 40),
    attitude: "依關係：陌生驚怒擋開、朋友羞怒、女友又羞又受、妻子默許享受。不要自己演成口交或做愛。",
    playerAct: "你從後面把手伸向 [name] 的 [waist]。",
    narrPrompt: "寫 1～2 句旁白：玩家對 [name] 動手猥褻的現場（體態、視線、周圍人潮）。不要寫成口交或做愛，不要寫台詞。",
    feelPrompt: "這一拍身體感覺：被碰到的部位、緊張／羞恥／快感（依關係）。只影響台詞口氣，不要自己描述肢體。",
    imgMode: "prompt",
    slot: { prompt: "", negative: "looking at viewer, text, watermark, ugly, extra fingers", ref: "", url: "" },
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
    imgMode: s.imgMode === "ref" ? "ref" : "prompt",
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

/** 輸出 prompt：展開後會送進生圖的正向字串 */
export function outputPromptOf(pack, girl, playerName = "你") {
  const f = filledPack(pack, girl, playerName);
  return String(f.slot.prompt || "").trim();
}

export function buildMolestImgBody(pack, girl, eng = {}, style = "anime") {
  const p = normalizeMolestPack(pack);
  const spec = { imgMode: p.imgMode, slots: [p.slot] };
  return buildScriptImgBody({
    girl,
    slot: p.slot,
    spec,
    scene: 1,
    imgProvider: eng.imgProvider || "grok-img",
    imgModel: eng.imgModel || "",
    llmModel: eng.llmModel || "",
    comfyUrl: eng.comfyUrl || "",
    comfyCkpt: eng.comfyCkpt || "",
    style,
    outfit: "",
    keyPrefix: "date-molest",
    pack: null,
    framePack: null,
    slotIndex: 0,
  });
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
