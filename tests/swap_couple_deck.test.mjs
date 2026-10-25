// node tests/swap_couple_deck.test.mjs — 換妻夫妻形狀／舊檔遷移／場景牌組
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const dir = pathToFileURL(new URL("../web/content/", import.meta.url).pathname).href.replace(/\/$/, "/") ;
const pools = JSON.parse(readFileSync(new URL("../web/content/persona_pools.json", import.meta.url)));

// 必須跟原始碼 import 的 ?v= 一致，否則 node 會載成兩份模組，setPools 無效
const G = await import(dir + "girl_gen.js?v=5");
G.setPools(pools);

const H = await import(dir + "husband_gen.js?v=1");
const C = await import(dir + "swap_cafe_gen.js?v=34");
const D = await import(dir + "swap_deck_rules.js?v=6");
const T = await import(dir + "swap_tease_rules.js?v=8");

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const tAsync = async (name, fn) => { await fn(); pass += 1; console.log("ok -", name); };

await tAsync("rollCouple：對方妻子＝generateGirl 形＋other_wife，年齡 24–38，擁有整個衣櫃＋選好外出服", async () => {
  const c = await C.rollCouple();
  assert.ok(c.id && c.husband && c.wife);
  const w = c.wife;
  assert.equal(w.role, "other_wife");
  assert.ok(w.look?.face && w.look?.eyes && w.look?.hair);
  assert.ok(w.age >= 24 && w.age <= 38);
  assert.equal(w.look.age, w.age);
  assert.ok(Array.isArray(w.personality) && w.personality.length);
  assert.ok(["害羞人妻", "老手", "不太情願"].includes(w.swapType));
  const owned = w.look.owned?.wardrobe || [];
  const ward = Array.isArray(w.look.wardrobe) ? w.look.wardrobe : [];
  assert.equal(owned.length, ward.length);
  assert.ok(String(w.outfitPick || w.look.style || "").length > 0);
  assert.ok(!w.roster);
});

await tAsync("rollCouple：丈夫有完整 look zh+en、喜好、興趣、與妻子不同的可綁模型欄位", async () => {
  const c = await C.rollCouple();
  const h = c.husband;
  assert.ok(h.name && h.age && h.persona && h.build);
  assert.ok(h.look?.hair_en && h.look?.face_en && h.look?.outfit_en);
  assert.ok(h.look?.build_en && h.height_cm);
  assert.ok(Array.isArray(h.likes) && h.likes.length >= 2);
  assert.ok(Array.isArray(h.hobbies) && h.hobbies.length >= 1);
  assert.ok(h.personality);
  assert.ok(["紳士型", "老手型", "炫耀型"].includes(h.swapType));
  C.rollCkpts(c, ["A.safetensors", "B.safetensors"]);
  assert.ok(c.husband.ckpt && c.wife.ckpt);
  assert.equal(c.husband.ckpt, c.husband.comfyCkpt);
  assert.equal(c.wife.ckpt, c.wife.comfyCkpt);
  assert.notEqual(c.husband.ckpt, c.wife.ckpt);
});

await tAsync("enrichCouple：舊薄夫妻保留 id／name／ckpt，補齊 look", async () => {
  const thin = {
    id: "cOld1",
    at: 1,
    husband: { id: "cOld1h", name: "舊田一郎", age: 40, persona: "gentleman", build: "average", ckpt: "keepH.safetensors", swapType: "紳士型", swapPrice: 30 },
    wife: { id: "cOld1w", name: "舊美咲", age: 28, look: { hair: "黑色長直髮" }, ckpt: "keepW.safetensors", swapType: "害羞人妻" },
  };
  const changed = await C.enrichCouple(thin);
  assert.equal(changed, true);
  assert.equal(thin.id, "cOld1");
  assert.equal(thin.husband.name, "舊田一郎");
  assert.equal(thin.wife.name, "舊美咲");
  assert.equal(thin.husband.ckpt, "keepH.safetensors");
  assert.equal(thin.wife.ckpt, "keepW.safetensors");
  assert.equal(thin.wife.comfyCkpt, "keepW.safetensors");
  assert.equal(thin.wife.role, "other_wife");
  assert.ok(thin.wife.look?.face && thin.wife.look?.eyes);
  assert.ok(thin.husband.look?.hair_en);
  assert.equal(thin.wife.swapType, "害羞人妻");
  assert.equal(thin.husband.swapType, "紳士型");
});

