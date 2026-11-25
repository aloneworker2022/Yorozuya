/* 用說的請她（2026-11-25 使用者，§13.0 第 4 項）：
   - 「摸一下啦」「讓我摸妳胸部」：那一階還沒解鎖時，交給她（模型）判斷要不要答應；答應**只准這一下**。
   - 「把衣服脫掉」「脫給我看」：她判斷要不要自己脫（一次一件；說「脫光」就全脫）。
   - 「我們做愛吧」（還有做愛鈕）：她判斷要不要；脫光了比較容易答應；陌生、朋友就算癱軟在地上也可能拒絕。
   使用者確認：要不要答應**交給模型判斷**（模型掛了才用這裡的機率保底）。
   只放純函式（認句子、組 prompt、解析、保底機率）；房間流程在 test_room_summon.js。 */
import { STAGE_IDX, STAGE_ZH, stageIndexOf } from "./girl_voice.js?v=1";

const SEX_RE = /做愛|愛愛|啪啪|上床|來做吧|要不要做|我們做吧|跟我做|想上妳|想上你|想跟妳做|想跟你做/;
const UNDRESS_RE = /脫(衣服|掉|光|下來|給我看|一下|吧|啦)|把.{0,8}脫|衣服.{0,4}脫/;
const SELF_UNDRESS_RE = /我(先|來)?脫|我把.{0,6}脫/;
const ALL_OFF_RE = /脫光|全部脫|全脫|都脫/;
/** 有在請求的口氣。 */
const ASK_RE = /讓我|給我|可以|能不能|能讓|好不好|好嘛|一下啦|一下嘛|一下好|一下下|拜託|嘛|啦|好嗎|行嗎/;
const TOUCH_VERB_RE = /摸|碰|揉|捏|舔|吸|親|抱|摟/;

/**
 * 這句是不是在請她做什麼。
 * @param {string} text
 * @param {{ touchCls?: {kind:string, actId:string}, nextLockedAct?: string, actLocked?: (id:string)=>boolean }} ctx
 *   touchCls：verbal_tease.classifyUserText 的結果；nextLockedAct：下一個還沒解鎖的動作；actLocked：那個動作鎖著嗎
 * @returns {null | { kind: "touch", actId: string } | { kind: "undress", all: boolean } | { kind: "sex" }}
 */
export function classifyRequest(text, ctx = {}) {
  const s = String(text || "").trim();
  if (!s) return null;
  if (SEX_RE.test(s)) return { kind: "sex" };
  if (UNDRESS_RE.test(s) && !SELF_UNDRESS_RE.test(s)) return { kind: "undress", all: ALL_OFF_RE.test(s) };
  const cls = ctx.touchCls;
  // 打字動手、對得上鈕、但那顆還鎖著 → 當成請求（她決定）
  if (cls && cls.kind === "touch" && cls.actId && ctx.actLocked && ctx.actLocked(cls.actId)) return { kind: "touch", actId: cls.actId };
  // 「摸一下啦」沒說哪裡 → 請下一階
  if ((!cls || cls.kind === "none") && TOUCH_VERB_RE.test(s) && ASK_RE.test(s) && ctx.nextLockedAct) return { kind: "touch", actId: ctx.nextLockedAct };
  return null;
}

const KIND_ZH = { touch: "讓他碰", undress: "自己把衣服脫掉", sex: "跟他做愛" };

/** 各種請求、各關係帶的傾向（給模型參考，不是硬規則）。 */
function leaning(kind, stage, { nude = false } = {}) {
  const i = stageIndexOf(stage);
  if (kind === "sex") {
    if (i < STAGE_IDX.girlfriend) return "你們還沒交往：就算身體很想要、已經癱軟在地上，大多還是拒絕（還沒到那種關係）；只有你真的被撩得受不了、個性又放得開，才可能答應。";
    if (i < STAGE_IDX.wife) return `你們在交往：越想要越容易答應；${nude ? "你已經脫光了，更容易答應" : "還穿著衣服的話會猶豫一點"}；在生氣就拒絕。`;
    return "你是他老婆：幾乎都答應，除非你正在生氣或很累。";
  }
  if (kind === "undress") {
    if (i < STAGE_IDX.friend) return "你們還不熟：多半拒絕；除非已經被撩得很想要。";
    if (i < STAGE_IDX.girlfriend) return "你們是朋友：會猶豫，看你現在的態度和想不想要。";
    return "你們在交往或已經結婚：多半答應，除非在生氣。";
  }
  if (i < STAGE_IDX.friend) return "你們還不熟：多半拒絕；身體已經有感覺的話才可能半推半就讓他碰一下。";
  if (i < STAGE_IDX.girlfriend) return "你們是朋友：越裡面越難答應；看你現在的態度和身體。";
  return "你們在交往或已經結婚：多半答應，除非在生氣。";
}

