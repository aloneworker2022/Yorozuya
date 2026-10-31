// 2026-10-26 pt285u：床鋪背後組（prone）——她趴在床上，他從背後壓著肏，鏡頭在兩人後面（從背後看）。
//   五步同旅館做愛：open 準備／tip 頂住／thrust 做愛／cum 射（內射）／orgasm 她高潮。伺服器 shot＝sex_prone_<step>。
//   走 tease 雙人管線（借 doggy 的下單骨架，換 shot＋prompt）；局部動圖用背後（doggy）。
import { buildSexStepImgBody } from "./sex_pose_packs.js?v=11";

export const PRONE_STEPS = ["open", "tip", "thrust", "cum", "orgasm"];
export const proneShot = (step) => `sex_prone_${PRONE_STEPS.includes(step) ? step : "thrust"}`;

const BASE = "1man, 1girl, prone bone, lying on stomach, girl lying face down on bed, flat on bed, legs together, legs straight, on bed, white bed sheets, pillow, "
  + "man lying on top of her, man pressing her down from behind, his body covering her back, his chest on her back, "
  + "view from behind, camera behind them, from behind, back view, seen from behind and slightly above, both backs visible, her buttocks and his hips in foreground, "
  + "her face turned to the side on the pillow, cheek on pillow, faceless shadow man, black semi-transparent silhouette, translucent dark silhouette, "
  + "nude, completely nude, full body";
const BEAT = {
  open: "his hands on her hips, about to enter, penis not inserted yet, anticipation, blush, nervous breathing",
  tip: "glans pressed against her pussy from behind, penis tip at entrance, not inserted yet, pussy, labia, pussy juice, blush",
  thrust: "sex, vaginal, penis inside, thrusting, his hips pounding down on her ass, ass ripple, jiggling buttocks, motion lines, skin slapping, sweat, moaning, drooling on pillow, gripping bed sheets",
  cum: "sex, vaginal, deep penetration, creampie, cum inside, cum overflowing from pussy, his hips pressed down against her ass, trembling, sweat, heavy breathing",
  orgasm: "sex, vaginal, deep penetration, female orgasm, convulsing, trembling, toes curling, gripping bed sheets, tongue out, rolling eyes, drooling on pillow, sweat",
};
export const pronePrompt = (step) => `${BASE}, ${BEAT[step] || BEAT.thrust}, nsfw, explicit`;
export const PRONE_NEG = "doggystyle, all fours, kneeling, ass up, missionary, lying on back, cowgirl, girl on top, from front, front view, face visible to viewer, pov from front";

/** 下單 body（/api/imggen）。 */
export function buildProneImgBody(step, girl, eng = {}) {
  const base = buildSexStepImgBody("doggy", "thrust", null, girl, eng);
  const shot = proneShot(step);
  return { ...base, key: `swap-${shot}:${girl?.id || "x"}:${Date.now().toString(36)}`, shot, framing: "full", extra: pronePrompt(step), negative: PRONE_NEG, visual_neg: PRONE_NEG };
}
