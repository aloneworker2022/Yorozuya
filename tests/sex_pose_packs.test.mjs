// node tests/sex_pose_packs.test.mjs — 做愛圖組步驟／預設／遷移（web/content/sex_pose_packs.js）
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const M = await import(`${dir}sex_pose_packs.js`);
let pass = 0;
const t = (n, f) => { f(); pass++; console.log("ok -", n); };
const neg = (pose, st) => M.defaultSexStepNegative(pose, st).split(",").map((x) => x.trim());

t("姿勢：自己脫→傳教士、你脫→後背、沒記→傳教士", () => {
  assert.equal(M.sexPoseFor({ undress: { pantiesBy: "self" } }), "missionary");
  assert.equal(M.sexPoseFor({ undress: { pantiesBy: "help" } }), "doggy");
  assert.equal(M.sexPoseFor({}), "missionary");
});
t("步驟：局部／半插／全插停用（程式保留），啟用＝開場→加入→抽插→高潮→潮吹→內射", () => {
  assert.deepEqual(M.SEX_STEPS, ["open", "tip", "join", "half", "full", "thrust", "orgasm", "squirt", "cum"]);
  assert.deepEqual([...M.SEX_STEP_DISABLED].sort(), ["full", "half", "tip"]);
  assert.deepEqual(M.SEX_ACTIVE_STEPS, ["open", "join", "thrust", "orgasm", "squirt", "cum"]);
  assert.deepEqual(M.SEX_ACTIVE_STEPS.map((s) => M.SEX_STEP_META[s].tab), ["① 開場", "② 加入", "③ 抽插", "④ 高潮", "⑤ 潮吹", "⑥ 內射"]);
  assert.equal(M.nextSexStep("open"), "join");
  assert.equal(M.nextSexStep("join"), "thrust");
  assert.equal(M.nextSexStep("tip"), "join");
  assert.deepEqual(M.SEX_PREGEN_STEPS, ["open", "join", "thrust"]);
  assert.equal(M.SEX_STEP_PROMPT_REV.thrust, 1);
  assert.equal(M.sexStepShot("doggy", "thrust"), "sex_doggy_thrust");
  assert.equal(M.sexStepPacksKey("missionary", "thrust"), "sex_missionary_thrust_packs");
  // 停用的預設照樣在（舊組不會壞）
  assert.ok(M.defaultSexStepPrompt("missionary", "half").includes("half inserted"));
  assert.ok(M.defaultSexStepPrompt("doggy", "full").includes("balls deep"));
});
t("③ 抽插預設：進進出出、動態線、骨盆啪啪、汗；影子男 POV＋同姿勢抓法；負向不擋插入", () => {
  for (const pose of ["missionary", "doggy"]) {
    const p = M.defaultSexStepPrompt(pose, "thrust");
    for (const k of ["1man", "pov", "faceless shadow man", "black semi-transparent silhouette", "penis inside", "penis thrusting in and out", "motion lines", "pelvis slapping", "sweat", "nude"]) assert.ok(p.includes(k), `${pose} lacks ${k}`);
    const n = neg(pose, "thrust");
    for (const k of ["inserted", "penetration", "penis inside"]) assert.ok(!n.includes(k), `${pose} neg blocks ${k}`);
    for (const k of ["hoodie", "clothes", "male face", "realistic man", "multiple girls", "penis outside"]) assert.ok(n.includes(k), `${pose} neg lacks ${k}`);
  }
  assert.ok(M.defaultSexStepPrompt("missionary", "thrust").includes("shadow male hands holding her thighs"));
  assert.ok(M.defaultSexStepPrompt("missionary", "thrust").includes("bouncing breasts"));
  const d = M.defaultSexStepPrompt("doggy", "thrust");
  assert.ok(d.includes("shadow male hands gripping her ass") && d.includes("his hips slapping against her ass"));
  assert.ok(neg("doggy", "thrust").includes("looking back"));
});
t("加入不變（仍擋插入）；高潮／潮吹／內射照舊", () => {
  assert.ok(neg("missionary", "join").includes("inserted"));
  assert.ok(M.defaultSexStepPrompt("missionary", "orgasm").includes("ahegao"));
  assert.ok(M.defaultSexStepPrompt("doggy", "squirt").includes("squirting"));
  assert.ok(M.defaultSexStepPrompt("doggy", "cum").includes("creampie"));
});
t("遷移：舊圖組沒有抽插格 → 自動補預設；自訂保留", () => {
  for (const pose of ["missionary", "doggy"]) {
    const old = { id: "a1", join: { prompt: "my join" } };
    const pk = M.normalizeSexPosePack(pose, old);
    assert.equal(pk.thrust.prompt, M.defaultSexStepPrompt(pose, "thrust"));
    assert.equal(pk.thrust.negative, M.defaultSexStepNegative(pose, "thrust"));
    assert.equal(pk.join.prompt, "my join");
    assert.ok(M.isDefaultSexStep(pose, "thrust", old));
    const cu = M.normalizeSexPosePack(pose, { id: "a2", thrust: { prompt: "custom thrust" } });
    assert.equal(cu.thrust.prompt, "custom thrust");
    assert.ok(!M.isDefaultSexStep(pose, "thrust", cu));
    assert.ok("half" in pk && "full" in pk && "tip" in pk, "停用格也保留");
  }
});
t("下單：抽插走 tease＋lock_identity（雙人）、outfit 空", () => {
  const g = { id: "g0", name: "x", stage: "lover", comfyCkpt: "a.safetensors" };
  const b = M.buildSexStepImgBody("doggy", "thrust", null, g, { imgProvider: "comfy" });
  assert.equal(b.shot, "sex_doggy_thrust");
  assert.equal(b.scene_kind, "tease");
  assert.ok(b.lock_identity);
  assert.equal(b.outfit, "");
  assert.ok(b.extra.includes("penis thrusting in and out"));
});
t("預設 JSON（web/content）每一步＝新預設", () => {
  for (const pose of ["missionary", "doggy"]) {
    const j = JSON.parse(fs.readFileSync(`${dir}${M.SEX_POSES[pose].json}`, "utf8"));
    for (const st of M.SEX_STEPS.slice(1)) {
      assert.equal(j.packs[0][st].prompt, M.defaultSexStepPrompt(pose, st), `${pose} ${st}`);
      assert.equal(j.packs[0][st].negative, M.defaultSexStepNegative(pose, st), `${pose} ${st} neg`);
    }
  }
});
console.log(`${pass} passed`);
