// node tests/home_bujo.test.mjs — 主畫面子彈筆記：舊存檔補欄位（web/content/home_bujo.js migrate）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

globalThis.document = { getElementById: () => null };   // 沒有 DOM：init 只記住 api
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const B = await import(`${dir}home_bujo.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const DAY = 20784;
const mk = (state) => B.init({ state: () => state, dayNum: () => DAY, save() {} });

t("舊委託補上哪天做、建立時間、最後動過；發現池（lv0）變成今天的任務", () => {
  const s = { quests: [{ id: "a", text: "倒垃圾", lv: 0 }, { id: "b", text: "繳費", lv: 1, day: DAY + 1, at: 5, touched: 7 }] };
  mk(s);
  assert.equal(B.migrate(), true);
  const [a, b] = s.quests;
  assert.equal(a.lv, 1); assert.equal(a.day, DAY); assert.ok(a.at > 1e12); assert.ok(a.touched > 1e12);
  assert.deepEqual([b.day, b.at, b.touched], [DAY + 1, 5, 7]);   // 已經有的不動（不會一打開就重算 24 小時）
  assert.equal(B.migrate(), false);
});

t("做完的紀錄、事件筆記留 62 天；專注那件不見了就清掉", () => {
  const s = { quests: [], bujo: { done: [{ id: "x", day: DAY - 70 }, { id: "y", day: DAY - 3 }], items: [{ id: "e", k: "ev", day: DAY - 63 }, { id: "f", k: "note", day: DAY }], focusId: "gone" } };
  mk(s);
  B.migrate();
  assert.deepEqual(s.bujo.done.map((d) => d.id), ["y"]);
  assert.deepEqual(s.bujo.items.map((d) => d.id), ["f"]);
  assert.equal(s.bujo.focusId, null);
});

console.log(`${pass} passed`);
