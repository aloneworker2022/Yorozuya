// node tests/mind_occupancy.test.mjs — 腦袋佔有度（web/content/mind_occupancy.js＋stun_speech.js 接線）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const M = await import(`${dir}mind_occupancy.js`);
const S = await import(`${dir}stun_speech.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const LINE = "你不要這樣，我生氣了。";
const occ1 = (id, pts, extra = []) => M.combineOccupancy([{ id, pts }, ...extra]);
const run = (id, pts, voice = "scream", seed = 7, extra = {}) =>
  M.applyOccupancy(LINE, occ1(id, pts), { voice, rng: M.makeRng(seed), ...extra });
const words = (s) => (s.match(/你|不要|這樣|我|生氣|了/g) || []).length;
const PAIN = /痛|碰不得|過敏/;

t("分段門檻", () => {
  assert.equal(M.occupancyBand(5), "none");
  assert.equal(M.occupancyBand(15), "light");
  assert.equal(M.occupancyBand(45), "split");
  assert.equal(M.occupancyBand(80), "eaten");
  assert.equal(M.occupancyBand(96), "mute");
});

t("疊加：最大全算、其他依剩餘空間打折（跳蛋45＋乳頭15≈53）", () => {
  const o = M.combineOccupancy([{ id: "vibe", pts: 45 }, { id: "nipple", pts: 15 }]);
  assert.ok(o.score >= 50 && o.score <= 58, String(o.score));
  assert.equal(o.top, "vibe");
  assert.equal(M.combineOccupancy([{ id: "spasm", pts: 80 }, { id: "clit", pts: 25 }, { id: "nipple", pts: 25 }]).score <= 100, true);
});

t("cap：自己脫衣壓 30", () => {
  const o = M.combineOccupancy([{ id: "spasm", pts: 84 }], { cap: 30 });
  assert.equal(o.score, 30);
  assert.equal(o.raw, 84);
  assert.equal(o.band, "light");
});

t("<10 不動原句", () => {
  assert.equal(M.applyOccupancy(LINE, M.combineOccupancy([]), { rng: M.makeRng(1) }), LINE);
});

t("light（15/25）：整句都在", () => {
  for (let seed = 1; seed < 40; seed++) {
    for (const [id, p] of [["nipple", 15], ["clit", 25], ["nipple_ring", 20]]) {
      const out = run(id, p, "scream", seed);
      assert.equal(out.replace(/…[^…]*…|…[^…。]*。$/g, (m) => (m.endsWith("。") ? "。" : "")).replace(/[，。…]/g, "").includes("你不要這樣我生氣了"), true, out);
    }
  }
});

t("split（45/60）：每個詞都在、至少一聲呻吟", () => {
  for (let seed = 1; seed < 40; seed++) {
    for (const [id, p] of [["vibe", 45], ["penis", 60]]) {
      const out = run(id, p, "scream", seed);
      for (const w of ["你", "要", "這", "我", "氣", "了"]) assert.ok(out.includes(w), `${out} 缺 ${w}`);
      assert.ok(/[嗯啊咿唔哈]/.test(out.replace(/[你不要這樣我生氣了]/g, "")), out);
    }
  }
});

t("eaten（70→80→92）：剩的字越來越少", () => {
  let a = 0, b = 0, c = 0;
  for (let seed = 1; seed <= 60; seed++) {
    a += words(run("stun", 70, "scream", seed));
    b += words(run("spasm", 80, "scream", seed));
    c += words(run("overstim", 92, "scream", seed));
  }
  assert.ok(a > b && b > c, `${a} ${b} ${c}`);
  assert.ok(c >= 1 * 60 * 0.9, "92 仍至少留一個字");
});

t("mute（≥95）：沒有原句的詞", () => {
  for (let seed = 1; seed < 40; seed++) {
    const out = run("climax", 98, "scream", seed);
    assert.ok(!/這樣|生氣|我/.test(out), out);
    assert.ok(out.length >= 4);
  }
});

t("過感不再喊痛", () => {
  for (let seed = 1; seed < 80; seed++) {
    for (const v of M.OCC_VOICES) assert.ok(!PAIN.test(run("overstim", 92, v, seed)));
  }
});

t("精液流出：一次性驚呼，原句完整", () => {
  const o = M.combineOccupancy([{ id: "semen_out", pts: 35 }]);
  for (let seed = 1; seed < 20; seed++) {
    const out = M.applyOccupancy(LINE, o, { rng: M.makeRng(seed), semenOutEvent: "fresh" });
    assert.ok(/[啊喔呀]～/.test(out), out);
    assert.ok(out.replace(/…[^…]*～[^…]*…|…[^…]*～…|…(?:流|有|腿)[^…]*…/g, "").includes("我生氣了"), out);
  }
});

t("語氣：碎拒疊否定／黏求帶♡／失語用……", () => {
  let refuse = 0, beggy = 0, blank = 0;
  for (let seed = 1; seed <= 40; seed++) {
    if (/不要不要|停|不…/.test(run("spasm", 80, "refuse", seed))) refuse += 1;
    if (/♡|還、還要/.test(run("spasm", 80, "beggy", seed))) beggy += 1;
    const bl = run("spasm", 80, "blankish", seed);
    if (bl.includes("……") && !/[！♡]/.test(bl)) blank += 1;
  }
  assert.ok(refuse >= 30, `refuse ${refuse}`);
  assert.ok(beggy >= 30, `beggy ${beggy}`);
  assert.ok(blank >= 36, `blank ${blank}`);
});

t("同 seed 同結果（可重現）", () => {
  assert.equal(run("spasm", 80, "scream", 42), run("spasm", 80, "scream", 42));
});

t("LLM 自己寫的呻吟段會被拿掉（≥35）", () => {
  const out = M.applyOccupancy("嗯嗯…啊啊，你不要這樣，我生氣了。", occ1("penis", 60), { rng: M.makeRng(3) });
  assert.ok(out.startsWith("你"), out);
});

/* ── stun_speech 接線 ── */
const girl = (extra = {}) => {
  const g = { id: "g1", stage: "girlfriend", bodyState: { arousal: 0, libido: 8, moanVoice: "scream", openness: 50, organs: {} } };
  S.ensureStunFields(g);
  Object.assign(g.bodyState, extra);
  return g;
};

t("沒事：佔有度 0、不跳 LLM", () => {
  const g = girl();
  assert.equal(S.peekOccupancy(g).score, 0);
  assert.equal(S.shouldSkipLlm(0, g), false);
});

t("乳頭腫 2 → 18；陰蒂腫 3 → 25", () => {
  const g = girl();
  g.bodyState.organs.nipples.swell = 2;
  assert.equal(S.peekOccupancy(g).score, 18);
  const h = girl();
  h.bodyState.organs.clit.swell = 3;
  assert.equal(S.peekOccupancy(h).score, 25);
});

t("塞著：跳蛋 > 陰莖 > 手指 都有分；肏（inSex）算陰莖", () => {
  const g = girl();
  g.bodyState.organs.vagina.stuffed = "vibe";
  const vibe = S.peekOccupancy(g).sources.find((s) => s.id === "vibe");
  assert.equal(vibe.pts, 45);
  const h = girl();
  assert.equal(S.peekOccupancy(h, "", { inSex: true }).sources.find((s) => s.id === "penis").pts, 60);
});

t("痙攣中：佔有度 ≥70、仍問 LLM；過感 ≥90", () => {
  const g = girl({ spasmUntil: Date.now() + 60000 });
  const o = S.peekOccupancy(g);
  assert.ok(o.score >= 70 && o.score < 95, String(o.score));
  assert.equal(S.shouldSkipLlm(80, g), false);
  g.bodyState.overstim = true;
  assert.ok(S.peekOccupancy(g).score >= 90);
  assert.ok(!PAIN.test(S.spasmTemplate(g, "")));
});

t("高潮那一下 ≥95 → 跳 LLM（本地呻吟）", () => {
  const g = girl();
  const o = S.takeOccupancy(g, "", { climaxNow: true });
  assert.ok(o.score >= 95);
  const line = S.presentOccupied(g, LINE, "", o, { rng: M.makeRng(2) });
  assert.ok(!/這樣|生氣/.test(line), line);
});

t("自己脫衣：痙攣中 cap 30 → 好好講話（原句都在）", () => {
  const g = girl({ spasmUntil: Date.now() + 60000 });
  for (let seed = 1; seed < 30; seed++) {
    const o = S.takeOccupancy(g, "", { cap: 30 });
    assert.equal(o.score, 30);
    const line = S.presentOccupied(g, LINE, "", o, { rng: M.makeRng(seed) });
    assert.ok(line.replace(/…[^…]*…/g, "，").replace(/…[^…]*。$/, "。").replace(/[，。]/g, "").includes("你不要這樣我生氣了"), line);
  }
});

t("精液流出：拔出後第一句 fresh、下一句 fade、再來沒了；塞著不流", () => {
  const g = girl();
  g.bodyState.organs.uterus.semen = 2;
  g.bodyState.organs.vagina.stuffed = "penis";
  assert.equal(S.takeOccupancy(g).semenOut, "");
  g.bodyState.organs.vagina.stuffed = "semen";
  assert.equal(S.peekOccupancy(g).semenOut, "fresh");
  assert.equal(S.takeOccupancy(g).semenOut, "fresh");
  assert.equal(S.takeOccupancy(g).semenOut, "fade");
  assert.equal(S.takeOccupancy(g).semenOut, "");
  // 又被內射（量變多）→ 再流一次
  g.bodyState.organs.uterus.semen = 3;
  assert.equal(S.takeOccupancy(g).semenOut, "fresh");
  // 過 8 分鐘可能再流（rng 0 → 一定）
  g.bodyState.semenOutAt = Date.now() - S.SEMEN_OUT_REDRIP_MS - 1000;
  g.bodyState.semenOutLeft = 0;
  assert.equal(S.takeOccupancy(g, "", { rng: () => 0 }).semenOut, "fresh");
  // 精液清空 → 歸零
  g.bodyState.organs.uterus.semen = 0;
  assert.equal(S.takeOccupancy(g).semenOut, "");
  assert.equal(g.bodyState.semenOutLast, 0);
});

t("失神 → 佔有度換算（沒被刺激最多 20）", () => {
  assert.equal(S.stunToOccupancy(20), 0);
  assert.equal(S.stunToOccupancy(25), 10);
  assert.equal(S.stunToOccupancy(50), 35);
  assert.equal(S.stunToOccupancy(75), 70);
  assert.equal(S.stunToOccupancy(100), 90);
  assert.equal(S.stunToOccupancy(60, false), 20);
});

t("乳環掛鉤：bodyState.nippleRing 為真才有", () => {
  const g = girl();
  assert.equal(S.peekOccupancy(g).sources.length, 0);
  g.bodyState.nippleRing = true;
  assert.equal(S.peekOccupancy(g).sources[0].id, "nipple_ring");
  assert.equal(S.peekOccupancy(g, "", { clothed: false }).score, 12);
});

console.log(`\n${pass} passed`);
