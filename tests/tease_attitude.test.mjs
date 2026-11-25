// node tests/tease_attitude.test.mjs — 調戲的態度弧線（web/content/tease_attitude.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const A = await import(`${dir}tease_attitude.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const at = (o) => A.teaseAttitude(o).key;
const AR = { none: 0, slight: 5, aroused: 12, wantFill: 20, climax: 25 };

t("起點：陌生拒絕、朋友拒絕、女友無奈拒絕、妻子無奈順從", () => {
  assert.equal(at({ stage: "stranger" }), "refuse");
  assert.equal(at({ stage: "friend" }), "refuse");
  assert.equal(at({ stage: "girlfriend", libido: 10 }), "reluctant_refuse");
  assert.equal(at({ stage: "wife", libido: 10 }), "reluctant_yield");
});

t("上限（使用者）：陌生最多無奈拒絕、朋友最多無奈順從；女友、妻子可以到迎合", () => {
  const max = { stage: "", arousal: AR.climax, libido: 30, count: 20, hunger: 90, persMult: 0.75 };
  assert.equal(at({ ...max, stage: "stranger" }), "reluctant_refuse");
  assert.equal(at({ ...max, stage: "acquaintance" }), "reluctant_refuse");
  assert.equal(at({ ...max, stage: "friend" }), "reluctant_yield");
  assert.equal(at({ ...max, stage: "close_friend" }), "reluctant_yield");
  assert.equal(at({ ...max, stage: "girlfriend" }), "welcome");
  assert.equal(at({ ...max, stage: "wife" }), "welcome");
});

t("同一場越被撩越往後推（女友：無奈拒絕 → 無奈順從 → 迎合）", () => {
  const g = (arousal, count) => at({ stage: "girlfriend", libido: 10, arousal, count });
  assert.equal(g(AR.none, 0), "reluctant_refuse");
  assert.equal(g(AR.aroused, 2), "reluctant_yield");
  assert.equal(g(AR.climax, 4), "welcome");
});

t("陌生：一開始拒絕，被撩很久才無奈拒絕", () => {
  assert.equal(at({ stage: "stranger", libido: 10, arousal: AR.slight, count: 1 }), "refuse");
  assert.equal(at({ stage: "stranger", libido: 10, arousal: AR.wantFill, count: 3 }), "reluctant_refuse");
});

t("往回拉：侵犯高、還在生氣；妻子最多退到無奈拒絕", () => {
  assert.equal(at({ stage: "girlfriend", libido: 10, invasion: 80 }), "refuse");
  assert.equal(at({ stage: "girlfriend", libido: 10, arousal: AR.aroused, count: 2, invasion: 80 }), "reluctant_refuse");
  assert.equal(at({ stage: "lover", libido: 10, mood: "angry", moodLevel: 40 }), "reluctant_refuse");
  assert.equal(at({ stage: "lover", libido: 10, mood: "angry", moodLevel: 40, invasion: 60 }), "refuse");
  assert.equal(at({ stage: "wife", libido: 10, mood: "angry", moodLevel: 60, invasion: 90 }), "reluctant_refuse");
});

t("這一下侵犯感太大（女友以前）：斥責最多無奈拒絕、暴怒回到拒絕；女友以上不管", () => {
  assert.equal(at({ stage: "close_friend", arousal: AR.climax, count: 10, turnTier: "harsh" }), "reluctant_refuse");
  assert.equal(at({ stage: "stranger", arousal: AR.climax, count: 10, turnTier: "harsh" }), "reluctant_refuse");
  assert.equal(at({ stage: "friend", arousal: AR.climax, count: 10, turnTier: "furious" }), "refuse");
  assert.equal(at({ stage: "lover", libido: 10, arousal: AR.climax, count: 4, turnTier: "harsh" }), "welcome");
});

t("半推半就至少無奈拒絕（陌生也是，但不超過上限）", () => {
  assert.equal(at({ stage: "stranger", willing: true }), "reluctant_refuse");
});

t("這一場的計數：20 分鐘內累加、過了重算；記上一下的態度", () => {
  const now = 1_000_000_000;
  let s = A.noteTeaseSession(null, "refuse", now);
  assert.deepEqual([s.n, s.prev], [1, ""]);
  assert.equal(A.teaseSessionCount(s, now + 60_000), 1);
  s = A.noteTeaseSession(s, "reluctant_refuse", now + 60_000);
  assert.deepEqual([s.n, s.prev, s.last], [2, "refuse", "reluctant_refuse"]);
  assert.equal(A.teaseSessionCount(s, now + 60_000 + A.SESSION_GAP_MS + 1), 0);
  assert.equal(A.attitudeShift("refuse", "reluctant_refuse"), 1);
  assert.equal(A.attitudeShift("welcome", "reluctant_yield"), -1);
  assert.equal(A.attitudeShift("", "welcome"), 0);
});

t("prompt：拒絕帶個性抗議、無奈帶半推半就語氣；性奮高才寫嘴硬身體誠實；轉變有提示", () => {
  const r = A.attitudePromptBlock({ key: "refuse", zh: "拒絕" }, { arousal: 0, persProtest: "高冷：手拿開。", hitId: "breast" });
  assert.ok(r.includes("拒絕") && r.includes("高冷") && r.includes("胸部") && !r.includes("身體誠實"));
  const r2 = A.attitudePromptBlock({ key: "reluctant_refuse", zh: "無奈拒絕" }, { arousal: AR.wantFill, persToken: "傲嬌：哼！", shift: 1 });
  assert.ok(r2.includes("身體誠實") && r2.includes("傲嬌") && r2.includes("鬆動"));
  const w = A.attitudePromptBlock({ key: "welcome", zh: "迎合" }, { stage: "girlfriend" });
  assert.ok(w.includes("害羞但誠實") && !w.includes("老公"));
  for (const k of A.ATTITUDES) assert.ok(!A.attitudePromptBlock({ key: k, zh: A.ATTITUDE_ZH[k] }, { stage: "lover", arousal: 25 }).includes("老公"), k);
});

t("黑影反應與範圍：每階會用到的態度、找最接近的", () => {
  assert.deepEqual(A.attitudeRange("stranger"), ["refuse", "reluctant_refuse"]);
  assert.deepEqual(A.attitudeRange("friend"), ["refuse", "reluctant_refuse", "reluctant_yield"]);
  assert.deepEqual(A.attitudeRange("girlfriend"), ["reluctant_refuse", "reluctant_yield", "welcome"]);
  assert.deepEqual(A.attitudeRange("wife"), ["reluctant_yield", "welcome"]);
  assert.equal(A.nearestAttitude("refuse", A.attitudeRange("girlfriend")), "reluctant_refuse");
  assert.equal(A.nearestAttitude("reluctant_refuse", A.attitudeRange("wife")), "reluctant_yield");
  assert.equal(A.ATTITUDE_REACT.welcome, "wife");
});

console.log(`\n${pass} passed`);
