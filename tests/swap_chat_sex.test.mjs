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
  const { thrustFrameUrls, animPlan, FIRST_HOLDS, CONTINUE_HOLDS, rollSexCd, sexCdBlocks, tickSexCd } = await import("../web/content/swap_chat_sex.js");
  const taps = [], affs = []; let anims = 0;
  const r = await runChatSex({ girl: { name: "美咲" }, narrate: async () => {}, reply: async () => {}, waitThrust: async () => {}, waitTap: async (l) => taps.push(l),
    localAnim: async () => { anims++; }, aff: (d) => affs.push(d), affRoll: () => 2, roll: (() => { const q = ["none", "ai", "both"]; return () => q.shift(); })() }, pack);
  assert.equal(r.climax, "both"); assert.equal(anims, 3); assert.deepEqual(affs, [2, 2, 2, 2]);   // pt264u：高潮那下（場景5）也加好感
  assert.equal(taps[taps.length - 1], "開始"); assert.ok(taps.includes("下一句"));
  const fp = [{ id: "a", pose: "doggy", frames: { 1: { url: "/a1" }, 2: { url: "/a2" }, 3: { url: "/a3" }, 4: { url: "/a4" } } }];
  assert.deepEqual(thrustFrameUrls({ pose: "doggy", girl: {}, framePacks: fp }).urls, ["/a1", "/a2", "/a3", "/a4"]);
  assert.deepEqual(thrustFrameUrls({ pose: "x", girl: { sexAnim: { x: { urls: ["/s1", "/s2"] } } }, framePacks: fp }).urls, ["/s1", "/s2"]);
  // pt282u：同房間 loadThrustFrames——沒 sexAnim[pose] 先借她自己 ≥2 幀的 sexAnim，再同體位幀包
  assert.deepEqual(thrustFrameUrls({ pose: "missionary", girl: { sexAnim: { doggy: { urls: ["/d1", "/d2"] } } }, framePacks: fp }).urls, ["/d1", "/d2"]);
  const { THRUST } = await import("../web/content/sex_thrust.js");
  assert.deepEqual(FIRST_HOLDS, THRUST.FIRST_HOLDS); assert.deepEqual(CONTINUE_HOLDS, THRUST.CONTINUE_HOLDS);
  const bar = readFileSync(new URL("../web/content/swap_bar.js", import.meta.url), "utf8");
  assert.match(bar, /createLocalAnim\(ov, \(\) => \(\{ pose: animPose, girl: w \}\)\)/);
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
  assert.deepEqual(F.pairSlotsFor("hotel_room", P.PAIR_ACTS, P.PAIR_FRAMES, P.PAIR_EJAC), ["normal~1", "normal~2", "normal~3", "behind~1", "behind~2", "behind~3", "room_kiss", "bath_kiss", "afterglow"]);
  assert.ok(F.pairSlotsFor("ktv", P.PAIR_ACTS, P.PAIR_FRAMES, P.PAIR_EJAC).includes("fellatio~3"));
  assert.match(py, /\(normal\|behind\|seated\)~\(1\|2\|3\)\|pair~fellatio~3/);
  assert.match(py, /sex~\(missionary\|doggy\|cowgirl\|prone\)~\(open\|tip\|join\|thrust\|cum\|orgasm\)/); assert.match(py, /other~\(climax\|creampie\)/);
  console.log("swap_chat_sex pt263u ok");
}
// ---- pt264u：好感階依接受度；attitude 不再出現「妻子」；有感覺詞
{
  const { swapAffStage, swapAttitude, SENSE_RULE, SWAP_SEX_FB } = await import("../web/content/swap_chat_sex.js");
  assert.equal(swapAffStage(0), "stranger"); assert.equal(swapAffStage(70), "girlfriend"); assert.equal(swapAffStage(90), "wife");
  const a = swapAttitude("正戲進行中。依關係：陌生抗拒、朋友羞怒、女友又羞又要、妻子投入。", "girlfriend");
  assert.ok(!a.includes("妻子") && a.includes("又羞又要"), a);
  assert.ok(!swapAttitude("陌生／朋友抗拒丟臉；女友複雜；妻子接受。", "wife").includes("妻子"));
  assert.ok(/燙|濕|麻/.test(SENSE_RULE)); assert.ok(Object.values(SWAP_SEX_FB).flat().every((t) => !t.includes("妻子")));
  console.log("swap_chat_sex pt264u ok");
}

