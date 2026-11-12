// node tests/room_frames_mode.test.mjs — 相框使用者模式（2026-11-12 使用者：她做好的看板可以開使用者模式，選她／Hermes／她跟 Hermes，指定誰看、查看時間）
// RoomFrames.promptLines(now) 只講她看得到（勾了她＋在時間內）的那幾幅；誰來用決定措辭。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("../web/content/room_frames.js", import.meta.url), "utf8");
let pass = 0; const t = async (n, fn) => { await fn(); pass++; console.log("ok -", n); };

async function load(frames) {
  const window = {};
  const ctx = vm.createContext({
    window, document: { hidden: false, addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} }, createElement: () => ({}) },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ frames, wants: [] }) }),
    setTimeout: () => 0, console, Date, Math, JSON, Set, Array, String, Number, Promise, Error,
  });
  vm.runInContext(src, ctx);
  await window.RoomFrames.pull();
  return window.RoomFrames;
}
const fr = (slot, title, mode, by = "her") => ({ slot, fid: `${slot}abc`, title, entry: "index.html", by, girlName: "莉莉", runId: 7, url: `/frames/${slot}abc/index.html`, ...(mode ? { mode } : {}) });
const at = (s) => Date.parse(`${s}:00+08:00`);   // 台北時間
const NOON = at("2026-11-12T12:00");

await t("預設（沒設定）：只有你看得到，她不知道這幅", async () => {
  const R = await load([fr(0, "日記", null), null, null, null]);
  const f = R.state().frames[0];
  assert.ok(R.canView(f, "you", NOON));
  assert.ok(!R.canView(f, "her", NOON) && !R.canView(f, "hermes", NOON));
  assert.equal(R.promptLines(NOON).length, 0);
});

await t("沒勾她 → 一個字都不提", async () => {
  const R = await load([fr(0, "秘密看板", { operator: "her", viewers: ["you", "hermes"] }), null, null, null]);
  assert.equal(R.promptLines(NOON).length, 0);
});

await t("勾了她但不在查看時間內 → 不提；時間內 → 提", async () => {
  const R = await load([fr(2, "晚間股票板", { operator: "her", viewers: ["her"], start: "18:00", end: "22:00" }), null, null, null]);
  assert.equal(R.promptLines(at("2026-11-12T12:00")).length, 0);
  assert.equal(R.promptLines(at("2026-11-12T22:00")).length, 0);
  const lines = R.promptLines(at("2026-11-12T19:30")).join("\n");
  assert.match(lines, /後牆「晚間股票板」/);
  // 跨午夜、日期起訖
  const f = { mode: { viewers: ["her"], start: "22:00", end: "02:00", dateFrom: "2026-11-10", dateTo: "2026-11-20" } };
  assert.ok(R.canView(f, "her", at("2026-11-12T23:30")) && R.canView(f, "her", at("2026-11-13T01:00")));
  assert.ok(!R.canView(f, "her", at("2026-11-13T03:00")));
  assert.ok(!R.canView(f, "her", at("2026-11-09T23:30")) && !R.canView(f, "her", at("2026-11-21T23:30")));
});

await t("誰來用的措辭：她／一起／只有 Hermes／還沒選", async () => {
  const R = await load([
    fr(0, "我的日記", { operator: "her", viewers: ["her"] }),
    fr(1, "股票板", { operator: "both", viewers: ["her", "hermes"] }, "you"),
    fr(2, "Hermes 的工作板", { operator: "hermes", viewers: ["her", "hermes"] }),
    fr(3, "小遊戲", { operator: "", viewers: ["you", "her"] }),
  ]);
  const L = R.promptLines(NOON);
  const line = (k) => L.find((l) => l.includes(k));
  assert.match(line("我的日記"), /給你用的看板/);
  assert.match(line("我的日記"), /自己打開來用、操作/);
  assert.ok(!/Hermes 幫你/.test(line("我的日記")));
  assert.match(line("股票板"), /你和 Hermes 一起用/);
  assert.match(line("股票板"), /請 Hermes 幫你操作或更新/);
  assert.match(line("股票板"), /他掛上去的/);
  assert.match(line("Hermes 的工作板"), /Hermes 在用/);
  assert.match(line("Hermes 的工作板"), /不是給你自己操作的/);
  assert.ok(!/你可以自己打開來用/.test(line("Hermes 的工作板")));
  assert.match(line("小遊戲"), /還沒決定這幅給誰用/);
  assert.match(L.at(-1), /只有他能決定誰可以看、誰來用/);
});

await t("只把看得到的那幾幅講出去（混在一起）", async () => {
  const R = await load([
    fr(0, "看得到", { operator: "her", viewers: ["her"] }),
    fr(1, "看不到", { operator: "her", viewers: ["you"] }),
    null, null,
  ]);
  const s = R.promptLines(NOON).join("\n");
  assert.match(s, /看得到/);
  assert.ok(!s.includes("看不到"));
});

await t("UI：外層有「使用者模式」、存到 /api/frames/mode；你不在名單時藏內容", async () => {
  assert.match(src, /data-a="usermode">使用者模式</);
  assert.match(src, /\/api\/frames\/mode/);
  assert.match(src, /這幅現在不給你看/);
  assert.match(src, /data-a="unhang"/);
});
console.log(`\n${pass} passed`);
