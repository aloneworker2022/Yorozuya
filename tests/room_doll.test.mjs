// node tests/room_doll.test.mjs — 房間剪影產生器（web/content/room_doll.js）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
// 瀏覽器用的經典腳本，結尾有 module.exports（vm 沙盒會慢 20 倍，所以用 require）。
const D = createRequire(import.meta.url)(`${dir}room_doll.js`);
const pools = JSON.parse(readFileSync(`${dir}persona_pools.json`, "utf8")).female.appearance;

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const opaque = f => { let n = 0; for (let i = 3; i < f.pixels.length; i += 4) if (f.pixels[i]) n++; return n; };
const hash = f => createHash("sha1").update(Buffer.from(f.pixels.buffer)).update(Buffer.from(f.depth.buffer)).digest("hex");
const base = { height_cm: 161, build: "勻稱有致", cup: "D 罩杯、飽滿有份量", hair: "中分長髮" };

t("同一個 look 每次畫出一模一樣（像素＋深度）", () => {
  const d = D.lookToDoll(base);
  for (const [pose, frame, yaw] of [["idle", 0, 0], ["walk", 3, 45], ["sit", 0, -45]]) {
    assert.equal(hash(D.render(d, pose, frame, yaw)), hash(D.render(d, pose, frame, yaw)));
  }
});

t("幀尺寸 64×140、錨點 (32,126)、深度與像素一一對應", () => {
  const f = D.render(D.lookToDoll(base), "idle", 0, 0);
  assert.equal(f.width, 64); assert.equal(f.height, 140);
  assert.deepEqual({ ...f.anchor }, { x: 32, y: 126 });
  assert.equal(f.pixels.length, 64 * 140 * 4); assert.equal(f.depth.length, 64 * 140);
  for (let i = 0; i < f.depth.length; i++) assert.equal(f.pixels[i * 4 + 3] > 0, Number.isFinite(f.depth[i]), `px ${i}`);
  // 腳踩在錨點附近：最下面的實心列在錨點 ±4 內
  let bottom = 0;
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) if (f.pixels[(y * f.width + x) * 4 + 3]) bottom = y;
  assert.ok(Math.abs(bottom - f.anchor.y) <= 4, `bottom ${bottom}`);
});

t("顏色／透明度只有 v4 那幾種（身體 α204、頭髮 α220）", () => {
  const allowed = new Set([[...D.BODY_RGB, 204], [...D.LINE_RGB, 204], [...D.MARK_RGB, 204], [...D.HAIR_RGB, 220], [...D.HAIR_HI_RGB, 220]].map(String));
  const f = D.render(D.lookToDoll({ ...base, build: "運動健美", hair: "雙馬尾" }), "idle", 0, 0);
  const seen = new Set();
  for (let i = 0; i < f.pixels.length; i += 4) if (f.pixels[i + 3]) seen.add(String(Array.from(f.pixels.subarray(i, i + 4))));
  for (const c of seen) assert.ok(allowed.has(c), c);
  assert.ok(seen.has(String([...D.HAIR_RGB, 220])) && seen.has(String([...D.BODY_RGB, 204])));
});

t("13 種體型都有自己的參數、都畫得出來且彼此不同", () => {
  const names = pools.build.map(b => b.text);
  assert.equal(names.length, 13);
  const hashes = new Set();
  for (const build of names) {
    assert.ok(D.BUILDS[build], build);
    const d = D.lookToDoll({ ...base, build });
    assert.equal(d.build, build);
    const f = D.render(d, "idle", 0, 0);
    assert.ok(opaque(f) > 1200, `${build} ${opaque(f)}`);
    hashes.add(hash(f));
  }
  assert.equal(hashes.size, 13);
});

t("池子裡每個髮型都對得到剪影（雙馬尾＝twin），每種剪影都畫得出來", () => {
  for (const h of pools.hair.map(x => x.text)) assert.ok(D.HAIRS.includes(D.hairStyle(h)), h);
  assert.equal(D.hairStyle("雙馬尾"), "twin");
  assert.equal(D.hairStyle("高馬尾"), "pony_hi");
  assert.equal(D.hairStyle("及腰長直髮"), "waist");
  const hashes = new Set();
  for (const hair of D.HAIRS) {
    const f = D.render({ ...D.lookToDoll(base), hair }, "idle", 0, 0);
    assert.ok(opaque(f) > 1200, hair);
    hashes.add(hash(f));
  }
  assert.equal(hashes.size, D.HAIRS.length);
});