// ---- pt283u：肏跟對話脫鉤、三姿勢、射／高潮骰、立繪切換
{
  const M = await import("../web/content/swap_chat_sex.js");
  assert.equal(M.SEX_IMG_MATRIX.length, 20);
  assert.deepEqual(M.SEX_STATES.map((s) => M.STATE_ZH[s]), ["準備", "頂住", "做愛", "射", "高潮"]);
  assert.deepEqual(M.HOTEL_POSES.map((p) => M.POSE_ZH[p]).sort(), ["背後", "正面", "趴床背後", "騎乘"].sort());
  assert.equal(M.sexImgKey("doggy", "ejac"), "sex~doggy~cum"); assert.equal(M.sexImgKey("cowgirl", "climax"), "sex~cowgirl~orgasm");
  assert.deepEqual(M.sexImgCandidates("cowgirl", "tip").slice(0, 3), ["sex~cowgirl~tip", "sex~cowgirl~open", "sex~missionary~tip"]);
  assert.equal(M.animPoseOf("doggy"), "doggy"); assert.equal(M.animPoseOf("missionary"), "missionary"); assert.equal(M.animPoseOf("cowgirl"), "missionary");
  assert.equal(M.rollPress(1, () => 0).ejac, false); assert.equal(M.rollPress(M.MAX_THRUST, () => 0.99).ejac, true);
  assert.equal(M.rollPress(5, () => 0, { lastClimax: true }).climax, false);
  assert.equal(M.portraitLook({ climaxes: 2 }), "nude"); assert.equal(M.portraitLook({ climaxes: M.CLIMAX_COLLAPSE_AT }), "climax"); assert.equal(M.portraitLook({ climaxes: 9, creampie: true }), "creampie");
  // 脫鉤：對話永遠不回（卡住）也照樣每下肏都播動圖、骰到射就結束
  const states = [], anims = [], looks = [], lines = []; let presses = 0;
  const seq = [0.9, 0.9, 0.0, 0.9, 0.0, 0.9, 0.0, 0.9, 0.9, 0.0];   // rollPress 先骰 climax 再骰 ejac
  let i = 0; const rng = () => (i < seq.length ? seq[i++] : 0.9);
  const acts = ["thrust", "pose", "thrust", "pose", "thrust", "thrust", "thrust"];
  const r = await M.runHotelSex({
    showState: (p, s) => states.push(`${p}:${s}`), anim: (ap) => anims.push(ap),
    waitPress: async () => { const a = acts.shift() || "thrust"; if (a === "thrust") presses++; return a; },
    line: (x) => { lines.push(x.event); return x.final ? Promise.resolve() : new Promise(() => {}); },   // 非最後一句永遠生不完
    portrait: (l) => looks.push(l), sleep: async () => {},
  }, { rng, pose: "missionary", tipMs: 0 });
  assert.deepEqual(states.slice(0, 2), ["missionary:prep", "missionary:tip"]);
  assert.equal(anims.length, presses); assert.equal(r.thrusts, presses);
  assert.deepEqual(anims.slice(0, 3), ["missionary", "doggy", "doggy"]);   // 正面→背後→趴床背後（pt285u，借背後動圖）
  assert.ok(r.creampie && looks.at(-1) === "creampie");
  assert.equal(lines[0], "tip"); assert.equal(lines.length, 2); assert.equal(lines[1] === "ejac" || lines[1] === "both", true);   // 第一句卡住：後面的肏不排隊、不等它；射完只補最後一句
  const bar = readFileSync(new URL("../web/content/swap_bar.js", import.meta.url), "utf8");
  assert.match(bar, /runHotelSex\(/); assert.match(bar, /k === "other" && base === "hotel" && sess\.look\?\.other/);
  const O = await import("../web/content/swap_outfit.js");
  assert.equal(O.lookFallback("creampie")[1], "nude"); assert.equal(O.lookFor("climax").framing, "full");
  console.log("swap_chat_sex pt283u ok");
}
