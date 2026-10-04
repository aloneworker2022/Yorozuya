// node tests/sex_thrust.test.mjs — 肏互動數值與台詞幫浦（web/content/sex_thrust.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const T = await import(`${dir}sex_thrust.js`);
let pass = 0;
const t = async (n, f) => { await f(); pass++; console.log("ok -", n); };
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

const P = await import(`${dir}player_state.js`);
await t("精液＝玩家真正的值（不是每場 18cc）；激情／興奮 0；沒給才退回 18", () => {
  const s = T.newThrustSession({ semenCc: 9 });
  assert.equal(s.semen, 9); assert.equal(s.passion, 0); assert.equal(s.excite, 0);
  assert.equal(T.newThrustSession({ semenCc: 0 }).semen, 0);
  assert.equal(T.newThrustSession({ semenCc: -4 }).semen, -4);
  assert.equal(T.newThrustSession().semen, T.THRUST.SEMEN_FALLBACK_CC);
  assert.equal(T.THRUST.SEMEN_START_CC, undefined, "固定 18cc 池拿掉了");
  assert.equal(T.THRUST.SEMEN_PER_EJAC_CC, 6);
  assert.equal(T.syncSemen(s, 14).semen, 14);
  assert.equal(T.syncSemen(s, "x").semen, 14);
});
await t("玩家精液可到負：spendSemen −6；ensurePlayer／回復不把負數拉回 0；回復照時間 +1/h", () => {
  let p = P.ensurePlayer({ semenCc: 4, lastSemenAt: Date.now() });
  const r = P.spendSemen(p, 6);
  assert.equal(r.before, 4); assert.equal(r.after, -2);
  p = P.ensurePlayer(r.player); assert.equal(p.semenCc, -2);
  p = P.regenSemen({ ...p, lastSemenAt: Date.now() - 3 * 3600000 }); assert.equal(p.semenCc, 1);
  assert.equal(P.ensurePlayer({ semenCc: -999 }).semenCc, P.SEMEN_FLOOR_CC);
  assert.equal(P.canTease({ semenCc: -2, lastSemenAt: Date.now() }), false);
  // 調戲射精照舊不會把正的扣到負
  const c = P.applyTeaseClimax({ semenCc: 10, climax: 19, lastSemenAt: Date.now() }, "clit");
  assert.equal(c.player.semenCc, 0);
  assert.equal(P.grantSemen({ semenCc: -5, lastSemenAt: Date.now() }, 3).after, -2);
});
await t("真實精液 20 → 14 → 8 → 2（危險）→ −4 結束；7 不警告、6 警告、<1 進來也警告且射一次就結束", () => {
  const s = T.newThrustSession({ semenCc: 20 });
  const out = [];
  for (let i = 0; i < 4; i++) { s.excite = 99; const r = T.applyThrust(s, { rng: () => 0.99 }); out.push([r.semenAfter, r.danger, r.ended]); }
  assert.deepEqual(out, [[14, false, false], [8, false, false], [2, true, false], [-4, true, true]]);
  assert.equal(T.semenDanger({ semen: 7 }), false);
  assert.equal(T.semenDanger({ semen: 6 }), true);
  const dry = T.newThrustSession({ semenCc: 0 });
  assert.equal(T.semenDanger(dry), true); assert.equal(dry.ended, false, "見底也能進");
  T.applyThrust(dry, { rng: () => 0.99 }); assert.equal(dry.ended, false, "沒射之前不結束");
  dry.excite = 99; const r = T.applyThrust(dry, { rng: () => 0.99 });
  assert.equal(r.semenAfter, -6); assert.equal(r.ended, true);
});
await t("一下：激情 +1～2、興奮 +5～8、感情 +1；機率看性奮與關係", () => {
  for (let k = 0; k < 200; k++) {
    const s = T.newThrustSession();
    const r = T.applyThrust(s, { arousal: Math.random() * 100, stage: "girlfriend" });
    assert.ok(r.passionAdd === 1 || r.passionAdd === 2);
    assert.ok(r.exciteAdd >= 5 && r.exciteAdd <= 8);
    assert.equal(r.affection, 1);
  }
  assert.ok(T.passionTwoChance(0, "stranger") < T.passionTwoChance(100, "stranger"));
  assert.ok(T.passionTwoChance(50, "stranger") < T.passionTwoChance(50, "wife"));
  assert.ok(T.passionTwoChance(100, "pathological_wife") <= 0.9 && T.passionTwoChance(0, "stranger") >= 0.1);
  assert.equal(T.exciteGain(() => 0), 5); assert.equal(T.exciteGain(() => 0.9999), 8);
});
await t("興奮到 100 → 射精、歸零、精液 −6；18→12→6→0 第三次見底結束；危險提示", () => {
  const s = T.newThrustSession({ semenCc: 18 });
  const rng = seq(0.99, 0.99, 0.99); // 激情 1、興奮 8、不換圖
  const ejacs = [];
  let r;
  for (let i = 0; i < 100 && !s.ended; i++) {
    r = T.applyThrust(s, { rng });
    if (r.ejac) ejacs.push({ at: s.thrusts, semen: r.semenAfter, danger: r.danger, ended: r.ended });
  }
  assert.deepEqual(ejacs.map((e) => e.semen), [12, 6, 0]);
  assert.equal(ejacs[0].at, 13); // 8×13=104 ≥100
  assert.deepEqual(ejacs.map((e) => e.danger), [false, true, true]);
  assert.deepEqual(ejacs.map((e) => e.ended), [false, false, true]);
  assert.equal(s.excite, 0);
  assert.equal(T.applyThrust(s, {}), null, "結束後不再算");
});
await t("精液可到負：起始 10 → 4（<6 危險）→ −2 結束", () => {
  const s = T.newThrustSession({ semenCc: 10 });
  s.excite = 99; T.applyThrust(s, { rng: () => 0.99 });
  assert.equal(s.semen, 4); assert.ok(T.semenDanger(s)); assert.equal(s.ended, false);
  s.excite = 99; T.applyThrust(s, { rng: () => 0.99 });
  assert.equal(s.semen, -2); assert.equal(s.ended, true);
});
await t("高潮：激情 >20 才判（20 不算），−3，感情 +10；之後更快再高潮", () => {
  const s = T.newThrustSession();
  s.passion = 20; assert.equal(T.checkOrgasm(s), null);
  s.passion = 21; const o = T.checkOrgasm(s);
  assert.deepEqual(o, { before: 21, after: 18, affection: 10, count: 1 });
  // 18 → 再 +1～2 幾下就 >20
  let n = 0; while (!T.checkOrgasm(s)) { T.applyThrust(s, { rng: () => 0.99 }); n++; }
  assert.equal(n, 3);
  assert.equal(s.orgasms, 2);
});
await t("換圖 1/3：switchRoll 依 rng；pickOtherImage 選不同的、只有一張不換", () => {
  const s = T.newThrustSession();
  // rng 順序：激情、興奮、換圖
  assert.equal(T.applyThrust(s, { rng: seq(0.99, 0.5, 0.2) }).switchRoll, true);
  assert.equal(T.applyThrust(s, { rng: seq(0.99, 0.5, 0.5) }).switchRoll, false);
  assert.equal(T.pickOtherImage(["a", "b"], "a"), "b");
  assert.equal(T.pickOtherImage(["a"], "a"), "a");
  assert.equal(T.pickOtherImage([], ""), "");
  let hits = 0; const s2 = T.newThrustSession();
  for (let i = 0; i < 3000; i++) { s2.excite = 0; if (T.applyThrust(s2, {}).switchRoll) hits++; }
  assert.ok(hits > 850 && hits < 1150, `switch ${hits}/3000`);
});
await t("動畫幀：第一下 1-2-3-4（慢快快慢）、之後 2-3-4", () => {
  const u = ["/1.png", "/2.png", "/3.png", "/4.png"];
  assert.deepEqual(T.animFramesFor(u, false), { frames: u, holds: [300, 180, 180, 300] });
  assert.deepEqual(T.animFramesFor(u, true), { frames: u.slice(1), holds: [180, 180, 300] });
  assert.deepEqual(T.animFramesFor([], true), { frames: [], holds: [] });
});
await t("打字：呻吟／標點 0.08s、一般字 0.12s；喘息佔位", () => {
  assert.equal(T.typeDelayFor("啊"), 80); assert.equal(T.typeDelayFor("…"), 80); assert.equal(T.typeDelayFor("嗯"), 80);
  assert.equal(T.typeDelayFor("好"), 120); assert.equal(T.typeDelayFor("深"), 120);
  assert.ok(/[啊嗯]/.test(T.pantPlaceholder()));
  assert.ok(T.fallbackMoan("orgasm").includes("去"));
});