t("罩杯 A～I 都畫得出來，越大側面越凸", () => {
  let prev = 0;
  for (const cup of "ABCDEFGHI") {
    const f = D.render({ ...D.lookToDoll(base), cup }, "walk", 0, 90);
    const n = opaque(f);
    assert.ok(n > 1000, cup);
    assert.ok(n >= prev, `${cup} ${n} < ${prev}`);
    prev = n;
  }
  for (const c of pools.cup) assert.equal(D.lookToDoll({ ...base, cup: c.text }).cup, c.cup);
});

t("走路 8 格都不一樣；鏡像左右對調", () => {
  const d = D.lookToDoll(base);
  const fr = Array.from({ length: D.WALK_FRAMES }, (_, i) => D.render(d, "walk", i, 45));
  assert.equal(D.WALK_FRAMES, 8);
  assert.equal(new Set(fr.map(hash)).size, 8);
  const m = D.mirror(fr[0]);
  assert.equal(m.anchor.x, 64 - fr[0].anchor.x);
  for (let y = 0; y < 140; y += 7) for (let x = 0; x < 64; x++)
    assert.equal(m.pixels[(y * 64 + x) * 4 + 3], fr[0].pixels[(y * 64 + 63 - x) * 4 + 3]);
});

t("坐姿：四個朝向、椅／床／沙發座高都畫得出來", () => {
  const d = D.lookToDoll({ ...base, hair: "雙馬尾" }, { outfit: "JK 制服" });
  for (const facing of Object.keys(D.SEAT_YAW)) for (const seat of [35, 29, 30]) {
    const f = D.render(d, "sit", 0, D.SEAT_YAW[facing], { seat });
    assert.ok(opaque(f) > 900, `${facing} ${seat}`);
  }
});

t("乳搖：A 幾乎不動、I 很大；軟體型比結實的晃得多", () => {
  const amp = (build, cup) => {
    const d = { ...D.lookToDoll({ ...base, build }), cup }, P = D.proportions(d);
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 8; i++) { const z = D.bounceAt(P, d, 2 * Math.PI * i / 8)[2]; lo = Math.min(lo, z); hi = Math.max(hi, z); }
    return hi - lo;
  };
  assert.ok(amp("勻稱有致", "A") < .6);
  assert.ok(amp("勻稱有致", "I") > 2.5);
  assert.ok(amp("勻稱有致", "I") > 5 * amp("勻稱有致", "A"));
  assert.ok(amp("豐滿火辣", "E") > amp("運動健美", "E") * 1.5);
});

t("舊存檔沒有 look：勻稱有致・D・長直・161；裙子看衣服、脫到第 2 階起沒裙子", () => {
  assert.deepEqual({ ...D.lookToDoll(null) }, { height_cm: 161, build: "勻稱有致", cup: "D", hair: "long", skirt: "" });
  assert.deepEqual({ ...D.lookToDoll({}) }, { height_cm: 161, build: "勻稱有致", cup: "D", hair: "long", skirt: "" });
  assert.equal(D.lookToDoll(base, { outfit: "白色碎花長裙" }).skirt, "long");
  assert.equal(D.lookToDoll(base, { outfit: "JK 制服" }).skirt, "short");
  assert.equal(D.lookToDoll(base, { outfit: "寬鬆白 T＋牛仔褲" }).skirt, "");
  assert.equal(D.lookToDoll(base, { outfit: "JK 制服", undressStage: 2 }).skirt, "");
  assert.equal(D.lookToDoll({ ...base, height_cm: 150 }).height_cm, 150);
  assert.notEqual(D.dollKey(D.lookToDoll(base)), D.dollKey(D.lookToDoll({ ...base, height_cm: 170 })));
});

t("身高不綁體型：嬌小玲瓏 172cm 照樣 172", () => {
  const d = D.lookToDoll({ ...base, build: "嬌小玲瓏", height_cm: 172 });
  assert.equal(d.height_cm, 172);
  const tall = D.render(d, "idle", 0, 0), short = D.render({ ...d, height_cm: 150 }, "idle", 0, 0);
  const top = f => { for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) if (f.pixels[(y * 64 + x) * 4 + 3]) return y; };
  assert.ok(top(short) - top(tall) >= 15);
});

console.log(`room_doll: ${pass} passed`);
