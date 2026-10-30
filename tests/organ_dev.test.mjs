// node tests/organ_dev.test.mjs — 器官開發度（web/content/organ_dev.js＋body_state ensureBody＋girl_gen 新妹子粉色＋stun_speech 佔有度＋sdtags 對齊）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const D = await import(`${dir}organ_dev.js`);
const B = await import(`${dir}body_state.js`);
const S = await import(`${dir}stun_speech.js`);
const G = await import(`${dir}girl_gen.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const MIN = 60e3;
const T0 = Date.UTC(2026, 9, 9, 8, 0, 0);
const girl = (look = {}) => ({ stage: "girlfriend", look: { areola: "小巧粉嫩的乳暈", nipple: "粉嫩、微微凸起的乳頭", labia_color: "粉嫩淺色的陰唇", ...look }, bodyState: { arousal: 0, organs: {} } });

t("同一場每個器官最多 +1；關掉聊天馬上再開還是同一場；隔 30 分鐘以上才算新的一場", () => {
  const g = girl();
  let r = D.noteTouchPart(g, "nipple", T0);
  assert.deepEqual(r.counted, ["nipples"]);
  assert.equal(r.newSession, true);
  for (let i = 1; i <= 15; i++) assert.deepEqual(D.noteTouchPart(g, "nipple", T0 + i * MIN).counted, []);
  r = D.noteTouchPart(g, "labia", T0 + 16 * MIN);          // 同一場摸到別的 → 那個 +1
  assert.deepEqual(r.counted, ["labia"]);
  assert.deepEqual(D.noteTouchPart(g, "nipple", T0 + 40 * MIN).counted, []);   // 距上一下 24 分 → 同一場
  r = D.noteTouchPart(g, "nipple", T0 + 71 * MIN);           // 距上一下 31 分 → 新的一場
  assert.equal(r.newSession, true);
  assert.deepEqual(r.counted, ["nipples"]);
  const c = g.bodyState.organDev.counts;
  assert.equal(c.nipples, 2);
  assert.equal(c.labia, 1);
  assert.equal(c.sex, 0);
});

t("做愛：陰道＋陰唇＋被肏；同一場先調戲再做愛，被肏照樣 +1，但陰唇不重複算", () => {
  const g = girl();
  D.noteTouchPart(g, "labia", T0);
  const r = D.noteTouch(g, ["vagina", "labia", "sex"], T0 + 5 * MIN);
  assert.deepEqual(r.counted, ["vagina", "sex"]);
  assert.deepEqual(D.noteTouchPart(g, "creampie", T0 + 6 * MIN).counted, []);
  assert.equal(D.noteTouchPart(g, "waist", T0), null);       // 不是器官的部位不算
});

t("乳頭每 100 場一級、陰唇（被肏）每 20 場一級：粉 → 咖啡 → 黑，封頂黑", () => {
  const g = girl();
  B.ensureBody(g);
  assert.deepEqual(D.addSessions(g, "nipples", 99, T0), []);
  assert.equal(g.bodyState.organDev.color.nipples, 0);
  assert.deepEqual(D.addSessions(g, "nipples", 1, T0), [{ organ: "nipples", from: 0, to: 1 }]);
  D.addSessions(g, "nipples", 100, T0);
  assert.equal(g.bodyState.organDev.color.nipples, 2);
  D.addSessions(g, "nipples", 500, T0);
  assert.equal(g.bodyState.organDev.color.nipples, 2);
  D.addSessions(g, "sex", 19, T0);
  assert.equal(g.bodyState.organDev.color.labia, 0);
  D.addSessions(g, "sex", 1, T0);
  assert.equal(g.bodyState.organDev.color.labia, 1);
  D.addSessions(g, "sex", 20, T0);
  assert.equal(g.bodyState.organDev.color.labia, 2);
  // 只摸陰唇（沒被肏）不會變色
  const h = girl();
  D.addSessions(h, "labia", 100, T0);
  assert.equal(h.bodyState.organDev.color.labia, 0);
});

t("外觀跟著顏色走：大小／形狀照原本，顏色換；原字串留在 devBase", () => {
  const g = girl({ areola: "偏大一圈的粉褐乳暈", nipple: "明顯挺立的粉嫩乳尖" });
  B.ensureBody(g);
  assert.equal(g.look.areola, "寬廣深粉、邊緣柔和的大乳暈");     // 粉色、偏大
  assert.equal(g.look.devBase.areola, "偏大一圈的粉褐乳暈");
  D.addSessions(g, "nipples", 100, T0);
  assert.equal(g.look.areola, "偏大、被玩成咖啡色的乳暈");
  assert.equal(g.look.nipple, "明顯挺立的咖啡色乳尖");
  D.addSessions(g, "nipples", 100, T0);
  assert.equal(g.look.areola, "偏大、被玩到發黑的乳暈");
  D.addSessions(g, "sex", 40, T0);
  assert.equal(g.look.labia_color, "深褐近黑的陰唇");
});

t("新召喚／舊存檔：一律從粉色起算（抽到深色乳暈也改粉），只有開發會變深", () => {
  const old = girl({ areola: "近乎黑色的深色乳暈、對比強烈", nipple: "粗長、深色、非常明顯的乳頭", labia_color: "深褐近黑的陰唇" });
  B.ensureBody(old);
  assert.equal(old.bodyState.organDev.color.nipples, 0);
  assert.equal(old.look.areola, "寬廣深粉、邊緣柔和的大乳暈");
  assert.equal(old.look.nipple, "粗長、粉嫩、非常明顯的乳頭");
  assert.equal(old.look.labia_color, "粉嫩淺色的陰唇");
  // 新召喚：girl_gen 抽完就改粉（池子照舊，devBase 留原字串）
  const pools = JSON.parse(readFileSync(`${dir}persona_pools.json`, "utf8"));
  G.setPools(pools);
  for (let i = 0; i < 40; i++) {
    const n = G.generateGirl({ luck: 90, rating: "nsfw" });
    assert.ok(Object.values(D.AREOLA_TEXT).some((row) => row[0] === n.look.areola), n.look.areola);
    assert.ok(Object.values(D.NIPPLE_TEXT).some((row) => row[0] === n.look.nipple), n.look.nipple);
    assert.equal(n.look.labia_color, D.LABIA_TEXT[0]);
    assert.ok(n.look.devBase && "areola" in n.look.devBase);
  }
  // SFW 沒抽到的軸保持空
  const sfw = { look: { areola: "", nipple: "" } };
  D.applyDevLook(sfw.look, { nipples: 2 });
  assert.equal(sfw.look.areola, "");
});

t("只會變深：存的顏色比場數算的深 → 保留；壞資料不爆", () => {
  const g = girl();
  g.bodyState.organDev = { counts: { nipples: 3, sex: "x" }, color: { nipples: 2, labia: 9 } };
  const d = B.ensureBody(g).organDev;
  assert.equal(d.color.nipples, 2);
  assert.equal(d.color.labia, 2);
  assert.equal(d.counts.sex, 0);
  assert.equal(g.look.areola, "小巧、被玩到發黑的乳暈");
  D.addSessions(g, "nipples", -50, T0);                      // 場數減少也不會變淺
  assert.equal(d.color.nipples, 2);
  // 只有除錯歸零才回粉
  D.resetOrganDev(g);
  assert.equal(g.bodyState.organDev.color.nipples, 0);
  assert.equal(g.look.areola, "小巧粉嫩的乳暈");
  assert.equal(D.ensureOrganDev({}), null);
  assert.equal(D.noteTouch(null, ["nipples"]), null);
});

t("敏感度：門檻、性奮加成、佔有度倍率、做愛激情機率", () => {
  const g = girl();
  B.ensureBody(g);
  assert.equal(D.sensLevel(g, "nipples"), 0);
  D.addSessions(g, "nipples", 30, T0);
  assert.equal(D.sensLevel(g, "nipples"), 1);
  D.addSessions(g, "nipples", 170, T0);
  assert.equal(D.sensLevel(g, "nipples"), 3);
  D.addSessions(g, "clit", 30, T0);
  assert.equal(D.sensLevel(g, "clit"), 2);
  assert.equal(D.devArousalBonus(g, "nipple"), 3);
  assert.equal(D.devArousalBonus(g, "uterus"), 2);            // 陰蒂 2、陰道 0 → 取大
  assert.equal(D.devArousalBonus(g, "waist"), 0);
  assert.equal(D.devOccupancyMult(g, "nipple"), 1.6);
  assert.equal(D.devPassionChance(g), 0);
  D.addSessions(g, "sex", 10, T0);                             // 被肏也讓陰唇敏感
  assert.equal(D.sensLevel(g, "labia"), 1);
  D.addSessions(g, "vagina", 60, T0);
  assert.ok(Math.abs(D.devPassionChance(g) - 0.36) < 1e-9);
  // 佔有度：乳頭腫 3，開發 3 級 → ×1.6
  g.bodyState.organs.nipples = { swell: 3, wet: false };
  const plain = S.occupancySources(g, "", { organDev: false, hunger: 0 }).find((x) => x.id === "nipple").pts;
  const dev = S.occupancySources(g, "", { organDev: true, hunger: 0 }).find((x) => x.id === "nipple").pts;
  assert.equal(dev, Math.round(plain * 1.6));
});

t("高潮次數", () => {
  const g = girl();
  assert.equal(D.noteOrgasm(g), 1);
  assert.equal(D.noteOrgasm(g), 2);
  assert.equal(g.bodyState.organDev.orgasms, 2);
});

t("prompt：顏色和敏感度用說的、絕不寫數字；粉色又沒開發 → 沒有這段", () => {
  const g = girl();
  B.ensureBody(g);
  assert.deepEqual(D.organDevPromptLines(g, { now: T0 }), []);
  D.addSessions(g, "nipples", 100, T0);
  D.addSessions(g, "sex", 40, T0);
  for (let i = 0; i < 12; i++) D.noteOrgasm(g);
  const lines = D.organDevPromptLines(g, { now: T0 + MIN });
  const txt = lines.join("\n");
  assert.match(txt, /咖啡色/);
  assert.match(txt, /陰唇被他肏到發黑/);
  assert.match(txt, /最近/);
  assert.match(txt, /高潮過很多次/);
  assert.doesNotMatch(lines.slice(1).join(""), /\d/);
  const wife = D.organDevPromptLines({ ...g, stage: "wife" }, { now: T0 + 3 * 86400e3 });
  assert.match(wife.join(""), /老公/);
  assert.doesNotMatch(wife.join(""), /最近/);
});

t("每個外觀字串都在 server/sdtags.py 查得到，而且帶對的顏色 tag", () => {
  const py = readFileSync(fileURLToPath(new URL("../server/sdtags.py", import.meta.url)), "utf8");
  const tagOf = (text) => {
    const m = py.match(new RegExp(`"${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"([^"]*)"`));
    return m ? m[1] : null;
  };
  for (const [size, row] of Object.entries(D.AREOLA_TEXT)) {
    row.forEach((text, lv) => {
      const tag = tagOf(text);
      assert.ok(tag != null, `sdtags 缺 ${text}`);
      assert.equal(D.areolaSize(text), size, text);
      if (lv > 0) assert.ok(tag.includes(D.AREOLA_COLOR_TAG[lv]), `${text} → ${tag}`);
    });
  }
  for (const [shape, row] of Object.entries(D.NIPPLE_TEXT)) {
    row.forEach((text, lv) => {
      const tag = tagOf(text);
      assert.ok(tag != null, `sdtags 缺 ${text}`);
      assert.equal(D.nippleShape(text), shape, text);
      if (lv > 0) assert.ok(tag.includes(D.NIPPLE_COLOR_TAG[lv]), `${text} → ${tag}`);
    });
  }
  D.LABIA_TEXT.forEach((text, lv) => assert.ok((tagOf(text) || "").includes(D.LABIA_COLOR_TAG[lv]), text));
  // 池子裡每個乳暈／乳頭都分得出大小／形狀
  const pools = JSON.parse(readFileSync(`${dir}persona_pools.json`, "utf8"));
  const sizes = Object.fromEntries(pools.female.appearance.areola.map((x) => [x.text, D.areolaSize(x.text)]));
  assert.equal(sizes["近乎黑色的深色乳暈、對比強烈"], "large");
  assert.equal(sizes["幾乎佔滿半邊乳房的誇張大乳暈"], "huge");
  assert.equal(sizes["紅潤充血色、敏感看起來偏腫的乳暈"], "puffy");
  assert.equal(sizes["精緻淡粉、面積偏小的乳暈"], "small");
  assert.equal(sizes["淺褐帶點雀斑感的自然乳暈"], "mid");
});

console.log(`\n${pass} passed`);