await t("flow2 旗：潮吹不進自動流程（高潮只出 ④）；預產 抽插→高潮→內射", () => {
  assert.equal(T.THRUST.SQUIRT_IN_FLOW, false);
  assert.deepEqual(T.orgasmEventSteps(), ["orgasm"]);
  assert.deepEqual(T.orgasmEventSteps(true), ["orgasm", "squirt"]);
  assert.deepEqual(T.flowPregenSteps(), ["thrust", "orgasm", "cum"]);
  assert.deepEqual(T.flowPregenSteps(true), ["thrust", "orgasm", "squirt", "cum"]);
});
await t("開場態度看關係階：陌生/認識＝拒絕卻屈服、朋友/好友＝不是這種關係、女友/熱戀＝害羞、愛人＝想要、妻子以上＝求", () => {
  const m = { stranger: "resist", acquaintance: "resist", friend: "notthis", close_friend: "notthis", girlfriend: "shy", passionate: "shy",
    lover: "eager", wife: "beg", devoted_wife: "beg", obedient_wife: "beg", pathological_wife: "beg", "": "resist", bogus: "resist" };
  for (const [k, v] of Object.entries(m)) assert.equal(T.openingBand(k), v, k);
});
await t("開場要求：體位（傳教士自己張開、後背翹屁股）＋態度＋個性口吻；老公只有妻子以上", () => {
  const a = T.openingDirective({ stage: "stranger", pose: "missionary", personality: "傲嬌" });
  assert.ok(a.includes("張開") && a.includes("拒絕卻屈服") && a.includes("傲嬌") && a.includes("不要叫他老公"));
  const b = T.openingDirective({ stage: "wife", pose: "doggy", personality: "病嬌" });
  assert.ok(b.includes("翹高") && b.includes("求他") && b.includes("病嬌") && b.includes("可以叫他老公"));
  assert.ok(T.openingDirective({ stage: "friend" }).includes("我們不是這種關係"));
  assert.ok(T.openingDirective({ stage: "lover" }).includes("不要叫他老公"));
  for (const p of ["傲嬌", "清純反差", "高冷", "病嬌", "活潑開朗", "御姊", "天然呆", "文靜溫柔"]) assert.ok(T.openingStyleFor(p).startsWith(p));
  assert.ok(T.openingStyleFor("清純").startsWith("清純反差"));
  assert.ok(T.openingStyleFor("").startsWith("文靜溫柔"));
  const dz = T.openingDirective({ dazed: "stun" });
  assert.ok(dz.includes("失神") && dz.includes("只寫那一句") && dz.includes("十五字以內") && !dz.includes("夾一點喘息"));
  assert.ok(T.openingDirective({ dazed: "spasm" }).includes("痙攣"));
  assert.ok(!T.openingDirective({}).includes("失神"));
});
await t("開場本地台詞：每階×體位都有；老公只出現在妻子以上；scrubHusband", () => {
  const stages = ["stranger", "friend", "girlfriend", "lover", "wife"];
  for (const st of stages) for (const pose of ["missionary", "doggy"]) for (const r of [0, 0.5, 0.99]) {
    const line = T.openingFallback(st, pose, () => r);
    assert.ok(line.length > 3);
    assert.equal(line.includes("老公"), st === "wife", `${st} ${pose} ${line}`);
  }
  assert.ok(T.openingFallback("friend", "doggy", () => 0).includes("不是這種關係"));
  assert.ok(T.openingFallback("stranger", "doggy", () => 0).includes("屁股"));
  assert.equal(T.scrubHusband("老公快點", "girlfriend"), "你快點");
  assert.equal(T.scrubHusband("老公快點", "obedient_wife"), "老公快點");
});
await t("withTimeout：逾時回 fallback、失敗回 fallback、成功回值", async () => {
  assert.equal(await T.withTimeout(new Promise(() => {}), 20, "fb"), "fb");
  assert.equal(await T.withTimeout(Promise.reject(new Error("x")), 50, "fb"), "fb");
  assert.equal(await T.withTimeout(Promise.resolve("ok"), 50, "fb"), "ok");
});

