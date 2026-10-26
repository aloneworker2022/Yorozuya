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
