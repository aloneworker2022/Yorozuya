/* 換妻・對方妻子的接受度＋動作手牌（2026-10-23）——純規則，沒有 DOM／fetch，node 可以直接測。
 * 接受度 0–100（sess.accept）：舊存檔沒有 → 從 sess.aff.other（無上限整數）＋sess.progress 換算一次。
 * 動作卡：只從「已解鎖」的抽（接受度、她的醉度、場景三個條件）。成功＝沿用 acceptP 擲骰（大膽度），
 * 成功加接受度＋進度；被拒扣 2–5 並說一句拒絕。她爛醉（≥85）→ 做什麼都成功。
 * 你老婆在場看見 → 依她的忌妒心決定吃醋（緊張↑、放開↓）或變得更開放（放開↑、緊張↓），說一句。 */

import { dateOutfitOf } from "./swap_outfit.js?v=4";

/** 場景：bar（酒吧，沒有動作卡）／ktv／hotel_room／hotel_bath。 */
// 2026-10-24：酒吧（座位：親／摟；廁所：趁機）也有動作卡；誰能出由 swap_flow_rules.teaseWhere 決定（配對、她在不在廁所）
export const TEASE_SCENES = ["bar", "bar_toilet", "ktv", "hotel_room", "hotel_bath"];
export const BAR_ACTS = new Set(["waist", "kiss", "breast", "breast_knead", "oral", "labia", "finger_in", "sex"]);
export const SCENE_ZH = { park: "夜晚公園", bar: "酒吧", bar_toilet: "酒吧廁所", ktv: "KTV 包廂", hotel_room: "旅館房間", hotel_bath: "旅館浴室" };
/** 場景 → SCENE_CAP 用的大類（碰觸／調情上限）。公園跟酒吧一樣只有輕碰。 */
export const sceneBase = (scene) => {
  const s = String(scene || "");
  if (s.startsWith("hotel")) return "hotel";
  if (s === "ktv") return "ktv";
  if (s === "park") return "park";
  return "bar";
};

/** act＝圖的種類（tease~<act>）；acc／drunk＝門檻；scenes＝null 任何場景（KTV／飯店），否則限定。
 * sex：飯店房間＝正常體位（missionary），浴室＝背後（doggy）。 */
export const TEASE_CARDS = [
  // 2026-10-25：KTV 脫衣兩階段（strip：1＝脫到剩內衣、2＝脫光）。只在 KTV 包廂；沒有圖（立繪換 under／nude 造型）
  { id: "t_strip1", act: "strip1", strip: 1, zh: "幫她脫掉外衣", bold: 3, icon: "hand", acc: 30, drunk: 0, noImg: true, scenes: ["ktv"] },
  { id: "t_waist", act: "waist", zh: "摟她的腰", bold: 1, icon: "hand", acc: 10, drunk: 0 },
  { id: "t_kiss", act: "kiss", zh: "接吻", bold: 2, icon: "lips", acc: 15, drunk: 0, noImg: true, okAcc: 5 },
  { id: "t_butt", act: "butt", zh: "摸她的屁股", bold: 2, icon: "hand", acc: 20, drunk: 0 },
  { id: "t_breast", act: "breast", zh: "摸她的胸部", bold: 2, icon: "hand", acc: 25, drunk: 20 },
  { id: "t_knead", act: "breast_knead", zh: "揉她的胸部", bold: 3, icon: "hand", acc: 35, drunk: 30 },
  { id: "t_suck", act: "breast_suck", zh: "吸她的奶頭", bold: 3, icon: "lips", acc: 45, drunk: 30, okAcc: 5 },
  { id: "t_lick", act: "nipple_lick", zh: "舔她的奶頭", bold: 3, icon: "lips", acc: 45, drunk: 30, okAcc: 5 },
  { id: "t_labia", act: "labia", zh: "摸她的陰唇", bold: 4, icon: "hand", acc: 50, drunk: 45 },
  { id: "t_labia_rub", act: "labia_rub", zh: "揉她的陰唇", bold: 4, icon: "hand", acc: 55, drunk: 45 },
  { id: "t_oral", act: "oral", zh: "讓她幫你口交", bold: 4, icon: "lips", acc: 60, drunk: 45, okAcc: 5 },
  { id: "t_finger_in", act: "finger_in", zh: "手指插進去", bold: 4, icon: "hand", acc: 65, drunk: 60 },
  { id: "t_vagina_finger", act: "vagina_finger", zh: "扣她的陰道", bold: 5, icon: "hand", acc: 70, drunk: 60 },
  { id: "t_cervix", act: "cervix_rub", zh: "揉她的子宮口", bold: 5, icon: "hand", acc: 80, drunk: 60, scenes: ["hotel_room", "hotel_bath"] },
  { id: "t_sex", act: "sex", zh: "跟她做愛", bold: 5, icon: "heart", acc: 70, drunk: 0, scenes: ["bar_toilet", "hotel_room", "hotel_bath"] },   // 2026-10-25：KTV 不交配、酒吧座位不行
].map((c) => ({ ...c, who: "other", tease: true }));