await t("失神開場：大部分拆碎（weave）＋最後一小段聽得懂（2～5 字）", () => {
  assert.deepEqual(T.stunOpeningParts("哼…才、才不是想要…屁股翹這麼高…都是你害的…笨蛋…"), { garble: "哼才才不是想要屁股翹", clear: "笨蛋" });
  assert.deepEqual(T.stunOpeningParts("不要看，我還沒……回過神來"), { garble: "不要看我還沒", clear: "回過神來" });
  assert.deepEqual(T.stunOpeningParts("住手為什麼我自己張開了不要"), { garble: "住手為什麼我自己張", clear: "開了不要" });
  assert.deepEqual(T.stunOpeningParts(""), { garble: "", clear: "" });
  const seen = [];
  const weave = (w) => { seen.push(w); return Array.from(w).map((c) => `${c}喔…`).join(" ") + "\n痾…"; };
  const out = T.stunMixLine("老公～求你了，快給我", weave, () => 0);
  assert.deepEqual(seen, ["老公求你了"]);
  assert.ok(out.endsWith("\n哈…快給我…"), out);
  const lines = out.split("\n");
  assert.ok(lines.length >= 2 && lines.slice(0, -1).join("").includes("喔"));
  // 聽得懂的部分只佔一小段
  const clearLen = Array.from("快給我").length, total = Array.from(out.replace(/\s/g, "")).length;
  assert.ok(clearLen / total < 0.3, `${clearLen}/${total}`);
  assert.equal(T.stunMixLine("", (w) => `痾…${w}`, () => 0), "痾…嗯");
});
await t("局部動畫：第 4 幀只留 0.4 秒；預載最多等 1.5 秒", () => {
  assert.equal(T.THRUST.ANIM_LINGER_MS, 400);
  assert.equal(T.THRUST.ANIM_PRELOAD_MAX_MS, 1500);
});

