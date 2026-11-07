import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const P = await import("../web/content/swap_prone.js");
const M = await import("../web/content/swap_chat_sex.js");
const R = await import("../web/content/swap_tease_rules.js");
assert.ok(M.HOTEL_POSES.includes("prone")); assert.equal(M.POSE_ZH.prone, "趴床背後");
assert.equal(M.animPoseOf("prone"), "doggy");
assert.deepEqual(M.posesFor("hotel_bath"), ["missionary", "doggy", "cowgirl"]);
assert.equal(M.nextPose("doggy", M.posesFor("hotel_room")), "prone");
assert.deepEqual(M.sexImgCandidates("prone", "thrust").slice(0, 2), ["sex~prone~thrust", "sex~prone~join"]);
assert.equal(P.proneShot("cum"), "sex_prone_cum");
for (const s of P.PRONE_STEPS) { const t = P.pronePrompt(s); assert.match(t, /lying face down on bed/); assert.match(t, /camera behind them/); assert.match(t, /pressing her down from behind/); }
const room = R.pregenKeys("hotel_room").filter((j) => j.pose === "prone").map((j) => j.key);
assert.deepEqual(room, ["sex~prone~open", "sex~prone~tip", "sex~prone~thrust", "sex~prone~cum", "sex~prone~orgasm"]);
assert.ok(!R.pregenKeys("hotel_bath").some((j) => j.pose === "prone"));
const py = readFileSync(new URL("../server/main.py", import.meta.url), "utf8"), cf = readFileSync(new URL("../server/comfy.py", import.meta.url), "utf8");
assert.match(py, /cowgirl\|prone\)~/); assert.match(py, /sex_prone_/); assert.match(cf, /SEX_PRONE_SHOTS/);
console.log("swap_prone ok");
