import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChatSex, nextSceneOf, SCENE_STEP } from "../web/content/swap_chat_sex.js";
import { normalizeData, pickPack } from "../web/content/script_mode.js";
const pack = pickPack(normalizeData(JSON.parse(readFileSync(new URL("../web/content/script_packs.json", import.meta.url)))), "sex");
assert.equal(nextSceneOf(2, "scene3"), 3); assert.equal(nextSceneOf(2, "player"), 4); assert.equal(nextSceneOf(3, "both"), 5); assert.equal(nextSceneOf(2, "ai"), 0);
assert.equal(SCENE_STEP[1], "open"); assert.equal(SCENE_STEP[2], "join");
const run = async (rolls) => {
  const seen = [], steps = []; let th = 0;
  const r = await runChatSex({ girl: { name: "美咲" }, narrate: async (t) => seen.push(t), reply: async () => {}, showStep: async (s) => steps.push(s), waitThrust: async () => { th++; }, roll: () => rolls.shift() || "none" }, pack);
  return { r, seen, steps, th };
};
let x = await run(["none", "ai", "scene3", "swap", "both"]);
assert.equal(x.r.climax, "both"); assert.equal(x.th, 5); assert.deepEqual(x.steps.slice(0, 3), ["open", "join", "thrust"]);
assert.ok(x.seen.every((t) => !/\[name\]/.test(t)) && x.seen.some((t) => t.includes("美咲")));
x = await run(["player"]); assert.equal(x.r.climax, "player"); assert.equal(x.th, 1);
x = await run(new Array(100).fill("none")); assert.equal(x.r.climax, "player"); assert.equal(x.th, 40);
// server 立繪 key 要收 nude／under／tipsy（以前只收 normal|shy → 旅館裸體立繪存不進去）
const py = readFileSync(new URL("../server/main.py", import.meta.url), "utf8");
assert.match(py, /\(wife\|husband\|other\)~\(normal\|shy\|tipsy\|under\|nude\)/);
console.log("swap_chat_sex ok");
// ---- pt263u：全抄（場景1 點兩下、每下肏好感骰＋局部動圖）、射精圖、做愛 CD
{
  const { animUrlCandidates, animPlan, FIRST_HOLDS, CONTINUE_HOLDS, rollSexCd, sexCdBlocks, tickSexCd } = await import("../web/content/swap_chat_sex.js");
  const taps = [], affs = []; let anims = 0;
  const r = await runChatSex({ girl: { name: "美咲" }, narrate: async () => {}, reply: async () => {}, waitThrust: async () => {}, waitTap: async (l) => taps.push(l),
    localAnim: async () => { anims++; }, aff: (d) => affs.push(d), affRoll: () => 2, roll: (() => { const q = ["none", "ai", "both"]; return () => q.shift(); })() }, pack);
  assert.equal(r.climax, "both"); assert.equal(anims, 3); assert.deepEqual(affs, [2, 2, 2]);
  assert.equal(taps[taps.length - 1], "開始"); assert.ok(taps.includes("下一句"));
  const fp = [{ id: "a", pose: "doggy", frames: { 1: { url: "/a1" }, 2: { url: "/a2" }, 3: { url: "/a3" }, 4: { url: "/a4" } } }];
  assert.deepEqual(animUrlCandidates({ pack: { pose: "doggy", scenes: {} }, scene: 2, girl: {}, framePacks: fp }).fallback, ["/a1", "/a2", "/a3", "/a4"]);
  assert.deepEqual(animUrlCandidates({ pack: { pose: "x" }, girl: { sexAnim: { x: { urls: ["/s1", "/s2"] } } }, framePacks: fp }).primary, ["/s1", "/s2"]);
  assert.deepEqual(animPlan(["1", "2", "3", "4"], false).map((x) => x[1]), FIRST_HOLDS);
  assert.deepEqual(animPlan(["1", "2", "3", "4"], true), [["2", CONTINUE_HOLDS[0]], ["3", CONTINUE_HOLDS[1]], ["4", CONTINUE_HOLDS[2]]]);
  assert.equal(rollSexCd(() => 0), 4); assert.equal(rollSexCd(() => 0.99), 5);
  const s = { sexCd: 2 }; assert.ok(sexCdBlocks({ act: "sex" }, s)); assert.ok(!sexCdBlocks({ act: "oral" }, s));
  tickSexCd(s); tickSexCd(s); tickSexCd(s); assert.equal(s.sexCd, 0); assert.ok(!sexCdBlocks({ act: "sex" }, s));
  const P = await import("../web/content/swap_pair_gen.js");
  assert.ok(P.PAIR_SLOTS.includes("normal~3") && P.PAIR_SLOTS.includes("fellatio~3")); assert.equal(P.EJAC_SHAKES, 6);
  assert.match(P.pairPrompt("normal~3", { id: "w" }, { husband: {} }).shared.join(","), /creampie/);
  assert.equal(P.seedFor("behind~3", { "pair~behind~1": { seed: 9 } }, {}), 9);
  assert.equal(P.pairCut({ "pair~normal~3": { cut: "/c3", at: 2e9, seed: 1 } }, "normal~3"), "/c3");
  const F = await import("../web/content/swap_flow_rules.js");
  assert.deepEqual(F.pairSlotsFor("hotel_room", P.PAIR_ACTS, P.PAIR_FRAMES, P.PAIR_EJAC), ["normal~1", "normal~2", "normal~3", "behind~1", "behind~2", "behind~3"]);
  assert.ok(F.pairSlotsFor("ktv", P.PAIR_ACTS, P.PAIR_FRAMES, P.PAIR_EJAC).includes("fellatio~3"));
  assert.match(py, /\(normal\|behind\|seated\)~\(1\|2\|3\)\|pair~fellatio~3/);
  console.log("swap_chat_sex pt263u ok");
}
