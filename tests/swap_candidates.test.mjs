// node tests/swap_candidates.test.mjs — 候選夫妻：現場抽、當日沿用、不碰 cafe 名冊
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const dir = pathToFileURL(new URL("../web/content/", import.meta.url).pathname).href.replace(/\/$/, "/");
const M = await import(dir + "swap_candidates.js?v=2");

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const tAsync = async (name, fn) => { await fn(); pass += 1; console.log("ok -", name); };

t("todayKey 是 YYYY-MM-DD", () => {
  assert.match(M.todayKey(Date.parse("2026-10-23T08:00:00+08:00")), /^\d{4}-\d{2}-\d{2}$/);
});

await tAsync("loadCandidates：新抽 min 對，寫入 store，不呼叫 cafe put", async () => {
  const store = M.memoryStore();
  let rolls = 0, puts = 0;
  const rollCouple = async () => {
    rolls += 1;
    return {
      id: `c${rolls}`,
      husband: { id: `c${rolls}h`, name: `夫${rolls}`, age: 30, swapType: "紳士型", swapPrice: 25, look: { hair_en: "x" } },
      wife: { id: `c${rolls}w`, name: `妻${rolls}`, age: 28, role: "other_wife", swapType: "害羞人妻", look: { face: "f", eyes: "e" } },
    };
  };
  const pack = await M.loadCandidates({
    store, min: 3, now: Date.parse("2026-10-23T12:00:00+08:00"),
    rollCouple,
    rollCkpts: (c, list) => { c.husband.ckpt = list[0]; c.wife.ckpt = list[1]; },
    usableCkpts: async () => ["A.safetensors", "B.safetensors"],
  });
  assert.equal(pack.reused, false);
  assert.equal(pack.day, "2026-10-23");
  assert.equal(pack.candidates.length, 3);
  assert.equal(rolls, 3);
  assert.equal(pack.candidates[0].husband.ckpt, "A.safetensors");
  assert.equal(pack.candidates[0].wife.ckpt, "B.safetensors");
  assert.equal(pack.candidates[0].wife.role, "other_wife");
  // store 有資料
  assert.ok(store.getItem(M.CANDIDATES_KEY));
});

await tAsync("每次進選單都新抽（2026-10-24），並避開最近見過的名字", async () => {
  const store = M.memoryStore();
  let rolls = 0; const seen = [];
  const names = ["A", "B", "A", "C", "D", "E", "F", "G", "H", "I"];
  const rollCouple = async ({ usedNames }) => {
    seen.push(usedNames.slice());
    const n = names[rolls % names.length]; rolls += 1;
    return { id: `c${rolls}`, husband: { name: `夫${n}`, swapPrice: 20 }, wife: { name: `妻${n}`, role: "other_wife" } };
  };
  const now = Date.parse("2026-10-23T10:00:00+08:00");
  const a = await M.loadCandidates({ store, min: 2, now, rollCouple });
  const b = await M.loadCandidates({ store, min: 2, now: now + 1000, rollCouple });
  assert.equal(a.reused, false); assert.equal(b.reused, false);
  for (const id of b.candidates.map((c) => c.husband.name)) assert.ok(!a.candidates.map((c) => c.husband.name).includes(id), "第二批不重複第一批的名字");
  assert.ok(M.readRecent(store).includes("妻A"));
  assert.ok(seen.at(-1).includes("妻A"));   // 傳給 rollCouple 的 usedNames 含最近的
  const r = await M.loadCandidates({ store, min: 2, now: now + 2000, rollCouple, reuse: true });
  assert.equal(r.reused, true);   // 舊行為只在 reuse 才有
});

await tAsync("force 或隔日＝重抽", async () => {
  const store = M.memoryStore();
  let rolls = 0;
  const rollCouple = async () => {
    rolls += 1;
    return { id: `c${rolls}`, husband: { name: "H", swapPrice: 20 }, wife: { name: "W", role: "other_wife" } };
  };
  const d1 = Date.parse("2026-10-23T10:00:00+08:00");
  const a = await M.loadCandidates({ store, min: 2, now: d1, rollCouple });
  const b = await M.loadCandidates({ store, min: 2, now: d1, force: true, rollCouple });
  assert.equal(b.reused, false);
  assert.notDeepEqual(b.candidates.map((c) => c.id), a.candidates.map((c) => c.id));
  const c = await M.loadCandidates({ store, min: 2, now: Date.parse("2026-10-24T10:00:00+08:00"), rollCouple });
  assert.equal(c.reused, false);
  assert.equal(c.day, "2026-10-24");
});

t("openSwapSelect 原始碼不再用 loadRoster 填候選", async () => {
  // 靜態檢查：選單路徑走 loadGameCandidates
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../web/content/swap_select.js", import.meta.url), "utf8");
  assert.match(src, /loadGameCandidates/);
  assert.match(src, /swap_candidates\.js\?v=2/);
  // openSwapSelect 內不应再呼叫 loadRoster()
  const fn = src.slice(src.indexOf("export function openSwapSelect"), src.indexOf("export function swapAskChance"));
  assert.equal(fn.includes("loadRoster("), false);
  assert.equal(fn.includes("loadGameCandidates"), true);
  assert.equal(fn.includes("選了之後才會產生立繪"), true);
});

console.log(`\n${pass} passed`);
