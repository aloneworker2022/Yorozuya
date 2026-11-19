import assert from "node:assert/strict";
import { peekSlotLayout, fracValue } from "../web/content/wifepay_reveal.js";

let n = 0;
function t(name, fn) {
  fn();
  n += 1;
}

const base = { doorW: 400, doorH: 800, imgW: 832, imgH: 1216, frac: "1/2" };

t("1/2 與 3/5 比例", () => {
  assert.equal(fracValue("1/2"), 0.5);
  assert.equal(fracValue("3/5"), 0.6);
});

t("切圖寬度固定，不隨 slide 改變", () => {
  const a = peekSlotLayout({ ...base, side: "left", slide: 0 });
  const b = peekSlotLayout({ ...base, side: "left", slide: 1 });
  assert.equal(a.vis, b.vis);
  assert.equal(a.cur, a.vis);
  assert.equal(b.cur, b.vis);
  assert.equal(a.fullW, b.fullW);
  assert.ok(a.vis < a.fullW);
  assert.ok(Math.abs(a.vis - a.fullW * 0.5) < 1e-6);
});

t("左側：從畫面左緣外側移入置中位置", () => {
  const start = peekSlotLayout({ ...base, side: "left", slide: 0 });
  const mid = peekSlotLayout({ ...base, side: "left", slide: 0.5 });
  const rest = peekSlotLayout({ ...base, side: "left", slide: 1 });
  assert.equal(start.startLeft, -start.vis);
  assert.equal(start.left, start.startLeft);
  assert.ok(start.left < 0);
  assert.ok(Math.abs(rest.left - rest.slotLeft) < 1e-6);
  assert.ok(Math.abs(mid.left - (start.left + rest.left) / 2) < 1e-6);
  assert.equal(rest.imgLeft, 0);
  assert.equal(start.shift, start.startLeft - start.slotLeft);
  assert.ok(start.shift < 0);
});

t("右側：從畫面右緣外側移入置中位置", () => {
  const start = peekSlotLayout({ ...base, side: "right", slide: 0 });
  const mid = peekSlotLayout({ ...base, side: "right", slide: 0.5 });
  const rest = peekSlotLayout({ ...base, side: "right", slide: 1 });
  assert.equal(start.startLeft, 400);
  assert.ok(start.left >= 400 - 1e-6);
  assert.ok(Math.abs(rest.left - rest.slotLeft) < 1e-6);
  assert.ok(Math.abs(mid.left - (start.left + rest.left) / 2) < 1e-6);
  assert.ok(Math.abs(rest.imgLeft - (rest.vis - rest.fullW)) < 1e-6);
  assert.ok(start.shift > 0);
  assert.ok(Math.abs(start.imgLeft - rest.imgLeft) < 1e-6);
});

t("3/5 比 1/2 更寬，靜止時都置中", () => {
  const a = peekSlotLayout({ ...base, side: "right", frac: "1/2", slide: 1 });
  const b = peekSlotLayout({ ...base, side: "right", frac: "3/5", slide: 1 });
  assert.ok(b.vis > a.vis);
  assert.ok(Math.abs(a.slotLeft - (400 - a.vis) / 2) < 1e-6);
  assert.ok(Math.abs(b.slotLeft - (400 - b.vis) / 2) < 1e-6);
});

t("預設 slide=1（靜止）", () => {
  const a = peekSlotLayout({ ...base, side: "left" });
  const b = peekSlotLayout({ ...base, side: "left", slide: 1 });
  assert.equal(a.left, b.left);
  assert.equal(a.vis, b.vis);
});

console.log(`wifepay_slide.test: ${n} ok`);
