// node tests/request_ask.test.mjs — 用說的請她（web/content/request_ask.js）＋解鎖門檻 ×2（openness.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const R = await import(`${dir}request_ask.js`);
const O = await import(`${dir}openness.js`);
const V = await import(`${dir}verbal_tease.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const cls = (s) => V.classifyUserText(s);

t("認句子：做愛、脫衣、摸（鎖著才算請求；沒說哪裡＝下一階）", () => {
  const ctx = (s, locked = true) => ({ touchCls: cls(s), nextLockedAct: "breast", actLocked: () => locked });
  assert.deepEqual(R.classifyRequest("我們做愛吧", ctx("我們做愛吧")), { kind: "sex" });
  assert.deepEqual(R.classifyRequest("好想跟妳做愛", ctx("好想跟妳做愛")), { kind: "sex" });
  assert.deepEqual(R.classifyRequest("把衣服脫掉", ctx("把衣服脫掉")), { kind: "undress", all: false });
  assert.deepEqual(R.classifyRequest("脫光給我看", ctx("脫光給我看")), { kind: "undress", all: true });
  assert.equal(R.classifyRequest("我先脫衣服", ctx("我先脫衣服")), null, "他自己脫不算");
  assert.deepEqual(R.classifyRequest("讓我摸妳的胸部", ctx("讓我摸妳的胸部")), { kind: "touch", actId: "breast" });
  assert.equal(R.classifyRequest("摸妳的胸部", ctx("摸妳的胸部", false)), null, "已解鎖＝直接摸，不用問");
  assert.deepEqual(R.classifyRequest("摸一下啦", ctx("摸一下啦")), { kind: "touch", actId: "breast" });
  assert.equal(R.classifyRequest("今天天氣好好", ctx("今天天氣好好")), null);
});

t("解析：第一行答應／拒絕、第二行台詞；同一行也行；看不出來＝null", () => {
  assert.deepEqual(R.parseDecision("答應\n……就一下喔。"), { yes: true, line: "……就一下喔。" });
  assert.deepEqual(R.parseDecision("【拒絕】\n「想都別想。」"), { yes: false, line: "想都別想。" });
  assert.deepEqual(R.parseDecision("答應，真拿你沒辦法。"), { yes: true, line: "真拿你沒辦法。" });
  assert.equal(R.parseDecision("嗯……讓我想想").yes, null);
});

t("prompt：有傾向、有格式；摸只准這一下；陌生做愛就算癱軟也多半拒絕；不提老公", () => {
  const p = R.requestPrompt("sex", { stage: "friend", collapsed: true, arousal: "很想要" });
  assert.ok(/還沒交往/.test(p) && /癱軟/.test(p) && /第一行只寫/.test(p));
  assert.ok(/只准這一下/.test(R.requestPrompt("touch", { stage: "stranger", what: "摸你的胸部" })));
  for (const k of ["touch", "undress", "sex"]) for (const st of ["stranger", "girlfriend", "lover"]) assert.ok(!R.requestPrompt(k, { stage: st }).includes("老公"));
  assert.ok(/脫光了，更容易/.test(R.requestPrompt("sex", { stage: "girlfriend", nude: true })));
});

t("保底機率：陌生做愛很低（癱軟也一樣）、女友脫光較高、妻子很高；生氣打折", () => {
  const f = (k, o) => R.fallbackYesChance(k, o);
  assert.ok(f("sex", { stage: "stranger", arousalStage: "climax" }) < 0.15);
  assert.ok(f("sex", { stage: "girlfriend", nude: true }) > f("sex", { stage: "girlfriend" }));
  assert.ok(f("sex", { stage: "wife" }) >= 0.85);
  assert.ok(f("sex", { stage: "wife", angry: true }) < 0.3);
});

t("解鎖門檻約 2 倍（開放度最多 100、性奮最多 28）；言語調戲上限照舊用原始數字", () => {
  const g = (open, aro, aff = 0) => ({ affection: aff, bodyState: { openness: open, arousal: aro } });
  assert.equal(O.actOpennessLock(g(8, 0), "breast").ok, false, "以前 8 就開，現在要 16");
  assert.equal(O.actOpennessLock(g(16, 0), "breast").ok, true);
  assert.equal(O.actOpennessLock(g(99, 0), "cervix_rub").ok, false);
  assert.equal(O.actOpennessLock(g(100, 0), "cervix_rub").ok, true);
  assert.equal(O.actOpennessLock(g(0, 27), "cervix_rub").ok, false);
  assert.equal(V.verbalArousalCap(0), O.ACT_UNLOCK.labia.aroThr);
});

console.log(`\n${pass} passed`);