t("roomLookOf：真欄位齊時不發明（無 swapLook）", () => {
  const w = { id: "x", look: { face: "鵝蛋臉", eyes: "杏眼", hair: "長直髮", hair_color: "烏黑", cup: "D 罩杯、勻稱漂亮", build: "勻稱有致" } };
  const L = T.roomLookOf(w);
  assert.equal(L.face, "鵝蛋臉");
  assert.equal(L.swapLook, undefined);
  const thin = { id: "y", look: { hair: "黑色鮑伯短髮", cup: "C" } };
  const L2 = T.roomLookOf(thin);
  assert.equal(L2.swapLook, 1);
  assert.ok(L2.face);
});

t("deckFor：場景對得上；公園無酒牌", () => {
  assert.equal(D.deckFor("park"), D.DECK_PARK);
  assert.equal(D.deckFor("bar"), D.DECK_BAR);
  assert.equal(D.deckFor("ktv"), D.DECK_KTV);
  assert.equal(D.deckFor("hotel_room"), D.DECK_HOTEL_ROOM);
  assert.equal(D.deckFor("hotel_bath"), D.DECK_HOTEL_BATH);
  assert.equal(D.deckFor("hotel"), D.DECK_HOTEL_ROOM);
  for (const c of D.DECK_PARK) assert.equal(D.isAlcoholCard(c), false, c.id);
  const zh = D.DECK_PARK.map((c) => c.zh).join("|");
  for (const w of ["散步", "長椅", "夜景", "介紹", "稱讚", "言語調戲"]) assert.ok(zh.includes(w), w);
  for (const c of D.DECK_PARK) { assert.ok(!c.tease, c.id); assert.ok(!/親|吻|摸|廁所|碰/.test(c.zh), c.id); }
  assert.ok(D.DECK_PARK.some((c) => c.fx?.acc?.other) && D.DECK_PARK.some((c) => c.fx?.acc?.wife));
  assert.ok(D.DECK_BAR.some(D.isAlcoholCard));
});

t("配對後手牌只准 other（含 tease）", () => {
  assert.equal(D.handCardOk({ who: "husband", zh: "x" }, "ktv"), false);
  assert.equal(D.handCardOk({ who: "wife", zh: "x" }, "hotel_room"), false);
  assert.equal(D.handCardOk({ who: "other", zh: "x" }, "ktv"), true);
  assert.equal(D.handCardOk({ who: "other", tease: true, zh: "x" }, "hotel_bath"), true);
  assert.equal(D.handCardOk({ who: "husband", zh: "x" }, "park"), true);
  assert.equal(D.handCardOk({ who: "all", zh: "x" }, "bar"), true);
});

t("做愛鎖她的接受度 70（老婆接受度不再擋）；姿勢房間 missionary／浴室 doggy", () => {
  const sex = T.TEASE_CARDS.find((c) => c.act === "sex");
  assert.ok(sex);
  assert.equal(T.teaseGate(sex, { accept: 69, drunk: 0, scene: "hotel_room", wifeAccept: 70 }).ok, false);
  assert.equal(T.teaseGate(sex, { accept: 70, drunk: 0, scene: "hotel_room", wifeAccept: 0 }).ok, true);
  assert.equal(T.teaseGate(sex, { accept: 70, drunk: 0, scene: "hotel_room", wifeAccept: 70 }).ok, true);
  assert.equal(T.sexPoseFor("hotel_room"), "missionary");
  assert.equal(T.sexPoseFor("hotel_bath"), "doggy");
});

t("manInfo 用丈夫完整 look", () => {
  const h = H.rollHusband({ id: "t1" });
  const mi = C.manInfo(h);
  assert.ok(mi.desc.includes("hair") || mi.desc.length > 10);
  assert.ok(mi.outfit);
  assert.ok(mi.body);
});

console.log(`\n${pass} passed`);