/**
 * 給模型的判斷指令（接在房間聊天的 system 後面當最後一則 user）。
 * @param {"touch"|"undress"|"sex"} kind
 * @param {object} c stage／what（請求的內容，例如「摸你的胸部」）／attitude（態度中文）／arousal（性奮階段中文）／
 *   undress（穿著描述）／collapsed／stunned／invasion／mood（情緒中文）／asked（他說的那句）
 */
export function requestPrompt(kind, c = {}) {
  const stage = c.stage || "stranger";
  const facts = [
    `關係：${STAGE_ZH[stage] || "陌生"}。`,
    c.attitude ? `你對他動手動腳的態度：${c.attitude}。` : "",
    c.arousal ? `身體：${c.arousal}${c.collapsed ? "，剛噴過、腿軟癱坐在地上" : ""}${c.stunned ? "，腦袋一片空白" : ""}。` : "",
    c.undress ? `穿著：${c.undress}。` : "",
    Number(c.invasion) >= 50 ? "他剛才已經讓你很不舒服了。" : "",
    c.mood ? `心情：${c.mood}。` : "",
  ].filter(Boolean).join("");
  return [
    `（旁白：他${c.asked ? `說「${c.asked}」，` : ""}想要你${KIND_ZH[kind]}${c.what ? `（${c.what}）` : ""}。你要自己決定答不答應。）`,
    `【你自己決定】${facts}`,
    `傾向：${leaning(kind, stage, c)}照你的個性決定。`,
    kind === "touch" ? "答應也只准這一下。" : "",
    "輸出格式（一定照這個）：第一行只寫「答應」或「拒絕」兩個字；第二行寫你說出口的話（1～2 句，不要旁白、不要動作描寫）。",
  ].filter(Boolean).join("\n");
}

/** 解析模型回覆 → { yes: boolean|null, line }（看不出答應或拒絕＝null）。 */
export function parseDecision(text) {
  const raw = String(text || "").replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "").trim();
  if (!raw) return { yes: null, line: "" };
  const rows = raw.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const head = (rows[0] || "").replace(/[【】\[\]「」:：*#\s]/g, "");
  let yes = null;
  if (/^(答應|同意|好|可以)/.test(head)) yes = true;
  else if (/^(拒絕|不要|不行|不答應|不可以)/.test(head)) yes = false;
  let line = rows.slice(yes == null ? 0 : 1).join("").replace(/^(她說|台詞|說)[:：]/, "").replace(/^["「『]+|["」』]+$/g, "").trim();
  if (yes != null && !line && rows.length === 1) {
    // 「答應，……」寫在同一行
    line = rows[0].replace(/^[【\[]?(答應|同意|拒絕|不答應)[】\]]?[，,、:：\s]*/, "").trim();
  }
  return { yes, line };
}

/** 模型掛了的保底機率（0～1）：關係階、態度（0 拒絕～3 迎合）、性奮、脫光、侵犯。 */
export function fallbackYesChance(kind, { stage = "stranger", attitudeIdx = 0, arousalStage = "none", nude = false, invasion = 0, angry = false } = {}) {
  const i = stageIndexOf(stage);
  const ar = { none: 0, slight: 0.05, aroused: 0.1, wantFill: 0.2, climax: 0.25 }[arousalStage] || 0;
  let p;
  if (kind === "sex") p = i >= STAGE_IDX.wife ? 0.9 : i >= STAGE_IDX.girlfriend ? 0.35 + ar + (nude ? 0.2 : 0) : 0.03 + ar / 3;
  else if (kind === "undress") p = i >= STAGE_IDX.girlfriend ? 0.6 + ar : i >= STAGE_IDX.friend ? 0.15 + ar : 0.03 + ar / 2;
  else p = 0.1 + attitudeIdx * 0.25 + ar;
  if (angry) p *= 0.3;
  if (Number(invasion) >= 50) p *= 0.6;
  return Math.max(0, Math.min(0.97, p));
}
