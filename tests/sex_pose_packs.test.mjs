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
  assert.deepEqual(M.SEX_STEPS, ["open", "tip", "join", "half", "full", "thrust", "orgasm", "squirt", "cum", "bloodcum"]);
  assert.deepEqual([...M.SEX_STEP_DISABLED].sort(), ["full", "half", "tip"]);
  assert.deepEqual(M.SEX_ACTIVE_STEPS, ["open", "join", "thrust", "orgasm", "squirt", "cum", "bloodcum"]);
  assert.deepEqual(M.SEX_ACTIVE_STEPS.map((s) => M.SEX_STEP_META[s].tab), ["① 開場", "② 加入", "③ 抽插", "④ 高潮", "⑤ 潮吹", "⑥ 內射", "⑦ 血精"]);
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
t("③ 抽插多張變體：格 1＝thrust、格 2..6＝thrust2..6；每組一格；全滿覆寫格 1", () => {
  assert.equal(M.SEX_THRUST_VARIANTS, 6);
  assert.equal(M.sexThrustVariantShot("doggy", 1), "sex_doggy_thrust");
  assert.equal(M.sexThrustVariantShot("missionary", 3), "sex_missionary_thrust3");
  assert.equal(M.sexThrustVariantShot("doggy", 99), "sex_doggy_thrust6");
  const u = (n) => `/assets/portraits/g1_sex_doggy_thrust${n === 1 ? "" : n}.png?v=1`;
  assert.equal(M.sexThrustSlotOfUrl("doggy", u(1)), 1);
  assert.equal(M.sexThrustSlotOfUrl("doggy", u(4)), 4);
  assert.equal(M.sexThrustSlotOfUrl("missionary", u(1)), 0);
  assert.equal(M.sexThrustSlotOfUrl("doggy", "/assets/portraits/g1_sex_doggy_thrust9.png"), 0);
  assert.ok(M.isSexStepResultUrl("doggy", "thrust", u(2)));
  assert.ok(!M.isSexStepResultUrl("doggy", "thrust", "/assets/testword/123.png"));
  assert.ok(M.isSexStepResultUrl("doggy", "join", "/assets/portraits/g1_sex_doggy_join.png"));
  assert.ok(!M.isSexStepResultUrl("doggy", "join", u(2)));
  assert.deepEqual(M.pickSexThrustSlot("doggy", {}, "a"), { slot: 1, evict: [] });
  assert.deepEqual(M.pickSexThrustSlot("doggy", { a: u(1) }, "b"), { slot: 2, evict: [] });
  assert.deepEqual(M.pickSexThrustSlot("doggy", { a: u(1), b: u(3) }, "b"), { slot: 3, evict: [] }, "自己的格不變");
  assert.deepEqual(M.pickSexThrustSlot("doggy", { a: u(1), c: u(1) }, "c"), { slot: 2, evict: [] }, "跟別組撞格 → 換空格");
  const full = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`p${n}`, u(n)]));
  assert.deepEqual(M.pickSexThrustSlot("doggy", full, "new"), { slot: 1, evict: ["p1"] });
  const g = { id: "g0", name: "x", stage: "lover", comfyCkpt: "a.safetensors" };
  assert.equal(M.buildSexStepImgBody("doggy", "thrust", null, g, {}, { thrustSlot: 3 }).shot, "sex_doggy_thrust3");
  assert.equal(M.buildSexStepImgBody("doggy", "thrust", null, g, {}, { thrustSlot: 1 }).shot, "sex_doggy_thrust");
  assert.equal(M.buildSexStepImgBody("doggy", "cum", null, g, {}, { thrustSlot: 3 }).shot, "sex_doggy_cum");
});
t("⑦ 血精：預設＝內射＋混血粉紅精液；負向擋顏射與純白精液、傷口；舊組自動補；shot sex_<pose>_bloodcum", () => {
  for (const pose of ["missionary", "doggy"]) {
    const p = M.defaultSexStepPrompt(pose, "bloodcum");
    for (const k of ["creampie", "blood semen", "cum mixed with blood", "pinkish red cum", "bloody semen overflowing from pussy", "penis inside", "faceless shadow man"]) assert.ok(p.includes(k), `${pose} lacks ${k}`);
    const n = neg(pose, "bloodcum");
    for (const k of ["facial", "pure white cum", "gore", "wound", "male face"]) assert.ok(n.includes(k), `${pose} neg lacks ${k}`);
    assert.ok(!n.includes("inserted") && !n.includes("blood semen"));
    const pk = M.normalizeSexPosePack(pose, { id: "old", cum: { prompt: "x" } });
    assert.equal(pk.bloodcum.prompt, p);
    assert.equal(M.sexStepShot(pose, "bloodcum"), `sex_${pose}_bloodcum`);
    assert.ok(M.isSexStepResultUrl(pose, "bloodcum", `/assets/portraits/g_sex_${pose}_bloodcum.png?v=1`));
    assert.ok(!M.isSexStepResultUrl(pose, "cum", `/assets/portraits/g_sex_${pose}_bloodcum.png?v=1`));
  }
  assert.equal(M.SEX_STEP_PROMPT_REV.bloodcum, 1);
  assert.equal(M.SEX_STEP_META.bloodcum.label, "血精");
});
t("召喚預產整套：兩姿勢 × 每組 6 步（無潮吹）＋局部動圖缺幀；快取／版本跳過；抽插最多 6 組", () => {
  assert.deepEqual(M.SEX_SUMMON_STEPS, ["open", "join", "thrust", "orgasm", "cum", "bloodcum"]);
  assert.ok(!M.SEX_SUMMON_STEPS.includes("squirt"));
  const packsByPose = { missionary: [{ id: "m1" }], doggy: [{ id: "d1" }, { id: "d2" }] };
  let jobs = M.planSexSummonSet({ packsByPose });
  assert.equal(jobs.filter((j) => j.kind === "step").length, 18);
  assert.equal(jobs.filter((j) => j.kind === "anim").length, 2);
  assert.equal(M.sexSummonImageCount(jobs), 18 + 8);
  assert.deepEqual(jobs[0], { kind: "step", pose: "missionary", step: "open", packId: "m1" });
  assert.equal(jobs[6].kind, "anim");
  const P = (pose, step, slot) => `/assets/portraits/g_sex_${pose}_${step}${slot > 1 ? slot : ""}.png?v=1`;
  const portraits = {
    sex_missionary_open_packs: { m1: P("missionary", "open") },
    sex_missionary_thrust_packs: { m1: P("missionary", "thrust") },
    sex_missionary_cum_packs: { m1: "/assets/testword/x.png" },
    sex_doggy_thrust_packs: { d1: P("doggy", "thrust"), d2: P("doggy", "thrust", 2) },
    actionPromptRev: { "sex_missionary_open_packs:m1": 3 },
  };
  const sexAnim = { missionary: { urls: ["a", "", "c", "d"] }, doggy: { urls: ["a", "b", "c", "d"] } };
  jobs = M.planSexSummonSet({ packsByPose, portraits, sexAnim });
  const has = (pose, step, id) => jobs.some((j) => j.kind === "step" && j.pose === pose && j.step === step && j.packId === id);
  assert.ok(!has("missionary", "open", "m1") && !has("missionary", "thrust", "m1"), "有快取 → 跳過");
  assert.ok(has("missionary", "cum", "m1"), "testword（舊伺服器）不算快取");
  assert.ok(!has("doggy", "thrust", "d2"), "抽插變體格 2 也算快取");
  assert.deepEqual(jobs.find((j) => j.kind === "anim"), { kind: "anim", pose: "missionary", frames: [1] });
  assert.ok(!jobs.some((j) => j.kind === "anim" && j.pose === "doggy"));
  // 版本：開場 rev 3 已記 → 跳過；抽插 rev 1 未記 → 重排
  const revOf = (st) => (st === "open" ? 3 : 1);
  jobs = M.planSexSummonSet({ packsByPose, portraits, sexAnim, revOf });
  assert.ok(!has("missionary", "open", "m1"));
  assert.ok(jobs.some((j) => j.step === "thrust" && j.packId === "m1"));
  // 抽插最多 6 組
  const many = { missionary: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}` })), doggy: [] };
  jobs = M.planSexSummonSet({ packsByPose: many, anim: false });
  assert.equal(jobs.length, 6 * 6);
  assert.equal(M.planSexSummonSet({ packsByPose: {}, sexAnim }).length, 1, "沒組也補動圖");
});
console.log(`${pass} passed`);
