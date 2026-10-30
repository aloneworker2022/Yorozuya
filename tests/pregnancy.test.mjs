// node tests/pregnancy.test.mjs — 懷孕（web/content/pregnancy.js）＋人偶肚子
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as P from "../web/content/pregnancy.js";

const D = createRequire(import.meta.url)(fileURLToPath(new URL("../web/content/room_doll.js", import.meta.url)));
let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const NOW = 1_800_000_000_000, DAY = P.DAY_MS;
const g = (stage, archetype = "文靜溫柔") => ({ id: "a", name: "悠梨", roomStage: stage, archetype, world: {}, bodyState: {} });

t("受孕機率 8～15%（排卵期、飢渴加）", () => {
  assert.equal(P.conceiveChance(0, false), 0.08);
  assert.equal(P.conceiveChance(100, true), 0.15);
  assert.ok(P.conceiveChance(50, true) > P.conceiveChance(50, false));
});
t("10 天；第 3 天起有肚子、第 10 天最大", () => {
  const w = g("wife"); P.conceive(w, { at: NOW, father: { name: "佐藤健" } });
  assert.equal(P.bellyOf(w, NOW + 2.9 * DAY), 0);
  assert.ok(P.bellyOf(w, NOW + 3 * DAY) > 0);
  assert.equal(P.bellyOf(w, NOW + 10 * DAY), 1);
  assert.deepEqual([0, 3.1, 7, 10].map((d) => P.bellyStage(w, NOW + d * DAY)), [0, 1, 2, 3]);
  assert.equal(P.conceive(w, { at: NOW }), null, "懷著不會再懷");
});
t("女友以下第 5 天離開、女友快生離開、妻子第 10 天生", () => {
  for (const [st, day, what] of [["friend", 4.9, null], ["friend", 5, "leave"], ["girlfriend", 9, null], ["lover", 9.6, "leave"], ["wife", 9.9, null], ["devoted_wife", 10, "birth"]]) {
    const w = g(st); P.conceive(w, { at: NOW });
    assert.equal(P.outcome(w, NOW + day * DAY), what, `${st} ${day}`);
  }
});
t("女友以上自己說（父親名字、個性口吻）；女友以下只有症狀", () => {
  const w = g("girlfriend", "高冷"); P.conceive(w, { at: NOW, father: { name: "佐藤健" } });
  assert.ok(P.shouldTell(w));
  assert.ok(P.tellLine(w, 0.9).includes("佐藤健"));
  const f = g("friend"); P.conceive(f, { at: NOW });
  assert.ok(!P.shouldTell(f));
  assert.ok(P.symptomLine(0).length > 3);
  assert.ok(!P.known(f, NOW + DAY) && P.known(f, NOW + 4 * DAY));
});
t("打胎藥 30～60 金、負債或會變負不能買", () => {
  const w = g("wife"); P.conceive(w, { at: NOW });
  assert.equal(P.medCost(w, 0), 30); assert.equal(P.medCost(w, 0.99), 30, "一次孕價錢固定");
  const w2 = g("wife"); P.conceive(w2, { at: NOW }); assert.equal(P.medCost(w2, 0.9999), 60);
  assert.ok(P.canBuyMed(60, 60).ok); assert.ok(!P.canBuyMed(59, 60).ok); assert.ok(!P.canBuyMed(-1, 30).ok);
});
t("RP5 受孕只收一次；結束記 pregEnded；生產記孩子", () => {
  const w = g("wife");
  w.world.pregnancyRp5 = { key: "r1", at: NOW, father: "不知名的客人", role: "客人", source: "escort" };
  assert.ok(P.adoptServer(w)); assert.equal(P.pregOf(w).father.name, "不知名的客人");
  P.endPregnancy(w, "birth");
  assert.equal(P.adoptServer(w), null, "同一個 key 不再收");
  assert.deepEqual(w.bodyState.pregEnded, ["r1"]); assert.equal(w.bodyState.children[0].father, "不知名的客人");
  assert.equal(P.birthText("悠梨", "佐藤健", 380), "悠梨生下了佐藤健的孩子。育兒費 −380 金。");
});
t("舊召喚師線卡著的孕 → 新規則（今天第 0 天、保留父親）", () => {
  const w = g("girlfriend"); w.world.pregnancy = { fatherName: "黑袍召喚師", fatherRole: "召喚師" };
  const p = P.migrateOld(w, NOW);
  assert.equal(p.father.name, "黑袍召喚師"); assert.equal(p.at, NOW); assert.equal(w.world.pregnancy, null);
  assert.equal(P.migrateOld(w, NOW), null);
});
t("聊天背景：寫父親、不是他的；女友以下叫她別說", () => {
  const f = g("friend"); P.conceive(f, { at: NOW, father: { name: "佐藤健" } });
  const l = P.promptLines(f, NOW + DAY).join("\n");
  assert.ok(l.includes("佐藤健") && l.includes("不要跟他說"));
});
t("人偶：肚子 5 段、越大越凸；四個偷看體位都畫得出來", () => {
  const look = { height_cm: 160, build: "纖細苗條", cup: "B", hair: "長直髮" };
  const n = (f) => { let c = 0; for (let i = 3; i < f.pixels.length; i += 4) if (f.pixels[i]) c++; return c; };
  const sizes = [0, .2, .6, 1].map((b) => n(D.render(D.lookToDoll(look, { belly: b }), "idle", 0, 90)));
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1], sizes.join(","));
  assert.ok(sizes[3] > sizes[0] + 30, sizes.join(","));
  assert.notEqual(D.dollKey(D.lookToDoll(look, { belly: 1 })), D.dollKey(D.lookToDoll(look)));
  for (const pose of D.SEX_POSES) assert.ok(n(D.render(D.lookToDoll(look, { belly: 1 }), pose, 0, 0)) > 1500, pose);
});
console.log(`\n${pass} passed`);
