/* 癱軟在地上被玩弄的動作閃現圖（2026-11-25 使用者，§13.0 第 6 項）。
   她噴水後癱坐在地上（M 字腿、手往後撐地、頭往上仰），你繼續摸：胸部／下面／手指插入各一張，全身取景、玩家 POV。
   穿著版跟召喚一起產（tease_floor_*）；脫光時用裸體版（tease_floor_*_nude，伺服器 garment=nude），第一次用到才背景產。
   固定 prompt，沒有編輯器（之後要調再做）。 */
import { wornOutfitOf } from "./outfit_pick.js?v=3";

/** 摸的部位 → shot。 */
export const FLOOR_SHOTS = Object.freeze({ breast: "tease_floor_breast", groin: "tease_floor_labia", finger: "tease_floor_finger" });
export const FLOOR_SHOT_LIST = Object.freeze(Object.values(FLOOR_SHOTS));

const BASE = [
  "full body",
  "sitting on the floor",
  "spread legs",
  "m legs",
  "leaning back",
  "arms behind back",
  "hands on floor",
  "head tilted back",
  "dazed",
  "half-closed eyes",
  "heavy blush",
  "open mouth",
  "sweat",
  "wet thighs",
  "simple background",
];
const ACTION = {
  tease_floor_breast: ["first-person POV", "one male hand", "male hand groping breast", "hand on breast"],
  tease_floor_labia: ["first-person POV", "one male hand", "male hand between legs", "fingers touching pussy", "rubbing pussy"],
  tease_floor_finger: ["first-person POV", "one male hand", "fingering", "male fingers inside pussy", "pussy juice"],
};
const NEG = "standing, walking, lying on back, extra arms, extra legs, extra hands, two male hands on the same spot, text, watermark";

/** 這個部位、穿不穿 → shot 鍵（裸體版加 _nude）。 */
export function floorShotKey(kind, nude = false) {
  const base = FLOOR_SHOTS[kind] || FLOOR_SHOTS.breast;
  return nude ? `${base}_nude` : base;
}

/** 動作 prompt（不含人設；生圖時由 character 合併）。 */
export function floorPrompt(shot) {
  const base = String(shot || "").replace(/_nude$/, "");
  return [...BASE, ...(ACTION[base] || ACTION.tease_floor_breast)].join(", ");
}

function resolveCkpt(girl, eng) {
  const ck = String(girl?.comfyCkpt || "").trim() || String(eng?.comfyCkpt || "").trim();
  if (!ck) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt）");
  return ck;
}

/** 組下單（同 labia_packs buildLabiaImgBody 的契約：character＋outfit＋extra(動作)＋她的 ckpt）。 */
export function buildFloorImgBody(shot, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const nude = /_nude$/.test(String(shot || ""));
  const worn = opts.worn != null ? opts.worn : wornOutfitOf(girl);
  return {
    key: `room-floor:${shot}:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: "full",
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: nude ? "" : worn,
    prompt: "",
    extra: floorPrompt(shot),
    negative: NEG,
    visual_neg: NEG,
    cutout: false,
    flat_bg: true,
    lock_identity: true,
    retry: true,
    scene_kind: "tease",
    shot,
    char_id: girl.id,
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: resolveCkpt(girl, eng) } : {}),
  };
}