function fakePump({ replyMs = 100, typeMs = 50 } = {}) {
  let now = 0;
  const timers = [];
  const sleep = (ms) => new Promise((r) => timers.push({ at: now + ms, r }));
  const log = [];
  const pump = new T.ThrustReplyPump({
    now: () => now,
    placeholder: (s) => log.push(`ph${s}`),
    request: async (s) => { await sleep(replyMs); return `r${s}`; },
    type: async (text) => { await sleep(typeMs); log.push(`typed ${text}`); },
    onDone: (s) => log.push(`done${s}`),
  });
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      timers.sort((a, b) => a.at - b.at);
      const nx = timers[0];
      if (!nx || nx.at > end) break;
      timers.shift(); now = nx.at; nx.r();
    }
    now = end;
    await new Promise((r) => setImmediate(r));
  };
  return { pump, log, advance, at: () => now };
}
await t("台詞幫浦：閒著馬上開；忙時只留最新一下（舊的丟）；打完前 0.8s 內有按 → 立刻接下一句", async () => {
  const f = fakePump({ replyMs: 1000, typeMs: 500 });
  f.pump.press(1);
  await f.advance(100); f.pump.press(2);
  await f.advance(100); f.pump.press(3); // 2 被丟
  await f.advance(1000); f.pump.press(4); // t=1200，第一句 1500 打完 → 300ms 內 → 接 4
  await f.advance(400);
  assert.deepEqual(f.pump.started, [1, 4]);
  assert.equal(f.pump.dropped, 2);
  assert.ok(f.log.includes("typed r1") && f.log.includes("done1"));
  await f.advance(2000);
  assert.ok(f.log.includes("typed r4"));
});
await t("台詞幫浦：最後一下早於打完 0.8s 以上 → 過期丟掉，等下次按再開", async () => {
  const f = fakePump({ replyMs: 1000, typeMs: 1000 });
  f.pump.press(1);
  await f.advance(200); f.pump.press(2); // t=200；打完 t=2000 → 隔 1.8s → 丟
  await f.advance(2000);
  assert.deepEqual(f.pump.started, [1]);
  assert.equal(f.pump.busy, false);
  f.pump.press(3); // 閒著 → 馬上開
  assert.deepEqual(f.pump.started, [1, 3]);
  f.pump.close(); await f.advance(3000);
  assert.ok(!f.log.includes("typed r3"), "關掉後不再打字");
});
await t("台詞幫浦：AI 失敗也會打字（交給 type 處理空字串）並繼續", async () => {
  let now = 0; const typed = [];
  const pump = new T.ThrustReplyPump({ now: () => now, request: async () => { throw new Error("x"); }, type: async (tx) => { typed.push(tx); } });
  pump.press(1); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(typed, [""]); assert.equal(pump.busy, false);
});
await t("台詞幫浦 urgent（她高潮那句）：忙時排第一、打完立刻接（不看 0.8 秒）、舊排隊丟掉", async () => {
  const f = fakePump({ replyMs: 1000, typeMs: 1000 });
  f.pump.press(1);
  await f.advance(100); f.pump.press(2);
  await f.advance(100); f.pump.urgent(3); // 2 丟、3 排隊
  await f.advance(2000); // t=2200：1 打完（隔最後一下 1.8s 也照接 3）
  assert.deepEqual(f.pump.started, [1, 3]);
  assert.equal(f.pump.dropped, 1);
  await f.advance(2500);
  assert.ok(f.log.includes("typed r3") && f.log.includes("done3"));
  f.pump.urgent(4); // 閒著 → 馬上開
  assert.deepEqual(f.pump.started, [1, 3, 4]);
});
await t("台詞幫浦：onDone 裡開了下一句 → 不會同時跑兩句（排隊的留給那句之後）", async () => {
  let now = 0; const running = []; let maxRun = 0; const started = [];
  let pumpRef;
  const pump = new T.ThrustReplyPump({
    now: () => now,
    request: async (sq) => { running.push(sq); maxRun = Math.max(maxRun, running.length); await new Promise((r) => setTimeout(r, 5)); running.splice(running.indexOf(sq), 1); return `r${sq}`; },
    type: async () => {},
    onDone: (sq) => { started.push(sq); if (sq === 1) pumpRef.urgent(9); },
  });
  pumpRef = pump;
  pump.press(1); pump.press(2);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(maxRun, 1);
  assert.deepEqual(pump.started, [1, 9]);
});
console.log(`${pass} passed`);
