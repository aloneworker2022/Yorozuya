// node tests/dialogue_pov.test.mjs — 房間對話人稱（2026-11-10 使用者：她把「你／我」弄反，問名字說「怎麼稱呼我」）
// 送給模型的 user 旁白要用她的視角（你＝她、他＝玩家）；系統提示要寫清楚人稱規則。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../web/content/test_room_summon.js", import.meta.url), "utf8");
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log("ok -", n); };
const grab = (name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `找不到 ${name}`);
  const j = src.indexOf("\n}\n", i);
  return src.slice(i, j + 2);
};
const { herView, actForHer } = new Function(`${grab("herView")}\n${grab("actForHer")}\nreturn { herView, actForHer };`)();

t("玩家視角旁白 → 她的視角", () => {
  assert.equal(herView("（你抱了抱她。）"), "（他抱了抱你。）");
  assert.equal(herView("（她自己走到你面前，扭扭捏捏地看著你。）"), "（你自己走到他面前，扭扭捏捏地看著他。）");
  assert.equal(herView("（你射在她裡面了——精液剩 3 cc。）"), "（他射在你裡面了——精液剩 3 cc。）");
  assert.equal(herView("（旁白：她看你的眼神好像沒那麼防備了。）"), "（旁白：你看他的眼神好像沒那麼防備了。）");
});
t("「你們」與「」裡的引話不翻", () => {
  assert.equal(herView("（你們要做愛了，她趴著翹起屁股。）"), "（你們要做愛了，你趴著翹起屁股。）");
  assert.equal(herView("（你從書櫃拿出「報告」遞給她：「妳看看，你覺得呢？」）"), "（他從書櫃拿出「報告」遞給你：「妳看看，你覺得呢？」）");
});
t("動作鈕文字 → （旁白：他…你…。）", () => {
  assert.equal(actForHer("輕輕摟住她的腰"), "（旁白：他輕輕摟住你的腰。）");
  assert.equal(actForHer(""), "");
});
t("系統提示有人稱規則與問名字的對錯例", () => {
  assert.match(src, /function povPromptLines\(\)/);
  assert.match(src, /\.\.\.povPromptLines\(\),/);
  assert.match(src, /錯：「怎麼稱呼我？」/);
  assert.ok(!/問他怎麼稱呼就好/.test(src), "問名字提示不要再寫成會被讀反的「問他怎麼稱呼」");
});
t("推進 lines 的玩家視角旁白都有翻（不再出現 user 角色的「（你…她…）」字面）", () => {
  const bad = src.split("\n").filter((l) => /lines\.push\(\{ role: "user", content: [`"]（(你|她)/.test(l));
  assert.deepEqual(bad, []);
});
console.log(`\n${pass} passed`);