export const TEASE_FX = {
  okAcc: [0, 3, 3, 4, 4, 5],        // 成功：接受度 +（依大膽度）
  okProg: 2,                        // 成功：進度 + 大膽度×okProg
  noAcc: [0, 2, 2, 3, 4, 5],        // 被拒：接受度 −（2–5）
  perAcc: 0.008,                    // 擲骰：接受度每高於 50 一點 +0.8%
  wasted: 85,                       // 她醉度 ≥ 這個：自動成功
  handTease: 0.7,                   // 抽卡時抽到動作卡的機率（有解鎖的話）
};
/** 你老婆看到：忌妒 → 吃醋；否則變開放。 */
export const WIFE_SEE = {
  p: 0.6,                            // 每次成功的動作被她看到並反應的機率
  jealousBase: 0.35, perJealousy: 0.008, perNerves: 0.3, perOpen: -0.4, perDrunk: -0.003,
  jealous: { nerves: 0.08, open: -0.04 },
  open: { nerves: -0.05, open: 0.07 },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** 舊存檔相容：沒有 sess.accept 就從 aff.other（每點 ×5）＋progress（×0.3）換算。回寫進 sess。 */
export function ensureAccept(sess) {
  if (!sess || typeof sess !== "object") return 0;
  const n = Number(sess.accept);
  if (Number.isFinite(n)) { sess.accept = clamp(Math.round(n), 0, 100); return sess.accept; }
  const aff = Number(sess.aff?.other) || 0, prog = Number(sess.progress) || 0;
  sess.accept = clamp(Math.round(aff * 5 + prog * 0.3), 0, 100);
  return sess.accept;
}

export const sceneOk = (card, scene) => TEASE_SCENES.includes(scene) && (!card.scenes || card.scenes.includes(scene)) && (!String(scene).startsWith("bar") || BAR_ACTS.has(card.act));
/** 這張卡現在能不能抽：場景、接受度、她的醉度。回 { ok, why }。 */
/** 脫衣卡只能照順序：現在 strip＝0 才能脫外衣，＝1 才能脫內衣。 */
export const stripOk = (card, strip = 0) => !card?.strip || (Number(strip) || 0) === card.strip - 1;
export function teaseGate(card, { accept = 0, drunk = 0, scene = "bar", wifeAccept = null, strip = 0 } = {}) {
  if (!sceneOk(card, scene)) return { ok: false, why: "場景不對" };
  if (accept < card.acc) return { ok: false, why: `接受度 ${card.acc}` };
  if (drunk < card.drunk) return { ok: false, why: `醉度 ${card.drunk}` };
  if (!stripOk(card, strip)) return { ok: false, why: strip >= (card.strip || 0) ? "已經脫了" : "要先脫外衣" };
  void wifeAccept;   // 2026-10-24：拿掉 70 的階段門檻；做愛只看她自己的接受度（卡上 acc）
  return { ok: true, why: "" };
}
export const unlockedTease = (st) => TEASE_CARDS.filter((c) => teaseGate(c, st).ok);

/** 成功率：基礎 p（swap_bar 的 acceptP）＋接受度修正；爛醉＝1。 */
export function teaseChance(baseP, { accept = 0, drunk = 0 } = {}) {
  if (drunk >= TEASE_FX.wasted) return 1;
  return clamp(baseP + (accept - 50) * TEASE_FX.perAcc, 0.05, 0.97);
}
/** 結算：回 { dAcc, dProg }（不改 sess）。 */
export function teaseResult(card, ok) {
  const b = clamp(card.bold, 1, 5);
  const gain = Number.isFinite(card.okAcc) ? card.okAcc : TEASE_FX.okAcc[b];
  return ok ? { dAcc: gain, dProg: b * TEASE_FX.okProg } : { dAcc: -TEASE_FX.noAcc[b], dProg: 0 };
}

/** 做愛姿勢：房間正常體位、浴室背後。 */
export const sexPoseFor = (scene) => (scene === "hotel_bath" || scene === "bar" || scene === "bar_toilet" ? "doggy" : "missionary");
/** 動作圖要不要裸體版：飯店（房間／浴室）裸體；KTV 穿衣；x-ray 兩張沒有裸體版。 */
export const NO_NUDE = new Set(["vagina_finger", "cervix_rub", "oral"]);
export const teaseNude = (act, scene, strip = 0) => sceneBase(scene) === "hotel" && !NO_NUDE.has(act);   // 2026-10-25：KTV 沒有全裸
/** KTV 脫到剩內衣（strip=1）：局部圖用「內衣」那組（tease~act~under）。 */
export const teaseUnder = (act, scene, strip = 0) => sceneBase(scene) === "ktv" && strip >= 1 && !NO_NUDE.has(act);
export const teaseKey = (act, nude) => `tease~${act}${nude === "under" ? "~under" : nude ? "~nude" : ""}`;
export const sexKey = (pose, step) => `sex~${pose}~${step}`;
/** 某場景要預產的圖鍵：KTV＝KTV 能解鎖的所有動作（穿衣）；飯店＝房間／浴室動作（裸體）＋該姿勢 3 步。 */
export function pregenKeys(scene) {
  const out = [];
  for (const c of TEASE_CARDS) {
    if (!sceneOk(c, scene) || c.noImg) continue;   // 接吻等純文字卡：不預產圖
    if (c.act === "sex") { const pose = sexPoseFor(scene); for (const s of ["open", "join", "thrust"]) out.push({ kind: "sex", pose, step: s, key: sexKey(pose, s) }); }
    else { const nude = teaseNude(c.act, scene); out.push({ kind: "tease", act: c.act, nude, key: teaseKey(c.act, nude) }); }
  }
  return out;
}

/** 你老婆看到你對她動手：吃醋還是更開放。rand 可換（測試）。回 { kind: "jealous"|"open", nerves, open }（新值）。 */
export function wifeSees(wife, { nerves = 0, open = 0, drunk = 0 } = {}, rand = Math.random) {
  const j = Number(wife?.stats?.jealousy ?? 50);
  const pJ = clamp(WIFE_SEE.jealousBase + (j - 50) * WIFE_SEE.perJealousy + nerves * WIFE_SEE.perNerves + open * WIFE_SEE.perOpen + drunk * WIFE_SEE.perDrunk, 0.05, 0.95);
  const kind = rand() < pJ ? "jealous" : "open", fx = WIFE_SEE[kind];
  return { kind, pJ, nerves: clamp(nerves + fx.nerves, 0, 1), open: clamp(open + fx.open, 0, 1) };
}
export const WIFE_SEE_FB = {
  jealous: ["（咬著嘴唇瞪了你一眼）……你、你摸得很開心嘛。", "（別過頭去，聲音有點酸）哼……隨便你。", "（拉了拉你的衣角，小聲）……不要只顧著她啦。"],
  open: ["（臉紅紅地偷看你們，呼吸有點亂）……原來是這種感覺啊。", "（看著你們，慢慢放鬆下來）……好像也沒那麼可怕了。", "（咬著吸管偷笑）……老公你好色喔。"],
};
export const TEASE_REFUSE_FB = ["（抓住你的手，搖搖頭）……這個還不行啦。", "（往旁邊躲開）等、等一下……太快了。", "（輕輕推開你）……別在這裡。", "（皺起眉）……你想得美。"];
export const TEASE_OK_FB = ["（身體一僵，皮膚卻燙了起來，沒有推開）……嗯……好癢……", "（臉紅到耳根，腿微微發抖）……輕一點……那裡好敏感……", "（呼吸變重，軟軟靠到你身上）……被你弄得麻麻的……你好壞。", "（咬著唇，身子一陣酥）……好熱……心跳好快……"];

// ---- 對方妻子的長相 → 房間人設 look 格式（伺服器 sdtags 的中文表鍵），讓動作圖的 prompt 吃得到她的長相
const HAIR_MAP = { 黑色鮑伯短髮: ["俐落短鮑伯", "烏黑"], 栗色長捲髮: ["栗色大波浪", "栗色"], 茶色低馬尾: ["低馬尾", "深棕"], 黑長直髮: ["烏黑長直髮", "烏黑"], 蜜棕色中長髮: ["鎖骨長度的內彎髮", "淺棕"], 盤髮: ["丸子頭", "深棕"] };
const CUP_MAP = { A: "A 罩杯、小巧清秀", B: "B 罩杯、剛好一手掌握", C: "B 罩杯、挺俏", D: "D 罩杯、飽滿有份量", E: "E 罩杯、軟彈有乳溝", F: "E 罩杯、傲人豐滿" };
const PICK = {
  eyes: ["下垂眼、看起來很溫柔", "標準的杏仁眼、眼皮乾淨", "內雙、笑起來眼尾會彎", "細長的丹鳳眼", "含情的桃花眼、天生勾人"],
  eye_color: ["深棕色瞳孔", "深棕色瞳孔", "琥珀色瞳孔"],
  face: ["標準的鵝蛋臉", "尖下巴的瓜子臉", "輪廓深、五官立體", "五官偏平、乾淨清秀"],
  mouth: ["飽滿的厚唇", "微微上揚的嘴角", "唇色紅潤、像抹了口紅", "花瓣一樣的唇形"],
  breast_shape: ["自然圓潤", "水滴型", "半球型", "鐘型"],
  areola: ["圓潤櫻花粉、中等大小乳暈", "偏大一圈的粉褐乳暈", "淺褐帶點雀斑感的自然乳暈"],
  nipple: ["粉嫩、微微凸起的乳頭", "咖啡色、微微凸起的乳頭", "明顯挺立的咖啡色乳尖"],
  labia_size: ["適中微開的陰唇", "外翻飽滿的陰唇"],
  labia_color: ["淺褐自然的陰唇", "深褐近黑的陰唇"],
  clitoris_size: ["明顯可見的陰蒂", "小巧含蓄的陰蒂"],
  pubic_hair: ["稀疏細軟的陰毛", "適中自然的陰毛", "濃密茂盛的陰毛", "完全剃光、沒有陰毛"],
};
function hashOf(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
/** 同一位對方妻子永遠同一份（用她 id 雜湊挑）。已有完整 generateGirl 欄位時不發明。 */
export function roomLookOf(w = {}) {
  const L = w.look || {}, out = { ...L };
  const real = !!(L.face && L.eyes && (L.hair_color || L.hair));
  const cup = String(L.cup || "").trim();
  if (cup && !/罩杯/.test(cup)) out.cup = CUP_MAP[cup[0].toUpperCase()] || cup;
  out.age = out.age || w.age || L.age || "";
  if (real) return out;   // 真欄位齊了：不再雜湊發明
  const h0 = hashOf(w.id || w.name || "x");
  const hm = HAIR_MAP[L.hair];
  if (hm) { out.hair = hm[0]; out.hair_color = out.hair_color || hm[1]; }
  let i = 0;
  for (const [k, opts] of Object.entries(PICK)) { if (!out[k]) out[k] = opts[((h0 >>> (i % 24)) + i) % opts.length]; i += 3; }
  out.swapLook = 1;
  return out;
}
/** 給 *_packs 生圖用的「魅子」：她自己的 ckpt、房間 look、衣服＝擁有的約會裝。 */
export function teaseGirlOf(c) {
  const w = c?.wife || {};
  const look = roomLookOf(w);
  const outfit = dateOutfitOf(w, "other");   // 2026-10-24：約會外出服（不是內衣／白 T）
  return { ...w, gender: "female", stage: "lover", role: w.role || "other_wife", comfyCkpt: w.comfyCkpt || w.ckpt || "", look, outfitName: outfit, outfitPick: w.outfitPick };
}
